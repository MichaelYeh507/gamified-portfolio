import * as THREE from 'three/webgpu';

/**
 * One palette texture colours the entire world.
 *
 * This is the single highest-leverage trick from the the reference site teardown:
 * the reference's whole site is coloured by a 1,504-byte image. Every mesh shares one
 * material and one texture; a mesh's "colour" is just which texel its UVs point
 * at. Consequences worth stating plainly:
 *
 *   - Recolouring the entire site means editing this one file.
 *   - Texture weight is effectively zero.
 *   - Every mesh sharing a material is a merge/instancing candidate, so draw
 *     calls stay tiny.
 *
 * When real art arrives from Blender, bake the same UVs there and nothing here
 * has to change.
 *
 * ---
 *
 * **Which file is the source of truth: this one.** `public/palette.png` is
 * generated from `paletteBytes()` by `npm run palette`, committed, and checked
 * by `npm run palette:check`. It is a build product that happens to live in the
 * repo, because Blender needs a file on disk to put in an image node and a
 * generator is no use to it.
 *
 * The direction is one-way and it is chosen rather than accidental:
 *
 *   - **Only the array can serve both consumers.** `makeContentMaterial`
 *     samples the texture, but `makeTextMaterial`, `makeWaterMaterial`,
 *     `Lighting` and `Reveal` build `THREE.Color` uniforms synchronously at
 *     construction time. Make the PNG authoritative and every one of those has
 *     to wait on a network load before a material can exist.
 *   - **A hex array diffs.** A PNG's diff is `Bin 328 -> 331 bytes`, which is
 *     not a review of a colour change.
 *   - **The names live with the values.** `COLOR.foliageDark` cannot survive a
 *     round trip through an image.
 *
 * **And the file still wins where it has to.** `F` §5.5's point is that a 1-px
 * band bleeds the moment the palette goes through KTX2, so the shipped artifact
 * has to be block-aligned — which is what decision 14's four-pixel bands buy.
 * When the asset build step lands (Phase 3A) the runtime will sample
 * `palette.ktx` compiled from this PNG instead of this `DataTexture`, and that
 * swap is lossless *only* because each slot owns exactly one aligned 4x4 block.
 * The array stays where colours are edited; the file becomes what is read.
 * `palette:check` exists to stop the two drifting in the window where both are
 * live.
 */

/**
 * The image layout, decision 14: **128 x 4, four-pixel bands, 32 slots.**
 *
 * `BAND` is 4 and `PALETTE_HEIGHT` is 4 for one reason, and it is the reason
 * the whole format exists (`F` §5.1): **ETC1S, UASTC, BCn and ASTC all compress
 * in 4x4 blocks.** A slot that is exactly one aligned block cannot bleed into
 * its neighbour under any of them, which is how the reference author runs `--encode uastc`
 * over a 24-colour image and gets pixel-exact results back. Our 1-px bands were
 * exact only because we generated the texture in JS and never compressed it;
 * the first KTX2 build would have put three neighbours inside every block.
 *
 * Four pixels is also the **UV placement tolerance**, and that half is what
 * decision 37 spends. Measured off the reference's `benches.glb`, the reference's own band centres miss
 * by up to 0.4 px — the reference author drops UV islands onto a band by eye in Blender and the
 * band width absorbs the error. One pixel would not.
 *
 * `SLOTS` is 32 and we use 16. the reference author needed 24 for one world.
 */
export const BAND = 4;
export const SLOTS = 32;
export const PALETTE_WIDTH = SLOTS * BAND; // 128
export const PALETTE_HEIGHT = BAND; // one block tall, four identical rows

/**
 * What an unassigned slot is painted.
 *
 * **the reference author leaves the reference's eight spare slots pure black; ours are magenta, and the
 * deviation is deliberate.** Black is a colour this palette already has at
 * index 15, so a UV island that slipped off the end of the assigned range would
 * land on something that looks plausible — a dark prop reads as a dark prop.
 * Magenta cannot be mistaken for intent in the Blender viewport or in the game,
 * which is worth more than matching the reference's file on eight slots that carry no
 * information. Nothing downstream depends on the value: it is overwritten the
 * moment a slot is assigned.
 */
export const HEADROOM_COLOR = '#ff00ff';

// A moss-and-slate island under a cold indigo void, lit by warm amber.
// Not a departure from the reference author's palette, as this comment used to claim: the reference's base
// is sand, olive, terracotta and gold, and the synthwave read comes entirely
// from a separate emissive layer. Ours is close to the reference's by accident. The
// identity work belongs in the accent layer — the rim, the lamps, the emissives.
export const PALETTE = [
  '#7d8f68', // 0  grass
  '#5d7350', // 1  grass dark
  '#c9b489', // 2  sand / path
  '#8d8375', // 3  dirt
  '#5b6472', // 4  rock
  '#3f4653', // 5  rock dark
  '#d8d2c4', // 6  building light
  '#a9a294', // 7  building mid
  '#4e7a4b', // 8  foliage
  '#375c3a', // 9  foliage dark
  '#e4703a', // 10 accent warm
  '#3fa9a0', // 11 accent cool
  '#ffb454', // 12 emissive amber (the rim)
  '#1b2740', // 13 water
  '#e8ecf2', // 14 near-white
  '#20242c', // 15 near-black
  // Added 31 Aug, the first spend of decision 14's headroom: the found-asset
  // packs are full of wooden props (fence, cart, barrel, crate) and the
  // palette had no brown — the retint tool's nearest-band snap sent all of
  // it to accent warm, and a world of bright-orange fences is not a world of
  // wood. Two entries, lit and shadow, like the other material pairs.
  '#8a5f3c', // 16 wood
  '#5e412a', // 17 wood dark
];

export const COLOR = {
  grass: 0,
  grassDark: 1,
  sand: 2,
  dirt: 3,
  rock: 4,
  rockDark: 5,
  buildingLight: 6,
  buildingMid: 7,
  foliage: 8,
  foliageDark: 9,
  accentWarm: 10,
  accentCool: 11,
  amber: 12,
  water: 13,
  white: 14,
  black: 15,
  wood: 16,
  woodDark: 17,
};

/** The void the world floats in, and the colour of the reveal seam. */
export const VOID_COLOR = new THREE.Color('#05070c');
export const GRID_GLYPH = new THREE.Color('#4a63c0');
export const GRID_LINE = new THREE.Color('#22306b');
export const RIM_COLOR = new THREE.Color('#ffb454');

/**
 * The two colours the flat toon material shades with.
 *
 * There is no third. A lit surface is `albedo x LIGHT_COLOR x intensity`; a
 * shadowed one is `albedo x SHADOW_COLOR`. Everything you see is one of those
 * two versions of a palette entry, or a mix of them.
 *
 * `SHADOW_COLOR` is a tint, not a brightness. Multiplying the albedo by an
 * indigo is what stops shadows going muddy the way a plain darken does, and it
 * is the same indigo the void grid is drawn in, so the shadows belong to the
 * same world as the backdrop.
 */
export const LIGHT_COLOR = new THREE.Color('#fff0d8');
export const SHADOW_COLOR = new THREE.Color('#6b7fb8');

if (PALETTE.length > SLOTS) {
  throw new Error(`palette has ${PALETTE.length} colours but only ${SLOTS} slots`);
}

/** The u at the centre of slot `index`'s band. */
export function paletteU(index) {
  return (index * BAND + BAND / 2) / PALETTE_WIDTH;
}

/**
 * The palette image as bytes: `PALETTE_WIDTH x PALETTE_HEIGHT`, RGBA, row-major.
 *
 * **The single place a palette byte is produced.** `paletteTexture()` uploads
 * this, `tools/build-palette.mjs` writes `public/palette.png` from it, and both
 * run the same code in the same order, so the file cannot disagree with the
 * texture about a colour. That property is the whole reason this is a function
 * and not two loops.
 *
 * All four rows are written identically. the reference author's are not — the reference's carry a handful
 * of +/-1 differences from having been painted rather than generated (measured
 * on `reference/source/static/palette.png`: bands 1, 2, 15, 16, 17, 20 and
 * 21 differ between rows). Ours being identical is what makes `v` a free
 * coordinate: `paint()` writes `v = 0.5`, which lands on row 2 of 4, and if the
 * rows ever diverged that arbitrary choice would silently start to matter.
 *
 * ---
 *
 * **The bytes are the sRGB values, extracted with `getHex(SRGBColorSpace)` —
 * and the round trip through `THREE.Color` is the one place this file can go
 * wrong. It did.** `Color.set()` converts a hex into the *linear* working
 * space, so `c.r` for `#7d8f68` is 0.2051, not 0.4902; writing `round(c.r *
 * 255)` into a texture tagged `SRGBColorSpace` had the GPU decoding sRGB a
 * second time, and the whole world rendered ~6× darker than authored —
 * `#344623` where this file said `#7d8f68`. It also made the same palette
 * index give two colours: `makeContentMaterial` samples this texture and got
 * the dark value, while the text, water, lighting and reveal build
 * `THREE.Color` uniforms and got the authored one. Found 20 Aug, preserved
 * through the format change so that change moved nothing on screen, judged by
 * Michael on a live A/B 23 Aug, and fixed the same day — his palette bytes are
 * authored sRGB too, so this now matches the reference author's pipeline as well as itself.
 * The whole story is `KNOWN-ISSUES.md` 22.
 */
export function paletteBytes() {
  const data = new Uint8Array(PALETTE_WIDTH * PALETTE_HEIGHT * 4);
  const c = new THREE.Color();

  for (let slot = 0; slot < SLOTS; slot++) {
    c.set(PALETTE[slot] ?? HEADROOM_COLOR);
    const hex = c.getHex(THREE.SRGBColorSpace);
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8) & 0xff;
    const b = hex & 0xff;

    for (let x = slot * BAND; x < (slot + 1) * BAND; x++) {
      for (let y = 0; y < PALETTE_HEIGHT; y++) {
        const i = (y * PALETTE_WIDTH + x) * 4;
        data[i + 0] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
  }

  return data;
}

let cached = null;

export function paletteTexture() {
  if (cached) return cached;

  const texture = new THREE.DataTexture(
    paletteBytes(),
    PALETTE_WIDTH,
    PALETTE_HEIGHT,
    THREE.RGBAFormat
  );
  // Nearest + no mips: we are sampling exact texels, never blending between
  // palette entries. Mipmaps would average neighbouring colours at distance.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  cached = texture;
  return texture;
}

/**
 * Point every vertex of a geometry at the centre of one palette band.
 *
 * Decision 37's second half: this is the path for geometry **we** generate.
 * Anything Blender made carries its palette UVs from Blender instead, and the
 * two paths have to agree on where a band is — which is why the u comes from
 * `paletteU` rather than from anything local.
 *
 * The band centre is exact here because there is no eye involved. Hand-placed
 * islands in Blender get the other 2 px of the band as tolerance.
 */
export function paint(geometry, index) {
  if (!Number.isInteger(index) || index < 0 || index >= PALETTE.length) {
    // Not a range check on SLOTS: painting an unassigned slot would come back
    // as HEADROOM_COLOR magenta, which is a marker for a UV that went wrong in
    // Blender, not something code should ever be able to ask for.
    throw new Error(`paint(): ${index} is not a palette index (0..${PALETTE.length - 1})`);
  }

  const u = paletteU(index);
  const count = geometry.attributes.position.count;
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    uv[i * 2 + 0] = u;
    uv[i * 2 + 1] = 0.5;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
