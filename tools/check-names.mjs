/**
 * Run `src/pipeline/names.js` over every node name in the reference author's 64 shipped GLBs
 * and check the totals against the ones `F` §1.8 recorded independently.
 *
 *   npm run check-names
 *
 * **Why this exists.** We have no art of our own yet, so the naming parser would
 * otherwise be untested until the first model arrives — which is the worst
 * possible moment to discover it drops half its nodes. The reference's build is a corpus of
 * 3,000-odd real Blender names that were authored against exactly this format,
 * and `F` §1.8 already counted the matches by hand. Agreeing with those counts
 * is a much stronger test than anything we could write from the spec.
 *
 * It reads the glTF JSON chunk directly rather than through `GLTFLoader` — the
 * technique this project already uses on `areas.glb` — and replays the loader's
 * naming pass with `simulateLoaderNames`, so the names it tests are the ones the
 * runtime would actually see.
 *
 * Counts are **raw match totals across both the plain and `-compressed`
 * variants**, which is how `F` §1.8's table was taken, so they are ~2x the
 * per-world figure. Do not "fix" that by de-duplicating; it would stop the
 * numbers being comparable.
 *
 * Exits 1 if any expectation is missed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  simulateLoaderNames,
  parseReference,
  parsePhysical,
  parseColliderShape,
  stripPhysicsWords,
  diagnoseName,
} from '../src/pipeline/names.js';

const here = dirname(fileURLToPath(import.meta.url));
const STATIC = resolve(here, '../reference/source/static');

/** A GLB's JSON chunk, no loader and no buffer decoding. */
function gltfJson(file) {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${file} is not a GLB`);
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
}

function nodeNames(file) {
  return (gltfJson(file).nodes ?? []).map((n) => n.name ?? '');
}

/** Depth of every node from a scene root, so the depth rule can be applied. */
function nodeDepths(json) {
  const depth = new Array(json.nodes.length).fill(-1);
  const stack = (json.scenes[json.scene ?? 0].nodes ?? []).map((i) => [i, 0]);
  while (stack.length) {
    const [index, d] = stack.pop();
    if (depth[index] !== -1) continue;
    depth[index] = d;
    for (const child of json.nodes[index].children ?? []) stack.push([child, d + 1]);
  }
  return depth;
}

/**
 * **A correction to `F` §1.1, found by running this file.**
 *
 * It says *"areas.glb alone yields 110 distinct reference names over 214 ref*
 * objects"*. The 110 is right — but only under the depth rule; counted naively
 * it is 111. The **214 is not a property of `areas.glb`**, which contains
 * **210**: every one of its `^ref` nodes matches the full regex, so no counting
 * convention reaches 214. 214 is the `.blend`'s figure, which `F` §1.0 states
 * correctly two pages earlier — verified here by counting unique `OBref*` names
 * in `resources/source.blend`: exactly **214**, of which 110 carry a `.NNN`
 * suffix. The four-object gap is ref objects in collections that export to other
 * GLBs rather than to `areas.glb`. A `.blend` figure was attributed to a GLB.
 */
const AREAS_REF_OBJECTS = 210;

async function glbFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await glbFiles(path)));
    else if (entry.name.endsWith('.glb')) out.push(path);
  }
  return out.sort();
}

/** `F` §1.8, transcribed. Each is a raw match total over all 64 GLBs. */
const EXPECTED = {
  reference: 422,
  physical: 302,
  dynamic: 240,
  kinematicPositionBased: 14,
  trimesh: 4,
  hull: 20,
  cuboid: 454,
  tube: 86,
  ball: 4,
};

async function main() {
  if (!existsSync(STATIC)) {
    console.error(`check-names: ${STATIC} is missing.`);
    console.error('The reference clone is gitignored - see reference/README.md for how to get it.');
    process.exit(1);
  }

  const files = await glbFiles(STATIC);
  const counts = {
    reference: 0, physical: 0, dynamic: 0, kinematicPositionBased: 0,
    trimesh: 0, hull: 0, cuboid: 0, tube: 0, ball: 0,
  };
  const keys = new Map();
  const diagnostics = [];
  let nodes = 0;
  let renamedByLoader = 0;

  for (const file of files) {
    const raw = nodeNames(file);
    const loaded = simulateLoaderNames(raw);
    nodes += loaded.length;

    for (let i = 0; i < loaded.length; i++) {
      const name = loaded[i];
      if (name !== raw[i]) renamedByLoader++;

      const reference = parseReference(name);
      if (reference) {
        counts.reference++;
        keys.set(reference.key, (keys.get(reference.key) ?? 0) + 1);
      }

      const physical = parsePhysical(name);
      if (physical) {
        counts.physical++;
        if (physical.type === 'dynamic') counts.dynamic++;
        if (physical.type === 'kinematicPositionBased') counts.kinematicPositionBased++;
      }

      // Counted by the Blender word, so the table lines up with F 1.8 - note
      // `tube` there is `cylinder` in Rapier.
      const shape = parseColliderShape(name);
      if (shape) counts[shape === 'cylinder' ? 'tube' : shape]++;

      const problem = diagnoseName(name);
      if (problem) diagnostics.push({ file: file.slice(STATIC.length + 1), problem });
    }
  }

  console.log(`check-names: ${files.length} GLBs, ${nodes} nodes, ${renamedByLoader} renamed by the loader\n`);
  console.log('pattern                     ours     F 1.8');
  let failed = 0;
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const got = counts[name];
    const ok = got === expected;
    if (!ok) failed++;
    console.log(
      `  ${name.padEnd(24)}${String(got).padStart(5)}${String(expected).padStart(10)}   ${ok ? 'ok' : '<-- MISMATCH'}`
    );
  }

  // areas.glb, walked with its hierarchy — the depth rule below moves the answer.
  const areas = join(STATIC, 'areas', 'areas.glb');
  const areaJson = gltfJson(areas);
  const areaNames = simulateLoaderNames(areaJson.nodes.map((n) => n.name ?? ''));
  const depth = nodeDepths(areaJson);

  const areaKeys = new Set();
  const naiveKeys = new Set();
  let areaRefs = 0;
  let areaPhysical = 0;
  const areaTypes = { fixed: 0, dynamic: 0, kinematicPositionBased: 0 };
  for (let i = 0; i < areaNames.length; i++) {
    const name = areaNames[i];
    const physical = parsePhysical(name);
    if (physical) { areaPhysical++; areaTypes[physical.type]++; }
    const naive = parseReference(name);
    if (naive) { areaRefs++; naiveKeys.add(naive.key); }

    /**
     * `F` §1.2's ordering trap, and it is not a detail — it decides the count.
     *
     * `Area.js` calls `addFromModel` (which strips the physics words and writes
     * the name back onto the object) at line 42, and `references.parse` at line
     * 68. So a **direct child of an area group** is keyed on its stripped name
     * while a grandchild keeps the words. Depth changes the key:
     * `BowlingArea.js:84` genuinely asks for `items.get('pinPhysicalDynamic')`
     * and `LandingArea.js:26` for `items.get('letters')`, and both are correct.
     *
     * Applying it takes 111 keys to 110 — it removes 16 physics-suffixed keys
     * and adds back 15, because `screen` already existed from another node.
     */
    const effective = depth[i] === 1 && physical ? stripPhysicsWords(name) : name;
    const reference = parseReference(effective);
    if (reference) areaKeys.add(reference.key);
  }
  console.log('\nareas.glb                   ours     expected');
  const areaChecks = [
    ['ref objects', areaRefs, AREAS_REF_OBJECTS],
    ['distinct keys (depth rule)', areaKeys.size, 110],
    ['distinct keys (naive)', naiveKeys.size, 111],
    ['physical nodes', areaPhysical, 120],
    ['  dynamic', areaTypes.dynamic, 97],
    ['  fixed', areaTypes.fixed, 16],
    ['  kinematic', areaTypes.kinematicPositionBased, 7],
  ];
  for (const [label, got, expected] of areaChecks) {
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`  ${label.padEnd(24)}${String(got).padStart(5)}${String(expected).padStart(10)}   ${ok ? 'ok' : '<-- MISMATCH'}`);
  }

  // F 1.2's ordering trap, on the real name it uses as its example.
  const trap = 'refLettersPhysicalDynamic010';
  const stripped = stripPhysicsWords(trap);
  const shallowKey = parseReference(stripped)?.key;
  const deepKey = parseReference(trap)?.key;
  console.log('\nthe depth trap (F 1.2):');
  console.log(`  as a direct child  ${trap} -> ${stripped} -> key "${shallowKey}"`);
  console.log(`  nested deeper      ${trap} -> key "${deepKey}"`);
  if (shallowKey !== 'letters' || deepKey !== 'lettersPhysicalDynamic') {
    console.error('  <-- MISMATCH: expected "letters" and "lettersPhysicalDynamic"');
    failed++;
  } else {
    console.log('  ok - depth changes the key, which is F 1.2 and is deliberate');
  }

  console.log(`\n${diagnostics.length} node(s) start with "ref" but fail the full regex`);
  for (const d of diagnostics.slice(0, 10)) console.log(`  ${d.file}: ${d.problem}`);

  if (failed) {
    console.error(`\ncheck-names FAILED - ${failed} mismatch(es) against F.`);
    process.exit(1);
  }
  console.log('\ncheck-names ok - every count agrees with F.');
}

main();
