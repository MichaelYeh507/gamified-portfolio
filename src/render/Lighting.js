import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { LIGHT_COLOR, SHADOW_COLOR } from './palette.js';

/**
 * The whole lighting rig: one directional light, and the uniforms the content
 * material reads.
 *
 * Ported from `reference/source/sources/Game/Ligthing.js` (the reference's spelling).
 * Two things about it are unusual enough to state plainly:
 *
 * **The three.js light does not light anything.** `makeContentMaterial`
 * overrides `outputNode` completely and ignores three's diffuse result, so this
 * light exists for exactly two reasons: it owns the shadow map, and its
 * direction feeds `directionUniform`. Its `intensity` is inert — the value that
 * matters is `intensityUniform` below, which the material multiplies directly.
 *
 * **There is no ambient and no second light.** No hemisphere, no ambient, no
 * fill. What used to be the hemisphere's job — stopping unlit faces going black
 * — is now `shadowColor`: shadowed surfaces are the albedo tinted cool rather
 * than the albedo darkened. A soft normal-dependent gradient is precisely what
 * makes flat palette colours read as unfinished, so it is gone on purpose.
 *
 * `DayCycles` writes into `colorUniform`, `intensityUniform` and
 * `shadowColorUniform` when it lands; they are uniforms so that costs nothing.
 */
export default class Lighting {
  constructor(scene, { color = LIGHT_COLOR, intensity = 1.2, shadowColor = SHADOW_COLOR } = {}) {
    /**
     * Offset from the followed point to the light. Its normalised form is the
     * direction *toward* the light, which is the sign `coreShadow` expects:
     * `N · direction = 1` means the surface faces the sun and is fully lit.
     */
    this.offset = new THREE.Vector3(38, 52, 22);
    this.direction = this.offset.clone().normalize();

    this.directionUniform = uniform(this.direction);
    this.colorUniform = uniform(new THREE.Color().copy(color));
    this.intensityUniform = uniform(intensity);
    this.shadowColorUniform = uniform(new THREE.Color().copy(shadowColor));

    // The core-shadow ramp, over N·L. Low is below zero so surfaces facing
    // slightly away from the sun are not immediately at full shadow.
    this.coreShadowEdgeLow = uniform(-0.25);
    this.coreShadowEdgeHigh = uniform(1);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 220;
    light.shadow.camera.left = -55;
    light.shadow.camera.right = 55;
    light.shadow.camera.top = 55;
    light.shadow.camera.bottom = -55;
    light.shadow.bias = -0.0012;
    light.shadow.normalBias = 0.03;

    scene.add(light);
    scene.add(light.target);

    this.light = light;
  }

  /**
   * The three light properties the day cycle carries.
   *
   * What it deliberately does **not** drive is the sun's *direction*. The reference's swings
   * it with the cycle — `spherical.theta = 0.72 + sin(-(progress + 9/16) * 2pi)
   * * 1.25`, phi similarly against 0.62, so the reference's sun rides high at noon and rakes
   * at night without ever dropping below the horizon (`Ligthing.js:186-187`).
   * Ours is fixed, for the colour gate's sake: sixteen renders that differ in
   * shadow *direction* as well as colour are sixteen different compositions, and
   * the gate is a colour comparison. The reference's constants are recorded in `ROADMAP.md`
   * so this stays a half-hour to add once a palette is chosen.
   */
  applyCycle(cycle) {
    this.colorUniform.value.copy(cycle.properties.lightColor.value);
    this.intensityUniform.value = cycle.properties.lightIntensity.value;
    this.shadowColorUniform.value.copy(cycle.properties.shadowColor.value);
  }

  /** Keep the shadow frustum on a point, or shadows vanish once you drive away. */
  follow(position) {
    this.light.position.set(
      position.x + this.offset.x,
      position.y + this.offset.y,
      position.z + this.offset.z
    );
    this.light.target.position.set(position.x, position.y, position.z);
    this.light.target.updateMatrixWorld();
  }
}
