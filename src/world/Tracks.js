import * as THREE from 'three/webgpu';
import {
  Fn,
  atan,
  cos,
  float,
  mul,
  positionGeometry,
  screenUV,
  sign,
  sin,
  texture,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

/**
 * The reference's wheel tracks, ported from `Tracks.js` (2 Sep, Michael on the grass:
 * "we can try to add where if the car goes over the grass it gets
 * trampled").
 *
 * The construction is the reference's, and it never touches the terrain texture: a
 * 40-unit orthographic window around the car is rendered top-down into a
 * 512² render target, and the only things in that scene are four ribbons —
 * one per wheel — whose geometry is a static 128-segment strip repositioned
 * in the vertex shader from a scrolling 128×1 DataTexture of ground contact
 * points (the same trick the boost trails use). Wherever a ribbon paints
 * red, the terrain's cover channel is multiplied down (`Terrain.js:98-103`
 * in the reference's) — so the grass blades drop out and the ground shows sand under
 * the tyres. The ribbons fade over their back half, so the grass stands up
 * again ~25 units behind the car: a wake, not a permanent scar.
 *
 * Numbers the reference's: resolution 512, window 40, 128 subdivisions, a sample every
 * 0.2 units at most 30 times a second, wheel ribbons 0.5 thick. The reference's chassis
 * ribbon (1.5, green channel) only feeds the reference's snow and is not ported.
 */

const RESOLUTION = 512;
const SIZE = 40;
const SUBDIVISIONS = 128;
const TIME_THROTTLE = 1 / 30;
const DISTANCE_THROTTLE = 0.2;

export default class Tracks {
  constructor() {
    this.size = SIZE;
    this.halfSize = SIZE / 2;
    this.tracks = [];

    /** Where the window is centred — the car, the reference's `focusPoint`. */
    this.focus = new THREE.Vector2();
    /** The same point, for the shaders that map world XZ → window UV. */
    this.focusUniform = uniform(new THREE.Vector2());

    this.camera = new THREE.OrthographicCamera(
      -this.halfSize, this.halfSize, this.halfSize, -this.halfSize, 0.1, 10
    );
    this.camera.position.y = 5;
    this.camera.rotation.x = -Math.PI * 0.5;

    this.scene = new THREE.Scene();
    // Clear to black: red is "erased", and the main renderer's clear colour
    // is the void's, which would erase the whole window every frame.
    this.scene.background = new THREE.Color(0x000000);
    this.scene.add(this.camera);

    this.renderTarget = new THREE.RenderTarget(RESOLUTION, RESOLUTION, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
  }

  add(track) {
    this.tracks.push(track);
    this.scene.add(track.mesh);
    return track;
  }

  /**
   * TSL: how erased the ground is at a world XZ, 0 untouched → 1 flattened.
   * The reference's `position.sub(-halfSize).sub(tracksDelta).div(size)`; the clamp is
   * ours, because four additive ribbons can cross.
   */
  eraseNode(worldXZ) {
    const windowUv = worldXZ.add(this.halfSize).sub(this.focusUniform).div(this.size);
    return texture(this.renderTarget.texture, windowUv).r.clamp(0, 1);
  }

  follow(x, z) {
    this.focus.set(x, z);
  }

  /**
   * Render the window. Once per frame, after the car's visual is posed and
   * before the main pass reads the target.
   */
  render(renderer) {
    this.camera.position.x = this.focus.x;
    this.camera.position.z = this.focus.y;
    this.focusUniform.value.copy(this.focus);

    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previous);
  }
}

/** One ribbon: a wheel's last 128 ground contacts, drawn as a strip. */
export class Track {
  constructor(thickness = 0.5) {
    this.thickness = thickness;
    this.lastTime = -Infinity;
    this.lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity);

    this.dataTexture = new THREE.DataTexture(
      new Float32Array(SUBDIVISIONS * 4),
      SUBDIVISIONS,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );

    this.geometry = new THREE.PlaneGeometry(1, 1, SUBDIVISIONS, 1);
    this.geometry.translate(0.5, 0, 0);

    this.material = new THREE.MeshBasicNodeMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });

    const trackData = varying(vec4());

    // The reference's positionNode line for line: each strip vertex looks up its own
    // contact point and the previous one, takes the heading between them,
    // and steps sideways by the thickness.
    this.material.positionNode = Fn(() => {
      const fragmentSize = float(1).div(SUBDIVISIONS);
      const ratio = uv().x.sub(fragmentSize.mul(0.5));

      trackData.assign(texture(this.dataTexture, vec2(ratio, 0.5)));
      const trackDataPrev = texture(this.dataTexture, vec2(ratio.sub(fragmentSize), 0.5));

      const angle = atan(
        trackData.z.sub(trackDataPrev.z),
        trackData.x.sub(trackDataPrev.x)
      );

      const sideSign = sign(positionGeometry.y).mul(-1);
      const side = angle.add(sideSign.mul(Math.PI * 0.5));
      const trailPosition = vec2(cos(side), sin(side)).mul(this.thickness);

      return vec3(
        trackData.x.add(trailPosition.x),
        trackData.y,
        trackData.z.add(trailPosition.y)
      );
    })();

    this.material.colorNode = vec3(1, 0, 0);

    // The reference's alpha: fades in over the first 5 %, out over the back half, only
    // where the wheel was touching, soft across the width, and faded toward
    // the window's edge so the erase never has a hard border when the
    // window scrolls.
    this.material.opacityNode = Fn(() => {
      const endAlpha = uv().x.smoothstep(0.5, 1).oneMinus();
      const startAlpha = uv().x.smoothstep(0, 0.05);
      const contactAlpha = trackData.a;
      const renderEdgeAlpha = mul(
        screenUV.x.remapClamp(0, 0.2, 0, 1),
        screenUV.x.remapClamp(0.8, 1, 1, 0),
        screenUV.y.remapClamp(0, 0.2, 0, 1),
        screenUV.y.remapClamp(0.8, 1, 1, 0)
      );
      const trackEdgeAlpha = uv().y.sub(0.5).abs().mul(2).oneMinus();

      return endAlpha.mul(startAlpha).mul(contactAlpha).mul(trackEdgeAlpha).mul(renderEdgeAlpha);
    })();

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /**
   * Feed one ground contact. Throttled by time and distance as the reference's is, so a
   * parked car does not scroll its own history away; the newest sample is
   * always rewritten so the strip's head sits under the tyre.
   */
  update(position, touching, elapsed) {
    const data = this.dataTexture.image.data;

    if (elapsed - this.lastTime > TIME_THROTTLE) {
      if (this.lastPosition.distanceTo(position) > DISTANCE_THROTTLE) {
        for (let i = SUBDIVISIONS - 1; i >= 1; i--) {
          const i4 = i * 4;
          data[i4] = data[i4 - 4];
          data[i4 + 1] = data[i4 - 3];
          data[i4 + 2] = data[i4 - 2];
          data[i4 + 3] = data[i4 - 1];
        }
        this.lastTime = elapsed;
        this.lastPosition.copy(position);
      }
    }

    data[0] = position.x;
    data[1] = position.y;
    data[2] = position.z;
    data[3] = touching ? 1 : 0;

    this.dataTexture.needsUpdate = true;
  }
}
