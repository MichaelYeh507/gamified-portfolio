import * as THREE from 'three/webgpu';
import { COLOR, PALETTE } from '../render/palette.js';
import { SIZE, SAMPLES, HALF, CELL, WATER_SURFACE } from '../world/Terrain.js';

/**
 * The fast-travel map — the reference's `Map.js` and the reference's map modal, in our vocabulary
 * (2 Sep, the deferred wayfinding item, gated on the roads surviving
 * Michael's drive; they did).
 *
 * The reference's: a modal over a painted top-down image (`map-day.webp` /
 * `map-night.webp`), a pin per respawn placed at `world / terrain.size +
 * 0.5`, a player marker rotated by the car's heading and moved on the tick
 * while the modal is open, click a pin to respawn there, `M` to toggle.
 *
 * Ours keeps that shape with two differences. **The image is drawn from
 * the island's own data**: the terrain texture (height, cover, paving) is
 * the map, painted texel by texel into a canvas with the palette's
 * colours — so a road that moves or a district that grows repaints its own
 * map, and nothing has to be painted by hand. **And the map is turned to
 * the screen**: the camera is fixed at 45° (decision 16), so a
 * world-aligned map would read rotated against what the visitor sees; ours
 * puts up-screen at the top, which makes "the plaza is up and to the right"
 * true on the map and in the world at once.
 *
 * Travelling is `Areas.goTo` under the veil — the same cover the stuck
 * recovery uses, so a jump across the island is a blink and not a snap.
 *
 * **Centred and paused, like the reference's.** It lived as a top-right corner panel
 * for a few minutes on 2 Sep — a misread of Michael's note about the
 * *instructions* — and went back to the middle on Michael's word: "i want the
 * users to feel like they can click on the map and teleport, so that
 * should be centered and opened." The car pauses through `setMode('card')`,
 * the same string a project card uses, so Escape closes it for free; `M`,
 * its button and the ✕ close it too.
 */

/** Canvas pixels per side, and the world span the square shows. */
const PIXELS = 360;
const SPAN = SIZE;
const SQ = Math.SQRT1_2;

/** What each district is called on the map. Ids are `content/areas.js`. */
const NAMES = { landing: 'Start', projects: 'Projects', career: 'Career', contact: 'Contact' };

/** World XZ → map UV (0..1), up-screen at the top. */
export function worldToMap(x, z) {
  return {
    u: 0.5 + ((x - z) * SQ) / SPAN,
    v: 0.5 + ((x + z) * SQ) / SPAN,
  };
}

/** Map UV → world XZ. */
export function mapToWorld(u, v) {
  const rx = (u - 0.5) * SPAN;
  const ry = (v - 0.5) * SPAN;
  return { x: (rx + ry) * SQ, z: (ry - rx) * SQ };
}

export default class FastTravel {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('map');
    this.button = document.getElementById('map-button');
    this.isOpen = false;
    this._pinsBuilt = false;
    this._forward = new THREE.Vector3();
    this._lastPlayer = { x: NaN, z: NaN, yaw: NaN };

    if (!this.panel || !this.button) return;

    this.canvas = this.panel.querySelector('.map__texture');
    this.field = this.panel.querySelector('.map__field');
    this.player = this.panel.querySelector('.map__player');

    this.button.hidden = false;
    this.button.addEventListener('click', () => this.toggle());
    this.panel.querySelector('.map__close')?.addEventListener('click', () => this.close());

    game.input.on('action', (name, value) => {
      if (!value) return;
      if (name === 'map') {
        if (game.card?.isOpen || game.controls?.isOpen) return;
        this.toggle();
      } else if (name === 'close' && this.isOpen) {
        this.close();
      }
    });

    game.ticker.on('tick', () => this.update(), 60);
  }

  /**
   * Paint the island from its own data. Per map pixel: invert to world,
   * sample the terrain texture (nearest texel — the map is small), colour
   * by the same rules the ground is coloured with.
   */
  _paint() {
    const { terrain } = this.game;
    const data = terrain.texture().image.data;
    const ctx = this.canvas.getContext('2d');
    this.canvas.width = PIXELS;
    this.canvas.height = PIXELS;
    const image = ctx.createImageData(PIXELS, PIXELS);
    const px = image.data;

    const rgb = (index) => {
      const c = new THREE.Color(PALETTE[index]);
      return [c.r * 255, c.g * 255, c.b * 255];
    };
    const deep = rgb(COLOR.water);
    const shallow = rgb(COLOR.accentCool);
    const sand = rgb(COLOR.sand);
    const grass = rgb(COLOR.grass);
    const paved = rgb(COLOR.buildingMid);
    const voidColour = [5, 7, 12];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    for (let j = 0; j < PIXELS; j++) {
      for (let i = 0; i < PIXELS; i++) {
        const { x, z } = mapToWorld((i + 0.5) / PIXELS, (j + 0.5) / PIXELS);
        let colour = voidColour;
        if (Math.abs(x) < HALF && Math.abs(z) < HALF) {
          const ix = Math.min(SAMPLES - 1, Math.max(0, Math.round((x + HALF) / CELL)));
          const iz = Math.min(SAMPLES - 1, Math.max(0, Math.round((z + HALF) / CELL)));
          const at = (iz * SAMPLES + ix) * 4;
          const h = data[at];
          const cover = data[at + 1];
          const slab = data[at + 3];
          const depth = WATER_SURFACE - h;
          if (depth > 0.05) {
            colour = mix(shallow, deep, Math.min(1, Math.max(0, (depth - 0.05) / 0.9)));
          } else {
            colour = mix(sand, grass, cover);
            colour = mix(colour, paved, slab);
          }
        }
        const o = (j * PIXELS + i) * 4;
        px[o] = colour[0];
        px[o + 1] = colour[1];
        px[o + 2] = colour[2];
        px[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  /** One pin per district with a spawn, at its spawn, named. */
  _buildPins() {
    this._pinsBuilt = true;
    for (const area of this.game.areas.items.values()) {
      // `Area.spawn` is always an [x, z]: the def's spawn, else its centre.
      const spawn = area.spawn;
      if (!spawn) continue;
      const { u, v } = worldToMap(spawn[0], spawn[1]);

      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'map__pin';
      pin.style.left = `${(u * 100).toFixed(2)}%`;
      pin.style.top = `${(v * 100).toFixed(2)}%`;
      pin.innerHTML = `<span class="map__dot"></span><span class="map__name">${NAMES[area.id] ?? area.id}</span>`;
      pin.addEventListener('click', () => this.travel(area.id));
      this.field.append(pin);
    }
  }

  /** The reference's pin click: respawn there under the veil, close the map. */
  travel(id) {
    const { game } = this;
    this.close();
    game.veil.cover(() => {
      game.areas.goTo(id);
      game.reveal.setCenter?.(game.car.position.x, game.car.position.z);
    });
  }

  open() {
    if (!this.panel || this.isOpen) return;
    if (this.game.mode !== 'driving') return;
    if (!this._pinsBuilt) {
      this._paint();
      this._buildPins();
    }
    this.isOpen = true;
    this._returnFocusTo = document.activeElement;
    this.panel.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.game.setMode('card');
    this._lastPlayer.x = NaN;
    this.update();
  }

  close() {
    if (!this.panel || !this.isOpen) return;
    this.isOpen = false;
    this.panel.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.game.setMode('driving');
    if (this._returnFocusTo?.focus && this._returnFocusTo !== document.body) {
      this._returnFocusTo.focus();
    } else if (this.panel.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    this._returnFocusTo = null;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** The reference's `update()`: the player marker, only while open, only when it moved. */
  update() {
    if (!this.isOpen) return;
    const { car } = this.game;
    const p = car.position;
    this._forward.set(0, 0, 1).applyQuaternion(car.object.quaternion);
    const yaw = Math.atan2(this._forward.x, this._forward.z);
    const x = Math.round(p.x * 2) / 2;
    const z = Math.round(p.z * 2) / 2;
    const last = this._lastPlayer;
    if (x === last.x && z === last.z && Math.abs(yaw - last.yaw) < 0.02) return;
    last.x = x;
    last.z = z;
    last.yaw = yaw;

    const { u, v } = worldToMap(x, z);
    // The car's forward in map space: world (sin, cos) turned with the map.
    const fx = (this._forward.x - this._forward.z) * SQ;
    const fy = (this._forward.x + this._forward.z) * SQ;
    const angle = Math.atan2(fx, -fy);
    this.player.style.left = `${(u * 100).toFixed(2)}%`;
    this.player.style.top = `${(v * 100).toFixed(2)}%`;
    this.player.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  }
}
