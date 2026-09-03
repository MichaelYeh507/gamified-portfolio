import { flagNumber } from '../core/flags.js';

/**
 * The weather — ours, shaped like the reference's `Weather.js` and a tenth of its size.
 *
 * The reference's derives seven properties (temperature, humidity, electric field,
 * clouds, wind, rain, snow) from the year cycle plus a product-of-sines
 * noise over the day clock, and rain is `humidity × clouds`. Ours keeps
 * exactly the piece the world has consumers for: **rain**, 0 → 1, from the
 * season's humidity (`YearCycles`) gated by a shower noise on the wall
 * clock, so showers arrive, last a minute or two, and pass — on a cadence
 * you can sit through in one visit rather than the reference's day-length one.
 * `#rain=0.8` pins it for judging. Snow, ice and lightning wait on their
 * consumers.
 *
 * Numbers are ours (2 Sep, Michael: "we can tune it ourselves"), and turned
 * down once on the reference's "too much rain": a shower roughly every six to nine
 * minutes, a minute or so long, rarely heavy, a season's humidity scaling
 * how hard.
 */

const PINNED = flagNumber('rain', null);
/** One noise unit per this many seconds — sets the cadence of showers. */
const SHOWER_PERIOD = 90;
/**
 * Where the shower noise (−1..1) starts and saturates the rain. Raised from
 * 0.12 / 0.55 on Michael's "too much rain": the noise is a product of three
 * sines and spends most of its time near zero, so a higher start means
 * rarer, shorter showers and a higher full means fewer of them get heavy.
 */
const SHOWER_BAND = Object.freeze({ start: 0.24, full: 0.7 });

/** The reference's `Weather.noise`: three incommensurate sines, so nothing repeats. */
export function showerNoise(x) {
  return Math.sin(x) * Math.sin(x * 1.678) * Math.sin(x * 2.345);
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const remapClamp = (v, a, b, ra, rb) => ra + (rb - ra) * clamp01((v - a) / (b - a));

/** Pure: rain 0..1 from the season's humidity and the clock. */
export function rainAt(elapsed, humidity = 0.6) {
  const shower = remapClamp(showerNoise(elapsed / SHOWER_PERIOD), SHOWER_BAND.start, SHOWER_BAND.full, 0, 1);
  const wet = remapClamp(humidity, 0.4, 0.85, 0.3, 0.85);
  return shower * wet;
}

export default class Weather {
  constructor({ yearCycles = null } = {}) {
    this.yearCycles = yearCycles;
    /** Shaped like the reference's property: `.value` is what the world reads. */
    this.rain = { value: 0 };
  }

  update(elapsed) {
    if (PINNED !== null) {
      this.rain.value = clamp01(PINNED);
      return;
    }
    const humidity = this.yearCycles?.properties?.humidity?.value ?? 0.6;
    this.rain.value = rainAt(elapsed, humidity);
  }
}
