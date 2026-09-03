/**
 * The corridor's arithmetic. Pure — no three.js, no DOM, no game state — so
 * `tools/check-career.mjs` can prove every rule here under node, the same way
 * the pipeline and the prep tool are proven.
 *
 * Decision 24, and the scope Michael raised on 30 Aug: the career area is a
 * CORRIDOR read by driving, at **one year per world unit** (`D` §4.4 — the reference's
 * `year = start + floor(offset)`; distance is time). Education rides the same
 * axis: a school entry is just an earlier stretch of world units on the same
 * drive.
 *
 * Everything here is data-driven from `content/roles.js`. That is the one
 * lesson the reference's career area teaches by counter-example: the reference's content lives in
 * Blender `userData` and a job title needs a re-export (`D` §4.4). Ours never
 * bakes placement — append a role, and the corridor re-lays itself.
 */

/** Direction of increasing years: away from the camera, up the screen.
 *
 * The camera sits on the +X+Z bearing (decision 15/16), so a corridor running
 * along −(√½, √½) is an avenue receding up the frame: every slab faces the
 * fixed camera (`FACE_YAW` = π/4, the plaza's rule) **and** faces the car
 * driving toward it, like signs on a road. The alternative — running the
 * corridor across the screen — was rejected by the island, not by taste:
 * every screen-horizontal strip long enough to hold it crosses a channel.
 */
export const AXIS = Object.freeze({ x: -Math.SQRT1_2, z: -Math.SQRT1_2 });

/** Screen-right, perpendicular to AXIS. Slabs sit at +SIDE of the road. */
export const SIDE = Object.freeze({ x: Math.SQRT1_2, z: -Math.SQRT1_2 });

/** The heading that drives up the corridor (Car convention: yaw sends +Z here). */
export const AXIS_HEADING = Math.atan2(AXIS.x, AXIS.z); // -3π/4

/** Road before the first year mark — where `?at=career` stands you. */
export const LEAD_IN = 4;
/** Road after the last year mark, so the corridor has an exit, not an edge. */
export const TAIL_OUT = 3;

/**
 * A synthesized span for an entry missing one of its dates, in years. One year
 * rather than something clever: the number is a visible placeholder, and the
 * console names it every boot until the real date lands.
 */
const DEFAULT_SPAN_YEARS = 1;

/** The narrowest slab a degenerate span still gets, in years-at-unit-1. */
const MIN_SPAN_YEARS = 0.35;

/**
 * "2025-03" → 2025.1667, "2021" → 2021. Anything else → null.
 * Month is optional and 1-based, matching the `Role.start` contract.
 */
export function parseYearMonth(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})(?:-(\d{1,2}))?\s*$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  if (month < 1 || month > 12) return null;
  return year + (month - 1) / 12;
}

/** The current instant as a fractional year, UTC — same clock the cycles use. */
export function nowYearFraction(date = new Date()) {
  return date.getUTCFullYear() + date.getUTCMonth() / 12;
}

/**
 * Place every role on the year axis.
 *
 * The rules, in order, each of them checked headlessly:
 *
 *  - `end` null **or omitted** means current (the `Role` contract) and reads
 *    as today. `end: ''` is different: it means the date is not written yet.
 *  - An entry missing one date gets the other ± one year, **synthesized and
 *    warned about** — it stands in the corridor as a visible placeholder
 *    rather than silently vanishing, because the corridor is judged against
 *    the scaffolded knollwood entry before its dates exist.
 *  - An entry missing both dates cannot stand on a distance-is-time axis
 *    without lying, so it is skipped — and warned about, every boot, the way
 *    `ProjectsArea._warnAboutMissingContent` names missing titles.
 *  - An end before its start is clamped, not trusted.
 *
 * @param {import('../../content/roles.js').Role[]} roles
 * @param {{ now?: number, unitsPerYear?: number }} [options]
 */
export function buildTimeline(roles, { now = nowYearFraction(), unitsPerYear = 1 } = {}) {
  const warnings = [];
  const placed = [];

  for (const role of roles) {
    let startYear = parseYearMonth(role.start);
    const isCurrent = role.end === null || role.end === undefined;
    let endYear = isCurrent ? now : parseYearMonth(role.end);
    let synthesizedStart = false;
    let synthesizedEnd = false;

    if (startYear === null && endYear === null) {
      warnings.push(
        `"${role.slug}" has no dates yet — not standing in the corridor until one is written`
      );
      continue;
    }
    if (startYear === null) {
      startYear = endYear - DEFAULT_SPAN_YEARS;
      synthesizedStart = true;
      warnings.push(
        `"${role.slug}" has no start date — standing as a ${DEFAULT_SPAN_YEARS}-year slab ` +
          `ending ${isCurrent ? 'today' : role.end}; the corridor re-lays itself when the date lands`
      );
    }
    if (endYear === null) {
      endYear = startYear + DEFAULT_SPAN_YEARS;
      synthesizedEnd = true;
      warnings.push(
        `"${role.slug}" has an unwritten end date — standing as a ${DEFAULT_SPAN_YEARS}-year slab`
      );
    }
    if (endYear < startYear) {
      warnings.push(`"${role.slug}" ends before it starts — span clamped`);
      endYear = startYear + MIN_SPAN_YEARS;
    }

    placed.push({
      role,
      startYear,
      endYear: Math.max(endYear, startYear + MIN_SPAN_YEARS),
      isCurrent,
      synthesizedStart,
      synthesizedEnd,
    });
  }

  placed.sort((a, b) => a.startYear - b.startYear);

  if (placed.length === 0) {
    return { entries: [], firstYear: 0, lastYear: 0, spanUnits: 0, unitsPerYear, warnings };
  }

  // Whole years bound the axis, so the counter starts and ends on a real
  // number rather than on somebody's hire-date fraction.
  const firstYear = Math.floor(Math.min(...placed.map((p) => p.startYear)));
  const lastYear = Math.max(
    firstYear + 1,
    Math.ceil(Math.max(...placed.map((p) => p.endYear)))
  );

  const entries = placed.map((p) => ({
    ...p,
    /** Corridor coordinate of the entry's start, in world units. */
    s0: (p.startYear - firstYear) * unitsPerYear,
    /** Corridor length this entry occupies — the reference's `line.size`, derived not authored. */
    size: (p.endYear - p.startYear) * unitsPerYear,
  }));

  return {
    entries,
    firstYear,
    lastYear,
    spanUnits: (lastYear - firstYear) * unitsPerYear,
    unitsPerYear,
    warnings,
  };
}

/**
 * Where the corridor stands in the world: the point at corridor coordinate
 * s = 0 (the first year mark), placed so the whole run — lead-in to tail —
 * is centred on the area's declared centre. Everything downstream positions
 * itself through `posAt`/`sOf`, so the corridor has exactly one origin.
 *
 * @param {[number, number]} center the area def's world XZ
 * @param {number} spanUnits
 */
export function corridorFrame(center, spanUnits) {
  const sMid = (spanUnits + TAIL_OUT - LEAD_IN) / 2;
  return {
    x: center[0] - AXIS.x * sMid,
    z: center[1] - AXIS.z * sMid,
    spanUnits,
  };
}

/** World XZ of corridor coordinate `s`, offset `side` to screen-right. */
export function posAt(frame, s, side = 0) {
  return {
    x: frame.x + AXIS.x * s + SIDE.x * side,
    z: frame.z + AXIS.z * s + SIDE.z * side,
  };
}

/** Corridor coordinate of a world point — the 1D scalar the whole area runs on. */
export function sOf(frame, x, z) {
  return (x - frame.x) * AXIS.x + (z - frame.z) * AXIS.z;
}

/** Signed distance from the road line, positive to screen-right. */
export function sideOf(frame, x, z) {
  return (x - frame.x) * SIDE.x + (z - frame.z) * SIDE.z;
}

/**
 * The slab's resting width for an entry, in world units. Long entries get the
 * full slab and slide it alongside the car (`D` §4.4's `offsetTarget`); an
 * entry shorter than the minimum readable width gets the minimum and stands
 * still — the slide range collapses to zero on its own.
 *
 * Capped at 3.4 rather than the first build's 4.2, and the cap is the site
 * talking: a slab's width extends ACROSS the road (it faces the camera), so a
 * work slab centred at +3.4 reaches side `3.4 + w/2` — at 4.2 wide that is
 * 5.5, on the trunk's carved bank at the up-screen end, the same collision
 * that pulled the fence in to 5.2. At 3.4 the outer edge stops at 5.1.
 */
export function slabWidthFor(sizeUnits) {
  return Math.min(3.4, Math.max(2.4, sizeUnits));
}

/**
 * Where the slab's centre sits for a given car progress `delta` into the
 * entry, relative to the entry's own s0. The reference's mechanic exactly
 * (`CareerArea.js:340`): the slab rides beside you through its segment, then
 * parks. Written with half-width margins so two adjacent entries' slabs touch
 * at a shared boundary year instead of interpenetrating.
 */
export function slabCenterFor(delta, sizeUnits, width) {
  const slide = Math.max(0, sizeUnits - width);
  const t = Math.min(slide, Math.max(0, delta - width / 2));
  return width / 2 + t;
}

/**
 * The along-road spacing two same-lane occupants keep, in world units.
 *
 * NOT a half-widths sum, and getting this right needed the geometry stated
 * plainly: a slab's *width* extends ACROSS the road (it faces the camera);
 * along the road it is 0.34 thin. So the constraint is visual, not physical —
 * enough depth that the nearer stone's top clears the farther stone's base on
 * screen, which at ~0.107 ndc per unit against a ~0.25-ndc-tall slab is about
 * 2.4. A width-derived 3.65 was tried first and pushed the AI major's parked
 * slab past the corridor's end, into the counter's parking spot.
 *
 * Raised from 2.4 when the cards went low and tilted, and again when they
 * grew: a tilted card's top rows climb the screen by their elevation as well
 * as their depth, so the queue must clear footprint plus climb (a 2.1-long
 * card at 0.38 tilt: ~1.9 of depth + ~1.1 of climb-equivalent) or the next
 * card's years row prints into this card's org. And once more on 3 Sep, to
 * 4.0, when the card grew to 2.7 for bigger type (~2.5 of depth + ~1.4 of
 * climb, 3.9) — the same rule. 4.2 was tried first and `check-career`
 * refused it: at `#yearunit=1` the counter's derived parking spot
 * (`counterTrackEnd`) ran onto unflat ground at the corridor's far end.
 */
export const QUEUE_SEP = 4.0;

/**
 * The same-lane queue: concurrent entries on one lane (the IS major and the
 * AI major both run to now) would otherwise ride and park inside each other's
 * screen space, since every position above keys off start dates that can be
 * months apart. So within a lane, in date order, each slab keeps at least
 * `QUEUE_SEP` behind its predecessor — sequential entries already satisfy it
 * (their park/rest margins meet at a shared boundary year, 3.4 apart), so
 * the clamp only ever moves a slab whose dates overlap the one before, and
 * the newest chapter stands furthest along the road.
 *
 * @param {ReturnType<typeof buildTimeline>} timeline
 * @returns per-entry `{ entry, side, width, rest, parked }`, timeline order
 */
export function slabPlacements(timeline) {
  const lastInLane = new Map();
  return timeline.entries.map((entry) => {
    const width = slabWidthFor(entry.size);
    const side = laneFor(entry.role) * SLAB_SIDE;
    let rest = entry.s0 + width / 2;
    let parked = entry.s0 + slabCenterFor(entry.size + 100, entry.size, width);

    const prev = lastInLane.get(side);
    if (prev) {
      rest = Math.max(rest, prev.rest + QUEUE_SEP);
      parked = Math.max(parked, prev.parked + QUEUE_SEP);
    }

    const placement = { entry, side, width, rest, parked };
    lastInLane.set(side, placement);
    return placement;
  });
}

/**
 * Where the counter's track ends: past the last left-lane slab's parked spot
 * by the same queue spacing, never short of the corridor's end. The counter
 * shares the left band with the education lane, and its parking place is
 * derived rather than assumed for exactly the reason the queue exists — the
 * first build parked it at `span`, and the AI major's stone parked on top of
 * it.
 */
export function counterTrackEnd(timeline) {
  let lastLeftParked = -Infinity;
  for (const p of slabPlacements(timeline)) {
    if (p.side < 0) lastLeftParked = Math.max(lastLeftParked, p.parked);
  }
  return Math.max(timeline.spanUnits, lastLeftParked + QUEUE_SEP);
}

/**
 * "2021 – 2025", "2025 – now", "···· – now". The dots are the visible hole
 * (the "(untitled)" convention): an unwritten date shows as unwritten, never
 * as a guess.
 */
export function yearsLabel(entry) {
  const start = entry.synthesizedStart ? '····' : String(Math.floor(entry.startYear));
  const end = entry.isCurrent
    ? 'now'
    : entry.synthesizedEnd
      ? '····'
      : String(Math.floor(entry.endYear));
  return `${start} – ${end}`;
}

/**
 * The corridor's lateral layout, in world units off the road line. Positive is
 * screen-right. These live here rather than in `CareerArea` because the
 * placement plan below is what `tools/check-career.mjs` sweeps against the
 * real height field — the constants and the check must read the same numbers.
 *
 * The signs are the site talking: slabs stand screen-right, between the road
 * and the trunk river (risen stones against water); the counter, the
 * streetlights and most of the room sit screen-left, toward the western
 * shore, because the corridor converges with the trunk as it runs up-screen
 * and the right-hand margin narrows.
 */
export const SLAB_SIDE = 3.4;
/** The counter lies FLAT on the ground (the reference's design — the reference's digits are
 *  horizontal planes at y 0.13, measured out of areas.glb) — and it lies on
 *  the ROAD, dead centre, gliding ahead of the car like pavement markings.
 *  The reference's corridor separates the year row from the text band laterally (the reference's
 *  digits at x 22–24, the reference's text at x 25–29); our west band is too narrow for
 *  two side-by-side bands, and the road is the one strip nothing else ever
 *  occupies. Flat digits carry no collider and the car simply drives over
 *  them when it catches up. */
export const COUNTER_SIDE = 0;
/** Half the flat digit row's length along the across axis — the counter's
 *  lateral footprint, swept for dryness at both ends of its row. YearCounter
 *  sizes its digits to fit inside this. */
export const COUNTER_HALF_WIDTH = 1.35;
/** Where the counter's track begins, before year zero. −1.2 keeps QUEUE_SEP
 *  of depth to the first card's rest (1.2) — the earlier −2.5 put the
 *  track's start on the NW inlet's carved bank. */
export const COUNTER_TRACK_START = -1.2;
/** Close behind the slab line: the corridor converges with the trunk river as
 *  it runs up-screen, and a unit of side offset costs 0.92 of river clearance
 *  — 6.0 put the last posts on the carved bank at `#yearunit=2`. */
export const FENCE_SIDE = 5.2;

/**
 * The shipped scale, world units per year. Decision 24 stole the reference author's "one
 * year per world unit" — but his career spans fifteen years and Michael's
 * real dates (31 Aug: 2024 → now) span three. At 1 unit/yr the whole axis is
 * 3 units against slabs ~3 wide: geometrically impossible, not a taste call.
 * 4 makes the corridor exactly the length the `#yearunit=2` future-data sweep
 * already proved the site holds. The reference's mechanic survives untouched — the
 * counter is still `floor(offset / unit)`, distance is still time — and
 * `#yearunit=` still overrides live for judging (2..4 fit the site; 5 runs
 * the road into the beach, which check-career will say if it is ever shipped).
 */
export const SHIPPED_UNITS_PER_YEAR = 4;

/**
 * Which side of the road an entry stands on: **education screen-left, work
 * screen-right.** Not decoration — a lane per kind is what makes concurrent
 * entries readable, and Michael's data is concurrent from the first real
 * fill: CMU runs 2024 → now and Knollwood 2026 → now. On one lane the two
 * current slabs would stand inside each other's screen space; on two, school
 * and job read side by side along the same year axis, which is also just
 * true.
 */
export function laneFor(role) {
  return role.kind === 'education' ? -1 : 1;
}
export const LIGHT_SIDE = -2.6;
/**
 * One panel length. The fence GLB measures 4.48 along its run, and the
 * first step was 2.1 — every panel overlapped its neighbours by more than
 * half, invisible while they were visuals and a domino the moment they
 * became bodies (2 Sep, Michael: "the fences fell over by itself... it was
 * already knocked over"): overlapping colliders shove each other apart at
 * build, with the car 160 units away. End to end with a hair of daylight.
 */
export const FENCE_STEP = 4.55;

/**
 * Everything the corridor will stand on the ground, as world points — pure,
 * so the headless check can prove every one of them dry and flat before the
 * build ever runs, the way Terrain's own routing assertion works. `CareerArea`
 * consumes the same plan for its dressing and its boot-time assertion, so the
 * check and the build cannot disagree about where things go.
 *
 * @param {[number, number]} center the area def's world XZ
 * @param {ReturnType<typeof buildTimeline>} timeline
 */
export function corridorPlan(center, timeline) {
  const frame = corridorFrame(center, timeline.spanUnits);
  const span = timeline.spanUnits;
  const points = [];
  const add = (what, s, side) => {
    const p = posAt(frame, s, side);
    const point = { what, s, side, x: p.x, z: p.z };
    points.push(point);
    return point;
  };

  // The road itself, and a wheel-width either side of it.
  for (let s = -LEAD_IN - 1; s <= span + TAIL_OUT + 1; s += 1) {
    add('road', s, 0);
    add('road', s, -1.7);
    add('road', s, 1.7);
  }

  // Each slab's rest positions — where it rises and where it parks, the
  // same-lane queue applied — in its own lane, and at its lateral extremes
  // too: a slab's width extends across the road, so its outer edge is the
  // point nearest the river (work lane) or the shore (education lane), and
  // that edge is what has to be dry.
  for (const placement of slabPlacements(timeline)) {
    const { entry, side, width, rest, parked } = placement;
    for (const s of [rest, parked]) {
      add(`slab:${entry.role.slug}`, s, side);
      add(`slab:${entry.role.slug}`, s, side - width / 2);
      add(`slab:${entry.role.slug}`, s, side + width / 2);
    }
  }

  // The counter's whole track — it starts just before year zero, at the
  // corridor's entrance, and ends past the last left-lane park (see
  // `counterTrackEnd`), so both of its stable states stay out of the slabs.
  const counterEnd = counterTrackEnd(timeline);
  for (let s = COUNTER_TRACK_START; s <= counterEnd + 0.001; s += 1) {
    add('counter', s, COUNTER_SIDE);
    add('counter', s, COUNTER_SIDE - COUNTER_HALF_WIDTH);
    add('counter', s, COUNTER_SIDE + COUNTER_HALF_WIDTH);
  }
  add('counter', counterEnd, COUNTER_SIDE);
  add('counter', counterEnd, COUNTER_SIDE - COUNTER_HALF_WIDTH);

  // Dressing. The fence stops at the last year mark rather than running into
  // the tail — the tail is where the corridor and the trunk river pinch.
  // Panel centres; the last one stops short so its far end (2.24 out) clears
  // the second barrel's near edge at `span + 1.6 − 0.47` — bodies now, and a
  // barrel born inside a panel wakes them both.
  const fence = [];
  for (let s = -1.5; s <= span - 1.2; s += FENCE_STEP) {
    fence.push(add('fence', s, FENCE_SIDE));
  }
  const lights = [
    add('streetlight', -LEAD_IN + 1, LIGHT_SIDE),
    add('streetlight', span + TAIL_OUT - 1, LIGHT_SIDE),
  ];
  // Spread out: the first arrangement stood the barrel inside the cart and a
  // fence post through both — the cart alone is ~2 units long. And the cart
  // moved INTO the lane on 2 Sep, when the contact→career road arrived: the
  // route enters the corridor almost perpendicular to the axis, crossing this
  // flank through the band s ≈ −5.9..−2.4, and the cart's old spot at
  // (−4.0, 4.8) stood 0.17 units from the new road's centreline. Every spot
  // further down-screen on either flank is carved bank (the NW inlet to the
  // left, the enclosed pond to the right — measured, not guessed), so the
  // cart parks up the corridor between the road edge and the fence, which a
  // farm cart on a lane arguably always wanted to do.
  // Since the dressing became bodies (2 Sep) nothing here may overlap the
  // fence line (side 4.95–5.45): the cart parks parallel to the lane at 3.4
  // with its 1.41 half-width reaching 4.81, and both barrels (radius 0.47)
  // sit at 4.3.
  const cart = add('cart', 1.7, 3.4);
  const barrels = [add('barrel', -0.6, 4.3), add('barrel', span + 1.6, 4.3)];

  return { frame, points, fence, lights, cart, barrels };
}

/**
 * The 7-segment patterns, one row per digit, packed for the counter's
 * DataTexture (`D` §4.4 — the reference's 7×10, digit rendered in the vertex shader).
 * Segment order: a top, b top-right, c bottom-right, d bottom, e bottom-left,
 * f top-left, g middle.
 */
export const DIGIT_SEGMENTS = Object.freeze([
  [1, 1, 1, 1, 1, 1, 0], // 0
  [0, 1, 1, 0, 0, 0, 0], // 1
  [1, 1, 0, 1, 1, 0, 1], // 2
  [1, 1, 1, 1, 0, 0, 1], // 3
  [0, 1, 1, 0, 0, 1, 1], // 4
  [1, 0, 1, 1, 0, 1, 1], // 5
  [1, 0, 1, 1, 1, 1, 1], // 6
  [1, 1, 1, 0, 0, 0, 0], // 7
  [1, 1, 1, 1, 1, 1, 1], // 8
  [1, 1, 1, 1, 0, 1, 1], // 9
]);

/**
 * The texture bytes: 7 wide (x = segment), 10 tall (y = digit), RGBA with the
 * pattern in red — the channel the shader reads, like every mask in this
 * codebase. Row `d` is digit `d`; the shader picks the row with one uniform.
 */
export function digitsTextureBytes() {
  const data = new Uint8Array(7 * 10 * 4);
  for (let digit = 0; digit < 10; digit++) {
    for (let segment = 0; segment < 7; segment++) {
      const i = (digit * 7 + segment) * 4;
      const on = DIGIT_SEGMENTS[digit][segment] ? 255 : 0;
      data[i + 0] = on;
      data[i + 1] = on;
      data[i + 2] = on;
      data[i + 3] = 255;
    }
  }
  return data;
}
