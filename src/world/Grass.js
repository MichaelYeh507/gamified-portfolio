import * as THREE from 'three/webgpu';
import {
  Fn,
  attribute,
  cameraPosition,
  float,
  mix,
  mod,
  rotateUV,
  smoothstep,
  step,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vertexIndex,
  atan,
} from 'three/tsl';
import { makeContentMaterial } from '../render/materials.js';

/**
 * The reference's grass field, ported from `World/Grass.js` (2 Sep, Michael: "he has
 * grass we can run through and just feels more alive in general").
 *
 * The construction is the whole trick and it is all the reference's: **one draw call of
 * single-triangle blades** whose `position` attribute is only an XZ pair —
 * the vertex shader does everything else. Each blade wraps around the camera
 * with a mod-loop (drive anywhere and the same buffer is always underfoot),
 * billboards toward the camera, takes its height from a perlin field times
 * the terrain texture's blade channel, and leans with the same wind field
 * the trees sway in — `offsetNode` has the reference's exact signature, so that line
 * ports verbatim.
 *
 * "Run through" costs nothing: there is no body, the car passes through and
 * the blades pass behind it. The reference's flattened wheel-tracks (`world/Tracks.js`,
 * a render target that erases the cover where you drive) trample the field
 * through the density below, landed 2 Sep on Michael's read.
 *
 * Numbers are the reference's where ours can carry them: blade 0.1 × 0.6 with 0.6 height
 * randomness, density ~the reference's `surfaceIdeal` (78k blades over 2000 m²; ours is
 * 40k over 1936 m², the same blades-per-metre to one part in twenty).
 * Blades the terrain forbids (roads, the arc, the decal line — the texture's
 * B channel) drop 100 units underground rather than the reference's 100 above: same
 * cost, and a buried blade can never streak across the sky.
 */

/** Field half-extent around the focus — covers the fixed camera's view. */
const HALF_EXTENT = 22;
/** Blades per side. 200² = 40,000 triangles, one draw call. */
const SUBDIVISIONS = 200;

const BLADE = Object.freeze({ width: 0.1, height: 0.6, heightRandomness: 0.6 });

export default class Grass {
  constructor(game) {
    this.game = game;
    this.size = HALF_EXTENT * 2;
    this.count = SUBDIVISIONS * SUBDIVISIONS;

    this.center = uniform(new THREE.Vector2());

    this._buildGeometry();
    this._buildMaterial();

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'grass';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
  }

  _buildGeometry() {
    const fragment = this.size / SUBDIVISIONS;
    const position = new Float32Array(this.count * 3 * 2);
    const heightRandomness = new Float32Array(this.count * 3);

    for (let iX = 0; iX < SUBDIVISIONS; iX++) {
      const fragmentX = (iX / SUBDIVISIONS - 0.5) * this.size + fragment * 0.5;
      for (let iZ = 0; iZ < SUBDIVISIONS; iZ++) {
        const fragmentZ = (iZ / SUBDIVISIONS - 0.5) * this.size + fragment * 0.5;

        const i = iX * SUBDIVISIONS + iZ;
        const i3 = i * 3;
        const i6 = i * 6;

        const x = fragmentX + (Math.random() - 0.5) * fragment;
        const z = fragmentZ + (Math.random() - 0.5) * fragment;

        // Three vertices, all carrying the blade's ground point — the shape
        // is added in the vertex shader from `bladeShape`.
        position[i6] = x;
        position[i6 + 1] = z;
        position[i6 + 2] = x;
        position[i6 + 3] = z;
        position[i6 + 4] = x;
        position[i6 + 5] = z;

        const r = Math.random();
        heightRandomness[i3] = r;
        heightRandomness[i3 + 1] = r;
        heightRandomness[i3 + 2] = r;
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    /**
     * The anchor buffer is registered twice: as `position` (itemSize 2, which
     * is what gives the renderer its vertex count — the reference's does exactly this)
     * and as `bladeAnchor`, the name the shader actually reads. Reading it AS
     * `attribute('position')`, the reference's line, silently broke on our material:
     * three's node pipeline special-cases the `position` attribute to vec3,
     * so the vec2 buffer was read at the wrong stride and every blade
     * evaluated to garbage off-world. Same bytes, second name, correct type.
     */
    const anchors = new THREE.Float32BufferAttribute(position, 2);
    this.geometry.setAttribute('position', anchors);
    this.geometry.setAttribute('bladeAnchor', anchors);
    this.geometry.setAttribute(
      'heightRandomness',
      new THREE.Float32BufferAttribute(heightRandomness, 1)
    );
  }

  _buildMaterial() {
    const { terrain, water, noises, wind, reveal, lighting, sky, night, terrainAlbedo, tracks = null } = this.game;

    const sizeUniform = uniform(this.size);
    const bladeWidth = uniform(BLADE.width);
    const bladeHeight = uniform(BLADE.height);
    const bladeHeightRandomness = uniform(BLADE.heightRandomness);

    /**
     * The reference's `bladeShape` is a uniform array indexed by the loop index; ours is
     * the same three offsets as branchless step math — an array `.element()`
     * with a float index compiled to a blade of three coincident vertices on
     * this backend, which draws exactly nothing and says exactly nothing.
     * Tip (0, 1), left base (1, 0), right base (−1, 0).
     */
    const vertexLoopIndex = varying(vertexIndex.toFloat().mod(3));
    const tipness = varying(step(vertexLoopIndex, 0.5));
    const bladePosition = varying(vec2());

    const { scale, offset } = terrain.uvTransform;

    const positionNode = Fn(() => {
      const position = attribute('bladeAnchor', 'vec2');

      // The wrap: blades live on a torus around the focus point, the reference's
      // mod-loop line for line, so the field never has an edge to reach.
      const loopPosition = position.sub(this.center).toVar();
      const halfSize = sizeUniform.mul(0.5);
      loopPosition.x.assign(mod(loopPosition.x.add(halfSize), sizeUniform).sub(halfSize));
      loopPosition.y.assign(mod(loopPosition.y.add(halfSize), sizeUniform).sub(halfSize));

      const ground = vec3(loopPosition.x, 0, loopPosition.y)
        .add(vec3(this.center.x, 0, this.center.y))
        .toVar();
      bladePosition.assign(ground.xz);

      // Terrain: the blade channel gates existence, the height field seats
      // the root on the real ground.
      const data = texture(terrain.texture(), bladePosition.mul(scale).add(offset));
      /**
       * The wheel tracks trample the field: the reference's blades hide outright where
       * the tracks have taken the cover below 0.5 (`Grass.js:126`); ours
       * fold the erase into the density, sharpened so the ribbon's soft
       * edge still cuts a clean channel, and the `buried` step below then
       * drops the flattened blades underground.
       */
      const trampled = tracks ? smoothstep(0.15, 0.5, tracks.eraseNode(bladePosition)) : float(0);
      const density = data.b.mul(trampled.oneMinus());
      /**
       * 1 where the terrain forbids blades. FUNCTION-form step on purpose,
       * and this line cost six reloads and a WGSL dump to learn why: TSL's
       * METHOD form `a.step(b)` compiles to `step(b, a)` — the receiver is
       * x, the argument is the edge — so `density.step(0.15)` buried every
       * healthy blade 100 units under and left the forbidden ones standing…
       * all zero-height. `step(density, 0.15)` is (density ≤ 0.15), which
       * is what "forbidden" means.
       */
      const buried = step(density, 0.15);
      ground.y.assign(data.r);

      // Height: the reference's randomness × the reference's broad perlin variation × the density,
      // so blades shrink into the feathered road edges instead of stopping.
      const heightVariation = texture(noises.perlin, bladePosition.mul(0.0321)).r.add(0.5);
      const height = bladeHeight
        .mul(
          bladeHeightRandomness
            .mul(attribute('heightRandomness'))
            .add(bladeHeightRandomness.oneMinus())
        )
        .mul(heightVariation)
        .mul(density);

      const isLeft = step(0.5, vertexLoopIndex).mul(step(vertexLoopIndex, 1.5));
      const isRight = step(1.5, vertexLoopIndex);
      const shape = vec3(
        isLeft.sub(isRight).mul(bladeWidth).mul(density),
        tipness.mul(height),
        0
      );

      const vertexPosition = ground.add(shape).toVar();

      // Billboard toward the camera, the reference's rotation exactly.
      const angleToCamera = atan(
        ground.z.sub(cameraPosition.z),
        ground.x.sub(cameraPosition.x)
      ).add(-Math.PI * 0.5);
      vertexPosition.xz.assign(rotateUV(vertexPosition.xz, angleToCamera, ground.xz));

      // The wind — the same field the trees sway in, tip-weighted like the reference's.
      const gust = wind.offsetNode(bladePosition).mul(tipness).mul(height).mul(2);
      vertexPosition.addAssign(vec3(gust.x, 0, gust.y));

      // Forbidden blades sink 100 under instead of the reference's 100 above: same
      // discard-by-geometry, no chance of a stray triangle across the sky.
      vertexPosition.y.subAssign(buried.mul(100));

      return vertexPosition;
    })();

    // A blade is the ground it stands on, slightly darker at the root — the
    // shading half of the reference's tipness trick, without the reference's shadowNode plumbing.
    const albedo = terrainAlbedo(bladePosition).mul(mix(float(0.8), float(1.05), tipness));

    this.material = makeContentMaterial({
      reveal,
      lighting,
      sky,
      water,
      night,
      side: THREE.DoubleSide,
      albedo,
      positionNode,
      normal: vec3(0, 1, 0),
    });
  }

  /** Once per frame: the field follows whatever the camera looks at. */
  follow(x, z) {
    this.center.value.set(x, z);
  }
}
