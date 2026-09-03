import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLOR, paint } from '../render/palette.js';
import { WATER_SURFACE } from './Terrain.js';
import { wayfindingPlan } from './wayfindingPlan.js';

/**
 * The wayfinding layer: the three sand roads and the four signposts, built
 * from `wayfindingPlan` at boot. World-level rather than an Area on purpose —
 * a signpost's whole job is to be standing there before you know the district
 * exists, so it cannot wait on any area's lazy `buildRadius`.
 *
 * Nothing here is a new vocabulary. The roads are `CareerArea._buildRoad`'s
 * construction (a subdivided plane dropped onto the height field, sand, no
 * cast shadow) run along each route; the signposts are the contact card's
 * stand — marker stone, amber night cap, tilted always-emissive rows —
 * with one row per destination. The posts carry no colliders, like every
 * other marker stone on the island: signage you can drive through, not
 * furniture you can hit.
 */

/** Faces the camera — the plaza's constant, same reasoning (decision 16). */
const FACE_YAW = Math.PI * 0.25;

/** The corridor's marker stone, verbatim: post, base, amber night cap. */
/**
 * Everything below grew by about a third on 2 Sep (Michael: "the direction
 * signs are a little too small, make the caption and model / arrows a bit
 * bigger") — the stone, the rows and the arrows together, so the post
 * keeps its proportions.
 */
const MARKER = Object.freeze({ post: 0.38, height: 1.1 });

/** The contact card's plane: tilt, float, width. Rows stack down the incline. */
const CARD = Object.freeze({ tilt: 0.38, float: 0.36, width: 3.4 });

/** One row: "career" at reading size, amber — signage joins the emissive
 *  layer, so every post is a waypoint light at night alongside its cap. */
const ROW = Object.freeze({ fontSize: 0.45, gap: 0.1 });

/** The row's arrow shape and the slot it turns in at the row's end. */
const ARROW = Object.freeze({
  slot: 0.8,
  length: 0.62,
  shaft: 0.14,
  head: 0.4,
  headLength: 0.24,
  depth: 0.04,
});

export default class Wayfinding {
  constructor(game) {
    this.game = game;
    this.plan = wayfindingPlan();
    this.group = new THREE.Group();
    this.group.name = 'wayfinding';
  }

  build() {
    const startedAt = performance.now();
    for (const post of this.plan.signposts) this._buildPost(post);
    this._assertDryFlat();
    console.info(
      `[wayfinding] ${this.plan.signposts.length} signposts, ` +
        `${(performance.now() - startedAt).toFixed(2)} ms`
    );
    return this.group;
  }

  /**
   * There is no `_buildRoads` any more, and that is the 2 Sep texture
   * session's biggest structural finding: the reference's roads are not meshes, they are
   * **grass-free strips painted into the terrain texture**, and since the
   * terrain now carries the reference's colour system (`makeTerrainAlbedo`), ours are
   * too — `Terrain.texture()` bares the ground-cover channel along every
   * route, curved and feathered, and the gradient's sandy base shows
   * through. The routes still live in `wayfindingPlan` because the fords,
   * the scatter keep-out and the paint all walk the same samples.
   */

  /**
   * One signpost: the contact card's stand with a row per destination — the
   * district's name and, in the slot beside it, an arrow shape turned to
   * the district's actual screen bearing from this post
   * (`wayfindingPlan.screenBearing`).
   */
  _buildPost({ id, at, rows }) {
    const [x, z] = at;
    const group = new THREE.Group();
    group.name = `signpost:${id}`;
    group.rotation.y = FACE_YAW;
    group.position.set(x, this.game.terrain.heightAt(x, z), z);

    const base = new THREE.BoxGeometry(MARKER.post + 0.14, 0.24, MARKER.post + 0.14);
    base.translate(0, 0.12, 0);
    paint(base, COLOR.rockDark);
    const post = new THREE.BoxGeometry(MARKER.post, MARKER.height, MARKER.post);
    post.translate(0, MARKER.height / 2, 0);
    paint(post, COLOR.rock);
    const cap = new THREE.BoxGeometry(MARKER.post + 0.04, 0.09, MARKER.post + 0.04);
    cap.translate(0, MARKER.height + 0.045, 0);
    paint(cap, COLOR.amber);
    const merged = mergeGeometries([base, post, cap], false);
    base.dispose();
    post.dispose();
    cap.dispose();

    const marker = new THREE.Mesh(merged, this.game.contentMaterial);
    marker.position.set(-CARD.width / 2 + 0.3, 0, -1.1);
    marker.castShadow = true;
    marker.receiveShadow = true;
    group.add(marker);

    const card = new THREE.Group();
    card.rotation.x = -(Math.PI / 2 - CARD.tilt);
    card.position.y = CARD.float;
    group.add(card);

    const plateHeight = ROW.fontSize * 1.18 + 0.06;
    const plateWidth = CARD.width - 0.2 - ARROW.slot;
    let yTop = rows.length * plateHeight + (rows.length - 1) * ROW.gap;
    for (const row of rows) {
      const plate = this.game.textPlate({
        text: row.label,
        width: plateWidth,
        height: plateHeight,
        fontSize: ROW.fontSize,
        colorIndex: COLOR.amber,
      });
      const y = yTop - plateHeight / 2;
      plate.position.set(-ARROW.slot / 2, y, 0);
      card.add(plate);

      // The arrow: a shape, turned to the row's exact screen bearing. The
      // card's plane faces the camera (its local Z points at the viewer),
      // so a rotation about local Z IS a rotation on screen.
      const arrow = new THREE.Mesh(this._arrowGeometry(), this.game.contentMaterial);
      // The plate sits `slot/2` left of centre, so the slot's centre is at
      // the plate's half-width.
      arrow.position.set(plateWidth / 2, y, 0.01);
      arrow.rotation.z = row.bearing;
      arrow.castShadow = false;
      arrow.receiveShadow = false;
      card.add(arrow);

      yTop -= plateHeight + ROW.gap;
    }

    this.group.add(group);
  }

  /**
   * One arrow, pointing +X, centred: a shaft into a wide head — the shape a
   * road sign uses, extruded thin and painted amber so it joins the
   * emissive layer at night with its row. Built once and shared.
   *
   * Why a shape and not a glyph (Michael, 2 Sep: "the arrow glyph taste is
   * a little blunt / blend"): the eight glyphs quantised every bearing to
   * 45° and read as typography; a turned shape carries the true bearing
   * and reads as signage. The reference's build has no directional signs at all — the reference's
   * roads are the wayfinding — so this is our vocabulary, kept to the reference's
   * rule that everything in the world is an object.
   */
  _arrowGeometry() {
    if (this._arrow) return this._arrow;
    const { length, shaft, head, headLength, depth } = ARROW;
    const half = length / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -shaft / 2);
    shape.lineTo(half - headLength, -shaft / 2);
    shape.lineTo(half - headLength, -head / 2);
    shape.lineTo(half, 0);
    shape.lineTo(half - headLength, head / 2);
    shape.lineTo(half - headLength, shaft / 2);
    shape.lineTo(-half, shaft / 2);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    paint(geometry, COLOR.amber);
    this._arrow = geometry;
    return geometry;
  }

  /**
   * The house guard, the landing's lesson: warns at boot if a post stands on
   * carved or wet ground. `check-wayfinding` proves the same headlessly; this
   * catches a live world whose data has drifted since the last `npm run check`.
   */
  _assertDryFlat() {
    for (const post of this.plan.signposts) {
      const [x, z] = post.at;
      const h = this.game.terrain.heightAt(x, z);
      if (h <= WATER_SURFACE + 0.15 || Math.abs(h) > 0.05) {
        console.warn(
          `[wayfinding] signpost "${post.id}" stands on carved or wet ground at ` +
            `[${x.toFixed(1)}, ${z.toFixed(1)}] (h=${h.toFixed(2)})`
        );
      }
    }
  }
}
