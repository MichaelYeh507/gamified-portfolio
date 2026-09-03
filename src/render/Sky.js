import * as THREE from 'three/webgpu';
import { mix, rangeFogFactor, uniform, vec2, viewportUV } from 'three/tsl';

/**
 * Sky and fog as one object, because they are one colour.
 *
 * This is the whole of decision 1: there is no horizon. The ground fades into
 * fog, the fog *is* the background, and no seam exists anywhere to give the
 * island's edge away. Driving the reference build out over open water is what
 * makes the case — the water gradient runs into the fog and the fog into the
 * sky as a single continuous ramp, and it is far more convincing seen than
 * described.
 *
 * The mechanism, studied from `Game/Fog.js` in the reference and rebuilt here:
 * one colour node is assigned to `scene.backgroundNode` *and* used as the fog
 * target in the content material. Because it is literally the same node, the
 * two can never drift apart — no matching of a clear colour against a fog
 * colour, no seam when one is retuned and the other is forgotten.
 *
 * **The sky is a screen-space radial ramp, not a dome and not a hemisphere
 * gradient.** That sounds like a cheat and is not, for one specific reason:
 * decision 15's camera never rotates. With phi and theta fixed for the life of
 * the project, a gradient in viewport UV *is* a stable gradient over the world,
 * so a dome would cost geometry and a cubemap to reproduce something two nodes
 * already do exactly.
 */
export default class Sky {
  constructor(scene, { colorA = '#00ffff', colorB = '#9b89ff' } = {}) {
    this.colorA = uniform(new THREE.Color(colorA));
    this.colorB = uniform(new THREE.Color(colorB));

    /**
     * Distance zero is the bottom-left of the viewport, matching the reference.
     * With a fixed camera that corner is the near ground, so `colorA` is the
     * horizon end of the ramp and `colorB` the zenith end.
     */
    this.radialCenter = uniform(new THREE.Vector2(0, 0));
    this.radialStart = uniform(0);
    this.radialEnd = uniform(1);

    const ramp = vec2(viewportUV.xy)
      .sub(this.radialCenter)
      .length()
      .smoothstep(this.radialStart, this.radialEnd);

    /** The one node. Background and fog target both read this. */
    this.color = mix(this.colorA, this.colorB, ramp);
    scene.backgroundNode = this.color;

    this.near = uniform(30);
    this.far = uniform(64);

    /** Linear range fog, in view distance. Consumed by `makeContentMaterial`. */
    this.strength = rangeFogFactor(this.near, this.far);

    /**
     * The visible ground band, in camera-to-ground distance at the bottom and
     * top edges of frame. Written by `View.updateOptimalArea()`, which owns the
     * camera constants; these defaults only stand until the first call.
     */
    this.band = { near: 32.46, far: 63.86 };

    /**
     * Fog placed as a **fraction of that band**, which is what makes it
     * independent of resolution, aspect and field of view. 0 puts the fog's
     * start at the bottom edge of the visible ground, 1 at the top edge, and
     * past 1 beyond the horizon.
     *
     * These are the reference's day values, and they are scaffolding: decision
     * 45 puts the whole palette behind the 2a colour gate. Its four presets,
     * for when the cycle lands, are day 0.315/1.25, dusk 0/1.25, night
     * -0.85/1.0, dawn 0.3/1.25 — verified against its running build to two
     * decimals at three separate phases.
     *
     * The far ratio sitting at or just past 1.0 is the mechanism behind "no
     * horizon anywhere": fog always saturates within a whisker of the top edge
     * of the visible ground, so there is never any ground left to draw a line
     * against the sky. The negative near ratio at night is not a typo — it
     * starts the fog well in front of the visible ground, which is why nights
     * read as enclosed.
     */
    this.ratios = { near: 0.315, far: 1.25 };

    this._apply();
  }

  /** The visible ground band, from the camera rig. */
  setBand(nearDistance, farDistance) {
    this.band.near = nearDistance;
    this.band.far = farDistance;
    this._apply();
  }

  /** Fog placement within the band, as fractions. Day-cycle driven later. */
  setRatios(near, far) {
    this.ratios.near = near;
    this.ratios.far = far;
    this._apply();
  }

  setColors(a, b) {
    this.colorA.value.set(a);
    this.colorB.value.set(b);
  }

  /**
   * Four of the day cycle's nine properties land here — both ends of the sky
   * ramp and both ends of the fog band.
   *
   * Read straight out of `properties` rather than through the `values` getter,
   * because that getter builds an object and this runs every frame.
   */
  applyCycle(cycle) {
    this.colorA.value.copy(cycle.properties.skyHorizon.value);
    this.colorB.value.copy(cycle.properties.skyTop.value);
    this.setRatios(cycle.properties.fogNear.value, cycle.properties.fogFar.value);
  }

  /**
   * Both ends are measured from the band's **near** edge, not one from each
   * end. That is deliberate and is what lets `far` run past the horizon with a
   * ratio over 1 while `near` runs in front of the frame with a negative one.
   */
  _apply() {
    const amplitude = this.band.far - this.band.near;
    this.near.value = this.band.near + this.ratios.near * amplitude;
    this.far.value = this.band.near + this.ratios.far * amplitude;
  }
}
