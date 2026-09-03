import Events from './Events.js';

/**
 * Action-based input with categories. Nothing downstream ever asks "is ArrowUp
 * down?" — it asks for `actions.throttle`. That indirection is what lets
 * keyboard, gamepad and touch cost one design each instead of one per consumer.
 *
 * The current input *device* is also reflected as a class on <html> so CSS can
 * show the right affordances without any JS branching in the UI layer.
 *
 * ## Categories and filters — the reference's design, `Inputs.js:183-236`
 *
 * Every action declares the **categories** it belongs to. `filters` holds the
 * categories currently allowed, and a keydown only reaches an action if the two
 * sets intersect. `Game.setMode` owns the filters; there is exactly one category
 * live at a time today, and it is a set rather than a string because that is
 * what lets one arrive before another leaves if two modes ever overlap.
 *
 * This replaces a single `suppressed` boolean, and the thing that makes it more
 * than the boolean wearing a coat is that **`close` survives the card filter
 * while everything else is blocked by it**. A boolean can only say "all" or
 * "none"; Escape has to work while a card is open and must not reach the car
 * while one is not.
 *
 * **Two of the reference's escape hatches are deliberately not ported.** `checkCategory`
 * returns true when the filter set is empty, and true again when an action has
 * no categories at all — the comment above that second branch says "Forbid" and
 * the code says allow, which is worth knowing before copying it. Both defaults
 * fail *open*: forget a category and the action fires in every mode, including
 * the cinematic. Here an action with no categories throws at module load, and an
 * empty filter set means nothing is allowed, because the safe direction for a
 * missing declaration is off.
 *
 * ## Which half is filtered
 *
 * **Keydown is gated; keyup never is.** The reference's `start()` and `change()` call
 * `checkCategory` and the reference's `end()` does not (`Inputs.js:238-259`), for the same
 * reason `_onBlur` exists: a key held across a mode change would otherwise still
 * be in `down` when control came back, and the throttle would be stuck open with
 * no keyup ever coming.
 */

/**
 * Every action, the keys that reach it, and the modes it is allowed in.
 *
 * A key belongs to exactly one action — the reference's are many-to-many, and we have no
 * case for it. `KEY_TO_ACTION` below is derived, and it throws on a key claimed
 * twice rather than letting the later declaration quietly win.
 *
 * The categories are the four `Game.mode` values. `cinematic` appears on nothing
 * yet, and that is honest rather than an omission: `D` §6.9 puts the cinematic
 * camera in "later, not now", so no action has had to decide whether it survives
 * one. `intro` appears on nothing on purpose — the cinematic is four seconds
 * long, it happens once, and there is nothing in it to press.
 */
const ACTIONS = Object.freeze({
  forward: { keys: ['ArrowUp', 'KeyW'], categories: ['driving'] },
  back: { keys: ['ArrowDown', 'KeyS'], categories: ['driving'] },
  left: { keys: ['ArrowLeft', 'KeyA'], categories: ['driving'] },
  right: { keys: ['ArrowRight', 'KeyD'], categories: ['driving'] },
  /**
   * Space moved from handbrake to jump on Michael's call (2 Sep: "can we
   * add boost and jump real quick") — Space is the jump key in every game
   * a visitor has played, and the handbrake is the rarer verb. Both
   * Shifts drive boost so the left hand can boost from WASD or arrows.
   */
  handbrake: { keys: ['KeyX'], categories: ['driving'] },
  jump: { keys: ['Space'], categories: ['driving'] },
  boost: { keys: ['ShiftLeft', 'ShiftRight'], categories: ['driving'] },
  respawn: { keys: ['KeyR'], categories: ['driving'] },
  interact: { keys: ['KeyE', 'Enter'], categories: ['driving'] },
  /**
   * The one action that is not `driving`, and the reason categories are worth
   * having here at all.
   *
   * Escape used to be a `keydown` listener on the card element, which works
   * exactly as long as focus is inside the panel. Click the scrim behind it —
   * the natural "dismiss" gesture — and focus goes to `<body>`, the listener
   * never fires, and the card cannot be closed with the keyboard at all.
   * Measured on the running build: closes with focus on the close button, does
   * **not** close after a blur. Routed as an action it arrives on `window` like
   * every other key, so where focus happens to be stops mattering.
   *
   * `driving` is deliberately not in this list. Nothing is closable while
   * driving, and declaring a category we cannot honour is how a filter set stops
   * describing the build. The reference's `close` carries five categories because the reference author has
   * modals, menus and two flag pickers to walk through (`ClosingManager.js:15`).
   */
  close: { keys: ['Escape'], categories: ['card'] },
  /**
   * The controls sheet (`core/Controls.js`): opens while driving, closes
   * from the paused `card` mode it puts the game in. Live over a project
   * card too by category, and ignored there by the handler — the card owns
   * that mode.
   */
  controls: { keys: ['KeyH'], categories: ['driving', 'card'] },
  /** The fast-travel map (`core/FastTravel.js`), the reference's `M`: opens while
   *  driving, closes from the paused `card` mode it puts the game in. */
  map: { keys: ['KeyM'], categories: ['driving', 'card'] },
});

/** Key code → action name. Derived, and it refuses a key claimed twice. */
const KEY_TO_ACTION = (() => {
  const map = new Map();
  for (const [name, action] of Object.entries(ACTIONS)) {
    if (!action.categories?.length) {
      throw new Error(`input: action "${name}" declares no categories`);
    }
    for (const code of action.keys) {
      const owner = map.get(code);
      if (owner) throw new Error(`input: key "${code}" is claimed by "${owner}" and "${name}"`);
      map.set(code, name);
    }
  }
  return map;
})();

/**
 * The only keys whose default we actually need to suppress: arrows and space
 * scroll the page.
 *
 * This used to be every mapped key, which was fine until `interact` bound Enter.
 * Swallowing Enter globally breaks activating any real control with the
 * keyboard — the beacon button, the card's close button — so the suppression was
 * narrowed to the keys that need it, and the filter narrows it again: a key
 * whose action is not allowed in the current mode is not ours to swallow. That
 * is what keeps a long card body scrollable with the arrow keys, and it is now a
 * consequence of the categories rather than a second rule beside them.
 */
const SCROLLS_THE_PAGE = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export default class Input extends Events {
  /**
   * @param {object} options
   * @param {Iterable<string>} options.filters the categories allowed at boot.
   *   Required — there is no "empty means everything" default, see the class note.
   */
  constructor({ filters }) {
    super();

    this.down = new Set();
    this.actions = {};
    for (const name of Object.keys(ACTIONS)) this.actions[name] = 0;

    /** @type {Set<string>} the categories currently allowed. `Game.setMode` writes it. */
    this.filters = new Set();
    this.setFilters(filters);

    this.mode = null;
    /**
     * The first mode is guessed from the device rather than waited for: a
     * phone showed "Arrow keys or WASD" until its first tap flipped the
     * class, and the launch sheet is up before that tap. Coarse pointer and
     * no hover is a touch screen; the first key or mouse press corrects it.
     */
    this._setMode(Input.prefersTouch() ? 'touch' : 'keyboard');

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onPointer = this._onPointer.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('pointerdown', this._onPointer, { passive: true });
  }

  /**
   * Replace the allowed categories wholesale.
   *
   * The reference's `filters` is an `ObservableSet` with `add`/`delete`/`clear`, because 13
   * areas mutate it one category at a time. Every transition in the reference's code is a
   * wholesale swap even so — `clear()` then `add()`, or a matched
   * `delete`/`add` pair — so this is that shape with the bookkeeping removed.
   * The `input-filter-*` classes are the reference's (`Inputs.js:23-40`): nothing styles
   * them yet, and they are the hook a touch-affordance layer will hang off.
   *
   * @param {Iterable<string>} categories
   */
  setFilters(categories) {
    const next = new Set(categories);
    const root = document.documentElement;
    for (const previous of this.filters) {
      if (!next.has(previous)) root.classList.remove(`input-filter-${previous}`);
    }
    for (const category of next) root.classList.add(`input-filter-${category}`);
    this.filters = next;
  }

  /** Is this action allowed under the current filters? */
  allows(name) {
    const action = ACTIONS[name];
    if (!action) return false;
    for (const category of action.categories) {
      if (this.filters.has(category)) return true;
    }
    return false;
  }

  /** Is this a touch screen with no mouse? Read once; the events refine it. */
  static prefersTouch() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  /**
   * The touch surfaces' way in — the stick (`TouchStick`) and the buttons
   * (`TouchPad`) write the same `actions` the keys do, through the same
   * filter and the same edge events, so nothing downstream knows which it
   * was. `value` may be fractional: the stick is analog and `Car.control`
   * scales by it; a key is 1.
   *
   * Filtered like a keydown (a stick held across a mode change is silenced
   * by the filter until it is lifted, and `_onBlur` has already zeroed it),
   * and the falling edge is never filtered, like a keyup.
   */
  set(name, value) {
    if (!(name in this.actions)) throw new Error(`input: no action "${name}"`);
    if (value === 0) {
      this._end(name);
      return;
    }
    if (!this.allows(name)) return;
    const was = this.actions[name];
    this.actions[name] = value;
    if (was === 0) this.emit('action', name, value);
  }

  _setMode(mode) {
    if (this.mode === mode) return;
    const root = document.documentElement;
    if (this.mode) root.classList.remove(`input-${this.mode}`);
    this.mode = mode;
    root.classList.add(`input-${mode}`);
    this.emit('mode', mode);
  }

  _onPointer(event) {
    this._setMode(event.pointerType === 'touch' ? 'touch' : 'pointer');
  }

  _onKeyDown(event) {
    const action = KEY_TO_ACTION.get(event.code);
    if (!action || !this.allows(action)) return;
    if (SCROLLS_THE_PAGE.has(event.code)) event.preventDefault();
    this._setMode('keyboard');
    if (this.down.has(event.code)) return;
    this.down.add(event.code);
    this.actions[action] = 1;
    this.emit('action', action, 1);
  }

  /**
   * Never filtered. See the class note: a key held across a mode change has to
   * be able to end, or it is stuck on with no keyup ever coming.
   */
  _onKeyUp(event) {
    const action = KEY_TO_ACTION.get(event.code);
    if (!action) return;
    this.down.delete(event.code);
    // Another bound key may still be held for the same action.
    for (const code of ACTIONS[action].keys) {
      if (this.down.has(code)) return;
    }
    this._end(action);
  }

  /**
   * Alt-tabbing away while accelerating must not leave the throttle stuck on —
   * and neither must switching modes, which is why `Game.setMode` calls this.
   *
   * The ends are **emitted**, not just zeroed. The reference's blur path runs every pressed
   * key back through `end()` and fires `actionEnd` for each
   * (`Inputs/Keyboard.js:12-18`); ours used to zero the values silently, which
   * every consumer today survives only because all of them ignore the falling
   * edge. That was a property of the current consumers rather than of the design.
   */
  _onBlur() {
    this.down.clear();
    for (const name of Object.keys(this.actions)) this._end(name);
  }

  /** Fall to 0 and say so, once. A 0 → 0 transition is not an event. */
  _end(name) {
    if (this.actions[name] === 0) return;
    this.actions[name] = 0;
    this.emit('action', name, 0);
  }

  /** -1 (left) .. 1 (right) */
  get steer() {
    return this.actions.right - this.actions.left;
  }

  /** -1 (reverse) .. 1 (forward) */
  get drive() {
    return this.actions.forward - this.actions.back;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('pointerdown', this._onPointer);
    this.clear();
  }
}
