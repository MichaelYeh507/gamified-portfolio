/**
 * The three-file split (`F` §3.2, rec 2), which is a naming convention over
 * files exactly as `^ref` is a naming convention over nodes.
 *
 *   <name>References.glb   transforms only — empties or trivial meshes carrying
 *                          position/rotation/scale. No materials, no textures.
 *   <name>Visual.glb       the art. ONE copy of the prop.
 *   <name>Physical.glb     low-poly collision, shipped separately.
 *
 * **Adopt it before any art exists**, which is why this file is here now and not
 * later. The two properties it buys are hard to retrofit:
 *
 *   - **Instancing is free.** One visual mesh plus N transforms is an
 *     `InstancedMesh` without anyone deciding to make it one. The reference's
 *     `bushesReferences.glb` is 130 placements of a single mesh in 25 KB.
 *   - **Collision can be an order of magnitude coarser than the render mesh.**
 *     The reference's `playgroundPhysical` is 232 verts against `playgroundVisual`'s 2,842.
 *     One file cannot hold both without a rule for telling them apart, and the
 *     rule is the filename.
 *
 * A family may also skip the split entirely: `fences/fences.glb` is 16 placed
 * copies with collider children in one file. `resolveSplit` reports which shape
 * a family has rather than insisting on one.
 *
 * This module is **pure string work on purpose** — no loader, no fetch. What to
 * do with the URLs is `ResourcesLoader`'s job in Phase 3A; what the names *mean*
 * is a decision, and decisions belong somewhere testable.
 */

export const SPLIT_SUFFIXES = Object.freeze(['References', 'Visual', 'Physical']);

/**
 * The three URLs a family *may* have, given its directory and base name.
 *
 * the reference author's layout is `static/<name>/<name><Suffix>.glb`, and the directory name
 * always equals the base name — verified across all 64 of the reference's GLBs. Ours keeps
 * that, because it means a family is one folder and one word.
 */
export function splitUrls(name, { root = '/models' } = {}) {
  const base = `${root}/${name}/${name}`;
  return {
    references: `${base}References.glb`,
    visual: `${base}Visual.glb`,
    physical: `${base}Physical.glb`,
    /** The un-split form, for a family small enough not to need three files. */
    single: `${base}.glb`,
  };
}

/**
 * Classify a filename against the convention.
 *
 * @returns {{ family: string, part: 'references'|'visual'|'physical'|'single' }}
 */
export function classifyFile(filename) {
  const base = filename.replace(/\.glb$/i, '').replace(/-compressed$/i, '');
  for (const suffix of SPLIT_SUFFIXES) {
    if (base.endsWith(suffix)) {
      return { family: base.slice(0, -suffix.length), part: suffix.toLowerCase() };
    }
  }
  return { family: base, part: 'single' };
}

/**
 * Combine a loaded family into placements.
 *
 * The reference file's nodes carry **transforms, not geometry**, so this returns
 * one entry per placement pairing a transform with the shared visual and
 * physical roots. It deliberately does not clone or instance: whether a family
 * becomes an `InstancedMesh` or N `Mesh`es is a rendering decision, and this is
 * the data it gets made from.
 *
 * With no reference file, the visual root's own transform is the single
 * placement — which is what makes an un-split family work through the same path.
 *
 * @param {{ references?: import('three').Object3D|null,
 *           visual?: import('three').Object3D|null,
 *           physical?: import('three').Object3D|null }} parts
 */
export function combineSplit({ references = null, visual = null, physical = null }) {
  const placements = [];

  if (references) {
    references.traverse((node) => {
      // Skip the scene root itself; every real placement is a child of it.
      if (node === references) return;
      placements.push({
        name: node.name,
        position: [node.position.x, node.position.y, node.position.z],
        quaternion: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w],
        scale: [node.scale.x, node.scale.y, node.scale.z],
      });
    });
  } else if (visual) {
    placements.push({
      name: visual.name,
      position: [visual.position.x, visual.position.y, visual.position.z],
      quaternion: [visual.quaternion.x, visual.quaternion.y, visual.quaternion.z, visual.quaternion.w],
      scale: [visual.scale.x, visual.scale.y, visual.scale.z],
    });
  }

  return { placements, visual, physical };
}
