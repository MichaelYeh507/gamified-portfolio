import * as THREE from 'three/webgpu';
import { HALF, WATER_FLOOR } from './Terrain.js';

/**
 * The thing that makes falling out of the world impossible.
 *
 * `KNOWN-ISSUES.md` 4 called for "the bedrock boundary cuboid — it is what
 * stops a car leaving the island into open water", and that description of the reference's
 * turned out to be wrong. It is not a wall. Read off the reference's running build
 * (`Floor.js:154-203`, and driven to confirm): it is a **12 × 12 kinematic slab
 * whose top face sits exactly on the water floor**, enabled once the player is
 * within `halfWidth` of the world edge and snapped to the player's rounded x/z
 * every frame. It does not stop you leaving — it carries you. Full throttle off
 * the reference's island runs out to five hundred units at a constant 5.45 m/s with all
 * four wheels in contact, indefinitely, with nothing catching it.
 *
 * That is a better answer than a wall, and it is the one adopted here. A wall
 * is something to get wedged against and something to see; a follower floor is
 * invisible, cannot be climbed, and makes `KNOWN-ISSUES.md` 15's "respawn
 * cannot rescue a car that left the world" unreachable by construction rather
 * than by rescue. Decision 43's drowning fade is then the *only* thing that
 * takes you out of the water, which means it is the only thing that has to feel
 * right.
 *
 * One slab of twelve units is enough because it only has to be under the car
 * for the frame it is under the car — it is repositioned before every step.
 */

/** The reference's `bedRock.halfWidth`. Also the band inside the edge where it switches on. */
const HALF_WIDTH = 6;
const HALF_HEIGHT = 0.5;

/** Beyond this from the origin on either axis, the slab wakes up. */
const ARM_DISTANCE = HALF - HALF_WIDTH;

/**
 * The visual sea floor: as wide as the water plane, snapped on the same
 * grid, so it has no edge to reach either.
 */
const FLOOR_SIZE = 400;
const FLOOR_SNAP = 4;
/** A hair under the height field's outer ring, which is flat at the floor. */
const FLOOR_DROP = 0.02;

export default class Bedrock {
  constructor(physics) {
    const { RAPIER, world } = physics;

    this.enabled = false;
    this.y = WATER_FLOOR - HALF_HEIGHT; // top face flush with the water floor
    this.floor = null;

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, this.y, 0)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF_WIDTH, HALF_HEIGHT, HALF_WIDTH).setFriction(0.5),
      this.body
    );
    this.body.setEnabled(false);
  }

  /**
   * The bedrock's visual half — the sea floor past the height field.
   *
   * Since the water went transparent (2 Sep) the sea's colour is the GROUND's
   * depth gradient, and the height field is 150 units wide: past its edge
   * there was nothing under the water plane but the void's clear colour,
   * which Michael's first drive caught in one line ("for the very far water
   * it becomes like a different shade... i think it might have became the
   * sky color"). This is one flat plane at the water floor, wearing the
   * **terrain's own material**: the terrain texture clamps to its edge
   * texels, which are the floor, so the albedo out here evaluates to exactly
   * the navy the height field's outer ring shows — same shading, same fog,
   * and no seam where the mesh ends. It sits a hair under that ring so the
   * two never fight for the same depth.
   */
  buildFloor(material) {
    const geometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(geometry, material);
    this.floor.name = 'seaFloor';
    this.floor.position.y = WATER_FLOOR - FLOOR_DROP;
    this.floor.receiveShadow = true;
    this.floor.frustumCulled = false;
    return this.floor;
  }

  /** Once per frame with the camera's focus, the water plane's own snap. */
  followFloor(x, z) {
    if (!this.floor) return;
    this.floor.position.x = Math.round(x / FLOOR_SNAP) * FLOOR_SNAP;
    this.floor.position.z = Math.round(z / FLOOR_SNAP) * FLOOR_SNAP;
  }

  /** Call once per frame, before the physics step, with the car's position. */
  follow(position) {
    const near = Math.abs(position.x) > ARM_DISTANCE || Math.abs(position.z) > ARM_DISTANCE;

    if (!near) {
      if (this.enabled) {
        this.enabled = false;
        this.body.setEnabled(false);
      }
      return;
    }

    if (!this.enabled) {
      this.enabled = true;
      this.body.setEnabled(true);
    }

    // Rounded, as the reference's is: a slab that slides continuously under a moving car
    // hands the wheels a surface with velocity, and the whole point is a floor
    // that is simply there.
    this.body.setNextKinematicTranslation({
      x: Math.round(position.x),
      y: this.y,
      z: Math.round(position.z),
    });
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
  }
}
