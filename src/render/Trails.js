import * as THREE from 'three/webgpu';
import {
  attribute,
  cross,
  dot,
  float,
  Fn,
  mat3,
  modelViewMatrix,
  positionGeometry,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

/**
 * Ribbon trails — the reference's `Game/Trails.js`, the boost's behind-the-car half,
 * ported nearly verbatim because the mechanism is the good part:
 *
 * Each trail is ONE static tube (an open 4-sided cylinder, 32 rings) whose
 * vertices are repositioned in the vertex shader from a 32×1 float
 * DataTexture holding the anchor's recent world positions. `update()`
 * scrolls the texture one texel when the anchor has moved far enough
 * (distance-throttled, so a parked car writes nothing), fades every texel's
 * alpha, and writes the head. No geometry is ever rebuilt; the whole cost
 * is a 512-byte texture upload per trail per frame.
 *
 * What is deliberately not the reference's: the Game singleton (explicit deps, like
 * every module in `src/`), and the paint job. The reference's samples a rainbow
 * gradient texture with a fresnel offset — the reference's site's identity layer. Ours
 * is the palette's own **emissive amber at the reference's ×5 multiplier**, which puts
 * the trail over the bloom threshold beside the lamps and headlights: the
 * boost visibly burns at night for free, decision 13's layer again.
 *
 * Time-scale note: the reference's decay 0.2 and throttle 0.4 multiply `deltaScaled`
 * (2× wall clock). `update(delta)` here takes a WALL delta and doubles it
 * internally, so the reference's constants transfer at face value.
 */

const getRotationMatrix = Fn(([u, v]) => {
  const cosTheta = dot(u, v);
  const axis = cross(u, v);
  const sinTheta = axis.length();

  axis.assign(axis.normalize());

  const c = cosTheta;
  const s = sinTheta;
  const t = c.oneMinus();

  return mat3(
    t.mul(axis.x).mul(axis.x).add(c), t.mul(axis.x).mul(axis.y).sub(s.mul(axis.z)), t.mul(axis.x).mul(axis.z).add(s.mul(axis.y)),
    t.mul(axis.x).mul(axis.y).add(s.mul(axis.z)), t.mul(axis.y).mul(axis.y).add(c), t.mul(axis.y).mul(axis.z).sub(s.mul(axis.x)),
    t.mul(axis.x).mul(axis.z).sub(s.mul(axis.y)), t.mul(axis.y).mul(axis.z).add(s.mul(axis.x)), t.mul(axis.z).mul(axis.z).add(c)
  );
});

export default class Trails {
  /**
   * @param {object} options
   * @param {import('three').Scene} options.scene
   * @param {import('three').Color} options.color      at the nozzle
   * @param {import('three').Color} [options.tailColor] down the tail
   */
  constructor({ scene, color, tailColor = color }) {
    this.scene = scene;

    this.subdivisions = 32;
    this.texel = 1 / this.subdivisions;
    this.distanceThrottle = 0.4;
    this.emissiveMultiplier = uniform(5);
    this.color = uniform(color);
    this.tailColor = uniform(tailColor);
    this.decay = 0.2;
    this.items = [];

    // The reference's geometry verbatim: a unit tube along +Z, radius 0.1, open-ended.
    this.geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 4, this.subdivisions, true);
    this.geometry.rotateY(Math.PI * 0.25);
    this.geometry.rotateX(-Math.PI * 0.5);
    this.geometry.translate(0, 0, 0.5);
    this.geometry.deleteAttribute('uv');
  }

  create() {
    const item = {};
    item.lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
    item.position = new THREE.Vector3();
    item.alpha = 0;

    item.dataTexture = new THREE.DataTexture(
      new Float32Array(this.subdivisions * 4),
      this.subdivisions,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );

    /**
     * Additive, like an energy trail rather than the reference's soft ribbon — the
     * Rocket League read Michael pointed at: a hot streak that glows over
     * whatever it crosses and tapers away.
     */
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ratio = float(0).toVarying();
    const alpha = float(0).toVarying();

    material.positionNode = Fn(() => {
      ratio.assign(positionGeometry.z.oneMinus());

      const trailData = texture(item.dataTexture, vec2(ratio, 0.5));
      const trailPosition = trailData.xyz;

      const nextPosition = texture(item.dataTexture, vec2(ratio.add(this.texel), 0.5)).xyz;
      const direction = nextPosition.sub(trailPosition).normalize();

      const rotationMatrix = getRotationMatrix(direction, vec3(0, 0, -1));
      // The taper: full-width at the nozzle, a sliver at the tail — the reference's
      // tube is constant-radius; the reference's streak is not.
      const width = ratio.oneMinus().mul(0.85).add(0.15);
      const basePosition = vec3(positionGeometry.x, positionGeometry.y, 0).mul(width);
      const rotatedPoint = rotationMatrix.mul(basePosition);

      alpha.assign(trailData.w);

      return trailPosition.add(rotatedPoint);
    })();

    material.outputNode = Fn(() => {
      // Two-tone along the streak: nozzle colour running to tail colour —
      // "the original but we change the color scheme a bit". The reference's rainbow
      // gradient texture stays the reference's.
      const rgb = this.color.mix(this.tailColor, ratio).mul(this.emissiveMultiplier);
      return vec4(rgb, ratio.oneMinus().mul(alpha));
    })();

    item.mesh = new THREE.Mesh(this.geometry, material);
    item.mesh.renderOrder = 1;
    item.mesh.frustumCulled = false;
    this.scene.add(item.mesh);

    this.items.push(item);
    return item;
  }

  /** @param {number} delta WALL-clock seconds; the reference's constants ride ×2 inside. */
  update(delta) {
    const deltaScaled = delta * 2;

    for (const item of this.items) {
      const data = item.dataTexture.source.data.data;

      const distance = item.lastPosition.distanceTo(item.position);
      if (distance > this.distanceThrottle) {
        for (let i = this.subdivisions - 1; i >= 0; i--) {
          const i4 = i * 4;
          data[i4] = data[i4 - 4];
          data[i4 + 1] = data[i4 - 3];
          data[i4 + 2] = data[i4 - 2];
          data[i4 + 3] = data[i4 - 1];
        }
        item.lastPosition.copy(item.position);
      }

      for (let i = this.subdivisions - 1; i >= 0; i--) {
        data[i * 4 + 3] = Math.max(data[i * 4 + 3] - deltaScaled * this.decay, 0);
      }

      data[0] = item.position.x;
      data[1] = item.position.y;
      data[2] = item.position.z;
      data[3] = item.alpha;

      item.dataTexture.needsUpdate = true;
    }
  }
}
