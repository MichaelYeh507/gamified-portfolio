import * as THREE from 'three/webgpu';
import { TICK } from '../../core/Ticker.js';

/**
 * The interact prompt. One manager, one DOM element, one active point.
 *
 * The reference's `InteractivePoints` is 663 lines because every beacon is a 3D mesh with an
 * animated label, a ray-cursor shape and four states. Ours renders **one DOM
 * button for the single active beacon**, projected from world space — which is
 * both far less code and accessible for free, because a real `<button>` is
 * focusable, announceable and clickable without any of it being reimplemented.
 *
 * Three things are copied from the reference author verbatim, and each is load-bearing
 * (`D` §3.1, `InteractivePoints.js:576-641`):
 *
 * **The 0.2-unit movement gate.** The nearest-point search is skipped entirely
 * unless the car has actually moved. Parked — reading a card, or sitting in a
 * menu — the whole system costs one `Math.hypot` per frame.
 *
 * **Exactly one active point globally.** Nearest wins. This is the thing that
 * stops two prompts fighting over the same corner of the screen, and it is why
 * there is one element in the DOM rather than one per point.
 *
 * **Eligibility gated on the owning area.** A beacon is only a candidate while
 * its own area is active, so a point in the next district cannot compete with
 * the one you are standing in even if it happens to be marginally nearer.
 */
export default class Beacons {
  constructor(game) {
    this.game = game;

    /** @type {{position:THREE.Vector3, label:string, onInteract:Function, area:object|null, radius:number, hidden:boolean}[]} */
    this.items = [];
    this.active = null;
    /**
     * True whenever the driver is not in control — a card is open, or the
     * opening cinematic is still running.
     *
     * **`Game.setMode` is the only writer**, and it sets it from the mode rather
     * than from the card. `Card` used to set it directly, which covered the card
     * and nothing else: on any `?at=projects` load the prompt for the monolith
     * you were parked in front of sat on screen through the whole cinematic.
     * Left `false` here because `Game` applies the boot mode as soon as this
     * exists (`Game._applyMode`), one line after the constructor returns.
     */
    this.suppressed = false;

    this.el = document.getElementById('beacon');
    this.labelEl = this.el.querySelector('.beacon__label');

    /** Where the last nearest-point search ran, in world XZ. */
    this._lastTestX = Infinity;
    this._lastTestZ = Infinity;
    this._needsTest = true;
    this._projected = new THREE.Vector3();

    this._offTick = game.ticker.on('tick', () => this.update(), TICK.GAMEPLAY);

    this._onAction = (name, value) => {
      if (name !== 'interact' || !value) return;
      // If the button itself has focus, the browser is about to fire a click for
      // this same keypress and `_onClick` will handle it. Acting here as well
      // would run the interaction twice.
      if (document.activeElement === this.el) return;
      this.trigger();
    };
    this._onClick = () => this.trigger();

    game.input.on('action', this._onAction);
    this.el.addEventListener('click', this._onClick);
  }

  /**
   * @param {object} options
   * @param {THREE.Vector3|[number,number,number]} options.position
   * @param {string} options.label      what the prompt says
   * @param {Function} options.onInteract
   * @param {object|null} [options.area]  the owning area; eligibility follows it
   * @param {number} [options.radius]     how close you have to be
   */
  create({ position, label, onInteract, area = null, radius = 6 }) {
    const beacon = {
      position: Array.isArray(position)
        ? new THREE.Vector3(position[0], position[1], position[2])
        : position.clone(),
      label,
      onInteract,
      area,
      radius,
      hidden: false,
    };
    this.items.push(beacon);
    this._needsTest = true;
    return beacon;
  }

  destroy(beacon) {
    const index = this.items.indexOf(beacon);
    if (index === -1) return;
    this.items.splice(index, 1);
    if (this.active === beacon) this.active = null;
    this._needsTest = true;
    this._render();
  }

  /**
   * Fire the active beacon, if there is one and it is allowed to fire.
   *
   * The `suppressed` test is not redundant with the input filter. `interact` is
   * a `driving`-only action so the key cannot reach here in any other mode, but
   * `_onClick` does not go through `Input` at all — this is what covers the
   * pointer.
   */
  trigger() {
    if (this.suppressed || !this.active) return false;
    this.active.onInteract(this.active);
    return true;
  }

  /**
   * Hide every prompt without forgetting which one was active.
   *
   * The reference's `temporaryHide()` / `recover()` save and restore each point's exact prior
   * state because the reference's have four of them. Ours needs no bookkeeping: the active
   * beacon is recomputed from distance every frame anyway, so releasing the
   * suppression restores the right one by simply letting the search run again.
   */
  suppress(value) {
    this.suppressed = value;
    this._needsTest = true;
    this._render();
  }

  update() {
    const position = this.game.car.position;

    // The movement gate. Note `car.position` is a Rapier vector — no three.js
    // methods on it — so this reads x and z and nothing else.
    const moved = Math.hypot(position.x - this._lastTestX, position.z - this._lastTestZ);
    if (moved > 0.2 || this._needsTest) {
      this._lastTestX = position.x;
      this._lastTestZ = position.z;
      this._needsTest = false;
      this._search(position);
    }

    this._project();
  }

  _search(position) {
    let best = null;
    let bestSq = Infinity;

    for (const beacon of this.items) {
      if (beacon.hidden) continue;
      // Only eligible while its own area is the one you are standing in.
      if (beacon.area && !beacon.area.isIn) continue;

      const dx = beacon.position.x - position.x;
      const dz = beacon.position.z - position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < beacon.radius * beacon.radius && distanceSq < bestSq) {
        best = beacon;
        bestSq = distanceSq;
      }
    }

    if (best === this.active) return;
    this.active = best;
    this._render();
  }

  _render() {
    const visible = !!this.active && !this.suppressed;
    this.el.hidden = !visible;
    if (visible) this.labelEl.textContent = this.active.label;
  }

  /**
   * Put the element on the active beacon's screen point.
   *
   * Written as a `transform` rather than `left`/`top` on purpose: a transform is
   * composited, where writing the offsets would lay out and paint on the main
   * thread every frame for the life of the page.
   *
   * **Who owns `hidden`.** `_render()` owns the "is there an eligible beacon at
   * all" half and runs only when the active one changes; this method owns the
   * "is it on screen" half and runs every frame. It must therefore decide from
   * `active`/`suppressed` rather than reading `el.hidden` back — an earlier
   * version returned early when the element was already hidden, which meant that
   * the first time a beacon projected off frame it was hidden for good and never
   * came back when you drove into view of it again.
   */
  _project() {
    if (!this.active || this.suppressed) return;

    this._projected.copy(this.active.position).project(this.game.camera);


    // Behind the camera, or past the far plane. Projecting a point behind the eye
    // divides by a negative w, which still yields finite coordinates — so without
    // this the prompt appears mirrored on the far side of the screen when you
    // drive past the thing it labels.
    if (this._projected.z > 1) {
      this.el.hidden = true;
      return;
    }

    const { width, height } = this.game.viewport;
    const x = (this._projected.x * 0.5 + 0.5) * width;
    const y = (-this._projected.y * 0.5 + 0.5) * height;

    // Off frame entirely. A beacon with a generous radius, or one on top of
    // something tall, can be in front of the camera and still project past an
    // edge — measured at y = 6472 px on a 682 px viewport while the element
    // still reported itself visible. Without this the button stays in the tab
    // order and the accessibility tree while nobody can see it, so `hidden`
    // stops meaning "there is a prompt on screen".
    const margin = 64;
    if (x < -margin || y < -margin || x > width + margin || y > height + margin) {
      this.el.hidden = true;
      return;
    }

    this.el.hidden = false;
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  dispose() {
    this._offTick?.();
    this.game.input.off('action', this._onAction);
    this.el.removeEventListener('click', this._onClick);
    this.items.length = 0;
    this.active = null;
    this._render();
  }
}
