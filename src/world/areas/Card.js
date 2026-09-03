/**
 * The content layer: real HTML over the canvas.
 *
 * This is where we diverge from the reference author completely, and `D` §6.5 is right that it is
 * the correct call. The reference's projects have no modal at all — the URL is a canvas
 * texture on a mesh and clicking it calls `window.open`
 * (`ProjectsArea.js:942-982`, `:1031-1037`), and every line of prose on the reference's site
 * is drawn into a 2D canvas and uploaded as a texture. That costs the reference author ~600 lines
 * across the slice and buys text that cannot be selected, copied, translated,
 * searched, zoomed, read by a screen reader or indexed by a crawler.
 *
 * Ours is a `<div>`. The browser does wrapping, selection, scrolling, focus,
 * translation and accessibility correctly and for free, and the portfolio's
 * actual words end up in the document where they belong.
 *
 * ## The four things the reference author omits, all present here
 *
 * `role="dialog"` and `aria-modal="true"` on the panel; a **focus trap** so Tab
 * cannot wander onto the page behind it; **focus restoration** back to whatever
 * opened it; and **Escape to close**. The markup carries the first two — see
 * `index.html` — this file carries the trap and the restoration, and Escape is
 * the `close` input action, for the reason in the constructor. `aria-live="polite"` is
 * the fifth item on that list and it belongs to a notifications layer that does
 * not exist yet; there is nothing here to announce.
 *
 * ## Why it lives outside `#ui`
 *
 * The same reason the beacon does: `#ui` is `aria-hidden`, and a focusable
 * control inside an aria-hidden subtree is reachable by Tab and invisible to a
 * screen reader — the worst of both. Everything a visitor is meant to operate is
 * a sibling of that layer, not a child of it.
 *
 * ## What opening one does to the game
 *
 * **One call, `setMode('card')`, and it does three things.** It feeds the car a
 * neutral input so the throttle does not stay open behind the panel; it swaps
 * the input filter, so every key except Escape stops reaching the game and the
 * browser keeps the arrows for scrolling this panel; and it takes down the
 * interact prompt — the one whose button is about to lose focus to the close
 * button. The prompt used to be suppressed from here, beside the `setMode` call.
 * It belongs to the mode, not to the card: see `Game.setMode`.
 *
 * The `has-card` class on `<html>` is the fourth thing and it is currently
 * inert — **nothing in `styles.css` selects it.** The dimming everything else
 * here talks about is `#card::before`, a flat scrim that ships with the panel.
 * The class is left in place as the hook for anything that has to know a card is
 * open without reaching for `game`, but it is not what dims the world.
 */
export default class Card {
  constructor(game) {
    this.game = game;

    this.el = document.getElementById('card');
    this.panelEl = this.el.querySelector('.card__panel');
    this.closeEl = this.el.querySelector('.card__close');
    this.titleEl = this.el.querySelector('.card__title');
    this.subtitleEl = this.el.querySelector('.card__subtitle');
    this.bodyEl = this.el.querySelector('.card__body');
    this.metaEl = this.el.querySelector('.card__meta');
    this.linksEl = this.el.querySelector('.card__links');

    this.isOpen = false;
    /** Whatever had focus before we took it, so it can be handed back. */
    this._returnFocusTo = null;
    this._onClose = null;

    this._onKeyDown = (event) => {
      if (!this.isOpen) return;
      if (event.key === 'Tab') this._trapFocus(event);
    };
    this._onCloseClick = () => this.close();
    /**
     * Escape arrives as an input action rather than through the listener below,
     * and that is a fix rather than a refactor.
     *
     * A keydown listener on the panel only ever sees Escape while focus is
     * inside it. Click the scrim — the natural dismiss gesture — and focus goes
     * to `<body>`, the listener never fires, and the card cannot be closed with
     * the keyboard at all. Measured before the change: closed with focus on the
     * close button, did **not** close after a blur. `close` is the one action in
     * the `card` category, which is the whole reason the input categories are
     * more than the boolean they replaced (`core/Input.js`).
     */
    this._onAction = (name, value) => {
      if (name === 'close' && value) this.close();
    };

    // The trap stays on the element rather than the window: it only has to hold
    // while focus is inside, which is the definition of a focus trap.
    this.el.addEventListener('keydown', this._onKeyDown);
    this.closeEl.addEventListener('click', this._onCloseClick);
    this.game.input.on('action', this._onAction);
  }

  /**
   * @param {object} content
   * @param {string} content.title
   * @param {string} [content.subtitle]
   * @param {string} [content.lead]     the blurb — one line, sets up the body
   * @param {string} [content.body]     real prose; blank lines split paragraphs
   * @param {{url: string, alt: string}[]} [content.images]  the first leads, the
   *   rest follow the prose — the in-world board is dark and angled, so the card
   *   is where a screenshot gets to be actually legible
   * @param {[string, string][]} [content.meta]
   * @param {{label: string, url: string}[]} [content.links]
   * @param {Function} [content.onClose]
   */
  open({ title, subtitle = '', lead = '', body = '', images = [], meta = [], links = [], onClose = null }) {
    // Remember this before anything steals focus, or the beacon button that
    // opened the card is already gone by the time we look.
    if (!this.isOpen) this._returnFocusTo = document.activeElement;
    this._onClose = onClose;

    this._render({ title, subtitle, lead, body, images, meta, links });

    this.el.hidden = false;
    this.isOpen = true;
    document.documentElement.classList.add('has-card');

    // One call: neutral input to the car, the `card` filter on the keyboard, and
    // the interact prompt down. See the note at the top of the file.
    this.game.setMode('card');

    this.closeEl.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.el.hidden = true;
    document.documentElement.classList.remove('has-card');

    this.game.setMode('driving');

    // Only take focus back if we still have it. If the visitor clicked
    // something else in the meantime, yanking focus would be the rude thing.
    const target = this._returnFocusTo;
    this._returnFocusTo = null;
    if (target && this.el.contains(document.activeElement) && target.isConnected) {
      target.focus();
    } else if (this.el.contains(document.activeElement)) {
      document.activeElement.blur();
    }

    const onClose = this._onClose;
    this._onClose = null;
    onClose?.();
  }

  /**
   * Build the panel out of real elements.
   *
   * `textContent` and `createElement` throughout, never `innerHTML`. The content
   * is ours today, but the day a project blurb comes from anywhere else this is
   * the difference between a string and a script tag, and it costs nothing now.
   */
  _render({ title, subtitle, lead, body, images, meta, links }) {
    this.titleEl.textContent = title;

    this.subtitleEl.textContent = subtitle;
    this.subtitleEl.hidden = !subtitle;

    // A real <img>, not a texture: the board out in the world shows the same
    // shot dark, small and at 45°, so the card is where it gets to be legible.
    // The first image leads, above the prose; the rest follow it. `loading` is
    // eager on the lead (it is the first thing the eye lands on) and lazy on
    // the followers, which may be below the fold of a scrolling panel.
    const figure = ({ url, alt }, eager) => {
      const el = document.createElement('figure');
      el.className = 'card__figure';
      const img = document.createElement('img');
      img.src = url;
      img.alt = alt;
      img.loading = eager ? 'eager' : 'lazy';
      img.decoding = 'async';
      el.append(img);
      return el;
    };

    this.bodyEl.replaceChildren();
    if (images.length) this.bodyEl.append(figure(images[0], true));
    if (lead) {
      const p = document.createElement('p');
      p.className = 'card__lead';
      p.textContent = lead;
      this.bodyEl.append(p);
    }
    for (const paragraph of body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      this.bodyEl.append(p);
    }
    for (const image of images.slice(1)) this.bodyEl.append(figure(image, false));
    if (!lead && !body) {
      // A visible hole rather than a plausible one. `content/projects.js` keeps
      // `TODO` markers instead of lorem ipsum precisely because placeholder
      // prose ships; this is the same refusal, rendered.
      const p = document.createElement('p');
      p.className = 'card__unwritten';
      p.textContent = 'Not written yet.';
      this.bodyEl.append(p);
    }

    this.metaEl.replaceChildren();
    for (const [label, value] of meta) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      this.metaEl.append(dt, dd);
    }
    this.metaEl.hidden = meta.length === 0;

    this.linksEl.replaceChildren();
    for (const { label, url } of links) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = url;
      a.textContent = label;
      // Anything leaving the site opens beside it: the world behind this panel
      // is a live WebGPU context and a full page navigation throws it away.
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.append(a);
      this.linksEl.append(li);
    }
    this.linksEl.hidden = links.length === 0;

    // The panel scrolls, and it must start at the top for the next project
    // rather than wherever the last one was left.
    this.panelEl.scrollTop = 0;
  }

  /**
   * Keep Tab inside the panel.
   *
   * The list is recomputed per keypress rather than cached at open: the links
   * change with the project, and a cached list is how a trap ends up pointing at
   * a detached node.
   */
  _trapFocus(event) {
    const focusable = this.el.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !this.el.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  dispose() {
    this.el.removeEventListener('keydown', this._onKeyDown);
    this.closeEl.removeEventListener('click', this._onCloseClick);
    this.game.input.off('action', this._onAction);
  }
}
