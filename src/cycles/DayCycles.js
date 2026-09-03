import Cycles from './Cycles.js';
import { dayKeyframes, DAY_INTERVALS, DAY_PALETTES, DEFAULT_DAY_PALETTE } from './palettes.js';
import { flagNumber, flagString } from '../core/flags.js';

/**
 * Four minutes, the reference's exactly (`Cycles/DayCycles.js:16` — `4 * 60`).
 *
 * Wall-clock seconds, and unaffected by decision 18's 2x physics time scale:
 * nothing here integrates a delta, every frame reads `Date.now()`. A visitor who
 * stays five minutes sees a full day and a bit; one who stays thirty seconds
 * sees one light. Both see *the same* sky as everyone else on the planet at that
 * instant, which is the entire argument for epoch-syncing it rather than
 * starting the clock at page load.
 */
export const DAY_DURATION = 240;

/**
 * The only cycle with colour in it.
 *
 * Everything the world is lit and fogged by comes from here — see
 * `palettes.js` for the property table and for the three derived numbers that
 * are held constant across the candidates.
 */
export default class DayCycles extends Cycles {
  constructor({ palette, forcedProgress } = {}) {
    const name = palette ?? flagString('palette', DEFAULT_DAY_PALETTE);
    if (!DAY_PALETTES[name]) {
      throw new Error(`unknown day palette "${name}", expected one of ${Object.keys(DAY_PALETTES)}`);
    }

    super({
      name: 'day cycle',
      duration: DAY_DURATION,
      keyframes: dayKeyframes(name),
      // `#day=0.25` is the reference's `VITE_DAY_CYCLE_PROGRESS` — a boot-time pin that
      // needs a reload, which is exactly what you want for photographing the
      // intro's rim at a fixed phase. For everything else prefer `override`,
      // which is live and blends.
      forcedProgress: forcedProgress ?? flagNumber('day', null),
      intervals: DAY_INTERVALS,
    });

    this.palette = name;
  }

  /**
   * Swap candidate palettes without a reload — half of what makes the colour
   * gate a sitting rather than a rebuild. The stops, the intervals and the
   * property objects all survive; only the values at each stop change.
   */
  setPalette(name) {
    const entry = DAY_PALETTES[name];
    if (!entry) throw new Error(`unknown day palette "${name}"`);
    this.setKeyframes(dayKeyframes(name));
    this.palette = name;
    return entry.label;
  }

  get paletteLabel() {
    return DAY_PALETTES[this.palette].label;
  }
}
