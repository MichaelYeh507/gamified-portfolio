/**
 * Prove the whole model path headlessly, end to end, before any authored art
 * exists:
 *
 *   GLB bytes → ResourcesLoader.load() → GLTFLoader → parseModel →
 *   MaterialRegistry.updateObject → Physics.getPhysical → a real Rapier body,
 *   asleep, with the authored mass — then step the world and watch one fall.
 *
 *   npm run check-loader
 *
 * The input is the generated fixture (`tools/lib/fixture.mjs`), which carries
 * every pattern the format defines at once, so the day Michael's lamp exists
 * it is a drop-in rather than a debugging session. The GLBs are served to the
 * real `load()` path as `data:` URLs — node's fetch resolves those, so the
 * loader's fetch/cache/progress orchestration is what runs here, not a
 * shortcut around it.
 *
 * Rapier is the real one too: `@dimforge/rapier3d-compat` inlines its WASM and
 * initialises under node, so the bodies, masses, groups and the sleep flag
 * below are read back from a live physics world, not from our descriptions.
 *
 * **Every guard is made to fail once** (the standing rule): the loader's error
 * path gets a truncated GLB, the registry's `prevent` gets a poisoned registry
 * entry it must NOT hand out, and the category/shape guards get a typo each.
 *
 * Exits 1 on any mismatch.
 */
globalThis.self = globalThis;
// `GLTFLoader.parse()` needs only `self`; the full `load()` path streams
// through fetch and fires DOM ProgressEvents, which node does not have.
globalThis.ProgressEvent ??= class ProgressEvent extends Event {
  constructor(type, { lengthComputable = false, loaded = 0, total = 0 } = {}) {
    super(type);
    this.lengthComputable = lengthComputable;
    this.loaded = loaded;
    this.total = total;
  }
};

const THREE = await import('three/webgpu');
const { default: ResourcesLoader } = await import('../src/pipeline/ResourcesLoader.js');
const { default: MaterialRegistry } = await import('../src/render/materialRegistry.js');
const { default: References } = await import('../src/pipeline/References.js');
const { parseModel } = await import('../src/pipeline/Objects.js');
const { default: Objects } = await import('../src/world/Objects.js');
const { combineSplit } = await import('../src/pipeline/split.js');
const { default: Physics } = await import('../src/world/Physics.js');
const { buildFixture } = await import('./lib/fixture.mjs');

const dataUrl = (buf) => `data:model/gltf-binary;base64,${buf.toString('base64')}`;

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${label.padEnd(52)}${ok ? 'ok' : '<-- FAIL'}${detail ? `  ${detail}` : ''}`);
};

async function main() {
  const { files, expected } = buildFixture();
  const urls = {
    references: dataUrl(files.references),
    visual: dataUrl(files.visual),
    physical: dataUrl(files.physical),
  };

  console.log('check-loader: the generated fixture family, through the real path\n');

  // ------------------------------------------------------------ the loader
  console.log('ResourcesLoader, over data: URLs:');
  const loader = new ResourcesLoader();

  const progressCalls = [];
  let modifierRan = 0;
  const resources = await loader.load(
    [
      ['fixtureReferences', urls.references, 'gltf'],
      ['fixtureVisual', urls.visual, 'gltf', () => modifierRan++],
      ['fixturePhysical', urls.physical, 'gltf'],
    ],
    (remaining, total) => progressCalls.push([remaining, total])
  );

  check('three files load and resolve by name',
    !!(resources.fixtureReferences && resources.fixtureVisual && resources.fixturePhysical));
  check('progress ran per file, down to zero',
    progressCalls.length === 3 && progressCalls[2][0] === 0 && progressCalls[2][1] === 3,
    JSON.stringify(progressCalls));
  check('modifier ran exactly once', modifierRan === 1);

  const again = await loader.load([['again', urls.visual, 'gltf', () => modifierRan++]]);
  check('second load of the same URL is a cache hit (same instance)',
    again.again === resources.fixtureVisual);
  check('cache hit does not re-run the modifier', modifierRan === 1);
  check('an empty list resolves (the reference\x27s never settles)',
    JSON.stringify(await loader.load([])) === '{}');

  // The error path, made to fail on purpose: a truncated GLB must reject.
  const broken = dataUrl(files.visual.subarray(0, 40));
  const rejected = await loader.load([['broken', broken, 'gltf']]).then(() => false, () => true);
  check('a corrupt file rejects the load', rejected);

  // ------------------------------------------------------- the registry
  console.log('\nthe material registry (F rec 6):');
  const registry = new MaterialRegistry();
  const palette = new THREE.MeshBasicMaterial();
  palette.name = 'palette-stub';
  registry.save('palette', palette);
  // Poison the name the prevented material would resolve to. If `prevent` is
  // honoured the poison is never handed out; if it is not, the label mesh
  // comes back carrying it — a silent pass is impossible either way.
  const poison = new THREE.MeshBasicMaterial();
  registry.save('careerText', poison);

  const visualRoot = resources.fixtureVisual.scene;
  registry.updateObject(visualRoot);
  const mesh = (name) => {
    let found = null;
    visualRoot.traverse((o) => { if (o.name === name) found = o; });
    return found;
  };

  check('`palette` meshes get the pre-registered material',
    expected.visual.paletteMeshes.every((n) => mesh(n).material === palette));
  const [a, b] = expected.visual.sharedMeshes.map((n) => mesh(n).material);
  check('an unknown name is defined by first use and then shared',
    a === b && a !== palette && a.name === 'glass');
  check('material `prevent` is honoured (poisoned entry not handed out)',
    mesh(expected.visual.preventedMesh).material !== poison &&
    mesh(expected.visual.preventedMesh).material.name === 'careerText');

  // ------------------------------------------------- parse + real Rapier
  console.log('\nparseModel over the physical file, into a live Rapier world:');
  const physics = await Physics.create();

  const physicalRoot = resources.fixturePhysical.scene;
  const nodes = [...physicalRoot.children];
  const types = { dynamic: 0, fixed: 0, kinematicPositionBased: 0 };
  const shapes = { cuboid: 0, cylinder: 0, ball: 0, hull: 0, trimesh: 0 };
  const bodies = new Map(); // stripped node name → physical

  for (const node of nodes) {
    const parsed = parseModel(node);
    if (!parsed.physical) continue;
    types[parsed.physical.type]++;
    for (const collider of parsed.physical.colliders) shapes[collider.shape]++;
    // The placement, as `Scenery.js:29` passes it — position and quaternion
    // from the node. NOT `position.add(...)`: that line of the reference's mutates the
    // node in place (the Area.js:46 landmine).
    const physical = physics.getPhysical({
      ...parsed.physical,
      position: [node.position.x, node.position.y, node.position.z],
      rotation: node.quaternion,
    });
    bodies.set(node.name, physical);
  }

  check(`bodies built: ${expected.physical.bodies} (preventAutoAdd fan skipped)`,
    bodies.size === expected.physical.bodies);
  check('body types match',
    JSON.stringify(types) === JSON.stringify(expected.physical.types), JSON.stringify(types));
  check('collider shapes match',
    JSON.stringify(shapes) === JSON.stringify(expected.physical.colliders), JSON.stringify(shapes));

  const fan = nodes.find((n) => n.name === 'refFanPhysicalDynamic');
  check('the fan kept its name, its child and got no body',
    !!fan && fan.children.length === 1 && !bodies.has('refFanPhysicalDynamic'));

  // References parsed AFTER the strip — the reference's ordering, and the depth trap.
  const references = new References(physicalRoot);
  check('reference keys match after the strip',
    Object.entries(expected.physical.referenceKeys)
      .every(([key, n]) => references.get(key).length === n),
    [...references.items.keys()].join(', '));
  check('no malformed names in the fixture', references.problems.length === 0);

  console.log('\nread back from the Rapier world, not from our descriptions:');
  const letters = [bodies.get('refLetter'), bodies.get('refLetter001')];
  check('every body starts asleep',
    [...bodies.values()].every((p) => p.body.isSleeping()));
  check(`authored mass arrives: both letters weigh ${expected.physical.letterMass} (one was the string "2")`,
    letters.every((p) => Math.abs(p.body.mass() - expected.physical.letterMass) < 1e-6));
  check('mass is spread across colliders (2-collider letter: 1 each)',
    Math.abs(letters[0].colliders[0].mass() - 1) < 1e-6 &&
    Math.abs(letters[0].colliders[1].mass() - 1) < 1e-6);
  const lamp = bodies.get('refLamp') ?? bodies.get('lamp');
  check('an unmassed body gets the reference\x27s density 0.1, not zero',
    lamp.body.mass() > 0 && Math.abs(lamp.body.mass() - 0.4 * 1.6 * 0.4 * 0.1) < 1e-4,
    `mass ${lamp.body.mass().toFixed(4)}`);
  check('body-level restitution wins (letters: 0.5)',
    Math.abs(letters[0].colliders[0].restitution() - 0.5) < 1e-6);
  const globe = bodies.get('globe');
  check('collider-level overrides apply (globe: restitution 1, friction 0.6)',
    Math.abs(globe.colliders[0].restitution() - 1) < 1e-6 &&
    Math.abs(globe.colliders[0].friction() - 0.6) < 1e-6);
  check('the reference\x27s defaults fill the gaps (lamp: friction 0.2, restitution 0.15)',
    Math.abs(lamp.colliders[0].friction() - 0.2) < 1e-6 &&
    Math.abs(lamp.colliders[0].restitution() - 0.15) < 1e-6);
  const ground = bodies.get('ground');
  check('category "floor" sets the reference\x27s collision groups',
    ground.colliders[0].collisionGroups() === physics.categories.floor,
    `0x${ground.colliders[0].collisionGroups().toString(16)}`);
  check('the default category is "object"',
    letters[0].colliders[0].collisionGroups() === physics.categories.object);
  check('the kinematic body is kinematic',
    bodies.get('post').body.isKinematic() && ground.body.isFixed());

  // Step the world: the asleep must hold still, the woken must actually land.
  const before = new Map(
    [...bodies.entries()].map(([n, p]) => [n, { ...p.body.translation() }]));
  globe.body.wakeUp();
  for (let i = 0; i < 600; i++) physics.step(1 / 60);
  const moved = (n) => {
    const t = bodies.get(n).body.translation();
    const b = before.get(n);
    return Math.hypot(t.x - b.x, t.y - b.y, t.z - b.z) > 1e-4;
  };
  const globeY = globe.body.translation().y;
  check('sleeping bodies do not integrate (nothing else moved)',
    [...bodies.keys()].every((n) => n === 'globe' || !moved(n)));
  check('the woken globe fell onto the trimesh floor and stayed in the world',
    moved('globe') && globeY < 1.9 && globeY > 0.3, `y ${globeY.toFixed(3)}`);

  // The guards, made to fail once each — in a second world so the throwaway
  // bodies cannot contaminate the counts above.
  console.log('\nthe guards, on descriptions deliberately broken:');
  const scratch = await Physics.create();
  const threw = (fn, needle) => {
    try { fn(); return false; } catch (e) { return String(e.message).includes(needle); }
  };
  check('a category typo throws and names the valid keys',
    threw(() => scratch.getPhysical({
      type: 'fixed', sleeping: true,
      colliders: [{ shape: 'cuboid', parameters: [0.5, 0.5, 0.5], category: 'flor' }],
    }), 'floor, object, bumper'));
  check('an unknown shape throws',
    threw(() => scratch.getPhysical({
      type: 'fixed', sleeping: true,
      colliders: [{ shape: 'wedge', parameters: [1] }],
    }), 'unknown collider shape'));
  check('an unknown body type throws',
    threw(() => scratch.getPhysical({ type: 'static', colliders: [] }), 'unknown body type'));
  // And one that must stay silent: a clean description on the same instance.
  check('a clean description still builds after the failures',
    scratch.getPhysical({
      type: 'dynamic', sleeping: true,
      colliders: [{ shape: 'cuboid', parameters: [0.5, 0.5, 0.5] }],
    }).body.isSleeping());

  // ------------------------------------------------- the runtime glue
  console.log('\nthe runtime glue - Objects, from loaded GLB to scene + live world:');
  // Fresh loads: the loader cache returns the SAME (already parsed and
  // mutated) instances, so the glue gets its own loader, registry, physics
  // and scene - exactly what Game.js hands the real one.
  const glueLoader = new ResourcesLoader();
  const glueResources = await glueLoader.load([
    ['visual', urls.visual, 'gltf'],
    ['physical', urls.physical, 'gltf'],
  ]);
  const gluePhysics = await Physics.create();
  const glueRegistry = new MaterialRegistry();
  const gluePalette = new THREE.MeshBasicMaterial();
  glueRegistry.save('palette', gluePalette);
  const scene = new THREE.Scene();
  const objects = new Objects({ scene, physics: gluePhysics, materials: glueRegistry });

  for (const child of [...glueResources.visual.scene.children]) {
    objects.addFromModel(child);
  }
  const sceneMesh = (name) => scene.children.find((o) => o.name === name);
  check('visual-only models land in the scene with registry materials',
    scene.children.length === 5 &&
    sceneMesh('lamp').material === gluePalette &&
    sceneMesh('crate').material === gluePalette);
  check('shadows set through the add path',
    sceneMesh('lamp').castShadow === true && sceneMesh('lamp').receiveShadow === true);
  check('the visual back-reference is wired',
    sceneMesh('lamp').userData.object.visual.object3D === sceneMesh('lamp'));

  let fanResult = 'unset';
  const glueBodies = new Map();
  for (const child of [...glueResources.physical.scene.children]) {
    // The lamp gets an area-style placement DIFFERENT from its node transform
    // (the reference's Area offsets every child by the area's position). Without this, the
    // one-shot body→visual copy is unfalsifiable: a placement equal to the
    // node transform leaves the visual standing in the right place even when
    // the copy is deleted — proved by deleting it and watching nothing fail.
    const offset = child.name === 'lampPhysical' ? 2 : 0;
    const added = objects.addFromModel(child, {}, {
      position: [child.position.x + offset, child.position.y, child.position.z + offset],
      rotation: child.quaternion,
    });
    if (child.name === 'refFanPhysicalDynamic') fanResult = added;
    else glueBodies.set(child.name, added);
  }
  check('preventAutoAdd returns null and stays out of the scene',
    fanResult === null && !scene.children.includes(
      glueResources.physical.scene.children.find((o) => o.name === 'refFanPhysicalDynamic')));
  check(`the glue built ${expected.physical.bodies} bodies through the same path`,
    glueBodies.size === expected.physical.bodies &&
    [...glueBodies.values()].every((o) => o.physical && o.physical.body.isSleeping()));
  const glueLetter = glueBodies.get('refLetter');
  // Tolerances, not equality: 0.6 is not representable in float32, so the
  // authored translation comes back 0.6000000238… through the GLB.
  check('the one-shot copy stands a sleeping visual on its body',
    glueLetter.visual.object3D.position.x === 1 &&
    Math.abs(glueLetter.visual.object3D.position.y - 0.6) < 1e-6 &&
    glueLetter.physical.body.userData.object === glueLetter);
  const glueLamp = glueBodies.get('lamp');
  check('…including when the placement differs from the node transform',
    glueLamp.visual.object3D.position.x === 4 &&
    glueLamp.visual.object3D.position.z === -1,
    `visual (${glueLamp.visual.object3D.position.x}, ${glueLamp.visual.object3D.position.z}), authored node (2, -3)`);

  // Interpolation: wake the globe, take exactly one substep, and read the
  // visual at alpha 0 and alpha 0.5 - both positions are exactly computable.
  const glueGlobe = glueBodies.get('globe');
  glueGlobe.physical.body.wakeUp();
  gluePhysics.step(1 / 120); // exactly one substep; alpha 0
  objects.syncVisuals();
  const y1 = glueGlobe.physical.body.translation().y;
  check('at alpha 0 the visual draws the previous pose, one substep behind',
    y1 < 2 && glueGlobe.visual.object3D.position.y === 2,
    `body ${y1.toFixed(4)}, visual ${glueGlobe.visual.object3D.position.y.toFixed(4)}`);
  gluePhysics.step(1 / 240); // no substep fits; alpha becomes 0.5
  objects.syncVisuals();
  const midpoint = (2 + y1) / 2;
  check('at alpha 0.5 the visual draws the exact midpoint between poses',
    Math.abs(glueGlobe.visual.object3D.position.y - midpoint) < 1e-9,
    `visual ${glueGlobe.visual.object3D.position.y.toFixed(6)}, midpoint ${midpoint.toFixed(6)}`);

  for (let i = 0; i < 600; i++) gluePhysics.step(1 / 60);
  objects.syncVisuals();
  const globeVisualY = glueGlobe.visual.object3D.position.y;
  check('the settled globe visual stands on its body, on the floor',
    Math.abs(globeVisualY - glueGlobe.physical.body.translation().y) < 0.01 &&
    globeVisualY > 0.3 && globeVisualY < 1.9,
    `y ${globeVisualY.toFixed(3)}`);
  check('sleeping props never moved while the globe fell',
    Math.abs(glueLetter.visual.object3D.position.y - 0.6) < 1e-6 &&
    glueBodies.get('post').visual.object3D.position.x === -2);

  // ------------------------------------------------------- the file split
  console.log('\ncombineSplit, over the loaded family:');
  const { placements } = combineSplit({
    references: resources.fixtureReferences.scene,
    visual: resources.fixtureVisual.scene,
    physical: physicalRoot,
  });
  check(`${expected.references.placements} placements out of the references file`,
    placements.length === expected.references.placements &&
    JSON.stringify(placements.map((p) => p.name)) === JSON.stringify(expected.references.names));
  check('a placement carries its authored transform (lamp002: scale 1.5)',
    placements[2].scale[0] === 1.5 && placements[1].quaternion[1] !== 0,
    JSON.stringify(placements[2].scale));

  if (failed) {
    console.error(`\ncheck-loader FAILED - ${failed} mismatch(es).`);
    process.exit(1);
  }
  console.log('\ncheck-loader ok - a GLB fetched, parsed, registered and standing in a live Rapier world.');
}

main().catch((error) => {
  console.error('check-loader crashed:', error);
  process.exit(1);
});
