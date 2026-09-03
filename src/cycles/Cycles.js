import * as THREE from 'three/webgpu';
import Events from '../core/Events.js';

/**
 * The clamped Hermite ramp, on the CPU.
 *
 * Written as a function taking its edges in order rather than as anything
 * chained, and it is the same discipline `KNOWN-ISSUES.md` 10 records for TSL:
 * **edges must increase.** The failure mode differs by a lot, which is why it is
 * worth naming here. In WGSL an inverted pair is undefined and compiles to zero
 * — a term silently deleted. Here the clamp keeps it finite and you get a
 * *reversed* ramp instead: a keyframe pair authored backwards would run its
 * phase from the next colour to the previous one, which reads as a palette
 * mistake rather than as a bug. `_setSteps()` refuses to build one.
 */
export function smoothstep(value, edge0, edge1) {
  if (edge1 === edge0) return 0;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Positive modulo, so a negative pinned progress still lands inside the cycle. */
function wrap01(x) {
  return ((x % 1) + 1) % 1;
}

/**
 * A property set that walks around a loop of keyframes, driven by the wall clock.
 *
 * Ported in shape from `reference/source/sources/Game/Cycles/Cycles.js` and
 * written from scratch. Three things about the mechanism are worth stating
 * because none of them is obvious from the outside:
 *
 * **Progress comes from the epoch, not from elapsed time.**
 * `Date.now() / 1000 / duration` means every visitor anywhere sees the same time
 * of day at the same instant, and a reload does not restart the sky. It also
 * makes the cycle immune to our 2x physics time scale (decision 18) and to a
 * hitched frame, because nothing integrates — each frame reads the clock.
 *
 * **The keyframe list is closed by injection, not by modulo.** A list whose last
 * stop is below 1 gets a copy of its first step appended at `1 + firstStop`, and
 * a list whose first stop is above 0 gets a copy of its last prepended at
 * `-(1 - lastStop)`. After that every progress in [0,1) is bracketed by a real
 * pair and the interpolation never has to special-case the seam.
 *
 * **Interpolation is `smoothstep` between the bracketing stops**, so a phase
 * eases in and out rather than sliding linearly. With four presets over a
 * 240-second day that is the difference between a sky that changes and a sky you
 * catch changing.
 */
export default class Cycles extends Events {
  /**
   * @param {object} options
   * @param {string} options.name      for error messages and the debug HUD
   * @param {number} options.duration  seconds for one full loop
   * @param {{stop:number, properties:object}[]} options.keyframes
   * @param {number|null} [options.forcedProgress] pin at construction, the reference's
   *   `VITE_*_CYCLE_PROGRESS`. Prefer `override` — it needs no reload.
   * @param {{name:string, start:number, end:number}[]} [options.intervals]
   */
  constructor({ name, duration, keyframes, forcedProgress = null, intervals = [] }) {
    super();

    this.name = name;
    this.duration = duration;
    this.forcedProgress = forcedProgress;

    /** @type {Record<string, {type:'color'|'number', value:THREE.Color|number}>} */
    this.properties = {};
    this._steps = [];

    /**
     * The live pin, and the whole reason the colour gate can be shot without a
     * rebuild between phases. `strength` blends rather than switches, so a pin
     * can be faded in; at 1 the progress is exactly `override.progress`.
     *
     * Deliberately a plain mutable object, because the console has to be able to
     * write it directly — which is how the reference's is used in practice
     * (`dayCycles.override.progress = 0.25`).
     */
    this.override = { progress: null, strength: 0 };

    this._intervals = intervals.map((interval) => ({ ...interval, inInterval: false }));

    this.absoluteProgress = this._readClock();
    this.progressDelta = 0;
    /** Where the wall clock says we are, before any pin. */
    this.realProgress = wrap01(this.absoluteProgress);
    /** Where the world is actually being drawn — the pin, if one is active. */
    this.progress = this.realProgress;

    this.setKeyframes(keyframes);
    this._evaluateIntervals(this.realProgress, false);
  }

  _readClock() {
    if (this.forcedProgress !== null) return this.forcedProgress;
    return Date.now() / 1000 / this.duration;
  }

  /**
   * Swap the whole keyframe set, live. This is decision 45's "swappable keyframe
   * set" — a candidate palette is one call, not an edit and a reload.
   *
   * The property *objects* survive the swap on purpose. Consumers cache the
   * `THREE.Color` instances as uniform values and we mutate them in place every
   * frame, so handing out fresh ones here would leave every uniform pointing at
   * a colour nothing writes any more, and the world would freeze at whatever the
   * old palette last said. That is also why the key sets have to match, and why
   * a mismatch throws rather than being tolerated: a candidate missing
   * `rimIntensity` would otherwise present as a rim that quietly stopped moving.
   */
  setKeyframes(keyframes) {
    const steps = this._normalise(keyframes);

    if (this._steps.length === 0) {
      for (const [key, value] of Object.entries(steps[0].properties)) {
        this.properties[key] =
          value instanceof THREE.Color
            ? { type: 'color', value: value.clone() }
            : { type: 'number', value };
      }
    } else {
      const wanted = Object.keys(this.properties).sort().join(',');
      const got = Object.keys(steps[0].properties).sort().join(',');
      if (wanted !== got) {
        throw new Error(`${this.name}: keyframes carry [${got}], expected [${wanted}]`);
      }
    }

    this._setSteps(steps);
    this._interpolate();
  }

  /** Presets may write hex strings; everything downstream sees typed values. */
  _normalise(keyframes) {
    return keyframes.map(({ stop, properties }) => {
      const typed = {};
      for (const [key, value] of Object.entries(properties)) {
        typed[key] = typeof value === 'number' ? value : new THREE.Color(value);
      }
      return { stop, properties: typed };
    });
  }

  /** Close the loop, then check the result is something `smoothstep` can walk. */
  _setSteps(steps) {
    const closed = steps.slice();
    const first = closed[0];
    const last = closed[closed.length - 1];

    if (last.stop < 1) closed.push({ stop: 1 + first.stop, properties: first.properties });
    if (first.stop > 0) closed.unshift({ stop: -(1 - last.stop), properties: last.properties });

    for (let i = 1; i < closed.length; i++) {
      if (closed[i].stop <= closed[i - 1].stop) {
        throw new Error(
          `${this.name}: stops must increase, got ${closed[i - 1].stop} then ${closed[i].stop}`
        );
      }
    }
    if (closed[0].stop > 0 || closed[closed.length - 1].stop < 1) {
      throw new Error(`${this.name}: keyframes do not span [0,1] after wrap injection`);
    }

    this._steps = closed;
  }

  /** Once per frame, before anything reads `properties`. */
  update() {
    const absolute = this._readClock();
    this.progressDelta = absolute - this.absoluteProgress;
    this.absoluteProgress = absolute;

    const real = wrap01(absolute);
    this._evaluateIntervals(real, true);
    this.realProgress = real;

    this.progress = this._applyOverride(real);
    this._interpolate();
  }

  /**
   * The pin, taken the short way round the clock.
   *
   * The reference's lerps the raw scalar (`Cycles.js:202`), which at strength 1 lands in
   * exactly the same place ours does — but part-way through a fade from 0.95 to
   * 0.05 the reference's runs *backwards* through the whole afternoon to get there. Ours
   * crosses the seam. So this changes nothing about a pinned shot and everything
   * about a faded one.
   */
  _applyOverride(real) {
    const { progress, strength } = this.override;
    if (!(strength > 0) || progress === null) return real;
    const shortest = ((wrap01(progress) - real + 1.5) % 1) - 0.5;
    return wrap01(real + shortest * Math.min(1, strength));
  }

  /**
   * Interval edges are tested against the **real** progress, never the pinned
   * one. The reference's tests the value the override has already written (`Cycles.js:156`
   * reads `this.progress` from the previous frame), so pinning the reference's cycle to
   * midnight fires `night` as a side effect of taking a photograph. Ours does
   * not: a pin changes what the world looks like, not what time it is.
   */
  _evaluateIntervals(progress, emit) {
    for (const interval of this._intervals) {
      const inside = progress > interval.start && progress < interval.end;
      if (inside === interval.inInterval) continue;
      interval.inInterval = inside;
      if (emit) this.emit(interval.name, inside);
    }
  }

  /**
   * Is a named interval running right now?
   *
   * Read this at subscribe time rather than waiting for the first edge, which
   * may be two minutes away. The reference's callers do the same
   * (`World/PoleLights.js:139-140`): subscribe, then call the handler once with
   * the current state.
   */
  inInterval(name) {
    return this._intervals.find((interval) => interval.name === name)?.inInterval ?? false;
  }

  _interpolate() {
    const steps = this._steps;

    // The last step only ever serves as the right-hand end of the final pair,
    // so the search stops one short of it.
    let index = 0;
    while (index + 1 < steps.length - 1 && steps[index + 1].stop <= this.progress) index++;

    const previous = steps[index];
    const next = steps[index + 1];
    const ratio = smoothstep(this.progress, previous.stop, next.stop);

    for (const [key, property] of Object.entries(this.properties)) {
      if (property.type === 'color') {
        property.value.lerpColors(previous.properties[key], next.properties[key], ratio);
      } else {
        const from = previous.properties[key];
        property.value = from + (next.properties[key] - from) * ratio;
      }
    }
  }

  /** Flattened `{ key: value }`, for the console and the colour gate HUD. */
  get values() {
    const out = {};
    for (const [key, property] of Object.entries(this.properties)) out[key] = property.value;
    return out;
  }

  /** Pin the cycle. `strength` below 1 blends the pin with the real time of day. */
  pin(progress, strength = 1) {
    this.override.progress = progress;
    this.override.strength = strength;
    this.update();
  }

  /** Hand the sky back to the clock. */
  release() {
    this.override.progress = null;
    this.override.strength = 0;
    this.update();
  }
}
