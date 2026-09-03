/**
 * The touch stick's arithmetic, pure — the reference's `Inputs/Nipple.js`
 * (`updateFromPointer`, `update`) and the nipple half of the reference's
 * `Player.updatePrePhysics` (`Player.js:572-598`) as one function of numbers,
 * so `tools/check-touch.mjs` can prove the mapping without a DOM, a camera or
 * a car.
 *
 * ## The mechanism (the reference's)
 *
 * The stick is not a pad in a corner: it is a ring **around the car, in the
 * world**. The finger's point on the ground plane is read relative to the
 * car — its **distance** is the throttle and its **bearing** relative to the
 * car's heading is the steer. Drag ahead of the car and it drives there;
 * drag further and it drives harder; drag behind it and it reverses. There
 * is nothing to find with a thumb and nothing to look away from the car for.
 *
 *   - `progress`: 0 inside `radiusLow`, 1 at `radiusHigh`, linear between.
 *     The throttle is `progress³` (the reference's `Math.pow(progress, 3)`):
 *     the first half of the ring barely moves the car, so a resting thumb
 *     near it creeps rather than lunges.
 *   - `forward`: the bearing lies within `forwardAmplitude` (270°, the
 *     reference's `Math.PI * 1.5`) centred on the heading. The 90° behind the
 *     car is reverse, and the bearing is then read against the car's tail.
 *   - `steer`: the bearing's offset from the heading (or the tail), normalised
 *     over half of what is left outside the amplitude (45°), clamped to 1.
 *     45° off the nose is full lock; the reference's number. In reverse both
 *     the throttle and the steer flip, so the car backs toward the finger.
 *   - a **tap** — down and up without leaving `radiusLow` — is a hop
 *     (`Player.js:311-326`: 200 ms of the tall stance).
 *
 * ## Our numbers
 *
 * The radii are the reference's 2 / 4.5 for a first drive: on our 3.1-unit
 * buggy that is a ring from just past the bumper to a car-and-a-half out,
 * which fits a thumb at phone scale (the ring is ~1/6 of the frame's height
 * from the default camera). Michael tunes by driving.
 *
 * ## The sign contract
 *
 * `steer` is in the human terms `Input.steer` uses: **positive is right**.
 * Bearings are `Math.atan2(z, x)` in the ground plane, Y up, so a positive
 * offset from the heading is clockwise seen from above — the car's right
 * (`right = forward × up`). The reference writes `steering = -…` because the
 * reference's `left` action is +1 (`Player.js:561-563`); ours is the same
 * geometry without that negation. `Car.control` owns the last flip into the
 * vehicle's own frame and says why.
 */

export const STICK = Object.freeze({
  /** Inside this the throttle is 0 and a tap is a hop. */
  radiusLow: 2,
  /** At this the throttle is 1. */
  radiusHigh: 4.5,
  /** The arc, centred on the nose, that drives forward. The rest reverses. */
  forwardAmplitude: Math.PI * 1.5,
  /** A tap's tall stance, in seconds (the reference's 200 ms). */
  tapSeconds: 0.2,
});

/** Wrap to (−π, π]. The reference's `equivalent()`. */
export function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Read the stick.
 *
 * @param {object} p
 * @param {number} p.dx finger point minus car position, ground X
 * @param {number} p.dz finger point minus car position, ground Z
 * @param {number} p.heading the car's yaw as `atan2(forward.z, forward.x)`
 * @param {object} [stick] the radii and the arc; `STICK` by default
 * @returns {{ progress: number, forward: boolean, offset: number, drive: number, steer: number }}
 *   `drive` is −1..1 (the signed throttle), `steer` −1..1 (positive right),
 *   `offset` the bearing's offset from the nose or the tail in radians.
 */
export function readStick({ dx, dz, heading }, stick = STICK) {
  const distance = Math.hypot(dx, dz);
  const progress = clamp01((distance - stick.radiusLow) / (stick.radiusHigh - stick.radiusLow));
  const target = Math.atan2(dz, dx);

  let offset = wrapAngle(target - heading);
  const forward = Math.abs(offset) < stick.forwardAmplitude / 2;
  if (!forward) offset = wrapAngle(target - (heading + Math.PI));

  const lockAngle = (Math.PI * 2 - stick.forwardAmplitude) / 2;
  let steer = Math.min(Math.abs(offset) / lockAngle, 1) * Math.sign(offset);
  let drive = progress ** 3;
  if (!forward) {
    drive = -drive;
    steer = -steer;
  }
  return { progress, forward, offset, drive, steer };
}

/**
 * The four action values a reading writes. Split so the same `actions`
 * object the keys write carries the stick, and `Input.steer` / `Input.drive`
 * need no second path.
 */
export function stickActions({ drive, steer }) {
  return {
    forward: Math.max(drive, 0),
    back: Math.max(-drive, 0),
    right: Math.max(steer, 0),
    left: Math.max(-steer, 0),
  };
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
