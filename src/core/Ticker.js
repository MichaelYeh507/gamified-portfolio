import { uniform } from 'three/tsl';
import Events from './Events.js';

/**
 * One requestAnimationFrame loop for the whole application, with explicit
 * priority slots. Straight from the the reference site teardown: every subsystem
 * subscribes to "tick" with a declared priority, so the frame order is
 * readable in one place instead of being an emergent property of import order.
 */
export const TICK = {
  INPUT: 0,
  PRE_PHYSICS: 10,
  PHYSICS: 20,
  POST_PHYSICS: 30, // sync visual transforms from bodies
  // The day and year cycles, and everything that copies out of them. Ahead of
  // GAMEPLAY because the lighting rig reads the cycle's colours in the same
  // frame it is written, which is the reference's ordering too (cycles 8, lighting 9).
  CYCLES: 40,
  GAMEPLAY: 50,
  CAMERA: 80,
  RENDER: 998,
};

export default class Ticker extends Events {
  constructor({ maxDelta = 1 / 20 } = {}) {
    super();
    this.maxDelta = maxDelta;
    this.elapsed = 0;
    this.delta = 1 / 60;
    this.frame = 0;
    this.running = false;

    /**
     * Shader time — mechanism 1 of the five the reference's world animates with, and the
     * one we had none of. `ROADMAP.md` → *How the reference's animation works*: the reference author has no
     * animation system at all, and **15 of the reference's files** read these uniforms and
     * write motion into a `positionNode`. Zero CPU, zero per-object state.
     *
     * **Two, where the reference author publishes four**, and the missing pair is a decision
     * rather than an omission. The reference's other two are `elapsedScaledUniform` and
     * `deltaScaledUniform`, doubled by the reference's `Ticker.scale = 2`.
     * `KNOWN-ISSUES.md` 6 put that scale in the physics instead, on the grounds
     * that "a `ticker.scale` would have meant every consumer choosing a delta
     * correctly forever" — so ours are plain wall clock, and **a rate ported
     * out of the reference's shader code is ×2, not ÷2**. `render/Wind.js` carries the one
     * live instance of that conversion.
     */
    this.elapsedUniform = uniform(0);
    this.deltaUniform = uniform(this.delta);

    this._last = 0;
    this._raf = 0;
    this._loop = this._loop.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _loop(now) {
    this._raf = requestAnimationFrame(this._loop);

    // Clamp: a backgrounded tab or a long GC pause must never hand physics a
    // half-second delta and teleport the car through the terrain.
    const raw = (now - this._last) / 1000;
    this._last = now;
    this.advance(Math.min(raw, this.maxDelta));
  }

  /**
   * Advance the clock by one step and run the frame.
   *
   * Split out of `_loop` so that **hand-pumping cannot skip the bookkeeping**.
   * Driving the ticker by hand — writing `delta`/`elapsed`/`frame` and calling
   * `emit('tick', …)` — is how every headless measurement in this project works,
   * because `requestAnimationFrame` is suspended in an occluded tab. The moment
   * the ticker owns a uniform, that idiom silently stops updating it: the world
   * advances, the shader time does not, and nothing driven by shader time moves
   * in any capture. Call this instead and it cannot happen.
   */
  advance(delta) {
    this.delta = delta;
    this.elapsed += delta;
    this.frame++;

    // Written before the tick, so anything reading them during the frame sees
    // this frame's values rather than the previous one's.
    this.elapsedUniform.value = this.elapsed;
    this.deltaUniform.value = this.delta;

    this.emit('tick', this.delta, this.elapsed);
  }
}
