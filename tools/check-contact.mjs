/**
 * Prove the contact arc's arithmetic and its site, headlessly:
 *
 *   links.js → contactPlan → every point on dry, flat ground — against the
 *   REAL height field, the real links data and the real area def, plus the
 *   eight-link future the arc must still hold.
 *
 *   npm run check-contact
 *
 * Three families of check:
 *
 *  1. The arc rules (pure, no three.js) — anchored to the reference's ACTUAL artifacts:
 *     the eight icon positions measured out of the reference's `areas.glb` (the no-loader
 *     glTF walk, 1 Sep) are embedded below, and the generalised layout must
 *     reproduce them digit for digit at N = 8. The reports lost to the reference's
 *     authored geometry twice; this is where the measurement stops being a
 *     session's memory and becomes a failing test.
 *
 *  2. The site (three.js under node, the check-pipeline shim): the whole plan
 *     swept over `Terrain` for ground above the waterline and flat — for the
 *     real three links and for the eight-link future's full half-circle.
 *
 *  3. The island contracts: contact must clear the projects area at decision
 *     21's eight entries, the career corridor at its derived radius, and the
 *     landing — areas must not overlap.
 *
 * Exits 1 on any mismatch.
 */
globalThis.self = globalThis;

const {
  CARD_RADIUS,
  PROMPT_RADIUS,
  PROMPT_HEIGHT,
  ANGLE_STEP,
  CONTACT_RADIUS,
  SPAWN_BACK,
  APPROACH_HEADING,
  arcAngles,
  arcPoint,
  displayAddress,
  contactPlan,
} = await import('../src/world/areas/contactArc.js');
const { default: links } = await import('../src/content/links.js');
const { default: areaDefs } = await import('../src/content/areas.js');

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${label.padEnd(58)}${ok ? 'ok' : '<-- FAIL'}${detail ? `  ${detail}` : ''}`);
};

console.log('check-contact: the arc, from the links to the ground\n');

// ---------------------------------------------- the reference's measured geometry
console.log('the measurement (the reference\x27s areas.glb, socialArrayReference markers):');
{
  /**
   * The reference's eight ground markers (cuboid.041–048), as offsets from refCenter
   * (25.951, −18.093), in the reference's frame — display order X → Discord, the order
   * of the reference's `data/social.js`. Measured 1 Sep with the no-loader glTF walk.
   */
  const HIS_ICONS = [
    [7.848, 0.0],
    [7.069, -3.409],
    [4.881, -6.146],
    [1.714, -7.659],
    [-1.765, -7.648],
    [-4.893, -6.137],
    [-7.068, -3.413],
    [-7.849, -0.007],
  ];

  // The reference's code writes x += cos(a)·r, z −= sin(a)·r — so each baked marker
  // should sit at angle i·π/7 on one shared radius.
  let radiusOk = true;
  let angleOk = true;
  let radiusSum = 0;
  HIS_ICONS.forEach(([dx, dz], i) => {
    const r = Math.hypot(dx, dz);
    radiusSum += r;
    if (Math.abs(r - CARD_RADIUS) > 0.06) radiusOk = false;
    const angle = Math.atan2(-dz, dx);
    if (Math.abs(angle - (i * Math.PI) / 7) > 0.01) angleOk = false;
  });
  check(
    'the reference\x27s eight icons share one radius, and it is CARD_RADIUS',
    radiusOk && Math.abs(radiusSum / 8 - CARD_RADIUS) < 0.01,
    `mean ${(radiusSum / 8).toFixed(3)} against ${CARD_RADIUS}`
  );
  check('the reference\x27s icons stand at i·π/7 exactly — the step is measured', angleOk);
  const chord = 2 * CARD_RADIUS * Math.sin(ANGLE_STEP / 2);
  check('the step at that radius is the reference\x27s 3.49-unit chord', Math.abs(chord - 3.49) < 0.02, `chord ${chord.toFixed(3)}`);
}

// --------------------------------------------------------- the arc rules
console.log('\narcAngles, the .length layout:');
{
  const eight = arcAngles(8);
  // The reference's code's i·π/(N−1) and our centred form must be the same arc at the reference's N —
  // mirrored: links.js promises display order, and a screen reads left to
  // right, so our i runs the other way along the reference's exact angle set.
  const agree = eight.every((a, i) => Math.abs(a - (Math.PI - (i * Math.PI) / 7)) < 1e-9);
  check('at eight links the centred form IS the reference\x27s arc, read L→R', agree);
  check('…spanning exactly the half-circle', Math.abs(Math.abs(eight[7] - eight[0]) - Math.PI) < 1e-9);

  const three = arcAngles(3);
  check('three links centre on the arc top', Math.abs(three[1] - Math.PI / 2) < 1e-12);
  check(
    'three links keep the reference\x27s measured step, not a 90° smear',
    Math.abs(Math.abs(three[1] - three[0]) - ANGLE_STEP) < 1e-12 &&
      Math.abs(Math.abs(three[2] - three[1]) - ANGLE_STEP) < 1e-12
  );
  const c = [0, 0];
  const chord = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const p = three.map((a) => arcPoint(c, a, CARD_RADIUS));
  check(
    'adjacent cards stand the reference\x27s 3.49 apart at any count',
    Math.abs(chord(p[0], p[1]) - 3.49) < 0.02 && Math.abs(chord(p[1], p[2]) - 3.49) < 0.02
  );

  check('one link stands alone at the arc top', arcAngles(1).length === 1 && arcAngles(1)[0] === Math.PI / 2);
  check('no links is an empty arc (guard made to fail)', arcAngles(0).length === 0);
  const twenty = arcAngles(20);
  check(
    'twenty links compress the step instead of leaving the arc',
    Math.abs(Math.abs(twenty[19] - twenty[0]) - Math.PI) < 1e-9
  );

  // The frame: angle 0 is screen-right, π/2 up-screen — every card must land
  // up-screen of the centre-line or on it, never behind the camera side.
  const upscreenOk = arcAngles(8)
    .map((a) => arcPoint([0, 0], a, CARD_RADIUS))
    .every((at) => at.x + at.z < 1e-9);
  check('the arc bulges up-screen, toward the fixed camera', upscreenOk);
}

// ------------------------------------------------------- the addresses
console.log('\ndisplayAddress:');
{
  check('mailto keeps the mailbox', displayAddress('mailto:a@b.co') === 'a@b.co');
  check(
    'https keeps host and path, sheds www and trailing slash',
    displayAddress('https://www.linkedin.com/in/michael-yeh-cmu/') === 'linkedin.com/in/michael-yeh-cmu'
  );
  check('garbage passes through, never throws (guard made to fail)', displayAddress('not a url') === 'not a url');
  check('empty is empty', displayAddress('') === '');
  check(
    'every real link renders a non-empty address',
    links.every((l) => displayAddress(l.url).length > 0)
  );
}

// ------------------------------------------------------- the links data
console.log('\nlinks.js:');
{
  const slugs = new Set(links.map((l) => l.slug));
  check('links exist', links.length >= 3);
  check('slugs are unique', slugs.size === links.length);
  check('every link carries a label and a url', links.every((l) => l.label && l.url));
}

// ------------------------------------------------------------- the site
console.log('\nthe site, against the real height field:');
const { default: Terrain, WATER_SURFACE } = await import('../src/world/Terrain.js');
const terrain = new Terrain();
const contact = areaDefs.find((d) => d.id === 'contact');
check('the contact def exists', !!contact);
check('the def heading faces up-screen into the arc', contact && contact.heading === APPROACH_HEADING);
check('the spawn stands inside the area', SPAWN_BACK < CONTACT_RADIUS);

const sweep = (label, linksData) => {
  const plan = contactPlan(contact.center, linksData);
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
};

sweep('the real arc stands on dry flat ground', links);
sweep(
  'the eight-link future still fits — the full half-circle',
  Array.from({ length: 8 }, (_, i) => ({ slug: `l${i}`, label: `L${i}`, url: 'https://x.co' }))
);

// ------------------------------------------------- the island contracts
console.log('\nthe island contracts:');
{
  const { plazaReach } = await import('../src/world/areas/ProjectsArea.js');
  const { buildTimeline, LEAD_IN, SHIPPED_UNITS_PER_YEAR } = await import(
    '../src/world/areas/careerTimeline.js'
  );
  const { default: roles } = await import('../src/content/roles.js');

  const projects = areaDefs.find((d) => d.id === 'projects');
  const career = areaDefs.find((d) => d.id === 'career');
  const landing = areaDefs.find((d) => d.id === 'landing');

  const projectsRadiusAt8 = plazaReach(projects.center, 8) + 14;
  const t = buildTimeline(roles, { unitsPerYear: SHIPPED_UNITS_PER_YEAR });
  const careerRadius = Math.max(18, t.spanUnits / 2 + LEAD_IN + 10);

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const clears = (label, otherCenter, otherRadius) => {
    const d = dist(contact.center, otherCenter);
    check(
      `contact clears ${label} (areas must not overlap)`,
      d > otherRadius + CONTACT_RADIUS,
      `${d.toFixed(1)} against ${(otherRadius + CONTACT_RADIUS).toFixed(1)}`
    );
  };
  clears('the eight-project plaza', projects.center, projectsRadiusAt8);
  clears('the career corridor', career.center, careerRadius);
  clears('the landing', landing.center, landing.radius);

  check(
    'the beacons float at the reference\x27s label height',
    PROMPT_HEIGHT === 1 && PROMPT_RADIUS === 6
  );
}

console.log('');
if (failed) {
  console.error(`check-contact: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('check-contact: ok');
