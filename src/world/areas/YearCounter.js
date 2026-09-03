import * as THREE from 'three/webgpu';
import { Fn, float, texture, uv, positionGeometry, uniform, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { digitsTextureBytes, COUNTER_HALF_WIDTH } from './careerTimeline.js';

/**
 * The corridor's year counter — the reference's design, this time measured as well as
 * read. `areas.glb` settles what the report and even the reference's source left open:
 * **the reference's digits lie flat on the ground** — horizontal planes at y 0.13, world
 * AABBs with zero vertical extent — glowing pavement, not a display on a
 * stand. That is the whole trick behind "so clear to read": a flat readout
 * can never occlude a stone, never collide with one, and reads perfectly
 * from a camera 34° above the horizon (the landing's ground decals proved
 * the same thing). An inactive segment drops below the terrain, and the
 * opaque ground swallows it — the reference's housing was the earth all along.
 *
 * The rest is the reference's verbatim: 7×10 pattern DataTexture, `uv(1)` carrying the
 * segment index, one uniform per digit, and `vec4(1.7)` — flat overbright
 * white, unlit, unfogged, blooming at every hour (`CareerArea.js:213-229`).
 *
 * Sized up from the reference's: the reference's row is 1.6 units long, authored for a corridor the reference's
 * visitors know; ours is the first thing a stranger reads, so the row fills
 * the `COUNTER_HALF_WIDTH` budget the dryness sweep checks.
 */

/** Digit proportions, in world units of ground footprint. */
const DIGIT = Object.freeze({
  width: 0.56,
  length: 0.9, // along the ground, away from the camera
  bar: 0.105,
  gap: 0.13,
});

/** How far an inactive segment sinks — comfortably below the flat ground. */
const DROP = 1.2;

/** Float just above the terrain, clear of z-fighting. */
const LIFT = 0.05;

function digitsTexture() {
  const tex = new THREE.DataTexture(digitsTextureBytes(), 7, 10, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * One digit's seven segments as thin boxes **lying in the ground plane**:
 * built upright in XY, then rotated flat so the glyph's top points up-screen
 * (the ground-decal orientation the landing uses). Baking the rotation into
 * the geometry is what keeps the shader's drop axis honest — `positionNode`
 * displaces in object space, and after the bake, object Y is still world Y,
 * so a dropped bar goes down into the earth rather than sliding sideways.
 */
function digitGeometry() {
  const { width: w, length: h, bar: t } = DIGIT;
  const depth = 0.04;
  const horizontal = [w - t * 1.3, t, depth];
  const vertical = [t, h / 2 - t * 1.2, depth];

  // Segment order matches DIGIT_SEGMENTS: a, b, c, d, e, f, g.
  const boxes = [
    { size: horizontal, at: [w / 2, h - t / 2] }, // a  top
    { size: vertical, at: [w - t / 2, h * 0.75] }, // b  top-right
    { size: vertical, at: [w - t / 2, h * 0.25] }, // c  bottom-right
    { size: horizontal, at: [w / 2, t / 2] }, // d  bottom
    { size: vertical, at: [t / 2, h * 0.25] }, // e  bottom-left
    { size: vertical, at: [t / 2, h * 0.75] }, // f  top-left
    { size: horizontal, at: [w / 2, h / 2] }, // g  middle
  ];

  const parts = boxes.map((box, segment) => {
    const g = new THREE.BoxGeometry(box.size[0], box.size[1], box.size[2]);
    g.translate(box.at[0], box.at[1], 0);
    const count = g.attributes.position.count;
    const uv1 = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      uv1[i * 2 + 0] = (segment + 0.5) / 7;
      uv1[i * 2 + 1] = 0.5; // overwritten by the shader; must exist
    }
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    return g;
  });

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  // Lay it flat: glyph up becomes up-screen once the group wears FACE_YAW.
  merged.rotateX(-Math.PI / 2);
  return merged;
}

export default class YearCounter {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'yearCounter';

    this.texture = digitsTexture();
    /** @type {{ index: import('three/tsl').ShaderNodeObject, mesh: THREE.Mesh }[]} */
    this.digits = [];
    this.value = null;

    const geometry = digitGeometry();
    const step = DIGIT.width + DIGIT.gap;
    const rowWidth = 4 * step - DIGIT.gap;
    if (rowWidth / 2 > COUNTER_HALF_WIDTH) {
      // The dryness sweep budgets COUNTER_HALF_WIDTH; a wider row would put
      // undried digits on the ground. Loud, because it is a data error.
      throw new Error(`year counter row ${rowWidth} exceeds its swept footprint`);
    }

    for (let place = 0; place < 4; place++) {
      const index = uniform(0);

      // The reference's digit material, verbatim: flat 1.7, and the vertex-stage lookup.
      const material = new THREE.MeshBasicNodeMaterial();
      material.outputNode = vec4(1.7);
      material.positionNode = Fn(() => {
        const barUv = uv(1).toVar();
        barUv.y.assign(index.div(10).add(float(0.5).div(10)));
        const barActive = texture(this.texture, barUv).r;
        const newPosition = positionGeometry.toVar();
        newPosition.y.subAssign(barActive.oneMinus().mul(DROP));
        return newPosition;
      })();

      const mesh = new THREE.Mesh(geometry, material);
      // The digit geometry's glyph runs 0..length up-screen after the flat
      // bake (local −z); centre the row on the group origin.
      mesh.position.set(-rowWidth / 2 + place * step, LIFT, DIGIT.length / 2);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      this.digits.push({ index, mesh });
    }
  }

  /** Write a four-digit year into the uniforms. Cheap enough to call per frame. */
  setYear(year) {
    if (year === this.value) return;
    this.value = year;
    const clamped = Math.max(0, Math.min(9999, Math.round(year)));
    this.digits[0].index.value = Math.floor(clamped / 1000) % 10;
    this.digits[1].index.value = Math.floor(clamped / 100) % 10;
    this.digits[2].index.value = Math.floor(clamped / 10) % 10;
    this.digits[3].index.value = clamped % 10;
  }
}
