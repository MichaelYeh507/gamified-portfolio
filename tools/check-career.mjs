/**
 * Prove the career corridor's arithmetic and its site, headlessly:
 *
 *   dates → buildTimeline → corridorPlan → every point on dry, flat ground —
 *   against the REAL height field, the real roles data and the real area def,
 *   plus the timeline the data will become once Michael's dates land.
 *
 *   npm run check-career
 *
 * Three families of check:
 *
 *  1. The timeline rules (pure, no three.js): date parsing, missing-date
 *     synthesis, the skip rule for undated entries, span clamps, the slab
 *     slide/park math, and the 7-segment digit patterns. **Every guard is
 *     made to fail once** (the standing rule): garbage dates, an end before
 *     its start, an entry with nothing to stand on.
 *
 *  2. The site (three.js under node, the check-pipeline shim): the whole
 *     placement plan swept over `Terrain` — road, slab line, counter track,
 *     fence, streetlights, cart, barrels — for ground that is above the
 *     waterline and flat. Swept for the scaffolded data, for the realistic
 *     full-data future (a four-year degree plus the current role), and at
 *     `#yearunit=2`, the judging lever's range.
 *
 *  3. The island's geometry contracts: the career area must not overlap the
 *     projects area even when the plaza holds decision 21's eight entries —
 *     the constraint that forced the corridor to the west side.
 *
 * Exits 1 on any mismatch.
 */
globalThis.self = globalThis;

const {
  parseYearMonth,
  nowYearFraction,
  buildTimeline,
  corridorPlan,
  slabWidthFor,
  slabCenterFor,
  slabPlacements,
  counterTrackEnd,
  QUEUE_SEP,
  laneFor,
  yearsLabel,
  DIGIT_SEGMENTS,
  digitsTextureBytes,
  LEAD_IN,
  AXIS_HEADING,
  SHIPPED_UNITS_PER_YEAR,
  FENCE_SIDE,
  FENCE_STEP,
} = await import('../src/world/areas/careerTimeline.js');
const { default: roles } = await import('../src/content/roles.js');
const { default: areaDefs } = await import('../src/content/areas.js');

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${label.padEnd(58)}${ok ? 'ok' : '<-- FAIL'}${detail ? `  ${detail}` : ''}`);
};

console.log('check-career: the corridor, from the dates to the ground\n');

// --------------------------------------------------------------- parsing
console.log('parseYearMonth:');
check('"2025-03" is March 2025', Math.abs(parseYearMonth('2025-03') - (2025 + 2 / 12)) < 1e-9);
check('"2021" is January 2021', parseYearMonth('2021') === 2021);
check('"" is null', parseYearMonth('') === null);
check('garbage is null (guard made to fail)', parseYearMonth('20xx') === null);
check('month 13 is null (guard made to fail)', parseYearMonth('2025-13') === null);
check('non-string is null', parseYearMonth(null) === null);

// ------------------------------------------------------ the real data
console.log('\nbuildTimeline, over the real roles.js (dates landed 31 Aug):');
{
  const now = nowYearFraction();
  const t = buildTimeline(roles, { now });
  const cca = t.entries.find((e) => e.role.slug === 'cca');
  const cmu = t.entries.find((e) => e.role.slug === 'cmu');
  const ai = t.entries.find((e) => e.role.slug === 'cmu-ai');
  const knollwood = t.entries.find((e) => e.role.slug === 'knollwood');

  check('all four roles stand', t.entries.length === 4 && !!cca && !!cmu && !!ai && !!knollwood);
  check('no warnings — the dates are real now', t.warnings.length === 0, t.warnings[0] ?? '');
  check('the axis runs 2024 to the year after today', t.firstYear === 2024 && t.lastYear >= 2027);
  check('cca is the earliest, high school first', t.entries[0] === cca);
  check(
    'cmu, the AI major and knollwood are all current',
    cmu?.isCurrent && ai?.isCurrent && knollwood?.isCurrent
  );
  check(
    'school and work take different lanes',
    laneFor(cmu.role) !== laneFor(knollwood.role) && laneFor(ai.role) === laneFor(cmu.role)
  );
  check('knollwood label reads its real years', yearsLabel(knollwood) === '2026 – now', yearsLabel(knollwood));
  check('the AI major reads its own years', yearsLabel(ai) === '2025 – now', yearsLabel(ai));
  check('cca label closes in its own year', yearsLabel(cca) === '2024 – 2024', yearsLabel(cca));

  // The same-lane queue: two concurrent education entries must never rest or
  // park inside each other. Checked over the actual placements, per lane.
  const placements = slabPlacements(t);
  let queued = true;
  const byLane = new Map();
  for (const p of placements) {
    const prev = byLane.get(p.side);
    if (prev) {
      if (p.rest - prev.rest < QUEUE_SEP - 1e-9 || p.parked - prev.parked < QUEUE_SEP - 1e-9) {
        queued = false;
      }
    }
    byLane.set(p.side, p);
  }
  check('same-lane slabs keep their spacing at rest and parked', queued);

  // The counter's parking place shares the left band with the education
  // lane, so it must clear the last parked stone by the same spacing.
  const leftParked = placements.filter((p) => p.side < 0).map((p) => p.parked);
  const clearance = counterTrackEnd(t) - Math.max(...leftParked);
  check(
    'the counter parks clear of the education lane',
    clearance >= QUEUE_SEP - 1e-9,
    `clearance ${clearance.toFixed(2)}`
  );
}

// ------------------------------------------------------- the full rules
console.log('\nbuildTimeline, over fabricated histories:');
{
  const fab = (over = {}) => [
    { slug: 'school', org: 'S', title: 'BS', start: '2021-08', end: '2025-05', line: '', stack: [], kind: 'education' },
    { slug: 'job', org: 'J', title: 'Eng', start: '2025-03', end: null, line: '', stack: [] },
    ...(over.extra ?? []),
  ];
  const now = 2026 + 8 / 12;
  const t = buildTimeline(fab(), { now });

  check('entries sort by start date', t.entries[0].role.slug === 'school');
  check('firstYear floors the earliest start', t.firstYear === 2021);
  check('lastYear ceils the latest end', t.lastYear === 2027);
  check(
    'one year is one world unit',
    Math.abs(t.entries[0].size - (2025 + 4 / 12 - (2021 + 7 / 12))) < 1e-9,
    `size ${t.entries[0].size.toFixed(3)}`
  );
  check(
    's0 is years since the axis origin',
    Math.abs(t.entries[1].s0 - (2025 + 2 / 12 - 2021)) < 1e-9
  );

  const t2 = buildTimeline(fab(), { now, unitsPerYear: 2 });
  check('#yearunit scales every span', Math.abs(t2.entries[0].size - t.entries[0].size * 2) < 1e-9);

  const backwards = buildTimeline(
    [{ slug: 'bad', org: 'B', title: '', start: '2025', end: '2024', line: '', stack: [] }],
    { now }
  );
  check(
    'an end before its start is clamped and warned (guard made to fail)',
    backwards.entries[0].size > 0 && backwards.warnings.some((w) => w.includes('ends before'))
  );

  const endOnly = buildTimeline(
    [{ slug: 'endy', org: 'E', title: '', start: '', end: '2024', line: '', stack: [] }],
    { now }
  );
  check(
    "end-only entry stands a year before its end, synthesized",
    endOnly.entries.length === 1 && endOnly.entries[0].synthesizedStart &&
      Math.abs(endOnly.entries[0].startYear - 2023) < 1e-9
  );

  const undated = buildTimeline(
    [{ slug: 'ghost', org: 'G', title: '', start: '', end: '', line: '', stack: [] }],
    { now }
  );
  check(
    'an entry with no dates is skipped and warned (guard made to fail)',
    undated.entries.length === 0 && undated.warnings.some((w) => w.includes('ghost'))
  );
}

// ------------------------------------------------------- the slide math
console.log('\nthe slab slide (the reference\x27s offsetTarget, D §4.4):');
{
  check('short entries get the minimum readable slab', slabWidthFor(0.5) === 2.4);
  check('long entries cap at the full slab', slabWidthFor(10) === 3.4);
  const size = 6;
  const w = slabWidthFor(size);
  check('before arrival the slab rests at its start', slabCenterFor(-3, size, w) === w / 2);
  check(
    'mid-entry the slab rides beside the car',
    Math.abs(slabCenterFor(3, size, w) - 3) < 1e-9
  );
  check('past the end the slab parks', slabCenterFor(100, size, w) === size - w / 2);
  // Two consecutive entries sharing a boundary year: parked slab and rising
  // slab touch, never interpenetrate.
  const prevParked = 0 + slabCenterFor(100, size, w); // s of prev centre at its end
  const nextRest = size + slabWidthFor(size) / 2; // next entry starts at s=size
  check(
    'adjacent slabs touch, never overlap',
    nextRest - prevParked >= w - 1e-9,
    `gap ${(nextRest - prevParked).toFixed(2)} against width ${w}`
  );
}

// --------------------------------------------------------- the counter
console.log('\nthe 7-segment patterns:');
{
  const on = (d) => DIGIT_SEGMENTS[d].reduce((a, b) => a + b, 0);
  check('ten digits', DIGIT_SEGMENTS.length === 10);
  check('8 lights every segment', on(8) === 7);
  check('1 lights two', on(1) === 2);
  check('0 lights all but the middle', on(0) === 6 && DIGIT_SEGMENTS[0][6] === 0);
  const bytes = digitsTextureBytes();
  check('texture is 7×10 RGBA', bytes.length === 7 * 10 * 4);
  const at = (digit, seg) => bytes[(digit * 7 + seg) * 4] === 255;
  check(
    'bytes match the patterns',
    DIGIT_SEGMENTS.every((row, d) => row.every((bit, s) => at(d, s) === !!bit))
  );
}

// ------------------------------------------------------------- the site
console.log('\nthe site, against the real height field:');
const { default: Terrain, WATER_SURFACE } = await import('../src/world/Terrain.js');
const terrain = new Terrain();
const career = areaDefs.find((d) => d.id === 'career');
check('the career def exists', !!career);
check('the def heading drives up the years', career && career.heading === AXIS_HEADING);

const sweep = (label, rolesData, unitsPerYear = 1) => {
  const t = buildTimeline(rolesData, { unitsPerYear });
  const plan = corridorPlan(career.center, t);
  const wet = [];
  const unflat = [];
  for (const p of plan.points) {
    const h = terrain.heightAt(p.x, p.z);
    if (h <= WATER_SURFACE + 0.15) wet.push(p);
    else if (Math.abs(h) > 0.05) unflat.push(p);
  }
  const worst = wet[0] ?? unflat[0];
  check(
    label,
    wet.length === 0 && unflat.length === 0,
    worst
      ? `${wet.length} wet / ${unflat.length} unflat, first: ${worst.what} at ` +
        `[${worst.x.toFixed(1)}, ${worst.z.toFixed(1)}]`
      : `${plan.points.length} points dry and flat`
  );
  return { t, plan };
};

// The real data at the shipped scale — the corridor as it actually builds —
// plus the judging lever's sensible range. 5 units/yr runs the road into the
// beach, which is why SHIPPED_UNITS_PER_YEAR stops at 4; a sweep here is what
// says so if that is ever revisited.
const { t: tShipped } = sweep(
  `the real corridor stands on dry flat ground (${SHIPPED_UNITS_PER_YEAR} units/yr)`,
  roles,
  SHIPPED_UNITS_PER_YEAR
);
sweep('the corridor still fits at #yearunit=2', roles, 2);
sweep('…and at #yearunit=1, the flag floor', roles, 1);

// ------------------------------------------- the dressing, as bodies
// Since 2 Sep the fence, cart and barrels are dynamic bodies (world/props.js,
// the reference's mass-0.1 description), and two bodies born inside each other shove
// apart the moment the area builds — the fence dominoed with the car 160
// units away (Michael: "it was already knocked over"). The extents below are
// measured off the shipped GLBs on the running build; a repacked prop that
// grows must update them here.
console.log('\nthe dressing, as bodies (no two born overlapping):');
{
  const FENCE = { length: 4.48, thickness: 0.5 };
  const CART_ACROSS = 1.41; // parked parallel to the lane: its x half-extent
  const BARREL_RADIUS = 0.47;
  const fenceNear = FENCE_SIDE - FENCE.thickness / 2;

  check(
    'fence panels stand end to end, not through each other (guard made to fail)',
    FENCE_STEP > FENCE.length,
    `step ${FENCE_STEP} against a ${FENCE.length} panel`
  );
  for (const unitsPerYear of [SHIPPED_UNITS_PER_YEAR, 2]) {
    const t = buildTimeline(roles, { unitsPerYear });
    const plan = corridorPlan(career.center, t);
    const lastPanel = plan.fence[plan.fence.length - 1];
    check(
      `y${unitsPerYear}: the cart parks clear of the fence line`,
      plan.cart.side + CART_ACROSS < fenceNear,
      `${(plan.cart.side + CART_ACROSS).toFixed(2)} against ${fenceNear.toFixed(2)}`
    );
    check(
      `y${unitsPerYear}: both barrels stand clear of the fence line`,
      plan.barrels.every((b) => b.side + BARREL_RADIUS < fenceNear)
    );
    check(
      `y${unitsPerYear}: the fence ends before the second barrel`,
      lastPanel.s + FENCE.length / 2 < plan.barrels[1].s - BARREL_RADIUS,
      `panel end ${(lastPanel.s + FENCE.length / 2).toFixed(2)} against ${(plan.barrels[1].s - BARREL_RADIUS).toFixed(2)}`
    );
  }
}

// ------------------------------------------------- the island contracts
console.log('\nthe island contracts:');
{
  const { plazaReach } = await import('../src/world/areas/ProjectsArea.js');
  const projects = areaDefs.find((d) => d.id === 'projects');
  // ProjectsArea: radius = reach + STANDING_ROOM (14), at decision 21's eight.
  const projectsRadiusAt8 = plazaReach(projects.center, 8) + 14;
  const careerRadius = Math.max(18, tShipped.spanUnits / 2 + LEAD_IN + 10);
  const distance = Math.hypot(
    projects.center[0] - career.center[0],
    projects.center[1] - career.center[1]
  );
  check(
    'career clears the eight-project plaza (areas must not overlap)',
    distance > projectsRadiusAt8 + careerRadius,
    `${distance.toFixed(1)} against ${(projectsRadiusAt8 + careerRadius).toFixed(1)}`
  );
}

console.log('');
if (failed) {
  console.error(`check-career: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('check-career: ok');
