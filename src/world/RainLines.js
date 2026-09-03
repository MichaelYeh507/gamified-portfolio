import * as THREE from 'three/webgpu';
import { Fn, attribute, float, fract, mod, step, uniform, vec2, vec3 } from 'three/tsl';
import { COLOR, PALETTE } from '../render/palette.js';

/**
 * Rain — the reference's `World/RainLines.js`, the mechanism kept and the numbers ours
 * (2 Sep, the fifth item of the alive list).
 *
 * The reference's construction: one static mesh of N thin quads scattered over a unit
 * square, every quad stretched in the vertex stage into a falling streak —
 * the square is scaled to the window around the focus and wrapped (the reference's
 * mod-loop), each streak's height runs down from `elevation + length` to 0
 * on its own phase of a scrolling clock, and a share of the streaks is
 * hidden by lifting them 99 units up wherever a hashed random sits above
 * the visible ratio, so the density follows the weather with no geometry
 * rebuilt. Thickness is laid along screen-horizontal so every streak faces
 * the camera, and an incline leans the fall with the wind.
 *
 * Ours: 1024 streaks over the 44-unit window (the reference's 2048 over ~60), a
 * visible share of `rain²` (the reference's), length 1 → 3 and speed 0.2 → 0.4 with
 * the rain (the reference's), the incline along the actual wind direction rather than
 * the reference's fixed tangent, and a near-white that dims with the day's light so
 * night rain reads as a darker hatch rather than a white one.
 */

/** 1024 on the first build; Michael: "too much rain". Half the streaks, a
 *  little fainter — a shower, not a monsoon. */
const COUNT = 512;
const SIZE = 44;
const RAIN = Object.freeze({ thickness: 0.011, elevation: 20, opacity: 0.36 });
/**
 * The window sits this far up-screen of the focus. Centred on the focus,
 * half the streaks fall between the eye and the ground — the camera is
 * ~21 units toward the viewer — and the nearest few magnify into fat white
 * bars (seen on the first build). Pushed away, the field still covers the
 * frame and the eye stays clear of it.
 */
const WINDOW_BACK = 9;
const TO_CAMERA = Object.freeze({ x: Math.SQRT1_2, z: Math.SQRT1_2 });

export default class RainLines {
  constructor({ scene, lighting, wind }) {
    this.wind = wind;

    this.center = uniform(new THREE.Vector2());
    this.length = uniform(2);
    this.localTime = uniform(0);
    this.visibleRatio = uniform(0);
    this.incline = uniform(new THREE.Vector2(0.14, -0.14));
    this.speed = 0.25;

    this._buildGeometry();

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const white = new THREE.Color(PALETTE[COLOR.white]);
    material.colorNode = vec3(white.r, white.g, white.b).mul(lighting.intensityUniform);
    material.opacityNode = float(RAIN.opacity);

    const size = float(SIZE);
    const thickness = float(RAIN.thickness);
    const elevation = float(RAIN.elevation);
    /** Screen-horizontal on the fixed rig — a streak's width faces the eye. */
    const across = vec2(Math.SQRT1_2, -Math.SQRT1_2);

    // The reference's positionNode, line for line where the numbers are not ours.
    material.positionNode = Fn(() => {
      const position = attribute('position', 'vec3').toVar();
      const offset = attribute('offset', 'vec2');
      const random = attribute('random', 'float');

      // Loop around the focus.
      position.xz.mulAssign(size);
      position.xz.subAssign(this.center);
      const halfSize = size.mul(0.5);
      position.x.assign(mod(position.x.add(halfSize), size).sub(halfSize));
      position.z.assign(mod(position.z.add(halfSize), size).sub(halfSize));
      position.xz.addAssign(this.center);

      // Thickness.
      position.xz.addAssign(across.mul(offset.x.mul(thickness)));

      // The fall: top at elevation + length, the bottom vertices one
      // length lower, the whole streak riding down on its phase.
      const progress = this.localTime.add(random).mod(1);
      position.y.assign(elevation.add(this.length));
      position.y.subAssign(this.length.mul(offset.y.oneMinus()));
      position.y.subAssign(progress.mul(elevation.add(this.length)));
      position.y.assign(position.y.clamp(0, elevation));

      // The share that is not raining right now goes 99 up.
      const hidden = step(this.visibleRatio, fract(random.mul(99)));
      position.y.addAssign(hidden.mul(99));

      // Lean with the wind.
      position.xz.addAssign(this.incline.mul(position.y).mul(-1));

      return position;
    })();

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = 'rain';
    this.mesh.position.y = -0.3;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** The reference's geometry: a quad per streak at a random spot in the unit square. */
  _buildGeometry() {
    const positions = new Float32Array(COUNT * 4 * 3);
    const offsets = new Float32Array(COUNT * 4 * 2);
    const randoms = new Float32Array(COUNT * 4);
    const index = new Uint32Array(COUNT * 6);

    for (let i = 0; i < COUNT; i++) {
      const x = Math.random();
      const z = Math.random();
      const random = Math.random();
      for (let v = 0; v < 4; v++) {
        const at = i * 4 + v;
        positions[at * 3] = x;
        positions[at * 3 + 1] = 0;
        positions[at * 3 + 2] = z;
        offsets[at * 2] = v === 0 || v === 1 ? 1 : 0;
        offsets[at * 2 + 1] = v === 0 || v === 3 ? 1 : 0;
        randoms[at] = random;
      }
      const o = i * 4;
      index.set([o, o + 3, o + 2, o + 2, o + 1, o], i * 6);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('offset', new THREE.Float32BufferAttribute(offsets, 2));
    this.geometry.setAttribute('random', new THREE.Float32BufferAttribute(randoms, 1));
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SIZE);
  }

  /** Once per frame: the weather in, the clock on, the window on the focus. */
  update(delta, rain, focus) {
    this.visibleRatio.value = rain * rain;
    this.mesh.visible = this.visibleRatio.value > 0.0001;
    if (!this.mesh.visible) return;

    this.length.value = 1 + rain * 2;
    this.speed = 0.2 + rain * 0.2;
    this.center.value.set(
      focus.x - TO_CAMERA.x * WINDOW_BACK,
      focus.z - TO_CAMERA.z * WINDOW_BACK
    );
    // The reference's clock is the scaled one (×2).
    this.localTime.value += delta * 2 * this.speed;

    const d = this.wind.direction.value;
    const lean = 0.2 * (0.6 + this.wind.strength.value);
    this.incline.value.set(d.x * lean, d.y * lean);
  }
}
