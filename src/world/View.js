import * as THREE from 'three/webgpu';
import { attribute, Fn, mix, positionGeometry, uniform, vec4 } from 'three/tsl';

/**
 * A critically-damped spring with a hard ceiling on acceleration, integrated at
 * a fixed 1/240 s substep, from the kairui.dev teardown. The acceleration clamp
 * is the part everyone omits and it is precisely the part that makes the motion
 * feel expensive: no matter how violently the target jumps, the camera
 * physically cannot snap.
 */
class Spring3 {
  constructor({ omega = 6, maxAcceleration = 90 } = {}) {
    this.omega = omega;
    this.maxAcceleration = maxAcceleration;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this._a = new THREE.Vector3();
  }

  set(v) {
    this.position.copy(v);
    this.velocity.set(0, 0, 0);
  }

  step(delta, target) {
    let remaining = Math.min(delta, 0.1);
    const h = 1 / 240;
    const w = this.omega;

    while (remaining > 0) {
      const dt = Math.min(remaining, h);
      remaining -= dt;

      this._a
        .copy(target)
        .sub(this.position)
        .multiplyScalar(w * w)
        .addScaledVector(this.velocity, -2 * w);

      const magnitude = this._a.length();
      if (magnitude > this.maxAcceleration) {
        this._a.multiplyScalar(this.maxAcceleration / magnitude);
      }

      this.velocity.addScaledVector(this._a, dt);
      this.position.addScaledVector(this.velocity, dt);
    }

    return this.position;
  }
}

/**
 * The camera rig. It is **not** a chase camera, and that is the whole point.
 *
 * `phi` and `theta` are set here and never touched again: a fixed 3/4 isometric
 * diorama view that slides over the world on X and Z, never rotating with the
 * car and never following it vertically (`ROADMAP.md` decision 15, `C` §6.1).
 * Combined with a 25° lens — set in `render/Renderer.js` — that is what produces
 * the model-village look rather than a game camera.
 *
 * What the two deletions buy is not simplicity, it is the removal of two whole
 * problem classes. No rotation follow means the view never swings into scenery,
 * so there is no occlusion system to write. No vertical follow means jumps and
 * hills produce zero camera motion, which is the single largest source of
 * discomfort in a third-person camera. Both are refusals, not solutions.
 *
 * The price is paid elsewhere and has to be paid: the world is now authored for
 * exactly one viewing angle (decision 16), a hill tall enough to hide the car is
 * a bug rather than a feature (decision 17, `KNOWN-ISSUES.md` 12), and anything
 * standing between the camera and the car is an occluder you cannot steer around
 * (`KNOWN-ISSUES.md` 8).
 *
 * We keep our spring where the reference's has a plain exponential lerp, but only as the
 * filter — it is demoted from "the rig", which is all it should ever have been.
 * What it buys over the lerp is velocity continuity and an acceleration ceiling:
 * the reference's visibly jerks if the target teleports, which is why the reference's respawn hides
 * behind a full-screen fade (`C` §6.7). What it must not cost is tracking, and
 * at the omega we inherited it cost a great deal — see `SPRING_OMEGA` below.
 */

/** 55.8 degrees from +Y, so 34.2 above the horizon. */
export const PHI = Math.PI * 0.31;
/** 45 degrees, and it never changes again for the life of the project. */
export const THETA = Math.PI * 0.25;

export const RADIUS = { min: 15, max: 30 };

/**
 * Narrow viewports pull the camera back so the same amount of world fits. Eight
 * lines, and the difference between a usable and an unusable portrait phone.
 */
export const IDEAL_RATIO = 16 / 9;
export const NON_IDEAL_RATIO_OFFSET = 9;

/**
 * Zoom ratio to radius, high ratio being *close*.
 *
 * **The base is 0, not the 0.6 the constructor suggests, and that is the single
 * biggest framing difference between the two builds.** 0.6 is only the reference's *initial*
 * value: the intro tweens it to 0 (`Reveal.js:185`) and step 2 never restores it,
 * so the shipped experience drives at a base of 0 for its entire life. Read off
 * the reference's running build: `zoom.baseRatio 0.001`, `radius.current 29.99`, reveal step 2.
 *
 * So the reference's resting radius is **30**, not 21. Ours was 21, which is 43 % closer, and
 * that — not the car — is why the reference's world reads wider through the same 25 degree
 * lens. Measured share of frame height at rest: the reference's 22.9 %, ours was 37.9 %.
 *
 * A consequence worth knowing: with the base at 0 the speed pull-back drives the
 * ratio *negative*, and neither the reference's lerp nor `MathUtils.lerp` clamps, so the
 * radius runs past the stated 30 to about 34 at our top speed. The reference's does the same
 * thing for the same reason. It exceeds the 15-30 that decision 15 records; the
 * 15 end is only reachable through the zoom control, which we do not have.
 *
 * The speed edges are the reference's 5 - 40 (apparent m/s, `C` §6.4) — restored 2 Sep.
 * They were ours (8 - 30) for exactly as long as we had no boost: the old
 * comment here keyed them to a car that topped out at 23.5 apparent, so the reference's
 * range would have left the effect unreachable. The boost ships the reference's top
 * speed now (5 → 40 physics, 80 apparent), so the reference's edges are the ones that
 * keep the pull-back breathing across the whole range instead of
 * saturating a third of the way into a boost.
 */
const ZOOM_BASE_RATIO = 0;
const ZOOM_SPEED_AMPLITUDE = -0.4;
const ZOOM_SPEED_EDGE = { min: 5, max: 40 };
const ZOOM_RATE = 10;

/**
 * The filter, and the one number in here that was inherited rather than derived.
 *
 * `C` §6.7 claims a 10/s exponential lerp and an omega 5 critically damped spring
 * "both settle in roughly 100-200 ms". That is wrong, and it is the kind of wrong
 * that only shows up once you drive it. What matters for a camera whose target
 * never stops moving is not settling time but **steady-state trail**: the constant
 * distance the filter sits behind a target travelling at a constant speed.
 *
 *   exponential at rate k      trail = v / k        = 2.2 units at our top speed
 *   critically damped omega    trail = 2v / omega   = 8.8 units at omega 5
 *
 * Measured at 21.7 apparent m/s, the numbers came out at 1.8 and 8.4. The visible
 * ground only runs about 6 units behind frame centre at this radius and lens, so
 * omega 5 put the car **off the bottom of the screen** at speed, and most of the
 * way there at half speed. Everything read as lag: the car looked like it was
 * being dragged rather than driven, and every corner threw it across the frame.
 *
 * Matching the trail is `2v/omega = v/k`, so omega = 2k. That reproduces the
 * reference filter's tracking exactly while keeping the two things a spring has
 * over a lerp and that decision 15 asked for by name: velocity continuity, and an
 * acceleration ceiling that makes a snap physically impossible. omega 5 was a
 * Phase 1 number tuned for a chase camera that also rotated and followed Y - a
 * different rig with a different job.
 *
 * **omega is 21.4, and it was measured rather than derived - twice, because the
 * derivation was wrong both times.**
 *
 * The reference's filter is a per-frame `lerp(position, delta * 10)`. The *discrete* steady
 * state of that is `v * dt * (1 - k) / k` with `k = 10 * dt = 1/6` at 60 fps,
 * which is `v/12` and not the `v/10` the continuous form predicts. Measured on
 * the reference's running build and dead constant across three speed regimes - 1.085 units
 * at 13.3 apparent, 1.834 at 22.0, 7.376 at 88.5, all exactly `v/12`
 * (`ROADMAP.md` -> *The instrumented A/B*).
 *
 * Setting `2v/omega = v/12` gives omega 24. That is wrong for exactly the same
 * reason `v/10` was wrong for the reference author: **our spring is integrated per frame too**, so
 * it also lags less than its continuous form says. Applying the discrete
 * correction to the reference's filter and the continuous formula to ours compares two
 * different kinds of quantity, which is the trap this project keeps walking
 * into. Swept on the running build at terminal speed instead, trail over
 * apparent speed:
 *
 * | omega | 18 | 20 | 21 | **21.4** | 22 | 24 |
 * |---|---|---|---|---|---|---|
 * | ratio | .1009 | .0898 | .0850 | **.0832** | .0807 | .0731 |
 * | vs the reference's .0833 | +21 % | +7.8 % | +2.0 % | **-0.1 %** | -3.2 % | -12 % |
 *
 * So 21.4 is the reference's to a tenth of a percent - 1.856 units against the reference's 1.834 - and
 * the previous omega 20 was **7.8 % looser** than the reference author, not the 20 % tighter that
 * comparing our target against the reference's measurement suggested. Michael judged the
 * trail against the finished world and chose to match the reference author.
 *
 * The ceiling goes up with it. At omega 20 a clamp of 140 is tight enough to
 * dominate the recovery from a teleport, which made respawn *slower* than it was
 * at omega 5 (2.33 s against 1.42 s). At 300 the same 56-unit jump is recovered in
 * 0.63 s, and normal driving never reaches the clamp at all - the two terms of the
 * spring cancel to near zero once it is tracking.
 */
const SPRING_OMEGA = 21.4;
const SPRING_MAX_ACCELERATION = 300;

/**
 * A focus point the player has dragged away is pulled back with a force
 * proportional to the *square* of the distance - hard when far, a gentle drift
 * when close. Inert while `isTracking`, which is always, today.
 */
const MAGNET_MULTIPLIER = 0.25;

/**
 * The roll shake, in wall-clock terms. The reference's four lines run on `deltaScaled`
 * while the rest of the reference's camera runs on a plain delta, so the reference's face values of
 * pullStrength 100 and damping 4 are in scaled time (`C` §5.1a class B, §6.5).
 *
 * Note that the two do **not** convert by the same factor, which is the trap
 * inside the trap: pull strength is omega squared and carries T^-2, so it scales
 * x4 (100 to 400); damping is T^-1 and scales x2 (4 to 8). Written as omega here
 * so the squaring is explicit and nobody doubles 100 and calls it converted.
 *
 * It is an **impact shake, not a corner bank.** `kick()` picks a random sign and
 * has no coupling to steering whatsoever; the corner-bank version described in
 * `the reference teardown (local)` does not exist in the reference's code (`C` §13.1).
 */
const ROLL_OMEGA = 20;
const ROLL_DAMPING = 8;

export default class View {
  constructor(camera, { viewport, sky = null }) {
    this.camera = camera;
    this.viewport = viewport;

    /**
     * The fog reads its distances from this rig rather than carrying its own,
     * because they are a property of the framing: how far the ground runs
     * between the bottom and top edges of frame. Fog placed as a fraction of
     * that band survives any aspect ratio or field of view unchanged.
     */
    this.sky = sky;
    this.optimalArea = { near: 0, far: 0 };
    this._probeCamera = camera.clone();
    this._probeRay = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._probeHit = new THREE.Vector3();
    this._lastAspect = null;

    /**
     * The camera looks at a filtered proxy, never at the car.
     *
     * The reference's `focusPoint` is a first-class object that can be detached, dragged,
     * magnetised back and driven by cinematics (`C` §6.7 rec 4). Ours used to
     * look straight at the car, which left no seam to insert panning,
     * fast-travel previews or cutscenes at. Nothing detaches it yet; the point
     * is that something can.
     */
    this.focusPoint = {
      trackedPosition: new THREE.Vector3(),
      position: new THREE.Vector3(),
      isTracking: true,
      magnetActive: true,
    };

    /** X/Z only. `position.y` is zero and is never written. */
    this.spring = new Spring3({ omega: SPRING_OMEGA, maxAcceleration: SPRING_MAX_ACCELERATION });

    this.zoom = {
      baseRatio: ZOOM_BASE_RATIO,
      ratio: ZOOM_BASE_RATIO,
      smoothedRatio: ZOOM_BASE_RATIO,
    };

    this.roll = { value: 0, speed: 0 };

    this.radius = RADIUS.min;
    this._offset = new THREE.Vector3();
    this._initialised = false;

    this._buildSpeedLines();

    this.updateOptimalArea();
  }

  /**
   * The boost's on-screen half — the reference's `View.setSpeedLines`, ported line for
   * line (`View.js:462-563`): thirty hair-thin triangles pinned around the
   * frame's edge IN CLIP SPACE (the vertex node returns the final vec4, so
   * no camera matrix ever touches them), whose middle vertices stretch
   * toward the car's projected position, oscillating, scaled by a smoothed
   * strength. At strength 0 they collapse to zero-width slivers at the
   * frame edge — the mesh is always in the scene and never draws a pixel
   * you can see until the boost passes the reference's speed threshold.
   *
   * `Game` adds `speedLines.mesh` to the scene; `update()` drives the
   * strength from the car and projects the target after the camera moves.
   */
  _buildSpeedLines() {
    // The reference's alea('speedLines') seed, downgraded to a local LCG — the lines
    // only need to be stable between boots, not to match the reference's exact angles.
    let seed = 1337;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    this.speedLines = {};
    this.speedLines.strength = 0;
    this.speedLines.smoothedStrength = uniform(0);
    this.speedLines.worldTarget = new THREE.Vector3();
    this.speedLines.clipSpaceTarget = uniform(new THREE.Vector3());
    this.speedLines.speed = uniform(12);
    this.speedLines.time = uniform(0);

    const linesCount = 30;
    const positionArray = new Float32Array(linesCount * 3 * 3);
    const timeRandomnessArray = new Float32Array(linesCount * 3);
    const distanceArray = new Float32Array(linesCount * 3);
    const tipnessArray = new Float32Array(linesCount * 3);
    const maxDistance = Math.hypot(1, 1);

    for (let i = 0; i < linesCount; i++) {
      const i9 = i * 9;
      const i3 = i * 3;

      const vertexMiddle = new THREE.Vector2(0, 1);
      const angle = Math.PI * 2 * rng();
      vertexMiddle.rotateAround(new THREE.Vector2(), angle);

      const thickness = rng() * 0.01 + 0.002;
      const vertexLeft = vertexMiddle.clone().rotateAround(new THREE.Vector2(), thickness);
      const vertexRight = vertexMiddle.clone().rotateAround(new THREE.Vector2(), -thickness);

      vertexMiddle.multiplyScalar(maxDistance);
      vertexLeft.multiplyScalar(maxDistance);
      vertexRight.multiplyScalar(maxDistance);

      positionArray.set([vertexLeft.x, vertexLeft.y, 0, vertexMiddle.x, vertexMiddle.y, 0, vertexRight.x, vertexRight.y, 0], i9);
      timeRandomnessArray.set([i, i, i], i3);

      const distance = rng() * 0.4 + 0.4;
      distanceArray.set([distance, distance, distance], i3);
      tipnessArray.set([0, 1, 0], i3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionArray, 3));
    geometry.setAttribute('timeRandomness', new THREE.Float32BufferAttribute(timeRandomnessArray, 1));
    geometry.setAttribute('distance', new THREE.Float32BufferAttribute(distanceArray, 1));
    geometry.setAttribute('tipness', new THREE.Float32BufferAttribute(tipnessArray, 1));

    const material = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
    material.vertexNode = Fn(() => {
      const timeRandomness = attribute('timeRandomness');
      const distance = attribute('distance');
      const tipness = attribute('tipness');

      const oscillation = this.speedLines.time
        .mul(this.speedLines.speed)
        .add(timeRandomness)
        .sin()
        .div(2)
        .add(0.5);
      const newPosition = mix(
        positionGeometry.xy,
        this.speedLines.clipSpaceTarget.xy,
        tipness.mul(oscillation).mul(distance).mul(this.speedLines.smoothedStrength)
      );

      return vec4(newPosition, 0, 1);
    })();
    material.outputNode = vec4(1);

    this.speedLines.mesh = new THREE.Mesh(geometry, material);
    this.speedLines.mesh.frustumCulled = false;
    this.speedLines.mesh.renderOrder = 10;
  }

  /**
   * How far the ground runs, in camera-to-ground distance, between the bottom
   * and top edges of frame. Measured by raycasting NDC (0,-1) and (0,+1) onto
   * the ground plane rather than derived in closed form, so it stays correct if
   * the lens or the rig angles ever move.
   *
   * Two details matter. It is computed at the camera's **furthest** radius, not
   * its resting one, including the speed pull-back — `1 - ZOOM_SPEED_AMPLITUDE`
   * is 1.4, so the probe sits at 42 rather than 30. Fog placed against the
   * pulled-back framing cannot then close in on the car when you accelerate,
   * which would be exactly backwards. And it uses a clone of the real camera,
   * so nothing here can disturb the frame being rendered.
   *
   * At our phi of 0.31π through a 25° lens this gives 32.46 and 63.86, which
   * are the reference's numbers to two decimals — unsurprising, since decisions
   * 15 and 18 already adopted its phi, lens and radius. Nothing was copied to
   * make them agree; they agree because the geometry is the same.
   */
  updateOptimalArea() {
    const aspect = this.viewport.aspect;
    this._lastAspect = aspect;

    const ratioOverflow = Math.max(1, IDEAL_RATIO / aspect) - 1;
    const radiusMax =
      (RADIUS.max + ratioOverflow * NON_IDEAL_RATIO_OFFSET) * (1 - ZOOM_SPEED_AMPLITUDE);

    const probe = this._probeCamera;
    probe.fov = this.camera.fov;
    probe.aspect = aspect;
    probe.near = this.camera.near;
    probe.far = this.camera.far;
    probe.position.setFromSphericalCoords(radiusMax, PHI, THETA);
    probe.lookAt(0, 0, 0);
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld(true);

    const edge = (ndcY) => {
      this._probeRay.setFromCamera(new THREE.Vector2(0, ndcY), probe);
      const hit = this._probeRay.ray.intersectPlane(this._groundPlane, this._probeHit);
      return hit ? probe.position.distanceTo(hit) : null;
    };

    const near = edge(-1);
    const far = edge(1);

    // The top edge only misses the ground if the rig is ever raised above the
    // horizon, which decision 15 forbids. Keep the previous band rather than
    // writing a null into a uniform if it somehow happens.
    if (near === null || far === null || far <= near) return;

    this.optimalArea.near = near;
    this.optimalArea.far = far;
    if (this.sky) this.sky.setBand(near, far);
  }

  /**
   * Snap the whole rig onto a new position, for a teleport.
   *
   * The spring exists to make ordinary motion continuous, and a respawn is the
   * one motion that must not be: filtering a fifty-unit jump means either a
   * long sweep across the island or an acceleration clamp fighting it for a
   * second. The reference's does not filter it either — `moveTo` writes the body and the
   * focus point follows on the next frame from wherever it now is.
   *
   * Call it inside the veil, on the same frame as the respawn.
   */
  reset(position) {
    this.focusPoint.trackedPosition.set(position.x, 0, position.z);
    this.focusPoint.position.copy(this.focusPoint.trackedPosition);
    this.spring.set(this.focusPoint.position);
    this.roll.value = 0;
    this.roll.speed = 0;
  }

  /** Random sign, so repeated hits never build up a lean. */
  kick(strength = 1) {
    this.roll.speed = strength * (Math.random() < 0.5 ? -1 : 1);
  }

  update(delta, car) {
    const { focusPoint } = this;
    const t = car.position;

    focusPoint.trackedPosition.set(t.x, 0, t.z);

    if (focusPoint.isTracking) {
      focusPoint.position.x = focusPoint.trackedPosition.x;
      focusPoint.position.z = focusPoint.trackedPosition.z;
    }

    if (focusPoint.magnetActive) {
      const dx = focusPoint.trackedPosition.x - focusPoint.position.x;
      const dz = focusPoint.trackedPosition.z - focusPoint.position.z;
      const strength = Math.hypot(dx, dz) * MAGNET_MULTIPLIER;
      focusPoint.position.x += strength * dx * delta;
      focusPoint.position.z += strength * dz * delta;
    }

    if (!this._initialised) {
      this.spring.set(focusPoint.position);
      this._initialised = true;
    }

    const smoothed = this.spring.step(delta, focusPoint.position);

    // Keyed on the *filtered* speed, not the car's raw speed, so the pull-back
    // cannot jitter - the spring is carrying the velocity already.
    const focusSpeed = Math.hypot(this.spring.velocity.x, this.spring.velocity.z);
    const speedRatio = THREE.MathUtils.smoothstep(
      focusSpeed,
      ZOOM_SPEED_EDGE.min,
      ZOOM_SPEED_EDGE.max
    );

    this.zoom.ratio = this.zoom.baseRatio + ZOOM_SPEED_AMPLITUDE * speedRatio;
    this.zoom.smoothedRatio +=
      (this.zoom.ratio - this.zoom.smoothedRatio) * Math.min(1, ZOOM_RATE * delta);

    // The band is a function of aspect, so it only needs recomputing when the
    // viewport actually changes shape - not every frame.
    if (this.viewport.aspect !== this._lastAspect) this.updateOptimalArea();

    const ratioOverflow = Math.max(1, IDEAL_RATIO / this.viewport.aspect) - 1;
    const radiusMax = RADIUS.max + ratioOverflow * NON_IDEAL_RATIO_OFFSET;
    this.radius = THREE.MathUtils.lerp(RADIUS.min, radiusMax, 1 - this.zoom.smoothedRatio);

    this._offset.setFromSphericalCoords(this.radius, PHI, THETA);
    this.camera.position.copy(smoothed).add(this._offset);
    this.camera.lookAt(smoothed);

    const impact = car.takeImpact();
    if (impact > 0) this.kick(impact);

    // The reference's four lines, semi-implicit, with pull strength written as omega squared.
    this.roll.speed += -this.roll.value * (ROLL_OMEGA * ROLL_OMEGA) * delta;
    this.roll.value += this.roll.speed * delta;
    this.roll.speed *= 1 - ROLL_DAMPING * delta;

    // lookAt() wrote the whole orientation, so this is a pure roll about the
    // view axis: R . Rz(roll), exactly the reference's `rotation.z +=` on an XYZ euler.
    this.camera.rotateZ(this.roll.value);

    /**
     * The speed lines, after the camera has moved so the projection is this
     * frame's. The reference's trigger verbatim (`Player.js:611-616`): boosting AND on
     * the throttle AND past 15 physics m/s — three times cruise, so the
     * lines mark "properly fast", not merely "holding shift". The reference's smoothing
     * rate (delta × 2) and the reference's oscillation clock (scaled time, so 2× wall).
     */
    this.speedLines.strength =
      car.boosting && car.accelerating > 0 && car.speed > 15 ? 1 : 0;
    this.speedLines.worldTarget.set(t.x, t.y, t.z);
    this.speedLines.clipSpaceTarget.value.copy(this.speedLines.worldTarget);
    this.speedLines.clipSpaceTarget.value.project(this.camera);
    this.speedLines.time.value += delta * 2;
    this.speedLines.smoothedStrength.value +=
      (this.speedLines.strength - this.speedLines.smoothedStrength.value) *
      Math.min(1, delta * 2);
  }
}
