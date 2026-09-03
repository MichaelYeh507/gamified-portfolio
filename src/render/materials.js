import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  normalWorld,
  texture,
  uv,
  positionWorld,
  positionLocal,
  attribute,
  cameraPosition,
  smoothstep,
  max,
  min,
  mix,
  vec2,
  vec3,
  vec4,
  uniform,
  hash,
  step,
} from 'three/tsl';
import {
  paletteTexture,
  paletteU,
  GRID_GLYPH,
  GRID_LINE,
  PALETTE,
  COLOR,
  BAND,
  PALETTE_WIDTH,
} from './palette.js';
import { HEADLIGHT } from './Night.js';

/**
 * The world's materials. It was "two for the whole world" (content and void,
 * the reveal system's complementary halves) until 2 Sep's texture session;
 * now content is a family — the same flat-toon pipeline over different
 * albedos (the palette texture for props, `makeTerrainAlbedo`'s depth
 * gradient for the ground and every grass blade) — and the water is the reference's
 * transparent-surface construction rather than a colour-carrying plane.
 * Everything still reads the same reveal uniforms, so the discs and clips
 * stay one system.
 */

/**
 * Everything solid: terrain, buildings, props, the car.
 *
 * A flat toon material, ported from
 * `reference/source/sources/Game/Materials/MeshDefaultMaterial.js`. There
 * is no diffuse term anywhere in it. A surface is its palette colour times the
 * light tint; all form comes from mixing toward the same palette colour times
 * the shadow tint. You only ever see two versions of any colour, which is what
 * makes a sixteen-entry palette read as a deliberate style instead of an
 * unfinished one — real PBR gradients spread each entry over a continuum and
 * the palette stops being legible.
 *
 * It extends `MeshLambertNodeMaterial` and then overrides `outputNode`, so
 * nothing of Lambert's shading survives. Lambert is inherited purely for
 * three's light and shadow plumbing, which is what makes the
 * `receivedShadowNode` interception below possible.
 *
 * **On the back-face normal flip we did not port.** The reference's material flips the
 * normal itself for DoubleSide/BackSide (`MeshDefaultMaterial.js:76-79`), and
 * `KNOWN-ISSUES.md` #1 called our missing copy of it a bug. It is not one on
 * three r0.185.1: `normalView` — and therefore `normalWorld` — already runs
 * `negateOnBackSide()`, which multiplies by `faceDirection`
 * (`frontFacing ? 1 : -1`) for a DoubleSide material
 * (`three/src/nodes/accessors/Normal.js:105`,
 * `three/src/nodes/display/FrontFacingNode.js:91-107`). Adding the reference's flip on top
 * flips twice and puts the bug back. Measured on the terrain underside, which
 * is pure back faces with the sun above it: with the extra flip it renders lit
 * (`#36421f`), without it, correctly shadowed (`#131f18`).
 *
 * The one case that would need an explicit flip again is `flatShading = true`,
 * or geometry with no `normal` attribute — `NodeBuilder.isFlatShading()` makes
 * three skip its own flip in both.
 */
export function makeContentMaterial({
  reveal,
  lighting,
  sky = null,
  water = null,
  side = THREE.FrontSide,
  wind = null,
  night = null,
  /**
   * Albedo override, added 2 Sep for the terrain gradient and the grass: the
   * whole toon pipeline — waterline band, cel shadow, rim, headlights, fog —
   * over a colour that comes from somewhere other than the palette texture.
   * When set, the amber-band emissive test is skipped: it rides the palette
   * UVs, which an overridden albedo's geometry may not even carry.
   */
  albedo = null,
  /** Position override for geometry that builds itself in the vertex stage
   *  (the grass blades). Mutually exclusive with `wind`, which is itself a
   *  position node reading the `sway` attribute. */
  positionNode = null,
  /** Normal override for geometry that carries no normal attribute — the
   *  grass points its blades straight up, the reference's `normalNode: vec3(0, 1, 0)`. */
  normal = null,
}) {
  const material = new THREE.MeshLambertNodeMaterial();
  material.side = side;
  if (positionNode) material.positionNode = positionNode;

  /**
   * Ambient motion, opt-in per material.
   *
   * **Opt-in rather than always-on, and that is not caution.** The wind reads a
   * per-vertex `sway` attribute, and a geometry that does not carry one would
   * feed the shader an undefined attribute. Terrain, the car and the plaza have
   * no business swaying, so the alternative — writing a zero attribute onto
   * every geometry in the world to keep one node graph uniform — costs a float
   * per vertex across 14,777 vertices to move nothing.
   *
   * `SWAY` is written by `world/Island.js`, and it is a **hinge weight** rather
   * than a mask: 0 at the root, rising with height, squared. That is what makes
   * a tree bend instead of slide. The offset is horizontal only — a vertical
   * component would pull foliage through its own trunk.
   *
   * Set on `material.positionNode` rather than baked into `outputNode`, so three
   * carries it into the **depth and shadow passes too** — otherwise the shadow
   * stays where the geometry used to be and the tree detaches from it. That is
   * three's documented behaviour for `positionNode`; what was measured here is
   * the colour pass, where 8,525 samples of a 256 x 256 render move between two
   * wind phases and exactly 0 move between two renders at the same phase.
   */
  if (wind) {
    material.positionNode = Fn(() => {
      const sway = attribute('sway', 'float');
      const offset = wind.offsetNode(positionWorld.xz).mul(sway);
      return positionLocal.add(vec3(offset.x, 0, offset.y));
    })();
  }
  // Set explicitly, as the reference's is. Left null, three derives DoubleSide from
  // `side`, which draws every prop into the shadow map twice for no benefit on
  // closed geometry. Measured: it makes no visible difference to the prop
  // self-shadow aliasing (see KNOWN-ISSUES) — this is a cost choice, not a fix.
  material.shadowSide = THREE.FrontSide;

  const albedoNode = albedo ?? texture(paletteTexture(), uv()).rgb;
  /**
   * Whether the colour comes from the palette texture, so the amber-band
   * emissive test below can ride the UVs. Decided HERE, outside the shader
   * function: inside it `albedo` is the fragment's colour var, and from
   * 2 Sep to 3 Sep the test read `albedo === null` on that shadowed name —
   * never true, so no lamp, lens, flame or glow-cap lit up in any material,
   * while the in-world type (its own material) kept glowing and hid it.
   * Michael caught it on the live site: "the two street lamps in the
   * projects section are not glowing."
   */
  const paletteAlbedo = albedo === null;

  /**
   * Siphon the shadow term out of three's pipeline.
   *
   * Returning 1 means three multiplies its own diffuse by nothing — we have
   * already thrown that result away — while the raw shadow value lands in a var
   * we can spend as a *colour ramp* rather than a brightness multiply. This is
   * how you keep the shadow-map machinery (cascades, bias, PCF) under a
   * completely non-photoreal shading model.
   */
  const caughtShadow = float(1).toVar();
  material.receivedShadowNode = Fn(([shadow]) => {
    caughtShadow.mulAssign(shadow.r);
    return float(1);
  });

  material.outputNode = Fn(() => {
    reveal.clipContent();

    const albedo = albedoNode.toVar();
    const outputColor = albedo.toVar();

    /**
     * The waterline, and it costs four nodes.
     *
     * The reference's whole shore-foam effect is: any fragment whose world Y is within
     * `surfaceThickness` of `surfaceElevation` is painted pure white, on both
     * the lit colour and the albedo the shadow tint is built from
     * (`MeshDefaultMaterial.js:92-97`). No foam texture, no distance field, no
     * second pass — a 0.026-unit-tall white band drawn on everything that
     * happens to intersect the water, which the shore dish and every prop
     * standing in the shallows do automatically.
     *
     * Applied here rather than after the lighting so that the band survives
     * into shadow: a foam line that vanishes where the island shades itself
     * would read as a lighting bug rather than as water.
     */
    if (water) {
      const atWaterline = positionWorld.y
        .sub(water.surfaceElevation)
        .abs()
        .lessThan(water.surfaceThickness);
      const foam = vec3(1, 1, 1);
      outputColor.assign(atWaterline.select(foam, outputColor));
      albedo.assign(atWaterline.select(foam, albedo));
    }

    // NO explicit back-face normal flip here, deliberately. See the note above
    // the function: `normalWorld` arrives already flipped.
    const surfaceNormal = normal ?? normalWorld;

    // The light. A flat multiply — no N·L, no ambient.
    outputColor.mulAssign(lighting.colorUniform.mul(lighting.intensityUniform));

    // Core shadow: the cel ramp over N·L. The reference's form is
    // `dot.smoothstep(edgeHigh, edgeLow)`, which chains to
    // `smoothstep(1, -0.25, dot)` — a FALLING ramp, undefined in WGSL and
    // silently zero on our backend, which would delete this term entirely and
    // leave every object lit dead flat. Written rising and inverted instead;
    // for the Hermite cubic the two are exactly equal.
    const coreShadowMix = smoothstep(
      lighting.coreShadowEdgeLow,
      lighting.coreShadowEdgeHigh,
      surfaceNormal.dot(lighting.directionUniform)
    ).oneMinus();

    // Drop shadow: whatever the shadow map caught above.
    const dropShadowMix = caughtShadow.oneMinus();

    // Both resolve to the same tinted colour, so the stronger one wins rather
    // than the two compounding into black where they overlap.
    const shadowMix = max(coreShadowMix, dropShadowMix).clamp(0, 1);
    outputColor.assign(mix(outputColor, albedo.mul(lighting.shadowColorUniform), shadowMix));

    // The seam: a thin bright ring, additive, deliberately far over 1.0 so the
    // bloom pass turns it into the glow rather than the ramp faking one.
    //
    // The exponent went 3 → 2 when `rimWidth` went 2.4 → 0.12. A cubic on a
    // 2.4-wide ramp was doing the narrowing that the width itself now does; the
    // same cubic on a 0.12 ramp would leave a lit band of about 0.02 units,
    // which is under a pixel at the far side of frame and would crawl. Squared,
    // the half-brightness point sits ~0.035 inside the seam — the reference's 0.05 hard
    // band, drawn as a ramp so it antialiases (`KNOWN-ISSUES.md` 2).
    //
    // 5.5 is the reference's `intensity` verbatim. Our rim colour is already ~1.0 in red, so
    // the peak lands at 5.5 against a bloom threshold of 1 — the same headroom
    // the reference's has, rather than the 2.6 that was chosen when a 2.4-wide band had to
    // carry all the glow itself.
    outputColor.addAssign(reveal.rimColor.mul(reveal.rim.pow(2.0)).mul(reveal.rimIntensity));

    /**
     * The night terms — the whole of the PoleLights design, as two adds.
     *
     * **Amber is the emissive band** (the retint tool routes every light
     * source onto band 12), so "which texels glow" is a test on the palette
     * *u*: within the amber band's 4-px slot, add the albedo normalised to
     * luminance 1 (`B` §3.5 — hue never changes bloom behaviour) times the
     * night intensity. At 2.5 against a bloom threshold of 1, every lamp
     * chamber, lens, flame, glow-cap and flower heart in the world lights
     * up through dusk and goes out at dawn — merged scatter included,
     * because the test rides the UVs, not the material name.
     *
     * **The headlights are a cone in the same shader**, because this
     * material ignores three's lights entirely — a real SpotLight would
     * illuminate nothing. The beam brightens the ground's *own* albedo
     * (warm-tinted), so it reads as light falling on the world. Both
     * distance ramps are written RISING and inverted — the WGSL
     * falling-smoothstep trap this file already documents once.
     */
    if (night) {
      if (paletteAlbedo) {
        const isEmissive = uv()
          .x.sub(paletteU(COLOR.amber))
          .abs()
          .lessThan((BAND / 2 - 0.4) / PALETTE_WIDTH);
        const luminanceOf = albedo.dot(vec3(0.2126, 0.7152, 0.0722)).max(0.001);
        const glow = albedo.div(luminanceOf).mul(night.emissiveIntensity);
        outputColor.addAssign(glow.mul(isEmissive.select(float(1), float(0))));
      }

      const toPoint = positionWorld.sub(night.headlightPosition);
      const dist = toPoint.length();
      const along = toPoint.div(dist.max(0.001)).dot(night.headlightDirection);
      const cone = along
        .sub(HEADLIGHT.coneCos)
        .div(1 - HEADLIGHT.coneCos)
        .clamp(0, 1)
        .pow(2.0);
      const reach = smoothstep(float(2.0), float(HEADLIGHT.range), dist).oneMinus();
      const beam = cone.mul(reach).mul(night.headlightIntensity);
      outputColor.addAssign(albedo.mul(vec3(1.0, 0.9, 0.68)).mul(beam).mul(1.6));
    }

    /**
     * Fog, last of all, and toward the *same node* the background is drawn
     * from. That identity is the whole point (decision 1): a surface at the far
     * plane resolves to exactly the colour behind it, so the island has no
     * silhouette against the sky and there is no horizon to see.
     *
     * Applied after the rim rather than before, so a distant seam washes out
     * with everything else instead of glowing through the fog.
     */
    if (sky) outputColor.assign(mix(outputColor, sky.color, sky.strength));

    return vec4(outputColor, 1.0);
  })();

  return material;
}

/**
 * In-world type: a palette colour cut out by a text mask.
 *
 * The reference's equivalent is `ProjectsArea.js:254-292` — a full toon material with
 * `alphaNode: texture(textTexture).r` bolted on, so the reference's type is lit and
 * shadowed like everything else. Ours takes the alpha idea and drops the
 * lighting, for one reason worth stating: **type has to stay legible at every
 * hour.** The day cycle runs `lightIntensity` down at night, and a shaded label
 * mixed toward the indigo shadow tint would be a dark glyph on a dark plate at
 * exactly the point somebody is trying to read a project's name. Flat palette
 * colour times the light tint keeps it in the world's palette while holding its
 * contrast against the plate behind it.
 *
 * `colorIndex` rather than a UV lookup, because the plane's UVs are already
 * spoken for by the text mask and a mesh has only one channel-0 UV. That is the
 * conflict the reference's Blender-authored planes solve with a second UV set, and picking
 * the colour on the CPU is the cheaper answer for text we generate ourselves.
 */

/**
 * How hard in-world type glows at full night, against `EMISSIVE_NIGHT` = 2.5.
 * 0.5 puts a white glyph at ~1.25 of glow plus its dim lit colour — over the
 * bloom threshold of 1, softly, where the lamps sit at 2.5. Labels should
 * read as lit stone inscriptions beside real lights, not as the lights.
 */
const TEXT_GLOW = 0.5;
export function makeTextMaterial({
  map,
  colorIndex,
  reveal,
  lighting,
  sky = null,
  wipe = null,
  night = null,
  emissive = null,
}) {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
  });

  const base = uniform(new THREE.Color(PALETTE[colorIndex]));
  const mask = texture(map);

  /**
   * `colorNode` + `opacityNode` as plain node expressions, not an `Fn` returning
   * a `vec4` — and **not** `reveal.clipContent()`, which is a discard.
   *
   * `makeVoidMaterial` already learned this and says so: on a transparent
   * surface the reveal is applied as an alpha mask rather than a discard,
   * because discard semantics inside a shared node graph are not something to
   * lean on. Building this the other way produced a mesh that was visible,
   * correctly placed, correctly sized — and drew nothing at all, which is the
   * exact failure that lesson predicts.
   */
  /**
   * Always-emissive type — the reference's career labels exactly
   * (`CareerArea.js:116`): `baseColor.div(luminance(baseColor)).mul(1.7)`,
   * unlit, at every hour. Glyphs that carry their own light read over any
   * ground, which is what makes the reference's corridor legible with no sign boards
   * behind the text at all. `emissive` is the multiplier (the reference's 1.7); when
   * set, the day-cycle lighting does not touch the type — only the fog does.
   */
  let rgb;
  if (emissive !== null) {
    const c = new THREE.Color(PALETTE[colorIndex]);
    const luminance = Math.max(0.001, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    rgb = uniform(c.clone().multiplyScalar(emissive / luminance));
  } else {
    rgb = base.mul(lighting.colorUniform).mul(lighting.intensityUniform);
  }

  /**
   * The night glow — Michael, 31 Aug: *"make the career section glow like his
   * does so we can see it well during the night too."* In-world type joins
   * the emissive layer: a luminance-normalised term (`B` §3.5 — hue never
   * changes bloom behaviour) scaled by the same `emissiveIntensity` every
   * lamp, lens and flame fades with, so labels bloom softly legible through
   * dusk and go out at dawn. This is also decision 13 doing its job: the
   * identity layer is the rim, the lamps and the emissives, and glowing
   * night type is squarely the third of those. Applied before the fog, like
   * the content material's own night term, so a distant glowing label still
   * dissolves into the sky.
   *
   * The luminance is computed in JS — `base` is a known palette colour, not
   * a texture read — so the shader carries one uniform, no dot product.
   */
  if (night) {
    const c = new THREE.Color(PALETTE[colorIndex]);
    const luminance = Math.max(0.001, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    const glow = uniform(c.clone().multiplyScalar(TEXT_GLOW / luminance));
    rgb = rgb.add(glow.mul(night.emissiveIntensity));
  }

  // Fog toward the same node the background is drawn from, so a distant label
  // dissolves with the surface it is written on rather than floating in front
  // of it (decision 1).
  if (sky) rgb = mix(rgb, sky.color, sky.strength);
  material.colorNode = rgb;

  const insideDisc = smoothstep(reveal.radius.sub(0.8), reveal.radius, reveal.distance).oneMinus();
  let opacity = mask.r.mul(insideDisc);

  /**
   * The career corridor's label wipe — the reference's
   * `step(uv.x, labelReveal).lessThan(0.5).discard()` (`CareerArea.js:110`),
   * folded into the opacity instead of a discard for the reason this file
   * already records twice: on a transparent surface the mask is the mechanism.
   * `wipe` is a uniform running −0.1 → 1.1; the text writes itself on left to
   * right as it rises. Written as a rising smoothstep and inverted — the WGSL
   * falling-ramp trap, again.
   */
  if (wipe) opacity = opacity.mul(smoothstep(wipe.sub(0.08), wipe, uv().x).oneMinus());

  material.opacityNode = opacity;

  return material;
}

/**
 * A project screenshot, inset into a monolith's recess.
 *
 * Opaque, so unlike `makeTextMaterial` this one *can* use the reveal's discard —
 * that restriction is about transparent surfaces, and `makeContentMaterial`
 * discards the same way.
 *
 * The image is tinted by the light colour and fogged like everything else,
 * which matters more than it sounds: an untinted photograph pasted into a
 * flat-toon world is the single most common way this style breaks, because the
 * picture stops belonging to the same evening as the object holding it. The reference's
 * board does the same (`ProjectsArea.js:363-390` mixes toward the shade
 * uniform), and it is why the reference's screenshots read as objects in the world rather
 * than as browser windows floating in it.
 *
 * **`intensity` is deliberately not `lighting.intensityUniform`.** That runs
 * well over 1 by day — 2.53 when measured — which would blow a photograph to
 * white where it only brightens a flat palette colour. Clamped, the image
 * tracks the time of day without ever leaving its own tonal range.
 */
export function makeImageMaterial({ map, reveal, lighting, sky = null }) {
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });

  material.colorNode = Fn(() => {
    reveal.clipContent();
    const rgb = texture(map).rgb.toVar();
    rgb.mulAssign(mix(vec3(1, 1, 1), lighting.colorUniform, 0.65));
    rgb.mulAssign(min(lighting.intensityUniform, float(1.0)));
    if (sky) rgb.assign(mix(rgb, sky.color, sky.strength));
    return rgb;
  })();

  return material;
}

/**
 * The void floor: a field of × glyphs on a faint grid, discarded wherever the
 * island covers it. Unlit on purpose — it reads as a backdrop, not a surface.
 */
export function makeVoidMaterial(reveal, { cellSize = 2.0, fadeStart = 60, fadeEnd = 300 } = {}) {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const glyphColor = uniform(new THREE.Color().copy(GRID_GLYPH));
  const lineColor = uniform(new THREE.Color().copy(GRID_LINE));
  const scale = uniform(1 / cellSize);

  // These are plain node expressions, not Fn() bodies. Two reasons: an Fn that
  // returns a JS object of nodes is not a thing TSL supports, and the void is a
  // transparent surface, so the reveal is applied as an alpha mask rather than
  // a discard. Masking by alpha is equivalent here and avoids relying on
  // discard semantics inside a shared node graph.
  //
  // NOTE: smoothstep's edges must be increasing. Passing edge0 > edge1 is
  // undefined behaviour in both WGSL and GLSL, so every falling ramp below is
  // written as a rising one and inverted.
  const cell = positionWorld.xz.mul(scale).fract().sub(0.5);

  // An × is the intersection of two diagonal bands, clipped to a small disc.
  const cross = min(cell.x.sub(cell.y).abs(), cell.x.add(cell.y).abs());
  const radial = smoothstep(0.09, 0.18, cell.length()).oneMinus();
  const glyph = smoothstep(0.0, 0.045, cross).oneMinus().mul(radial);

  // Long hairlines every 8 cells give the void a sense of scale and travel.
  const major = positionWorld.xz.mul(scale.mul(0.125)).fract().sub(0.5).abs();
  const line = smoothstep(0.0, 0.006, min(major.x, major.y)).oneMinus();

  // Fade toward the horizon so the plane never shows a hard edge.
  const fade = smoothstep(fadeStart, fadeEnd, positionWorld.distance(cameraPosition))
    .oneMinus();

  // The complement of the island: 0 inside the reveal disc, 1 outside it.
  const outside = smoothstep(reveal.radius, reveal.radius.add(0.8), reveal.distance);

  material.colorNode = mix(lineColor, glyphColor, glyph);
  material.opacityNode = glyph.max(line.mul(0.55)).mul(fade).mul(outside);

  return material;
}

/**
 * The terrain's albedo — the reference's colour system, on our palette (2 Sep, Michael:
 * "the reference's roads and land actually have gradient and texture that blend in well
 * with each area... the reference's water is see through").
 *
 * The reference's `Terrain.colorNode` is a 3-stop gradient sampled by the ground's own
 * height channel — orange sand at the top, teal in the shallows, navy in the
 * deeps — with a grass colour mixed in by the texture's density channel. The
 * consequence that matters: **the water's colour lives on the GROUND, not on
 * the water plane**, which is what lets the reference's surface be transparent and the reference's
 * car stay visible while wading. This node is that system with the stops
 * pinned to palette entries, plus a broad two-tone perlin over the grass so
 * the land carries texture instead of one flat texel.
 *
 * Returns an `Fn` over a world-XZ vec2 so the terrain mesh and every grass
 * blade sample the identical colour — a blade is indistinguishable from the
 * ground it stands on, which is the reference's exact grass trick.
 */
export function makeTerrainAlbedo({ terrain, water, noises, tracks = null, slabs = null }) {
  const grass = uniform(new THREE.Color(PALETTE[COLOR.grass]));
  const grassDark = uniform(new THREE.Color(PALETTE[COLOR.grassDark]));
  const sand = uniform(new THREE.Color(PALETTE[COLOR.sand]));
  const shallow = uniform(new THREE.Color(PALETTE[COLOR.accentCool]));
  const deep = uniform(new THREE.Color(PALETTE[COLOR.water]));
  /**
   * The reference's paving, `Floor.js:47-65`: a flagstone texture tiled at 0.175/unit,
   * coloured between a low and a high warm tone by its grey, mixed into
   * the ground by the slab channel × a broad perlin so the paving is worn
   * through in patches rather than laid as a decal. The reference's tones are
   * `#a87762` → `#ffcf8b`; ours are the palette's dirt → building light.
   */
  const slabLow = uniform(new THREE.Color(PALETTE[COLOR.dirt]));
  const slabHigh = uniform(new THREE.Color(PALETTE[COLOR.buildingLight]));
  const { scale, offset } = terrain.uvTransform;

  return Fn(([worldXZ]) => {
    const data = texture(terrain.texture(), worldXZ.mul(scale).add(offset));
    const depth = water.surfaceElevation.sub(data.r);

    // The wheel tracks erase the cover where the tyres went — the reference's
    // `data.g.mulAssign(tracks.r.oneMinus())` — so the ground under a
    // trampled blade shows its sand.
    const cover = tracks ? data.g.mul(tracks.eraseNode(worldXZ).oneMinus()) : data.g;

    // Above water: sand under a grass cover, the grass two-toned by a broad
    // noise field so open land reads as ground rather than as a fill colour.
    const tone = texture(noises.perlin, worldXZ.mul(0.035)).r;
    const grassColor = mix(grassDark, grass, smoothstep(0.3, 0.7, tone));
    const dry = mix(sand, grassColor, cover).toVar();

    if (slabs) {
      const stones = texture(slabs, worldXZ.mul(0.175)).r;
      const slabColor = mix(slabLow, slabHigh, stones);
      const wear = smoothstep(0.25, 0.75, texture(noises.perlin, worldXZ.mul(0.03)).r);
      dry.assign(mix(dry, slabColor, data.a.mul(wear)));
    }

    // Below: the reference's gradient, sand → shallow teal → deep navy by depth. The
    // sand start is what keeps a painted road readable across a ford — the
    // shallow crossing shows sandy ground through thin water, exactly as the reference's
    // shallow stop is orange.
    const wet = mix(sand, shallow, smoothstep(0.05, 0.5, depth)).toVar();
    wet.assign(mix(wet, deep, smoothstep(0.5, 1.15, depth)));

    return mix(dry, wet, smoothstep(0.0, 0.12, depth));
  });
}

/**
 * The water — rebuilt 2 Sep to the reference's actual construction, measured out of
 * `WaterSurface.js` on Michael's call ("his water is see through when the
 * car is in the water, has moving currents"). What the reference's 467 lines actually
 * ship: a plane whose **alpha is zero except where details draw** — the
 * colour of the water is the terrain gradient underneath (see
 * `makeTerrainAlbedo`), and the surface itself carries only white detail:
 *
 *   - a **shore band** near the waterline (the reference's `shoreNode`, a threshold on
 *     the ground channel) — ours is a depth window pulled up past the fords'
 *     depth, so a crossing gets foam edges instead of a white lid;
 *   - the reference's **ripples**: depth contours scrolled by the wind clock and broken
 *     by perlin (`WaterSurface.js:92-112`, formula ported near-verbatim) —
 *     the moving currents;
 *
 * everything else — transparent, so the car wades in plain sight and the
 * deeps read navy because the ground down there is navy.
 */
export function makeWaterMaterial({
  terrain,
  water,
  reveal,
  lighting,
  noises,
  wind,
  sky = null,
  /** The weather's rain, 0..1, and a clock for the splashes (2 Sep). */
  rain = null,
  time = null,
}) {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const foam = uniform(new THREE.Color(PALETTE[COLOR.white]));

  const { scale, offset } = terrain.uvTransform;
  const groundUv = positionWorld.xz.mul(scale).add(offset);
  const ground = texture(terrain.texture(), groundUv).r;

  /** Positive where there is water over the ground, negative on dry land. */
  const depth = water.surfaceElevation.sub(ground);

  /**
   * The reference's `terrainData.b`, in HIS orientation: 0 at the waterline, 1 at the
   * floor. The reference's gradient is sampled at `1 − b` (orange at 0, navy at 1), so
   * the reference's b grows with depth — and the reference's ripple formula subtracts `1.3 − 1.3b`,
   * which thins the contours out toward the deep. The first port (2 Sep)
   * normalised floor → waterline, the reverse, and Michael's first drive
   * caught it in one line: "the deep water has flashing white waves on the
   * entire thing" — every contour that belonged on the reference's shallows was
   * scrolling across our open sea.
   */
  const b = depth.div(water.surfaceElevation.sub(water.depthElevation)).clamp(0, 1);

  material.colorNode = Fn(() => {
    // White detail, lit by the day cycle so the currents dim with the world,
    // then fogged toward the same node everything fogs toward.
    const base = foam.mul(lighting.colorUniform.mul(lighting.intensityUniform)).toVar();
    if (sky) base.assign(mix(base, sky.color, sky.strength));
    return base;
  })();

  /**
   * Cut the plane off at the shoreline, with a little noise so the edge is a
   * shoreline rather than a contour line. The noise is two sines rather than a
   * texture read: at a tenth of a unit of amplitude nobody can tell, and it
   * saves carrying a noise texture into 2a for one use.
   */
  const wobble = positionWorld.x
    .mul(0.9)
    .sin()
    .mul(positionWorld.z.mul(1.1).cos())
    .mul(0.045);

  /**
   * And the reveal, folded into the opacity rather than applied as a discard.
   *
   * The water has to obey the disc or the intro shows a whole ocean around a
   * four-unit patch of ground. Folding it into opacity instead of calling
   * `reveal.clipContent()` is the same choice the void grid makes: this is a
   * transparent surface, `Discard` inside a separate `colorNode` graph would
   * not be reached by the opacity test, and a masked alpha is equivalent here.
   * The 0.8-unit ramp matches the void's so the two edges retreat together.
   *
   * In practice the seam never actually crosses water — the expansion stops at
   * 30 and the nearest beach is at 37.5 — so this is insurance against the
   * island shrinking, not an effect anyone will see.
   */
  const insideDisc = smoothstep(reveal.radius.sub(0.8), reveal.radius, reveal.distance).oneMinus();

  /**
   * The alpha, which IS the water now. `cut` removes the plane on dry land
   * (the old shoreline wobble, kept); inside that, the surface only exists
   * where a detail draws.
   */
  const cut = smoothstep(0.0, 0.05, depth.add(wobble)).mul(insideDisc);

  material.opacityNode = Fn(() => {
    // The shore band: a white ring hugging the coast, starting past the
    // fords' splash depth (≤ ~0.06) so a road crossing keeps its sand.
    const shore = smoothstep(0.05, 0.1, depth)
      .mul(smoothstep(0.18, 0.34, depth).oneMinus());

    // The reference's ripples, near-verbatim: elevation contours scrolled by the wind
    // clock, index-hashed into the perlin so each contour breaks up
    // differently, thresholded at the reference's ratio-1 edge (−0.4). With b in the reference's
    // orientation the contours are densest just past the shore band and
    // gone by ~0.8 of depth, so the open sea and the trunk's middle stay
    // navy and the currents live on the banks — the reference's read.
    const slope = b.add(wind.localTime.mul(0.5)).mul(10.0);
    const rippleIndex = slope.floor();
    const rippleNoise = texture(
      noises.perlin,
      positionWorld.xz.add(rippleIndex.div(0.345)).mul(0.1)
    ).r;
    const ripples = slope.fract()
      .sub(b.mul(1.3).sub(0.3).oneMinus())
      .add(rippleNoise);
    // Method-form step: (−0.4 ≥ ripples), the reference's line's actual meaning.
    const rippleMask = float(-0.4).step(ripples);

    // The shallowest water is where the reference's formula is densest — in the reference's world
    // that is under the shore band anyway. Ours fades the ripples in as the
    // shore band fades out, so a ford (≤ ~0.06 deep) keeps its sand and the
    // white detail hands over continuously instead of stacking.
    const rippleGate = smoothstep(0.18, 0.34, depth);

    const detail = max(shore, rippleMask.mul(rippleGate).mul(0.85)).toVar();

    /**
     * Rain splashes — HIS `splashesNode` (`WaterSurface.js:158-211`), ported
     * line for line on 3 Sep, after a day of home-grown rings that never
     * stopped reading as a lattice. Seven looks from Michael, each a tune
     * of our own construction (jittered hashed cells ~1.2 units across, a
     * ring per cell per cycle, then sparser, then re-rolled, then gated by
     * distance, by a density patch, by the open sea), and the record of
     * them is in git: every version was a field of separate ~0.5-unit
     * rings, and a field of separate rings is dots however they are
     * timed. **The reference's are not rings you can count.** The reference's voronoi is sampled
     * at 0.33 per world unit with eight cells per tile, so a cell is ~0.4
     * units across — three times smaller than ours — every cell rings at
     * full rain (visibility is `rain²`, not a fixed sparse fraction), and
     * the phase is per cell plus a drifting perlin, so the whole surface
     * carries a fine, fast, irregular shimmer rather than a scatter of
     * circles. That is the thing the eye reads as rain on water, and it is
     * what ours was missing by construction, not by tuning. The reference's words in
     * the chat: "take a look at how the reference author does the ripple / rain, cus we've
     * been on this for a while now and its not really working."
     *
     * The construction, the reference's: `r` of the voronoi is the distance to the
     * cell's point; subtract a per-cell clock and take it mod 1, and the
     * band under `thickness` is a ring expanding from the point once per
     * cycle; `g` (the gap to the next cell) thins the ring toward the cell
     * edge so rings never touch; `b` seeds the phase and the visibility.
     * The clock is the wind's, at the reference's `splashesTimeFrequency` 6. Method-form
     * `.step()` is kept exactly as the reference author wrote it (receiver is x, argument is
     * edge — the TSL trap this file already records), because the reference's numbers
     * were tuned against that reading.
     *
     * Ours, on top of the reference's: the depth gate (a ford keeps its sand) and the
     * open-sea gate from the fifth look — the reference's world has no sea to ring.
     */
    if (rain && time && noises.voronoi) {
      const splashesNoiseFrequency = 0.33;
      const splashesTimeFrequency = 6.0;
      const splashesThickness = 0.3;
      const splashesEdgeAttenuationLow = 0.14;
      const splashesEdgeAttenuationHigh = 1.0;

      const splashesVoronoi = texture(noises.voronoi, positionWorld.xz.mul(splashesNoiseFrequency));
      const splashPerlin = texture(noises.perlin, positionWorld.xz.mul(splashesNoiseFrequency * 0.25)).r;

      // Base
      const splash = splashesVoronoi.r.toVar();

      // Time
      const splashTimeRandom = hash(splashesVoronoi.b.mul(123456)).add(splashPerlin);
      const splashTime = wind.localTime.mul(splashesTimeFrequency).add(splashTimeRandom);
      splash.assign(splash.sub(splashTime).mod(1));

      // Thickness
      const edgeMultiplier = splashesVoronoi.g.remapClamp(splashesEdgeAttenuationLow, splashesEdgeAttenuationHigh, 0, 1);
      const thickness = edgeMultiplier.mul(splashesThickness);
      splash.assign(splash.step(thickness).oneMinus());

      // Visibility: the reference's `splashesRatio` is rain². Ours is rain² × 0.45 —
      // Michael, on the port's first look: "too much ripples, isn't
      // proportional to what it would look like with the rain lines". The
      // streaks were halved on 2 Sep ("too much rain"); the rings follow.
      const splashVisibilityRandom = hash(splashesVoronoi.b.mul(654321));
      const visible = splashVisibilityRandom.add(splashPerlin).mod(1).toVar();
      visible.assign(rain.mul(rain).mul(0.45).step(visible));
      splash.assign(splash.mul(visible));

      const inland = smoothstep(52.0, 42.0, positionWorld.xz.length());
      detail.assign(max(detail, splash.mul(inland).mul(smoothstep(0.02, 0.1, depth))));
    }

    return detail.mul(cut);
  })();

  return material;
}

/** A flat unlit material for gizmos and debug geometry. */
export function makeFlatMaterial(color) {
  const material = new THREE.MeshBasicNodeMaterial({ wireframe: true });
  material.colorNode = vec3(color.r, color.g, color.b);
  return material;
}
