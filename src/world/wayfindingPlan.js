import { flagNumber } from '../core/flags.js';
import areaDefs from '../content/areas.js';
import roles from '../content/roles.js';
import projects from '../content/projects.js';
import {
  LEAD_IN,
  SHIPPED_UNITS_PER_YEAR,
  buildTimeline,
  corridorFrame,
  posAt,
} from './areas/careerTimeline.js';
import { plazaFloorRadius } from './areas/ProjectsArea.js';

/**
 * Wayfinding — the routes, the fords and the signposts, as pure arithmetic.
 *
 * Built 2 Sep on a visitor's feedback ("what if they can't find the necessary
 * things... by getting lost"): the island is the reference's size and the districts sit at
 * the reference's distances, but the reference's build has aids ours had none of. **Measured before
 * built, the ritual**: the reference's `areas.glb` was walked for signage first, and the
 * only `sign.*` nodes in it are the bowling alley's neon marquee — the reference's
 * wayfinding is roads baked into the terrain art plus the map button, and the reference author
 * ships no directional signposts at all. So the signs here are ours, in this
 * site's established vocabulary (the contact card: a marker stone with an
 * amber night cap, a tilted always-emissive text row), and the roads reuse the
 * career corridor's procedural sand path — the readable line that says "drive
 * this way" before you know what's at the other end.
 *
 * Three routes radiate from the landing and chain to the far district:
 * landing → plaza, landing → contact, contact → career. Each is a straight
 * run between district edges, so every boost corridor a visitor actually uses
 * is a paved line — which is why the FORDS live here too (see below): paving
 * the corridors and smoothing what they cross turned out to be one task, as
 * the roadmap's watch item guessed.
 *
 * ## Fords
 *
 * Michael's deferred smoothness note (2 Sep): "his driving somehow still
 * feels smoother... our map... has bumps in rivers for when we boost too
 * fast." The reference's flat 192-unit world never crosses a bank; ours crosses the trunk
 * river twice on the routes above. Where a route crosses a channel, the carve
 * is eased toward `FORD.carveCap` inside the road's corridor — in `Terrain`'s
 * own `carveAt`, so the render mesh, the collision heightfield and the water
 * depth all agree about the ford, exactly as they agree about everything else.
 *
 * The numbers are constrained, not chosen:
 *
 *  - `carveCap` 0.32 puts the ford floor a hair under `WATER_SURFACE` (−0.3),
 *    so the river still reads as one body — a wide wet-sand sheet at the
 *    crossing — while the water over it is ~0.02–0.06 deep: far under
 *    `Car.WATER.dragStartDepth` (0.25), so a boost crosses the ford **without
 *    losing a single unit of speed to the drag ramp**. A splash, not a wall.
 *    And it is what lets the road stay readable through the crossing: the
 *    sand rides `ROAD.lift` (0.045) above the ground, which at this cap is
 *    above the waterline — the first cut at 0.45 drowned the road under 0.15
 *    of teal and the wayfinding line visibly broke at every crossing
 *    (screenshot-judged on the running build, 2 Sep).
 *  - `run` 4.8 holds the relief's lateral falloff at or under
 *    `BANK_GRADIENT`: the deepest varied bed is 1.0 × 1.15, so the ford edge
 *    eases (1.15 − 0.32) × 1.5 / 4.8 = 0.26 per unit — the trunk's own bank
 *    slope, the one Michael drove and did not complain about.
 *  - the cap is applied as a smooth minimum (`FORD.blend`), not a clamp: a
 *    hard `min` puts a crease exactly on the ford centreline, which is a step
 *    the 1.5-unit collision grid would hand straight to the wheels.
 */

/** The corridor's road, verbatim: one width everywhere a path is paved. */
export const ROAD = Object.freeze({
  width: 3.4,
  half: 1.7,
  /**
   * Under `CareerArea`'s FLOOR_LIFT (0.06) and the plaza floor's, on purpose:
   * where a wayfinding road runs under a district's own paving the two quads
   * are 0.015 apart instead of coplanar, so the joins are seamless overlaps
   * rather than z-fighting seams.
   */
  lift: 0.045,
});

export const FORD = Object.freeze({ carveCap: 0.32, run: 4.8, blend: 0.15 });

/** Where a route stops short of the landing's decals — the letters line ends
 *  at radius 8.15 and the tagline at 8.2, both toward the camera. */
const LANDING_EDGE_PLAZA = 10;
/** The contact route leaves the landing away from every decal. */
const LANDING_EDGE_CONTACT = 4;
/** Route ends at the district thresholds (clearing/arc edges, see plan()). */
const CONTACT_EDGE = 9.5;
const CONTACT_LEAVE = 12;

/** Signpost geometry: how far a post stands from its route. */
const POST_BACK = 1.2;
const POST_ASIDE = 2.7;

const smoothstep01 = (t) => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
};

/** Squared-free segment distance, the same arithmetic Terrain uses. */
export function distanceToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  let t = lengthSq === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / lengthSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Point `dist` along the ray from `from` toward `to`. */
function onRay(from, to, dist) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  return [from[0] + (dx / len) * dist, from[1] + (dz / len) * dist];
}

/**
 * A bowed control polyline: start, a midpoint pushed `bow` units to the side,
 * end. Positive bow bulges toward the **up-screen** perpendicular (the same
 * deterministic convention `beside` uses), negative toward down-screen — so a
 * bow's sign reads in screen terms, the same terms every look call is made in.
 */
function bowed(from, to, bow) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  let px = -dz / len;
  let pz = dx / len;
  if (-px - pz < 0) {
    px = -px;
    pz = -pz;
  }
  return [
    from,
    [(from[0] + to[0]) / 2 + px * bow, (from[1] + to[1]) / 2 + pz * bow],
    to,
  ];
}

/**
 * Catmull-Rom through the control points, sampled about every `step` units —
 * the polyline every consumer actually walks: the ford relief, the island's
 * scatter keep-out, the painted road strip in `Terrain`, the check suite's
 * sweeps. The reference's roads curve because they are painted by hand in Blender; ours
 * curve because a spline is the cheapest honest substitute for a hand.
 */
function sampleSpline(controls, step = 2.25) {
  if (controls.length < 3) return controls.map((p) => [p[0], p[1]]);
  const pts = [controls[0], ...controls, controls[controls.length - 1]];
  const samples = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const span = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(span / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const t2 = t * t;
      const t3 = t2 * t;
      samples.push([0, 1].map((k) =>
        0.5 * ((2 * p1[k]) +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
      ));
    }
  }
  samples.push([controls[controls.length - 1][0], controls[controls.length - 1][1]]);
  return samples;
}

/**
 * The eight arrows, one per 45° of **screen** bearing. The camera is fixed
 * (decision 16), so a world direction has one screen direction forever:
 * screen-right is (√½, −√½) and up-screen is −TO_CAMERA = (−√½, −√½) — the
 * camera facts every area is authored against. An arrow computed here points
 * at the district on the visitor's actual screen, which no world-space
 * compass rose could promise.
 */
export const ARROWS = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];

/**
 * The screen bearing itself, radians, screen-right 0 and up-screen +π/2.
 * The post rows carry this since 2 Sep, when Michael called the eight
 * glyphs "blunt / bland": the row's arrow is a real arrow shape now,
 * turned to the exact bearing (`Wayfinding._buildPost`), and the glyph
 * survives as the row's `arrow` for the check suite and the console.
 */
export function screenBearing(from, to) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const sx = (dx - dz) * Math.SQRT1_2;
  const sy = (-dx - dz) * Math.SQRT1_2;
  return Math.atan2(sy, sx);
}

export function arrowFor(from, to) {
  // & 7 folds the negative indices in: −1 → 7, −4 and +4 both → 4 (due west).
  return ARROWS[Math.round(screenBearing(from, to) / (Math.PI / 4)) & 7];
}

let _plan = null;

/**
 * The whole plan, derived and cached: routes as polylines, signposts with
 * their rows already worded. Everything downstream — the builder, the ford
 * relief, the island's scatter keep-out, `check-wayfinding` — reads this one
 * object, the `corridorPlan` pattern.
 *
 * `unitsPerYear` is for the check suite only: it re-derives the plan at
 * another corridor scale (the `#yearunit=` judging lever moves the career
 * gate, and the road to it must stay dry at every scale the lever offers)
 * without touching the cached plan the runtime reads.
 */
export function wayfindingPlan({ unitsPerYear = null } = {}) {
  if (unitsPerYear !== null) return derivePlan(unitsPerYear);
  if (_plan) return _plan;
  _plan = derivePlan(flagNumber('yearunit', SHIPPED_UNITS_PER_YEAR));
  return _plan;
}

function derivePlan(unitsPerYear) {

  const defs = Object.fromEntries(areaDefs.map((def) => [def.id, def]));
  const landing = defs.landing.center;
  const plaza = defs.projects.center;
  const contact = defs.contact.center;

  /**
   * The career route ends where the corridor's own road begins, and that
   * point is data: the corridor centres itself on its span, which grows with
   * the dates. Same flag as `CareerArea`, so `#yearunit=` moves the join
   * with the corridor instead of leaving the road pointing at last year.
   */
  const timeline = buildTimeline(roles, { unitsPerYear });
  const frame = corridorFrame(defs.career.center, timeline.spanUnits);
  const gate = posAt(frame, -LEAD_IN - 0.5, 0);
  const careerGate = [gate.x, gate.z];

  /** The plaza route ends under the floor disc's rim, not at a guessed edge. */
  const plazaEdge = plazaFloorRadius(defs.projects, projects.length);

  /**
   * The bows are look values, judged like any other (Michael, 2 Sep: "his
   * roads and bridges are curved while ours is just a straight line"), but
   * their SIGNS are constrained by the ground: each one was swept against
   * the height field and the standing artifacts before it shipped, and the
   * suite re-sweeps them on every check.
   */
  const routes = [
    {
      id: 'landing-projects',
      points: bowed(onRay(landing, plaza, LANDING_EDGE_PLAZA), onRay(plaza, landing, plazaEdge - 0.8), 1.6),
    },
    {
      id: 'landing-contact',
      points: bowed(onRay(landing, contact, LANDING_EDGE_CONTACT), onRay(contact, landing, CONTACT_EDGE), -2.4),
    },
    {
      id: 'contact-career',
      points: bowed(onRay(contact, careerGate, CONTACT_LEAVE), careerGate, -3.5),
    },
  ];
  for (const route of routes) route.samples = sampleSpline(route.points);

  /**
   * A post stands beside its route end — pulled `POST_BACK` up the route so
   * it is not on the threshold itself, and `POST_ASIDE` to the **up-screen**
   * side, so the post never stands between the camera and the road it labels.
   * `flip` takes the down-screen side instead, for the one post whose route
   * tees into another road: the career route meets the corridor's own paving
   * almost perpendicular, so "up-screen of the route" is "in the middle of
   * the avenue" there — measured at corridor coordinate s −1.75, side 1.07,
   * inside the drive lane.
   */
  const beside = (route, { flip = false } = {}) => {
    // The end tangent of the SAMPLED curve, not the control chord — a bowed
    // route arrives on a different bearing than it would as a straight line.
    const from = route.samples[route.samples.length - 2];
    const to = route.samples[route.samples.length - 1];
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    // The perpendicular whose dot with up-screen (−√½, −√½) is positive.
    let px = -uz;
    let pz = ux;
    if ((-px - pz < 0) !== flip) {
      px = -px;
      pz = -pz;
    }
    return [to[0] - ux * POST_BACK + px * POST_ASIDE, to[1] - uz * POST_BACK + pz * POST_ASIDE];
  };

  const targets = { projects: plaza, career: careerGate, contact };
  const rowsFor = (at, names) =>
    names.map((name) => ({
      name,
      label: name,
      bearing: screenBearing(at, targets[name]),
      arrow: arrowFor(at, targets[name]),
    }));

  /**
   * The spawn post does NOT stand beside a route: every route out of the
   * landing leaves camera-side or river-side, and a post beside either start
   * sits below the opening frame or on the trunk's carved bank (both
   * measured). This spot is up-screen-left of the car's opening pose — **in
   * the first frame a visitor ever sees**, which is the whole reason the
   * post exists — on flat land 6.3 from the trunk's centreline against its
   * 5.5 half-width, 8.1 clear of the letters line.
   */
  const spawnPost = [-5.5, 1.5];
  const plazaPost = beside(routes[0]);
  const contactPost = beside(routes[1]);
  const careerPost = beside(routes[2], { flip: true });

  const signposts = [
    { id: 'spawn', at: spawnPost, rows: rowsFor(spawnPost, ['projects', 'career', 'contact']) },
    { id: 'projects', at: plazaPost, rows: rowsFor(plazaPost, ['career', 'contact']) },
    { id: 'contact', at: contactPost, rows: rowsFor(contactPost, ['career', 'projects']) },
    { id: 'career', at: careerPost, rows: rowsFor(careerPost, ['projects', 'contact']) },
  ];

  return { routes, signposts };
}

/** Distance from the nearest route centreline. */
export function distanceToRoutes(x, z) {
  let nearest = Infinity;
  for (const route of wayfindingPlan().routes) {
    const d = distanceToPolyline(x, z, route.samples);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/** Distance to one sampled polyline. */
export function distanceToPolyline(x, z, samples) {
  let nearest = Infinity;
  for (let i = 0; i < samples.length - 1; i++) {
    const [ax, az] = samples[i];
    const [bx, bz] = samples[i + 1];
    const d = distanceToSegment(x, z, ax, az, bx, bz);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/**
 * How much ford relief applies at this point, 0..1 — 1 on the road, easing
 * to 0 over `FORD.run` past the road's edge, zero-gradient at both ends.
 * `Terrain.carveAt` multiplies its channel depth toward `FORD.carveCap` by
 * this, which is the entire mechanism: on dry land the carve is already 0
 * and a road changes nothing; where a route crosses a channel, the crossing
 * becomes a ford without anyone having authored one.
 */
export function fordReliefAt(x, z) {
  const d = distanceToRoutes(x, z);
  if (d >= ROAD.half + FORD.run) return 0;
  return 1 - smoothstep01((d - ROAD.half) / FORD.run);
}
