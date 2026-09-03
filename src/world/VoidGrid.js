import * as THREE from 'three/webgpu';

/**
 * The floor of the void: one big plane carrying the × glyph field.
 *
 * It is the other half of the reveal system — it discards wherever the island
 * exists, so the two never overlap and the boundary between them is the seam
 * that glows. One plane, one draw call, no geometry per glyph.
 */
export default class VoidGrid {
  constructor(material, { extent = 1400, y = 0 } = {}) {
    const geometry = new THREE.PlaneGeometry(extent, extent, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'void-grid';
    this.mesh.position.y = y;
    // The grid is background: never let it write depth over the island.
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  /**
   * The grid is intro scaffolding (decision 6), so it has a lifetime and needs
   * an end to it. The material is shared with nothing else, but it is owned by
   * `Game` and disposed with the rest of the scene — only the geometry is ours.
   */
  destroy() {
    this.mesh.geometry.dispose();
    this.mesh.geometry = null;
  }
}
