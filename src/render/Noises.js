import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, vec2, vec3, vec4, float, int, dot, fract, sin, mul, mod, floor, ceil, length, smoothstep, mix, uv,
} from 'three/tsl';

/**
 * Noise textures, generated on the GPU once at boot and never loaded.
 *
 * This is the second-cheapest trick in the reference's build after the palette, and it is
 * why `ROADMAP.md` → *The reference's 118 files* records **~14 world textures in total**: a
 * 128 × 128 perlin tile costs 64 KB of VRAM, zero bytes of download, and no
 * decode. `Noises.js:176-292` renders a `QuadMesh` whose material is a TSL
 * expression straight into a `RenderTarget`, then keeps the target's texture.
 *
 * Three details in that are load-bearing and none of them is obvious:
 *
 *   - **`RendererUtils.resetRendererState` / `restoreRendererState` around the
 *     render.** A one-off render into a target during boot otherwise leaves the
 *     renderer's state — bound target, clear colour, tone mapping — pointing
 *     somewhere the main pipeline does not expect.
 *   - **`setPixelRatio(1)` first.** A `QuadMesh` renders at the renderer's DPR,
 *     so on a 2× display the tile would be generated at half resolution into the
 *     corner of the target and the rest would be empty.
 *   - **`RepeatWrapping`.** The whole point of a periodic perlin is that it
 *     tiles; without the wrap the wind field clamps at the edges of the world.
 *
 * The perlin generator itself is ported from the reference's `perlinNode`
 * (`Noises.js:106-135`) rather than reinvented, so the field the wind samples
 * has the reference's statistics — `cellAmount 6` over a `period 6` is what makes it tile at
 * all, and the `× 0.8 + 0.5` tail is what puts it in 0..1.
 *
 * **We generate two textures where the reference author generates three.** The perlin drives the
 * wind, the ground tones and the ripples; the voronoi (added 3 Sep) drives the
 * rain splashes, which are the reference's `splashesNode` and need the reference's cells. The reference's hash
 * feeds a dither we do not use; adding it is a five-line copy of `_render`.
 */

/** The reference's `hash`, exactly: a vec2 → vec2 in 0..1, the voronoi's point per cell. */
const hash2 = Fn(([p_immutable]) => {
  const p = vec2(p_immutable).toVar();
  p.assign(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))));
  return fract(sin(p).mul(43758.5453123));
}).setLayout({
  name: 'hash2',
  type: 'vec2',
  inputs: [{ name: 'p', type: 'vec2' }],
});

/**
 * Periodic voronoi — the reference's `voronoiNode` (`Noises.js:22-71`), ported line for
 * line. Per texel: `r` the distance to the nearest cell point (0 at the
 * point, ~1 at the far corner), `g` the gap to the second-nearest (0 on a
 * cell edge), `b` a random per cell. The reference's splashes read all three: `r` is
 * the ring's radius, `g` fades the ring out at the cell border, `b` seeds
 * the cell's phase and whether it rings at all.
 */
const voronoiNode = Fn(([uv_immutable, repeat_immutable]) => {
  const repeat = float(repeat_immutable).toVar();
  const p = vec2(uv_immutable).toVar();
  const cellId = vec2(0.0).toVar();
  p.mulAssign(repeat);
  const i = vec2(floor(p)).toVar();
  const f = vec2(fract(p)).toVar();
  const minDist = float(1.0).toVar();
  const minEdge = float(1.0).toVar();
  const bestId = vec2(0.0).toVar();

  Loop({ start: int(-1), end: int(1), name: 'y', condition: '<=' }, ({ y }) => {
    Loop({ start: int(-1), end: int(1), name: 'x', condition: '<=' }, ({ x }) => {
      const neighbor = vec2(x, y).toVar();
      const cell = vec2(mod(i.add(neighbor), repeat)).toVar();
      const point = vec2(hash2(cell)).toVar();
      const diff = vec2(neighbor.add(point.sub(f))).toVar();
      const dist = float(length(diff)).toVar();

      If(dist.lessThan(minDist), () => {
        minEdge.assign(minDist);
        minDist.assign(dist);
        bestId.assign(i.add(neighbor));
      }).ElseIf(dist.lessThan(minEdge), () => {
        minEdge.assign(dist);
      });
    });
  });

  cellId.assign(fract(bestId.div(repeat)));

  return vec3(minDist, minEdge.sub(minDist), hash2(cellId).x);
}).setLayout({
  name: 'voronoiNode',
  type: 'vec3',
  inputs: [
    { name: 'uv', type: 'vec2' },
    { name: 'repeat', type: 'float' },
  ],
});

/** The reference's `random`, exactly: a hash returning a direction in −1..1 per cell. */
const random2 = Fn(([value_immutable]) => {
  const value = vec2(value_immutable).toVar();
  value.assign(vec2(dot(value, vec2(127.1, 311.7)), dot(value, vec2(269.5, 183.3))));
  return float(-1.0).add(mul(2.0, fract(sin(value).mul(43758.5453123))));
}).setLayout({
  name: 'random2',
  type: 'vec2',
  inputs: [{ name: 'value', type: 'vec2' }],
});

/** Positive modulo, so a negative cell index still wraps into the period. */
const modulo2 = Fn(([divident_immutable, divisor_immutable]) => {
  const divisor = vec2(divisor_immutable).toVar();
  const divident = vec2(divident_immutable).toVar();
  const positive = vec2(mod(divident, divisor).add(divisor)).toVar();
  return mod(positive, divisor);
}).setLayout({
  name: 'modulo2',
  type: 'vec2',
  inputs: [
    { name: 'divident', type: 'vec2' },
    { name: 'divisor', type: 'vec2' },
  ],
});

/**
 * Periodic perlin — the reference's, ported line for line.
 *
 * `period` is what makes it tile: the cell indices are taken modulo it before
 * their gradients are hashed, so the cell at the right edge draws the same
 * gradient as the cell at the left. Pass the same number for `cellAmount` and
 * `period` or the tiling breaks silently and the seam only shows once something
 * scrolls across it.
 */
export const perlinNode = Fn(([uv_immutable, cellAmount_immutable, period_immutable]) => {
  const period = vec2(period_immutable).toVar();
  const cellAmount = float(cellAmount_immutable).toVar();
  const coord = vec2(uv_immutable).toVar();
  coord.assign(coord.mul(float(cellAmount)));

  const cellsMinimum = vec2(floor(coord)).toVar();
  const cellsMaximum = vec2(ceil(coord)).toVar();
  const uvFract = vec2(fract(coord)).toVar();
  cellsMinimum.assign(modulo2(cellsMinimum, period));
  cellsMaximum.assign(modulo2(cellsMaximum, period));

  const blur = vec2(smoothstep(0.0, 1.0, uvFract)).toVar();
  const lowerLeft = vec2(random2(vec2(cellsMinimum.x, cellsMinimum.y))).toVar();
  const lowerRight = vec2(random2(vec2(cellsMaximum.x, cellsMinimum.y))).toVar();
  const upperLeft = vec2(random2(vec2(cellsMinimum.x, cellsMaximum.y))).toVar();
  const upperRight = vec2(random2(vec2(cellsMaximum.x, cellsMaximum.y))).toVar();
  const fraction = vec2(fract(coord)).toVar();

  return mix(
    mix(
      dot(lowerLeft, fraction.sub(vec2(int(0), int(0)))),
      dot(lowerRight, fraction.sub(vec2(int(1), int(0)))),
      blur.x
    ),
    mix(
      dot(upperLeft, fraction.sub(vec2(int(0), int(1)))),
      dot(upperRight, fraction.sub(vec2(int(1), int(1)))),
      blur.x
    ),
    blur.y
  )
    .mul(0.8)
    .add(0.5);
}).setLayout({
  name: 'perlinNode',
  type: 'float',
  inputs: [
    { name: 'uv', type: 'vec2' },
    { name: 'cellAmount', type: 'float' },
    { name: 'period', type: 'vec2' },
  ],
});

export default class Noises {
  /** @param {THREE.WebGPURenderer} renderer */
  constructor(renderer, { resolution = 128 } = {}) {
    this.renderer = renderer;
    this.resolution = resolution;
    this._quad = new THREE.QuadMesh();
    this._targets = [];

    this.perlin = this._render(
      { format: THREE.RedFormat },
      // The reference's: `perlinNode(uv(), 6.0, 6.0).remap(0.1, 0.9, 0.0, 1.0)`. The remap
      // is a contrast stretch — raw perlin barely leaves the middle of its
      // range, and without it the wind is a much weaker field than the reference's.
      vec4(perlinNode(uv(), 6.0, 6.0).remap(0.1, 0.9, 0.0, 1.0), 0, 0, 0)
    );

    // The reference's: `voronoiNode(uv(), 8)` — eight cells across the tile, three
    // channels (see `voronoiNode`). RGBA, since all three are read.
    this.voronoi = this._render({}, vec4(voronoiNode(uv(), 8), 0));
  }

  /**
   * Render one TSL expression into a texture.
   *
   * **`renderAsync` is not awaited and does not need to be.** The command is
   * queued on the same device the frame loop uses, so anything sampling the
   * texture later in the boot sequence reads it after this has executed. That is
   * the reference's behaviour too — `Noises` is constructed synchronously.
   */
  _render(options, outputNode) {
    const target = new THREE.RenderTarget(this.resolution, this.resolution, {
      depthBuffer: false,
      type: THREE.HalfFloatType,
      ...options,
    });
    this._targets.push(target);

    const texture = target.texture;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    const material = new THREE.MeshBasicNodeMaterial();
    material.outputNode = outputNode;
    this._quad.material = material;

    const state = THREE.RendererUtils.resetRendererState(this.renderer);
    const pixelRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setRenderTarget(target);
    this._quad.render(this.renderer);
    this.renderer.setRenderTarget(null);
    this.renderer.setPixelRatio(pixelRatio);
    THREE.RendererUtils.restoreRendererState(this.renderer, state);

    material.dispose();
    return texture;
  }

  dispose() {
    for (const target of this._targets) target.dispose();
    this._targets.length = 0;
  }
}
