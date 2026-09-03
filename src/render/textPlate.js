import * as THREE from 'three/webgpu';

/**
 * Short static text, drawn to a canvas and used as a **mask** rather than as a
 * picture.
 *
 * Ported from `reference/source/sources/Game/TextCanvas.js` plus the
 * material half at `ProjectsArea.js:254-292`. The reference's whole in-world type system is
 * two ideas:
 *
 * **The canvas is black with white text, and only its red channel is read** —
 * `alphaNode: texture(textTexture).r`. So the canvas never supplies colour, only
 * a shape; the colour comes from the world's own shading, which is what keeps
 * in-world type inside the palette instead of beside it.
 *
 * **Its dimensions are in world units, with `density` as pixels per unit.** The reference's
 * title is `TextCanvas(family, 700, 0.4, 4, 0.6, 200)` — a 4 × 0.6 plate at 200
 * px/unit, so an 800 × 120 canvas carrying 80 px type. Authoring in world units
 * means a plate's text is the right size by construction rather than by trial.
 *
 * What is deliberately *not* ported: `D` §7 is right that the DOM does wrapping,
 * selection, translation and accessibility properly, and ~600 lines of the reference's slice
 * are canvas text doing those badly. This is for **short static labels on
 * surfaces** — a project title carved on a board — and nothing else. Prose lives
 * in the card.
 */

/** The reference's in-world face, and the one Michael picked. Google Fonts, OFL. */
export const DISPLAY_FONT = Object.freeze({ family: 'Amatic SC', weight: 700 });

/** Pixels per world unit. The reference's number. */
const DENSITY = 200;

/**
 * Make sure the face is actually available before anything draws with it.
 *
 * **This is the trap that makes canvas type look fine in development and wrong
 * in production.** `context.fillText` does not wait for a webfont: if the face
 * has not loaded, it silently draws in the fallback and the texture is baked
 * wrong forever, because nothing ever redraws it. The reference's build dodges it side-on,
 * with a hidden `<div class="font amatic-sc" data-font="700 20px 'Amatic SC'">`
 * plus `display=block` on the Google Fonts URL to force an eager fetch
 * (`sources/index.html:58`). Waiting on `document.fonts` is the direct version.
 *
 * Times out rather than blocking the boot. A font CDN that is slow or blocked
 * must degrade to a fallback face, not to a site that never starts — the same
 * call `main.js` makes when it puts a timeout on `waitForFrames`.
 */
export async function loadDisplayFont(timeoutMs = 3000) {
  const spec = `${DISPLAY_FONT.weight} 200px "${DISPLAY_FONT.family}"`;
  if (!document.fonts?.load) return false;

  try {
    await Promise.race([
      document.fonts.load(spec),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    /* fall through to the check, which is the thing that actually decides */
  }

  const ready = document.fonts.check(spec);
  if (!ready) {
    console.warn(
      `[text] "${DISPLAY_FONT.family}" did not load in ${timeoutMs} ms; ` +
        'in-world labels will be drawn in the fallback face.'
    );
  }
  return ready;
}

/**
 * A canvas-backed texture whose red channel is the text.
 *
 * @param {object} options
 * @param {string|string[]} options.text      one line, or several
 * @param {number} options.width              plate width, world units
 * @param {number} options.height             plate height, world units
 * @param {number} options.fontSize           cap-ish height, world units
 * @param {number} [options.density]          pixels per world unit
 * @param {number} [options.lineHeight]       world units between baselines
 */
export function makeTextTexture({
  text,
  width,
  height,
  fontSize,
  density = DENSITY,
  lineHeight = fontSize * 1.05,
  bold = false,
}) {
  const lines = Array.isArray(text) ? text : [text];

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * density);
  canvas.height = Math.ceil(height * density);

  const ctx = canvas.getContext('2d');
  const px = fontSize * density;
  ctx.font = `${DISPLAY_FONT.weight} ${px}px "${DISPLAY_FONT.family}"`;

  // Black ground, white text: the mask convention the material reads .r from.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  /**
   * Shrink to fit rather than overflow.
   *
   * The reference's has no equivalent and does not need one — the reference's strings are hand-checked
   * against hand-authored plates. Ours come from `content/projects.js`, where a
   * title is written months after the plate was sized, so the failure has to be
   * "slightly small" instead of "runs off the edge".
   */
  const maxWidth = canvas.width * 0.9;
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width);
  if (widest > maxWidth) {
    ctx.font = `${DISPLAY_FONT.weight} ${px * (maxWidth / widest)}px "${DISPLAY_FONT.family}"`;
  }

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  /**
   * `bold` strokes each glyph with its own outline before filling — Amatic
   * SC ships only one real weight above regular, and its 700 is still a
   * thin handwriting face. A stroke at ~5% of the glyph size thickens every
   * stem without changing metrics, which is what "bolder" means for a mask
   * whose only channel is coverage.
   */
  if (bold) {
    // Post-shrink glyph size, read back out of the font string ("700 80px …").
    const glyphPx = parseFloat(/([\d.]+)px/.exec(ctx.font)?.[1] ?? px);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, glyphPx * 0.05);
    ctx.lineJoin = 'round';
  }

  const step = lineHeight * density;
  lines.forEach((line, i) => {
    const y = canvas.height / 2 + (i - (lines.length - 1) / 2) * step;
    if (bold) ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
  });

  const texture = new THREE.Texture(canvas);
  // Linear rather than the reference's Nearest: the reference author is after a deliberately pixelly look and
  // compensates with a high density, and our type is smaller on screen than the reference's
  // — at our sizes Nearest crawls along glyph edges as the camera slides.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  /**
   * **`flipY` stays true here, and copying the reference's `false` renders the type upside
   * down.** It is a genuine trap, because the reference's value is correct in the reference's build.
   *
   * glTF puts the UV origin at the **top left**, so three sets `flipY = false`
   * on every texture a GLTFLoader produces — and all of the reference's text planes are
   * Blender exports. A three-native `PlaneGeometry` uses the opposite
   * convention: v = 1 at the top edge, v = 0 at the bottom.
   *
   * Measured rather than reasoned, with a canvas inked only in its top third:
   * at `flipY = false` the mesh's top edge samples canvas row 127 (blank) and
   * its bottom edge samples row 0 (the ink). At `flipY = true` the top edge
   * samples row 0. So the default is the correct one for geometry we generate,
   * and the reference's value only travels with the reference's geometry.
   */
  texture.needsUpdate = true;
  return texture;
}

/** A plane carrying that texture, sized in world units. */
export function makeTextPlate({ text, width, height, fontSize, material, lineHeight, bold }) {
  const texture = makeTextTexture({ text, width, height, fontSize, lineHeight, bold });
  const geometry = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geometry, material(texture));
  // Type is a decal on something that already casts and receives. Letting it do
  // either puts a comb along every glyph — `KNOWN-ISSUES.md` 11, on geometry
  // thin enough that it would be nothing but artefact.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
