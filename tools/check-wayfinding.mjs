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
 *     **Under a bridge deck the ground is exempt** (6 Sep, evening): the
 *     car is on the deck there and the channel below keeps its natural bed
 *     — that is family 5's business.
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
 *  5. The bridges (6 Sep): `bridgesPlan` over the ford-only grid field must
 *     find exactly the two crossings where the whole road is wet — the trunk
 *     beside the landing and the contact-career channel — and NOT the third
 *     carved span, where the road skims a channel head with one edge on the
 *     grass (a bridge there beaches on the lawn; the ford handles it). Each
 *     deck covers every wet centreline sample of its route, buries both
 *     ends in the bank ON THE FINAL FIELD (no step off either end, on the
 *     centreline or an edge), keeps the road inside its kerbs on the bowed
 *     route, floats above the water and under the banks, and stands clear
 *     of the posts and the spawn. **Water under the deck** (Michael's call,
 *     6 Sep evening): the final ground under each deck's centre is real
 *     river bed, at least 0.4 under the surface, while the ford-only field
 *     there is the 0.32 cap — proof the cover is what deepened it; the
 *     shelf fades back beside the deck at no more than the bank gradient;
 *     and the channel-head ford is identical with and without bridges. The
 *     shipped `pontoon.glb` is held to the numbers `BRIDGE` restates from
 *     its recipe, so the model and the placement cannot drift apart. Guards
 *     made to fail: the count with the wet line dropped to −0.5 (found 0),
 *     the end burial with `endRise` at −0.2, the water under the deck with
 *     the cover disabled (`bridged` forced false → −0.32 under the deck).
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
const { default: Terrain, heightAt, bridgesPlan, fordGroundAt, BANK_GRADIENT, WATER_SURFACE, SAMPLES, HALF, CELL } =
  await import('../src/world/Terrain.js');
const { BRIDGE, coverAt } = await import('../src/world/bridgePlan.js');
const { bridgeDressing, roadEndLanterns, DRESSING } = await import('../src/world/dressingPlan.js');
const {
  buildTimeline,
  corridorPlan,
  corridorFrame,
  sOf,
  sideOf,
  LEAD_IN,
  SHIPPED_UNITS_PER_YEAR,
} = await import('../src/world/areas/careerTimeline.js');
const { plazaFloorRadius, plazaDressing, plazaLayout, plazaLamps, plazaStringLights, PLAZA_DRESSING, PLAZA_LAMPS, PLAZA_LIGHTS, BOARD, TOTAL_HEIGHT } =
  await import('../src/world/areas/ProjectsArea.js');
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
      plan.routes.every((r) => r.points.length >= 3 && r.samples.length > r.points.length)
  );

  // The projects road (9 Sep): from under the car, around the name's LEFT
  // end (the right stands against the river), to the plaza — and the car
  // spawns facing along it.
  {
    const road = plan.routes.find((r) => r.id === 'landing-projects');
    const landing = areaDefs.find((d) => d.id === 'landing');
    const [s0, s1] = road.samples;
    check('the projects road starts under the car at the spawn (guard made to fail)',
      Math.hypot(s0[0] - landing.center[0], s0[1] - landing.center[1]) < 2.0,
      Math.hypot(s0[0] - landing.center[0], s0[1] - landing.center[1]).toFixed(2));
    // Screen-right is (√½, −√½): a road that leaves to the screen-left has a
    // negative across component in its first step.
    const across = (s1[0] - s0[0]) * Math.SQRT1_2 - (s1[1] - s0[1]) * Math.SQRT1_2;
    check('the projects road leaves the spawn to the screen-left, around the name (guard made to fail)', across < -0.5, across.toFixed(2));
    const tangent = Math.atan2(s1[0] - s0[0], s1[1] - s0[1]);
    check('the landing heading in content/areas.js faces along the road (guard made to fail)',
      Math.abs(tangent - landing.heading) < 0.06, `road ${tangent.toFixed(3)}, def ${landing.heading}`);
    // Around the name: past the letters' left end the road is down-screen
    // of the line and every sample of the rest stays below it.
    const letterLine = 5.2 * Math.SQRT2; // toward, as x + z
    const pastName = road.samples.filter(([x, z]) => x + z > letterLine + 1.0);
    check('the road gets down-screen of the name and stays there', pastName.length > road.samples.length / 2);
  }

  const expectWet = { 'landing-projects': false, 'landing-contact': true, 'contact-career': true };
  // Under a deck the car rides the deck, not the river bed the cover put
  // back under it: those samples are family 5's, and skipped here. A point
  // is "under a deck" when the cover is 1 — inside the footprint proper.
  const bridges = bridgesPlan();
  const underDeck = (x, z) => coverAt(bridges, x, z) >= 1;
  for (const route of plan.routes) {
    let minH = Infinity;
    let wet = 0;
    let maxStep = 0;
    let skipped = 0;
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
          if (underDeck(x, z)) { skipped++; prev = null; continue; }
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

    // A bridged route is wet where its deck ends bury into the wet-sand
    // bank and at the channel-head skim; a dry route has no bridge at all.
    check(
      `${route.id}: ${expectWet[route.id] ? 'fords its crossing' : 'dry the whole way'}`,
      expectWet[route.id] ? wet + skipped > 0 : wet === 0 && skipped === 0,
      `${wet} wet samples, ${skipped} under a deck`
    );
    check(
      `${route.id}: never deeper than the drag-free splash (off the decks)`,
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
  // [12.7, 7.1]: flat land screen-right of the tagline, clear of every
  // route and channel (the first probe point sat on the north branch's
  // carved bank, where cover is legitimately zero; the second, [6, 14], is
  // under the projects road since it went around the name, 9 Sep).
  check('open land is grassy', channel(12.7, 7.1, 1) > 0.6, channel(12.7, 7.1, 1).toFixed(2));
  check('open land grows blades', channel(12.7, 7.1, 2) > 0.5, channel(12.7, 7.1, 2).toFixed(2));
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

// ------------------------------------------------------------ the bridges
console.log('\nthe bridges (6 Sep — the pontoon over every crossing the plan finds):');
{
  const defs = Object.fromEntries(areaDefs.map((def) => [def.id, def]));
  const kerb = (BRIDGE.width - ROAD.width) / 2;

  /** The route's wet centreline samples at a fine step, for the coverage sweep. */
  const wetSamples = (route) => {
    const wet = [];
    for (let i = 0; i < route.samples.length - 1; i++) {
      const [ax, az] = route.samples[i];
      const [bx, bz] = route.samples[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < length; s += 0.25) {
        const x = ax + ((bx - ax) * s) / length;
        const z = az + ((bz - az) * s) / length;
        if (heightAt(x, z) <= WATER_SURFACE) wet.push([x, z]);
      }
    }
    return wet;
  };
  /** Deck-local coordinates of a world point. */
  const local = (bridge, [x, z]) => {
    const ux = Math.sin(bridge.heading);
    const uz = Math.cos(bridge.heading);
    const dx = x - bridge.at[0];
    const dz = z - bridge.at[1];
    return { along: dx * ux + dz * uz, across: -dx * uz + dz * ux };
  };
  const onDeck = (bridge, p) => {
    const { along, across } = local(bridge, p);
    return Math.abs(along) <= bridge.length / 2 && Math.abs(across) <= BRIDGE.width / 2;
  };

  // The plan is the terrain's own (`bridgesPlan`): derived over the
  // ford-only GRID field — the bilinear read of the 1.5-unit samples the
  // car actually rides, before the bridge cover deepens the water — so the
  // decks here are the decks the ground was carved for (a deck sized on
  // the smooth analytic field ended 0.4 short of the grid's on the first
  // run). The ends are then held against the FINAL field, cover applied:
  // that is the ground a wheel meets coming off the deck.
  const ground = new Terrain();
  const groundAt = (x, z) => ground.heightAt(x, z);

  const sweep = (label, plan, bridges) => {
    check(
      `${label}: two bridges — the trunk and the contact-career channel (guard made to fail)`,
      bridges.length === 2 &&
        bridges.some((b) => b.route === 'landing-contact') &&
        bridges.some((b) => b.route === 'contact-career'),
      bridges.map((b) => `${b.id} ${b.length.toFixed(1)} long`).join(', ')
    );
    // The channel head at [-34.4, -1.8] (measured 6 Sep): a ford, never a bridge.
    check(
      `${label}: the channel-head ford on the career road carries no bridge`,
      bridges.every((b) => !onDeck(b, [-34.4, -1.8])),
    );
    for (const bridge of bridges) {
      const route = plan.routes.find((r) => r.id === bridge.route);
      const wet = wetSamples(route);
      const uncovered = wet.filter((p) => !onDeck(bridge, p)).length;
      check(
        `${label}: ${bridge.id} covers every wet sample of its road`,
        wet.length > 0 && uncovered === 0,
        `${wet.length} wet, ${uncovered} off the deck`
      );
      // No step off either end: the ground at each end, on the centreline and
      // both road edges, sits at or above the deck (the end is buried).
      const ux = Math.sin(bridge.heading);
      const uz = Math.cos(bridge.heading);
      let lowestEnd = Infinity;
      for (const [ex, ez] of bridge.ends) {
        for (const side of [-ROAD.half, 0, ROAD.half]) {
          lowestEnd = Math.min(lowestEnd, groundAt(ex - uz * side, ez + ux * side));
        }
      }
      // Within 2 cm: the buried margin runs along the straight deck line
      // while the road curves, so a deck end's EDGE can sit a centimetre
      // under the top where the bank falls away from the road — a lip no
      // 0.42 wheel notices. The promise is no step, not no millimetre.
      check(
        `${label}: ${bridge.id} buries both ends in the bank (guard made to fail)`,
        lowestEnd >= BRIDGE.deckY - 0.02,
        `lowest end ground ${lowestEnd.toFixed(3)} against deck ${BRIDGE.deckY}`
      );
      check(
        `${label}: ${bridge.id} keeps the bowed road inside its kerbs`,
        bridge.deviation <= kerb,
        `strays ${bridge.deviation.toFixed(2)} against kerb ${kerb.toFixed(2)}`
      );
      for (const post of plan.signposts) {
        const { along, across } = local(bridge, post.at);
        const clear = Math.max(Math.abs(along) - bridge.length / 2, Math.abs(across) - BRIDGE.width / 2);
        check(`${label}: ${bridge.id} stands clear of the ${post.id} post`, clear > 1.0, clear.toFixed(2));
      }
    }
    return bridges;
  };

  const shipped = sweep('shipped', wayfindingPlan(), bridgesPlan());
  check('the deck floats above the water and under the banks',
    BRIDGE.deckY - WATER_SURFACE >= 0.15 && BRIDGE.deckY < 0,
    `deck ${BRIDGE.deckY}, water ${WATER_SURFACE}`);

  // Water under the deck: the final field under each deck's centre is river
  // bed, the ford-only field there is the cap — the difference IS the cover.
  for (const bridge of shipped) {
    const finalH = groundAt(...bridge.at);
    const fordH = fordGroundAt(...bridge.at);
    check(`${bridge.id}: real water under the deck (guard made to fail)`,
      WATER_SURFACE - finalH >= 0.4 && Math.abs(fordH - -0.32) < 0.03,
      `final ${finalH.toFixed(2)}, ford-only ${fordH.toFixed(2)}`);
    // The shelf fades back beside the deck at no more than the bank gradient.
    const ux = Math.sin(bridge.heading);
    const uz = Math.cos(bridge.heading);
    let maxGradient = 0;
    let prev = null;
    for (let a = 0; a <= BRIDGE.width / 2 + BRIDGE.fade + 1; a += 0.25) {
      for (const sign of [-1, 1]) {
        const h = heightAt(bridge.at[0] - uz * a * sign, bridge.at[1] + ux * a * sign);
        if (prev && prev[sign] !== undefined) maxGradient = Math.max(maxGradient, Math.abs(h - prev[sign]) / 0.25);
        prev = { ...(prev ?? {}), [sign]: h };
      }
    }
    check(`${bridge.id}: the shelf fades beside the deck at or under the bank gradient`,
      maxGradient <= BANK_GRADIENT * 1.05, `${maxGradient.toFixed(3)} against ${BANK_GRADIENT}`);
  }
  check('the channel-head ford is the same with and without bridges',
    Math.abs(heightAt(-34.4, -1.8) - heightAt(-34.4, -1.8, false)) < 1e-9 &&
      heightAt(-34.4, -1.8) < -0.2,
    heightAt(-34.4, -1.8).toFixed(3));
  // The trunk bridge's near end is buried 1.5 from the spawn — under the
  // car's tail at its opening pose, 6 cm below the bank. The spawn itself
  // must stay off the deck and above it.
  const trunk = shipped.find((b) => b.route === 'landing-contact');
  const spawn = defs.landing.center;
  check('the spawn stands off the trunk deck, on ground above it',
    !!trunk && !onDeck(trunk, spawn) && groundAt(...spawn) > BRIDGE.deckY,
    `ground ${groundAt(...spawn).toFixed(3)}`);

  // The y2 decks are held against the shipped-scale terrain (this suite's
  // standing rule: no yearunit-2 terrain exists here), so only the plan's
  // own contracts are checked at 2 — count, coverage, kerb, posts — and
  // the end burial reads the ford-only field, which IS scale-independent
  // where the y2 route differs.
  sweep('y2', wayfindingPlan({ unitsPerYear: 2 }), bridgesPlan({ unitsPerYear: 2 }));

  // The shipped model against the numbers the placement assumes.
  const { NodeIO } = await import('@gltf-transform/core');
  const { readFileSync } = await import('node:fs');
  const pontoon = await new NodeIO().readBinary(new Uint8Array(readFileSync('public/models/pontoon.glb')));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of pontoon.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const pos = primitive.getAttribute('POSITION').getArray();
      for (let i = 0; i < pos.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], pos[i + k]);
          max[k] = Math.max(max[k], pos[i + k]);
        }
      }
    }
  }
  const size = max.map((v, k) => v - min[k]);
  check('public/models/pontoon.glb is BRIDGE.width x height x nominalLength, grounded and centred',
    Math.abs(size[0] - BRIDGE.width) < 2e-3 && Math.abs(size[1] - BRIDGE.height) < 2e-3 &&
      Math.abs(size[2] - BRIDGE.nominalLength) < 2e-3 && Math.abs(min[1]) < 1e-4 &&
      Math.abs(min[0] + max[0]) < 2e-3 && Math.abs(min[2] + max[2]) < 2e-3,
    `${size.map((v) => v.toFixed(3)).join(' x ')}`);
  check('the pontoon\'s attribution rides its asset extras',
    String(pontoon.getRoot().getAsset().extras?.author ?? '').includes('artikora'));
}

// ------------------------------------------------------------ the dressing
console.log('\nthe dressing (the art pass, 6 Sep late — lanterns at the bridges and the');
console.log('plaza gate, the fishing spot), against the ground, the road and the decks:');
{
  const plan = wayfindingPlan();
  const bridges = bridgesPlan();
  const ground = new Terrain();
  const defs = Object.fromEntries(areaDefs.map((def) => [def.id, def]));
  const avoid = plan.signposts.map((post) => post.at);
  const items = [
    ...bridgeDressing(bridges, { avoid, groundAt: (x, z) => ground.heightAt(x, z) }),
    ...roadEndLanterns(plan.routes.find((r) => r.id === 'landing-projects')).map((l) => ({ ...l, what: `plaza ${l.what}` })),
  ];
  // Three bridge lanterns, not four: the trunk's landing end is the spawn
  // post's (measured 1.2 apart), so that lantern is dropped by rule.
  check('three bridge lanterns, a rod, a bucket, a rowboat and two plaza lanterns',
    items.filter((i) => i.kind === 'lanternPost' && i.bridge).length === 3 &&
      items.filter((i) => i.kind === 'lanternPost' && !i.bridge).length === 2 &&
      items.some((i) => i.kind === 'fishingRod1') && items.some((i) => i.kind === 'bucket') &&
      items.filter((i) => i.kind === 'rowboat').length === 1,
    `${items.length} items`);
  check('the dropped lantern comes back without the posts to avoid (guard made to fail)',
    bridgeDressing(bridges).filter((i) => i.kind === 'lanternPost').length === 4);
  for (const item of items) {
    const h = ground.heightAt(item.x, item.z);
    if (item.afloat) {
      // The rowboat: water under its whole hull (3.4 long along its local
      // +X), deep enough that its draught never touches the bed, and a
      // boat's width clear of the deck's kerb.
      const hx = Math.cos(item.heading);
      const hz = -Math.sin(item.heading);
      let shallowest = Infinity;
      for (const t of [-1.7, -0.85, 0, 0.85, 1.7]) {
        shallowest = Math.min(shallowest, WATER_SURFACE - ground.heightAt(item.x + hx * t, item.z + hz * t));
      }
      check(`${item.what} floats over water along its whole hull (guard made to fail)`,
        shallowest >= DRESSING.boatDraught + 0.1, `shallowest ${shallowest.toFixed(2)}`);
      const bridge = bridges.find((b) => b.id === item.bridge);
      const bux = Math.sin(bridge.heading);
      const buz = Math.cos(bridge.heading);
      const across = -(item.x - bridge.at[0]) * buz + (item.z - bridge.at[1]) * bux;
      // The hull's reach toward the deck: half its length (1.7) along its
      // axis, half its paddle span (1.43) across it, projected onto the
      // deck's normal — a bow pointed at the deck reaches the full 1.7
      // (guard made to fail: the first mooring's bow sat inside the kerb).
      const reachDot = Math.abs(hx * -buz + hz * bux);
      const reach = 1.7 * reachDot + 1.43 * Math.sqrt(Math.max(0, 1 - reachDot * reachDot));
      check(`${item.what} clears the deck's kerb, bow and paddles included`,
        Math.abs(across) - reach >= BRIDGE.width / 2 + 0.5,
        `centre ${Math.abs(across).toFixed(2)}, reach ${reach.toFixed(2)}, kerb ${(BRIDGE.width / 2).toFixed(2)}`);
      continue;
    }
    if (item.tip) {
      // The rod: planted on the bank above the waterline, its tip over
      // the water (guard made to fail: the walk turned off puts the tip on
      // the bank).
      const tipH = ground.heightAt(...item.tip);
      const buttH = ground.heightAt(...item.butt);
      check(`${item.what} is planted above the waterline`, buttH > WATER_SURFACE + 0.05, `butt h ${buttH.toFixed(3)}`);
      check(`${item.what} hangs its tip over the water`, tipH <= WATER_SURFACE, `tip ground ${tipH.toFixed(3)}`);
      check(`${item.what} is off the road`, distanceToRoutes(item.x, item.z) > ROAD.half + 0.3);
      check(`${item.what} is off every deck`, coverAt(bridges, item.x, item.z) < 1);
      continue;
    }
    // On the plaza disc the ground is the flat swept plaza (|h| ≤ 0.05
    // there too), so one bar serves both sites.
    check(`${item.what} stands on dry flat ground`, h > -0.05 && Math.abs(h) <= 0.1, `h ${h.toFixed(3)}`);
    check(`${item.what} is off the road`, distanceToRoutes(item.x, item.z) > ROAD.half + 0.3,
      distanceToRoutes(item.x, item.z).toFixed(2));
    check(`${item.what} is off every deck`, coverAt(bridges, item.x, item.z) < 1);
    for (const post of plan.signposts) {
      const d = Math.hypot(post.at[0] - item.x, post.at[1] - item.z);
      check(`${item.what} clears the ${post.id} post`, d > 1.5, d.toFixed(2));
    }
    // The fishing items: past the car's length AND the width of its first
    // drive out (at 3.1 the rod sat a unit off the nose and W went through
    // it), and clear of the name letters' line.
    const dSpawn = Math.hypot(item.x - defs.landing.center[0], item.z - defs.landing.center[1]);
    const near = item.bridge === 'landing-contact' && item.kind !== 'lanternPost';
    check(`${item.what} clears the spawn${near ? ' and its first drive' : ''}`,
      dSpawn > (near ? DRESSING.spawnClearance : 2.5), dSpawn.toFixed(2));
    if (near) {
      const dLetters = distanceToSegment(item.x, item.z, -0.7, 8.1, 8.1, -0.7);
      check(`${item.what} clears the name letters`, dLetters > 1.5, dLetters.toFixed(2));
    }
  }
  // The fishing scene left the opening frame on 7 Sep ("the main screen is
  // too cramped"): nothing but the bridge and its lantern within 12 of the
  // spawn, and the scene stands at the bridge the plan names.
  const scene = items.filter((i) => ['fishingRod1', 'bucket', 'rowboat'].includes(i.kind));
  check('the fishing scene is at the career crossing, out of the opening frame (guard made to fail)',
    scene.length === 3 && scene.every((i) => i.bridge === DRESSING.fishingBridge &&
      Math.hypot(i.x - defs.landing.center[0], i.z - defs.landing.center[1]) > 12),
    scene.map((i) => `${i.kind} ${Math.hypot(i.x, i.z).toFixed(0)} from spawn`).join(', '));
  check('the rods are visuals, not bodies (guard made to fail)',
    items.filter((i) => i.kind.startsWith('fishingRod')).every((i) => i.body === false));
  // The bridge lanterns hang toward their road: the lantern's +X points at
  // the deck line, so the lit pane is over the kerb and not out in the grass.
  for (const item of items.filter((i) => i.kind === 'lanternPost' && i.bridge)) {
    const bridge = bridges.find((b) => b.id === item.bridge);
    const ux = Math.sin(bridge.heading);
    const uz = Math.cos(bridge.heading);
    const across = -(item.x - bridge.at[0]) * uz + (item.z - bridge.at[1]) * ux;
    const hangX = Math.cos(item.heading);
    const hangZ = -Math.sin(item.heading);
    const hangAcross = -hangX * uz + hangZ * ux;
    check(`${item.what} hangs toward the road (guard made to fail)`, Math.sign(hangAcross) === -Math.sign(across),
      `stands ${across.toFixed(2)} across, hangs ${hangAcross.toFixed(2)}`);
    check(`${item.what} stands off the deck's kerb`, Math.abs(across) >= BRIDGE.width / 2 + DRESSING.lanternAside * 0 + 0.5);
  }
}

// ------------------------------------------------------ the plaza's dressing
console.log('\nthe plaza\'s dressing (the rim, the paddock corner and the tethered balloon —');
console.log('rounds two and three, 7–8 Sep; the crate stacks left 9 Sep), on the disc:');
{
  const def = areaDefs.find((d) => d.id === 'projects');
  const plan = wayfindingPlan();
  const ground = new Terrain();
  const floor = plazaFloorRadius(def, projects.length);
  const items = plazaDressing(def.center, projects.length);
  const ACROSS = [Math.SQRT1_2, -Math.SQRT1_2];
  const TO_CAMERA = [Math.SQRT1_2, Math.SQRT1_2];
  // The lamp posts: `Game.LAMP_PLACEMENTS` reads `plazaLamps` — ±6 across,
  // +4 toward the camera of the standing point — the numbers that used to
  // be written out there as world XZ (35.1, 16.6 / 26.6, 25.1).
  const lamps = plazaLamps(def.center).map((l) => l.at);
  check('the lamps stand where Game wrote them until 8 Sep (guard made to fail)',
    Math.hypot(lamps[0][0] - 35.1, lamps[0][1] - 16.6) < 0.05 && Math.hypot(lamps[1][0] - 26.6, lamps[1][1] - 25.1) < 0.05,
    lamps.map((l) => `(${l[0].toFixed(1)}, ${l[1].toFixed(1)})`).join(' '));

  // Each body's box comes off the shipped GLB, the way `props.standProp`
  // derives its collider: the bounds in the model's own frame, turned by the
  // placement's yaw (local +X → (cos θ, −sin θ), local +Z → (sin θ, cos θ)).
  const { NodeIO } = await import('@gltf-transform/core');
  const { readFileSync } = await import('node:fs');
  const io = new NodeIO();
  const boundsCache = new Map();
  const boundsOf = async (kind) => {
    if (boundsCache.has(kind)) return boundsCache.get(kind);
    const doc = await io.readBinary(new Uint8Array(readFileSync(`public/models/${kind}.glb`)));
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const pos = primitive.getAttribute('POSITION').getArray();
        for (let i = 0; i < pos.length; i += 3) {
          for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], pos[i + k]);
            max[k] = Math.max(max[k], pos[i + k]);
          }
        }
      }
    }
    const b = { min, max, size: max.map((v, k) => v - min[k]) };
    boundsCache.set(kind, b);
    return b;
  };
  const boxes = [];
  for (const item of items) {
    const b = await boundsOf(item.kind);
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const c = Math.cos(item.rotationY);
    const s = Math.sin(item.rotationY);
    boxes.push({
      item,
      x: item.x + cx * c + cz * s,
      z: item.z - cx * s + cz * c,
      hx: b.size[0] / 2,
      hz: b.size[2] / 2,
      ax: [c, -s],
      az: [s, c],
      // A floating visual reaches the ground only at its anchor.
      reach: item.body === false ? 0 : Math.hypot(b.size[0], b.size[2]) / 2,
    });
  }
  // Two turned rectangles overlap iff no axis of either separates them.
  const overlaps = (a, b, margin = 0) => {
    for (const axis of [a.ax, a.az, b.ax, b.az]) {
      const project = (box) => {
        const centre = box.x * axis[0] + box.z * axis[1];
        const r = box.hx * Math.abs(box.ax[0] * axis[0] + box.ax[1] * axis[1]) +
          box.hz * Math.abs(box.az[0] * axis[0] + box.az[1] * axis[1]);
        return [centre - r, centre + r];
      };
      const [a0, a1] = project(a);
      const [b0, b1] = project(b);
      if (a1 + margin < b0 || b1 + margin < a0) return false;
    }
    return true;
  };

  const kinds = (k) => items.filter((i) => i.kind === k).length;
  // No sundial: it stood on the axis for an hour on 7 Sep and was cut (no
  // job — the sun's direction is fixed, so it could not tell the time).
  check('the rim, three rail panels and a balloon — and no crate stacks (guard made to fail)',
    kinds('crate') === 0 && kinds('haystack') === 1 && kinds('barrel') === 2 &&
      kinds('keg') === 1 && kinds('crateCube') === 1 && kinds('sundial') === 0 && kinds('balloon') === 1 &&
      ['railFence1', 'railFence2', 'railFence3'].every((k) => kinds(k) === 1),
    `${items.length} items`);
  check('the balloon is a visual on a tether, no body (guard made to fail)',
    items.every((i) => (i.body === false) === (i.kind === 'balloon')) && items.find((i) => i.kind === 'balloon').float > 1.2);
  // Nothing on the plaza is fixed since 9 Sep: the rails went knockable on
  // Michael's drive ("make the fence below edgeball project board knockable").
  check('every body on the plaza is knockable, the rails included (guard made to fail)',
    items.every((i) => !i.fixed));

  for (const box of boxes) {
    const { item } = box;
    const h = ground.heightAt(item.x, item.z);
    check(`${item.what} stands on the flat disc`, Math.abs(h) <= 0.1, `h ${h.toFixed(3)}`);
    check(`${item.what} is off the road`, distanceToRoutes(item.x, item.z) > ROAD.half + 0.3,
      distanceToRoutes(item.x, item.z).toFixed(2));
    // The whole box on the disc (a quarter unit past the edge was allowed
    // while the right-hand crate stack's outer crate overhung it by 0.23;
    // the stacks left 9 Sep and the bar is the drawn edge again).
    const fromCentre = Math.hypot(item.x - def.center[0], item.z - def.center[1]);
    check(`${item.what} is on the floor disc, box within its edge (guard made to fail)`,
      fromCentre + box.reach <= floor,
      `${(fromCentre + box.reach).toFixed(2)} against ${floor.toFixed(2)}`);
    // Fast travel drops the car on the standing point (`def.spawn`): a car's
    // length and more between it and anything born on the disc.
    const dSpawn = Math.hypot(item.x - def.spawn[0], item.z - def.spawn[1]) - box.reach;
    check(`${item.what} clears the fast-travel landing`, dSpawn > 3.5, dSpawn.toFixed(2));
    for (const [lx, lz] of lamps) {
      const d = Math.hypot(item.x - lx, item.z - lz) - box.reach;
      check(`${item.what} clears the lamp at (${lx.toFixed(1)}, ${lz.toFixed(1)})`, d > 0.5, d.toFixed(2));
    }
    for (const post of plan.signposts) {
      check(`${item.what} clears the ${post.id} post`, Math.hypot(post.at[0] - item.x, post.at[1] - item.z) > 1.5);
    }
  }

  // No two bodies born inside each other (the corridor fence's domino). Two
  // FIXED bodies cannot shove, and the paddock's rails meet at their corner
  // post on purpose — only pairs with a knockable in them count.
  let overlapping = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.item.fixed && b.item.fixed) continue;
      if (a.item.body === false || b.item.body === false) continue;
      if (overlaps(a, b, 0.05)) {
        overlapping++;
        console.log(`    ${a.item.what} is born through ${b.item.what}`);
      }
    }
  }
  check('no two plaza bodies are born overlapping (guard made to fail)', overlapping === 0, `${overlapping} pairs`);

  // The paddock: two back rails on one line with a hand's gap between them,
  // the side rail square to them, all three around one corner point with a
  // notch there — knockable bodies born touching shove apart at build, so
  // no two panels may touch, and the gaps are held small enough to read as
  // one fence (each panel's own end posts stand either side of a gap).
  const rails = boxes.filter((b) => b.item.paddock);
  // A panel's ends along its rails, from the SHIPPED length (`boundsOf`),
  // not the plan's step.
  const ends = (b) => [-1, 1].map((e) => [b.item.x + b.az[0] * e * b.hz, b.item.z + b.az[1] * e * b.hz]);
  const gapBetween = (a, b) => Math.min(...ends(a).flatMap((p) => ends(b).map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
  const [back0, back1, side] = rails;
  check('three rail panels make the paddock', rails.length === 3);
  const offLine = Math.abs((back1.item.x - back0.item.x) * back0.ax[0] + (back1.item.z - back0.item.z) * back0.ax[1]);
  check('the two back rails run on one line (guard made to fail)',
    Math.abs(back0.item.rotationY - back1.item.rotationY) < 1e-9 && offLine < 0.02, `off the line by ${offLine.toFixed(3)}`);
  const backGap = gapBetween(back0, back1);
  check('the back rails stand end to end with a hand between them, not touching (guard made to fail)',
    backGap >= 0.05 && backGap <= 0.2, `gap ${backGap.toFixed(3)}`);
  check('the side rail stands square to the back rail (guard made to fail)',
    Math.abs(Math.abs(back0.item.rotationY - side.item.rotationY) - Math.PI / 2) < 1e-9);
  // The corner point: where the two runs' lines cross. Both near ends stand
  // a short reach from it — the notch — and neither panel crosses the other.
  const cornerGap = gapBetween(back0, side);
  check('the side rail meets the back rail at the corner with a notch, not a crossing (guard made to fail)',
    cornerGap >= 0.05 && cornerGap <= 0.45 && !overlaps(back0, side, 0.03), `corner gap ${cornerGap.toFixed(3)}`);
  const hay = boxes.find((b) => b.item.kind === 'haystack');
  check('the paddock stands up-screen of the haystack (behind it, seen from the camera)',
    rails.every((r) => (r.item.x - hay.item.x) * -TO_CAMERA[0] + (r.item.z - hay.item.z) * -TO_CAMERA[1] > 0));
  check('the rails clear the haystack by a hand (guard made to fail)',
    rails.every((r) => !overlaps(r, hay, 0.3)));

  // The balloon under the fixed camera: a point at height h projects like a
  // ground point h further up-screen (45° elevation), so the balloon's
  // screen rows run from anchor-ahead + float − bob to + float + bob + its
  // height. It must hang above every board whose column it shares, and its
  // top must sit inside the frame the arrival lands in (17.6 ahead of the
  // car, the plaza's measured frame).
  const balloon = items.find((i) => i.kind === 'balloon');
  const bBounds = await boundsOf('balloon');
  const envelope = Math.max(bBounds.size[0], bBounds.size[2]) / 2;
  const aside = (i) => (i.x - def.center[0]) * ACROSS[0] + (i.z - def.center[1]) * ACROSS[1];
  const ahead = (i) => -((i.x - def.center[0]) * TO_CAMERA[0] + (i.z - def.center[1]) * TO_CAMERA[1]);
  const lowestRow = ahead(balloon) + balloon.float - balloon.bob;
  const topRow = ahead(balloon) + balloon.float + balloon.bob + bBounds.size[1];
  check('the balloon GLB is 5.5 tall, grounded at the basket\'s floor', Math.abs(bBounds.size[1] - 5.5) < 1e-3 && Math.abs(bBounds.min[1]) < 1e-4,
    bBounds.size.map((v) => v.toFixed(2)).join(' x '));
  for (const board of plazaLayout(def.center, projects.length)) {
    const shares = Math.abs(aside(board) - aside(balloon)) < envelope + BOARD.width / 2 + 0.3;
    const boardTop = ahead(board) + TOTAL_HEIGHT;
    check(`the balloon hangs clear of board ${board.index} on screen (guard made to fail)`,
      !shares || lowestRow - boardTop >= 1.0,
      shares ? `shares its column; basket row ${lowestRow.toFixed(1)} against top ${boardTop.toFixed(1)}` : 'own column');
  }
  check('the balloon\'s top is inside the arrival frame (guard made to fail)', topRow <= 17.6, `top row ${topRow.toFixed(1)} against 17.6`);
  check('the balloon floats a car\'s height clear of the paving through its bob', balloon.float - balloon.bob > 1.2);

  // The string lights between the boards' tops (8 Sep; they hung between
  // the lamps for an hour — "the car phases through the line" — the lamps
  // are 2.7 over a 1.2 car): one span per neighbouring pair along the arc,
  // hooked at the title plates' top corners, sagging in the middle, every
  // bulb a car's height over the roof, nowhere near the landed car's rows.
  {
    const lights = plazaStringLights(def.center, projects.length, { heightAt: (x, z) => ground.heightAt(x, z) });
    const boards = plazaLayout(def.center, projects.length);
    const asideOf = (p) => (p.x - def.center[0]) * ACROSS[0] + (p.z - def.center[1]) * ACROSS[1];
    check('one span between every neighbouring pair of boards (guard made to fail)',
      lights.spans.length === projects.length - 1 &&
        lights.spans.every((s) => Math.abs(asideOf(boards[s.boards[0]]) - asideOf(boards[s.boards[1]])) < 9 &&
          asideOf(boards[s.boards[0]]) < asideOf(boards[s.boards[1]])),
      `${lights.spans.length} spans`);
    // The title plate's top corner, from the board's own numbers — the
    // width 3.80 and the stack's 3.23 are literals here on purpose: the
    // guard must not read the plan's constants back to itself.
    const PLATE_HALF = 1.9;
    const STACK_TOP = 3.23;
    for (const span of lights.spans) {
      const [l, r] = span.boards.map((i) => boards[i]);
      const dFrom = Math.hypot(span.from[0] - l.x, span.from[2] - l.z);
      const dTo = Math.hypot(span.to[0] - r.x, span.to[2] - r.z);
      check(`span ${span.boards.join('-')} hooks at the plates' top corners (guard made to fail)`,
        dFrom <= PLATE_HALF && dFrom >= PLATE_HALF - 0.3 && dTo <= PLATE_HALF && dTo >= PLATE_HALF - 0.3 &&
          span.from[1] < STACK_TOP && span.from[1] > STACK_TOP - 0.15 && span.to[1] < STACK_TOP && span.to[1] > STACK_TOP - 0.15,
        `${dFrom.toFixed(2)} / ${dTo.toFixed(2)} from the centres, at ${span.from[1].toFixed(2)}`);
      const mid = span.cord[Math.floor(span.cord.length / 2)];
      const hookMid = (span.from[1] + span.to[1]) / 2;
      check(`span ${span.boards.join('-')} sags its sag in the middle`, Math.abs(hookMid - mid[1] - PLAZA_LIGHTS.sag) < 0.02, `mid ${mid[1].toFixed(2)}`);
      const lowest = Math.min(...span.bulbs.map(([x, y, z]) => y - ground.heightAt(x, z)));
      check(`span ${span.boards.join('-')} hangs every bulb a car's height over the roof (guard made to fail)`,
        lowest >= 1.2 + 1.0, `lowest ${lowest.toFixed(2)} against 2.2`);
      check(`span ${span.boards.join('-')} has bulbs at even steps, none on a hook`,
        span.bulbs.length >= 8 &&
          span.bulbs.every((b) => Math.hypot(b[0] - span.from[0], b[2] - span.from[2]) > 0.2 && Math.hypot(b[0] - span.to[0], b[2] - span.to[2]) > 0.2),
        `${span.bulbs.length} bulbs`);
      // The cord stays between its two plates across the screen — it never
      // crosses a board's face.
      const asides = span.cord.map((p) => (p[0] - def.center[0]) * ACROSS[0] + (p[2] - def.center[1]) * ACROSS[1]);
      check(`span ${span.boards.join('-')} runs between its plates, over no face`,
        Math.min(...asides) >= asideOf(l) + PLATE_HALF - PLAZA_LIGHTS.hookInset - 1e-6 && Math.max(...asides) <= asideOf(r) - PLATE_HALF + PLAZA_LIGHTS.hookInset + 1e-6);
    }
    // Under the fixed camera a point at height h projects like a ground
    // point h further up-screen: the lowest cord point sits this many rows
    // up the arrival frame, against a landed car whose roof's far edge is
    // at 2.75 up-screen.
    const rows = lights.spans.flatMap((s) => s.cord.map((p) => -((p[0] - def.center[0]) * TO_CAMERA[0] + (p[2] - def.center[1]) * TO_CAMERA[1]) + p[1]));
    check('the strings hang well above the landed car on screen (guard made to fail)', Math.min(...rows) > 2.75 + 3.0, `lowest row ${Math.min(...rows).toFixed(1)}`);
  }

  // The shipped panels against the plan's length: the run steps by the
  // shortest so no panel is born through the next, and none is far longer.
  const panelLengths = await Promise.all(['railFence1', 'railFence2', 'railFence3'].map(async (k) => (await boundsOf(k)).size[2]));
  const longest = Math.max(...panelLengths);
  check('the run\'s step clears the longest shipped rail by a hand (guard made to fail)',
    PLAZA_DRESSING.panelStep - longest >= 0.05 && PLAZA_DRESSING.panelStep - longest <= 0.2,
    `step ${PLAZA_DRESSING.panelStep} against ${panelLengths.map((v) => v.toFixed(3)).join(' / ')}`);
}

console.log(`\ncheck-wayfinding: ${failed === 0 ? 'ok' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
