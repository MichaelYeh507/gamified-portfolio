import { tween, ease } from './tween.js';

/**
 * A full-screen fade, and the cover story for a teleport.
 *
 * Decision 43 wants the drowning respawn hidden behind a fade, and notes that
 * the reference author hides the reference's behind a full-screen overlay for the same reason: `respawn()`
 * runs *inside* `overlay.show()`'s callback, so the car is moved while the
 * screen is already covered and the snap is never seen (`Player.js:471-487`).
 * Without it a respawn is a hard cut — the camera spring cannot filter a
 * teleport, and it should not have to.
 *
 * DOM rather than a render pass on purpose. It has to sit over everything
 * including any future UI, it costs nothing, and it cannot interact with the
 * bloom threshold — a full-screen quad drawn into the linear pass at 1.0 would.
 * The opacity is driven from the same tween runner as everything else, so it
 * shares a clock with the physics rather than racing a CSS transition.
 */
export default class Veil {
  constructor(element) {
    this.element = element;
    this.value = 0;
    this._cancel = null;
  }

  _set(v) {
    this.value = v;
    this.element.style.opacity = String(v);
    // Never let a fully transparent veil eat a pointer event.
    this.element.style.pointerEvents = v > 0.01 ? 'auto' : 'none';
  }

  _to(target, duration, easing, onComplete) {
    this._cancel?.();
    this._cancel = tween({
      from: this.value,
      to: target,
      duration,
      easing,
      onUpdate: (v) => this._set(v),
      onComplete: () => {
        this._cancel = null;
        onComplete?.();
      },
    });
  }

  /**
   * Fade out, run `midpoint` behind the cover, fade back in.
   *
   * `midpoint` is called on the frame the veil is fully opaque, which is the
   * only frame it is safe to move the car on.
   */
  cover(midpoint, { out = 0.25, hold = 0.12, back = 0.45 } = {}) {
    this._to(1, out, ease.quadOut, () => {
      midpoint?.();
      // A beat at full opacity so the camera spring has settled on the new
      // position before anyone sees it. Without it the first visible frame is
      // mid-recovery and reads as a stumble rather than a cut.
      tween({
        from: 0,
        to: 1,
        duration: hold,
        easing: ease.linear,
        onUpdate: () => {},
        onComplete: () => this._to(0, back, ease.cubicOut),
      });
    });
  }
}
