import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * The night's uniforms — what turns the emissive layer on and aims the
 * headlights. One instance, shared by both content materials, written once
 * per frame from the day cycle and the car.
 *
 * **This is the PoleLights session** (ROADMAP handoff item, plus Michael's
 * addition: *"also add a light for the car headlights when it turns
 * night"*), and it is one shader term rather than a lamp system, because of
 * a fact the retint tool established: **band 12 (amber) IS the emissive
 * band.** Everything that should glow — the lamp chambers, the streetlight
 * glass, the buggy's head and tail lenses, the bonfire flames, the glow
 * mushrooms, the flower hearts — already sits on that band, merged scatter
 * included. So the content material tests the palette *u* and adds a
 * luminance-normalised emissive (`B` §3.5) wherever it lands on amber,
 * scaled by `emissiveIntensity`; nothing needs a per-lamp object.
 *
 * The headlight is a cone term in the same material: brightens the ground's
 * own albedo (warm-tinted) inside a forward cone from the car's nose, so it
 * reads as light falling on the world rather than a decal. It exists in the
 * shader because our flat toon material ignores three's lights entirely —
 * a real `SpotLight` would illuminate nothing.
 *
 * Both fade with `nightness`, a smooth ramp inside the day cycle's `night`
 * interval (0.25–0.7): up through 0.25→0.33, down through 0.62→0.70, so
 * lamps come on through dusk instead of snapping at a boundary.
 */

/** Peak emissive multiplier at full night. 2.5 against a bloom threshold of
 *  1: an amber texel (luminance-normalised to ~1) lands at 2.5 and blooms,
 *  which is what makes a lamp read as a light and not as yellow paint. */
const EMISSIVE_NIGHT = 2.5;

/** Cone half-angle ~36° and reach in world units, tuned wide and short: a
 *  pool of light ahead of the car, not a searchlight to the horizon. */
export const HEADLIGHT = Object.freeze({
  coneCos: 0.81,
  range: 15,
  /** Where the beam starts: ahead of the nose, at lamp height. */
  forward: 2.0,
  height: 0.7,
  /** Downward tilt blended into the forward direction. */
  droop: 0.35,
});

const _forward = new THREE.Vector3();

export default class Night {
  constructor() {
    /** 0 by day → 1 at full night. Read by anything that fades with dark. */
    this.nightness = 0;

    this.emissiveIntensity = uniform(0);
    this.headlightIntensity = uniform(0);
    this.headlightPosition = uniform(new THREE.Vector3(0, -100, 0));
    this.headlightDirection = uniform(new THREE.Vector3(0, 0, 1));
  }

  /**
   * @param {number} progress  day-cycle progress, 0..1
   * @param {import('three').Object3D|null} carObject  the car's visual root —
   *   the interpolated pose, so the beam never judders against the body
   */
  update(progress, carObject) {
    const rise = smooth(0.25, 0.33, progress);
    const fall = smooth(0.62, 0.7, progress);
    this.nightness = rise * (1 - fall);

    this.emissiveIntensity.value = this.nightness * EMISSIVE_NIGHT;
    this.headlightIntensity.value = this.nightness;

    if (carObject) {
      _forward.set(0, 0, 1).applyQuaternion(carObject.quaternion);
      this.headlightPosition.value
        .copy(carObject.position)
        .addScaledVector(_forward, HEADLIGHT.forward)
        .setY(carObject.position.y + HEADLIGHT.height);
      this.headlightDirection.value
        .copy(_forward)
        .setY(_forward.y - HEADLIGHT.droop)
        .normalize();
    }
  }
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
