import { parsePhysical, parseColliderShape, colliderParameters, stripPhysicsWords } from './names.js';

/**
 * The physics half of the naming convention: `Objects.getFromModel`, ported.
 *
 * A Blender object called `benchPhysicalDynamic` with a child called `cuboid`
 * becomes a dynamic rigid body with one box collider, and the box is sized by
 * **the child's scale alone** — the collider child's mesh is never looked at for
 * a primitive. That gives the format its nicest authoring property: a default
 * 2 m Blender cube scaled to `(1, 1, 1)` is a 1 m collider, so **the scale value
 * you type is the size in metres**.
 *
 * This module stops at a *description*. It does not touch Rapier, and that is
 * deliberate: `world/Physics.js` has no generic "add a body from a description"
 * seam yet — every body in the project today is built ad hoc by `Car`, `Island`
 * or an `Area` — and inventing one here would be guessing at an API before
 * there is a second caller. The description is the contract; wiring it to Rapier
 * belongs with `ResourcesLoader` in Phase 3A.
 *
 * ---
 *
 * **What this does mutate, because the reference's does and things depend on it.**
 * `parseModel` renames the object in place, stripping the physics words, exactly
 * as `Objects.js:157` does. `refLettersPhysicalDynamic.010` becomes
 * `refLetters010`. It also `removeFromParent()`s every collider child, so
 * colliders never render. Both are load-bearing: the rename is what makes
 * `F` §1.2's depth rule work, and without the removal you would see your
 * collision boxes.
 */

/** Blender custom properties are untyped. `size: "4"` sits beside `size: 2`. */
function number(value, fallback = undefined) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value !== '' && value !== '0' && value !== 'false';
  return !!value;
}

/**
 * Read one collider child. Returns null if the name declares no shape.
 *
 * Position and rotation are the child's **local** transform, relative to the
 * physical object — which is what a Rapier collider offset wants, and which is
 * why a scaled *parent* is not accounted for anywhere. The reference's does the same, and
 * the reference's `.blend` is authored against it.
 */
function readCollider(child) {
  const shape = parseColliderShape(child.name);
  if (!shape) return null;

  const collider = {
    shape,
    position: [child.position.x, child.position.y, child.position.z],
    quaternion: [child.quaternion.x, child.quaternion.y, child.quaternion.z, child.quaternion.w],
  };

  if (shape === 'trimesh' || shape === 'hull') {
    const geometry = child.geometry;
    if (!geometry || !geometry.attributes.position) {
      throw new Error(`collider "${child.name}" is a ${shape} but carries no geometry`);
    }
    // Rapier ignores the index array for a convex hull, but the reference's passes both and
    // the shapes are otherwise identical to build, so keep them symmetric.
    collider.parameters = [
      geometry.attributes.position.array,
      geometry.index ? geometry.index.array : null,
    ];
  } else {
    collider.parameters = colliderParameters(shape, child.scale);
  }

  const restitution = number(child.userData.restitution);
  if (restitution !== undefined) collider.restitution = restitution;
  const friction = number(child.userData.friction);
  if (friction !== undefined) collider.friction = friction;
  if (child.userData.category !== undefined) collider.category = String(child.userData.category);

  return collider;
}

/**
 * Parse one model node into `{ visual, physical, userData }`.
 *
 * `physical` is null unless the name contains `physical` anywhere — that word,
 * and only that word, is what creates a body at all. The type words are read in
 * the reference's order, and `fixed` is the fallthrough rather than a match: it appears in
 * the cleanup regex and selects nothing.
 *
 * @param {import('three').Object3D} model
 * @param {{ strip?: boolean }} [options] `strip: false` keeps the physics words
 *   in the name — use it for nodes deeper than a group's direct children, where
 *   the reference's pipeline never runs the rename. See `F` §1.2.
 */
export function parseModel(model, { strip = true } = {}) {
  const userData = model.userData ?? {};
  const physicalName = parsePhysical(model.name);

  const result = {
    visual: model,
    physical: null,
    userData,
    /** `F` §1.6 — skips object and physics creation; references still parse. */
    preventAutoAdd: boolean(userData.preventAutoAdd),
    /**
     * Only ever set this to `true` in Blender. The reference's condition is
     * mis-parenthesised, so an explicit `false` force-*adds* the object to the
     * frustum hide list — the opposite of what it reads as. We do not copy the
     * bug, but the authoring advice is the same: set it or leave it out.
     */
    preventFrustum: boolean(userData.preventFrustum),
  };

  /**
   * `preventAutoAdd` skips object and physics creation **entirely** — no body,
   * no colliders, and crucially **no rename**. References are still parsed.
   *
   * The reference's `Area.js:40` implements it by not calling `addFromModel` at all; ours
   * honours it here so a caller cannot forget, because forgetting is not a
   * visible mistake. It is also the actual reason `BowlingArea.js:84` asks for
   * `items.get('pinPhysicalDynamic')` with the physics words still in the key:
   * `refPinPhysicalDynamic` is a **direct child** of its area group, so `F`
   * §1.2's depth explanation does not cover it. It keeps its words because
   * `preventAutoAdd` is set on it and the rename never runs. Measured on
   * `areas.glb`: depth 2, `userData.preventAutoAdd === true`.
   */
  if (result.preventAutoAdd) return result;

  if (!physicalName) return result;

  const colliders = [];
  // A copy, because readCollider detaches children as it goes.
  for (const child of [...model.children]) {
    const collider = readCollider(child);
    if (!collider) continue;
    colliders.push(collider);
    child.removeFromParent();
  }

  /**
   * `sleeping: true` is the reference's, and it is not a detail.
   *
   * `Area.js:47` starts **every** body asleep. `areas.glb` alone carries 97
   * dynamic bodies; waking all of them at boot means Rapier integrating a
   * hundred props that nothing has touched, in a world where the whole point of
   * the prop layer is that it sits still until you drive into it. Carried in the
   * description rather than left to whoever builds the body, because it is part
   * of the contract and rediscovering it costs a profiling session.
   */
  result.physical = { type: physicalName.type, colliders, sleeping: true };

  const restitution = number(userData.restitution);
  if (restitution !== undefined) result.physical.restitution = restitution;
  const friction = number(userData.friction);
  if (friction !== undefined) result.physical.friction = friction;
  if (userData.category !== undefined) result.physical.category = String(userData.category);

  /**
   * Mass is spread across the colliders, not set on the body — the reference's
   * `Physics.js:182-185` does `setMass(mass / colliders.length)` on each. Kept
   * here rather than in the caller because ours has no `Area.js` to split it
   * across; the reference's reads it at `Area.js:51`, which is why `F` §1.6 lists it there.
   */
  const mass = number(userData.mass);
  if (mass !== undefined) result.physical.mass = mass;

  if (strip) model.name = stripPhysicsWords(model.name);

  return result;
}
