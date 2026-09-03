import * as THREE from 'three/webgpu';
import { Fn, attribute, cos, float, positionLocal, remapClamp, sin, uniform, vec3 } from 'three/tsl';
import { makeContentMaterial } from './materials.js';
import { COLOR, paletteU } from './palette.js';
import { tween, ease } from '../core/tween.js';

/**
 * The reference's confetti (`World/Confetti.js`), for the plaza: a burst of 500 little
 * planes thrown up and out from a point, each on its own slice of one
 * five-second progress — the reference's construction line for line, minus GSAP and
 * minus instancing.
 *
 * The reference's mesh is an `InstancedMesh` of one 0.1 × 0.2 plane with a random
 * quaternion per instance and the burst computed in the vertex shader from
 * a progress uniform. Ours bakes the random orientation into the vertices
 * of one merged geometry (500 quads, one draw call) and carries the same
 * two per-instance randoms as vertex attributes — the grass field's
 * pattern, and the same reason: a plain attribute through the content
 * material is the path this backend has already proven.
 *
 * Three colours, the reference's: pink, yellow, mint. Ours are the palette's two
 * accents and amber, painted per quad through the palette UVs — so a third
 * of every burst is on the emissive band and glows at night for free.
 */

const COUNT = 500;
const POOL = 2;
const DURATION = 5;
const AMPLITUDE = 0.7;
const QUAD = { width: 0.1, height: 0.2 };
const BANDS = [COLOR.accentWarm, COLOR.accentCool, COLOR.amber];

export default class Confetti {
  constructor(game) {
    this.game = game;
    this.pool = [];
    for (let i = 0; i < POOL; i++) this.pool.push(this._makeOne());
  }

  _makeOne() {
    const geometry = this._buildGeometry();

    const progress = uniform(0);
    const radius = uniform(4);
    const elevation = uniform(6);

    // The reference's positionNode, verbatim in shape.
    const positionNode = Fn(() => {
      const random = attribute('burstRandom', 'float');
      const angle = attribute('burstAngle', 'float');

      const rest = float(1 - AMPLITUDE);
      const start = rest.mul(random);
      const end = start.add(AMPLITUDE);
      const p = remapClamp(progress, start, end, 0, 1).toVar();
      p.assign(p.oneMinus().pow(3).oneMinus());

      // Grows in and out at the ends of its own slice.
      const scale = p.sub(0.5).mul(2).abs().oneMinus().mul(20).min(1);
      const base = positionLocal.mul(scale);

      const strength = random.mul(99).fract();
      const x = sin(angle).mul(p).mul(strength).mul(radius);
      const z = cos(angle).mul(p).mul(strength).mul(radius);
      const y = p.mul(2).oneMinus().pow(2).oneMinus().mul(strength).mul(elevation);

      return vec3(base.x.add(x), base.y.add(y), base.z.add(z));
    })();

    const material = makeContentMaterial({
      reveal: this.game.reveal,
      lighting: this.game.lighting,
      sky: this.game.sky,
      water: this.game.water,
      night: this.game.night,
      side: THREE.DoubleSide,
      positionNode,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'confetti';
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.game.scene.add(mesh);

    return { mesh, progress, radius, elevation, available: true, cancel: null };
  }

  /**
   * 500 quads at the origin, each turned by a random quaternion (the reference's
   * `Quaternion.random()` per instance), each carrying its slice random and
   * its throw angle, each painted one of the three bands.
   */
  _buildGeometry() {
    const positions = new Float32Array(COUNT * 4 * 3);
    const uvs = new Float32Array(COUNT * 4 * 2);
    const randoms = new Float32Array(COUNT * 4);
    const angles = new Float32Array(COUNT * 4);
    const index = new Uint32Array(COUNT * 6);

    const corners = [
      new THREE.Vector3(-QUAD.width / 2, -QUAD.height / 2, 0),
      new THREE.Vector3(QUAD.width / 2, -QUAD.height / 2, 0),
      new THREE.Vector3(QUAD.width / 2, QUAD.height / 2, 0),
      new THREE.Vector3(-QUAD.width / 2, QUAD.height / 2, 0),
    ];
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();

    for (let i = 0; i < COUNT; i++) {
      q.random();
      const random = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const u = paletteU(BANDS[i % BANDS.length]);
      for (let c = 0; c < 4; c++) {
        const at = i * 4 + c;
        v.copy(corners[c]).applyQuaternion(q);
        positions[at * 3] = v.x;
        positions[at * 3 + 1] = v.y;
        positions[at * 3 + 2] = v.z;
        uvs[at * 2] = u;
        uvs[at * 2 + 1] = 0.5;
        randoms[at] = random;
        angles[at] = angle;
      }
      const o = i * 4;
      index.set([o, o + 1, o + 2, o, o + 2, o + 3], i * 6);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('burstRandom', new THREE.Float32BufferAttribute(randoms, 1));
    geometry.setAttribute('burstAngle', new THREE.Float32BufferAttribute(angles, 1));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    // The burst reaches `radius` out and `elevation` up; a generous sphere
    // beats recomputing bounds per pop, and the mesh is unculled anyway.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    return geometry;
  }

  /**
   * The reference's `pop(position, radius, elevation)`: the first free burst in the pool
   * plays its progress 0 → 1 over five seconds, linear as the reference's is.
   */
  pop(position, radius = 4, elevation = 6) {
    const burst = this.pool.find((b) => b.available);
    if (!burst) return null;

    burst.available = false;
    burst.mesh.visible = true;
    burst.mesh.position.copy(position);
    burst.radius.value = radius;
    burst.elevation.value = elevation;
    burst.progress.value = 0;

    burst.cancel = tween({
      from: 0,
      to: 1,
      duration: DURATION,
      easing: ease.linear,
      onUpdate: (value) => {
        burst.progress.value = value;
      },
      onComplete: () => {
        burst.mesh.visible = false;
        burst.available = true;
        burst.cancel = null;
      },
    });
    return burst;
  }
}
