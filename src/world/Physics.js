import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Rapier, stepped at a fixed 1/60 of wall clock — simulating 1/30 each time.
 *
 * Fixed-step is not optional for a driving game: a variable timestep makes the
 * vehicle's handling depend on the frame rate, so the car behaves differently
 * on a 144 Hz monitor than on a 60 Hz one. The accumulator decouples the two.
 *
 * **The whole game runs at 2× wall clock** (`ROADMAP.md` decision 18). The reference's does
 * (`Time.js:12`, `ticker.scale = 2`), and it is a large part of why the reference's car
 * feels quick and why a small island feels far larger than it is. Two details
 * carry the decision:
 *
 *   - `world.timestep = timestep × timeScale` — 1/30 s of simulated time is
 *     consumed for every 1/60 s of wall time, so everything falls, brakes and
 *     accelerates at 4× the apparent rate and a physics speed of 5 reads as
 *     10 m/s on screen. Gravity stays a plain −9.81 and becomes an apparent
 *     −39.24, which is the reference's.
 *   - `vehicleDt` stays 1/60 and is deliberately **not** scaled. The reference's vehicle
 *     controller is fed `min(1/60, deltaAverage)` while the reference's world steps
 *     `deltaScaled` (`PhysicsVehicle.js:511-512` vs `Physics.js:242`), so the reference's
 *     wheels integrate against half the world's timestep. That 0.5 ratio is
 *     almost certainly incidental in the reference's code, but every constant in
 *     `src/world/Car.js` was tuned against it, and reproducing it is what lets
 *     those constants transfer with no arithmetic at all (`C` §5.1).
 *
 * **This was called "strictly better than the reference's version" and it was not.** The reference author feeds
 * `world.step()` a *variable* timestep of up to 1/15 s; we keep the fixed
 * accumulator (`C` §13.4). Fixed-step really is better for handling — that half
 * of the claim stands. What it silently cost is **smoothness**, and Michael saw
 * it before any of this was measured: *"it might just be the car animation being
 * more janky than the reference's."*
 *
 * A fixed 1/120 step read straight into the visual quantises the car's motion to
 * the physics clock. When the display is not a multiple of 120 the two beat
 * against each other. Measured on the running build, driving in a straight line
 * and sampling `car.object.position`:
 *
 * | render Hz | frames where the visual did not move | step-size variation |
 * |---|---|---|
 * | 148 (the reference's monitor) | **18.9 %** | **0.483** |
 * | 144 | 16.7 % | 0.448 |
 * | 120 | 0 % | 0.017 |
 * | 60 | 0 % | 0.016 |
 *
 * At 60 and 120 it is flawless, which is exactly why nobody caught it. The reference's build
 * has none of it because stepping once per frame keeps the reference's visuals locked to the
 * display — the reference author pays for that in handling determinism, which we are not willing
 * to pay.
 *
 * So neither trade is necessary: `alpha` below is the accumulator's remainder,
 * and anything that draws a physics body interpolates between its previous and
 * current pose by it. Fixed-step physics, display-rate visuals.
 *
 * **The substep is 1/120, not 1/60, and that is a bug fix rather than a taste.**
 * Found by driving: the car visibly shook. Measured, the chassis pitched with a
 * jitter of 0.118 deg at **29.7 Hz** — half the old 60 Hz step rate, so it flipped
 * sign on every single step. That is the signature of an explicit solver at its
 * stability limit, not of a suspension mode, and damping confirmed it: raising
 * relaxation towards critical made the shake *worse* (0.118 -> 0.385) and cost
 * 2.8 m/s of top speed.
 *
 * The cause is the 2x time scale of decision 18. Buying it by doubling
 * `world.timestep` to 1/30 halved the suspension solver's effective rate. Halving
 * the substep restores it while keeping the decision intact:
 *
 *   substep 1/60  -> world 1/30   jitter 0.1178 deg @ 29.7 Hz   top speed 11.28
 *   substep 1/120 -> world 1/60   jitter 0.0250 deg @  6.0 Hz   top speed 11.27
 *   substep 1/240 -> world 1/120  jitter 0.0253 deg @  6.0 Hz   top speed 11.28
 *
 * 1/120 is the knee — 1/240 buys nothing — and 6 Hz is the real pitch mode
 * emerging once the artifact is gone. **Top speed is unchanged across all three**,
 * so every constant in `world/Car.js` still transfers verbatim: the vehicle is
 * called twice as often with half the dt, which is the same impulse per second,
 * and the 0.5 `vehicleDt`:`world.timestep` ratio that `C` §5.1 depends on is
 * preserved (1/120 against 1/60). `maxSubSteps` doubles to 10 to match.
 */
export default class Physics {
  static async create(options) {
    await RAPIER.init();
    return new Physics(options);
  }

  constructor({ gravity = -9.81, timestep = 1 / 120, timeScale = 2, maxSubSteps = 10 } = {}) {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });

    this.timestep = timestep; // wall-clock time consumed per substep
    this.timeScale = timeScale;
    this.world.timestep = timestep * timeScale; // simulated time produced per substep
    this.vehicleDt = timestep; // deliberately NOT timestep × timeScale

    this.maxSubSteps = maxSubSteps;
    this.accumulator = 0;

    /** Vehicle controllers must be updated immediately before the world steps. */
    this.vehicles = [];

    /**
     * Things that draw a physics body and want it smooth. Each must expose
     * `savePose()`, called immediately before every `world.step()` so that after
     * the loop it holds the pose exactly one step behind the live one.
     */
    this.interpolated = [];

    /**
     * How far the renderer is between the last physics pose and the live one,
     * 0..1. Read by `savePose` users at draw time.
     */
    this.alpha = 0;

    /**
     * Collision groups, the reference's `Physics.js:30-39` verbatim. A category packs
     * Rapier's `(memberships << 16) | filter` word, and **only these three
     * keys are valid** — `floor`, `object`, `bumper`. The reference's code passes an
     * unknown category straight through as `setCollisionGroups(undefined)`,
     * which silently disables filtering; ours throws instead (see
     * `getPhysical`).
     *
     * The car, the island and the bedrock predate this and carry Rapier's
     * default groups (`0xffffffff` — member of everything, collides with
     * everything), which interacts correctly with all three categories: a
     * default body is a member of `all`, and every category's filter includes
     * `all`.
     */
    this.groups = {
      all: 0b0000000000000001,
      object: 0b0000000000000010,
      bumper: 0b0000000000000100,
    };
    this.categories = {
      floor: (this.groups.all << 16) | this.groups.all,
      object:
        ((this.groups.all | this.groups.object) << 16) |
        (this.groups.all | this.groups.bumper),
      bumper: (this.groups.bumper << 16) | this.groups.object,
    };

    /** Every body built through `getPhysical`, for reset/water logic later. */
    this.physicals = [];
  }

  /**
   * The add-from-description seam — the reference's `Physics.getPhysical`
   * (`Physics.js:85-240`), ported now that it has a caller: this is what
   * `pipeline/Objects.parseModel`'s descriptions were always for.
   *
   * The description is `parseModel`'s `physical` plus a placement:
   *
   *   { type, colliders, sleeping, position?, rotation?,
   *     restitution?, friction?, category?, mass?,
   *     canSleep?, enabled?, linearDamping?, angularDamping?, gravityScale? }
   *
   * and a collider is `{ shape, position, quaternion, parameters,
   * restitution?, friction?, category? }`, local to its body. Positions and
   * quaternions are accepted as the arrays `parseModel` emits ([x,y,z] /
   * [x,y,z,w]) or as objects, because the reference's callers pass `THREE.Vector3`s.
   *
   * The reference's defaults, kept to the letter because the reference's `.blend` is authored against
   * them: density 0.1 on every collider (how an unmassed prop gets a plausible
   * mass), friction 0.2, restitution 0.15, category `'object'`, damping 0.1
   * both ways. Body-level restitution/friction/category **win over**
   * collider-level, which is the reference's precedence (`Physics.js:187-216`). An
   * authored `mass` is spread across the colliders —
   * `setMass(mass / colliders.length)` on each, the reference's `Physics.js:182-185`.
   *
   * Two knowing deviations:
   *
   *   - **An unknown category throws.** The reference's does
   *     `setCollisionGroups(this.categories[x])` with `undefined` on a typo,
   *     which quietly turns collision filtering off for that collider. A typo
   *     in Blender should say so.
   *   - **A caller passing a `THREE.Vector3` position must own it.** The reference's
   *     `Area.js:46` computes `child.position.add(model.position)` — in
   *     place, mutating the child as a side effect of reading it. Nothing
   *     here mutates the description, but do not copy the shape of that line
   *     when writing a caller.
   */
  getPhysical(description) {
    const { RAPIER } = this;
    const xyz = (v) => (Array.isArray(v) ? { x: v[0], y: v[1], z: v[2] } : v);
    const xyzw = (q) => (Array.isArray(q) ? { x: q[0], y: q[1], z: q[2], w: q[3] } : q);

    const physical = {
      type: description.type ?? 'dynamic', // the reference's default when the word is absent
      linearDamping: description.linearDamping ?? 0.1,
      angularDamping: description.angularDamping ?? 0.1,
      colliders: [],
    };

    let bodyDesc;
    if (physical.type === 'dynamic') bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    else if (physical.type === 'fixed') bodyDesc = RAPIER.RigidBodyDesc.fixed();
    else if (physical.type === 'kinematicPositionBased') bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    else if (physical.type === 'kinematicVelocityBased') bodyDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased();
    else throw new Error(`physics: unknown body type "${physical.type}"`);

    if (description.position !== undefined) {
      const p = xyz(description.position);
      bodyDesc.setTranslation(p.x, p.y, p.z);
    }
    if (description.rotation !== undefined) bodyDesc.setRotation(xyzw(description.rotation));
    if (description.canSleep !== undefined) bodyDesc.setCanSleep(description.canSleep);
    if (description.sleeping !== undefined) bodyDesc.setSleeping(description.sleeping);
    if (description.enabled !== undefined) bodyDesc.setEnabled(description.enabled);
    // Per-body gravity, for the one thing that should fall slower than the
    // car: the football (`pitchPlan.BALL.gravityScale`).
    if (description.gravityScale !== undefined) bodyDesc.setGravityScale(description.gravityScale);
    bodyDesc.setLinearDamping(physical.linearDamping);
    bodyDesc.setAngularDamping(physical.angularDamping);

    physical.body = this.world.createRigidBody(bodyDesc);

    for (const collider of description.colliders) {
      let colliderDesc;
      if (collider.shape === 'cuboid') {
        colliderDesc = RAPIER.ColliderDesc.cuboid(...collider.parameters);
      } else if (collider.shape === 'ball') {
        colliderDesc = RAPIER.ColliderDesc.ball(...collider.parameters);
      } else if (collider.shape === 'cylinder') {
        colliderDesc = RAPIER.ColliderDesc.cylinder(...collider.parameters);
      } else if (collider.shape === 'trimesh') {
        const [positions, indices] = collider.parameters;
        // Rapier wants exactly Float32/Uint32; GLTFLoader may hand back
        // Uint16 indices, and a non-indexed mesh has none at all.
        const vertices = positions instanceof Float32Array ? positions : new Float32Array(positions);
        const tris = indices
          ? indices instanceof Uint32Array ? indices : new Uint32Array(indices)
          : new Uint32Array(vertices.length / 3).map((_, i) => i);
        colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, tris);
      } else if (collider.shape === 'hull') {
        const [positions] = collider.parameters;
        const vertices = positions instanceof Float32Array ? positions : new Float32Array(positions);
        colliderDesc = RAPIER.ColliderDesc.convexHull(vertices);
      } else {
        throw new Error(`physics: unknown collider shape "${collider.shape}"`);
      }

      if (collider.position) {
        const p = xyz(collider.position);
        colliderDesc.setTranslation(p.x, p.y, p.z);
      }
      if (collider.quaternion) colliderDesc.setRotation(xyzw(collider.quaternion));

      colliderDesc.setDensity(0.1);
      if (description.mass !== undefined) {
        colliderDesc.setMass(description.mass / description.colliders.length);
      }

      colliderDesc.setFriction(description.friction ?? collider.friction ?? 0.2);
      colliderDesc.setRestitution(description.restitution ?? collider.restitution ?? 0.15);

      const category = description.category ?? collider.category ?? 'object';
      const groups = this.categories[category];
      if (groups === undefined) {
        throw new Error(
          `physics: unknown category "${category}" — valid: ${Object.keys(this.categories).join(', ')}`
        );
      }
      colliderDesc.setCollisionGroups(groups);

      physical.colliders.push(this.world.createCollider(colliderDesc, physical.body));
    }

    // For the reset system, the day it exists — the reference's stores it in the factory,
    // so the caller cannot forget to.
    const translation = physical.body.translation();
    physical.initialState = {
      position: { x: translation.x, y: translation.y, z: translation.z },
      rotation: physical.body.rotation(),
      sleeping: physical.body.isSleeping(),
    };

    this.physicals.push(physical);
    return physical;
  }

  addVehicle(controller) {
    this.vehicles.push(controller);
    return controller;
  }

  /** @param {{savePose: () => void}} body */
  addInterpolated(body) {
    this.interpolated.push(body);
    return body;
  }

  step(delta) {
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= this.timestep && steps < this.maxSubSteps) {
      for (const vehicle of this.vehicles) vehicle.updateVehicle(this.vehicleDt);
      // Before the step, so that when the loop ends these hold the pose exactly
      // one substep behind the live one — which is what `alpha` interpolates
      // from. Saving after would store the pose we are already drawing.
      for (const body of this.interpolated) body.savePose();
      this.world.step();
      this.accumulator -= this.timestep;
      steps++;
    }

    // If we hit the substep ceiling we are behind and will never catch up.
    // Drop the backlog rather than spiralling into an ever-longer frame.
    if (steps === this.maxSubSteps) this.accumulator = 0;

    // Whatever time is left over is how far into the *next* step the renderer
    // is standing. On a frame where no substep ran this still advances, which is
    // the whole point: the visual keeps moving between physics poses.
    this.alpha = Math.min(1, this.accumulator / this.timestep);
  }

  dispose() {
    this.world.free();
  }
}
