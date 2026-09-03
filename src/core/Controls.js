/**
 * The controls sheet — the instructions at launch and the menu after.
 *
 * Michael, 2 Sep: "at the start of the game / launch, we can add instructions
 * text, similar to the 'get stuck?' text that disappears, also allow them to
 * open controls menu later if they wish." One DOM panel (`#controls` in
 * index.html), two lives:
 *
 *   - **launch**: shown the moment the car becomes drivable, **top-right**
 *     (Michael: "maybe have it pop up top right instead of blocking
 *     everything"), no scrim, the world still drivable; fades out after
 *     `LAUNCH_SECONDS` exactly as the stuck hint does. The first drive
 *     input does not cut it short — someone reading it while their thumb
 *     finds W should not lose it for finding W.
 *   - **modal**: `H`, or the `?` button bottom-right, at any time while
 *     driving. The car is paused through `setMode('card')` — the same one
 *     string that pauses it for a project card — and `H` or Escape (the
 *     `close` action, live only in that mode) hands the controls back.
 *
 * The reference's equivalent is the Mouse/Keyboard tab of the reference's menu (`index.html:343`),
 * behind the reference's menu button; ours is one table and a way back to it.
 */

const LAUNCH_SECONDS = 9;

export default class Controls {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('controls');
    this.button = document.getElementById('controls-button');
    this.isOpen = false;
    this._launchTimer = 0;
    this._fadeTimer = 0;

    if (!this.panel || !this.button) return;

    this.button.hidden = false;
    this.button.addEventListener('click', () => this.toggle());
    // The scrim is the way out for a thumb (no H, no Escape): a tap outside
    // the panel closes the modal. The launch sheet has no scrim to hit.
    this.panel.addEventListener('click', (event) => {
      if (this.isOpen && event.target === this.panel) this.close();
    });

    game.input.on('action', (name, value) => {
      if (!value) return;
      if (name === 'controls') {
        // Not over a project card: the card owns that mode.
        if (game.card?.isOpen) return;
        this.toggle();
      } else if (name === 'close' && this.isOpen) {
        this.close();
      }
    });
  }

  /** The launch life: on, then fading, then gone — unless opened meanwhile. */
  showLaunch(seconds = LAUNCH_SECONDS) {
    if (!this.panel || this.isOpen) return;
    this.panel.classList.remove('is-modal', 'is-fading');
    this.panel.classList.add('is-launch');
    this.panel.hidden = false;
    clearTimeout(this._launchTimer);
    clearTimeout(this._fadeTimer);
    this._launchTimer = setTimeout(() => {
      if (this.isOpen) return;
      this.panel.classList.add('is-fading');
      this._fadeTimer = setTimeout(() => {
        if (!this.isOpen) this.panel.hidden = true;
      }, 1000);
    }, seconds * 1000);
  }

  open() {
    if (!this.panel || this.isOpen) return;
    if (this.game.mode !== 'driving') return;
    clearTimeout(this._launchTimer);
    clearTimeout(this._fadeTimer);
    this.isOpen = true;
    this._returnFocusTo = document.activeElement;
    this.panel.classList.remove('is-launch', 'is-fading');
    this.panel.classList.add('is-modal');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.game.setMode('card');
  }

  close() {
    if (!this.panel || !this.isOpen) return;
    this.isOpen = false;
    this.panel.hidden = true;
    this.panel.classList.remove('is-modal');
    this.panel.setAttribute('aria-modal', 'false');
    this.button.setAttribute('aria-expanded', 'false');
    this.game.setMode('driving');
    if (this._returnFocusTo?.focus && this._returnFocusTo !== document.body) {
      this._returnFocusTo.focus();
    }
    this._returnFocusTo = null;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}
