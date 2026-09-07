import { ROAD } from './wayfindingPlan.js';
import { BRIDGE } from './bridgePlan.js';

/**
 * The art pass's world-level dressing, as pure arithmetic (6 Sep, late —
 * Michael: "improve the art / map a bit more later to make it look better
 * and like it has more content"; the pack is artikora's human props,
 * `CREDITS.md`). Two placements derive from the wayfinding layer and so
 * live beside it rather than in any area:
 *
 *  - **a lantern post at each end of every bridge**, on the up-screen side
 *    of the road (the signposts' rule: never between the camera and the
 *    road it lights), hung toward the road, so every crossing is a pair of
 *    lights at night;
 *  - **the fishing spot**: a rod leaning and a bucket on the bank beside the
 *    trunk bridge's landing end, camera-side, in the first frame a visitor
 *    sees — the one piece of pure "someone lives here" in the pack;
 *  - **two lanterns where a road arrives at a plaza** (`roadEndLanterns`),
 *    flanking the last sample of the route at kerb distance.
 *
 * `check-wayfinding` sweeps every point here for dry flat ground, off the
 * road, off the deck and clear of the posts, the way it sweeps the posts.
 */
export const DRESSING = Object.freeze({
  /** A lantern stands this far past the deck end, on the bank … */
  lanternBack: 1.0,
  /** … and this far off the deck's edge — a full unit, because the road
   *  bows away from the straight deck line and a kerb-width post stood 3 cm
   *  inside the road's clearance at the trunk's far end (swept). */
  lanternAside: BRIDGE.width / 2 + 1.0,
  /** The fishing spot, off the landing end of the trunk deck, down-screen —
   *  back on the flat bank, not the fade slope beside the deck (swept: at
   *  0.6 the rod stood at −0.10), and well along the bank: at 1.8 off the
   *  kerb the rod stood 3.1 from the spawn, a unit off the car's nose, and
   *  the first press of W drove through it (Michael: "the fishing spot
   *  automatically gets knocked over when the car spawns in"). */
  rodBack: 1.5,
  rodAside: BRIDGE.width / 2 + 3.4,
  bucketAside: 0.8,
  /** The fishing items keep this from the spawn — past the car's length
   *  and the width of its first drive out. */
  spawnClearance: 4.0,
  /** A road-end lantern stands one kerb width off the road's edge … */
  roadAside: ROAD.half + 1.0,
  /** … and this far back up the road from its end: before the district's
   *  own signpost (which stands 1.2 back, 2.7 aside), so the pair reads as
   *  a gate on the approach rather than a crowd at the threshold. */
  roadBack: 3.0,
  /** A bridge lantern within this of a signpost is not built. */
  postClearance: 1.5,
});

const UP_SCREEN = [-Math.SQRT1_2, -Math.SQRT1_2];

/** The perpendicular to (ux, uz) that points up-screen (the `beside` rule). */
export function upScreenPerp(ux, uz) {
  let px = -uz;
  let pz = ux;
  if (px * UP_SCREEN[0] + pz * UP_SCREEN[1] < 0) {
    px = -px;
    pz = -pz;
  }
  return [px, pz];
}

/**
 * The yaw that points a model's local +X at a world point — the lantern
 * hangs off its post along +X, so this hangs it toward the road. A yaw θ
 * about Y maps local +X to (cos θ, 0, −sin θ).
 */
export function hangToward(x, z, tx, tz) {
  return Math.atan2(-(tz - z), tx - x);
}

/**
 * @param {{ id: string, route: string, at: [number, number], heading: number, length: number }[]} bridges
 * @returns {{ what: string, kind: string, x: number, z: number, heading: number, bridge: string }[]}
 *   `kind` is the prop file (`lanternPost`, `fishingRod1`, `bucket`).
 */
export function bridgeDressing(bridges, { avoid = [], clearance = DRESSING.postClearance } = {}) {
  const items = [];
  for (const bridge of bridges) {
    const ux = Math.sin(bridge.heading);
    const uz = Math.cos(bridge.heading);
    const [px, pz] = upScreenPerp(ux, uz);
    const half = bridge.length / 2;

    for (const end of [-1, 1]) {
      const along = end * (half + DRESSING.lanternBack);
      const rx = bridge.at[0] + ux * along;
      const rz = bridge.at[1] + uz * along;
      const x = rx + px * DRESSING.lanternAside;
      const z = rz + pz * DRESSING.lanternAside;
      // A lantern that would crowd a signpost is dropped: the post carries
      // an amber cap and is the light at that end (the trunk's landing end
      // stands 1.2 from the spawn post, measured).
      if (avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < clearance)) continue;
      items.push({
        what: `lantern ${bridge.id} ${end < 0 ? 'near' : 'far'}`,
        kind: 'lanternPost',
        x, z,
        heading: hangToward(x, z, rx, rz),
        bridge: bridge.id,
      });
    }

    if (bridge.route === 'landing-contact') {
      // Down-screen of the landing end: the camera side, in the opening frame.
      const along = -(half + DRESSING.rodBack);
      const rx = bridge.at[0] + ux * along;
      const rz = bridge.at[1] + uz * along;
      const rod = { x: rx - px * DRESSING.rodAside, z: rz - pz * DRESSING.rodAside };
      items.push({
        what: 'fishing rod', kind: 'fishingRod1', ...rod,
        // The rod leans along its local −X; lean it out over the water.
        heading: hangToward(rod.x, rod.z, rx, rz) + Math.PI,
        bridge: bridge.id,
        // A visual, no body: a rod is 1.7 tall on a 0.26 base, and as a
        // knockable box it lay down at the first physics hiccup (Michael
        // saw it fall at spawn). Signage you drive through, like the posts.
        body: false,
      });
      // Beyond the rod, down the bank toward the water: the spawn, the name
      // letters and the road box the spot in on three sides (four sweeps —
      // 1.2 from the letters, then 4 and 27 cm inside the spawn clearance).
      items.push({
        what: 'bucket', kind: 'bucket',
        x: rod.x - px * DRESSING.bucketAside + ux * 0.8,
        z: rod.z - pz * DRESSING.bucketAside + uz * 0.8,
        heading: 0.7,
        bridge: bridge.id,
      });
    }
  }
  return items;
}

/**
 * Two lanterns flanking the end of a route, at kerb distance either side of
 * its last sample, hung toward the road.
 *
 * @param {{ samples: [number, number][] }} route
 */
export function roadEndLanterns(route, { aside = DRESSING.roadAside, back = DRESSING.roadBack } = {}) {
  const n = route.samples.length;
  const [ax, az] = route.samples[n - 2];
  const [ex, ez] = route.samples[n - 1];
  const len = Math.hypot(ex - ax, ez - az);
  const ux = (ex - ax) / len;
  const uz = (ez - az) / len;
  const bx = ex - ux * back;
  const bz = ez - uz * back;
  return [-1, 1].map((side) => {
    const x = bx - uz * aside * side;
    const z = bz + ux * aside * side;
    return { what: `road-end lantern ${side < 0 ? 'left' : 'right'}`, kind: 'lanternPost', x, z, heading: hangToward(x, z, bx, bz) };
  });
}
