/**
 * The name → material registry — `F` rec 6, the reference's `Materials.getFromName`
 * ported. Blender **material names are part of the level format** (`F` §1.5):
 * the first mesh to use a name defines the runtime material, and every later
 * mesh in any file shares that instance. This is what keeps draw calls and
 * material binds low across a whole world of separate GLBs.
 *
 * The one name that matters today is **`palette`** — pre-registered by
 * `Game.js` with `contentMaterial` before the first model loads, exactly as the reference author
 * pre-registers seven (`Materials.js:25-33`). A Blender mesh whose material is
 * called `palette` therefore renders through our whole shading model — reveal
 * clip, waterline, palette bands — and the material the exporter wrote is
 * thrown away, which is why the export checklist says to mute the palette
 * image node first: it was never going to be read.
 *
 * **A deliberate deviation from the reference's.** The reference's `createFromMaterial` converts every
 * unknown glTF material into the reference's `MeshDefaultMaterial`. Ours caches the loaded
 * material untouched: all authored art is supposed to say `palette`, and a
 * prop rendering in three's standard PBR look — wrong lighting, no reveal
 * clip — is a *visible* signal that a material name missed the registry, where
 * an auto-converted one would blend in and hide the miss. If a second special
 * material ever needs hand-written TSL (the reference's emissive gradients), it gets
 * pre-registered here the same way `palette` is.
 *
 * `prevent` on a **material** (the reference's `Materials.js:362`) is honoured: a material
 * carrying `userData.prevent` is left completely untouched — the reference's careerText
 * materials ride this. Note this is the material-level property; the
 * object-level word is `preventAutoAdd` and lives in `pipeline/Objects.js`.
 */
export default class MaterialRegistry {
  constructor() {
    /** @type {Map<string, import('three').Material>} */
    this.list = new Map();
  }

  /** Pre-register a hand-written material under a Blender material name. */
  save(name, material) {
    this.list.set(name, material);
    return material;
  }

  /**
   * The material a name resolves to. First use defines; every later use
   * shares. The reference's `Materials.js:273-285`.
   */
  getFromName(name, baseMaterial) {
    const existing = this.list.get(name);
    if (existing) return existing;
    this.list.set(name, baseMaterial);
    return baseMaterial;
  }

  /**
   * Swap every mesh material under a model for its registry instance. Runs on
   * every loaded model — the reference's `Materials.updateObject`, called from
   * `Objects.add` on the visual side of everything that enters the world.
   */
  updateObject(root) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      const material = child.material;
      if (material.userData && material.userData.prevent) return;
      child.material = this.getFromName(material.name, material);
    });
  }
}
