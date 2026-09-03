/**
 * Prove the wayfinding layer — routes, fords, signposts — headlessly:
 *
 *   npm run check-wayfinding
 *
 * Four families of check:
 *
 *  1. The pure rules: the screen-bearing arrow (the camera is fixed, so a
 *     world direction has exactly one screen direction — decision 16 is what
 *     makes a printed arrow honest), the plan's shape, and the ford numbers'
 *     derivation from `BANK_GRADIENT`. **Every guard was made to fail once**
 *     (the standing rule): a reversed arrow, a shrunk ford run and a post
 *     moved onto the trunk river were each shown to trip their check before
 *     this file settled.
 *
 *  2. The routes on the REAL height field, fords applied: dry where they
 *     should be dry, wet ONLY at the two trunk/pond crossings, never deeper
 *     than the drag-free splash (`Car.WATER.dragStartDepth`), and **smooth at
 *     boost speed** — the max height step between samples must stay under the
 *     trunk bank's own gradient, which is the smoothness bar Michael's
 *     deferred note set ("bumps in rivers for when we boost too fast").
 *
 *  3. The signpost sites: dry, flat, beside their roads, and clear of every
 *     artifact already standing — the landing's letters and tagline, the
 *     plaza floor, the contact arc, the corridor's road and dressing. The
 *     career post is checked in corridor coordinates: its first siting stood
 *     at s −1.75, side 1.07 — in the middle of the avenue — which is why
 *     `wayfindingPlan` has a `flip`.
 *
 *  4. The geometry contracts at `#yearunit=2` (the judging lever): the career
 *     gate moves with the scale, so the route, the post and the corridor's
 *     dressing are re-derived at 2 and re-checked for overlap. No terrain
 *     sweep at 2 on purpose: the fords follow the same flag at runtime, so a
 *     yearunit-2 world carves yearunit-2 fords — but this suite's Terrain is
 *     built at the shipped scale, and sweeping a 2-plan against a 4-terrain
 *     would test a world that cannot exist.
 *
 * Exits 1 on any mismatch.
 */
globalThis.self = globalThis;

const {
  wayfindingPlan,
  fordReliefAt,
  distanceToRoutes,
  distanceToSegment,
  distanceToPolyline,
  arrowFor,
  ARROWS,
  ROAD,
  FORD,
} = await import('../src/world/wayfindingPlan.js');
const { default: Terrain, heightAt, BANK_GRADIENT, WATER_SURFACE, SAMPLES, HALF, CELL } =
  await import('../src/world/Terrain.js');
const {
  buildTimeline,
  corridorPlan,
  corridorFrame,
  sOf,
  sideOf,
  LEAD_IN,
  SHIPPED_UNITS_PER_YEAR,
} = await import('../src/world/areas/careerTimeline.js');
const { plazaFloorRadius } = await import('../src/world/areas/ProjectsArea.js');
const { contactPlan } = await import('../src/world/areas/contactArc.js');
const { default: roles } = await import('../src/content/roles.js');
const { default: links } = await import('../src/content/links.js');
const { default: projects } = await import('../src/content/projects.js');
const { default: areaDefs } = await import('../src/content/areas.js');

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${label.padEnd(58)}${ok ? 'ok' : '<-- FAIL'}${detail ? `  ${detail}` : ''}`);
};

console.log('check-wayfinding: roads, fords and signposts, plan to ground\n');

/**
 * `Car.WATER.dragStartDepth`, restated: water shallower than this costs no
 * speed at all. The ford's entire physics promise is staying under it, and
 * importing `Car.js` here would drag Rapier into a geometry suite.
 */
const DRAG_FREE_DEPTH = 0.25;

// ------------------------------------------------------------- the arrows
console.log('arrowFor — screen bearings under the fixed camera:');
{
  // Up-screen is −TO_CAMERA = (−√½, −√½); screen-right is (√½, −√½).
  check('due up-screen is ↑', arrowFor([0, 0], [-1, -1]) === '↑');
  check('due down-screen is ↓', arrowFor([0, 0], [1, 1]) === '↓');
  check('screen-right is →', arrowFor([0, 0], [1, -1]) === '→');
  check('screen-left is ← (guard made to fail)', arrowFor([0, 0], [-1, 1]) === '←');
  check('world −X is ↖ (the career bearing from spawn)', arrowFor([0, 0], [-1, 0]) === '↖');
  check('world +Z is ↙', arrowFor([0, 0], [0, 1]) === '↙');
  check('eight arrows, all distinct', new Set(ARROWS).size === 8);
}

// ------------------------------------------------------------- the numbers
console.log('\nthe ford numbers, derived not chosen:');
{
  // The deepest bed a route crosses is the trunk (1.0) at its +15% variation.
  const worstBed = 1.0 * 1.15;
  const edgeGradient = ((worstBed - FORD.carveCap) * 1.5) / FORD.run;
  check(
    'the ford edge eases at or under the trunk bank gradient',
    edgeGradient <= BANK_GRADIENT + 1e-9,
    `${edgeGradient.toFixed(3)} against ${BANK_GRADIENT}`
  );
  check(
    'the ford floor keeps the splash drag-free',
    WATER_SURFACE - -(FORD.carveCap + FORD.blend / 4) < DRAG_FREE_DEPTH,
    `depth ${(FORD.carveCap + FORD.blend / 4 + WATER_SURFACE).toFixed(3)}`
  );
  check('relief is 1 on a road centreline', fordReliefAt(...wayfindingPlan().routes[1].samples[0]) === 1);
  // A point measurably past every route's reach (the routes stay in the
  // island's inhabited west and north; the south-east sea is not paved).
  check(
    'relief is 0 past the run (guard made to fail)',
    distanceToRoutes(55, -55) > ROAD.half + FORD.run && fordReliefAt(55, -55) === 0
  );
}

// ------------------------------------------------- the routes, on the ground
console.log('\nthe routes, against the real height field:');
{
  const plan = wayfindingPlan();
  check(
    'three routes, all curved and sampled (guard made to fail)',
    plan.routes.length === 3 &&
      plan.routes.every((r) => r.points.length === 3 && r.samples.length > r.points.length)
  );

  const expectWet = { 'landing-projects': false, 'landing-contact': true, 'contact-career': true };
  for (const route of plan.routes) {
    let minH = Infinity;
    let wet = 0;
    let maxStep = 0;
    const step = 0.75;
    // Walk the SAMPLED curve at fine steps, on the centreline and both
    // road edges — the lateral direction comes from each segment.
    for (const side of [-ROAD.half, 0, ROAD.half]) {
      let prev = null;
      for (let i = 0; i < route.samples.length - 1; i++) {
        const [ax, az] = route.samples[i];
        const [bx, bz] = route.samples[i + 1];
        const length = Math.hypot(bx - ax, bz - az);
        const px = (-(bz - az) / length) * side;
        const pz = ((bx - ax) / length) * side;
        for (let s = 0; s < length; s += step) {
          const x = ax + ((bx - ax) * s) / length + px;
          const z = az + ((bz - az) * s) / length + pz;
          const h = heightAt(x, z);
          minH = Math.min(minH, h);
          if (h <= WATER_SURFACE) wet++;
          // Gradient, not raw step: the sample spacing varies where the
          // curve's segments end, and a slope bound must not depend on it.
          if (prev !== null) {
            const run = Math.hypot(x - prev.x, z - prev.z);
            if (run > 1e-6) maxStep = Math.max(maxStep, (Math.abs(h - prev.h) / run) * step);
          }
          prev = { x, z, h };
        }
      }
    }

    check(
      `${route.id}: ${expectWet[route.id] ? 'fords its crossing' : 'dry the whole way'}`,
      expectWet[route.id] ? wet > 0 : wet === 0,
      `${wet} wet samples`
    );
    check(
      `${route.id}: never deeper than the drag-free splash`,
      WATER_SURFACE - minH < DRAG_FREE_DEPTH,
      `deepest ${minH.toFixed(3)}`
    );
    check(
      `${route.id}: smooth at boost speed (max step per ${step}u)`,
      maxStep <= BANK_GRADIENT * step * 1.05,
      `${maxStep.toFixed(3)} against ${(BANK_GRADIENT * step * 1.05).toFixed(3)}`
    );
  }
}

// --------------------------------------------------------------- the posts
console.log('\nthe signposts, against the ground and the districts:');
{
  const plan = wayfindingPlan();
  const defs = Object.fromEntries(areaDefs.map((def) => [def.id, def]));
  check('four posts: spawn and the three districts', plan.signposts.length === 4);
  check(
    'every post names every OTHER district exactly once',
    plan.signposts.every(
      (post) =>
        new Set(post.rows.map((r) => r.name)).size === post.rows.length &&
        !post.rows.some((r) => r.name === post.id) &&
        (post.id === 'spawn' ? post.rows.length === 3 : post.rows.length === 2)
    )
  );
  check(
    'every row carries a finite bearing and one of the eight arrows',
    plan.signposts.every((post) =>
      post.rows.every((r) => Number.isFinite(r.bearing) && ARROWS.includes(r.arrow))
    )
  );
  check(
    'each row\'s glyph is the quantised form of its bearing (guard made to fail)',
    plan.signposts.every((post) =>
      post.rows.every((r) => ARROWS[Math.round(r.bearing / (Math.PI / 4)) & 7] === r.arrow)
    )
  );
  check(
    'row labels are bare names — the arrow is a shape, not a glyph',
    plan.signposts.every((post) => post.rows.every((r) => r.label === r.name))
  );

  for (const post of plan.signposts) {
    const [x, z] = post.at;
    const h = heightAt(x, z);
    check(`${post.id} post stands on dry flat ground`, Math.abs(h) <= 0.05, `h ${h.toFixed(3)}`);
    const d = distanceToRoutes(x, z);
    check(`${post.id} post is beside its road, not on it`, d > ROAD.half + 0.4, d.toFixed(2));
  }

  // The landing's decals: the letters line and the tagline, as segments.
  const letters = [[-0.7, 8.1], [8.1, -0.7]];
  const tagline = [[2.6, 8.2], [8.2, 2.6]];
  const clearanceTo = (seg) => {
    let worst = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const x = seg[0][0] + (seg[1][0] - seg[0][0]) * t;
      const z = seg[0][1] + (seg[1][1] - seg[0][1]) * t;
      worst = Math.min(worst, distanceToRoutes(x, z));
    }
    return worst;
  };
  check('no road runs under the name letters', clearanceTo(letters) > ROAD.half + 1.0, clearanceTo(letters).toFixed(2));
  check('no road runs under the tagline', clearanceTo(tagline) > ROAD.half + 0.3, clearanceTo(tagline).toFixed(2));
  const spawnPost = plan.signposts[0].at;
  const dLetters = Math.min(
    ...[letters, tagline].map((seg) =>
      distanceToSegment(spawnPost[0], spawnPost[1], seg[0][0], seg[0][1], seg[1][0], seg[1][1])
    )
  );
  check('the spawn post stands clear of the decals', dLetters > 2.0, dLetters.toFixed(2));

  // The plaza: the road may run under the floor's rim; the post may not.
  const floorR = plazaFloorRadius(defs.projects, projects.length);
  const plazaPost = plan.signposts[1].at;
  const dPlaza = Math.hypot(plazaPost[0] - defs.projects.center[0], plazaPost[1] - defs.projects.center[1]);
  check('the plaza post stands off the plaza floor', dPlaza > floorR, `${dPlaza.toFixed(1)} against ${floorR.toFixed(1)}`);

  // The contact arc: cards and post keep their distance.
  const arc = contactPlan(defs.contact.center, links);
  const contactPost = plan.signposts[2].at;
  let worstCard = Infinity;
  let worstPost = Infinity;
  for (const card of arc.cards) {
    worstCard = Math.min(worstCard, distanceToRoutes(card.x, card.z));
    worstPost = Math.min(worstPost, Math.hypot(card.x - contactPost[0], card.z - contactPost[1]));
  }
  check('no road reaches the contact cards', worstCard > ROAD.half + 2, worstCard.toFixed(1));
  check('the contact post stands clear of the arc', worstPost > 3, worstPost.toFixed(1));
}

// ------------------------------------------------- the painted roads
console.log('\nthe painted roads, in the terrain texture (2 Sep — roads are');
console.log('ground-cover strips like the reference\x27s, not meshes):');
{
  const terrain = new Terrain();
  const image = terrain.texture().image;
  const channel = (x, z, c) => {
    const ix = Math.min(SAMPLES - 1, Math.max(0, Math.round((x + HALF) / CELL)));
    const iz = Math.min(SAMPLES - 1, Math.max(0, Math.round((z + HALF) / CELL)));
    return image.data[(iz * SAMPLES + ix) * 4 + c];
  };

  const plan = wayfindingPlan();
  for (const route of plan.routes) {
    const mid = route.samples[Math.floor(route.samples.length / 2)];
    check(
      `${route.id}: bare ground on the centreline (guard made to fail)`,
      channel(mid[0], mid[1], 1) < 0.1,
      channel(mid[0], mid[1], 1).toFixed(2)
    );
  }
  // [6, 14]: flat land between the landing and the pond, clear of every
  // route and channel — the first probe point sat on the north branch's
  // carved bank, where cover is legitimately zero.
  check('open land is grassy', channel(6, 14, 1) > 0.6, channel(6, 14, 1).toFixed(2));
  check('open land grows blades', channel(6, 14, 2) > 0.5, channel(6, 14, 2).toFixed(2));
  check('no blades through the landing decals', channel(4.2, 4.2, 2) < 0.05, channel(4.2, 4.2, 2).toFixed(2));
  const contactCenter = areaDefs.find((d) => d.id === 'contact').center;
  check('no blades in the contact arc', channel(contactCenter[0], contactCenter[1], 2) < 0.05);
  check('the deep sea is bare', channel(0, -70, 1) < 0.05, channel(0, -70, 1).toFixed(2));
}

// --------------------------- the corridor tee, shipped scale and the lever's
console.log('\nthe career tee, at the shipped scale and at #yearunit=2:');
for (const unitsPerYear of [SHIPPED_UNITS_PER_YEAR, 2]) {
  const plan = wayfindingPlan({ unitsPerYear });
  const defs = Object.fromEntries(areaDefs.map((def) => [def.id, def]));
  const timeline = buildTimeline(roles, { unitsPerYear });
  const cplan = corridorPlan(defs.career.center, timeline);
  const frame = corridorFrame(defs.career.center, timeline.spanUnits);
  const r3 = plan.routes[2].samples;
  const post = plan.signposts[3].at;

  const gate = r3[r3.length - 1];
  const gateS = sOf(frame, gate[0], gate[1]);
  check(
    `y${unitsPerYear}: the road tees into the corridor lead-in`,
    gateS < -LEAD_IN + 0.1 && Math.abs(sideOf(frame, gate[0], gate[1])) < 0.1,
    `s ${gateS.toFixed(2)}`
  );

  const postS = sOf(frame, post[0], post[1]);
  const postSide = sideOf(frame, post[0], post[1]);
  const onCorridorRoad = postS > -LEAD_IN - 1.4 && Math.abs(postSide) < ROAD.half + 0.4;
  check(
    `y${unitsPerYear}: the career post is off the avenue (guard made to fail)`,
    !onCorridorRoad,
    `s ${postS.toFixed(2)} side ${postSide.toFixed(2)}`
  );

  // The dressing with colliders or bulk: cart, barrels, streetlights.
  const dressing = [
    ['cart', cplan.cart, 2.7],
    ['barrel', cplan.barrels[0], 2.4],
    ['barrel', cplan.barrels[1], 2.4],
    ['streetlight', cplan.lights[0], 2.4],
    ['streetlight', cplan.lights[1], 2.4],
  ];
  for (const [what, at, clearance] of dressing) {
    const d = distanceToPolyline(at.x, at.z, r3);
    check(`y${unitsPerYear}: the road misses the ${what} at [${at.x.toFixed(0)}, ${at.z.toFixed(0)}]`, d > clearance, d.toFixed(2));
  }
  const dCartPost = Math.hypot(cplan.cart.x - post[0], cplan.cart.z - post[1]);
  check(`y${unitsPerYear}: the post and the cart keep their distance`, dCartPost > 2.5, dCartPost.toFixed(1));
}

console.log(`\ncheck-wayfinding: ${failed === 0 ? 'ok' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
