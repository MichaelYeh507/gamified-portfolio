import * as THREE from 'three/webgpu';
import { flagNumber } from '../core/flags.js';
import areaDefs from '../content/areas.js';
import projects from '../content/projects.js';
import { plazaFloorRadius } from './areas/ProjectsArea.js';
import { fordReliefAt, distanceToRoutes, distanceToPolyline, FORD, ROAD } from './wayfindingPlan.js';
import roles from '../content/roles.js';
import {
  LEAD_IN,
  TAIL_OUT,
  SHIPPED_UNITS_PER_YEAR,
  buildTimeline,
  corridorFrame,
  posAt,
} from './areas/careerTimeline.js';

/**
 * The island's height field — one grid, and everything reads from it.
 *
 * Before this, the shape of the world existed three times: a 150-segment render
 * plane, a 64-segment collision trimesh, and an analytic `heightAt` the props
 * were placed with. Three surfaces that agreed only approximately, which is
 * half of what `KNOWN-ISSUES.md` 4 was about. Now there is one sampled grid and
 * the render mesh, the Rapier heightfield, the prop placement and the water's
 * depth all come off it, so they cannot disagree.
 *
 * ## The shape, and where the numbers come from
 *
 * Read off the reference's running build (`ROADMAP.md` → *The instrumented A/B*): the reference's
 * collision heightfield is 129 × 129 at a cell size of **1.5**, spanning 192
 * units, and its height range is **exactly 0 to −1.5**. The reference's land is dead flat
 * and the only physical relief in the reference's entire world is the dish that runs down
 * to the water; everything you drive over is a prop.
 *
 * Ours used to keep "a little land relief because it is ours". It does not any
 * more, and the reason is measured: see `LAND_RELIEF`. The land is now the reference's —
 * **flat at exactly 0** — along with **cell size 1.5**, a shore dish bottoming
 * out at **−1.5**, and a water surface at **−0.3**. The shoreline is untouched:
 * `beachRadius` is unchanged and the dish already met the land at 0, so the
 * shelf, the drowning line and the waterline are all exactly where they were.
 *
 * The shelf started as the reference's and is now deliberately ours. The reference's — waterline to deep
 * floor — measures **6.75 units** at the median, a 1.2-unit drop over about 10°,
 * and `SHELF_RUN` was originally 9.3 to land on exactly that. Michael drove it
 * and wanted more shallow water before the drowning line, so it is 16 now; see
 * `SHELF_RUN` for what that trades and why the lever had to be horizontal.
 */

/** World extent. Decision 2: ~150, against the reference's 192, because we carry no race circuit. */
export const SIZE = 150;

/** The reference's, exactly. Fine enough that a wheel bridges facets instead of tracking them. */
export const CELL = 1.5;

export const SEGMENTS = Math.round(SIZE / CELL); // 100
export const SAMPLES = SEGMENTS + 1; // 101
export const HALF = SIZE / 2;

/** The reference's `water.surfaceElevation` and `water.depthElevation`. */
export const WATER_SURFACE = -0.3;
export const WATER_FLOOR = -1.5;

/**
 * Peak land height above the beach — **0, and it is measured rather than chosen.**
 *
 * It was 1.5, kept "because it is ours". Michael drove the build and said the car
 * read off-centre depending on which way it faced; the cause is here, not in the
 * camera.
 *
 * `View.update` pins the focus point to **y = 0** (`trackedPosition.set(t.x, 0,
 * t.z)`) — and so does the reference's. The rig is `focus + offset` looking at `focus`, so the
 * focus point lands on exactly **ndc 0.0000** and the car rides above it by its
 * ground height plus clearance. That is free for the reference author: every land vertex in the reference's
 * world is exactly 0, so the reference's car sits at one fixed screen height for the whole
 * game. With relief it is not free. Swept at rest over 589 points of our dry
 * land, the car rested between ndc **0.149 and 0.330** — an **0.18 swing of
 * half-frame with no player input at all.** Stop in two places and the car is
 * framed differently, which is exactly what the reference author named.
 *
 * At 0 the same sweep returns **0.1442 at all 589 points, spread exactly zero.**
 * The residual is pure ride height (clearance 1.135), and the reference's build has it too.
 *
 * Two things fall out that are not camera fixes. The plaza ground measured
 * 1.19–1.38, so flattening drops the boards about **1.3 units down the frame** —
 * decision 44's correction calls lowering the ground the only real lever, and
 * this applies it before the plaza is touched. And the land is now the reference's 53 %
 * at exactly zero, which is what `KNOWN-ISSUES.md` 18 asks for: the shape is
 * meant to come from water carved *down*, never from relief pushed *up*.
 *
 * What this costs is honest and worth stating: until 18's carving lands, the
 * island is flatter than it was. 18 argues that trade directly — a third of the reference's
 * terrain is bank slope, and none of it is hill.
 *
 * `relief01` and `RELIEF_FADE` are left in place on purpose. The carving work
 * needs a shaping function and this is it, pointed the other way.
 */
export const LAND_RELIEF = 0;

/**
 * Horizontal run of the shore dish, from the beach (0) to the floor (−1.5).
 *
 * **Was 9.3, which put it exactly on the reference's measured 6.75-unit shelf. Widened to 16
 * on 19 Aug because Michael drove it and wanted more:** *"I think there can be
 * more shallow water before we drown."*
 *
 * The lever had to be horizontal, because there is no vertical headroom at all.
 * The water is only ever `WATER_SURFACE - WATER_FLOOR` = **1.2 units deep** —
 * everywhere, in both builds, forever — so there was never anywhere for a
 * deeper lever to go. Stretching the dish buys distance at every depth at once.
 *
 * **Its original reason is gone and the number is kept anyway.** 16 was chosen
 * to widen the drivable water before decision 43's drowning line; that line was
 * removed on 20 August (see `Car.js` → water) and nothing drowns now. What 16
 * still buys is a shallower, longer beach — a 10° slope rather than the reference's ~17° —
 * which is a look and a feel, and Michael drove it and asked for it. Left at 16
 * deliberately rather than reverted to the 9.3 that matched the reference's measured shelf.
 *
 * What it does not cost is land. In the widest bearings the dish would run to
 * 77.4 against a grid that stops at ±75, so the outermost ring of samples is
 * clamped to the floor below. That truncation is at most 0.15 of height, it
 * happens under 1.2 units of water, and it is past the drowning line — nothing
 * can drive on it and nothing can see it.
 */
const SHELF_RUN = 16;

/** How far inland the land relief reaches full strength, so the beach is level. */
const RELIEF_FADE = 14;

/**
 * Scale of the beach radius. Measured over the finished shape function, the
 * coastline runs **40.2 at its tightest, 51.5 mean, 61.4 at the reserved lobe**.
 * Unchanged when the shelf widened: the land is worth more than the last two
 * units of an underwater slope.
 */
const BEACH_R0 = 50;

/**
 * The channel network — **water carved down through flat land, which is the
 * whole of how the reference's world gets its shape** (`KNOWN-ISSUES.md` 18).
 *
 * The reference's has no river objects and no pond meshes. Water is a single camera-following
 * quad at `WATER_SURFACE`, and everything below that line is wet: ocean, river
 * and pond are the same thing. Land at 0 sits above the plane, so the depth
 * buffer hides the water over land and nothing else has to. Carving here is
 * therefore the entire feature — no new mesh, no mask, no material change.
 *
 * ## Shaped to the reference's measurements, not invented
 *
 * Decoded from the reference's `terrain.glb` (129², y −1.500 → 0.000) and classified against
 * our own grid by one script: **15.8 % of the reference's map is water cut into the
 * landmass**, in 21 separate bodies, at a **median width of 6 units** and median
 * depths of 0.42–1.17. The reference's largest interior body spans 73 × 66 units but holds
 * only 855 m² — a branching channel network, not a lake. That is the target.
 *
 * ## The profile, and why the half-width is derived rather than authored
 *
 * A channel is a polyline with a smooth cross-section: full `bedDepth` on the
 * centreline, easing to 0 at `halfWidth`, with zero gradient at both ends so the
 * bank meets the land without a crease the collision grid can catch on.
 *
 * The *visible* river is narrower than the half-width, because water only
 * appears below `WATER_SURFACE`: for a bed at −0.85 the surface is crossed at
 * `smoothstep` t ≈ 0.6, so the water is about 1.2 × the half-width. The
 * half-width itself is **derived from `bedDepth` by `BANK_GRADIENT`** and is not
 * a free parameter — authoring the two independently is what produced the one
 * channel Michael could feel.
 *
 * `relief01` survives here, and this is the job it was kept for: it modulates the
 * bed by ±15 % so the depth varies along a channel the way the reference's does, rather than
 * every river being a uniform trench.
 *
 * ## What the routes have to respect
 *
 * `SPAWN_CLEARING` (24) is not one of them — a river you can see from the start
 * is the point. What is hard: the plaza's clearing at `content/areas.js`, and
 * the reserved lobe, which decision 3 keeps unshaped so it can be developed
 * later. Both are asserted in `assertChannelsClear()` rather than masked, so a
 * route that drifts into one fails loudly instead of being silently bent.
 */
const CHANNEL_KEEP_OUT = [{ x: 28, z: 18, radius: 21 }];

/**
 * The plaza's own numbers, **derived from the modules that own them**.
 *
 * `plazaFloorRadius` is the same function `ProjectsArea._floorGeometry` uses to
 * size the disc it draws, so a basin can never end up narrower than the floor
 * on top of it — which would leave the outer boards standing on the rim and
 * turn the basin back into the dish it exists not to be. No cycle: `Area` gets
 * its ground through the game object, so nothing under `areas/` imports this
 * file.
 */
const PROJECTS = areaDefs.find((def) => def.id === 'projects');
const PROJECTS_CENTER = PROJECTS ? PROJECTS.center : [0, 0];
const PROJECTS_FLOOR_RADIUS = PROJECTS ? plazaFloorRadius(PROJECTS, projects.length) : 0;


/**
 * Maximum bank gradient, and **the one number that decides whether a channel is
 * pleasant to drive.**
 *
 * The first pass set `bedDepth` and `halfWidth` independently, which quietly let
 * the bank gradient — `bedDepth × 1.5 / halfWidth`, the peak slope of a
 * smoothstep — range from 0.273 to 0.405 across the network. Michael drove it
 * and found the steep end by feel: *"there is one small puddle near the top left
 * of the map that seems to make the driving rugged."* That is the channel at
 * [−34, 0] → [−26, 18], which had `bedDepth 1.35` over `halfWidth 5.0` — a
 * gradient of 0.405, **48 % steeper than the trunk the reference author did not complain about**.
 * Six of the twelve highest-curvature cells in the whole grid were in it.
 *
 * Why steepness and not depth: the collision height field has 1.5-unit cells, so
 * a bank is a staircase whose step height is `gradient × 1.5`. The wheels track
 * the steps (`KNOWN-ISSUES.md` 4), and the shake that produced was judged
 * acceptable back when *all* our land rolled gently. It is not acceptable now,
 * because the land is flat and the channels are the only slopes in the world —
 * so every step is a contrast rather than part of a texture.
 *
 * **0.273 is not chosen, it is the trunk's**, kept because that channel drove
 * fine. `halfWidth` is derived from it rather than authored, so a deeper channel
 * is automatically a wider one. That is also the reference's relationship: the reference's 0.55-deep
 * body measures 6 wide and the reference's 1.12-deep body measures 9.
 */
export const BANK_GRADIENT = 0.273;

/**
 * @param {{bedDepth: number, points: number[][]}} channel
 * @returns {number} half-width that holds the bank at `BANK_GRADIENT`
 */
const halfWidthFor = (bedDepth) => (bedDepth * 1.5) / BANK_GRADIENT;

const CHANNELS = [
  // The trunk: coast to coast, passing south of the plaza so it is visible from
  // the boards without touching their ground. Routed out to 30.3 at its closest
  // against the 26.5 the assertion demands — the first draft sat at 24.2 and the
  // assertion caught it at boot, which is the entire reason it exists.
  { bedDepth: 1.0, points: [[-52, -20], [-30, -11], [-10, -4], [14, -9], [34, -17], [52, -28]] },
  // North branch, off the trunk's middle, reaching the northern coast.
  { bedDepth: 0.85, points: [[-10, -4], [-16, 14], [-22, 32], [-28, 48]] },
  // South-east branch, off the trunk, reaching the south-east coast. Its far end
  // is held at bearing −48° to stay clear of the reserved lobe, which starts at −56°.
  { bedDepth: 0.85, points: [[14, -9], [24, -20], [30, -34], [36, -46]] },
  // Short inlets biting into the coast — the reference's has several, and they are what put
  // water in front of you without committing a crossing.
  { bedDepth: 1.1, points: [[-56, 12], [-44, 10], [-36, 12]] },
  { bedDepth: 1.0, points: [[52, 50], [47, 47], [42, 45]] },
  { bedDepth: 1.0, points: [[-46, -44], [-37, -37], [-31, -33]] },

  // Enclosed water, detached from the network above and from the sea. **These
  // are branching systems, not pools**, because the reference's are: the reference's largest interior
  // body is enclosed, spans 73 × 66 units and holds 855 m² at a 6-unit width.
  // A round pond of the same area would read as a puddle and reproduce none of
  // the reason the reference's island is interesting to drive across.
  //
  // Routing these is tighter than it looks, and the first two drafts got it
  // wrong the same way: the coastline is **not** a circle. `beachRadius` runs
  // 40.7 at 105° against 61.2 at 195°, so points placed at a radius that is
  // comfortably inland in the west are twenty units out to sea in the
  // north-west. Every endpoint here is held ≥ 13 units inside its *own*
  // bearing's beach radius, which is what keeps the body detached from the
  // shore dish and therefore genuinely enclosed.
  { bedDepth: 1.0, points: [[-8, 26], [-1, 31], [6, 33]] },
  { bedDepth: 0.9, points: [[-1, 31], [0, 22]] },
  // 1.0 rather than the 1.35 it started at. At 1.35 the derived half-width is
  // 7.42, which is wider than the gap between this and the two channels either
  // side of it, so it merged with both — losing the detachment that made it
  // enclosed, and putting a merge crease exactly where Michael felt one.
  { bedDepth: 1.0, points: [[-34, 0], [-29, 9], [-26, 18]] },
];

// Derived once, not authored: see `BANK_GRADIENT`. Written onto the channel so
// the carve and the keep-out assertion read the same number.
for (const channel of CHANNELS) channel.halfWidth = halfWidthFor(channel.bedDepth);

/**
 * Decision 3: one lobe deliberately left undeveloped.
 *
 * Expanding an authored heightfield later means re-authoring terrain, shoreline
 * and water alpha together — a Phase-3-scale task. Filling a lobe that already
 * exists is an afternoon. So the lobe is a real bulge in the coastline here,
 * and `Island` refuses to scatter anything into it.
 */
export const RESERVED_LOBE = { center: -Math.PI * 0.5, halfWidth: 0.6 };

const smoothstep01 = (t) => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
};

/** Where the land ends and the shore dish begins, as a function of bearing. */
export function beachRadius(theta) {
  let delta = theta - RESERVED_LOBE.center;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const lobe = Math.exp(-((delta / RESERVED_LOBE.halfWidth) ** 2)) * 0.18;

  return (
    BEACH_R0 *
    (1 +
      0.13 * Math.sin(theta * 2 + 0.7) +
      0.08 * Math.sin(theta * 3 - 1.9) +
      0.04 * Math.sin(theta * 5 + 2.6) +
      lobe)
  );
}

/** Rolling ground, 0..1. Three sines, deliberately long-wavelength. */
function relief01(x, z) {
  const n =
    Math.sin(x * 0.055) * Math.cos(z * 0.061) * 0.44 +
    Math.sin((x + z) * 0.021) * 0.33 +
    Math.cos(x * 0.013 - z * 0.017) * 0.23;
  return n * 0.5 + 0.5;
}

/** Squared distance from a point to a segment, in the XZ plane. */
function distanceToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  let t = lengthSq === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / lengthSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t;
  const pz = az + dz * t;
  return Math.hypot(x - px, z - pz);
}

/**
 * Smooth maximum. `Math.max` of two smooth surfaces is continuous but its
 * *gradient* is not: along the locus where the two are equal there is a crease,
 * and on a 1.5-unit collision grid a crease is a step the wheels track.
 *
 * Michael found these by driving before they were found by measuring — the six
 * highest-curvature cells in the grid all sat where two channels overlap. The
 * polynomial form (Quílez) blends over a band of `k` and costs one branchless
 * clamp. `k` is 0.4: below ~0.25 the crease survives, above ~0.6 confluences
 * visibly bulge deeper than either channel asked for.
 */
function smoothMax(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (a - b)) / k));
  return a * h + b * (1 - h) + k * h * (1 - h);
}

const CONFLUENCE_BLEND = 0.4;

/**
 * **Basins — a flat-floored circular depression, and the sunken-plaza test.**
 *
 * A channel is the wrong shape for a plaza. Its cross-section is full depth on
 * the centreline easing to zero at the bank, so a circular one is a *dish*: the
 * boards at radius 9.3 would each stand at a different height and the car would
 * roll to the middle. A plaza needs somewhere level to stand, so a basin is
 * **flat to `floorRadius`, then a smooth rim** — and both ends of the rim have
 * zero gradient, for the same reason a bank does (`KNOWN-ISSUES.md` 4: a crease
 * is a step the wheels track on a 1.5-unit collision grid).
 *
 * **The rim run is derived from the depth, never authored**, by exactly the rule
 * `halfWidthFor` uses. That rule is not decoration — it is what
 * `KNOWN-ISSUES.md` 18's peak-curvature fix bought, and authoring the two
 * independently is the mistake Michael found by feel the first time.
 *
 * **What the test is for** (`KNOWN-ISSUES.md` 18). The framing half is banked
 * already: flattening the land dropped the plaza 1.3 units down the frame. The
 * half still open is whether **carved ground reads here the way it does in the reference's
 * build**, and a flat plaza on flat land cannot answer it. So the depth is a
 * flag, not a constant, and it defaults to **0 — the shipped world is
 * unchanged** until Michael has looked at it.
 *
 * **Two budgets, and they are different numbers.** Sink past **0.3** and the
 * basin floor is under `WATER_SURFACE`, so the plaza *floods* — which is not a
 * failure, it is the mechanism the reference's whole map is built from, but it is a design
 * choice about this place. Sink past **1.5** and you hit `WATER_FLOOR`. Nothing
 * drowns at any depth: decision 43 is withdrawn and water is drivable treacle.
 * A third limit binds before either: the rim has to stay inside the plaza's
 * clearing or `Island` scatters trees down the slope, which caps it near 1.2.
 * `assertBasinsClear` checks that one at boot.
 */
const BASIN_SINK = flagNumber('sink', 0);

/**
 * @param {number} depth
 * @returns {number} rim run that holds the slope at `BANK_GRADIENT`
 */
const rimRunFor = (depth) => (depth * 1.5) / BANK_GRADIENT;

/**
 * Derived from the area definitions rather than retyped, so a basin cannot end
 * up somewhere its plaza is not. The floor covers the monoliths and the visual
 * apron; past that it is rim.
 */
const BASINS = BASIN_SINK > 0
  ? [{
      x: PROJECTS_CENTER[0],
      z: PROJECTS_CENTER[1],
      floorRadius: PROJECTS_FLOOR_RADIUS,
      clearing: PROJECTS.clearing,
      depth: BASIN_SINK,
      rimRun: rimRunFor(BASIN_SINK),
    }]
  : [];

/** How far a basin sinks the ground here. 0 outside every basin. */
export function basinAt(x, z) {
  let deepest = 0;
  for (const basin of BASINS) {
    const d = Math.hypot(x - basin.x, z - basin.z);
    if (d >= basin.floorRadius + basin.rimRun) continue;
    const t = Math.max(0, (d - basin.floorRadius) / basin.rimRun);
    deepest = Math.max(deepest, basin.depth * (1 - smoothstep01(t)));
  }
  return deepest;
}

/**
 * Throw if a basin's rim reaches past the clearing that keeps props off it.
 *
 * Same argument as `assertChannelsClear`: masking would quietly scatter trees
 * down a slope and leave nobody the wiser. `ProjectsArea._assertFitsClearing`
 * guards the same clearing from the other side.
 */
export function assertBasinsClear() {
  const problems = [];
  for (const basin of BASINS) {
    const extent = basin.floorRadius + basin.rimRun;
    /**
     * Against the area's **own** `clearing`, not `CHANNEL_KEEP_OUT`.
     *
     * The two are different numbers on purpose — the keep-out is 21 against a
     * clearing of 20, because a channel has to stay clear of the plaza by more
     * than a tree does — and asserting against the wrong one is not a harmless
     * approximation. Written first against the keep-out, this guard did not fire
     * at a sink of 1.3 whose rim reached 20.5: past the clearing, inside the
     * keep-out, props scattered down the slope and nothing said so.
     */
    if (basin.clearing && extent > basin.clearing) {
      const deepest = ((basin.clearing - basin.floorRadius) * BANK_GRADIENT) / 1.5;
      problems.push(
        `a basin ${basin.depth.toFixed(2)} deep at [${basin.x}, ${basin.z}] has a rim ` +
          `reaching ${extent.toFixed(1)}, past its clearing of ${basin.clearing}. ` +
          `Island scatters props outside the clearing, so they would land on the ` +
          `slope. The deepest sink that fits is ${deepest.toFixed(2)}.`
      );
    }
  }
  if (problems.length) {
    throw new Error('[terrain] basin conflict:\n  ' + problems.join('\n  '));
  }
}

/**
 * How far the ground is carved down at this point, in world units. 0 on
 * untouched land. Channels combine with a **smooth** maximum rather than a hard
 * one, so a confluence is a bowl rather than a seam — see `smoothMax`.
 */
export function carveAt(x, z) {
  let deepest = 0;
  let touched = false;

  for (const channel of CHANNELS) {
    let nearest = Infinity;
    for (let i = 0; i < channel.points.length - 1; i++) {
      const [ax, az] = channel.points[i];
      const [bx, bz] = channel.points[i + 1];
      const d = distanceToSegment(x, z, ax, az, bx, bz);
      if (d < nearest) nearest = d;
      if (nearest === 0) break;
    }
    if (nearest >= channel.halfWidth) continue;

    // Zero gradient at the centreline and at the bank top, so neither the render
    // mesh nor the 1.5-unit collision grid gets a crease to catch a wheel on.
    const profile = 1 - smoothstep01(nearest / channel.halfWidth);
    // ±15 % along the run, so a channel is not a uniform trench. This is the
    // Shares `relief01` with the land-relief term in `heightAt`.
    const varied = channel.bedDepth * (0.85 + 0.3 * relief01(x, z));
    const depth = varied * profile;
    deepest = touched ? smoothMax(deepest, depth, CONFLUENCE_BLEND) : depth;
    touched = true;
  }

  // Basins join the same smooth maximum a confluence uses, so a channel running
  // into a plaza blends with its rim instead of creasing across it.
  const basin = basinAt(x, z);
  if (basin > 0) deepest = touched ? smoothMax(deepest, basin, CONFLUENCE_BLEND) : basin;

  /**
   * Fords — where a wayfinding road crosses a channel, the carve eases toward
   * `FORD.carveCap` inside the road's corridor (`wayfindingPlan` has the whole
   * argument and the constrained numbers). Two properties matter here:
   * the cap is a **smooth** minimum, because a hard clamp creases exactly on
   * the ford's centreline — the same wheel-step `smoothMax` exists to prevent
   * — and the relief multiplies the *difference*, so outside a channel
   * (carve 0) a road changes nothing at all.
   */
  if (deepest > 0) {
    const relief = fordReliefAt(x, z);
    if (relief > 0) {
      const forded = -smoothMax(-deepest, -FORD.carveCap, FORD.blend);
      deepest += (forded - deepest) * relief;
    }
  }

  // Never past the floor: the depth texture, the bedrock's top face and the
  // water's own floor uniform all assume nothing is below `WATER_FLOOR`.
  return Math.min(deepest, -WATER_FLOOR);
}

/**
 * Throw if any channel has drifted into ground that something else owns.
 *
 * Asserted rather than masked. Masking would silently bend a river around a
 * plaza and leave nobody any the wiser; this fails at boot with the offending
 * route named. Same argument as `ProjectsArea._assertFitsClearing`.
 */
export function assertChannelsClear() {
  const problems = [];

  for (let c = 0; c < CHANNELS.length; c++) {
    const channel = CHANNELS[c];
    for (const keepOut of CHANNEL_KEEP_OUT) {
      for (let i = 0; i < channel.points.length - 1; i++) {
        const [ax, az] = channel.points[i];
        const [bx, bz] = channel.points[i + 1];
        const d = distanceToSegment(keepOut.x, keepOut.z, ax, az, bx, bz);
        if (d < keepOut.radius + channel.halfWidth) {
          problems.push(
            `channel ${c} passes ${d.toFixed(1)} from the clearing at ` +
              `[${keepOut.x}, ${keepOut.z}], which needs ` +
              `${(keepOut.radius + channel.halfWidth).toFixed(1)}`
          );
        }
      }
    }

    for (const [px, pz] of channel.points) {
      let delta = Math.atan2(pz, px) - RESERVED_LOBE.center;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) < RESERVED_LOBE.halfWidth && Math.hypot(px, pz) > 20) {
        problems.push(`channel ${c} has a point at [${px}, ${pz}] inside the reserved lobe`);
      }
    }
  }

  if (problems.length) {
    throw new Error('[terrain] channel routing conflict:\n  ' + problems.join('\n  '));
  }
}

/**
 * The world's surface, in world units. Land is 0..1.5; water bottoms at −1.5.
 *
 * This is the definition — the sampled grid below is a discretisation of it,
 * and everything that needs a height between samples should use the grid rather
 * than call this, so that nothing ever sits at a height the car cannot drive on.
 */
export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const beach = beachRadius(Math.atan2(z, x));
  const carved = -carveAt(x, z);

  // `LAND_RELIEF` is 0 (decision 46), so inland height *is* the carve. The
  // relief term is left in the expression rather than folded away: it keeps the
  // constant honest — an exported `LAND_RELIEF` that `heightAt` ignored would be
  // a lie the day somebody set it back — and it keeps the revert to one line.
  // It costs two trig calls per sample, once, at grid build.
  if (d <= beach) {
    return carved + relief01(x, z) * LAND_RELIEF * smoothstep01((beach - d) / RELIEF_FADE);
  }

  // Outside the beach the shore dish takes over — but a channel that reaches the
  // coast has to keep going rather than stopping at the waterline, so the two
  // are combined by taking whichever is lower. **Smoothly**, for the same reason
  // confluences are: a hard `min` of two smooth surfaces creases along the line
  // where they cross, and the last three roughness hotspots in the grid were all
  // river mouths. `-smoothMax(-a, -b, k)` is the smooth minimum.
  const dish = WATER_FLOOR * smoothstep01((d - beach) / SHELF_RUN);
  const merged = -smoothMax(-dish, -carved, CONFLUENCE_BLEND);
  return Math.max(WATER_FLOOR, merged);
}

export default class Terrain {
  constructor() {
    /**
     * Row-major in x, exactly the reference's layout (`Floor.js:137`):
     * `heights[iz + ix * SAMPLES]`. Replicated rather than re-derived because
     * the reference's is the arrangement Rapier demonstrably accepts in a shipped build,
     * and a transposed height field is invisible on a symmetric world and
     * catastrophic on this one.
     */
    assertChannelsClear();
    assertBasinsClear();

    this.heights = new Float32Array(SAMPLES * SAMPLES);

    for (let ix = 0; ix < SAMPLES; ix++) {
      const x = -HALF + ix * CELL;
      for (let iz = 0; iz < SAMPLES; iz++) {
        const z = -HALF + iz * CELL;
        // The border ring is pinned to the floor. The dish overruns the grid by
        // up to 2.4 units in the widest bearings (see `SHELF_RUN`), and this is
        // what makes the height field end on the same value the bedrock's top
        // face sits at — so the collider, the depth texture and the world
        // outside all agree, with no step to fall down.
        const border = ix === 0 || iz === 0 || ix === SAMPLES - 1 || iz === SAMPLES - 1;
        this.heights[iz + ix * SAMPLES] = border ? WATER_FLOOR : heightAt(x, z);
      }
    }

    this._texture = null;
  }

  /** Nearest-sample height. Clamped, so outside the grid reads as open water. */
  sample(x, z) {
    const ix = Math.min(SAMPLES - 1, Math.max(0, Math.round((x + HALF) / CELL)));
    const iz = Math.min(SAMPLES - 1, Math.max(0, Math.round((z + HALF) / CELL)));
    return this.heights[iz + ix * SAMPLES];
  }

  /** Bilinear height, for anything that moves continuously — the car, mostly. */
  heightAt(x, z) {
    const fx = (x + HALF) / CELL;
    const fz = (z + HALF) / CELL;
    const ix = Math.min(SAMPLES - 2, Math.max(0, Math.floor(fx)));
    const iz = Math.min(SAMPLES - 2, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix));
    const tz = Math.min(1, Math.max(0, fz - iz));

    const h00 = this.heights[iz + ix * SAMPLES];
    const h10 = this.heights[iz + (ix + 1) * SAMPLES];
    const h01 = this.heights[iz + 1 + ix * SAMPLES];
    const h11 = this.heights[iz + 1 + (ix + 1) * SAMPLES];

    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  /** Depth of water over the ground at this point. Negative on dry land. */
  depthAt(x, z) {
    return WATER_SURFACE - this.heightAt(x, z);
  }

  /**
   * The same grid as a texture, so the water material can read depth per
   * fragment instead of guessing it from screen-space depth.
   *
   * The reference's terrain is one authored PNG sampled by world XZ, with height in the
   * blue channel driving both the colour gradient and the visual displacement
   * (`Terrain.js:93`, `Floor.js:78`). Ours is generated rather than authored,
   * but it is the same idea and it is what makes the drawn shoreline and the
   * driven shoreline the same line rather than two lines that nearly agree.
   *
   * Single-channel float, clamped at the edges: sampling past the island
   * therefore returns the border value, which is the −1.5 floor, which is
   * exactly what open water should read as.
   */
  texture() {
    if (this._texture) return this._texture;

    /**
     * Four channels now, the reference's `terrainTexture` arrangement adapted (2 Sep,
     * Michael: "his roads and land actually have gradient and texture that
     * blend in well"). The reference's is one authored PNG whose blue channel drives a
     * colour gradient and whose green channel is grass density — with roads
     * simply painted as grass-free strips. Ours is generated from the same
     * modules that own each shape, so a route or a district that moves
     * repaints its own ground:
     *
     *   R — height, exactly the single channel this texture always was.
     *   G — ground cover, 0 bare → 1 grassy: the colour gradient mixes
     *       grass in by it. Bare = the beach ramp below the shoreline, the
     *       wayfinding routes, the career corridor's lane, the plaza floor's
     *       footprint, and a trampled circle at the contact bonfire. The
     *       feathered edges are what make painted roads read as worn ground
     *       instead of decals — the reason the separate road meshes died.
     *   B — blade density for the grass field: cover, minus the places
     *       standing content owns (the landing's decal line, the contact
     *       arc, the corridor's slab lanes) where a 0.6-unit blade would
     *       grow through authored type.
     *   A — paving: 1 on a road's slabs, 0 off it. The reference's red channel
     *       (`Floor.js:55`, `terrainData.r` masks the reference's slab texture in) —
     *       the second thing Michael's drive of the first painted roads
     *       found ("the current state of the roads is not very good"):
     *       bare sand with a 2.2-unit feather each side read as an orange
     *       smear, not a road. The reference's roads are PAVED strips with a narrow
     *       worn shoulder, so: the slabs fill the road's width with a
     *       0.5 feather, and the bare-cover shoulder outside them is 0.9.
     */
    const shoulder = (d) => {
      // Cover: 0 across the road and its worn shoulder, 1 past it.
      const t = (d - ROAD.half) / 0.9;
      return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
    };
    const paving = (d) => {
      // Slabs: 1 on the road, feathered off just inside its edge.
      const t = (d - (ROAD.half - 0.55)) / 0.5;
      return t < 0 ? 1 : t > 1 ? 0 : 1 - t * t * (3 - 2 * t);
    };
    const routeBare = (x, z) => shoulder(distanceToRoutes(x, z));
    const routeSlab = (x, z) => paving(distanceToRoutes(x, z));

    // The career corridor's lane, painted by the same rule the routes use.
    const timeline = buildTimeline(roles, {
      unitsPerYear: flagNumber('yearunit', SHIPPED_UNITS_PER_YEAR),
    });
    const careerDef = areaDefs.find((def) => def.id === 'career');
    const frame = careerDef ? corridorFrame(careerDef.center, timeline.spanUnits) : null;
    const lane = frame
      ? [posAt(frame, -LEAD_IN - 1, 0), posAt(frame, timeline.spanUnits + TAIL_OUT + 1, 0)]
          .map((p) => [p.x, p.z])
      : null;
    const laneBare = (x, z) => (lane ? shoulder(distanceToPolyline(x, z, lane)) : 1);
    const laneSlab = (x, z) => (lane ? paving(distanceToPolyline(x, z, lane)) : 0);

    const contactDef = areaDefs.find((def) => def.id === 'contact');
    const projectsDef = areaDefs.find((def) => def.id === 'projects');
    const floorR = projectsDef ? PROJECTS_FLOOR_RADIUS : 0;

    const discFade = (x, z, center, radius, feather) => {
      if (!center) return 1;
      const t = (Math.hypot(x - center[0], z - center[1]) - radius) / feather;
      return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
    };

    const data = new Float32Array(SAMPLES * SAMPLES * 4);
    for (let iz = 0; iz < SAMPLES; iz++) {
      const z = -HALF + iz * CELL;
      for (let ix = 0; ix < SAMPLES; ix++) {
        const x = -HALF + ix * CELL;
        const h = this.heights[iz + ix * SAMPLES];

        // Cover: grassy on land, ramping to bare sand down the beach —
        // full grass by −0.02 so the flat land at exactly 0 is unambiguous.
        let cover = smoothstep01((h + 0.28) / 0.26);
        cover *= routeBare(x, z);
        cover *= laneBare(x, z);
        cover *= discFade(x, z, projectsDef?.center, floorR + 0.5, 2.5);
        cover *= discFade(x, z, contactDef?.center, 2.4, 2.2);

        // Blades: cover, minus where standing content owns the ground.
        let blades = cover;
        blades *= discFade(x, z, [4.2, 4.2], 7.0, 1.8); // the landing's name + tagline
        blades *= discFade(x, z, contactDef?.center, 9.5, 2.0); // the whole arc hangout
        if (frame) {
          // The slab lanes flank the corridor's painted road; a blade through
          // a risen card's type would be the letters bug all over again.
          const d = distanceToPolyline(x, z, lane);
          const t = (d - 5.5) / 2.0;
          blades *= t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
        }

        // Paving: the routes and the corridor's avenue, dry land only — a
        // ford keeps its slabs to the waterline and the gradient takes over.
        const slab = Math.max(routeSlab(x, z), laneSlab(x, z)) * smoothstep01((h + 0.34) / 0.08);

        const at = (iz * SAMPLES + ix) * 4;
        data[at] = h;
        data[at + 1] = cover;
        data[at + 2] = blades;
        data[at + 3] = slab;
      }
    }

    const texture = new THREE.DataTexture(data, SAMPLES, SAMPLES, THREE.RGBAFormat, THREE.FloatType);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    this._texture = texture;
    return texture;
  }

  /**
   * World XZ → texture UV, as a plain object so both JS and TSL can use the
   * same two numbers. The reference's equivalent is `position / subdivision / 1.5 + 0.5`,
   * which is the same expression with the reference's grid's numbers in it.
   */
  get uvTransform() {
    return { scale: 1 / SIZE, offset: 0.5 };
  }
}
