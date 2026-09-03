/**
 * Prove the retint tool (decision 47) headlessly, both assignment paths:
 *
 *   npm run check-prep
 *
 * 1. **Colour snap**, against a generated fixture with known colours — the
 *    Kenney/Quaternius path. Two boxes whose material colours sit near two
 *    palette bands must land exactly on those bands' UV centres.
 * 2. **Part rules**, against the real committed source
 *    (`assets/models/traditional_japanese_lamp_post.glb`) — the Sketchfab
 *    path. The output must match `public/models/lampPost.glb` byte for byte
 *    (the drift guard, same shape as `palette:check`), carry the right
 *    registry material names and bands, a collider the pipeline parses, and
 *    the CC-BY attribution riding the asset extras.
 *
 * Every guard is made to fail once (the standing rule): a colour the palette
 * has no answer for, a rule-colour typo, a rule gap, an unknown up-axis, and
 * verification over deliberately tampered bytes.
 *
 * Exits 1 on any mismatch.
 */
globalThis.self = globalThis; // three/webgpu touches `self` at import

const { NodeIO } = await import('@gltf-transform/core');
const { prep, prepRecipe, verify, nearestBand, RECIPES } = await import('./prep-model.mjs');
const { paletteU, COLOR, PALETTE_WIDTH, BAND } = await import('../src/render/palette.js');
const { colliderParameters } = await import('../src/pipeline/names.js');
const { writeGlb, box } = await import('./lib/glb.mjs');
const { readFileSync } = await import('node:fs');

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${label.padEnd(52)}${ok ? 'ok' : '<-- FAIL'}${detail ? `  ${detail}` : ''}`);
};
const throws = async (fn, needle) => {
  try { await fn(); return false; } catch (e) { return String(e.message).includes(needle); }
};

/** sRGB channel → linear, because `writeGlb`'s material colour is a raw
 *  baseColorFactor and glTF defines that as linear. */
const linear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearRgba = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [linear(((n >> 16) & 0xff) / 255), linear(((n >> 8) & 0xff) / 255), linear((n & 0xff) / 255), 1];
};

async function main() {
  const io = new NodeIO();
  console.log('check-prep: the retint tool, both assignment paths\n');

  // ------------------------------------------------------ the colour snap
  console.log('colour snap, over a fixture with known colours:');

  // Near-grass and near-accentWarm, deliberately OFF the exact palette values
  // — the snap is only proven if it has a distance to close.
  const fixture = writeGlb({
    generator: 'check-prep fixture',
    nodes: [
      {
        name: 'crate', mesh: box(1, 1, 1, 0, 0.5, 0),
        material: { name: 'greenish', color: linearRgba('#82936c') },
      },
      {
        name: 'drum', mesh: box(0.8, 1, 0.8, 2, 0.5, 0),
        material: { name: 'orangeish', color: linearRgba('#df6c38') },
      },
    ],
  });
  const snapRecipe = { node: 'props', up: 'Y', targetHeight: 1, origin: 'bbox', snapColors: true, parts: [] };
  const snapped = await io.readBinary(new Uint8Array(await prep(snapRecipe, { io, source: fixture })));

  const bandsSeen = new Set();
  for (const mesh of snapped.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const uv = primitive.getAttribute('TEXCOORD_0').getArray();
      for (let i = 0; i < uv.length; i += 2) bandsSeen.add(Math.floor((uv[i] * PALETTE_WIDTH) / BAND));
    }
  }
  check('#82936c snaps to `grass`, #df6c38 to `accentWarm`',
    bandsSeen.size === 2 && bandsSeen.has(COLOR.grass) && bandsSeen.has(COLOR.accentWarm),
    `bands ${[...bandsSeen].join(', ')}`);
  check('nearestBand agrees with the snap, with a real distance to close',
    nearestBand([0x82 / 255, 0x93 / 255, 0x6c / 255]).index === COLOR.grass &&
    nearestBand([0x82 / 255, 0x93 / 255, 0x6c / 255]).distance > 0.01);

  // The guards, made to fail once each.
  console.log('\nthe guards, on inputs deliberately broken:');
  const red = writeGlb({
    generator: 'check-prep fixture',
    nodes: [{ name: 'cone', mesh: box(1, 1, 1, 0, 0.5, 0), material: { name: 'red', color: [1, 0, 0, 1] } }],
  });
  check('a colour the palette has no answer for throws',
    await throws(() => prep(snapRecipe, { io, source: red }), 'no answer'));
  check('a rule-colour typo throws and names the palette',
    await throws(() => prep({ ...snapRecipe, snapColors: false, parts: [{ color: 'ambr' }] },
      { io, source: fixture }), 'not a palette colour'));
  check('a rule gap throws with the unmatched height',
    await throws(() => prep({ ...snapRecipe, snapColors: false, parts: [{ above: 0.9, color: 'black' }] },
      { io, source: fixture }), 'no rule matched'));
  check('an unknown up-axis throws',
    await throws(() => prep({ ...snapRecipe, up: 'X' }, { io, source: fixture }), 'unknown up axis'));

  // Verification over tampered bytes: shift one UV off its band centre.
  const good = await prep(snapRecipe, { io, source: fixture });
  const tampered = await io.readBinary(new Uint8Array(good));
  const uvAccessor = tampered.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('TEXCOORD_0');
  const uvArray = uvAccessor.getArray().slice();
  uvArray[0] += 1.5 / PALETTE_WIDTH; // 1.5 px: off-centre but inside the band
  uvAccessor.setArray(uvArray);
  const tamperFailures = await verify(io, new Uint8Array(await io.writeBinary(tampered)), snapRecipe, 24);
  check('verify catches a UV nudged 1.5 px off its band centre',
    tamperFailures.some((f) => f.includes('band')), tamperFailures[0] ?? '');

  // ------------------------------------------------- the real lamp, end to end
  console.log('\nthe lamp (part rules), source through recipe against the shipped file:');
  const bytes = await prepRecipe('lampPost', { io });
  const shipped = readFileSync(RECIPES.lampPost.output);
  check('public/models/lampPost.glb matches its recipe byte for byte',
    bytes.equals(shipped), `${bytes.length} vs ${shipped.length} bytes`);

  const lamp = await io.readBinary(new Uint8Array(bytes));
  const primitives = lamp.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  const byMaterial = new Map(primitives.map((p) => [p.getMaterial().getName(), p]));
  check('two primitives: `palette` and `paletteEmissive`',
    primitives.length === 2 && byMaterial.has('palette') && byMaterial.has('paletteEmissive'));

  const emissiveUv = byMaterial.get('paletteEmissive')?.getAttribute('TEXCOORD_0').getArray();
  check('the light chamber sits on band 12, emissive amber',
    !!emissiveUv && emissiveUv.every((v, i) => (i % 2 === 0 ? Math.abs(v - paletteU(COLOR.amber)) < 1e-6 : v === 0.5)),
    `u ${emissiveUv?.[0].toFixed(4)}, band centre ${paletteU(COLOR.amber).toFixed(4)}`);

  const emissivePos = byMaterial.get('paletteEmissive')?.getAttribute('POSITION').getArray();
  let chamberMinY = Infinity;
  let chamberMaxY = -Infinity;
  for (let i = 1; i < (emissivePos?.length ?? 0); i += 3) {
    chamberMinY = Math.min(chamberMinY, emissivePos[i]);
    chamberMaxY = Math.max(chamberMaxY, emissivePos[i]);
  }
  check('and the chamber is mid-lamp, not the roof or the base',
    chamberMinY > 1.2 && chamberMaxY < 2.2,
    `y ${chamberMinY.toFixed(2)}..${chamberMaxY.toFixed(2)}`);

  const collider = lamp.getRoot().listNodes().find((n) => n.getName() === 'cuboid');
  const scale = collider?.getScale();
  const params = scale && colliderParameters('cuboid', { x: scale[0], y: scale[1], z: scale[2] });
  check('the collider child parses to a 0.675 x 1.35 x 0.675 half-extent cuboid',
    !!params && params[0] === 0.675 && params[1] === 1.35 && params[2] === 0.675,
    JSON.stringify(params));

  const extras = lamp.getRoot().getAsset().extras;
  check('the CC-BY attribution rides the asset extras',
    !!extras && String(extras.license).includes('CC-BY') && String(extras.author).includes('aiiko7'));

  // ------------------------------------------- the buggy (extract + snap)
  console.log('\nthe buggy (node extraction + colour snap), against the shipped file:');
  const buggyBytes = await prepRecipe('carBuggy', { io });
  const buggyShipped = readFileSync(RECIPES.carBuggy.output);
  check('public/models/carBuggy.glb matches its recipe byte for byte',
    buggyBytes.equals(buggyShipped), `${buggyBytes.length} vs ${buggyShipped.length} bytes`);

  const buggy = await io.readBinary(new Uint8Array(buggyBytes));
  const buggyMeshes = new Map(buggy.getRoot().listMeshes().map((m) => [m.getName(), m]));
  check('two parts: buggyBody and buggyWheel',
    buggyMeshes.has('buggyBody') && buggyMeshes.has('buggyWheel'));

  // The wheel must be centred on its own axle at exactly the physics radius —
  // the recipe's scale was *chosen* to make 0.255 × 1.647 = 0.420, so this is
  // the check that the whole fit still holds.
  const wheelPos = buggyMeshes.get('buggyWheel')?.listPrimitives()[0].getAttribute('POSITION');
  const wheelMax = [-Infinity, -Infinity, -Infinity];
  const wheelMin = [Infinity, Infinity, Infinity];
  for (let i = 0; i < (wheelPos?.getCount() ?? 0); i++) {
    const a = wheelPos.getArray();
    for (let k = 0; k < 3; k++) {
      wheelMin[k] = Math.min(wheelMin[k], a[i * 3 + k]);
      wheelMax[k] = Math.max(wheelMax[k], a[i * 3 + k]);
    }
  }
  const radius = (wheelMax[1] - wheelMin[1]) / 2;
  check('the wheel is centred with radius 0.420 = Car.WHEEL.radius',
    Math.abs(radius - 0.42) < 2e-3 &&
    Math.abs(wheelMax[1] + wheelMin[1]) < 1e-3 && Math.abs(wheelMax[2] + wheelMin[2]) < 1e-3,
    `radius ${radius.toFixed(4)}`);

  // The emissive lenses sit at BOTH ends now — red brake lights at the tail
  // (−Z, beside the spare) and the headlight glass at the nose (+Z, added for
  // the night shader). Asserting both is also the orientation check: the
  // first build shipped turned 180°, caught by Michael driving it, and a
  // regression here reads exactly like that.
  const emissive = buggyMeshes.get('buggyBody')?.listPrimitives()
    .find((p) => p.getMaterial().getName() === 'paletteEmissive');
  const emissivePosB = emissive?.getAttribute('POSITION').getArray() ?? [];
  let lensMinZ = Infinity;
  let lensMaxZ = -Infinity;
  for (let i = 2; i < emissivePosB.length; i += 3) {
    lensMinZ = Math.min(lensMinZ, emissivePosB[i]);
    lensMaxZ = Math.max(lensMaxZ, emissivePosB[i]);
  }
  check('emissive lenses at both ends: brake lights rear, headlights front',
    !!emissive && lensMinZ < -1.0 && lensMaxZ > 1.0,
    `lens z ${lensMinZ.toFixed(2)}..${lensMaxZ.toFixed(2)}`);

  check('the buggy attribution rides its asset extras',
    String(buggy.getRoot().getAsset().extras?.author ?? '').includes('Herrsher'));

  // ------------------------------------------- the texture-snap (atlas packs)
  console.log('\nthe texture snap, over a generated two-stripe atlas:');
  // A 8x4 atlas: left half near-grass green, right half near-wood brown.
  // Two quads, one UV'd to each half - the snap is only proven if the SAME
  // material yields DIFFERENT bands per triangle, which no factor could.
  const sharp = (await import('sharp')).default;
  const stripePng = await sharp({
    create: { width: 8, height: 4, channels: 3, background: '#82936c' },
  }).composite([{
    input: await sharp({ create: { width: 4, height: 4, channels: 3, background: '#8a5f3c' } }).png().toBuffer(),
    left: 4, top: 0,
  }]).png().toBuffer();

  const { Document } = await import('@gltf-transform/core');
  const texDoc = new Document();
  const texBuffer = texDoc.createBuffer();
  const texture = texDoc.createTexture('stripes').setImage(new Uint8Array(stripePng)).setMimeType('image/png');
  const texMaterial = texDoc.createMaterial('atlas').setBaseColorTexture(texture);
  const quad = (u) => texDoc.createPrimitive()
    .setAttribute('POSITION', texDoc.createAccessor().setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(texBuffer))
    .setAttribute('TEXCOORD_0', texDoc.createAccessor().setType('VEC2')
      .setArray(new Float32Array([u, 0.5, u, 0.5, u, 0.5])).setBuffer(texBuffer))
    .setMaterial(texMaterial);
  const texMesh = texDoc.createMesh('striped').addPrimitive(quad(0.25)).addPrimitive(quad(0.75));
  texDoc.getRoot().setDefaultScene(
    texDoc.createScene('s').addChild(texDoc.createNode('striped').setMesh(texMesh)));
  const texGlb = Buffer.from(await io.writeBinary(texDoc));

  const snappedTex = await io.readBinary(new Uint8Array(
    await prep({ node: 'striped', up: 'Y', targetHeight: 1, origin: 'bbox', snapColors: true, parts: [] },
      { io, source: texGlb })));
  const texBands = new Set();
  for (const m of snappedTex.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) {
      const uv = p.getAttribute('TEXCOORD_0').getArray();
      for (let i = 0; i < uv.length; i += 2) texBands.add(Math.floor((uv[i] * PALETTE_WIDTH) / BAND));
    }
  }
  check('one atlas material yields two bands: grass and wood',
    texBands.size === 2 && texBands.has(COLOR.grass) && texBands.has(COLOR.wood),
    `bands ${[...texBands].join(', ')}`);

  // ------------------------------------------- the packs, against shipped files
  console.log('\nthe packs, each item byte-compared against its shipped file:');
  const { prepPack } = await import('./prep-model.mjs');
  for (const packName of ['prehistoricPack', 'medievalPack']) {
    const results = await prepPack(packName, { io });
    let drifted = 0;
    for (const [itemName, itemBytes] of results) {
      const shippedItem = readFileSync(RECIPES[packName].items[itemName].output);
      if (!itemBytes.equals(shippedItem)) drifted++;
    }
    check(`${packName}: all ${results.size} items match their recipes`, drifted === 0,
      drifted ? `${drifted} drifted` : '');
  }

  const fireDoc = await io.readBinary(new Uint8Array(readFileSync('public/models/bonfire.glb')));
  const hayDoc = await io.readBinary(new Uint8Array(readFileSync('public/models/haystack.glb')));
  const hasEmissive = (doc) => doc.getRoot().listMeshes().some((m) =>
    m.listPrimitives().some((p) => p.getMaterial().getName() === 'paletteEmissive'));
  check('amber-snapped flames ride paletteEmissive; overridden hay does not',
    hasEmissive(fireDoc) && !hasEmissive(hayDoc));

  check('a partition that misses geometry throws (guard made to fail)',
    await throws(() => prepPack('broken', {
      io,
      pack: {
        source: RECIPES.prehistoricPack.source, snapColors: true,
        items: {
          bad: {
            output: 'unused', include: ['M_Tree_1'], targetHeight: 5,
            nodes: [{ name: 'treeBody', include: ['M_Tree_1_T_Tree_0'] }], // leaves unclaimed
          },
        },
      },
    }), 'partitioned'));

  // ------------------------------------------- and standing in a live world
  // The same road Game.js drives at boot: ResourcesLoader → GLTFLoader →
  // addFromModel → a real Rapier body — but with the REAL shipped file, so a
  // regression in it is caught here and not by driving to the plaza.
  console.log('\nthe shipped lamp, through the runtime road into a live Rapier world:');
  globalThis.ProgressEvent ??= class ProgressEvent extends Event {
    constructor(type, init = {}) { super(type); Object.assign(this, init); }
  };
  const THREE = await import('three/webgpu');
  const { default: ResourcesLoader } = await import('../src/pipeline/ResourcesLoader.js');
  const { default: MaterialRegistry } = await import('../src/render/materialRegistry.js');
  const { default: Objects } = await import('../src/world/Objects.js');
  const { default: Physics } = await import('../src/world/Physics.js');

  const loader = new ResourcesLoader();
  const { lampPost } = await loader.load([
    ['lampPost', `data:model/gltf-binary;base64,${bytes.toString('base64')}`, 'gltf'],
  ]);

  const registry = new MaterialRegistry();
  const paletteStub = new THREE.MeshBasicMaterial();
  const emissiveStub = new THREE.MeshBasicMaterial();
  registry.save('palette', paletteStub);
  registry.save('paletteEmissive', emissiveStub);

  const physics = await Physics.create();
  const scene = new THREE.Scene();
  const objects = new Objects({ scene, physics, materials: registry });

  const placed = objects.addFromModel(lampPost.scene.children[0].clone(true), {}, {
    position: [33, 0, 13],
    rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.25),
  });

  check('the lamp stands in the scene at its placement, renamed by the strip',
    scene.children.length === 1 && scene.children[0].name === 'lampPost' &&
    scene.children[0].position.x === 33 && scene.children[0].position.z === 13);
  const meshMaterials = [];
  scene.children[0].traverse((o) => { if (o.isMesh) meshMaterials.push(o.material); });
  check('both primitives got their registry materials',
    meshMaterials.length === 2 &&
    meshMaterials.includes(paletteStub) && meshMaterials.includes(emissiveStub));
  check('the body is fixed, asleep, with one cuboid collider',
    placed.physical.body.isFixed() && placed.physical.body.isSleeping() &&
    placed.physical.colliders.length === 1);
  const half = placed.physical.colliders[0].halfExtents();
  check('the collider read its size from the scale (0.675 half-extent)',
    Math.abs(half.x - 0.675) < 1e-6 && Math.abs(half.y - 1.35) < 1e-6,
    `half extents (${half.x}, ${half.y}, ${half.z})`);

  if (failed) {
    console.error(`\ncheck-prep FAILED - ${failed} mismatch(es).`);
    process.exit(1);
  }
  console.log('\ncheck-prep ok - both retint paths proven, the shipped lamp matches its recipe.');
}

main().catch((error) => {
  console.error('check-prep crashed:', error);
  process.exit(1);
});
