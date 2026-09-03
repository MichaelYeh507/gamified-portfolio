import * as THREE from 'three/webgpu';
import { Fn, attribute, float, max, positionLocal, rotateUV, sin, texture, vec2, vec3 } from 'three/tsl';
import { makeContentMaterial } from '../render/materials.js';
import { COLOR, paletteU } from '../render/palette.js';
import { WATER_SURFACE } from './Terrain.js';
import { LEAF, createLeaves, stepLeaves } from './leavesSim.js';

/**
 * The reference's leaves, the world half — `World/Leaves.js` (2 Sep, the third item of
 * Michael's alive list): a thousand leaves drifting on the wind, kicked up
 * by the car, skating on the water, tumbling while airborne.
 *
 * The reference's construction, split at the backend: the **simulation** is the reference's
 * compute shader as a pure CPU step (`leavesSim.js` — why, and the numbers,
 * are there), and this file is the reference's **draw**: one mesh of `COUNT` flat
 * quads in the reference's leaf shape (a unit plane with its top corners nudged +0.15
 * and its bottom corners −0.15, laid flat), scaled 0.25 × a per-leaf
 * 0.5–1, tumbled in the vertex stage by `sin(position × 3)` while the leaf
 * is off the ground (the reference's `rotationElevationMultiplier`), and spun by a
 * per-leaf base angle. The positions arrive as a `COUNT × 1` float texture
 * uploaded every frame — the trails' and the tracks' road — where the reference's are
 * an instanced storage attribute.
 *
 * Colour: the reference's two browns (`0x95513a` → `0xf56a3a`) hashed per leaf; ours
 * are the palette's wood and wood-dark, painted per quad through the
 * palette UVs. The first cut mixed in accent-warm (two browns to one
 * orange) and under the sunset light it read as confetti, not litter.
 * Shading: the reference's random per-leaf normal, tilted up to a radian off vertical,
 * so a carpet of leaves catches the light unevenly instead of reading as
 * one flat colour.
 *
 * Count: the reference's is `2^round(remap(yearCycles.leaves, 0.25, 1, 7, 11))`, 128
 * to 2048 by the season over a ~60-unit window — 0.07 leaves/m² in
 * mid-season, 0.57 at peak. The first cut shipped 1024 over our 44-unit
 * window, the reference's PEAK-autumn density all year (Michael: "i think theres too
 * much leaves"); 256 is the reference's mid-season density on our window. Flat until
 * the year cycle has a consumer; the lever is one constant.
 */

const COUNT = 256;
/** The window the leaves live in, wrapped around the focus: the grass
 *  field's extent, which covers the fixed camera's view. */
const SIZE = 44;

export default class Leaves {
  constructor(game) {
    this.game = game;
    this.count = COUNT;
    this.sim = createLeaves(COUNT, SIZE);

    this.dataTexture = new THREE.DataTexture(
      new Float32Array(COUNT * 4),
      COUNT,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.dataTexture.needsUpdate = true;

    this._car = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
    this._lastCar = null;
    this._focus = { x: 0, z: 0 };
    this._wind = { dx: 0, dz: 1, strength: 0.5, time: 0 };
    this._groundAt = (x, z) => this.game.terrain.heightAt(x, z);

    this._buildGeometry();
    this._buildMaterial();

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'leaves';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
  }

  _buildGeometry() {
    // The reference's leaf: a unit plane, top corners +0.15 in x, bottom corners −0.15,
    // then laid flat (rotateX −π/2 maps y → −z).
    const corners = [
      [-0.5 + 0.15, 0, -0.5],
      [0.5 + 0.15, 0, -0.5],
      [-0.5 - 0.15, 0, 0.5],
      [0.5 - 0.15, 0, 0.5],
    ];
    const bands = [COLOR.wood, COLOR.woodDark];

    const positions = new Float32Array(COUNT * 4 * 3);
    const uvs = new Float32Array(COUNT * 4 * 2);
    const indices = new Float32Array(COUNT * 4);
    const rotations = new Float32Array(COUNT * 4);
    const scales = new Float32Array(COUNT * 4);
    const normals = new Float32Array(COUNT * 4 * 3);
    const index = new Uint32Array(COUNT * 6);

    const normal = new THREE.Vector3();
    const axisX = new THREE.Vector3(1, 0, 0);
    const axisZ = new THREE.Vector3(0, 0, 1);

    for (let i = 0; i < COUNT; i++) {
      const rotation = Math.random() * Math.PI * 2;
      const scale = Math.random() * 0.5 + 0.5;
      const u = paletteU(bands[i % bands.length]);
      // The reference's: up, tilted by up to a radian about x, then about z.
      normal.set(0, 1, 0);
      normal.applyAxisAngle(axisX, (Math.random() - 0.5) * 2);
      normal.applyAxisAngle(axisZ, (Math.random() - 0.5) * 2);

      for (let c = 0; c < 4; c++) {
        const at = i * 4 + c;
        positions[at * 3] = corners[c][0];
        positions[at * 3 + 1] = corners[c][1];
        positions[at * 3 + 2] = corners[c][2];
        uvs[at * 2] = u;
        uvs[at * 2 + 1] = 0.5;
        indices[at] = i;
        rotations[at] = rotation;
        scales[at] = scale;
        normals[at * 3] = normal.x;
        normals[at * 3 + 1] = normal.y;
        normals[at * 3 + 2] = normal.z;
      }
      const o = i * 4;
      index.set([o, o + 2, o + 1, o + 1, o + 2, o + 3], i * 6);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    this.geometry.setAttribute('leafIndex', new THREE.Float32BufferAttribute(indices, 1));
    this.geometry.setAttribute('leafRotation', new THREE.Float32BufferAttribute(rotations, 1));
    this.geometry.setAttribute('leafScale', new THREE.Float32BufferAttribute(scales, 1));
    this.geometry.setAttribute('leafNormal', new THREE.Float32BufferAttribute(normals, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  }

  _buildMaterial() {
    const { reveal, lighting, sky, water, night } = this.game;
    const scale = float(LEAF.scale);
    const frequency = float(LEAF.rotationFrequency);

    // The reference's positionNode: scale, tumble by elevation, spin, then stand at the
    // simulated position.
    const positionNode = Fn(() => {
      const index = attribute('leafIndex', 'float');
      const leaf = texture(this.dataTexture, vec2(index.add(0.5).div(COUNT), 0.5)).xyz;

      const p = positionLocal.mul(attribute('leafScale', 'float')).mul(scale).toVar();

      const tumble = max(leaf.y, 0);
      const rotationZ = sin(leaf.x.mul(frequency)).mul(tumble);
      const rotationX = sin(leaf.z.mul(frequency)).mul(tumble);
      const rotationY = attribute('leafRotation', 'float');

      p.xy.assign(rotateUV(p.xy, rotationZ, vec2(0)));
      p.yz.assign(rotateUV(p.yz, rotationX, vec2(0)));
      p.xz.assign(rotateUV(p.xz, rotationY, vec2(0)));

      return p.add(leaf);
    })();

    this.material = makeContentMaterial({
      reveal,
      lighting,
      sky,
      water,
      night,
      side: THREE.DoubleSide,
      positionNode,
      normal: attribute('leafNormal', 'vec3'),
    });
  }

  /**
   * Once per frame, after the car has moved: the reference's `update()` plus the
   * compute dispatch, on the CPU. The car's push is by its per-frame
   * displacement, exactly the reference's `physicalVehicle.velocity`.
   */
  update(delta, focus) {
    const { car, wind } = this.game;
    const p = car.position;
    if (this._lastCar) {
      this._car.dx = p.x - this._lastCar.x;
      this._car.dz = p.z - this._lastCar.z;
    } else {
      this._lastCar = { x: p.x, z: p.z };
    }
    this._lastCar.x = p.x;
    this._lastCar.z = p.z;
    this._car.x = p.x;
    this._car.y = p.y;
    this._car.z = p.z;

    this._focus.x = focus.x;
    this._focus.z = focus.z;

    const direction = wind.direction.value;
    this._wind.dx = direction.x;
    this._wind.dz = direction.y;
    this._wind.strength = wind.strength.value;
    this._wind.time = wind.localTime.value;

    stepLeaves(this.sim, {
      delta,
      focus: this._focus,
      car: this._car,
      wind: this._wind,
      groundAt: this._groundAt,
      waterLevel: WATER_SURFACE,
    });

    const data = this.dataTexture.image.data;
    const { position } = this.sim;
    for (let i = 0; i < COUNT; i++) {
      data[i * 4] = position[i * 3];
      data[i * 4 + 1] = position[i * 3 + 1];
      data[i * 4 + 2] = position[i * 3 + 2];
      data[i * 4 + 3] = 1;
    }
    this.dataTexture.needsUpdate = true;
  }
}
