import { Fn, vec2, texture, uniform } from 'three/tsl';
import { flagNumber } from '../core/flags.js';

/**
 * One wind field for the whole world — the reference's `Wind.js`, ported.
 *
 * The value of this is not that it sways a tree; it is that **everything sways
 * coherently**. A gust that crosses the island moves the trees on the near side
 * before the far side, because every material samples the same scrolling noise
 * at its own world position. Per-object wobble, which is the obvious cheap
 * alternative, reads as a collection of objects each doing its own thing — and
 * that is exactly the "static asset" impression the roadmap wants this to fix
 * ahead of the CC0 decision.
 *
 * The mechanism is two perlin samples at different scales scrolling at
 * different rates, summed. That is what makes it read as gusts rather than as a
 * sine: the slow, coarse sample is the weather and the fast, fine one is the
 * turbulence, and their sum has no period a viewer can lock onto.
 *
 * ---
 *
 * **The rate is the reference's × 2, and that is the trap in `KNOWN-ISSUES.md` 6.**
 *
 * The reference's `update()` is `localTime += deltaScaled * timeFrequency * strength` with
 * `timeFrequency` 0.1, and the reference's `Ticker.scale` is 2 — so the reference's wind actually
 * advances at `delta * 0.2 * strength`. Decision 6 deliberately kept the scale
 * in the physics rather than the clock ("a `ticker.scale` would have meant every
 * consumer choosing a delta correctly forever"), so our `delta` is plain wall
 * clock and the constant carries the factor instead: **`TIME_FREQUENCY = 0.2`,
 * the reference's 0.1 doubled.** Ported the other way this would be a wind at a quarter of
 * the reference's speed, which is slow enough to look like a bug and subtle enough not to.
 *
 * **`localTime` is an accumulator, not `elapsed × rate`**, and the difference is
 * the whole reason it exists: multiplying by `strength` inside the accumulation
 * means the wind *slows down* as it weakens rather than merely shrinking, and
 * changing strength never jumps the phase. It is the same shape as the reference's boost
 * pump — one scalar, integrated, interruptible at any point.
 */

/** The reference's `Math.PI * 0.6`, so the wind blows across the island rather than along it. */
const ANGLE = Math.PI * 0.6;

/** The reference's. Scale of the field in world units — lower is a broader gust. */
const POSITION_FREQUENCY = 0.5;

/** The reference's 0.1, doubled. See the note above; this is the one number that moves. */
const TIME_FREQUENCY = 0.2;

/**
 * The reference's `0.5`, and the one knob worth a flag.
 *
 * Measured on the running build at 0.5: a tree tip travels a **peak of 0.497
 * world units** and a mean of 0.323 across 70 sampled tips, which is a lot of
 * movement for a crown 0.9–2.0 units in radius. Whether that reads as wind or as
 * wobble is a look call, so `#wind=0.25` and friends exist to step it.
 *
 * The amplitude is bounded rather than open: the offset is two perlin samples
 * each in −0.5..0.43, summed and scaled, so peak displacement is
 * `~1.0 x strength` and cannot run away.
 */
const DEFAULT_STRENGTH = flagNumber('wind', 0.5);

export default class Wind {
  /** @param {import('./Noises.js').default} noises */
  constructor(noises, { strength = DEFAULT_STRENGTH } = {}) {
    this.noises = noises;

    this.direction = uniform(vec2(Math.sin(ANGLE), Math.cos(ANGLE)));
    this.positionFrequency = uniform(POSITION_FREQUENCY);
    this.strength = uniform(strength);
    this.localTime = uniform(0);

    /**
     * **A horizontal position in — `.xz`, not a vec3 — and a 2D offset out.**
     *
     * The reference's signature takes a vec2 that is already on the ground plane, and every
     * caller obliges: `Grass.js:175` passes `worldPosition.xz` and
     * `Flowers.js:135` passes `positionLocal.xz`. Inside, the reference's `remaped.xy` is
     * therefore x and z.
     *
     * Ours passed the whole `positionWorld` for a few hours, which made `.xy`
     * **x and height** — a field that ignored z entirely. Two trees differing
     * only in z sway identically, a gust travels along one axis instead of
     * across the ground, and dense vegetation would stripe. With ten scattered
     * trees it was invisible; with grass it would not have been. Found by
     * reading the reference's call sites rather than the reference's function, which is where the
     * convention actually lives.
     *
     * The hinge is **not** in here and never was: the tip moves more than the
     * base because of the per-vertex weight the caller multiplies in, which is
     * the reference's `.mul(tipness).mul(height)` and our `sway` attribute.
     */
    this.offsetNode = Fn(([position]) => {
      const remapped = position.mul(this.positionFrequency);

      const uv1 = remapped.xy.mul(0.2).add(this.direction.mul(this.localTime)).xy;
      const noise1 = texture(this.noises.perlin, uv1).r.sub(0.5);

      const uv2 = remapped.xy.mul(0.1).add(this.direction.mul(this.localTime.mul(0.2))).xy;
      const noise2 = texture(this.noises.perlin, uv2).r.sub(0.5);

      return vec2(this.direction.mul(noise1.add(noise2)).mul(this.strength));
    });
  }

  /** Call once per frame, on plain wall-clock delta. */
  update(delta) {
    this.localTime.value += delta * TIME_FREQUENCY * this.strength.value;
  }
}
