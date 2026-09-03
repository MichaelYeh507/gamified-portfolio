import * as THREE from 'three/webgpu';
import { uniform, positionWorld, smoothstep, Discard } from 'three/tsl';
import { RIM_COLOR } from './palette.js';

/**
 * The whole "world assembles itself around you" effect, in one float.
 *
 * From the the reference site teardown. A disc is defined in world XZ by a centre
 * and a radius. Then two complementary rules:
 *
 *   content materials  →  discard OUTSIDE the disc
 *   the void grid      →  discard INSIDE  the disc
 *
 * The boundary where one stops and the other starts is the glowing seam. There
 * is no mask texture, no stencil buffer, no second render pass and no
 * streaming — animating `radius` is the entire effect.
 *
 * This class owns the uniforms and the two clip rules and nothing else. The
 * animation lives in `Intro`, which is the only thing that ever moves them:
 * decision 5 deleted the distance-driven growth, so after the intro finishes
 * these values never change again.
 */
export default class Reveal {
  /**
   * `rimWidth` is 0.12 rather than the 2.4 it was through Phase 1, and the
   * change is a consequence of bloom landing rather than a taste call.
   *
   * The reference's `thickness` is 0.05 against a hard `step()`, and the reference author lets a bloom pass
   * with a threshold of 1 turn that band into the glow. Without bloom we had no
   * way to make a thin line read as light, so we smeared a 2.4-wide cubed ramp
   * across the terrain to fake one — 77 % of a car length, against the reference's 1.9 %
   * (`KNOWN-ISSUES.md` 2).
   *
   * 0.12 rather than the reference's 0.05 for one reason: ours is a `smoothstep`, not a
   * `step`. A hard band a twentieth of a unit wide, seen at 45° through a 25°
   * lens, is thinner than a pixel at the far side of frame and will crawl. The
   * ramp antialiases it, and `pow(2)` in the material biases the brightness
   * back to the outer edge so the *lit* part is about 0.05 — the reference's width, drawn
   * in a way that survives the angle.
   */
  constructor({ radius = 0, rimWidth = 0.12, rimIntensity = 5.5 } = {}) {
    this.radius = uniform(radius);
    this.center = uniform(new THREE.Vector2(0, 0));
    this.rimWidth = uniform(rimWidth);
    this.rimColor = uniform(new THREE.Color().copy(RIM_COLOR));

    /**
     * Separate from the colour because the day cycle drives the two
     * independently (decision 11, and the reference's `revealColor` / `revealIntensity`).
     * Nothing writes it yet — `Cycles` is step 6.
     */
    this.rimIntensity = uniform(rimIntensity);

    /** World-space distance of the shaded fragment from the reveal centre. */
    this.distance = positionWorld.xz.sub(this.center).length();

    /** 0 deep inside the disc → 1 exactly at the seam. */
    this.rim = smoothstep(this.radius.sub(this.rimWidth), this.radius, this.distance);
  }

  /** Call inside an Fn() body of a *content* material. */
  clipContent() {
    Discard(this.distance.greaterThan(this.radius));
  }

  /** Call inside an Fn() body of the *void* material. */
  clipVoid() {
    Discard(this.distance.lessThan(this.radius));
  }

  setCenter(x, z) {
    this.center.value.set(x, z);
  }

  /**
   * End the effect for good.
   *
   * The radius goes somewhere nothing will ever reach rather than to Infinity:
   * the seam is `distance - rimWidth`, and an infinity there subtracts to NaN.
   * A finite 1e5 keeps every fragment far inside the disc, puts the rim well
   * outside the far plane, and stays inside f32 precision. The reference's does the same
   * thing with 99999 (`Reveal.js:167`).
   */
  finish() {
    this.radius.value = 1e5;
  }
}
