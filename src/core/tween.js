/**
 * A ~40 line tween runner. the reference author uses GSAP; the only curve the reference's reveal actually
 * needs is `back.out(1.7)`, and shipping a whole animation library for one
 * easing function is not a trade worth making yet.
 */

export const ease = {
  linear: (t) => t,
  quadOut: (t) => 1 - (1 - t) * (1 - t),
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** The overshoot that makes the world feel like it *lands* rather than arrives. */
  backOut:
    (s = 1.7) =>
    (t) => {
      const p = t - 1;
      return p * p * ((s + 1) * p + s) + 1;
    },
  /**
   * The same curve run the other way: it settles *backwards* first and then
   * accelerates into the target. The reference's reveal expansion and the reference's camera pull-back
   * are both on this (`back.in(1.3)` and `back.in(1.5)`), and the small dip at
   * the start is what makes the world look like it is being flung outwards
   * rather than scaled up.
   */
  backIn:
    (s = 1.7) =>
    (t) =>
      t * t * ((s + 1) * t - s),
};

const active = new Set();

/**
 * @param {object} opts
 * @param {number} opts.from
 * @param {number} opts.to
 * @param {number} opts.duration seconds
 * @param {(v:number)=>void} opts.onUpdate
 * @param {Function} [opts.easing]
 * @param {Function} [opts.onComplete]
 */
export function tween({ from, to, duration, onUpdate, easing = ease.cubicOut, onComplete }) {
  const entry = { from, to, duration, onUpdate, easing, onComplete, elapsed: 0 };
  active.add(entry);
  return () => active.delete(entry);
}

/**
 * Drive every running tween. Call once per frame.
 *
 * Iterate a snapshot, not the live set: the intro chains its steps out of
 * `onComplete`, and a `Set` visits entries added during iteration, so a tween
 * started by a completing tween would be advanced by the same `delta` that
 * completed its predecessor — a frame of drift on every step boundary.
 */
export function updateTweens(delta) {
  for (const t of [...active]) {
    if (!active.has(t)) continue;
    t.elapsed += delta;
    const raw = t.duration > 0 ? Math.min(t.elapsed / t.duration, 1) : 1;
    t.onUpdate(t.from + (t.to - t.from) * t.easing(raw));
    if (raw >= 1) {
      active.delete(t);
      t.onComplete?.();
    }
  }
}
