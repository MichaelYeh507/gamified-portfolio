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
  /**
   * The air dribble (Michael, 3 Sep: "make the ball a tiny bit floaty so
   * we can do like air dribbles like rocket league"). Rocket League's ball
   * falls under the same gravity as the car but it is huge and light and
   * the car has boost, so a car can get under a falling ball and carry
   * it. Ours has the boost but no air control, so the ball itself hangs:
   * a gravity scale makes a drop take 1/√scale as long. 0.6 was the first
   * cut (a 1.29× drop) and Michael's drive said "not floaty enough to air
   * dribble yet"; 0.35 was a 1.69× drop, and the third drive asked for
   * more ("a bit more floaty, where it can fly up a little bit if we bump
   * it"): **0.25** is a 2× drop, and the bump loft below does the flying
   * up. The 0.3 linear damping slows it at the top. Tuned by driving; 1 is
   * the car's.
   */
  gravityScale: 0.25,
});

/**
 * The bump loft: a car touching the ball kicks it upward, so a nudge
 * lifts it off the ground and a boosted hit sends it up for the air
 * dribble. Ours, not the reference's — the reference has no ball. Each
 * tick the car's colliders are asked for a contact with the ball's
 * (`world.contactPair`), and on one the ball gets an upward impulse of
 * `loft` m/s scaled by the car's speed against `fullSpeed`, once per
 * `cooldown` so a rolling contact is one kick, not sixty a second.
 */
export const BUMP = Object.freeze({
  /** Upward velocity added at `fullSpeed`, m/s. */
  loft: 3.5,
  /** Below this the touch is a rest, not a bump. */
  minSpeed: 1.0,
  /** The car speed that gives the full loft; slower gives less, faster a little more. */
  fullSpeed: 8,
  /** The scale's floor and ceiling. */
  scale: [0.5, 1.4],
  /** Seconds between kicks. */
  cooldown: 0.5,
});

/**
 * The reset button, code-built: a pedestal with a glowing amber button on
 * top, standing where the prompt is so there is something to drive up to
 * (Michael, 3 Sep: "there should be a 3d model for reset button"). Amber
 * is the emissive band, so the button is lit at night. A fixed body with
 * the pedestal's box as its collider.
 */
export const BUTTON = Object.freeze({
  /** The pedestal: width, height, depth. */
  pedestal: [0.9, 1.0, 0.9],
  /** The cap on the pedestal: overhang and thickness. */
  cap: [0.08, 0.1],
  /** The button's radius and height, and the white ring around it. */
  button: [0.34, 0.2],
  ring: [0.46, 0.05],
});

/**
 * The reset is a prompt, not a timer (Michael, 3 Sep: "make the ball reset
 * only if we like interact with a reset prompt next to goal"). A beacon
 * stands beside the goal's near post, on the side the car arrives from;
 * drive up, press E (or tap the pill), and the ball is back at the spot.
 * Nothing resets on its own — a ball in the sea stays in the sea until
 * someone asks.
 */
export const RESET_PROMPT = Object.freeze({
  label: 'Reset the ball',
  /** Beside the post, outside the goal's width. */
  side: 3.5,
  /** Ahead of the goal line, toward the pitch. */
  ahead: 1.5,
  /** The beacon's reach. */
  radius: 8,
  /** Above the ground, where the pill is projected from: over the button. */
  height: 1.7,
});

/**
 * @returns {{
 *   center: {x:number, z:number},
 *   goal: {x:number, z:number, heading:number},
 *   ball: {x:number, z:number},
 *   resetPrompt: {x:number, z:number},
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
  // The reset prompt: beside the near post, a step toward the pitch. The
  // goal's mouth faces `heading` (+Z rotated by it); its right-hand side
  // is the mouth turned a quarter.
  const mouth = { x: Math.sin(PITCH.heading), z: Math.cos(PITCH.heading) };
  const right = { x: Math.cos(PITCH.heading), z: -Math.sin(PITCH.heading) };
  const resetPrompt = {
    x: goal.x + right.x * (GOAL.width / 2 + RESET_PROMPT.side) + mouth.x * RESET_PROMPT.ahead,
    z: goal.z + right.z * (GOAL.width / 2 + RESET_PROMPT.side) + mouth.z * RESET_PROMPT.ahead,
  };
  // The disc the sweep must find flat and dry: the patch at three radii.
  const ring = [];
  for (const r of [0, PITCH.radius * 0.5, PITCH.radius]) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ring.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, what: `pitch r${r.toFixed(1)}` });
    }
  }
  return { center: { x: cx, z: cz }, goal, ball, resetPrompt, ring };
}
