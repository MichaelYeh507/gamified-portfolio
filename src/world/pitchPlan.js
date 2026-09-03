/**
 * The football pitch — a ball to kick around and a goal to kick it into,
 * on Michael's ask (3 Sep: "can you add a soccer ball and goal", then "add
 * it to the top right of the map, and also make the ball similar scale to
 * how rocket league balls are to a car"). Pure arithmetic, the
 * `corridorPlan` pattern: the world and `check-pitch` both read this, so the
 * sweep the check runs is the layout the world builds.
 *
 * **The scale is Rocket League's.** There the ball is 92.75 uu in radius
 * against a 118 uu car: a diameter of about 1.6 car lengths, five car
 * heights. Against our 3.1-unit buggy that is a radius near 2.4; ours is
 * 1.9 (a diameter of 1.2 car lengths, 3 car heights), a touch under so it
 * still reads as a ball beside the districts rather than a planet. The goal
 * follows the ball: three ball widths across, a ball and a half tall, a
 * ball deep — the reference game's proportions are wider still (9.6 balls
 * across), which on a 150-unit island would be a wall.
 *
 * **The site is swept, not chosen.** "Top right of the map" is the map's
 * frame (up-screen at the top; `FastTravel.worldToMap`): right = (x − z)/√2,
 * down = (x + z)/√2. The land with map-right > 10 and map-down < −12 was
 * swept for the widest flat disc clear of the roads, the contact hangout's
 * clearing, the plaza's and the shore: **[9, −31]** is flat to an 11-unit
 * radius with every margin ≥ 8 — the north shore's open ground between the
 * contact fire and the plaza, where the about corner once stood for an
 * hour. The goal stands on the far side with its mouth toward the island's
 * middle, where the car arrives from; the ball waits at the centre.
 */

/** World XZ of the pitch's centre, and the goal's facing. */
export const PITCH = Object.freeze({
  center: [9, -31],
  /** The bare patch on the ground. */
  radius: 9,
  /** The island's scatter keep-out: the patch plus the goal's depth. */
  clearing: 12.5,
  /** Heading of the goal's mouth: toward the origin, the side the car comes from. */
  heading: Math.atan2(-9, 31),
  /** The goal line's distance from the centre, toward the back. */
  back: 6,
});

/** The goal, sized against the ball (see above). */
export const GOAL = Object.freeze({
  width: 11.4,
  height: 5.6,
  depth: 3.4,
  /** Post and bar thickness. */
  post: 0.18,
  /** Net cord thickness and spacing. */
  cord: 0.045,
  mesh: 1.0,
});

export const BALL = Object.freeze({
  radius: 1.9,
  /** Against the 2.5 chassis: light, so a bumper at speed lofts it and a
   *  nudge rolls it; the damping is what stops it rolling into the sea. */
  mass: 0.3,
  friction: 0.5,
  restitution: 0.6,
  linearDamping: 0.3,
  angularDamping: 0.5,
});

/**
 * When the ball comes back. R respawns the car and nothing else (the
 * reference's `unstuck` is the car's), so the ball has its own rule:
 * **gone is wet or off the map, and it has to stay gone** — a ball that
 * skips through a ford on its way somewhere is still in play. `Pitch.update`
 * counts the seconds and puts it back at the centre spot, still.
 */
export const RESET = Object.freeze({
  /** How long the ball must be lost before it comes back. */
  seconds: 3,
  /** The ball is off the map beyond this on either axis (the terrain's half size). */
  halfSize: 75,
  /** Ground under the ball at or below this is water. */
  waterSurface: -0.3,
});

/**
 * Is the ball lost right now? Pure: `ground` is the terrain height under
 * the ball, passed in so this file stays arithmetic and `check-pitch` can
 * prove the rule on numbers.
 */
export function ballLost({ x, z }, ground, reset = RESET) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return true;
  if (Math.abs(x) > reset.halfSize || Math.abs(z) > reset.halfSize) return true;
  return ground <= reset.waterSurface;
}

/**
 * @returns {{
 *   center: {x:number, z:number},
 *   goal: {x:number, z:number, heading:number},
 *   ball: {x:number, z:number},
 *   ring: {x:number, z:number, what:string}[],
 * }}
 */
export function pitchPlan() {
  const [cx, cz] = PITCH.center;
  const goal = {
    x: cx - Math.sin(PITCH.heading) * PITCH.back,
    z: cz - Math.cos(PITCH.heading) * PITCH.back,
    heading: PITCH.heading,
  };
  const ball = { x: cx, z: cz };
  // The disc the sweep must find flat and dry: the patch at three radii.
  const ring = [];
  for (const r of [0, PITCH.radius * 0.5, PITCH.radius]) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ring.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, what: `pitch r${r.toFixed(1)}` });
    }
  }
  return { center: { x: cx, z: cz }, goal, ball, ring };
}
