import { parseModel } from '../pipeline/Objects.js';

/**
 * The runtime glue — the reference's `Game/Objects.js` (`Objects.js:19-113`), the last
 * piece between the pipeline and a model standing in the world.
 *
 *   loader → GLTFLoader → `parseModel` → registry → `getPhysical` → scene
 *
 * `pipeline/Objects.js` is the *naming* half of the reference's class (what a name means);
 * this is the *orchestration* half (what gets built from it). They share the reference's
 * filename on purpose — together they are the reference's `Objects`, split where testable
 * purity ends.
 *
 * Ported from the reference's call sites, not just the reference's class: `Area.js:40-66` and
 * `Scenery.js:14-35` are the two shapes of caller, and `Fences.js:19-52` is
 * the third — colliders harvested once from a base model, then `add()` called
 * N times with manual descriptions. All three work against this API.
 *
 * **What is deliberately different from the reference's, and why.**
 *
 * - **Explicit dependencies** (`scene`, `physics`, `materials`) instead of the
 *   `Game` singleton, like every other module in `src/`.
 * - **Visuals follow bodies through the interpolation seam**, not a raw
 *   per-tick copy. The reference's `update()` copies `body.translation()` straight into
 *   the visual, which quantises prop motion to the physics clock — the exact
 *   defect measured on the car (18.9 % dead frames at 148 Hz, see
 *   `Physics.js`). Every dynamic object here registers `savePose()` with
 *   `physics.addInterpolated` and draws at `alpha` between substeps, the
 *   car's own idiom (`Car.js:549-586`).
 * - **`addFromModel` returns `null` for a `preventAutoAdd` node** instead of
 *   relying on every caller to check first. The reference's `Area.js:40` checks before
 *   calling; a caller that forgets gets a silently-added fan. References are
 *   still the caller's to parse — after this, per the reference's ordering.
 * - **Merge precedence: the caller's description wins over the parsed one**
 *   (undefined values skipped, so an absent `mass` cannot clobber an authored
 *   one). The reference's is subtly different — `getFromModel` writes userData values
 *   *over* the caller's restitution/friction/category — but no caller of the reference's
 *   ever passes both, so the difference is unexercised even in the reference's build.
 *
 * One shape of the reference's kept even though it reads odd: **the one-shot transform
 * copy at `add()` runs unconditionally.** The reference's guard is
 * `sleeping || !enabled || fixed`, and `!undefined` makes it true for every
 * description that does not say `enabled: true` — which is all of them. A body
 * born asleep never enters the sync loop, so without this copy its visual
 * would stand wherever the GLB left it while the body sleeps somewhere else.
 */
export default class Objects {
  constructor({ scene, physics, materials }) {
    this.scene = scene;
    this.physics = physics;
    this.materials = materials;

    /** Every object ever added, visual-only ones included. */
    this.list = [];
    /** The dynamic subset that `syncVisuals` walks. */
    this._synced = [];
  }

  /**
   * The reference's `Objects.add`. Either half may be absent: a decorative prop has no
   * `physicalDescription`, an invisible collider no `visualDescription`.
   *
   * @param {{ model: import('three').Object3D, updateMaterials?: boolean,
   *           castShadow?: boolean, receiveShadow?: boolean,
   *           parent?: import('three').Object3D|null }|null} visualDescription
   * @param {object|null} physicalDescription passed to `Physics.getPhysical`
   */
  add(visualDescription, physicalDescription = null) {
    const object = { visual: null, physical: null };

    if (visualDescription && visualDescription.model) {
      const {
        model,
        updateMaterials = true,
        castShadow = true,
        receiveShadow = true,
        parent = this.scene,
      } = visualDescription;

      if (updateMaterials) this.materials.updateObject(model);

      if (castShadow || receiveShadow) {
        model.traverse((child) => {
          if (!child.isMesh) return;
          if (castShadow) child.castShadow = true;
          if (receiveShadow) child.receiveShadow = true;
        });
      }

      if (parent !== null) parent.add(model);
      object.visual = { object3D: model, parent };
    }

    if (physicalDescription) {
      object.physical = this.physics.getPhysical(physicalDescription);
      object.physical.body.userData = { object };
    }
    if (object.visual) object.visual.object3D.userData.object = object;

    if (object.visual && object.physical) {
      // The one-shot copy — see the class comment for why it is unconditional.
      const t = object.physical.body.translation();
      const r = object.physical.body.rotation();
      object.visual.object3D.position.set(t.x, t.y, t.z);
      object.visual.object3D.quaternion.set(r.x, r.y, r.z, r.w);

      const type = object.physical.type;
      if (type === 'dynamic' || type === 'kinematicPositionBased') {
        const record = {
          object,
          _prev: { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w },
          _hasPrev: false,
          _sleeping: false, // start false so the first sync always applies
          savePose: () => {
            const pt = object.physical.body.translation();
            const pr = object.physical.body.rotation();
            const p = record._prev;
            p.x = pt.x; p.y = pt.y; p.z = pt.z;
            p.qx = pr.x; p.qy = pr.y; p.qz = pr.z; p.qw = pr.w;
            record._hasPrev = true;
          },
        };
        this.physics.addInterpolated(record);
        this._synced.push(record);
      }
    }

    this.list.push(object);
    return object;
  }

  /**
   * The reference's `addFromModel`: parse the naming convention off a node, then `add`.
   *
   * The physical description the caller supplies is the *placement* —
   * `position` and `rotation` at minimum, per `Scenery.js:29`. Do not build it
   * with `child.position.add(parent.position)`: `Vector3.add` mutates the
   * child in place, which is the reference's `Area.js:46` landmine.
   *
   * @returns the object, or **`null` for a `preventAutoAdd` node** — the node
   *   is not added to the scene and no body is built, matching `Area.js:40`
   *   skipping the call entirely. References on it are still the caller's to
   *   parse afterwards.
   */
  addFromModel(model, visualDescription = {}, physicalDescription = {}) {
    const parsed = parseModel(model);
    if (parsed.preventAutoAdd) return null;

    let physical = null;
    if (parsed.physical) {
      physical = { ...parsed.physical };
      for (const [key, value] of Object.entries(physicalDescription)) {
        if (value !== undefined) physical[key] = value;
      }
    }

    return this.add({ ...visualDescription, model }, physical);
  }

  /**
   * Draw every awake dynamic prop where it is *now* — `TICK.POST_PHYSICS`,
   * beside `car.syncVisual`, and the same shortest-arc nlerp for the same
   * reason: consecutive substeps are 1/120 apart, so the two quaternions are
   * never more than a fraction of a degree apart (`Car.js:571-583`).
   *
   * A sleeping body is applied **once** on the transition and then skipped —
   * the reference's loop skips sleepers too (`Objects.js:324-328`); the transition apply
   * is what the reference author needs `needsUpdate` for, folded in here.
   */
  syncVisuals() {
    const alpha = this.physics.alpha;

    for (const record of this._synced) {
      if (!record._hasPrev) continue; // never stepped: the one-shot copy stands

      const body = record.object.physical.body;
      const sleeping = body.isSleeping();
      if (sleeping && record._sleeping) continue;
      record._sleeping = sleeping;

      const a = sleeping ? 1 : alpha; // final pose exactly on the transition
      const t = body.translation();
      const r = body.rotation();
      const p = record._prev;
      const visual = record.object.visual.object3D;

      visual.position.set(
        p.x + (t.x - p.x) * a,
        p.y + (t.y - p.y) * a,
        p.z + (t.z - p.z) * a
      );

      const dot = p.qx * r.x + p.qy * r.y + p.qz * r.z + p.qw * r.w;
      const sign = dot < 0 ? -1 : 1;
      const qx = p.qx + (r.x * sign - p.qx) * a;
      const qy = p.qy + (r.y * sign - p.qy) * a;
      const qz = p.qz + (r.z * sign - p.qz) * a;
      const qw = p.qw + (r.w * sign - p.qw) * a;
      const len = Math.hypot(qx, qy, qz, qw) || 1;
      visual.quaternion.set(qx / len, qy / len, qz / len, qw / len);
    }
  }
}
