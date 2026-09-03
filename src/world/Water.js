import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { WATER_SURFACE, WATER_FLOOR } from './Terrain.js';

/**
 * The water, which is mostly three numbers and a plane that follows you.
 *
 * The reference's `Water` class is exactly this: `surfaceElevation`, `depthElevation` and a
 * `surfaceThickness`, held as uniforms so the shader and the gameplay read the
 * same values (`Game/Water.js`). Everything else lives in the material, or in
 * the car.
 *
 * The plane follows the camera's focus point on a snapped grid, the same trick
 * the reference's floor uses (`Floor.js:176-178`). That is what makes the water *infinite*
 * rather than merely large: drive off the island onto the bedrock and the sea
 * keeps going, because there is no edge to reach. Snapping to a whole number of
 * grid cells rather than following continuously keeps any world-space detail in
 * the material from crawling as the plane slides.
 *
 * Its size only has to beat the fog. Anything past `Sky`'s far distance has
 * already resolved to the sky colour, so a 400-unit quad centred on the focus
 * point is comfortably more sea than can ever be seen at once, in two triangles.
 */

const PLANE_SIZE = 400;
const SNAP = 4;

export default class Water {
  constructor(material = null) {
    /** The reference's `-0.3`. The line the whitening band and the drowning logic key off. */
    this.surfaceElevation = uniform(WATER_SURFACE);

    /** The reference's `0.013`. Half-height of the white band, so the band is 0.026 tall. */
    this.surfaceThickness = uniform(0.013);

    /** The reference's `-1.5`. Where the shore dish bottoms out and the bedrock's top sits. */
    this.depthElevation = uniform(WATER_FLOOR);

    this.mesh = null;
    if (material) this.build(material);
  }

  build(material) {
    const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'water';
    this.mesh.position.y = WATER_SURFACE;
    // Transparent and depth-write-off: it has to be drawn after the island, and
    // it must never be frustum-culled on the strength of a bounding box that is
    // recentred every frame.
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;

    return this.mesh;
  }

  /** Call once per frame with whatever the camera is looking at. */
  follow(x, z) {
    if (!this.mesh) return;
    this.mesh.position.x = Math.round(x / SNAP) * SNAP;
    this.mesh.position.z = Math.round(z / SNAP) * SNAP;
  }
}
