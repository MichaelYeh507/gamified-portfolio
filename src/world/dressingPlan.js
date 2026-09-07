import { ROAD } from './wayfindingPlan.js';
import { BRIDGE } from './bridgePlan.js';
import { WATER_SURFACE } from './Terrain.js';

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
 *  - **the fishing scene**: a rod leaning, a bucket and a moored rowboat on
 *    the bank beside one bridge's near end, camera-side (`fishingBridge`;
 *    it opened at the spawn and moved to the career crossing when the
 *    opening frame got cramped) — the one piece of pure "someone lives
 *    here" in the pack;
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
  /**
   * Which bridge gets the fishing scene (rod, bucket, rowboat). It began at
   * the trunk bridge beside the spawn — the opening frame — and moved 7 Sep
   * on Michael's call ("the main screen is too cramped"): the letters, the
   * tagline, the signpost, the bridge and its lantern were already there.
   * The career road's crossing has water both sides and nothing else near.
   */
  fishingBridge: 'contact-career',
  /**
   * The rowboat (7 Sep, Michael's find), moored beside the trunk deck on
   * the camera side, near its landing end where the water begins: a boat's
   * width and a bit off the kerb, turned a few degrees off the deck line
   * so it reads as tied up rather than parked. A visual afloat on the
   * water — props here sink (the reference's float multiplier is not
   * ported), and a boat on the river bed is a wreck — with its hull sunk
   * `boatDraught` into the surface.
   */
  /** Off the deck's edge to the boat's CENTRE. Moored along the channel the
   *  hull points at the deck, so half its length (1.7) comes off this:
   *  at 1.6 off the kerb the bow ended 10 cm inside it (Michael: "the
   *  sailboat is kind of in the bridge"); at 2.6 it clears by 0.9. */
  boatAside: BRIDGE.width / 2 + 2.6,
  /** From the landing end toward the deck's middle: at 3.2 the hull's near
   *  end sat on the bank shelf in 2 cm of water (swept); at 5.0 the whole
   *  hull is over the channel, half a unit deep beside the deck. */
  boatAlong: 5.0,
  boatYaw: 0.18,
  /** The water is one plane at the surface, so anything of the hull under
   *  it is drawn through: at 0.16 the ripples ran across the boat's floor
   *  (Michael: "the boat looks like its sinking"). The floor planks top out
   *  0.13 up the hull; 0.03 keeps the plane under them. */
  boatDraught: 0.03,
  /**
   * The rod hangs over the water (Michael, 7 Sep): the plan walks from the
   * bank toward the channel to find the waterline and plants the rod this
   * far short of it, leaning out, so the tip (0.92 out at 1.7 up) is over
   * the water wherever the bank turns out to be. Needs `groundAt`; without
   * it the rod stands at `rodBack` on the flat bank as before.
   */
  /**
   * The rod model, measured off the prepped GLB (a vertex grid, 7 Sep): the
   * butt rests on the ground at local x −0.92 and the shaft rises toward
   * +X to the tip at (−0.2, 1.6) — a 30° lean, a rod propped on a stick.
   * The first placement pointed −X at the water, which put the butt over
   * the water and the tip over land (Michael: "the line in the water and
   * the rod on land?"; there is no line on the model — the white curves in
   * the screenshots were the wind lines). Now +X points at the water, the
   * butt is planted `rodButtInland` short of the waterline, and the rod is
   * pitched `rodTilt` about the butt so the tip sits 1.22 out and 1.26 up
   * (46° from the ground: at 36° the fixed camera read it as lying on the
   * sand): from the butt, 0.8 over the water.
   */
  rodButt: 0.92,
  rodButtInland: 0.45,
  rodTilt: -0.35,
  rodTipReach: 1.22,
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
 * The direction a leaning rod reads best in: along the screen's horizontal
 * axis (world (√½, −√½), decision 16's fixed camera), signed toward the
 * water. A rod leaning straight at the water on the career crossing
 * leaned toward the camera too, and at 45° elevation its rise and its
 * approach cancelled — it projected as lying on the sand at any pitch.
 * Leaning across the screen instead, the rise shows and the tip still
 * goes out over the channel (0.95 of its reach along the water direction
 * here). Falls back to the water direction itself if the channel runs
 * too close to the camera axis for the screen lean to reach it.
 */
export function readableLean(ux, uz) {
  const rx = Math.SQRT1_2;
  const rz = -Math.SQRT1_2;
  const dot = rx * ux + rz * uz;
  if (Math.abs(dot) < 0.5) return [ux, uz];
  return dot > 0 ? [rx, rz] : [-rx, -rz];
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
export function bridgeDressing(bridges, { avoid = [], clearance = DRESSING.postClearance, groundAt = null } = {}) {
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

    if (bridge.route === DRESSING.fishingBridge) {
      // The rowboat, moored alongside on the camera side over the water.
      const bAlong = -half + DRESSING.boatAlong;
      const bx = bridge.at[0] + ux * bAlong - px * DRESSING.boatAside;
      const bz = bridge.at[1] + uz * bAlong - pz * DRESSING.boatAside;
      items.push({
        what: 'rowboat', kind: 'rowboat', x: bx, z: bz,
        // The hull's long axis is local +X; lay it ALONG THE CHANNEL (across
        // the deck line), the way a boat tied at a bridge sits in the
        // current — and the way its whole hull stays over the deep bed: laid
        // along the deck at the career crossing, its ends reached the banks
        // in 0.18 of water (swept). Then the yaw.
        heading: hangToward(bx, bz, bx + ux, bz + uz) + Math.PI / 2 + DRESSING.boatYaw,
        bridge: bridge.id,
        body: false,
        afloat: true,
      });

      // Down-screen of the near end (the route's start side): the camera side.
      let buttAlong = -(half + DRESSING.rodBack);
      let lean = [-ux, -uz]; // away from the deck, over nothing: the fallback
      if (groundAt) {
        // Walk from the deck end toward the channel on the rod's line
        // until the ground goes under the water: that is the waterline.
        const lx = bridge.at[0] - px * DRESSING.rodAside;
        const lz = bridge.at[1] - pz * DRESSING.rodAside;
        let s = -half;
        while (s < half && groundAt(lx + ux * s, lz + uz * s) > WATER_SURFACE) s += 0.1;
        buttAlong = s - DRESSING.rodButtInland;
        lean = readableLean(ux, uz);
      }
      const rbx = bridge.at[0] + ux * buttAlong - px * DRESSING.rodAside;
      const rbz = bridge.at[1] + uz * buttAlong - pz * DRESSING.rodAside;
      // The model's origin is `rodButt` along +X from the butt, so the
      // origin stands that far past the butt toward the water.
      const rod = { x: rbx + lean[0] * DRESSING.rodButt, z: rbz + lean[1] * DRESSING.rodButt };
      items.push({
        what: 'fishing rod', kind: 'fishingRod1', ...rod,
        // The shaft rises toward local +X: point +X at the water.
        heading: hangToward(rod.x, rod.z, rod.x + lean[0], rod.z + lean[1]),
        // Pitched about the butt, after the yaw, to lie out over the water.
        tilt: groundAt ? DRESSING.rodTilt : 0,
        pivot: [-DRESSING.rodButt, 0, 0],
        butt: [rbx, rbz],
        tip: [rbx + lean[0] * DRESSING.rodTipReach, rbz + lean[1] * DRESSING.rodTipReach],
        bridge: bridge.id,
        // A visual, no body: a rod is 1.7 tall on a 0.26 base, and as a
        // knockable box it lay down at the first physics hiccup (Michael
        // saw it fall at spawn). Signage you drive through, like the posts.
        body: false,
      });
      // Beside the butt, two steps back from the water onto the flat bank
      // (at one step it stood on the slope at −0.12, swept).
      const back = groundAt ? [ux, uz] : lean;
      items.push({
        what: 'bucket', kind: 'bucket',
        x: rbx - px * DRESSING.bucketAside - back[0] * 1.9,
        z: rbz - pz * DRESSING.bucketAside - back[1] * 1.9,
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
