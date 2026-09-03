import Events from './Events.js';

/**
 * Viewport size + the adaptive-DPR policy lifted from the messenger.abeto.co
 * teardown.
 *
 * The part that matters and that most implementations omit: it stops adjusting
 * after a handful of direction changes. Without that guard the resolution
 * hunts back and forth forever and you can see it pumping.
 */
export default class Viewport extends Events {
  constructor({
    maxPixelRatio = 1.5,
    min = 0.6,
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

    this.maxPixelRatio = maxPixelRatio;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);

    this.scale = max;
    this.pixelRatio = this.basePixelRatio * this.scale;

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

  _onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    this.pixelRatio = this.basePixelRatio * this.scale;
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

    const { min, max, step, minSamples, lowFps, highFps, maxFlips } = this._cfg;

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
