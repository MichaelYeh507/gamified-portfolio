import { ROAD } from './wayfindingPlan.js';
import { WATER_SURFACE } from './Terrain.js';

/**
 * Bridges — where the wayfinding roads cross water, as pure arithmetic over
 * the height field.
 *
 * The last deferred wayfinding item (2 Sep: "the reference's channels are
 * crossed by real bridges where ours ford"). The reference's bridges are
 * painted into its terrain art with the roads; ours are a found pontoon
 * (artikora's human-props pack, `CREDITS.md`) stood over each ford, and the
 * ford underneath is **untouched**: `Terrain.carveAt` still eases the channel
 * to `FORD.carveCap` inside the road, the water is still 0.02 deep there,
 * and a car that leaves the deck sideways drives the ford exactly as before.
 * The bridge is the visual and one fixed collider over the deck.
 *
 * Nothing here is authored by hand — the crossings are FOUND by walking each
 * route over the real height field, the same walk `check-wayfinding` does,
 * so a route that moves (the `#yearunit=` lever moves the career gate) moves
 * its bridge with it and a route that stops crossing water loses its bridge.
 *
 * ## Water under the deck (6 Sep, evening, his call)
 *
 * The first build kept the ford under the deck, and the trunk bridge read
 * as a bridge over a sandbar: the ford floor is 0.02 under the surface, so
 * the water there renders as the wet-sand sheet. Michael: "the bridges
 * should be over water, we might have to modify the terrain a bit." So
 * where a bridge stands there is no ford — `coverAt` below, applied by
 * `Terrain.carveAt` — and the channel keeps its natural bed under the
 * deck. The plan is derived over the FORD-ONLY field (`Terrain.bridgesPlan`,
 * before the cover is applied), which is what breaks the circle: the
 * cover depends on the plan, the plan on the field without the cover.
 *
 * ## The deck level, derived
 *
 *  - `deckY` −0.10: 0.2 above `WATER_SURFACE` (−0.3) so the planks read as
 *    floating, 0.1 under the banks so the road *dips* onto the pontoon the
 *    way a pontoon sits below a bank. The ford floor is −0.32, so the floats
 *    show 0.22 above the wet sand.
 *  - **The deck ends where the ground rises through the deck** (plus a
 *    small burial, `endRise`, and `margin`): the wheel rays ride the terrain
 *    until it drops under the deck, then the deck — both are level at the
 *    crossover, so there is no step either way. Ends are checked on the
 *    centreline AND both road edges: the third ford skims a channel head
 *    with one edge on the bank, and a deck ending where only the centreline
 *    had risen would drop the down-bank wheels 0.2.
 *  - The deck is a **straight** slab on a curved road: its line is the
 *    least-squares fit of the span's centreline, centred on the span's mean,
 *    so a bowed route deviates by half its sagitta at most and the road
 *    stays inside the deck's kerbs (`check-wayfinding` holds the deviation
 *    under the kerb width).
 *
 * ## What counts as a crossing
 *
 * A bridge goes where the **whole road** — centreline and both edges — is
 * wet somewhere (the seed: `check-wayfinding`'s own definition of a ford,
 * ground at or under `WATER_SURFACE`, with a hair of tolerance), extended
 * along the route as far as *any* of the three stays under the deck plus
 * the rise. Measured 6 Sep, this is what separates the two real crossings
 * from the third carved span the last session counted as a ford: on the
 * contact-career route past the trunk, the road skims the head of a
 * southern channel with its down-screen edge in 0.02 of water and its
 * up-screen edge between the grass at 0 and −0.14. A level deck there
 * sits under the turf along one side — a pontoon beached on a lawn — and
 * the ford already handles a one-edge dip as the puddle it is. So the
 * three carved spans yield **two** bridges, and the third is recorded as
 * a design call in the roadmap, not bridged.
 */

/**
 * The bridge's model-facing numbers, restated from the pontoon recipe in
 * `tools/prep-model.mjs` (`check-wayfinding` holds the shipped GLB against
 * them) and the placement numbers that are ours to tune.
 */
export const BRIDGE = Object.freeze({
  /** The prepped pontoon's footprint and height: `footprint: [4.6, 10.7]`,
   *  `targetHeight: 1.4`. The width is `ROAD.width` 3.4 plus a 0.6 kerb a
   *  side — the kerb is what a bowed road's stray from a straight deck has
   *  to fit inside (the trunk crossing strays 0.55 over its 12.8). */
  width: 4.6,
  nominalLength: 10.7,
  height: 1.4,
  /** A road line this close above `WATER_SURFACE` (or under it) is wet: the
   *  seed of a crossing. */
  wetTolerance: 0.03,
  /**
   * **Where a bridge stands, there is no ford** (Michael, 6 Sep, on the
   * first mid-deck screenshot: "the bridges should be over water"). Under
   * the deck the channel keeps its natural bed — the ford's `carveCap`
   * relief is multiplied by (1 − cover) in `Terrain.carveAt` — and the
   * ford shelf fades back in over this many units beyond the deck's
   * footprint, on a rounded-box distance. 3.5 holds the added lateral
   * slope beside the deck (shelf −0.32 to a bed of ~−1.0) near the bank
   * gradient; the deck ENDS are unaffected, because the plan only ends a
   * deck where the ford field has already risen to the natural bank.
   */
  fade: 3.5,
  /** The plank sheet's top as a fraction of the model's height — measured
   *  off the source (planks at 0.60–0.70, uneven on purpose); the collider
   *  tops out here and the higher planks poke a few cm through it. */
  deck: 0.65,
  /** Deck top, world y. */
  deckY: -0.1,
  /** How far the ground must rise above the deck before the deck may end —
   *  the collision heightfield is a 1.5-unit grid that can sit a few cm
   *  under the smooth field, and a deck end level with it would lip. */
  endRise: 0.06,
  /** Buried run past that point, each end: the pontoon's ends go into the
   *  bank rather than stopping at it. */
  margin: 0.5,
  /** How far past its wet seed a deck may extend along the road. A bank
   *  eased at the trunk gradient climbs from the ford floor to the deck in
   *  ~1.3; a run longer than this is not a bank but the next carved span
   *  (at `#yearunit=2` the career road's crossing and the channel-head
   *  skim after it become one continuous edge-dip on the grid field, and
   *  an uncapped deck ran 16.7 through both, beaching on the lawn). */
  maxExtend: 3,
  /** How far past a route's end the walk continues — the landing-contact
   *  route BEGINS inside the trunk's ford (its start is 4 from the landing,
   *  the bank is at 3), and the ford relief itself reaches `FORD.run` past
   *  a route's end. A crossing must still be seeded ON the route: the
   *  overrun past the career gate walks into the corridor's own dip, which
   *  is not a ford. */
  overrun: 8,
  /** The walk step along the route. */
  step: 0.25,
});

/**
 * The bridges for a set of routes over a height field.
 *
 * @param {{ id: string, samples: [number, number][] }[]} routes
 * @param {(x: number, z: number) => number} heightAt
 * @returns {{ id: string, route: string, at: [number, number], heading: number,
 *             length: number, ends: [[number, number], [number, number]],
 *             deviation: number, deepest: number }[]}
 *   `heading` turns the model's +Z (its long axis) onto the deck line —
 *   `atan2(ux, uz)`, the car's own convention. `deviation` is the furthest
 *   the road's centreline strays from the deck line within the span.
 */
export function bridgePlan(routes, heightAt) {
  const bridges = [];
  for (const route of routes) {
    const spans = crossings(walk(route.samples, heightAt));
    spans.forEach((span, i) => {
      bridges.push(fit(span, route.id, spans.length > 1 ? `${route.id}-${i + 1}` : route.id));
    });
  }
  return bridges;
}

/**
 * How much a point is "under a bridge", 0..1: 1 inside any deck's footprint,
 * easing to 0 over `BRIDGE.fade` beyond it (rounded-box distance, zero
 * gradient at both ends). `Terrain.carveAt` multiplies the ford relief by
 * (1 − this), which is the whole mechanism that puts water under a deck.
 *
 * @param {{ at: [number, number], heading: number, length: number }[]} bridges
 */
export function coverAt(bridges, x, z) {
  let cover = 0;
  for (const bridge of bridges) {
    const ux = Math.sin(bridge.heading);
    const uz = Math.cos(bridge.heading);
    const dx = x - bridge.at[0];
    const dz = z - bridge.at[1];
    const along = Math.abs(dx * ux + dz * uz) - bridge.length / 2;
    const across = Math.abs(-dx * uz + dz * ux) - BRIDGE.width / 2;
    const d = Math.hypot(Math.max(0, along), Math.max(0, across));
    if (d >= BRIDGE.fade) continue;
    const t = d / BRIDGE.fade;
    cover = Math.max(cover, 1 - t * t * (3 - 2 * t));
  }
  return cover;
}

/**
 * The route's centreline at `BRIDGE.step`, extended `overrun` along the end
 * tangents, each point carrying the lowest and the highest of the ground
 * under the centre and both road edges, and whether it lies on the route
 * proper or on the overrun.
 */
function walk(samples, heightAt) {
  const first = samples[0];
  const second = samples[1];
  const last = samples[samples.length - 1];
  const beforeLast = samples[samples.length - 2];
  const ext = (from, to) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const len = Math.hypot(dx, dz);
    return [to[0] + (dx / len) * BRIDGE.overrun, to[1] + (dz / len) * BRIDGE.overrun];
  };
  const pts = [ext(second, first), ...samples, ext(beforeLast, last)];

  const points = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const outside = i === 0 || i === pts.length - 2;
    for (let t = 0; t < len; t += BRIDGE.step) {
      const x = ax + ux * t;
      const z = az + uz * t;
      const centre = heightAt(x, z);
      let low = centre;
      let high = centre;
      for (const side of [-ROAD.half, ROAD.half]) {
        const h = heightAt(x - uz * side, z + ux * side);
        low = Math.min(low, h);
        high = Math.max(high, h);
      }
      // The overrun's first segment ends exactly at the route's start, so
      // that point belongs to the route.
      points.push({ s: s + t, x, z, low, high, centre, outside: outside && !(i === 0 && t + BRIDGE.step >= len) });
    }
    s += len;
  }
  return points;
}

/**
 * The crossings: runs where the whole road is wet (the seed, at least one
 * point of it on the route), each extended both ways while any of the
 * three lines stays under the deck plus the rise. Two seeds whose
 * extensions meet are one crossing.
 */
function crossings(points) {
  const runs = [];
  let run = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.high <= WATER_SURFACE + BRIDGE.wetTolerance) {
      if (!run) runs.push((run = { from: i, to: i, onRoute: false }));
      run.to = i;
      if (!p.outside) run.onRoute = true;
    } else {
      run = null;
    }
  }
  const underDeck = (p) => p.low < BRIDGE.deckY + BRIDGE.endRise;
  const spans = [];
  for (const seed of runs) {
    if (!seed.onRoute) continue;
    let from = seed.from;
    let to = seed.to;
    const reach = Math.round(BRIDGE.maxExtend / BRIDGE.step);
    while (from > 0 && seed.from - from < reach && underDeck(points[from - 1])) from--;
    while (to < points.length - 1 && to - seed.to < reach && underDeck(points[to + 1])) to++;
    const last = spans[spans.length - 1];
    if (last && from <= last.to + 1) last.to = Math.max(last.to, to);
    else spans.push({ from, to });
  }
  return spans.map(({ from, to }) => points.slice(from, to + 1));
}

/**
 * One deck over one crossing, widened by the margin, on the least-squares
 * line through the crossing's centreline points.
 */
function fit(under, routeId, id) {
  // The line: mean point, principal direction of the under-deck points.
  let mx = 0;
  let mz = 0;
  for (const p of under) { mx += p.x; mz += p.z; }
  mx /= under.length;
  mz /= under.length;
  let sxx = 0;
  let sxz = 0;
  let szz = 0;
  for (const p of under) {
    sxx += (p.x - mx) ** 2;
    sxz += (p.x - mx) * (p.z - mz);
    szz += (p.z - mz) ** 2;
  }
  // The eigenvector of the larger eigenvalue of [[sxx, sxz], [sxz, szz]].
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let ux = Math.cos(theta);
  let uz = Math.sin(theta);
  // Orient along the route's travel so `ends[0]` is the near end.
  const tx = under[under.length - 1].x - under[0].x;
  const tz = under[under.length - 1].z - under[0].z;
  if (ux * tx + uz * tz < 0) { ux = -ux; uz = -uz; }

  // Extent along the line, and the road's stray from it.
  let sMin = Infinity;
  let sMax = -Infinity;
  let deviation = 0;
  let deepest = Infinity;
  for (const p of under) {
    const along = (p.x - mx) * ux + (p.z - mz) * uz;
    const across = -(p.x - mx) * uz + (p.z - mz) * ux;
    sMin = Math.min(sMin, along);
    sMax = Math.max(sMax, along);
    deviation = Math.max(deviation, Math.abs(across));
    deepest = Math.min(deepest, p.centre);
  }
  sMin -= BRIDGE.margin;
  sMax += BRIDGE.margin;
  const mid = (sMin + sMax) / 2;
  const at = [mx + ux * mid, mz + uz * mid];
  return {
    id,
    route: routeId,
    at,
    heading: Math.atan2(ux, uz),
    length: sMax - sMin,
    ends: [[mx + ux * sMin, mz + uz * sMin], [mx + ux * sMax, mz + uz * sMax]],
    deviation,
    deepest,
  };
}
