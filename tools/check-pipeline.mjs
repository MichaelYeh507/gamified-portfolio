/**
 * Run the **runtime** pipeline — `References` and `Objects`, on real `Object3D`s
 * through a real `GLTFLoader` — against the reference author's `areas.glb`, and check what
 * comes out against the counts `F` §1 recorded independently.
 *
 *   npm run check-pipeline
 *
 * `tools/check-names.mjs` proves the regexes; this proves the layer above them:
 * collider harvesting off real children with real scales, the mutation
 * `parseModel` performs, the userData reads, and the depth rule as the code
 * actually applies it rather than as a script simulates it.
 *
 * **It runs headlessly.** `GLTFLoader.parse()` works under node once `self` is
 * shimmed — it takes an `ArrayBuffer` and never touches the network. Textures
 * fail to decode, loudly, and that is fine: nothing here reads a texture, and
 * the alternative was a browser round trip for a test that has no pixels in it.
 *
 * Exits 1 on any mismatch.
 */
globalThis.self = globalThis;

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { default: References } = await import('../src/pipeline/References.js');
const { parseModel } = await import('../src/pipeline/Objects.js');
const { classifyFile, splitUrls } = await import('../src/pipeline/split.js');

const here = dirname(fileURLToPath(import.meta.url));
const AREAS = resolve(here, '../reference/source/static/areas/areas.glb');

function loadGlb(file) {
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => {
    new GLTFLoader().parse(ab, '', (gltf) => res(gltf), rej);
  });
}

/**
 * For `areas.glb`. **Three of these differ from `F` §1, and in all three cases
 * F is a correct count of something slightly different** — F counts *names*,
 * this counts *what the pipeline creates*. Each was chased to the byte before
 * being called a correction.
 *
 * **cuboid 186, not F §1.3's 191.** There are exactly 191 nodes named `^cuboid`.
 * Five of them — `cuboid.082`–`cuboid.086` — are **scene roots**, not children
 * of a physical object, so no runtime turns them into colliders. F §1.8 already
 * calls those five "orphaned colliders that are parsed and silently dropped", so
 * F is internally consistent; 186 is the answer to "how many colliders exist".
 *
 * **physical 119/96, not F §1.2's 120/97, and 41 cylinders not 43.** One node,
 * `refPinPhysicalDynamic`, carries `preventAutoAdd`, which skips body creation
 * entirely — so its two `tube` children never become colliders either. F's 120
 * is the count of names containing `physical`; 119 bodies are built. The two
 * other `preventAutoAdd` nodes (`refFan`, `refCookie`) are not physical-named
 * and cost nothing.
 *
 * **preventFrustum 12, not F §1.6's 11.** Eleven *nodes* carry the property.
 * The twelfth, `refBonfireBurn.001`, carries none — its **mesh** datablock does
 * (`Plane.003`, mesh 10) — and `GLTFLoader` copies mesh extras into `userData`
 * too, so the runtime sees twelve. **The authoring lesson is the finding:** in
 * Blender a custom property can sit on the Object or on the Object Data, both
 * export, and only the Object one is safe, because a mesh datablock is shared
 * between duplicates. Set them on the Object.
 */
const EXPECTED = {
  colliders: { cuboid: 186, cylinder: 41, ball: 2, hull: 2, trimesh: 2 },
  physical: { total: 119, dynamic: 96, fixed: 16, kinematicPositionBased: 7 },
  userData: { mass: 49, preventFrustum: 12, preventAutoAdd: 3, restitution: 2, category: 1 },
  referenceKeys: 110,
  refObjects: 210,
};

async function main() {
  if (!existsSync(AREAS)) {
    console.error(`check-pipeline: ${AREAS} is missing.`);
    console.error('The reference clone is gitignored - see reference/README.md.');
    process.exit(1);
  }

  const gltf = await loadGlb(AREAS);
  const root = gltf.scene;

  // Collect the tree BEFORE parsing anything: parseModel detaches collider
  // children and rewrites names, so a live traverse would walk a moving target.
  const nodes = [];
  root.traverse((o) => { if (o !== root) nodes.push(o); });
  const depth = new Map([[root, 0]]);
  root.traverse((o) => { if (o.parent && depth.has(o.parent)) depth.set(o, depth.get(o.parent) + 1); });

  const counts = { cuboid: 0, cylinder: 0, ball: 0, hull: 0, trimesh: 0 };
  const physical = { total: 0, dynamic: 0, fixed: 0, kinematicPositionBased: 0 };
  const userData = { mass: 0, preventFrustum: 0, preventAutoAdd: 0, restitution: 0, category: 0 };
  let detached = 0;

  for (const node of nodes) {
    for (const key of Object.keys(userData)) {
      if (node.userData && node.userData[key] !== undefined) userData[key]++;
    }
    // The reference's Area.js runs addFromModel on direct children of an area root (depth 2
    // here, since gltf.scene is depth 0 and the area roots are depth 1). Deeper
    // nodes keep their physics words - F 1.2.
    const strip = depth.get(node) === 2;
    const before = node.children.length;
    const parsed = parseModel(node, { strip });
    if (!parsed.physical) continue;
    detached += before - node.children.length;
    physical.total++;
    physical[parsed.physical.type]++;
    for (const collider of parsed.physical.colliders) counts[collider.shape]++;
  }

  // References are parsed after the physics pass, which is the reference's ordering and the
  // whole of the depth trap.
  const references = new References(root);

  let failed = 0;
  const row = (label, got, expected) => {
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`  ${label.padEnd(26)}${String(got).padStart(5)}${String(expected).padStart(10)}   ${ok ? 'ok' : '<-- MISMATCH'}`);
  };

  console.log(`check-pipeline: areas.glb, ${nodes.length} objects\n`);
  console.log('colliders                   ours   expected');
  for (const [shape, expected] of Object.entries(EXPECTED.colliders)) row(shape, counts[shape], expected);
  console.log(`  (${detached} collider children detached, so none of them render)`);

  console.log('\nphysical                    ours   expected');
  for (const [type, expected] of Object.entries(EXPECTED.physical)) row(type, physical[type], expected);

  console.log('\nuserData                    ours   expected');
  for (const [key, expected] of Object.entries(EXPECTED.userData)) row(key, userData[key], expected);

  console.log('\nreferences                  ours   expected');
  row('distinct keys', references.items.size, EXPECTED.referenceKeys);
  let total = 0;
  for (const list of references.items.values()) total += list.length;
  row('ref objects', total, EXPECTED.refObjects);

  // The two keys F 1.2 uses as its worked examples, one from each side of the trap.
  console.log('\nthe depth rule, as the code applied it:');
  for (const key of ['letters', 'pinPhysicalDynamic']) {
    const n = references.get(key).length;
    console.log(`  items.get('${key}')`.padEnd(34) + `${n} object(s)  ${n > 0 ? 'ok' : '<-- MISSING'}`);
    if (n === 0) failed++;
  }

  console.log(`\n${references.problems.length} malformed reference name(s) in the reference's data (expected 0 - it shipped)`);
  if (references.problems.length !== 0) failed++;

  /**
   * **Fire the dev assertion on purpose.** The reference's data is clean, so the guard would
   * otherwise never run in this entire check, and a guard that has never fired
   * is not a guard. Every case below is a real mistake somebody will make in
   * Blender, and three are the ones `F` §1.0 warns about by name.
   */
  console.log('\nthe dev assertion, on names deliberately broken:');
  const broken = [
    ['refLine001_1', 'de-duplicated'],  // refLine001 authored beside refLine.001
    ['ref_My_Thing', 'underscore in a reference key'],     // "ref My Thing" - the space became _
    ['ref1', 'digit straight after'],   // no name left to key on
    ['ref', 'bare prefix'],
  ];
  for (const [name, expect] of broken) {
    const probe = new References();
    probe.parse({ traverse: (fn) => fn({ name }) });
    const reason = probe.problems[0] ? probe.problems[0].reason : '';
    const ok = probe.problems.length === 1 && reason.includes(expect);
    if (!ok) failed++;
    console.log(`  ${name.padEnd(14)} ${ok ? 'caught  ' : 'NOT CAUGHT <-- '}${reason.slice(0, 92)}`);
  }
  // And one that must NOT trip it, or the assertion is just noise.
  const clean = new References();
  clean.parse({ traverse: (fn) => fn({ name: 'refLine001' }) });
  const quiet = clean.problems.length === 0 && clean.get('line').length === 1;
  if (!quiet) failed++;
  console.log(`  ${'refLine001'.padEnd(14)} ${quiet ? 'silent, and keyed as "line"' : 'FALSE POSITIVE <--'}`);

  // The file-split convention, against the reference's own filenames.
  console.log('\nthe three-file split, against the reference\x27s filenames:');
  const cases = [
    ['bushesReferences.glb', 'bushes', 'references'],
    ['oakTreesVisual-compressed.glb', 'oakTrees', 'visual'],
    ['playgroundPhysical.glb', 'playground', 'physical'],
    ['fences.glb', 'fences', 'single'],
  ];
  for (const [file, family, part] of cases) {
    const got = classifyFile(file);
    const ok = got.family === family && got.part === part;
    if (!ok) failed++;
    console.log(`  ${file.padEnd(32)} -> ${got.family}/${got.part}   ${ok ? 'ok' : '<-- MISMATCH'}`);
  }
  const urls = splitUrls('bushes');
  console.log(`  splitUrls('bushes').references = ${urls.references}`);

  if (failed) {
    console.error(`\ncheck-pipeline FAILED - ${failed} mismatch(es).`);
    process.exit(1);
  }
  console.log('\ncheck-pipeline ok - the runtime pipeline agrees with F on the reference\x27s own data.');
}

main();
