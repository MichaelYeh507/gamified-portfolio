import * as THREE from 'three/webgpu';

/**
 * Found props that react — the reference's knockable dressing, measured 2 Sep on
 * Michael's "what else makes the map feel alive".
 *
 * Every piece of set dressing in the reference's world is a **dynamic body born
 * asleep**: `Benches.js`, `Fences.js`, `Bricks.js` all run the same
 * description — `type: 'dynamic'`, **mass 0.1** (against the reference's 2.5 chassis),
 * friction 0.7, `sleeping: true`, colliders from the model — and that is
 * most of why driving through the reference's world feels like touching it. Ours
 * placed the same props as visuals with no body at all, so the car drove
 * *through* the fence, the cart, the barrels and the log seats.
 *
 * This is the reference's description with the collider derived from the prop's own
 * bounds (the prep tool grounds every model at its base, so the box sits
 * above the origin and the body's origin stays on the ground), through the
 * same `objects.add` road the letters and the contact icons already use.
 * Not ported: the reference's `waterGravityMultiplier: −1` (props float) — ours sink
 * to the sea floor, which is on the books.
 */
const HIS = Object.freeze({ mass: 0.1, friction: 0.7 });

/** A prop's size in its own frame — what a stack needs to know. */
export function propSize(model) {
  const size = new THREE.Vector3();
  if (model) new THREE.Box3().setFromObject(model).getSize(size);
  return size;
}

/**
 * Stand a found prop as a knockable body.
 *
 * @param {object} game
 * @param {import('three').Object3D} model the loader's cached scene; cloned here
 * @param {{ x: number, z: number, rotationY?: number, mass?: number, friction?: number }} placement
 * @returns the object from `objects.add`, or null without a model
 */
export function standDynamicProp(
  game,
  model,
  { x, z, rotationY = 0, lift = 0, mass = HIS.mass, friction = HIS.friction }
) {
  return standProp(game, model, { x, z, rotationY, lift }, { type: 'dynamic', mass, friction, sleeping: true });
}

/**
 * Stand a found prop as a wall: a fixed body with the same bounds-derived
 * collider, for dressing that should stop the car rather than scatter.
 *
 * Michael, 3 Sep, on the live site: "make the fences in my career section
 * not movable" — the corridor's fence is a lane edge along the river bank,
 * and a lane edge that topples on the first brush against it stops being an
 * edge. The cart, barrels, crates and log seats stay the reference's knockable bodies.
 */
export function standFixedProp(game, model, { x, z, rotationY = 0, lift = 0 }) {
  return standProp(game, model, { x, z, rotationY, lift }, { type: 'fixed', friction: HIS.friction });
}

function standProp(game, model, { x, z, rotationY, lift }, body) {
  if (!model) return null;

  const clone = model.clone(true);
  // Bounds in the prop's own frame, before it is placed or turned: the
  // collider is body-local and turns with the body.
  const box = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);

  const ground = game.terrain.heightAt(x, z);

  return game.objects.add(
    { model: clone },
    {
      ...body,
      // `lift` stacks: a crate on a crate is born at the lower one's height.
      position: [x, ground + 0.01 + lift, z],
      rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
      colliders: [
        {
          shape: 'cuboid',
          parameters: [size.x / 2, size.y / 2, size.z / 2],
          position: [centre.x, centre.y, centre.z],
        },
      ],
    }
  );
}
