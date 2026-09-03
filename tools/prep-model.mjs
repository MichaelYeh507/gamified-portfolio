/**
 * The retint tool — decision 47's second half, and the found-asset on-ramp.
 *
 *   npm run prep                 (rebuild every recipe into public/models)
 *   node tools/prep-model.mjs --report lampPost   (component table, for rules)
 *   node tools/prep-model.mjs --check             (drift guard, like palette:check)
 *
 * A found GLB goes in (Sketchfab, Kenney, wherever — CC0/CC-BY, recorded in
 * CREDITS.md the day it is downloaded); a game-ready GLB comes out in
 * `public/models/`, speaking the project's whole format at once:
 *
 *   - **palette UVs** — every vertex points at the centre of one palette band,
 *     the same `paletteU` the runtime's `paint()` uses, so the two paths can
 *     never disagree about where a band is (decision 37, amended by 47).
 *   - **materials named for the registry** — `palette`, or `paletteEmissive`
 *     for parts that will glow when PoleLights lands. The exported PBR material
 *     is a preview nicety (baseColorFactor = the band's colour, so external
 *     viewers show roughly the game's look) and is discarded at load.
 *   - **the naming convention** — the root node carries the physics words
 *     (`lampPostPhysical`) and collider children (`tube`) that
 *     `pipeline/Objects.js` parses; names are linted with the same
 *     `diagnoseName` the runtime asserts with.
 *   - **Y-up, real-world scale, grounded** — Sketchfab OBJ-derived models
 *     arrive Z-up at arbitrary scale; the output stands on y = 0 at an authored
 *     height, origin under the base, so a placement is just an XZ and a heading.
 *   - **attribution riding the file** — the source's author/licence extras are
 *     copied onto the output asset, so the credit survives every copy of the
 *     GLB even away from CREDITS.md.
 *
 * Two assignment paths, one per kind of found model:
 *
 *   1. **Colour snap** (`snapColors`) — models that arrive with flat-coloured
 *      materials (Kenney, Quaternius) have each material's baseColorFactor
 *      snapped to the nearest assigned palette band, in sRGB where the palette
 *      is authored. A colour further than `SNAP_TOLERANCE` from every band
 *      throws rather than guessing: a palette that cannot represent an asset is
 *      a decision, not a rounding error.
 *   2. **Part rules** (`parts`) — Sketchfab's `materialmerger` fuses everything
 *      into one colourless mesh (the lamp arrived as 1 mesh / 1 material /
 *      0 colours), so there is nothing to snap. The mesh is split into
 *      connected components (union-find over position-welded triangles) and
 *      each component is assigned a band by the first matching rule. Rules
 *      predicate on the component's *normalised* bounds (0..1 of model height),
 *      read off `--report`.
 *
 * Verification is part of the run, not a favour (the compress.mjs rule): the
 * output is re-read and must be grounded, at target height, triangle-exact
 * with the source, on-band in every UV, and clean under `diagnoseName`.
 */
globalThis.self = globalThis; // three/webgpu touches `self` at import (see check-loader)

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const { NodeIO, Document } = await import('@gltf-transform/core');
const THREE = await import('three/webgpu');
const { PALETTE, COLOR, paletteU, BAND, PALETTE_WIDTH } = await import('../src/render/palette.js');
const { diagnoseName, parseColliderShape } = await import('../src/pipeline/names.js');

/**
 * How far (sRGB distance, 0..1 per channel) a source colour may sit from the
 * nearest band before the snap refuses. 0.35 absorbs shading variants of one
 * hue (a kit's three greens all land on `grass` or `grassDark`) while a colour
 * the palette has no answer for — pure red, say — still throws.
 */
const SNAP_TOLERANCE = 0.35;

/**
 * One recipe per shipped model. The recipe is the authored half of the tool:
 * everything measurable is measured, and the recipe holds only the calls a
 * person made — which bands, what height, where the collider stands.
 */
export const RECIPES = {
  lampPost: {
    source: 'assets/models/traditional_japanese_lamp_post.glb',
    output: 'public/models/lampPost.glb',
    /** The runtime node name. `Physical` (fixed body); the strip renames it
     *  to `lampPost` at parse, per the convention. */
    node: 'lampPostPhysical',
    /** The mesh data is Z-up (OBJ lineage) but Sketchfab's wrapper node
     *  carries the −90° X rotation as a *matrix*, which the world transform
     *  bakes in during extraction — so by the time normalise runs, the
     *  geometry is already Y-up. `up: 'Z'` here would rotate it twice. */
    up: 'Y',
    /**
     * 2.7 world units tall. Sized against the neighbours it will stand with:
     * the board stack ends at 3.23, the readable-height ceiling is ~3.2
     * (ROADMAP, correction to 44), the car is 1.2 tall — a lamp at 2.7 reads
     * as street furniture, clears the car, and never fights the boards.
     */
    targetHeight: 2.7,
    /** Origin under the *base* of the post (vertices in the bottom 5 % of the
     *  height), not the bbox centre — the lantern arm would drag a bbox centre
     *  sideways and the collider would miss the wood. */
    origin: 'base',
    /**
     * Read off `--report`: four connected components, a standing tōrō —
     *
     *   1052 tris  ny 0.76..1.00  the roof cap
     *    796 tris  ny 0.00..0.43  the base and post
     *    676 tris  ny 0.57..0.76  the light chamber — this is what glows
     *    604 tris  ny 0.43..0.57  the collar under the chamber
     *
     * A rule matches on the component's *centre* height (0..1 of model
     * height), first match wins. `amber` is palette entry 12 — "emissive
     * amber", the entry the colour gate's verdict called out as used by
     * nothing. This is the first thing in the world that uses it (decision
     * 13's identity layer starts here), and `paletteEmissive` is the registry
     * seam PoleLights will fill with a real glowing material.
     */
    parts: [
      { above: 0.57, below: 0.76, color: 'amber', material: 'paletteEmissive' }, // chamber, centre 0.66
      { above: 0.76, color: 'black' }, // roof, centre 0.88
      { above: 0.43, color: 'black' }, // collar, centre 0.50
      { color: 'rockDark' }, // base and post, centre 0.21
    ],
    /**
     * One `cuboid` matching the square pedestal. The car is 1.2 tall and the
     * base spans ±0.6..0.72 below that height, so the box is sized to the
     * pedestal (1.35 across) and runs the full height — the roof is wider
     * (±0.78 at the corners) but nothing can ever reach it, and a collider
     * sized to cover it would be an invisible wall a car-width before the
     * wood. Scale IS the size in metres (the format's nicest property).
     */
    colliders: [{ shape: 'cuboid', name: 'cuboid', size: [1.35, 2.7, 1.35], at: [0, 1.35, 0] }],
  },

  carBuggy: {
    source: 'assets/models/foxter_buggy_low_ploy_concept.glb',
    output: 'public/models/carBuggy.glb',
    /**
     * The hero asset: an original concept buggy (no franchise IP), CC-BY by
     * Herrsher, 38,376 tris. Unlike the lamp it keeps its node structure —
     * Sketchfab never fused it — so the four road wheels are extracted by
     * *node name*, not by connectivity, and the spare on the nose stays with
     * the body.
     *
     * Colour snap does the whole palette job: the source is olive drab and
     * greys, which land on our moss-and-slate bands almost as if painted for
     * them. The one exception is the tail lights' red lenses
     * (`Material.015`, #a11500 — 0.51 from every band), overridden to
     * **amber under `paletteEmissive`**: the same seam as the lamp chamber,
     * so they glow the day PoleLights lands.
     */
    snapColors: true,
    snapOverrides: {
      'Material.015': { color: 'amber', material: 'paletteEmissive' },
      /** The headlight lenses (the white strip and the round lamps on the
       *  nose — `Material.003` appears nowhere else). Onto the emissive band
       *  so they light up with the night shader, per Michael's ask: "add a
       *  light for the car headlights when it turns night." The beam itself
       *  is `render/Night.js`; this is the glass glowing. */
      'Material.003': { color: 'amber', material: 'paletteEmissive' },
      /**
       * The body panels rode accent cool for one day (1 Sep, "make the
       * color of the car more unique") and went back on 2 Sep ("lets make
       * the car the original colors, i dont like this blue") — the plain
       * colour snap, olive drab onto moss and slate, is the shipped look.
       * Recorded rather than deleted so the next "the car is bland" reads
       * this first: the teal was tried, and it lost to the driver.
       */
    },
    /**
     * The transform is measured, not styled — every number below came off the
     * source geometry, and the fit is why this model was accepted:
     *
     *   - wheel radius: raw 0.253391 × 1.657517 = **0.420000** =
     *     `Car.WHEEL.radius` exactly, so the visual tread touches where the
     *     suspension ray says the ground is
     *   - wheelbase: raw 1.363494 × that = 2.260, against the mounts' 2.24 —
     *     centred symmetrically, each arch sits 1 cm outside its mount
     *
     * No rotation: the buggy already faces +Z. **The first build had this
     * wrong** — rotateY: π, from reading the −Z-end roof structure as a
     * steering wheel and its red `Material.015` lenses as a front light bar.
     * Michael drove it and caught it in one sentence: *"our backwheels are
     * acting as front wheels."* The −Z end is the *tail* — rear-mounted
     * spare, red brake lights (red was the clue misread) — and the roof
     * thing is equipment. The z translate centres the axle pair on the
     * mounts: the axles sit at −0.0033 and −2.2633 scaled, midpoint
     * −1.1333, so +1.1333 lands them on ±1.130. Vertically, raw ground
     * y = 0 goes to −1.135 body-local, which is `Car.REST_HEIGHT` below
     * the chassis centre.
     */
    parts: undefined, // colour snap covers everything; no height rules
    extract: [
      {
        node: 'buggyBody',
        include: ['Cube'],
        exclude: ['Cylinder.012', 'Cylinder.021', 'Cylinder.042', 'Cylinder.044'],
        transform: { scale: 1.657517, translate: [0, -1.135, 1.1333] },
      },
      {
        /** One wheel, centred on its own axle so `Car`'s spin pivot can
         *  turn it. Instanced four times at runtime; the rear pair's extra
         *  ~80 tris of hub detail are deliberately lost. */
        node: 'buggyWheel',
        include: ['Cylinder.042'],
        transform: { scale: 1.657517, recenter: true },
      },
    ],
    /**
     * The drift-guard expectations for `verify` — measured once at authoring,
     * so a source or recipe change that moves geometry fails loudly.
     */
    expect: { buggyBody: 18648, buggyWheel: 4892 },
  },

  /**
   * The nature pack — decision 47's volume purchase. An asset dump from a
   * cancelled-looking game project, CC-BY by artikora; we take the bushes,
   * the stump and the mushrooms and leave the skateboard, xylophone and
   * watermelons where they lie. Colours come from **texture sampling**: the
   * pack paints via per-model 4096² atlases (baseColorFactors are all
   * white), so every triangle samples its atlas at its UV centroid and
   * snaps like any other colour.
   *
   * **The trees were taken 31 Aug and returned the same day**, on Michael
   * driving them: *"i dont think the trees match what the reference author has."* Measured
   * against the reference author's actual `birchTreesVisual.glb`, the reference author was exactly right —
   * the reference's tree is a thin branchy trunk with **six instances of one 20-tri
   * icosphere** floating around it, not a solid crown, and no found model
   * has that silhouette. Trees are generated again (`Island._buildProps`),
   * now in the reference's construction; the recipes lived here from
   * `treeOak1`..`treePine2` and died in the same commit.
   */
  prehistoricPack: {
    source: 'assets/models/prehistorical_-_stylized_low_poly_asset_pack.glb',
    snapColors: true,
    snapOverrides: { 'TT_checker_512x512_UV_GRID': 'foliageDark' },
    items: {
      bush1: { output: 'public/models/bush1.glb', include: ['SM_Bush_1'], targetHeight: 0.9 },
      bush2: { output: 'public/models/bush2.glb', include: ['SM_bush_2'], targetHeight: 1.05 },
      bush3: { output: 'public/models/bush3.glb', include: ['SM_Bush_3'], targetHeight: 1.2 },
      stump: { output: 'public/models/stump.glb', include: ['SM_Stump'], targetHeight: 0.6 },
      /**
       * Forest-floor mushrooms — Michael: "other objects in the pack could
       * probably make the map more lively." The pack's shrooms are giant
       * gameplay props; scaled to toadstool size they are ground flora. The
       * emissive-capped one is deliberate: its bright spots snap to amber,
       * ride `paletteEmissive`, and will glow faintly at night with
       * PoleLights — a forest with fireflies in it, for free.
       */
      shroomUmbrella: { snapTolerance: 0.55, output: 'public/models/shroomUmbrella.glb', include: ['Umbrella_Shroom_1'], targetHeight: 0.65 },
      shroomBlue: { snapTolerance: 0.55, output: 'public/models/shroomBlue.glb', include: ['Blue_Shroom_1'], targetHeight: 0.5 },
      shroomFoliage: { snapTolerance: 0.55, output: 'public/models/shroomFoliage.glb', include: ['Foliage_SHroom_1'], targetHeight: 0.45 },
      shroomGlow: { snapTolerance: 0.55, output: 'public/models/shroomGlow.glb', include: ['Emissive_Shroom_1'], targetHeight: 0.4 },
    },
  },

  /**
   * The forest pack — CC-BY by Ragat Vdoo Kaf, and the pack that finally
   * supplies found rocks. Only its **opaque half** is taken: every tree
   * canopy, bush, fern, grassblade and dandelion in it is alpha-cutout
   * sprite planes (`onetextrans`), which need the transparent foliage
   * material (the reference's `Foliage` system — roadmap, not built) and would render
   * as solid slabs today. What is fully opaque and excellent: ten stones
   * (four clean, six mossy), four logs, root-snag stumps, and four more
   * mushroom species including the classic red-cap fly agaric.
   */
  forestPack: {
    source: 'assets/models/low_poly_forest_pack_low_poly_environment_pack.glb',
    snapColors: true,
    items: {
      stoneA: { output: 'public/models/stoneA.glb', include: ['stone.001_46'], targetHeight: 0.9 },
      stoneB: { output: 'public/models/stoneB.glb', include: ['stone.002_47'], targetHeight: 1.15 },
      stoneC: { output: 'public/models/stoneC.glb', include: ['stone.003_48'], targetHeight: 0.8 },
      stoneD: { output: 'public/models/stoneD.glb', include: ['stone.005_50'], targetHeight: 0.7 },
      mossStoneA: { output: 'public/models/mossStoneA.glb', include: ['mossed_stone.004_49'], targetHeight: 0.85 },
      mossStoneB: { output: 'public/models/mossStoneB.glb', include: ['mossed_stone.006_51'], targetHeight: 0.8 },
      mossStoneC: { output: 'public/models/mossStoneC.glb', include: ['mossed_stone.007_60'], targetHeight: 1.2 },
      mossStoneD: { output: 'public/models/mossStoneD.glb', include: ['mossed_stone.009_62'], targetHeight: 1.4 },
      logPine: { output: 'public/models/logPine.glb', include: ['pine_log.001_39'], targetHeight: 0.55 },
      logBirch: { output: 'public/models/logBirch.glb', include: ['birch_log.002_52'], targetHeight: 0.55 },
      logPlain: { output: 'public/models/logPlain.glb', include: ['log.003_53'], targetHeight: 0.5 },
      snagPine: { output: 'public/models/snagPine.glb', include: ['pine_stump_41'], targetHeight: 1.5 },
      snagOak: { output: 'public/models/snagOak.glb', include: ['oak_stump.004_45'], targetHeight: 1.2 },
      snagBirch: { output: 'public/models/snagBirch.glb', include: ['birch_stump.002_43'], targetHeight: 1.45 },
      shroomAgaric: { snapTolerance: 0.55, output: 'public/models/shroomAgaric.glb', include: ['fly_agaric_2'], targetHeight: 0.45 },
      shroomCeps: { snapTolerance: 0.55, output: 'public/models/shroomCeps.glb', include: ['ceps_7'], targetHeight: 0.38 },
      shroomHoney: { snapTolerance: 0.55, output: 'public/models/shroomHoney.glb', include: ['honey_mushroom_37'], targetHeight: 0.5 },
      shroomChanterelle: { snapTolerance: 0.55, output: 'public/models/shroomChanterelle.glb', include: ['chanterelle_38'], targetHeight: 0.3 },
    },
  },

  /**
   * The prop vocabulary — CC-BY by anastasita.3d, 42 props under one hand,
   * coloured by a single stripe-atlas (every face's UVs parked on one
   * gradient stripe), which is the friendliest texture-snap case there is.
   * The subset below is the world-dressing: what areas get furnished with in
   * Phase 3. The streetlight gets the lampPost treatment — physics words and
   * a collider — because it is a second lamp silhouette for the emissive
   * layer; everything else ships as plain visual nodes and gets its physics
   * decided where it is placed.
   */
  medievalPack: {
    source: 'assets/models/low_poly_medieval_environment_pack_35_props.glb',
    snapColors: true,
    items: {
      fence: { output: 'public/models/fence.glb', include: ['Fence'], targetHeight: 1.05 },
      barrel: { output: 'public/models/barrel.glb', include: ['Barrel'], targetHeight: 0.95 },
      cart: { output: 'public/models/cart.glb', include: ['Cart'], targetHeight: 1.25 },
      crate: { output: 'public/models/crate.glb', include: ['Box_01'], targetHeight: 0.8 },
      haystack: {
        output: 'public/models/haystack.glb', include: ['Haystack_02'], targetHeight: 1.1,
        /** Hay is amber-coloured, and amber-snapped triangles ride the
         *  emissive seam by default — a haystack that glows at night is not
         *  a prop, it is a joke. Straw is sand. */
        snapOverrides: { Material_main: 'sand' },
      },
      bonfire: { output: 'public/models/bonfire.glb', include: ['Bonfire'], targetHeight: 0.75 },
      logAxe: { output: 'public/models/logAxe.glb', include: ['Log'], targetHeight: 0.95 },
      /**
       * Ground flora, for the same liveliness note as the mushrooms. A
       * "Flover" turned out to be ONE wide flat daisy, not a cluster — at
       * the first 0.5 target it stood car-sized in the plaza, a Mario prop.
       * The 8:1 width-to-height ratio means these heights land the bloom
       * around 1.3–1.8 units across, a flowerbed seen from the fixed camera.
       */
      flowers1: { snapTolerance: 0.45, output: 'public/models/flowers1.glb', include: ['Flover_01'], targetHeight: 0.2 },
      flowers2: { snapTolerance: 0.45, output: 'public/models/flowers2.glb', include: ['Flover_02'], targetHeight: 0.18 },
      flowers3: { snapTolerance: 0.45, output: 'public/models/flowers3.glb', include: ['Flover_03'], targetHeight: 0.16 },
      grassTuft: { snapTolerance: 0.45, output: 'public/models/grassTuft.glb', include: ['Grass'], targetHeight: 0.22 },
      streetlight: {
        output: 'public/models/streetlight.glb', include: ['Streetlight'], targetHeight: 2.6,
        node: 'streetlightPhysical',
        colliders: [{ shape: 'cuboid', name: 'cuboid', size: [0.5, 2.6, 0.5], at: [0, 1.3, 0] }],
      },
    },
  },
};

// ------------------------------------------------------------------ helpers

const sRGB = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
};

/** glTF baseColorFactor is linear; the palette is authored in sRGB. */
const linearToSrgb = (c) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

/** Nearest assigned palette index to an sRGB colour, with its distance. */
export function nearestBand(rgb) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const p = sRGB(PALETTE[i]);
    const d = Math.hypot(rgb[0] - p[0], rgb[1] - p[1], rgb[2] - p[2]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, distance: bestD };
}

const bandIndex = (name) => {
  const index = COLOR[name];
  if (index === undefined) {
    throw new Error(`prep: "${name}" is not a palette colour (${Object.keys(COLOR).join(', ')})`);
  }
  return index;
};

/**
 * Decode every texture in a document to raw RGBA, keyed by the texture
 * object. This is the third kind of found model (after flat-material kits and
 * colourless merges): **texture-atlas packs**, where every face's UVs sit on
 * a colour patch of one painted image. Sampling the atlas at each triangle's
 * UV centroid recovers the colour the snap needs — `sharp` decodes the
 * embedded PNGs, and the bytes come back sRGB, which is the space the palette
 * is authored in, so `nearestBand` needs no conversion at all.
 */
export async function decodeTextures(document) {
  const sharp = (await import('sharp')).default;
  const textures = new Map();
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const { data, info } = await sharp(Buffer.from(image))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    textures.set(texture, { data, width: info.width, height: info.height });
  }
  return textures;
}

/** Nearest-texel sample at a UV, repeat-wrapped, returned as sRGB 0..1. */
function sampleTexture({ data, width, height }, u, v) {
  const wrap = (t) => ((t % 1) + 1) % 1;
  const x = Math.min(width - 1, Math.floor(wrap(u) * width));
  const y = Math.min(height - 1, Math.floor(wrap(v) * height));
  const i = (y * width + x) * 4;
  return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
}

/**
 * Pull triangles out of a document, world-transformed, tagged with their
 * source material name and colour. One flat soup — components are recovered
 * by welding, so however the exporter grouped primitives cannot matter.
 *
 * `include`/`exclude` select by *node name over the hierarchy*: a node is in
 * when it or an ancestor is named in `include` (or `include` is null), and a
 * subtree named in `exclude` is pruned whole. This is the extraction path for
 * models that kept their part structure — the buggy's wheels are nodes, so
 * they come out by name with no geometry surgery at all.
 *
 * With `textures` (from `decodeTextures`), a material that colours via a
 * baseColorTexture gets its per-triangle colour by sampling the atlas at the
 * triangle's UV centroid — the atlas-pack path. A plain baseColorFactor
 * still wins when there is no texture.
 */
function extractTriangles(document, { include = null, exclude = [], textures = null } = {}) {
  const positions = [];
  const normals = [];
  const triangles = []; // { a, b, c, color: [r,g,b] sRGB | null, materialName, nodeName }

  const m4 = new THREE.Matrix4();
  const n3 = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const includeSet = include ? new Set(include) : null;
  const excludeSet = new Set(exclude);

  const nodes = [];
  const visit = (node, included) => {
    if (excludeSet.has(node.getName())) return;
    if (includeSet && includeSet.has(node.getName())) included = true;
    if (node.getMesh() && (included || !includeSet)) nodes.push(node);
    for (const child of node.listChildren()) visit(child, included);
  };
  for (const scene of document.getRoot().listScenes()) {
    for (const child of scene.listChildren()) visit(child, false);
  }

  for (const node of nodes) {
    const mesh = node.getMesh();
    m4.fromArray(node.getWorldMatrix());
    n3.getNormalMatrix(m4);

    for (const primitive of mesh.listPrimitives()) {
      const pos = primitive.getAttribute('POSITION');
      const nrm = primitive.getAttribute('NORMAL');
      const uvAttr = primitive.getAttribute('TEXCOORD_0');
      const idx = primitive.getIndices();
      const material = primitive.getMaterial();

      let color = null;
      let atlas = null;
      const factor = material && material.getBaseColorFactor();
      const baseTexture = material && material.getBaseColorTexture();
      if (textures && baseTexture && textures.has(baseTexture)) {
        atlas = textures.get(baseTexture); // per-triangle colour, sampled below
      } else if (factor && !(factor[0] === 1 && factor[1] === 1 && factor[2] === 1)) {
        // A factor of pure white is Sketchfab's "no colour", not a colour.
        color = [linearToSrgb(factor[0]), linearToSrgb(factor[1]), linearToSrgb(factor[2])];
      }

      const base = positions.length / 3;
      const pArray = pos.getArray();
      const nArray = nrm ? nrm.getArray() : null;
      const uvArray = uvAttr ? uvAttr.getArray() : null;
      for (let i = 0; i < pos.getCount(); i++) {
        v.fromArray(pArray, i * 3).applyMatrix4(m4);
        positions.push(v.x, v.y, v.z);
        if (nArray) {
          v.fromArray(nArray, i * 3).applyMatrix3(n3).normalize();
          normals.push(v.x, v.y, v.z);
        } else {
          normals.push(0, 1, 0); // filled by the flat-normal pass below if absent
        }
      }
      const indices = idx ? idx.getArray() : [...Array(pos.getCount()).keys()];
      const materialName = material ? material.getName() : '';
      const nodeName = node.getName();
      for (let i = 0; i < indices.length; i += 3) {
        const [ia, ib, ic] = [indices[i], indices[i + 1], indices[i + 2]];
        let triangleColor = color;
        if (atlas && uvArray) {
          triangleColor = sampleTexture(
            atlas,
            (uvArray[ia * 2] + uvArray[ib * 2] + uvArray[ic * 2]) / 3,
            (uvArray[ia * 2 + 1] + uvArray[ib * 2 + 1] + uvArray[ic * 2 + 1]) / 3
          );
        }
        triangles.push({
          a: base + ia, b: base + ib, c: base + ic,
          color: triangleColor, materialName, nodeName,
        });
      }
    }
  }
  return { positions, normals, triangles };
}

/**
 * The explicit-transform pipeline, for parts that join a rig rather than
 * stand on the ground: rotate about Y, uniform scale, then either translate
 * by authored numbers or recentre on the part's own bounding-box centre
 * (what a wheel needs — its pivot is its own axle, not the model origin).
 * Mutates in place, like `normalise`.
 */
function applyTransform(positions, normals, { rotateY = 0, scale = 1, translate = [0, 0, 0], recenter = false }) {
  const count = positions.length / 3;
  const cos = Math.cos(rotateY);
  const sin = Math.sin(rotateY);
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    positions[i * 3] = (x * cos + z * sin) * scale;
    positions[i * 3 + 1] *= scale;
    positions[i * 3 + 2] = (-x * sin + z * cos) * scale;
    const nx = normals[i * 3];
    const nz = normals[i * 3 + 2];
    normals[i * 3] = nx * cos + nz * sin;
    normals[i * 3 + 2] = -nx * sin + nz * cos;
  }

  let tx;
  let ty;
  let tz;
  if (recenter) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], positions[i * 3 + k]);
        max[k] = Math.max(max[k], positions[i * 3 + k]);
      }
    }
    tx = -(min[0] + max[0]) / 2;
    ty = -(min[1] + max[1]) / 2;
    tz = -(min[2] + max[2]) / 2;
  } else {
    [tx, ty, tz] = translate;
  }
  for (let i = 0; i < count; i++) {
    positions[i * 3] += tx;
    positions[i * 3 + 1] += ty;
    positions[i * 3 + 2] += tz;
  }
}

/** Union-find over position-welded vertices: which component owns each triangle. */
function connectedComponents(positions, triangles) {
  const weld = new Map(); // exact position triple → weld id
  const weldOf = new Uint32Array(positions.length / 3);
  for (let i = 0; i < positions.length / 3; i++) {
    const key = `${positions[i * 3]},${positions[i * 3 + 1]},${positions[i * 3 + 2]}`;
    let id = weld.get(key);
    if (id === undefined) { id = weld.size; weld.set(key, id); }
    weldOf[i] = id;
  }

  const parent = new Uint32Array(weld.size).map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (x, y) => { parent[find(x)] = find(y); };

  for (const t of triangles) {
    union(weldOf[t.a], weldOf[t.b]);
    union(weldOf[t.b], weldOf[t.c]);
  }

  const componentOf = triangles.map((t) => find(weldOf[t.a]));
  const ids = [...new Set(componentOf)];
  return { componentOf, ids };
}

/**
 * The geometry normalisation: up-axis, uniform scale to `targetHeight`,
 * grounded at y = 0, origin under the recipe's `origin`. Mutates in place.
 */
function normalise(positions, normals, recipe) {
  const count = positions.length / 3;

  if (recipe.up === 'Z') {
    for (let i = 0; i < count; i++) {
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      positions[i * 3 + 1] = z;
      positions[i * 3 + 2] = -y;
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];
      normals[i * 3 + 1] = nz;
      normals[i * 3 + 2] = -ny;
    }
  } else if (recipe.up !== 'Y') {
    throw new Error(`prep: unknown up axis "${recipe.up}" (Y or Z)`);
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    minY = Math.min(minY, positions[i * 3 + 1]);
    maxY = Math.max(maxY, positions[i * 3 + 1]);
  }
  const scale = recipe.targetHeight / (maxY - minY);
  for (let i = 0; i < positions.length; i++) positions[i] *= scale;
  minY *= scale;

  // Origin: under the base (the XZ centroid of the lowest 5 % of vertices) or
  // the bbox centre. `base` is the default a standing prop wants — a side arm
  // drags a bbox centre off the post, and then the collider misses the wood.
  let cx = 0;
  let cz = 0;
  if ((recipe.origin ?? 'base') === 'base') {
    const cut = minY + recipe.targetHeight * 0.05;
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (positions[i * 3 + 1] > cut) continue;
      cx += positions[i * 3];
      cz += positions[i * 3 + 2];
      n++;
    }
    cx /= n; cz /= n;
  } else {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      minX = Math.min(minX, positions[i * 3]); maxX = Math.max(maxX, positions[i * 3]);
      minZ = Math.min(minZ, positions[i * 3 + 2]); maxZ = Math.max(maxZ, positions[i * 3 + 2]);
    }
    cx = (minX + maxX) / 2; cz = (minZ + maxZ) / 2;
  }
  for (let i = 0; i < count; i++) {
    positions[i * 3] -= cx;
    positions[i * 3 + 1] -= minY;
    positions[i * 3 + 2] -= cz;
  }
}

/**
 * Which band and material each triangle gets.
 *
 * Colour snap runs first when the recipe asks: a triangle whose source
 * material carried a colour is snapped regardless of rules. The rules then
 * cover whatever is left (everything, for a colourless Sketchfab merge).
 */
function assign(recipe, positions, triangles, componentOf) {
  // Per-component normalised Y bounds, for the rule predicates. Only needed
  // when there are rules — a pure colour-snap recipe never reads them.
  const bounds = new Map(); // component id → { minY, maxY }
  if (componentOf) {
    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      const id = componentOf[i];
      let b = bounds.get(id);
      if (!b) bounds.set(id, (b = { minY: Infinity, maxY: -Infinity }));
      for (const vi of [t.a, t.b, t.c]) {
        const y = positions[vi * 3 + 1];
        b.minY = Math.min(b.minY, y);
        b.maxY = Math.max(b.maxY, y);
      }
    }
  }

  return triangles.map((t, i) => {
    // An override by source material name beats everything — it exists for
    // the colour the palette has no answer for (the buggy's red lenses) and
    // for parts that need the emissive seam.
    const override = recipe.snapOverrides?.[t.materialName];
    if (override) {
      const entry = typeof override === 'string' ? { color: override } : override;
      return { band: bandIndex(entry.color), material: entry.material ?? 'palette' };
    }

    if (recipe.snapColors && t.color) {
      const { index, distance } = nearestBand(t.color);
      // A recipe may loosen the tolerance for deliberately fantastic colours
      // (the mushroom caps); the default stays tight so a palette gap keeps
      // announcing itself the way the wood gap did.
      if (distance > (recipe.snapTolerance ?? SNAP_TOLERANCE)) {
        const hex = t.color.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
        throw new Error(
          `prep: source colour #${hex} is ${distance.toFixed(2)} from every palette band ` +
          `(tolerance ${SNAP_TOLERANCE}) - the palette has no answer for it; assign it a rule instead`
        );
      }
      // Amber IS the emissive band (decision 13): a source colour that snaps
      // to it — a flame, a lamp's glass — is a light source by any honest
      // reading, so it rides the `paletteEmissive` seam and starts glowing
      // the day PoleLights lands. Anything amber-coloured that must NOT glow
      // (the haystack) gets an override to a non-emissive band instead.
      return {
        band: index,
        material: index === COLOR.amber ? 'paletteEmissive' : 'palette',
      };
    }

    // A rule matches on the height of the *component's centre* (normalised
    // 0..1 of model height) — a component is one physical part, so its parts
    // never straddle a rule boundary the way individual triangles would. A
    // model fused into a single component falls back to the triangle centroid,
    // which is the best that geometry can offer.
    const b = bounds.get(componentOf[i]);
    const single = bounds.size === 1;
    const cy = single
      ? (positions[t.a * 3 + 1] + positions[t.b * 3 + 1] + positions[t.c * 3 + 1]) / 3
      : (b.minY + b.maxY) / 2;
    const ny = cy / recipe.targetHeight;
    for (const rule of recipe.parts ?? []) {
      if (rule.above !== undefined && ny < rule.above) continue;
      if (rule.below !== undefined && ny > rule.below) continue;
      return { band: bandIndex(rule.color), material: rule.material ?? 'palette' };
    }
    throw new Error(`prep: no rule matched a triangle at normalised height ${ny.toFixed(3)}`);
  });
}

/**
 * Build the output document: one node per part, one primitive per material
 * name inside each. The lamp is the one-part case; the buggy ships two
 * (`buggyBody`, `buggyWheel`).
 *
 * @param {{ name: string, positions: number[], normals: number[],
 *           triangles: object[], assignments: object[], colliders?: object[] }[]} parts
 */
function buildOutput(recipe, parts, sourceAsset) {
  const document = new Document();
  const buffer = document.createBuffer();
  const materials = new Map(); // registry name → shared material, across parts
  const scene = document.createScene('scene');
  document.getRoot().setDefaultScene(scene);

  for (const part of parts) {
    const { positions, normals, triangles, assignments } = part;
    const groups = new Map(); // material name → { positions, normals, uvs, indices, vertexMap, bands }
    for (let i = 0; i < triangles.length; i++) {
      const { band, material } = assignments[i];
      let g = groups.get(material);
      if (!g) {
        groups.set(material, (g = {
          positions: [], normals: [], uvs: [], indices: [], vertexMap: new Map(), bands: new Map(),
        }));
      }
      g.bands.set(band, (g.bands.get(band) ?? 0) + 1);
      const u = paletteU(band);
      const t = triangles[i];
      for (const vi of [t.a, t.b, t.c]) {
        // Vertices are shared only within one band: the UV is per-band, so a
        // vertex on a band seam has to split, exactly as a Blender UV seam does.
        const key = `${vi}|${band}`;
        let out = g.vertexMap.get(key);
        if (out === undefined) {
          out = g.positions.length / 3;
          g.vertexMap.set(key, out);
          g.positions.push(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
          g.normals.push(normals[vi * 3], normals[vi * 3 + 1], normals[vi * 3 + 2]);
          g.uvs.push(u, 0.5);
        }
        g.indices.push(out);
      }
    }

    const mesh = document.createMesh(part.name);
    // Sorted so the output is deterministic — `--check` byte-compares it.
    for (const [name, g] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      let material = materials.get(name);
      if (!material) {
        // The band most triangles landed on colours the preview material, so
        // a glTF viewer shows roughly the game's look. Discarded by the
        // registry — and shared across parts, as the loader will share it.
        const majority = [...g.bands.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const preview = new THREE.Color(PALETTE[majority]);
        material = document.createMaterial(name)
          .setBaseColorFactor([preview.r, preview.g, preview.b, 1])
          .setMetallicFactor(0)
          .setRoughnessFactor(1)
          .setDoubleSided(true);
        materials.set(name, material);
      }

      const primitive = document.createPrimitive()
        .setAttribute('POSITION', document.createAccessor().setType('VEC3')
          .setArray(new Float32Array(g.positions)).setBuffer(buffer))
        .setAttribute('NORMAL', document.createAccessor().setType('VEC3')
          .setArray(new Float32Array(g.normals)).setBuffer(buffer))
        .setAttribute('TEXCOORD_0', document.createAccessor().setType('VEC2')
          .setArray(new Float32Array(g.uvs)).setBuffer(buffer))
        .setIndices(document.createAccessor().setType('SCALAR')
          .setArray(g.positions.length / 3 <= 65535
            ? new Uint16Array(g.indices)
            : new Uint32Array(g.indices))
          .setBuffer(buffer))
        .setMaterial(material);
      mesh.addPrimitive(primitive);
    }

    const node = document.createNode(part.name).setMesh(mesh);
    for (const collider of part.colliders ?? []) {
      // Scale is the collider's whole language (`colliderParameters` reads
      // half-extents from scale/2, cylinder radius from scale.x/2 — so scale.x
      // is the DIAMETER). The child has no mesh, exactly like a Blender empty.
      let scale;
      if (collider.shape === 'cuboid') {
        scale = collider.size;
      } else if (collider.shape === 'tube') {
        scale = [collider.radius * 2, collider.height, collider.radius * 2];
      } else {
        throw new Error(`prep: collider shape "${collider.shape}" not implemented (cuboid or tube)`);
      }
      node.addChild(document.createNode(collider.name)
        .setTranslation(collider.at)
        .setScale(scale));
    }
    scene.addChild(node);
  }

  // The credit rides the file, not just CREDITS.md — copied verbatim from the
  // source's Sketchfab extras (author, licence, source URL).
  const asset = document.getRoot().getAsset();
  asset.generator = 'gamified-portfolio prep-model';
  if (sourceAsset?.extras) asset.extras = sourceAsset.extras;

  return document;
}

/** Re-read the written bytes and hold them against everything the recipe promised.
 *  Exported so check-prep can prove it fails on tampered bytes. */
export async function verify(io, bytes, recipe, sourceTriangles) {
  const document = await io.readBinary(bytes);
  const failures = [];

  let triangles = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  const materialNames = [];
  const perMesh = new Map(); // mesh name → triangle count
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getIndices().getCount() / 3;
      triangles += count;
      perMesh.set(mesh.getName(), (perMesh.get(mesh.getName()) ?? 0) + count);
      materialNames.push(primitive.getMaterial().getName());

      const pos = primitive.getAttribute('POSITION').getArray();
      for (let i = 1; i < pos.length; i += 3) {
        minY = Math.min(minY, pos[i]);
        maxY = Math.max(maxY, pos[i]);
      }

      // Every UV must sit at v = 0.5 on the centre of an *assigned* band —
      // never headroom, never between bands.
      const uv = primitive.getAttribute('TEXCOORD_0').getArray();
      for (let i = 0; i < uv.length; i += 2) {
        const slot = Math.floor((uv[i] * PALETTE_WIDTH) / BAND);
        const centred = Math.abs(uv[i] - paletteU(slot)) < 1e-6;
        if (!centred || slot >= PALETTE.length || uv[i + 1] !== 0.5) {
          failures.push(`UV (${uv[i]}, ${uv[i + 1]}) is not the centre of an assigned band`);
          break;
        }
      }
    }
  }

  // Three independent promises, each checked when the recipe makes it:
  // authored per-part counts (rig pieces), groundedness at the authored
  // height (standing props — which a wheel centred on its axle deliberately
  // has no claim to), and triangle conservation against what was extracted.
  for (const [name, expected] of Object.entries(recipe.expect ?? {})) {
    const got = perMesh.get(name) ?? 0;
    if (got !== expected) failures.push(`part "${name}": ${got} tris != expected ${expected}`);
  }
  if (recipe.targetHeight != null) {
    if (Math.abs(minY) > 1e-4) failures.push(`not grounded: minY ${minY}`);
    if (Math.abs(maxY - minY - recipe.targetHeight) > 1e-3) {
      failures.push(`height ${(maxY - minY).toFixed(4)} != target ${recipe.targetHeight}`);
    }
  }
  if (sourceTriangles != null && triangles !== sourceTriangles) {
    failures.push(`triangle count ${triangles} != source ${sourceTriangles}`);
  }

  for (const node of document.getRoot().listNodes()) {
    const problem = diagnoseName(node.getName());
    if (problem) failures.push(problem);
  }
  for (const collider of recipe.colliders ?? []) {
    const node = document.getRoot().listNodes().find((n) => n.getName() === collider.name);
    if (!node || !parseColliderShape(node.getName())) {
      failures.push(`collider child "${collider.name}" missing or unparseable`);
    }
  }
  const expectedMaterials = new Set(['palette', 'paletteEmissive']);
  for (const name of materialNames) {
    if (!expectedMaterials.has(name)) failures.push(`material "${name}" is not a registry name`);
  }

  return failures;
}

// ---------------------------------------------------------------- pipeline

/** Run one recipe end to end. Returns the verified GLB bytes without writing. */
export async function prepRecipe(name, { io = new NodeIO() } = {}) {
  const recipe = RECIPES[name];
  if (!recipe) throw new Error(`prep: no recipe named "${name}" (${Object.keys(RECIPES).join(', ')})`);
  return prep(recipe, { io, source: readFileSync(recipe.source) });
}

/** The mesh-bearing node names inside the subtrees rooted at `names`. */
function meshNodesUnder(document, names) {
  const set = new Set(names);
  const found = new Set();
  const visit = (node, inside) => {
    if (set.has(node.getName())) inside = true;
    if (inside && node.getMesh()) found.add(node.getName());
    for (const child of node.listChildren()) visit(child, inside);
  };
  for (const scene of document.getRoot().listScenes()) {
    for (const child of scene.listChildren()) visit(child, false);
  }
  return found;
}

/**
 * Run a whole pack recipe: one source read, one texture decode, N verified
 * game-ready GLBs. Returns Map<itemName, bytes>; `main` writes them.
 *
 * Each item is a standing prop sharing the pack's snap settings. `nodes`
 * splits an item into named output nodes (a tree's `treeBody`/`treeLeaves`)
 * partitioned by *source node name*, all normalised together in one frame —
 * unlike the buggy's `extract`, nothing is recentred, so the trunk and its
 * crown keep standing on the same ground.
 */
export async function prepPack(name, { io = new NodeIO(), pack = RECIPES[name] } = {}) {
  if (!pack?.items) throw new Error(`prep: "${name}" is not a pack recipe`);

  const sourceDocument = await io.readBinary(new Uint8Array(readFileSync(pack.source)));
  const sourceAsset = sourceDocument.getRoot().getAsset();
  const textures = pack.snapColors ? await decodeTextures(sourceDocument) : null;

  const results = new Map();
  for (const [itemName, item] of Object.entries(pack.items)) {
    const { positions, normals, triangles } = extractTriangles(sourceDocument, {
      include: item.include, textures,
    });
    if (triangles.length === 0) {
      throw new Error(`prep: pack item "${itemName}" selected no geometry - check its include names`);
    }
    normalise(positions, normals, { up: 'Y', ...item });

    const itemRecipe = {
      ...pack, ...item,
      snapColors: pack.snapColors || item.snapColors,
      snapOverrides: { ...pack.snapOverrides, ...item.snapOverrides },
    };
    const assignments = assign(itemRecipe, positions, triangles, null);

    let parts;
    if (item.nodes) {
      parts = item.nodes.map((spec) => {
        const under = meshNodesUnder(sourceDocument, spec.include);
        const partTriangles = [];
        const partAssignments = [];
        for (let i = 0; i < triangles.length; i++) {
          if (!under.has(triangles[i].nodeName)) continue;
          partTriangles.push(triangles[i]);
          partAssignments.push(assignments[i]);
        }
        // The shared position/normal arrays are safe to hand to every part:
        // buildOutput dedups per part, so unused vertices are never emitted.
        return { name: spec.name, positions, normals, triangles: partTriangles, assignments: partAssignments };
      });
      const claimed = parts.reduce((n, p) => n + p.triangles.length, 0);
      if (claimed !== triangles.length) {
        throw new Error(
          `prep: pack item "${itemName}" partitioned ${claimed} of ${triangles.length} triangles - ` +
          `its nodes[].include lists miss some source geometry`
        );
      }
    } else {
      parts = [{
        name: item.node ?? itemName, positions, normals, triangles, assignments,
        colliders: item.colliders,
      }];
    }

    const output = buildOutput(itemRecipe, parts, sourceAsset);
    const bytes = Buffer.from(await io.writeBinary(output));
    const failures = await verify(io, new Uint8Array(bytes), itemRecipe, triangles.length);
    if (failures.length) {
      throw new Error(`prep: pack item "${itemName}" failed verification:\n  ${failures.join('\n  ')}`);
    }
    results.set(itemName, bytes);
  }
  return results;
}

/** The pure core: bytes + recipe in, verified bytes out. check-prep drives this. */
export async function prep(recipe, { io = new NodeIO(), source }) {
  const sourceDocument = await io.readBinary(new Uint8Array(source));
  const sourceAsset = sourceDocument.getRoot().getAsset();
  const textures = recipe.snapColors ? await decodeTextures(sourceDocument) : null;

  let parts;
  let sourceTriangles;
  if (recipe.extract) {
    // Rig pieces by node name — the model kept its structure, so subtree
    // selection replaces the connectivity split entirely.
    parts = recipe.extract.map((entry) => {
      const { positions, normals, triangles } = extractTriangles(sourceDocument, { ...entry, textures });
      if (triangles.length === 0) {
        throw new Error(`prep: extract "${entry.node}" selected no geometry - check its include/exclude names`);
      }
      applyTransform(positions, normals, entry.transform ?? {});
      const assignments = assign(recipe, positions, triangles, null);
      return { name: entry.node, positions, normals, triangles, assignments };
    });
    sourceTriangles = parts.reduce((n, p) => n + p.triangles.length, 0);
  } else {
    const { positions, normals, triangles } = extractTriangles(sourceDocument, { textures });
    normalise(positions, normals, recipe);
    const { componentOf } = connectedComponents(positions, triangles);
    const assignments = assign(recipe, positions, triangles, componentOf);
    parts = [{
      name: recipe.node, positions, normals, triangles, assignments,
      colliders: recipe.colliders,
    }];
    sourceTriangles = triangles.length;
  }

  const output = buildOutput(recipe, parts, sourceAsset);

  const bytes = Buffer.from(await io.writeBinary(output));
  const failures = await verify(io, new Uint8Array(bytes), recipe, sourceTriangles);
  if (failures.length) {
    throw new Error(`prep: output failed verification:\n  ${failures.join('\n  ')}`);
  }
  return bytes;
}

/** The component table `--report` prints: what the part rules are written against. */
export async function report(name, { io = new NodeIO() } = {}) {
  const recipe = RECIPES[name];
  const sourceDocument = await io.readBinary(new Uint8Array(readFileSync(recipe.source)));
  const { positions, normals, triangles } = extractTriangles(sourceDocument);
  normalise(positions, normals, recipe);
  const { componentOf, ids } = connectedComponents(positions, triangles);

  const rows = ids.map((id) => {
    const box = {
      minX: Infinity, maxX: -Infinity, minY: Infinity,
      maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, tris: 0,
    };
    for (let i = 0; i < triangles.length; i++) {
      if (componentOf[i] !== id) continue;
      box.tris++;
      const t = triangles[i];
      for (const vi of [t.a, t.b, t.c]) {
        box.minX = Math.min(box.minX, positions[vi * 3]);
        box.maxX = Math.max(box.maxX, positions[vi * 3]);
        box.minY = Math.min(box.minY, positions[vi * 3 + 1]);
        box.maxY = Math.max(box.maxY, positions[vi * 3 + 1]);
        box.minZ = Math.min(box.minZ, positions[vi * 3 + 2]);
        box.maxZ = Math.max(box.maxZ, positions[vi * 3 + 2]);
      }
    }
    return box;
  });
  rows.sort((a, b) => b.tris - a.tris);

  const h = recipe.targetHeight;
  console.log(`prep --report ${name}: ${triangles.length} tris, ${ids.length} component(s), after normalise (height ${h})\n`);
  console.log('  tris    x                y (ny)                   z');
  for (const r of rows) {
    console.log(
      `  ${String(r.tris).padStart(5)}` +
      `   ${r.minX.toFixed(2)}..${r.maxX.toFixed(2)}`.padEnd(17) +
      `  ${r.minY.toFixed(2)}..${r.maxY.toFixed(2)} (${(r.minY / h).toFixed(2)}..${(r.maxY / h).toFixed(2)})`.padEnd(25) +
      `  ${r.minZ.toFixed(2)}..${r.maxZ.toFixed(2)}`
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const io = new NodeIO();

  if (args[0] === '--report') {
    await report(args[1] ?? Object.keys(RECIPES)[0], { io });
    return;
  }

  const checking = args[0] === '--check';
  const handle = (output, bytes, source) => {
    if (checking) {
      const onDisk = existsSync(output) ? readFileSync(output) : Buffer.alloc(0);
      if (!bytes.equals(onDisk)) {
        console.error(`prep --check: ${output} does not match its recipe - run npm run prep`);
        process.exit(1);
      }
      console.log(`  ${output.padEnd(36)} matches its recipe (${bytes.length} bytes)`);
    } else {
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, bytes);
      console.log(`  ${source} -> ${output}  (${bytes.length} bytes, verified)`);
    }
  };

  for (const name of Object.keys(RECIPES)) {
    const recipe = RECIPES[name];
    if (recipe.items) {
      const results = await prepPack(name, { io });
      for (const [itemName, bytes] of results) {
        handle(recipe.items[itemName].output, bytes, `${name}:${itemName}`);
      }
    } else {
      handle(recipe.output, await prepRecipe(name, { io }), recipe.source);
    }
  }
}

const invokedDirectly = process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop());
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
