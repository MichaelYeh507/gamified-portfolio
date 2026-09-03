import * as THREE from 'three/webgpu';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import Area from './Area.js';
import about from '../../content/about.js';
import { COLOR, paint } from '../../render/palette.js';

/**
 * The landing — where the intro sets you down, and the one place the site
 * introduces itself. Rebuilt 2 Sep to the reference's actual design, measured out of
 * `areas.glb` on Michael's call (*"he had letters of his name he can run
 * over, and thats it"*): the name is **ten physical letters standing on the
 * ground** — the reference's are ~1.45 tall, ~0.94 deep, proportional widths, spanning
 * ~12.4 units, each its own dynamic body (mass 2, the number the reference's own data
 * carries) — that the car plows through and scatters. "MICHAELYEH" is ten
 * letters too, which is the kind of coincidence you take.
 *
 * Under them, ONE sentence on the ground: decision 42's original "drive
 * around my work", kept on Michael's read over the later tagline draft
 * (*"the original like one sentence ... is better"*). That is the whole
 * landing, and — with the about corner removed the same day — the whole
 * of the site's self-introduction, exactly the reference's economy.
 *
 * The letters need `game.letterFont` (helvetiker regular, fetched at boot —
 * the bold cut read as a wall of ink, Michael's "too heavy" call);
 * if the font failed to load the name falls back to the flat ground decal
 * the landing shipped with — a slow CDN must cost the toy, not the name.
 */

/** Toward the camera — the plaza's constant, same reasoning (decision 16). */
const FACE_YAW = Math.PI * 0.25;

/** The one sentence. The reference's landing carries no prose either. Michael's wording,
 *  2 Sep: "change the subheading to drive around my work and career". */
const TAGLINE = 'drive around my work and career';

/**
 * The reference's letters measure ~1.45 tall with ~0.65×height depth — but at the reference's
 * framing. Ours ships at 1.15: at the reference's size the ten-letter line ran 13.5
 * units and clipped the frame edge at LINE_TOWARD's screen width
 * (measured 12.25 between end-letter centres on the running build).
 * The depth keeps the reference's ratio.
 *
 * The mass is 0.6, and the history is three verdicts in one day (2 Sep).
 * The reference's number is 2 (the reference's own userData), and it wedged our bumperless car
 * (Michael: "the car sometimes gets stuck") — so 0.5 for a few hours, then
 * back to 2 once the reference's oversized mass-0 BUMPER landed (`Car.js`), which is
 * what scatters the reference's. Michael then drove the mass-2 letters behind the
 * bumper and called them "too heavy, should be much lighter when hit":
 * the reference's letters are 80 % of the reference's chassis mass, but the reference's car is the reference's and ours
 * carries twice the engine and a 40-speed boost, so a letter that weighs
 * a quarter of the chassis is the one that feels like a letter here.
 */
/**
 * Depth 0.5, down from the reference's 0.65-of-height ratio (0.75 here), and friction
 * 0.1, down from 0.7 — both on Michael's "the car sometimes gets stuck in
 * my names letters during collision" (2 Sep). The wedge is a toppled
 * letter pinned under the chassis: at 0.75 it stood taller than the
 * car's 0.48 underside and at 0.7 it gripped, so the car sat on it. At
 * 0.5 a fallen letter is under the underside, and at 0.1 one that does
 * get under squirts out under throttle instead of holding.
 */
const LETTER = Object.freeze({ size: 1.15, depth: 0.5, gap: 0.13, space: 0.55, mass: 0.6 });
const LETTER_FRICTION = 0.1;

/** Screen-right in world XZ, the shared frame. */
const RIGHT = Object.freeze({ x: Math.SQRT1_2, z: -Math.SQRT1_2 });

/** How far camera-side of the spawn the letter line stands. */
const LINE_TOWARD = 5.2;

export default class LandingArea extends Area {
  build() {
    const name = (about.name || 'Michael Yeh').toUpperCase();

    if (this.game.letterFont) {
      this._buildLetters(name);
    } else {
      // The fallback: the flat decal this landing shipped with.
      this._groundPlate({ text: about.name || 'Michael Yeh', toward: LINE_TOWARD, width: 10, fontSize: 1.45, color: COLOR.white });
    }

    this._groundPlate({ text: TAGLINE, toward: 7.6, width: 8, fontSize: 0.55, color: COLOR.amber });

    this._assertVisible();
  }

  /**
   * The name as bodies. Each glyph is an extruded TextGeometry standing on
   * the ground, facing the camera, asleep on a cuboid of its own bounds —
   * the contact icons' pattern at the reference's letters' numbers. Laid out with
   * proportional widths along the screen-horizontal axis, centred on the
   * camera-side line, so the opening frame reads name-under-car and the
   * first thing a visitor can DO is drive through their host's name.
   */
  _buildLetters(name) {
    const font = this.game.letterFont;

    // Measure every glyph first so the line can be centred.
    const glyphs = [];
    let cursor = 0;
    for (const char of name) {
      if (char === ' ') {
        cursor += LETTER.space;
        continue;
      }
      /**
       * The bevel is the letter's WEIGHT, not a chamfer: helvetiker ships
       * only regular ("too thin", Michael) and bold ("too heavy", also
       * Michael), and `bevelSize` grows the glyph outline outward — a
       * parametric middle weight the font family doesn't have.
       */
      const geometry = new TextGeometry(char, {
        font,
        size: LETTER.size,
        depth: LETTER.depth,
        curveSegments: 4,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.035,
        bevelSegments: 1,
      });
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      const width = bb.max.x - bb.min.x;
      // Centre the glyph on its own origin, base at y 0, depth centred.
      geometry.translate(
        -(bb.min.x + bb.max.x) / 2,
        -bb.min.y,
        -(bb.min.z + bb.max.z) / 2
      );
      paint(geometry, COLOR.white);
      glyphs.push({
        geometry,
        width,
        height: bb.max.y - bb.min.y,
        at: cursor + width / 2,
      });
      cursor += width + LETTER.gap;
    }
    const total = cursor - LETTER.gap;

    const cx = this.center.x + Math.SQRT1_2 * LINE_TOWARD;
    const cz = this.center.z + Math.SQRT1_2 * LINE_TOWARD;
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), FACE_YAW);

    for (const glyph of glyphs) {
      const side = glyph.at - total / 2;
      const x = cx + RIGHT.x * side;
      const z = cz + RIGHT.z * side;
      const ground = this.game.terrain.heightAt(x, z);

      const mesh = new THREE.Mesh(glyph.geometry, this.game.contentMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Body origin at the glyph's centre; the mesh hangs half-height below.
      const model = new THREE.Group();
      mesh.position.y = -glyph.height / 2;
      model.add(mesh);

      this.game.objects.add(
        { model },
        {
          type: 'dynamic',
          position: { x, y: ground + glyph.height / 2 + 0.01, z },
          rotation: yaw,
          mass: LETTER.mass,
          friction: LETTER_FRICTION,
          sleeping: true,
          colliders: [
            {
              shape: 'cuboid',
              parameters: [glyph.width / 2, glyph.height / 2, LETTER.depth / 2],
              category: 'object',
            },
          ],
        }
      );
    }
  }

  /**
   * A text decal lying on the ground, oriented so it reads upright through
   * the fixed camera: the plane is laid flat, then yawed so its local up
   * points away from the viewer along the camera bearing. `toward` is world
   * units from the area centre toward the camera.
   */
  _groundPlate({ text, toward, width, fontSize, color }) {
    const x = this.center.x + Math.SQRT1_2 * toward;
    const z = this.center.z + Math.SQRT1_2 * toward;

    const plate = this.game.textPlate({
      text,
      width,
      height: fontSize * 1.5,
      fontSize,
      colorIndex: color,
    });
    plate.rotation.order = 'YXZ';
    plate.rotation.y = FACE_YAW;
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(x, this.groundAt(x, z) + 0.03, z);
    this.group.add(plate);
    this._plates = this._plates ?? [];
    this._plates.push(plate);
    return plate;
  }

  /**
   * The lesson of the first build, kept as a guard: a decal on ground that
   * is not flat land is a decal in a river. Warns, never throws.
   */
  _assertVisible() {
    for (const plate of this._plates ?? []) {
      const { x, z } = plate.position;
      const h = this.game.terrain.heightAt(x, z);
      if (Math.abs(h) > 0.05) {
        console.warn(
          `[landing] a plate stands on carved or raised ground at ` +
            `[${x.toFixed(1)}, ${z.toFixed(1)}] (h=${h.toFixed(2)}) — it will read wrong or drown`
        );
      }
    }
  }
}
