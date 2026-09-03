import Events from './Events.js';

/**
 * Viewport size + the adaptive-DPR policy lifted from the messenger.abeto.co
 * teardown.
 *
 * The part that matters and that most implementations omit: it stops adjusting
 * after a handful of direction changes. Without that guard the resolution
 * hunts back and forth forever and you can see it pumping.
 *
 * ## The pixel budget (3 Sep, from Michael's phone: "the models and images
 * are kind of low graphics")
 *
 * The first policy capped the ratio at 1.5 and let the adaptive step walk
 * it down to 0.6 of that on a slow frame rate — numbers chosen on a desktop,
 * where 1920 × 1080 at 1.5 is 4.7 million pixels. On a phone they are the
 * wrong numbers twice: a DPR-3 screen was capped to 1.5 from the first
 * frame, and a slow start (a 4 MB boot on cellular) stepped it to **0.9
 * device pixels per CSS pixel**, about 350 pixels across a 390-point
 * screen. The boards' 1024-wide images and the models were sharp; the
 * canvas they were drawn into was not.
 *
 * **Pixels cost, not ratios.** `pixelPolicy` sets the base ratio from the
 * reference's cap of 2 (`Viewport.js:24`, no scaling at all there) and a
 * ceiling on total pixels, and floors the adaptive scale so the canvas
 * never drops under a minimum count either. A phone at 390 × 844 lands at
 * ratio 2 (1.3 MP) and cannot fall below ~1.74 (1.0 MP); a 1920 × 1080
 * desktop at DPR 2 stays where it was (1.47, the 4.5 MP ceiling) and can
 * still step down to 0.7 of that under load. Pure, so `check-site` proves
 * the table above rather than describing it.
 */

/** Ratio caps and the pixel budget. */
export const PIXELS = Object.freeze({
  /** The reference's cap. */
  maxRatio: 2,
  /** Ceiling on device pixels per frame: 1920 × 1080 at 1.47. */
  max: 4.5e6,
  /** Floor the adaptive step may not cross: a phone at ~1.74. */
  min: 1.0e6,
  /** The adaptive step's own floor, for screens big enough that `min` is lower. */
  minScale: 0.6,
});

/**
 * @param {{ width: number, height: number, devicePixelRatio: number }} screen CSS size and DPR
 * @param {typeof PIXELS} [budget]
 * @returns {{ base: number, floor: number }} the base ratio, and the lowest
 *   adaptive scale (a fraction of `base`) the frame-rate stepper may reach
 */
export function pixelPolicy({ width, height, devicePixelRatio }, budget = PIXELS) {
  const area = Math.max(1, width * height);
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const base = Math.min(dpr, budget.maxRatio, Math.sqrt(budget.max / area));
  const floor = Math.min(1, Math.max(budget.minScale, Math.sqrt(budget.min / area) / base));
  return { base, floor };
}

export default class Viewport extends Events {
  constructor({
    budget = PIXELS,
    min = budget.minScale,
    max = 1.0,
    step = 0.1,
    warmupMs = 2000,
    windowMs = 4000,
    minSamples = 5,
    lowFps = 30,
    highFps = 60,
    maxFlips = 4,
  } = {}) {
    super();

    this.budget = budget;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.scale = max;
    this._applyPolicy();

    this._cfg = { min, max, step, warmupMs, windowMs, minSamples, lowFps, highFps, maxFlips };
    this._startedAt = performance.now();
    this._windowStart = this._startedAt;
    this._samples = [];
    this._lastDirection = 0;
    this._flips = 0;
    this._settled = false;

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', this._onResize, { passive: true });
  }

  get aspect() {
    return this.width / this.height;
  }

  /** The base ratio and the adaptive floor for the current screen; the scale is clamped to the floor. */
  _applyPolicy() {
    const { base, floor } = pixelPolicy(
      { width: this.width, height: this.height, devicePixelRatio: window.devicePixelRatio },
      this.budget
    );
    this.basePixelRatio = base;
    // `_cfg` is not there yet on the constructor's first call; a caller's own
    // `min` only ever raises the floor.
    this.floor = Math.max(this._cfg?.min ?? 0, floor);
    if (this.scale < this.floor) this.scale = this.floor;
    this.pixelRatio = this.basePixelRatio * this.scale;
  }

  _onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this._applyPolicy();
    this.emit('resize', this);
  }

  /** Called once per frame from the ticker. */
  sample(delta) {
    if (this._settled) return;
    if (document.hidden) return; // a hidden tab throttles rAF; the samples are lies

    const now = performance.now();
    if (now - this._startedAt < this._cfg.warmupMs) return;

    this._samples.push(delta);
    if (now - this._windowStart < this._cfg.windowMs) return;

    const { max, step, minSamples, lowFps, highFps, maxFlips } = this._cfg;
    // The floor is the pixel budget's, not a bare fraction: see the class note.
    const min = this.floor;

    if (this._samples.length >= minSamples) {
      const mean = this._samples.reduce((a, b) => a + b, 0) / this._samples.length;
      const fps = 1 / mean;

      let direction = 0;
      if (fps < lowFps && this.scale > min) direction = -1;
      else if (fps > highFps && this.scale < max) direction = 1;

      if (direction !== 0) {
        if (this._lastDirection !== 0 && direction !== this._lastDirection) {
          this._flips++;
          if (this._flips >= maxFlips) {
            // We are oscillating around the device's real capability. Stop
            // moving; a stable slightly-wrong resolution beats a visible pump.
            this._settled = true;
          }
        }
        this._lastDirection = direction;

        if (!this._settled) {
          this.scale = Math.min(max, Math.max(min, this.scale + direction * step));
          this.pixelRatio = this.basePixelRatio * this.scale;
          this.emit('resize', this);
        }
      }
    }

    this._samples.length = 0;
    this._windowStart = now;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.clear();
  }
}
