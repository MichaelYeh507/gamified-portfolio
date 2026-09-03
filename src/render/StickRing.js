import * as THREE from 'three/webgpu';
import { abs, atan, float, Fn, If, max, positionGeometry, step, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { STICK } from '../core/stickMath.js';

/**
 * The stick's ring — the reference's `Nipple.setMeshes` shader, ported as
 * it stands.
 *
 * A flat ring in the world at the car's feet, drawn only while a finger is
 * down (or the tap animation is playing): two circle edges at the throttle's
 * two radii, a brighter outer arc across the forward 270° (or the rear 90°
 * when reversing, so the ring says which way it will go), and a wedge
 * between the edges that fills **out to the finger's distance and across
 * to its bearing** — the throttle and the steer, drawn as one shape. At
 * full throttle the fill goes half again as bright.
 *
 * The geometry's radii and the shader's SDFs share `STICK`'s numbers, so a
 * tune of the radii moves the picture and the maths together. Everything
 * else here is the reference's: the edge and outline widths, the alpha
 * split, the hop (up 1 in 0.1 s, down in 0.6 s, `Nipple.jump`), and the
 * `clamp(y − 0.25, 0.1, 0.65)` plane the stick already uses.
 */

const EDGE = 0.1;
const OUTLINE = 0.2;
const HOP = Object.freeze({ up: 0.1, down: 0.6, height: 1 });

export default class StickRing {
  constructor(scene) {
    const low = STICK.radiusLow;
    const high = STICK.radiusHigh;

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    const geometry = new THREE.RingGeometry(low - EDGE - OUTLINE, high + EDGE + OUTLINE, 20, 1);
    geometry.rotateX(-Math.PI * 0.5);

    this.uniforms = {
      progress: uniform(1),
      forward: uniform(1),
      progressStartAngle: uniform(0),
      progressEndAngle: uniform(0),
      colorMultiplier: uniform(1),
    };

    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const u = this.uniforms;
    material.outputNode = Fn(() => {
      const radialCoord = vec2(positionGeometry.xz);
      const radialAngle = atan(radialCoord.y, radialCoord.x);

      // The arc that says which way: the forward amplitude, or its complement.
      const directionAngleSDF = abs(radialAngle).sub(STICK.forwardAmplitude * 0.5).toVar();
      If(u.forward.lessThan(0.5), () => {
        directionAngleSDF.assign(directionAngleSDF.negate());
      });
      const directionAngle = step(directionAngleSDF, 0);

      // The two edges.
      const innerEdgeSDF = abs(radialCoord.length().sub(low));
      const outerEdgeSDF = abs(radialCoord.length().sub(high));
      const innerEdgeFill = step(innerEdgeSDF, EDGE / 2);
      const innerEdgeOutline = step(innerEdgeSDF, OUTLINE / 2);
      const outerEdgeFill = step(outerEdgeSDF, EDGE / 2).mul(directionAngle);
      const outerEdgeOutline = step(outerEdgeSDF, OUTLINE / 2);
      const edgesFill = max(innerEdgeFill, outerEdgeFill);
      const edgesOutline = max(innerEdgeOutline, outerEdgeOutline);

      // The wedge: out to the throttle, across to the bearing.
      const progressSDF = radialCoord
        .length()
        .sub(low)
        .sub(u.progress.mul(high - low - OUTLINE / 2))
        .toVar();
      const progressLowSDF = radialCoord.length().sub(low + OUTLINE / 2).negate();
      progressSDF.assign(max(progressSDF, progressLowSDF));
      const progressFill = step(progressSDF, 0).toVar();

      const inAngle = float(0).toVar();
      If(radialAngle.greaterThan(u.progressStartAngle).and(radialAngle.lessThan(u.progressEndAngle)), () => {
        inAngle.assign(1);
      });
      progressFill.assign(progressFill.mul(inAngle));
      const progressOutline = step(progressSDF, OUTLINE / 4).mul(directionAngle);

      const outline = max(edgesOutline, progressOutline);
      const fill = max(edgesFill, progressFill);

      outline.lessThan(0.00001).discard();

      const alpha = outline.mul(0.35).add(fill.mul(0.75));
      return vec4(vec3(fill).mul(u.colorMultiplier), alpha);
    })();

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    /** Seconds into the hop, or −1 when still. */
    this._hopAt = -1;
  }

  /** The reference's `Nipple.jump`: a bump up and a slower settle. */
  hop() {
    this._hopAt = 0;
  }

  get animated() {
    return this._hopAt >= 0;
  }

  /**
   * Once per tick from `TouchStick.update`: place the ring under the car,
   * turn it to the heading, and paint the reading.
   */
  update(stick, car, delta) {
    if (this._hopAt >= 0) {
      this._hopAt += delta;
      const t = this._hopAt;
      let y;
      if (t < HOP.up) {
        const k = t / HOP.up;
        y = HOP.height * (1 - (1 - k) * (1 - k)); // power2.out
      } else if (t < HOP.up + HOP.down) {
        const k = (t - HOP.up) / HOP.down;
        const e = k < 0.5 ? 8 * k ** 4 : 1 - (-2 * k + 2) ** 4 / 2; // power4.inOut
        y = HOP.height * (1 - e);
      } else {
        y = 0;
        this._hopAt = -1;
      }
      this.mesh.position.y = y;
    }

    if (!stick.active && !this.animated) {
      this.group.visible = false;
      return;
    }

    const p = car.position;
    this.group.position.set(p.x, stick.planeY(), p.z);
    this.mesh.rotation.y = -car.headingXZ();

    const { progress, forward, offset } = stick.reading;
    const u = this.uniforms;
    u.progress.value = progress;
    u.forward.value = forward ? 1 : 0;
    if (forward) {
      u.progressStartAngle.value = Math.min(0, offset);
      u.progressEndAngle.value = Math.max(0, offset);
    } else if (offset > 0) {
      u.progressStartAngle.value = -Math.PI;
      u.progressEndAngle.value = -Math.PI + offset;
    } else {
      u.progressStartAngle.value = Math.PI + offset;
      u.progressEndAngle.value = Math.PI;
    }
    u.colorMultiplier.value = progress === 1 ? 1.5 : 1;
    this.group.visible = true;
  }
}
