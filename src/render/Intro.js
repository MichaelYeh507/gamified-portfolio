import { tween, ease } from '../core/tween.js';
import { TICK } from '../core/Ticker.js';

/**
 * The opening cinematic: three steps, then it deletes itself and its scaffolding.
 *
 * Decision 4 turned the reveal from a permanent mechanic into a five-second
 * intro, and decision 5 deleted the distance-driven growth that used to follow
 * it. So this class is the *only* thing that ever writes `Reveal.radius`, and
 * once it reaches step 2 the world is whole and stays whole.
 *
 * The shape is the reference's (`Reveal.js:46-228`), the numbers are ours where the rigs
 * differ:
 *
 *   step 0  a small disc of ground arrives under the car, camera pushed in
 *   step 1  the disc is flung outwards, camera pulls back, controls unlock
 *   step 2  the disc snaps to effectively infinite, the void grid is destroyed
 *
 * Two details in the reference's are easy to miss and both are load-bearing.
 *
 * **Control is granted at the start of step 1, not at the end of it.** The reference author
 * switches the input filter to `wandering` on the same frame the expansion
 * begins (`Reveal.js:170`), so you can already be driving while the world is
 * still arriving. Waiting for the cinematic to finish would put two seconds of
 * dead input at the front of the experience, which is exactly the thing a
 * drivable site cannot afford.
 *
 * **The disc stops expanding long before it covers the world.** The reference's goes to 30
 * and then snaps to 99999. 30 is the reference's camera's resting radius, so by the time
 * the seam gets there it is at the edge of frame and most of the way into the
 * fog — the snap is invisible. Chasing the seam all the way to the shoreline
 * would take either an absurd expansion speed or a cinematic twice as long, and
 * you would watch the interesting part happen off-screen. Ours uses the same
 * rule and therefore the same number, which also means the island getting cut
 * from 300 to 150 in step 5 does not move it.
 *
 * **The disc shrinks before it expands, and that is deliberate.** `back.in`
 * settles backwards first — about 6.2 % of the range — so step 1 runs
 * 4.2 → 2.65 → 30 rather than straight out. Measured, not guessed. The car is
 * 3.1 units long, so at the tightest moment there is still about a unit of
 * ground beyond its nose; it reads as the world winding up before it is flung
 * outwards. Do not "fix" it by swapping the easing.
 */

/** Radius of the ground the car is standing on when the curtain goes up. */
const START_RADIUS = 4.2;

/**
 * Where the expansion stops before the snap. `View`'s `RADIUS.max`, deliberately
 * duplicated rather than imported: it is the camera's resting radius *as a
 * composition scale*, and if the camera rig is ever re-tuned this should be
 * re-judged by eye rather than silently follow it.
 */
const EXPAND_TO = 30;

/**
 * Camera framing across the cinematic, as `View.zoom.baseRatio`, where 0 is the
 * resting pull-back and 1 is fully tight. The reference's 0.6 → 0.3 → 0. It reads as
 * intimate-to-epic: the camera is close on the car while there is nothing but
 * car to look at, and retreats as there starts to be a world worth showing.
 */
const ZOOM = { arrive: 0.6, settle: 0.3, resting: 0 };

const DURATION = {
  discArrive: 2.0,
  discExpand: 2.0,
  zoomArrive: 1.25,
  zoomExpand: 1.75,
};

export default class Intro {
  /**
   * @param {object} deps
   * @param {import('./Reveal.js').default} deps.reveal
   * @param {import('../world/View.js').default} deps.view
   * @param {THREE.Scene} deps.scene
   * @param {({mesh: THREE.Mesh, destroy?: Function}|THREE.Mesh)[]} deps.scaffolding
   *   things that exist only for the cinematic (decisions 6 and 4)
   * @param {import('../core/Ticker.js').default} deps.ticker
   * @param {import('../cycles/DayCycles.js').default} deps.dayCycles
   * @param {() => void} [deps.onPlayable] fired when the car becomes drivable
   * @param {() => void} [deps.onDone]     fired when the cinematic has torn itself down
   */
  constructor({ reveal, view, scene, ticker, dayCycles, scaffolding = [], onPlayable, onDone }) {
    this.reveal = reveal;
    this.view = view;
    this.scene = scene;
    this.ticker = ticker;
    this.scaffolding = scaffolding.filter(Boolean);
    this.onPlayable = onPlayable;
    this.onDone = onDone;

    this.step = -1;
    this.playable = false;
    this._cancels = new Set();

    /**
     * The rim, driven by the day cycle. This is the whole of the per-frame work
     * in the reference's `Reveal` (`Reveal.js:232-236`), and the reason it lives here rather
     * than on `Reveal` is that it is the only thing that has to *stop*: the
     * cinematic ends with the radius at 1e5, so from that moment the rim is a
     * ring outside the far plane and writing colour into it every frame is
     * work for nobody. `destroy()` takes it off, as the reference's step 2 does.
     */
    this._offTick = ticker.on(
      'tick',
      () => {
        this.reveal.rimColor.value.copy(dayCycles.properties.rimColor.value);
        this.reveal.rimIntensity.value = dayCycles.properties.rimIntensity.value;
      },
      TICK.GAMEPLAY
    );
  }

  /** Kick the whole thing off. Safe to call once. */
  start() {
    if (this.step !== -1) return;
    this._goTo(0);
  }

  _tween(opts) {
    const cancel = tween({
      ...opts,
      onComplete: () => {
        this._cancels.delete(cancel);
        opts.onComplete?.();
      },
    });
    this._cancels.add(cancel);
    return cancel;
  }

  _goTo(step) {
    this.step = step;

    if (step === 0) {
      // Snap both halves of the zoom filter, not just the base: `smoothedRatio`
      // is what actually drives the radius, and leaving it at the resting value
      // would make the first second of the cinematic a lerp from the wrong
      // framing rather than the framing itself. The reference's does the same
      // (`Reveal.js:73-74`).
      this.view.zoom.baseRatio = ZOOM.arrive;
      this.view.zoom.smoothedRatio = ZOOM.arrive;

      this._tween({
        from: 0,
        to: START_RADIUS,
        duration: DURATION.discArrive,
        easing: ease.backOut(1.7),
        onUpdate: (v) => {
          this.reveal.radius.value = v;
        },
        onComplete: () => this._goTo(1),
      });

      this._tween({
        from: ZOOM.arrive,
        to: ZOOM.settle,
        duration: DURATION.zoomArrive,
        easing: ease.cubicInOut,
        onUpdate: (v) => {
          this.view.zoom.baseRatio = v;
        },
      });
      return;
    }

    if (step === 1) {
      // Before the tweens, so the very first frame of the expansion is already
      // taking input. See the note at the top.
      this.playable = true;
      this.onPlayable?.();

      this._tween({
        from: START_RADIUS,
        to: EXPAND_TO,
        duration: DURATION.discExpand,
        easing: ease.backIn(1.3),
        onUpdate: (v) => {
          this.reveal.radius.value = v;
        },
        onComplete: () => this._goTo(2),
      });

      this._tween({
        from: ZOOM.settle,
        to: ZOOM.resting,
        duration: DURATION.zoomExpand,
        easing: ease.backIn(1.5),
        onUpdate: (v) => {
          this.view.zoom.baseRatio = v;
        },
      });
      return;
    }

    if (step === 2) {
      this.reveal.finish();
      this.destroy();
      this.onDone?.();
    }
  }

  /**
   * Take the scaffolding with it.
   *
   * Both pieces are already invisible by this point. The void grid discards
   * everywhere inside the disc and the disc is now 1e5 across; the island's
   * underside was only ever there to stop you seeing through the cylinder the
   * reveal cuts, and there is no cut any more. So this buys a couple of draw
   * calls and a 1600-unit plane's worth of vertex work, not a visual change —
   * which is the point of decision 6: a backdrop nobody can see is just cost.
   *
   * The rim pump comes off here too, for the same reason the reference's does
   * (`Reveal.js:225` — `ticker.events.off('tick', this.update)`): the seam is
   * gone, so the two uniforms it writes are read by no fragment on screen.
   */
  destroy() {
    for (const cancel of this._cancels) cancel();
    this._cancels.clear();

    this._offTick?.();
    this._offTick = null;

    for (const piece of this.scaffolding) {
      const mesh = piece.isObject3D ? piece : piece.mesh;
      mesh?.removeFromParent();
      if (typeof piece.destroy === 'function') piece.destroy();
      else mesh?.geometry?.dispose();
    }
    this.scaffolding = [];
  }
}
