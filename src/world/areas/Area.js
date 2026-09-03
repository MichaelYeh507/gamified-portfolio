import * as THREE from 'three/webgpu';
import { paint } from '../../render/palette.js';

/**
 * A place in the world that owns content.
 *
 * Lifecycle, in order, driven entirely by the car's distance to `center`:
 *
 *   construct  — cheap. Data only. No geometry, no bodies, no textures.
 *   build()    — once, the first time the car comes within `buildRadius`. Never undone.
 *   enter()    — every time the car crosses into `radius`.
 *   update()   — every frame while inside `radius`. Never called otherwise.
 *   leave()    — every time the car crosses out.
 *
 * From `reference/source/sources/Game/World/Areas/Area.js`, keeping the reference's three
 * responsibilities and changing three things — the changes are the reason this is
 * worth writing rather than porting:
 *
 * **Lazy build.** The reference's constructs every area's geometry at world construction and
 * only gates the *updating*. That is affordable at the reference's scale because the reference author is loading
 * one GLB anyway; ours would mean building six areas' worth of props before the
 * intro can run. `buildRadius` sits well outside `radius` so a place is finished
 * long before you can see it, and the build happens once and is never undone —
 * tearing down and rebuilding is how you get a stutter every lap.
 *
 * **Real `enter`/`leave` methods** rather than a `Zones` subscription. The reference author has 13
 * areas plus secrets and a general zone system worth having; we have six places and
 * no `Events` habit to protect, so a squared-distance compare is the whole
 * mechanism. `D` §2.4 records that the reference's activation is pure distance underneath
 * anyway — the zone machinery is indirection over the same test.
 *
 * **A radius instead of the reference's ground-quad frustum test.** `D` §2.5 describes a circle
 * against a projected ground quad, which is a real visibility test and a real
 * saving when an area is a kilometre of race circuit. Ours are dioramas a few tens
 * of units across; a radius is the same answer for less. Upgradeable in place if a
 * future area is long and thin.
 */
export default class Area {
  /**
   * @param {import('../../core/Game.js').default} game
   * @param {object} def
   * @param {string} def.id            the deep-link key (`?at=<id>`). Immutable.
   * @param {[number, number]} def.center       world XZ
   * @param {number} [def.radius]      inside this, `update()` runs
   * @param {number} [def.buildAhead]  how far outside `radius` to build
   * @param {[number, number]} [def.spawn]      where fast travel puts the car
   */
  constructor(game, def) {
    this.game = game;
    this.id = def.id;
    this.def = def;

    this.center = new THREE.Vector3(def.center[0], 0, def.center[1]);
    this.radius = def.radius ?? 26;
    /** Build before you arrive, so nothing pops in. */
    this.buildRadius = this.radius + (def.buildAhead ?? 45);

    /** Where `?at=<id>` and the fast-travel map put the car. */
    this.spawn = def.spawn ?? def.center;

    /**
     * Which way it faces you when it does.
     *
     * Not decoration. The world is authored for one viewing angle (decision 16),
     * so a district has a front, and arriving on the default heading of 0 means
     * arriving pointed at the back of everything in it. The reference's respawn points each
     * carry a yaw for the same reason (`Respawns.js`), and `Island._placeSpawns`
     * already computes one so a drowned car is never set down facing the sea.
     */
    this.heading = def.heading ?? 0;

    this.group = new THREE.Group();
    this.group.name = `area:${this.id}`;
    this.group.visible = false;

    this.isBuilt = false;
    this.isIn = false;

    /** Interact points this area created, in creation order. */
    this.beacons = [];

    /** Rapier bodies we created, so a teardown is possible if it is ever wanted. */
    this._bodies = [];
  }

  /**
   * Squared distance from a point, XZ only — the only per-frame cost of an area
   * that is nowhere near you.
   *
   * Squared on purpose: no square root, and the comparisons it feeds are against
   * squared radii. Note the argument is usually `car.position`, which is a
   * **Rapier** vector with no three.js methods on it, so this reads `.x` and `.z`
   * and nothing else.
   */
  distanceSq(position) {
    const dx = position.x - this.center.x;
    const dz = position.z - this.center.z;
    return dx * dx + dz * dz;
  }

  // ---- subclass hooks -------------------------------------------------------

  /** Geometry, bodies and beacons. Called once; `this.group` is already in the scene. */
  build() {}
  enter() {}
  leave() {}
  update(_delta, _elapsed) {}

  /**
   * The `&p=<target>` half of a deep link: where in this area that target
   * stands, or `null` to use the area's own spawn.
   *
   * Two hooks rather than one, because they run **two seconds apart**. This one
   * runs during `goTo()`, before the cinematic, so the car is already standing
   * in the right place when the curtain goes up; `openTarget` runs after the
   * cinematic has finished. Anything that collapsed them into a single "arrive
   * at" call would have to pick one of those moments for both.
   *
   * The area is guaranteed built by the time this is called — `goTo` forces it —
   * so an implementation may read whatever `build()` produced.
   *
   * @param {string|null} _target
   * @returns {{x: number, z: number, heading: number}|null}
   */
  spawnFor(_target) {
    return null;
  }

  /**
   * Open whatever `&p=<target>` names, once, on arrival. A `null` target, or one
   * this area does not recognise, must be a no-op: the visitor is standing in
   * the right district either way and a broken link should cost them a card, not
   * a boot.
   *
   * @param {string|null} _target
   */
  openTarget(_target) {}

  // ---- helpers subclasses actually use --------------------------------------

  /**
   * A prop: one mesh on the shared content material, plus an optional cuboid
   * collider.
   *
   * **`color` is not optional, and that is a material constraint rather than a
   * style one.** Everything in this world is coloured by which texel of the
   * palette texture its UVs point at (`render/palette.js`), so geometry handed to
   * `contentMaterial` without a `paint()` call has no UVs at all and samples
   * whatever sits at (0, 0). The `D` report's version of this helper omitted it,
   * which would have shipped a plaza of grass-coloured monoliths.
   *
   * One mesh per prop rather than the merged single geometry `Island._buildProps`
   * uses. Deliberate at this scale: an area's props are countable, several of them
   * need to be individually movable or hideable, and merging them would make
   * `beacon()` unable to point at anything. The instancing pass is Phase 3 and it
   * is where this gets revisited.
   */
  addProp(geometry, { color, position = [0, 0, 0], rotationY = 0, collider = null } = {}) {
    if (color === undefined) throw new Error(`area:${this.id}: addProp needs a palette colour`);
    paint(geometry, color);

    const mesh = new THREE.Mesh(geometry, this.game.contentMaterial);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.y = rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    if (collider) this.addBox(collider, position, rotationY);
    return mesh;
  }

  /** A fixed cuboid collider. `halfExtents` in metres. */
  addBox(halfExtents, position, rotationY = 0) {
    const { RAPIER, world } = this.game.physics;
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotationY
    );

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position[0], position[1], position[2])
        .setRotation(rotation)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents[0], halfExtents[1], halfExtents[2]),
      body
    );
    this._bodies.push(body);
    return body;
  }

  /**
   * Register an interact point, owned by this area.
   *
   * Owned matters: `Beacons` will not consider it a candidate unless this area is
   * the one the car is standing in, which is what stops a prompt in the next
   * district competing with the one in front of you.
   */
  beacon({ position, label, onInteract, radius }) {
    const created = this.game.beacons.create({
      position: Array.isArray(position)
        ? new THREE.Vector3(position[0], position[1], position[2])
        : position,
      label,
      onInteract,
      radius,
      area: this,
    });
    this.beacons.push(created);
    return created;
  }

  /**
   * Ground height under a point, for placing props on terrain that is not flat.
   *
   * Areas should use this rather than assuming y = 0. Land is flat at y = 0 across
   * most of the island, but not on the shore dish, and an area that assumed
   * otherwise would float or sink the first time one is placed near water.
   */
  groundAt(x, z) {
    return this.game.terrain.heightAt(x, z);
  }
}
