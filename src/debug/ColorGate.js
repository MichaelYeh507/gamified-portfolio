import { TICK } from '../core/Ticker.js';
import { DAY_PALETTES, PHASES, PHASE_PROGRESS } from '../cycles/palettes.js';

/**
 * The 2a colour gate (decision 45), as a thing you drive rather than a table you
 * read.
 *
 * The point of the gate is that **the call is Michael's and it is not a
 * measurement.** Four candidate palettes against four times of day is sixteen
 * combinations, and the only honest way to compare them is to look at them over
 * the real island, through the real camera, with the real water in frame. So
 * this is deliberately not a screenshot script: it pins a phase and steps
 * candidates live, at whatever the car is looking at, so a palette can be judged
 * while moving as well as parked.
 *
 * `G` then shoots all sixteen and lays them out side by side, which is the
 * written deliverable — but the stepping is the part that decides it.
 *
 * Loaded only behind `#gate`, and it imports nothing into the shipped bundle.
 *
 *   1 2 3 4   pin day / dusk / night / dawn
 *   0         release the pin, back to real time of day
 *   Q E       previous / next candidate palette
 *   G         shoot all sixteen and show the contact sheet
 *   H         hide this panel
 *
 * None of those collide with driving (WASD, arrows, space, R).
 */
export default class ColorGate {
  constructor(game) {
    this.game = game;
    this.day = game.dayCycles;
    this.keys = Object.keys(DAY_PALETTES);
    this.index = this.keys.indexOf(this.day.palette);
    this.phase = null;
    this.shooting = false;

    this._pending = [];
    this._buildHud();
    this._buildSheet();

    // After the render, always. Instrumentation registered ahead of it reads a
    // frame that has not been drawn yet, and a capture taken there is a capture
    // of the previous frame — the exact trap `ROADMAP.md` records from the
    // first driving harness.
    this._offTick = game.ticker.on(
      'tick',
      () => {
        if (!this.shooting) this._render();

        const waiting = this._pending;
        if (waiting.length === 0) return;
        this._pending = [];
        for (const resolve of waiting) resolve();
      },
      TICK.RENDER + 1
    );

    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey);
    this._render();
  }

  /** Resolves after `count` frames have actually been drawn. */
  _afterFrames(count) {
    let chain = Promise.resolve();
    for (let i = 0; i < count; i++) {
      chain = chain.then(() => new Promise((resolve) => this._pending.push(resolve)));
    }
    return chain;
  }

  _onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const phaseIndex = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code);
    if (phaseIndex !== -1) return this.setPhase(PHASES[phaseIndex]);

    switch (event.code) {
      case 'Digit0':
        return this.setPhase(null);
      case 'KeyQ':
        return this.step(-1);
      case 'KeyE':
        return this.step(1);
      case 'KeyG':
        return this.sheet.hidden ? this.shoot() : this._hideSheet();
      case 'KeyH':
        this.hud.style.display = this.hud.style.display === 'none' ? '' : 'none';
        return;
      case 'Escape':
        return this._hideSheet();
      default:
    }
  }

  /** `null` hands the sky back to the clock. */
  setPhase(phase) {
    this.phase = phase;
    if (phase === null) this.day.release();
    else this.day.pin(PHASE_PROGRESS[phase]);
    this._render();
  }

  step(direction) {
    this.index = (this.index + direction + this.keys.length) % this.keys.length;
    this.day.setPalette(this.keys[this.index]);
    this._render();
  }

  /**
   * All sixteen, in one pass.
   *
   * Two frames per combination rather than one: the first frame is the one the
   * new uniforms are written on, and giving it a second means nothing in the
   * shot is ever half a transition. It is also enough for the camera spring to
   * be still, which matters because the sixteen have to be the same photograph.
   */
  async shoot() {
    if (this.shooting) return;
    this.shooting = true;

    const wasPhase = this.phase;
    const wasPalette = this.day.palette;
    const canvas = this.game.renderer.domElement;
    const shots = [];

    try {
      for (const key of this.keys) {
        this.day.setPalette(key);
        for (const phase of PHASES) {
          this.day.pin(PHASE_PROGRESS[phase]);
          await this._afterFrames(2);
          shots.push({ key, phase, url: canvas.toDataURL('image/jpeg', 0.86) });
        }
      }
    } finally {
      this.day.setPalette(wasPalette);
      this.index = this.keys.indexOf(wasPalette);
      this.setPhase(wasPhase);
      this.shooting = false;
    }

    this._showSheet(shots);
  }

  _buildHud() {
    const hud = document.createElement('div');
    hud.id = 'colour-gate';
    hud.style.cssText = `
      position: fixed; left: 16px; bottom: 16px; z-index: 40;
      font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #e8ecf2; background: rgba(5, 7, 12, 0.82);
      border: 1px solid rgba(232, 236, 242, 0.18); border-radius: 6px;
      padding: 10px 14px; pointer-events: none; white-space: pre;
      backdrop-filter: blur(6px);`;
    document.body.appendChild(hud);
    this.hud = hud;
  }

  _buildSheet() {
    const sheet = document.createElement('div');
    sheet.hidden = true;
    sheet.style.cssText = `
      position: fixed; inset: 0; z-index: 50; overflow: auto;
      background: #05070c; padding: 20px;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: #e8ecf2;`;
    document.body.appendChild(sheet);
    this.sheet = sheet;
  }

  _hideSheet() {
    this.sheet.hidden = true;
    this.sheet.replaceChildren();
  }

  _showSheet(shots) {
    const blank = shots.filter((shot) => shot.url.length < 2048);
    const sheet = this.sheet;
    sheet.replaceChildren();

    const heading = document.createElement('p');
    heading.style.cssText = 'margin: 0 0 14px; opacity: 0.75;';
    heading.textContent =
      blank.length > 0
        ? `capture came back empty for ${blank.length}/16 — judge them live with Q/E and 1-4 instead. G or Esc closes this.`
        : 'rows are candidates, columns are day / dusk / night / dawn.  G or Esc closes this.';
    sheet.appendChild(heading);

    const grid = document.createElement('div');
    grid.style.cssText =
      'display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: start;';

    for (const shot of shots) {
      const cell = document.createElement('figure');
      cell.style.cssText = 'margin: 0;';
      const image = document.createElement('img');
      image.src = shot.url;
      image.alt = `${shot.key} ${shot.phase}`;
      image.style.cssText =
        'width: 100%; display: block; border-radius: 3px; border: 1px solid rgba(232,236,242,0.14);';
      const caption = document.createElement('figcaption');
      caption.style.cssText = 'margin-top: 5px; opacity: 0.7;';
      caption.textContent = `${DAY_PALETTES[shot.key].label} · ${shot.phase}`;
      cell.append(image, caption);
      grid.appendChild(cell);
    }

    sheet.appendChild(grid);
    sheet.hidden = false;
  }

  _render() {
    const hex = (color) => '#' + color.getHexString();
    const property = (key) => this.day.properties[key].value;
    const phase = this.phase ?? `live ${this.day.realProgress.toFixed(3)}`;

    this.hud.textContent = [
      `${this.day.paletteLabel}   ${phase}`,
      '',
      `sky      ${hex(property('skyHorizon'))} -> ${hex(property('skyTop'))}`,
      `fog      ${property('fogNear').toFixed(3)} / ${property('fogFar').toFixed(3)}` +
        `  (${this.game.sky.near.value.toFixed(1)} - ${this.game.sky.far.value.toFixed(1)} units)`,
      `light    ${hex(property('lightColor'))} x ${property('lightIntensity').toFixed(2)}`,
      `shadow   ${hex(property('shadowColor'))}`,
      `rim      ${hex(property('rimColor'))} x ${property('rimIntensity').toFixed(2)}`,
      '',
      '1-4 phase   0 live   Q/E palette   G sheet   H hide',
    ].join('\n');
  }

  destroy() {
    window.removeEventListener('keydown', this._onKey);
    this._offTick?.();
    this.hud.remove();
    this.sheet.remove();
  }
}
