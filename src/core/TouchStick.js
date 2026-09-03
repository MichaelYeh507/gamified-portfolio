import * as THREE from 'three/webgpu';
import { readStick, stickActions, STICK } from './stickMath.js';

/**
 * Touch steering — the reference's `Inputs/Nipple.js` on our `Input`.
 *
 * Until 3 Sep a phone could not drive the site at all (`KNOWN-ISSUES.md` 24):
 * `Input` read keys, and the launch copy said so. This is the touch half:
 * a finger on the canvas is a stick **anchored at the car** (the mechanism
 * and the reasons are in `stickMath.js`), and it writes the same four
 * `actions` the arrow keys write, through `Input.set`, so the car, the
 * filters and the mode never learn that it exists.
 *
 * ## What is the reference's and what is ours
 *
 * The reference's `Pointer` averages every touch and its nipple lets go the
 * moment a second finger lands, because the reference pinches to zoom. We do
 * not pinch: the **first** touch on the canvas owns the stick until it lifts
 * and every other canvas touch is ignored, so a thumb that brushes the
 * screen while the other holds boost costs nothing. The buttons
 * (`TouchPad`) are their own elements and never reach the canvas at all.
 *
 * The finger is re-read **every tick**, not only on `pointermove`: the car
 * turns under a still finger, and the reference's `Nipple.update` recomputes
 * the bearing each frame for the same reason. A pointer that is down when
 * the mode leaves `driving` (a card opened under the other thumb) is
 * released on the next tick rather than replayed when control returns —
 * `Game.setMode` has already zeroed the actions through `_onBlur`, and a
 * stick that kept writing them would undo that.
 *
 * The finger's ground point comes from a ray through the camera onto the
 * ring's plane (the reference's `Raycaster` + `Plane` at the car's height),
 * so the reading is in world units and the ring the visitor sees
 * (`render/StickRing.js`) is the ring the maths uses.
 *
 * Only `pointerType === 'touch'` drives it, as the reference gates on
 * `MODE_TOUCH`; `anyPointer` lets a mouse in for the `#touch` flag and the
 * headless suite.
 */

const STICK_ACTIONS = ['forward', 'back', 'left', 'right'];

/**
 * Keep the pointer's events coming to `element` after the finger leaves it.
 * Guarded: Chrome throws `NotFoundError` for a pointer id it is not tracking
 * (a synthetic event in a probe, a pointer that has already ended), and a
 * throw here left the stick claimed with no finger on it — measured on the
 * production build with dispatched events, 3 Sep.
 */
function capture(element, event) {
  try {
    element.setPointerCapture?.(event.pointerId);
  } catch {
    // Without capture the events still arrive while the finger stays over
    // the element, which is the common case.
  }
}
const IDLE = Object.freeze({ progress: 0, forward: true, offset: 0, drive: 0, steer: 0 });

export default class TouchStick {
  /**
   * @param {object} o
   * @param {import('./Input.js').default} o.input
   * @param {HTMLElement} o.surface the canvas the finger lands on
   * @param {THREE.Camera} o.camera the rendering camera
   * @param {{ position: { x: number, y: number, z: number }, headingXZ(): number }} o.car
   * @param {{ update(stick: TouchStick, car: object, delta: number): void, hop(): void }} [o.ring]
   * @param {boolean} [o.anyPointer] accept mouse pointers too
   */
  constructor({ input, surface, camera, car, ring = null, anyPointer = false }) {
    this.input = input;
    this.surface = surface;
    this.camera = camera;
    this.car = car;
    this.ring = ring;
    this.anyPointer = anyPointer;

    this.pointerId = null;
    this.active = false;
    /** A touch that has not left the inner radius: a lift now is a tap. */
    this.inRadiusLow = false;
    this.point = { x: 0, y: 0 };
    /** The last reading, for the ring. */
    this.reading = IDLE;
    /** Seconds of tall stance left from a tap. */
    this._tapLeft = 0;

    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();
    this._ndc = new THREE.Vector2();

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    surface.addEventListener('pointerdown', this._onDown);
    surface.addEventListener('pointermove', this._onMove);
    surface.addEventListener('pointerup', this._onUp);
    surface.addEventListener('pointercancel', this._onUp);
  }

  /** The ring's plane: the reference's `clamp(y - 0.25, 0.1, 0.65)` on the car's height. */
  planeY() {
    const y = this.car.position.y - 0.25;
    return y < 0.1 ? 0.1 : y > 0.65 ? 0.65 : y;
  }

  _accepts(event) {
    if (this.pointerId !== null) return false;
    if (!(event.pointerType === 'touch' || this.anyPointer)) return false;
    if (typeof event.button === 'number' && event.button > 0) return false;
    return this.input.allows('forward');
  }

  _onDown(event) {
    if (!this._accepts(event)) return;
    this.pointerId = event.pointerId;
    this.active = true;
    capture(this.surface, event);
    event.preventDefault?.();
    this.point.x = event.clientX;
    this.point.y = event.clientY;
    const reading = this._read();
    this.inRadiusLow = reading.progress === 0;
    this._apply(reading);
  }

  _onMove(event) {
    if (event.pointerId !== this.pointerId) return;
    this.point.x = event.clientX;
    this.point.y = event.clientY;
    const reading = this._read();
    if (reading.progress > 0) this.inRadiusLow = false;
    this._apply(reading);
  }

  _onUp(event) {
    if (event.pointerId !== this.pointerId) return;
    const tap = this.inRadiusLow;
    this.release();
    if (tap) this._hop();
  }

  /** Let go: the four values fall to 0 through the same edge a keyup takes. */
  release() {
    this.pointerId = null;
    this.active = false;
    this.inRadiusLow = false;
    this.reading = IDLE;
    for (const name of STICK_ACTIONS) this.input.set(name, 0);
  }

  /** A tap is a hop: the tall stance for `STICK.tapSeconds`, the reference's 200 ms. */
  _hop() {
    if (!this.input.allows('jump')) return;
    this._tapLeft = STICK.tapSeconds;
    this.input.set('jump', 1);
    this.ring?.hop();
  }

  _read() {
    const rect = this.surface.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return IDLE;
    this._ndc.set(
      ((this.point.x - rect.left) / rect.width) * 2 - 1,
      -(((this.point.y - rect.top) / rect.height) * 2 - 1)
    );
    this._raycaster.setFromCamera(this._ndc, this.camera);
    this._plane.constant = -this.planeY();
    if (!this._raycaster.ray.intersectPlane(this._plane, this._hit)) return IDLE;
    const p = this.car.position;
    return readStick({ dx: this._hit.x - p.x, dz: this._hit.z - p.z, heading: this.car.headingXZ() });
  }

  _apply(reading) {
    this.reading = reading;
    const values = stickActions(reading);
    for (const name of STICK_ACTIONS) this.input.set(name, values[name]);
  }

  /** Once per tick, before the car reads the input (`TICK.INPUT`). */
  update(delta) {
    if (this._tapLeft > 0) {
      this._tapLeft -= delta;
      if (this._tapLeft <= 0) {
        this._tapLeft = 0;
        this.input.set('jump', 0);
      }
    }
    if (this.active) {
      if (this.input.allows('forward')) this._apply(this._read());
      else this.release();
    }
    this.ring?.update(this, this.car, delta);
  }

  dispose() {
    this.release();
    this.surface.removeEventListener('pointerdown', this._onDown);
    this.surface.removeEventListener('pointermove', this._onMove);
    this.surface.removeEventListener('pointerup', this._onUp);
    this.surface.removeEventListener('pointercancel', this._onUp);
  }
}

/**
 * The held buttons — boost and jump — for a screen with no Shift and no
 * Space. Two verbs the reference's touch build does not have (the reference
 * commented out boost-at-full-ring and never shipped a jump button, relying
 * on the tap); Michael asked for both (3 Sep). Each button is a real
 * `<button>` in `index.html` (`#touch-pad`), shown by `.input-touch` in the
 * stylesheet, and a press is a hold: down writes 1, up (or a cancelled
 * pointer, or a lost capture) writes 0 — a keydown and a keyup by another
 * name, through `Input.set`.
 */
export class TouchPad {
  /**
   * @param {import('./Input.js').default} input
   * @param {HTMLElement | null} [root] the pad element; the default is `#touch-pad`
   */
  constructor(input, root = typeof document === 'undefined' ? null : document.getElementById('touch-pad')) {
    this.input = input;
    this.root = root;
    this.buttons = [];
    if (!root) return;
    for (const button of root.querySelectorAll('[data-action]')) {
      const name = button.dataset.action;
      const down = (event) => {
        if (typeof event.button === 'number' && event.button > 0) return;
        event.preventDefault?.();
        capture(button, event);
        button.classList.add('is-down');
        input.set(name, 1);
      };
      const up = () => {
        button.classList.remove('is-down');
        input.set(name, 0);
      };
      button.addEventListener('pointerdown', down);
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
      button.addEventListener('lostpointercapture', up);
      // A long press is a hold here, not a context menu.
      button.addEventListener('contextmenu', (event) => event.preventDefault?.());
      this.buttons.push({ name, button, down, up });
    }
  }
}
