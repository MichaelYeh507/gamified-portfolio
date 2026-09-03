import Cycles from './Cycles.js';
import { YEAR_KEYFRAMES } from './palettes.js';
import { flagNumber } from '../core/flags.js';

/** 365 days, epoch-synced like the day cycle. The reference's `60 * 60 * 24 * 365`. */
export const YEAR_DURATION = 60 * 60 * 24 * 365;

/**
 * The seasons, carrying **five scalars and no colour whatsoever**.
 *
 * That constraint is the whole point of this class existing separately, and it
 * was a correction rather than a design: decision 12 originally had the year
 * cycle tinting light and fog, and reading the reference's presets against the reference's running build
 * showed they hold `leaves`, `temperature`, `humidity`, `clouds` and `wind` and
 * nothing else. Every colour comes from `DayCycles`. Two cycles writing the same
 * uniforms would fight, and the colour gate would be judging a moving target.
 *
 * A 365-day period is not a calendar year — it drifts a day every four years
 * against the real one, and it is anchored to the 1970 epoch rather than to
 * January. Neither matters for what it drives, and both are the reference's.
 *
 * **Nothing reads this yet**, by design. Foliage, rain and wind are decisions
 * 30–32 and land in Phase 3. It costs three lines on top of `Cycles`, and
 * writing it now is what stops the no-colour rule above being re-litigated then.
 */
export default class YearCycles extends Cycles {
  constructor({ forcedProgress } = {}) {
    super({
      name: 'year cycle',
      duration: YEAR_DURATION,
      keyframes: YEAR_KEYFRAMES,
      forcedProgress: forcedProgress ?? flagNumber('year', null),
    });
  }
}
