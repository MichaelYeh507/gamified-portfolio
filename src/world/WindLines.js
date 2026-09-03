import * as THREE from 'three/webgpu';
import {
  Fn,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  cross,
  float,
  modelWorldMatrix,
  mul,
  positionGeometry,
  uniform,
  vec3,
  vec4,
  vertexIndex,
} from 'three/tsl';
import { COLOR, PALETTE } from '../render/palette.js';

/**
 * The reference's wind lines — `World/WindLines.js` + `Geometries/WindLineGeometry.js`
 * (2 Sep, the fourth item of the alive list): pale streaks that skate over
 * the ground on a gust, so the wind the grass bends to can be SEEN.
 *
 * The reference's construction, kept: a pool of four ribbons, each a Catmull-Rom curve
 * through four handles zig-zagging ±0.5 across a 10-unit run, built as a
 * two-vertices-per-point strip with a `ratio` attribute (`LineGeometry`).
 * The vertex stage gives the strip its width — 0.1, fat in the middle of
 * the run and pinched at the ends — and a **bump of width that travels
 * down the line** as a progress uniform runs 0 → 1 (the reference's `progress × 3 − 1`,
 * so the bump enters from one end and leaves by the other). Every 0.3–2 s
 * a free line is stood 2 units up at a random spot around the focus, turned
 * to the wind's angle, and slid one unit downwind over four seconds while
 * its bump runs. No light, no fog, no shadow: a streak, not a surface.
 *
 * One deliberate difference: the reference's ribbon widens along a fixed world tangent
 * `(0, 1, −1)`, which faces the reference's camera; ours widens perpendicular to both
 * the line's direction and the eye, so the streak is a billboard at any
 * wind angle under our fixed 45° rig. And the timer rides the ticker rather
 * than `setTimeout`, so a hand-pumped or hidden tab keeps the cadence.
 */

const POOL = 4;
const LINE = Object.freeze({ length: 10, handles: 4, amplitude: 1, divisions: 30, thickness: 0.1, height: 2 });
const INTERVAL = Object.freeze({ min: 0.3, max: 2.0 });
/** The reference's `duration` at the calm end of the reference's weather (8 s at no wind, 2 s in a
 *  storm); our wind is a constant 0.5. */
const DURATION = 4;
const TRANSLATION = 1;

/** The reference's `WindLineGeometry` over the reference's `LineGeometry`. */
function windLineGeometry() {
  const { length, handles: handlesCount, amplitude, divisions } = LINE;
  const halfExtent = length / 2;
  const handleSpan = length / (handlesCount - 1);
  const handles = [];
  for (let i = 0; i < handlesCount; i++) {
    handles.push(new THREE.Vector3(0, (i % 2) - 0.5 * amplitude, -halfExtent + i * handleSpan));
  }
  const points = new THREE.CatmullRomCurve3(handles).getPoints(divisions);

  const count = points.length;
  const positions = new Float32Array(count * 6);
  const directions = new Float32Array(count * 6);
  const ratios = new Float32Array(count * 2);
  const indices = new Uint16Array((count - 1) * 6);

  for (let i = 0; i < count; i++) {
    const point = points[i];
    const next = points[Math.min(i + 1, count - 1)];
    const direction = next.clone().sub(point).normalize();
    for (let side = 0; side < 2; side++) {
      const at = (i * 2 + side) * 3;
      positions[at] = point.x;
      positions[at + 1] = point.y;
      positions[at + 2] = point.z;
      directions[at] = direction.x;
      directions[at + 1] = direction.y;
      directions[at + 2] = direction.z;
      ratios[i * 2 + side] = i / (count - 1);
    }
    if (i < count - 1) {
      const i2 = i * 2;
      indices.set([i2 + 2, i2, i2 + 1, i2 + 1, i2 + 3, i2 + 2], i * 6);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('direction', new THREE.Float32BufferAttribute(directions, 3));
  geometry.setAttribute('ratio', new THREE.Float32BufferAttribute(ratios, 1));
  geometry.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), LINE.length);
  return geometry;
}

class WindLine {
  constructor(scene) {
    this.available = true;
    this.progress = uniform(0);
    this.thickness = uniform(LINE.thickness);
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.startedAt = 0;

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const white = new THREE.Color(PALETTE[COLOR.white]);
    material.colorNode = vec3(white.r, white.g, white.b);

    // The reference's vertexNode, with the billboard side.
    material.vertexNode = Fn(() => {
      const worldPosition = modelWorldMatrix.mul(vec4(positionGeometry, 1)).toVar();

      const ratio = attribute('ratio', 'float');
      const baseThickness = ratio.sub(0.5).abs().mul(2).oneMinus().smoothstep(0, 1);
      const remappedProgress = this.progress.mul(3).sub(1);
      const progressThickness = ratio.sub(remappedProgress).abs().oneMinus().smoothstep(0, 1);
      const finalThickness = mul(this.thickness, baseThickness, progressThickness);

      // Pairs: even vertices one side, odd the other.
      const sideStep = vertexIndex.toFloat().mod(2).sub(0.5);
      const direction = modelWorldMatrix.mul(vec4(attribute('direction', 'vec3'), 0)).xyz;
      const toEye = cameraPosition.sub(worldPosition.xyz);
      const side = cross(direction, toEye).normalize();
      worldPosition.xyz.addAssign(side.mul(sideStep.mul(finalThickness)));

      return cameraProjectionMatrix.mul(cameraViewMatrix.mul(worldPosition));
    })();

    this.mesh = new THREE.Mesh(windLineGeometry(), material);
    this.mesh.name = 'windLine';
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }
}

export default class WindLines {
  constructor({ scene, wind }) {
    this.wind = wind;
    this.pool = [];
    for (let i = 0; i < POOL; i++) this.pool.push(new WindLine(scene));
    this._nextAt = 0;
  }

  /** The reference's `display()`: a free line, stood around the focus, turned to the wind. */
  display(focus, elapsed) {
    const line = this.pool.find((l) => l.available);
    if (!line) return null;

    const d = this.wind.direction.value;
    const angle = Math.atan2(d.x, d.y);

    line.available = false;
    line.startedAt = elapsed;
    line.from.set(
      focus.x + (Math.random() - 0.5) * 30,
      LINE.height,
      focus.z + (Math.random() - 0.5) * 30
    );
    line.to.set(
      line.from.x + Math.sin(angle) * TRANSLATION,
      LINE.height,
      line.from.z + Math.cos(angle) * TRANSLATION
    );
    line.mesh.rotation.y = angle;
    line.mesh.position.copy(line.from);
    line.progress.value = 0;
    line.mesh.visible = true;
    return line;
  }

  /** Once per frame with the ticker's clock and the camera's focus. */
  update(elapsed, focus) {
    if (elapsed >= this._nextAt) {
      this.display(focus, elapsed);
      this._nextAt = elapsed + INTERVAL.min + Math.random() * (INTERVAL.max - INTERVAL.min);
    }

    for (const line of this.pool) {
      if (line.available) continue;
      const t = Math.min(1, (elapsed - line.startedAt) / DURATION);
      // The reference's gsap defaults ease out; the slide and the bump share the curve.
      const eased = 1 - (1 - t) * (1 - t);
      line.progress.value = eased;
      line.mesh.position.lerpVectors(line.from, line.to, eased);
      if (t >= 1) {
        line.mesh.visible = false;
        line.available = true;
      }
    }
  }
}
