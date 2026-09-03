import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, COLOR } from '../render/palette.js';

/**
 * A raycast vehicle on Rapier's built-in controller.
 *
 * The tuning is the reference's, and it is now the reference's *values* and not just the reference's shape: the
 * world simulates 1/30 s per 1/60 s of wall clock (`world/Physics.js`,
 * decision 18), which is the ratio every one of these numbers was tuned
 * against, so `C` §5.2 transfers with no dimensional conversion at all.
 *
 * **Everything below is in physics units — simulated seconds.** A speed of 5
 * reads as 10 m/s on screen. Do not compare these to wall-clock intuition, and
 * do not convert a new one by eye: check which delta the reference's multiplies it by first
 * (`C` §5.1a). Rate constants the reference author multiplies by `deltaScaled` are **×2** when
 * ported to a plain delta, not ÷2, and the two rates in `syncVisual` below are
 * the only ones of that class in this file.
 *
 * The choices that separate "a box sliding around" from "a car":
 *
 *   - centre of mass at the very floor of the chassis, so it leans into corners
 *     instead of tipping over
 *   - modest longitudinal grip (0.9) against strong lateral grip (3) — power is
 *     traction-limited so there is no snap, and the car goes where it points.
 *     This is the arcade recipe, and it is why the reference's is playable on a keyboard
 *   - a long suspension ray from the body centre: the chassis floats ~0.8 clear
 *     and only the rays touch the ground, so it glides over rough terrain
 *     instead of catching on it
 *   - compression damping near critical, relaxation at a quarter of it: absorb
 *     the hit, rebound fast
 *   - engine force divided by (1 + overspeed in raw m/s) — a soft top speed that
 *     bites within a metre per second of the knee and actually holds
 *   - a small permanent idle brake, so releasing the throttle settles the car
 *   - reverse doubles as the brake while you are still moving forward
 *
 * **One of the reference's that we deliberately do not have.** The go-kart proportions
 * (`C` §5.2 row 17) are bundled with the Phase 3 visual rework by decision 19,
 * so geometry and handling are never changed in the same sitting.
 *
 * **The oversized mass-0 bumper landed 2 Sep** — the day this header always
 * said it would ("It lands with dynamic props"): the name letters and the
 * contact icons are dynamic now, and the letters proved the premise the hard
 * way — at the reference's letter mass 2 our bumperless car wedged against them
 * (Michael: "the car sometimes gets stuck"), which is why they shipped at
 * 0.5 as a stopgap. The reference's numbers (`PhysicsVehicle.js:96-98`): main box
 * [1.3, 0.4, 0.85] at mass 2.5, bumper [1.5, 0.5, 0.9] at **mass 0**, shifted
 * 0.1 forward and 0.1 down — bigger than the chassis in every dimension, so
 * every prop contact happens on a surface that carries no inertia: the car
 * shoves before its body ever touches, and nothing it hits changes how it
 * drives. Ours keeps the reference's deltas in our opposite-handed frame (length is z
 * here, x there), and mass 0 is free in our setup — every collider is
 * density-0 with the whole mass on `setAdditionalMassProperties`, so the
 * bumper is collision surface and nothing else. The letters are back at the reference's
 * mass 2 (`LandingArea.LETTER`).
 */

export const HALF = { x: 0.85, y: 0.38, z: 1.55 };
export const WHEEL = { radius: 0.42, width: 0.32, restLength: 0.88, connectionY: 0 };

/**
 * The visual chassis box — **not the same object as `HALF`, and the difference
 * is the exact trap this project has already fallen into once.**
 *
 * `HALF` is the *collider*: 1.70 x 0.76 x 3.10. `BODY` is what you *see*:
 * 1.70 x 0.62 x 3.10. They share width and length and differ in height. A
 * session on 19 Aug compared our visual model to the reference's collider, reported the car
 * 19 % oversized, and built a recommendation on it; the reference's visual chassis measured
 * in its own frame is the same length as ours within 4 %. Compare visual to
 * visual and collider to collider, and say which one a number is.
 *
 * Anything sized against the car in Blender is being sized against `BODY`.
 */
export const BODY = Object.freeze({ width: 1.7, height: 0.62, length: 3.1 });

/**
 * Every box the visual chassis is made of, in body-local space.
 *
 * Extracted from `_buildVisual`'s literals so that
 * `tools/build-scale-reference.mjs` can emit the **real silhouette** rather than
 * just `BODY`. It matters more than it sounds: the body box is 1.70 x 3.10, but
 * the spoiler runs to z 1.80 and the wheels to x +/-0.98, so the car you have to
 * fit through a gap is **1.96 wide and 3.35 long** — 15 % wider and 8 % longer
 * than the figure the roadmap quotes. A doorway modelled against 1.70 clips the
 * wheels on both sides.
 */
export const CHASSIS_PARTS = Object.freeze([
  { name: 'body', size: [BODY.width, BODY.height, BODY.length], at: [0, 0, 0] },
  { name: 'cabin', size: [1.45, 0.6, 1.35], at: [0, 0.58, -0.15] },
  { name: 'spoiler', size: [1.5, 0.16, 0.5], at: [0, 0.18, 1.55] },
  { name: 'lamp-right', size: [0.34, 0.16, 0.12], at: [0.55, 0.16, 1.6] },
  { name: 'lamp-left', size: [0.34, 0.16, 0.12], at: [-0.55, 0.16, 1.6] },
]);

/** Where the four suspension rays attach, body-local. */
export const WHEEL_MOUNTS = Object.freeze([
  [0.82, 1.12], [-0.82, 1.12], [0.82, -1.12], [-0.82, -1.12],
]);

/**
 * Chassis centre above flat ground at rest, **measured, not declared**.
 *
 * It is not derivable from the constants above: at full suspension extension
 * the body would float `WHEEL.restLength + WHEEL.radius` = 1.30 clear, and the
 * remaining 0.165 is the spring compressing under the car's own weight. The
 * equilibrium is a property of the running physics, so this is a recorded
 * measurement with a provenance, and `tools/build-scale-reference.mjs` checks it
 * against the live car rather than trusting it.
 *
 * Underside of the visual body therefore sits at 1.135 - 0.62/2 = **0.825**,
 * which is the number that decides whether the car can drive over a kerb.
 */
export const REST_HEIGHT = 1.135;

/**
 * The visual wheel can never rise above the chassis underside, whatever the
 * suspension ray reports (`C` §5.3). The reference's clamp is −0.5, which is the reference's chassis
 * collider's bottom face; ours is derived the same way rather than copied.
 */
const WHEEL_Y_CLAMP = -HALF.y;

const ENGINE_FORCE = 10;  // per wheel. The reference's 300 × deltaScaled = 10 N at 60 fps
const CRUISE_SPEED = 5;   // physics m/s before the soft limiter starts biting

/**
 * Boost and jump — HIS, read out of `PhysicsVehicle.js` after the first
 * home-grown version shipped conservative and Michael sent us back to the
 * source ("the reference's boost seems to have effects on the screen as well as behind
 * the car, also its really fast, also check the jump too"):
 *
 * **Boost** (`PhysicsVehicle.js:16-18,460-462`): `topSpeed` lerps 5 → 40 —
 * EIGHT times cruise, not our timid 1.6 — and engine force multiplies by
 * `(1 + boosting × 2)` = 3×. The two effects that sell it live elsewhere:
 * the screen's speed lines (`View.js`) and the twin ribbon trails behind
 * the chassis (`render/Trails.js`), both wired in `Game`.
 *
 * **Jump** (`PhysicsVehicle.js:31-40,495-496`): not an impulse — a
 * SUSPENSION POP. Space snaps every wheel's rest length from `low` to
 * `high` and doubles the spring stiffness, and the springs themselves
 * launch the car; release drops it back. Our shipped rest length 0.88 IS
 * the reference's `low` exactly, the reference's `high` is 1.63, and the reference's stiffness doubles
 * (20 → 40; ours 26 → 52, the same ratio on our tuned spring). The reference's full
 * per-corner lowrider numpad is left behind — one verb is the ask — but
 * the mechanism is the reference's, which also means the reference's feel: hold to ride tall,
 * tap to hop, tap in rhythm to bounce.
 */
const BOOST = Object.freeze({ topSpeed: 40, forceMultiplier: 2 });
const SUSPENSION = Object.freeze({
  low: { rest: WHEEL.restLength, stiffness: 26 },
  high: { rest: 1.63, stiffness: 52 },
});

/**
 * Water — **drivable treacle, and nothing else. Decision 43 is reversed.**
 *
 * The reference's water has no way out of it and no way to lose to it: below y = 0 the reference author sets
 * linear *and* angular damping to 1 and the top speed clamps to 5.45, exactly
 * half the reference's land top speed, and it stays there for as long as you care to drive.
 * Measured on the reference's running build: full throttle from the beach runs five hundred
 * units out to sea at a constant 5.45, all four wheels on the bedrock, with no
 * respawn and no fall. There is no depth threshold anywhere in the reference's build.
 *
 * **Decision 43 added a drowning line on top of that, and it is gone as of
 * 20 August.** Michael: *"I do like that he could drive 'forever' on the deep
 * waters too… if we do that it could fix the issue of accidentally drowning in
 * the rivers?"* It does, and the reason it does is worth writing down, because
 * it is the fact the whole design rested on and nobody had stated it:
 *
 * **There is no deep water. Anywhere. In either build.** `WATER_SURFACE` is
 * −0.3 and `WATER_FLOOR` is −1.5, and the reference's decoded heightfield runs `y −1.500 ..
 * 0.000` and never lower. The entire ocean is **1.2 units deep**, forever, over
 * a floor that is either the height field or the follower bedrock. The car's
 * ride height is 1.135. Driving out to sea is wading, not swimming — the open
 * water reads deep because of the fog and the water shader, not because it is.
 *
 * So drowning was never a physical consequence, it was a scripted fade and
 * respawn triggered on a depth the car cannot actually sink into. That was a
 * defensible rule for an island ringed by sea. It stops being defensible the
 * moment water is carved *through* the island (`KNOWN-ISSUES.md` 18), because
 * then the same rule kills you in the middle of the world for driving down a
 * river bank — and it would have put a hard 1.0 depth cap on the carving, well
 * inside the reference's measured river depths, which reach 1.2.
 *
 * What survives is the half that was always the reference's: the drag ramp below. Water
 * still holds you and still halves your speed. It simply never takes the car
 * away from you. Recovery is the **stuck detector** plus the manual respawn,
 * which is exactly the reference's set (`Player.setUnstuck`).
 */
const WATER = {
  /**
   * Depth at which the drag reaches full. Was `shelfDepth` — the drowning line
   * — and it is now only the top of the ramp, because nothing drowns.
   */
  fullDragDepth: 1.0,
  /**
   * Depth at which the drag starts at all. Added 19 Aug with the wider shelf:
   * ramping from zero meant the very first splash already cost most of the top
   * speed, so "more shallow water" would have bought more water you cannot
   * move in. 0.25 is a little under wheel radius, so you cross the waterline
   * and keep going, and the water only starts to hold you once it is properly
   * over the wheels — about two units in.
   */
  dragStartDepth: 0.25,
  /** Linear damping at full depth, against 0.1 on dry land. The reference's is 1. */
  maxLinearDamping: 1.0,
  /** Angular damping likewise. The reference's goes to 1 as well. */
  maxAngularDamping: 1.0,
  /**
   * Fraction of the soft speed knee left at full depth. 0.45 against the reference's exact
   * half, which is the one water number that was ours and stays ours.
   */
  minCruiseFactor: 0.45,
};

/** The reference's `PhysicsVehicle.stuck`: 3 seconds of travel, 0.5 units of it. */
const STUCK = { duration: 3, distance: 0.5 };

const LINEAR_DAMPING = 0.1;   // the reference's, and the only thing that sets a top speed
const ANGULAR_DAMPING = 0.1;  // the reference's: yaw stability comes from side friction
/**
 * Brake face values, the reference's. They are scaled per *step* in the constructor -- see
 * `brakeScale` -- because Rapier's two vehicle inputs are not the same kind of
 * quantity, and that is a trap worth stating plainly:
 *
 *   `setWheelEngineForce` is a force and is integrated over the substep dt.
 *   `setWheelBrake`       is a per-step impulse and ignores dt entirely.
 *
 * So halving the substep leaves top speed untouched but *doubles* braking.
 * Measured when the substep went 1/60 -> 1/120 with these left as raw constants:
 * deceleration 23.2 -> 39.2, stopping distance cut nearly in half, and the nose
 * pitched **8.6 deg -> 69.5 deg** with the wheels off the ground for 178 frames.
 * The car reared up under braking. See `KNOWN-ISSUES.md` 16.
 *
 * `HANDBRAKE` was already written as "the reference's 1.0 x brakeAmplitude 35 x deltaScaled",
 * i.e. already per-step; `IDLE_BRAKE` and `REVERSE_AS_BRAKE` were never scaled at
 * all and so ran ~14 % weaker than the reference's. Deriving all three from the live timestep
 * fixes both and makes a future substep change safe.
 */
const BRAKE_AMPLITUDE = 35;   // the reference's brakeAmplitude
const IDLE_BRAKE = 0.06;      // the reference's idleBrake
const REVERSE_AS_BRAKE = 0.4; // the reference's reverseBrake
const HANDBRAKE = 1.0;        // the reference's handbrake
const STEER_MAX = 0.5;    // rad, flat. 28.6° of lock at any speed

/** Wall-clock rates, so these are the reference's face values doubled (`C` §5.1a class B). */
const VISUAL_STEER_RATE = 32; // the reference's 16 × deltaScaled
const VISUAL_WHEEL_RATE = 50; // the reference's 25 × deltaScaled

/**
 * What counts as a landing worth shaking the camera for, in physics m/s of
 * downward velocity at the moment the wheels regain the ground. Under a
 * simulated −9.81 that is a drop of roughly 0.8 m to register at all and 4 m to
 * saturate, so kerbs and ordinary terrain are silent.
 */
const LANDING_THRESHOLD = 4;
const LANDING_RANGE = 5;

// Scratch objects: control() runs every frame and must not allocate.
const _quat = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _upAxis = new THREE.Vector3();
const _sideAxis = new THREE.Vector3();
const _torque = new THREE.Vector3();

/**
 * The auto-flip — the reference's `upsideDown` + `flip.jump`, ported on Michael's ask
 * ("can we add something that auto flips like a little hop back onto the reference's
 * feet"). The reference's detection (`PhysicsVehicle.js:232-259`): the chassis-up
 * vector dotted against straight DOWN, remapped to 0..1 — a ratio past 0.3
 * covers fully inverted AND resting on the side. The reference's trigger
 * (`Player.js:345-393`): wait three seconds in case the driver saves
 * themselves or physics settles it, then hop — an upward impulse of
 * `force 5 × mass` plus a torque impulse chosen by which local axis points
 * up — and re-arm, so a failed flip tries again three seconds later.
 *
 * The reference's torque cases translate across vehicle frames (the reference's forward is +X with
 * the axle on +Z; ours is +Z with the axle on +X): the reference's roll about the
 * forward axis is our local-Z torque, the reference's pitch about the axle is our
 * local-X. The torque scale rides `FLIP.torqueBoost` because the reference's inertia
 * tensor is not ours — measured, not assumed, on the running build.
 */
const FLIP = Object.freeze({
  ratioThreshold: 0.3, // the reference's upsideDown.threshold
  /**
   * NOT the reference's 3 s. The reference's grace exists so a driver can save themselves; on the
   * live site the wait read as a stall (Michael, 3 Sep: "i want the car to
   * flip back on his feet faster"). 1.5 s (his second note, the same night:
   * "make the grace before hop 1.5 seconds") is long enough for a roll that
   * is still settling to finish on its own — a nose-over lands on its wheels
   * inside a second — and short enough that a real flip never feels ignored.
   */
  waitSeconds: 1.5,
  retrySeconds: 0.8, // follow-up hops come sooner still — a half-finished flip retries before it reads as stuck
  force: 5, // the reference's flip.force, × mass
  /**
   * NOT the reference's 0.8. Against our inertia (principal 1), 0.8 × mass gives
   * Δω = 2 rad/s — a half roll needs π in the ~1.2 s of hop air, so the
   * fully-inverted car flopped onto its side and waited for a second hop
   * (Michael: "it only auto flips to its side not fully back"). 1.6 turns
   * the full π with margin in one hop; the side case keeps the reference's 0.8/0.4
   * mix, which only ever needs a quarter roll.
   */
  invertedTorque: 1.6,
  torqueBoost: 1, // multiplies the side case's 0.8/0.4 factors
  /**
   * Extra hop and torque at full depth, against the water's damping
   * (`WATER.maxLinearDamping` / `maxAngularDamping` both 1.0/s). Michael, 3
   * Sep, on the live site: "the car isn't able to flip back to its feet in
   * deep water" — at damping 1.0 the inverted torque's 4 rad/s decays to
   * ~2.8 rad of roll inside the hop's air time, short of the π it needs,
   * so the car flopped back onto its roof every retry. Scaled by wetness so
   * dry land keeps the measured numbers. **A third, not more**: the first
   * cut (×2.4 torque, ×1.6 hop) threw the car 2.5 units clear of the sea
   * and rolled it a full turn back onto its roof — measured passing
   * through upright twice and landing inverted every time. The damping
   * only eats ~30 % of the roll, so ~35 % more torque restores the π.
   */
  wetTorqueBoost: 0.35,
  wetForceBoost: 0.2,
});

export default class Car {
  /**
   * @param {{ physics: import('./Physics.js').default,
   *           material: import('three').Material,
   *           visual?: { body: import('three').Object3D, wheel: import('three').Object3D }|null,
   *           position?: number[] }} options
   *   `visual` is the found-asset rig from `models/carBuggy.glb` (decision
   *   47): `body` in body-local space, `wheel` centred on its own axle,
   *   both already carrying registry materials. Scaled by the prep recipe so
   *   the wheel radius and wheelbase match `WHEEL` and `WHEEL_MOUNTS`
   *   exactly — nothing in the physics moved to accommodate it. When null,
   *   the generated box car below still builds (the scale-reference tool and
   *   headless checks construct cars with no loader in front of them).
   */
  constructor({ physics, material, visual = null, position = [0, 4, 0] }) {
    this.physics = physics;
    this.steer = 0;
    this.speed = 0;

    /** How deep the water is over the ground under the car. Negative on land. */
    this.waterDepth = -1;
    /** 0 on dry land → 1 at full depth. Scales drag and the speed knee. */
    this.wetness = 0;

    const { RAPIER, world } = physics;

    /**
     * The reference's brake values are per-step, so they must be scaled by the step we
     * actually run. The reference author multiplies by `deltaScaled` (the reference's 1/30); we multiply by
     * `world.timestep` (ours, 1/60). Derived rather than hard-coded so that
     * changing the substep can never silently change braking again.
     *
     * This lands us on the reference's braking exactly: the reference's 0.4 x 35 x 1/30 = 0.467 per step
     * at 60 steps/s = 28 impulse/s; ours 0.4 x 35 x 1/60 = 0.233 at 120 steps/s
     * = the same 28.
     */
    this.brakeScale = BRAKE_AMPLITUDE * world.timestep;

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position[0], position[1], position[2])
        .setAdditionalMassProperties(
          2.5,
          { x: 0, y: -0.5, z: 0 }, // the whole trick
          // Isotropic, as the reference's is. Ours was 1.7 in yaw on top of 7× the reference's angular
          // damping, which between them made the car refuse to rotate.
          { x: 1, y: 1, z: 1 },
          { x: 0, y: 0, z: 0, w: 1 }
        )
        // The reference's, and **not** in the `C` §5.2 table — which lists the reference's angular
        // damping and omits the reference's linear (`C` §2.2 records it: 0.1, the Rapier
        // factory default the reference author never overrides). It is not a cosmetic omission.
        // The soft limiter only *softens* the engine force, it never removes
        // it, so nothing but drag actually sets a top speed. Measured on flat
        // ground with the props removed, full throttle to terminal:
        //
        //   linear damping 0.04 (ours) → 15.4 physics m/s, still climbing at 20 s
        //   linear damping 0.10 (the reference's)  → 11.0 physics m/s, settled by 5 s
        //
        // 11 physics m/s is 22 apparent, and lifting off drops it to 4 within a
        // second instead of coasting on at 9. That difference is most of what
        // "deliberate rather than floaty" means here.
        .setLinearDamping(LINEAR_DAMPING)
        // The reference author gets yaw stability from side friction, not from damping.
        .setAngularDamping(ANGULAR_DAMPING)
        .setCcdEnabled(true)
        // `setWheelEngineForce` does not wake a sleeping body, so without this
        // a car left idling becomes unresponsive.
        .setCanSleep(false)
    );

    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z)
        .setDensity(0)
        // Low friction stops the chassis catching on walls; a little
        // restitution makes wall contact read as a bump rather than a stick.
        .setFriction(0.4)
        .setRestitution(0.15),
      this.body
    );

    /**
     * The reference's oversized mass-0 bumper (see the header): the reference's main-box deltas
     * (+0.05 width, +0.12 height, +0.2 length, +0.1 forward, −0.1 down)
     * applied to `HALF` in our frame. Density 0 like everything on this body,
     * so it adds contact surface and not a gram — the suspension rays ignore
     * it (Rapier's controller excludes the chassis' own colliders), and at
     * rest its underside sits 0.53 above flat ground, well clear of the
     * 1.5-unit collision grid's worst step.
     */
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF.x + 0.05, HALF.y + 0.12, HALF.z + 0.2)
        .setTranslation(0, -0.1, 0.1)
        .setDensity(0)
        /**
         * Nearly frictionless, and this is measured, not styled: at the
         * chassis' 0.4 the first plow test high-centered — a toppled letter
         * slid under the bumper (its underside rides at 0.48, a fallen
         * letter's top at 0.75), the rear wheels hung, and the bumper's grip
         * on the letter pinned an all-wheel-drive car at full throttle. A
         * bumper is a shoving surface, not a tire: slick, the fronts drag
         * the car straight off whatever ends up beneath it.
         */
        .setFriction(0.05)
        .setRestitution(0.15),
      this.body
    );

    this.vehicle = physics.addVehicle(world.createVehicleController(this.body));

    /**
     * The pose one physics substep behind the live one, and the render-time
     * `alpha` that sits between them. See `Physics.step` — without this the car
     * is drawn on the physics clock rather than the display's, and on a monitor
     * whose rate is not a multiple of 120 nearly one frame in five repeats.
     */
    this.physics = physics;
    this._prev = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
    this._hasPrev = false;
    physics.addInterpolated(this);
    // Rapier 0.20 exposes indexUpAxis as a getter/setter pair but
    // indexForwardAxis as a getter only — the forward axis is fixed at +Z,
    // which is what we model anyway.
    this.vehicle.indexUpAxis = 1;

    // front-left, front-right, rear-left, rear-right. The connection point sits
    // at the chassis centre height, as the reference's does: a long ray from the body centre
    // is what lets a raycast vehicle glide over rough ground.
    this.wheelConnections = WHEEL_MOUNTS.map(([x, z]) => ({
      x,
      y: WHEEL.connectionY,
      z,
    }));

    for (const connection of this.wheelConnections) {
      this.vehicle.addWheel(
        connection,
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        WHEEL.restLength,
        WHEEL.radius
      );
    }

    for (let i = 0; i < 4; i++) {
      // Not in `C` §5.2 and so deliberately unchanged. The reference's live value is 20 —
      // the 25 in the reference's `wheels.settings` is dead, never applied, and the real
      // number is written every frame from the hydraulic-suspension state
      // (`PhysicsVehicle.js:496`, `C` §2.4). Critical damping is 2√k, so at 26
      // the reference's compression of 10 still lands within 2 % of critical.
      this.vehicle.setWheelSuspensionStiffness(i, 26);
      // Compression ≈ critical, relaxation ≈ a quarter of it. We were at 8–9 %
      // of critical in both directions, i.e. essentially undamped: the car
      // pogoed, wallowed and never settled.
      this.vehicle.setWheelSuspensionCompression(i, 10);
      this.vehicle.setWheelSuspensionRelaxation(i, 2.7);
      // Ours clamped travel below the rest length itself, so any curb bottomed
      // the ray out and the chassis ate the impact directly. The reference's never saturates.
      this.vehicle.setWheelMaxSuspensionTravel(i, 2);
      // 6.1× the car's weight: invisible in normal ride, decisive on landings.
      // 14000 N on a 24.5 N car was 571× its weight and never clamped anything.
      this.vehicle.setWheelMaxSuspensionForce(i, 150);
      // We had these two almost exactly inverted — 2.7× the reference's forward grip and
      // 0.31× the reference's lateral grip, which is the recipe for a car that hooks up
      // violently and then slides out sideways.
      this.vehicle.setWheelFrictionSlip(i, 0.9);
      this.vehicle.setWheelSideFrictionStiffness(i, 3);
    }

    this.object = this._buildVisual(material, visual);

    /**
     * Where the boost trails emit: the reference's twin anchors at the chassis' rear
     * corners (`VisualVehicle.js:378-390`, translated into our +Z-forward
     * frame — the reference's rear is −X at ±0.55 across, height 0.1). Children of the
     * visual so they ride the interpolated pose, not the raw body.
     */
    this.trailAnchors = [-0.55, 0.55].map((x) => {
      const anchor = new THREE.Object3D();
      anchor.position.set(x, 0.1, -1.28);
      this.object.add(anchor);
      return anchor;
    });
    /** Written by `control()`, read by the effects. */
    this.boosting = false;
    this.accelerating = 0;

    /** When the car went belly-up, for the auto-flip's grace period. */
    this._flipDownSince = null;

    // Stuck detection: a 3 second rolling window of travelled distance. With
    // drowning gone this is the only automatic safeguard left, which is also
    // true of the reference's build.
    this._history = [];
    this._lastStuckSample = null;
    this.stuck = false;

    // Landing detection, for the camera's roll shake.
    this._wheelsInContact = 4;
    this._previousVerticalVelocity = 0;
    this._impact = 0;
  }

  _buildVisual(material, visual = null) {
    const root = new THREE.Group();
    root.name = 'car';

    let wheelSource = null;
    if (visual) {
      visual.body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      root.add(visual.body);
      wheelSource = visual.wheel;
    } else {
      const parts = [];
      const add = (geometry, colorIndex, x, y, z) => {
        paint(geometry, colorIndex);
        geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
        parts.push(geometry);
      };

      const PART_COLORS = {
        body: COLOR.accentWarm,
        cabin: COLOR.buildingLight,
        spoiler: COLOR.black,
        'lamp-right': COLOR.amber,
        'lamp-left': COLOR.amber,
      };
      for (const part of CHASSIS_PARTS) {
        add(new THREE.BoxGeometry(...part.size), PART_COLORS[part.name], ...part.at);
      }

      const chassis = new THREE.Mesh(mergeGeometries(parts, false), material);
      for (const g of parts) g.dispose();
      chassis.castShadow = true;
      root.add(chassis);
    }

    const wheelGeometry = wheelSource ? null : new THREE.CylinderGeometry(
      WHEEL.radius,
      WHEEL.radius,
      WHEEL.width,
      14
    );
    if (wheelGeometry) {
      wheelGeometry.rotateZ(Math.PI / 2); // axis along X
      paint(wheelGeometry, COLOR.black);
    }

    this.wheelRoots = [];
    this.wheelSpins = [];
    this.wheelPoles = [];

    for (let i = 0; i < 4; i++) {
      const steerPivot = new THREE.Group();
      const spinPivot = new THREE.Group();
      /**
       * The found wheel is cloned per corner and the right-hand pair (−X;
       * see the steering note in `control()`) is turned 180° so the rim
       * detail faces outward on both sides. The spin still happens on the
       * pivot's own X axis, which the half-turn leaves in place.
       */
      const mesh = wheelSource
        ? wheelSource.clone(true)
        : new THREE.Mesh(wheelGeometry, material);
      if (wheelSource && this.wheelConnections[i].x < 0) mesh.rotation.y = Math.PI;
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });

      // Start at full extension. `syncVisual` filters towards the real
      // suspension length, so without this the wheels ease down from the
      // chassis centre over the first few frames.
      const connection = this.wheelConnections[i];
      steerPivot.position.set(connection.x, connection.y - WHEEL.restLength, connection.z);

      spinPivot.add(mesh);
      steerPivot.add(spinPivot);
      root.add(steerPivot);

      /**
       * The suspension pole — the reference's `wheelSuspension` mesh, generated: the reference's
       * wheel containers carry a Blender-authored strut whose `scale.y`
       * stretches to span chassis-underside-to-hub
       * (`VisualVehicle.js:460-464`), which is what makes the reference's lowrider
       * stance read as hydraulics instead of a floating body. Our buggy
       * rig has no such part, so each corner gets a thin dark strut from
       * the hub upward; `syncVisual` scales it to the live gap. At rest
       * it is a stubby 0.5 like the reference's; on stilts it is the visible leg.
       */
      const poleGeometry = new THREE.BoxGeometry(0.13, 1, 0.13);
      poleGeometry.translate(0, 0.5, 0);
      paint(poleGeometry, COLOR.rockDark);
      const pole = new THREE.Mesh(poleGeometry, material);
      pole.castShadow = true;
      steerPivot.add(pole);
      this.wheelPoles.push(pole);

      this.wheelRoots.push(steerPivot);
      this.wheelSpins.push(spinPivot);
    }

    return root;
  }

  /**
   * Signed speed along the chassis' own forward axis.
   *
   * Deliberately not `vehicle.currentVehicleSpeed()`: measured against this
   * chassis it comes back negative while the car is driving forwards, so the
   * brake-versus-reverse logic below would fight the throttle. Projecting the
   * linear velocity onto the forward vector has no convention to get wrong.
   */
  _forwardSpeed() {
    const q = this.body.rotation();
    const v = this.body.linvel();
    _quat.set(q.x, q.y, q.z, q.w);
    _forward.set(0, 0, 1).applyQuaternion(_quat);
    return v.x * _forward.x + v.y * _forward.y + v.z * _forward.z;
  }

  /**
   * The chassis' yaw in the ground plane as `atan2(forward.z, forward.x)` —
   * the reference's `Player.rotationY`, read by the touch stick, whose
   * bearings use the same convention (`core/stickMath.js`).
   */
  headingXZ() {
    const q = this.body.rotation();
    _quat.set(q.x, q.y, q.z, q.w);
    _forward.set(0, 0, 1).applyQuaternion(_quat);
    return Math.atan2(_forward.z, _forward.x);
  }

  control(input) {
    this.speed = this._forwardSpeed();

    // Flat steering, fed to the physics as a hard step.
    //
    // The reference author has no speed falloff anywhere and no rate limit in the physics at all
    // (`C` §3.3, §13.8). Ours had both: a 0.55 → 0.17 falloff, and a 7/s ramp
    // that cost ≈0.14 s to reach lock, which is real and felt input lag. The
    // falloff was compensating for side friction that was 0.31× the reference's — with that
    // fixed, this is what stops the car feeling wet.
    //
    // Applied last of the whole patch on purpose: removing the falloff before
    // the grip values land makes the car spin (`C` §5.2 rows 13, 14).
    //
    // **Negated, and the sign is not arbitrary.** `input.steer` is in human
    // terms — positive means the driver asked to go right — and this is the one
    // place that converts it into the vehicle's own frame, because this is where
    // the frame lives. Our forward axis is **+Z** (Rapier 0.20 fixes it there;
    // see `_buildVehicle`), so the car's right-hand side is −X, and a *positive*
    // steering angle rotates the front wheels from +Z toward +X — the car's
    // left. The reference's forward axis is +X with the axle on +Z, so the same positive
    // angle turns the reference's car left too, which is why the reference author maps `left → +1`
    // (`Player.js:561-563`). Same convention, different axis, and we had it
    // backwards: right steered left.
    //
    // Measured on the running build rather than reasoned about, because the
    // first reading of it was wrong. Two seconds of full lock had already spun
    // the car 143° and the final heading no longer said which way it went. Over
    // a short arc from rest: right gave yaw +66.6° with the path curving to +X,
    // left gave −69.9° curving to −X — both the wrong way round.
    this.steer = -input.steer * STEER_MAX;

    this.vehicle.setWheelSteering(0, this.steer);
    this.vehicle.setWheelSteering(1, this.steer);

    // Soft speed limit, keyed on the *velocity magnitude* rather than the
    // forward projection, so drifting sideways throttles the engine as it does
    // for the reference author. The projection above stays for the brake/reverse test, which is
    // the one place the sign matters.
    //
    // Linear in raw overspeed, not normalised and squared: one metre per second
    // past the knee already halves the force, so the top speed actually holds.
    // Ours normalised by an 18 m/s cruise and squared, which barely limited at
    // all until far past it.
    const v = this.body.linvel();
    const speedMagnitude = Math.hypot(v.x, v.y, v.z);
    // The knee comes down in water, which is what makes the shelf feel like
    // wading rather than like driving with the handbrake on: the car still
    // pulls, it just cannot get anywhere.
    const boosting = input.actions.boost ? 1 : 0;
    // The reference's `lerp(topSpeed, topSpeedBoost, boosting)`, times our water shelf.
    const knee =
      (CRUISE_SPEED + (BOOST.topSpeed - CRUISE_SPEED) * boosting) *
      (1 - (1 - WATER.minCruiseFactor) * this.wetness);
    const overflow = Math.max(0, speedMagnitude - knee);
    // The reference's `(1 + boosting * boostMultiplier)` — 3× force under boost.
    const force = (ENGINE_FORCE * (1 + boosting * BOOST.forceMultiplier)) / (1 + overflow);
    /** Read by the view's speed lines and the boost trails. */
    this.boosting = boosting === 1;

    // `drive` is ±1 from a key and anything in between from the touch stick
    // (the reference's `accelerating = progress³`, `Player.js:583`), so the
    // force scales by it: a thumb resting near the car creeps, a thumb at
    // the ring's edge is the key.
    const drive = input.drive;
    let engine = 0;
    let brake = IDLE_BRAKE * this.brakeScale;

    if (drive > 0) {
      if (this.speed < -0.6) {
        // Rolling backwards and asking to go forward: brake first.
        engine = 0;
        brake = REVERSE_AS_BRAKE * this.brakeScale;
      } else {
        engine = force * drive;
        brake = 0;
      }
    } else if (drive < 0) {
      if (this.speed > 0.6) {
        engine = 0;
        brake = REVERSE_AS_BRAKE * this.brakeScale;
      } else {
        // The same force curve negated, with no reverse penalty. Our 0.55 made
        // backing out of a wedge frustrating — the exact moment the player most
        // needs authority.
        engine = force * drive;
        brake = 0;
      }
    }

    if (input.actions.handbrake) {
      engine = 0;
      brake = HANDBRAKE * this.brakeScale;
    }

    /**
     * The suspension pop (see SUSPENSION above): the springs do the jump.
     * (A latch that held the tall stance through a tapped jump's flight
     * lived here for one drive — Michael: "it now feels weird" — the
     * stance follows the key and nothing else.)
     */
    const stance = input.actions.jump ? SUSPENSION.high : SUSPENSION.low;
    /** The live rest length, for the visual wheels' airborne fallback. */
    this._restLength = stance.rest;
    /** Read by the throttle-gated effects. */
    this.accelerating = drive;

    for (let i = 0; i < 4; i++) {
      this.vehicle.setWheelEngineForce(i, engine);
      this.vehicle.setWheelBrake(i, brake);
      this.vehicle.setWheelSuspensionRestLength(i, stance.rest);
      this.vehicle.setWheelSuspensionStiffness(i, stance.stiffness);
    }
  }

  /**
   * The visual car, from the physical one.
   *
   * The wheel height is filtered rather than copied. With the suspension ray now
   * 0.88 long from the body centre, a compressing spring reported raw would
   * strobe, and a fully compressed one would put the wheel above the chassis
   * roof — so the target is clamped to the chassis underside first and then
   * eased at 50/s (`C` §5.3). 50 and not 25: the reference's rate multiplies an already
   * doubled delta, and this one multiplies a plain one.
   *
   * The steering angle is smoothed here too, and *only* here. The physics gets
   * the raw step; this is the mesh catching up, which is the whole of the reference's
   * steering feel (`VisualVehicle.js:427`).
   */
  /** Called by `Physics.step` immediately before each `world.step()`. */
  savePose() {
    const t = this.body.translation();
    const r = this.body.rotation();
    this._prev.x = t.x; this._prev.y = t.y; this._prev.z = t.z;
    this._prev.qx = r.x; this._prev.qy = r.y; this._prev.qz = r.z; this._prev.qw = r.w;
    this._hasPrev = true;
  }

  syncVisual(delta) {
    this._updateContacts();

    const t = this.body.translation();
    const r = this.body.rotation();

    if (this._hasPrev) {
      // Draw where the car is *now*, not where the last physics substep left it.
      const a = this.physics.alpha;
      const p = this._prev;
      this.object.position.set(
        p.x + (t.x - p.x) * a,
        p.y + (t.y - p.y) * a,
        p.z + (t.z - p.z) * a
      );
      // Shortest-arc nlerp. A full slerp is not worth it here: consecutive
      // physics substeps are 1/120 apart, so the two quaternions are never more
      // than a fraction of a degree apart and nlerp's error is far below what a
      // 25-degree lens can show.
      let dot = p.qx * r.x + p.qy * r.y + p.qz * r.z + p.qw * r.w;
      const sign = dot < 0 ? -1 : 1;
      const qx = p.qx + (r.x * sign - p.qx) * a;
      const qy = p.qy + (r.y * sign - p.qy) * a;
      const qz = p.qz + (r.z * sign - p.qz) * a;
      const qw = p.qw + (r.w * sign - p.qw) * a;
      const len = Math.hypot(qx, qy, qz, qw) || 1;
      this.object.quaternion.set(qx / len, qy / len, qz / len, qw / len);
    } else {
      this.object.position.set(t.x, t.y, t.z);
      this.object.quaternion.set(r.x, r.y, r.z, r.w);
    }

    const wheelEasing = Math.min(1, VISUAL_WHEEL_RATE * delta);
    const steerEasing = Math.min(1, VISUAL_STEER_RATE * delta);

    for (let i = 0; i < 4; i++) {
      const connection = this.vehicle.wheelChassisConnectionPointCs(i);
      // The airborne fallback is the LIVE stance rest length, not the
      // constant: with the jump being a suspension pop, the hop is exactly
      // when the wheels leave the ground, and falling back to the tucked
      // 0.88 made the legs snap in at the moment they should be extended
      // (Michael: "can we make it so it has a wheel extension when we
      // jump / hold space" — they always extended on the ground; this is
      // the in-air half).
      const suspension = this.vehicle.wheelSuspensionLength(i) ?? this._restLength ?? WHEEL.restLength;
      const root = this.wheelRoots[i];

      if (connection) {
        const targetY = Math.min(connection.y - suspension, WHEEL_Y_CLAMP);
        root.position.x = connection.x;
        root.position.z = connection.z;
        root.position.y += (targetY - root.position.y) * wheelEasing;
      }

      const steer = this.vehicle.wheelSteering(i) ?? 0;
      root.rotation.y += (steer - root.rotation.y) * steerEasing;
      this.wheelSpins[i].rotation.x = this.vehicle.wheelRotation(i) ?? 0;

      // The pole spans hub to chassis underside — the reference's
      // `Math.abs(container.position.y) - 0.5` with our underside.
      this.wheelPoles[i].scale.y = Math.max(0.05, -root.position.y - HALF.y);
    }
  }

  /**
   * Strength of the last hard landing, 0..1, cleared on read.
   *
   * **Ours, not the reference's.** The reference's roll shake is kicked from exactly one place —
   * `Explosions.js:20` — and nothing in our world explodes, so a faithful port
   * would leave the shake permanently silent and therefore unjudgeable. This is
   * the cheapest honest trigger available from state we already read: the frame
   * the wheels regain the ground after all four have left it, scaled by how fast
   * we were falling the frame before. If it reads as fake juice, deleting the
   * caller in `world/View.js` is a one-line removal.
   */
  takeImpact() {
    const impact = this._impact;
    this._impact = 0;
    return impact;
  }

  /**
   * The i-th wheel's ground point, for the tracks (the reference's `groundTrack.update(
   * physicalWheel.contactPoint, physicalWheel.inContact)`): the suspension
   * ray's hit while the wheel touches, else the tyre's underside in the air,
   * so the ribbon keeps its shape and only its alpha drops. Returns whether
   * the wheel is touching.
   */
  wheelGround(i, target) {
    const touching = this.vehicle.wheelIsInContact(i);
    const hit = touching ? this.vehicle.wheelContactPoint(i) : null;
    if (hit) {
      target.set(hit.x, hit.y, hit.z);
      return true;
    }
    this.wheelSpins[i].getWorldPosition(target);
    target.y -= WHEEL.radius;
    return false;
  }

  _updateContacts() {
    let inContact = 0;
    for (let i = 0; i < 4; i++) {
      if (this.vehicle.wheelIsInContact(i)) inContact++;
    }

    // The vertical velocity is sampled from the *previous* frame because by the
    // time contact is reported the suspension has already absorbed most of it.
    if (this._wheelsInContact === 0 && inContact >= 2) {
      const fall = -this._previousVerticalVelocity;
      if (fall > LANDING_THRESHOLD) {
        this._impact = Math.min((fall - LANDING_THRESHOLD) / LANDING_RANGE, 1);
      }
    }

    this._wheelsInContact = inContact;
    this._previousVerticalVelocity = this.body.linvel().y;
  }

  /**
   * Drag and drowning, from the height field rather than from the body's y.
   *
   * The reference's test is `body.y < 0`, which is the same thing measured on the car
   * instead of on the ground and is a perfectly good rule when the ground is
   * flat. Ours reads the terrain because our land is not flat: a car in a dip
   * would otherwise start swimming on dry ground.
   *
   * @param {number} delta seconds
   * @param {import('./Terrain.js').default} terrain
   */
  updateWater(delta, terrain) {
    const t = this.body.translation();
    this.waterDepth = terrain.depthAt(t.x, t.z);

    const wet = Math.min(
      1,
      Math.max(
        0,
        (this.waterDepth - WATER.dragStartDepth) /
          (WATER.fullDragDepth - WATER.dragStartDepth)
      )
    );
    this.wetness = wet;

    this.body.setLinearDamping(LINEAR_DAMPING + (WATER.maxLinearDamping - LINEAR_DAMPING) * wet);
    this.body.setAngularDamping(
      ANGULAR_DAMPING + (WATER.maxAngularDamping - ANGULAR_DAMPING) * wet
    );

  }

  /**
   * Rolling 3 s window; true when the player is clearly wedged. **The reference's measure,
   * ported properly 20 Aug** — `PhysicsVehicle.stuck`, `durationTest 3`,
   * `distanceThreshold 0.5`.
   *
   * The distinction that matters is **path length, not displacement.** Ours
   * summed `hypot(now − 3 s ago)` against a threshold of 1.2, which calls a car
   * driving tight circles "stuck" — it has gone nowhere but it is plainly being
   * driven. The reference's accumulates per-frame travel, so circling clears the test and
   * only a car that is genuinely not moving trips it. With drowning removed this
   * is the only automatic recovery left, so it has to not fire on someone who is
   * having a perfectly good time.
   */
  /**
   * The reference's upside-down watch, on our clock: `elapsed` stands in for the reference's gsap
   * delayedCall. Righting the car cancels the timer (the reference's 'rightSideUp'
   * kill); staying flipped past the wait fires the hop and re-arms.
   */
  updateFlip(elapsed) {
    const q = this.body.rotation();
    _quat.set(q.x, q.y, q.z, q.w);
    _upAxis.set(0, 1, 0).applyQuaternion(_quat);

    // The reference's ratio: 0 upright, 0.5 on the side, 1 fully inverted.
    const ratio = -_upAxis.y * 0.5 + 0.5;

    if (ratio <= FLIP.ratioThreshold) {
      this._flipDownSince = null;
      return;
    }
    if (this._flipDownSince === null) this._flipDownSince = elapsed;
    if (elapsed - this._flipDownSince < FLIP.waitSeconds) return;
    // The reference's "again in case it didn't work" — but re-armed on the shorter
    // retry clock, so an incomplete flip finishes promptly instead of
    // lying half-recovered for another full grace period.
    this._flipDownSince = elapsed - (FLIP.waitSeconds - FLIP.retrySeconds);

    const mass = this.body.mass();
    // In water the hop and the roll both fight the depth damping; see FLIP.
    const wet = this.wetness;
    this.body.applyImpulse({ x: 0, y: FLIP.force * mass * (1 + FLIP.wetForceBoost * wet), z: 0 }, true);

    _sideAxis.set(1, 0, 0).applyQuaternion(_quat);
    _forward.set(0, 0, 1).applyQuaternion(_quat);
    const sidewardDot = _sideAxis.y;
    const forwardDot = _forward.y;
    const upwardAbs = Math.abs(_upAxis.y);

    const boost = FLIP.torqueBoost * mass * (1 + FLIP.wetTorqueBoost * wet);
    if (upwardAbs > Math.abs(sidewardDot) && upwardAbs > Math.abs(forwardDot)) {
      // Fully upside down: roll it over about the forward axis (the reference's local-X
      // torque in the reference's forward-is-X frame; either sign completes the roll).
      _torque.set(0, 0, FLIP.invertedTorque * boost);
    } else {
      // On its side or nose: roll proportional to how far the axle points
      // up, pitch proportional to how far the nose does. The SIGNS are
      // flipped from the reference's literals: (forward X, axle Z) and (forward Z,
      // axle X) are opposite-handed pairs, so every righting torque
      // reverses — measured, the literal port rolled a side-lying car the
      // long way round into fully inverted.
      _torque.set(forwardDot * 0.8 * boost, 0, -sidewardDot * 0.4 * boost);
    }
    _torque.applyQuaternion(_quat);
    this.body.applyTorqueImpulse({ x: _torque.x, y: _torque.y, z: _torque.z }, true);
  }

  updateStuck(elapsed) {
    const t = this.body.translation();
    const last = this._lastStuckSample;
    const step = last ? Math.hypot(t.x - last.x, t.y - last.y, t.z - last.z) : 0;
    const dt = last ? elapsed - last.time : 0;
    this._lastStuckSample = { time: elapsed, x: t.x, y: t.y, z: t.z };

    if (dt > 0) this._history.push({ time: elapsed, dt, step });
    let held = 0;
    for (let i = this._history.length - 1; i >= 0; i--) held += this._history[i].dt;
    while (this._history.length && held - this._history[0].dt >= STUCK.duration) {
      held -= this._history.shift().dt;
    }

    if (held < STUCK.duration) {
      this.stuck = false;
      return;
    }
    let travelled = 0;
    for (const h of this._history) travelled += h.step;
    this.stuck = travelled < STUCK.distance;
  }

  get upsideDown() {
    const q = this.body.rotation();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
      new THREE.Quaternion(q.x, q.y, q.z, q.w)
    );
    return up.y < 0.1;
  }

  /**
   * @param {?({x:number,y:number,z:number}|number[])} position
   * @param {number} [heading] yaw in radians, applied about Y.
   *
   * Accepts either position shape because callers (and the debug console) reach
   * for both — and a malformed argument here writes NaN into the rigid body,
   * which corrupts the whole physics world with no error until everything
   * silently disappears.
   *
   * **It no longer defaults to anywhere useful on its own.** Respawning in
   * place is what `KNOWN-ISSUES.md` 15 is about: it does nothing in the one
   * situation a player most needs it. The caller is expected to hand it a point
   * from `Island.closestSpawn()`, which is the reference's arrangement — every one of the reference's
   * recovery paths funnels through `respawns.getClosest(player.position)`
   * (`Player.js:477`). The in-place default survives only for the debug
   * console.
   */
  respawn(position = null, heading = 0) {
    let t = position ?? this.body.translation();
    if (Array.isArray(t)) t = { x: t[0], y: t[1], z: t[2] };

    if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)) {
      console.warn('[car] respawn got a non-finite position; using the origin', position);
      t = { x: 0, y: 6, z: 0 };
    }

    const y = Math.max(t.y, 0) + 3;
    const half = heading * 0.5;
    this.body.setTranslation({ x: t.x, y, z: t.z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this._history.length = 0;
    this._lastStuckSample = null;
    this.stuck = false;
    // Or the car is drawn sliding across the island from wherever it used to be.
    this._hasPrev = false;
    this.wetness = 0;
    this.waterDepth = -1;
    this.body.setLinearDamping(LINEAR_DAMPING);
    this.body.setAngularDamping(ANGULAR_DAMPING);
  }

  get position() {
    return this.body.translation();
  }
}
