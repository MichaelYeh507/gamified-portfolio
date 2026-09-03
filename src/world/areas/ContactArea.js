import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import Area from './Area.js';
import links from '../../content/links.js';
import { COLOR, paint } from '../../render/palette.js';
import { makeTextMaterial } from '../../render/materials.js';
import { makeTextPlate } from '../../render/textPlate.js';
import { WATER_SURFACE } from '../Terrain.js';
import {
  APPROACH_HEADING,
  CONTACT_RADIUS,
  PROMPT_HEIGHT,
  contactPlan,
  displayAddress,
} from './contactArc.js';
import { makeIconGeometry } from './contactIcons.js';
import { standDynamicProp } from '../props.js';

/**
 * The contact arc — the reference's `SocialArea`, measured and then translated into this
 * site's vocabulary. Everything geometric comes from `contactArc.js`, which is
 * where the `areas.glb` measurements live (icon radius 7.85, label points at
 * 6 × y1, the π/7 step); everything content comes from `content/links.js` —
 * add a link there and the arc re-spaces itself, which is the whole point of
 * the reference's `.length` layout (`E` §11.3) and the opposite of the reference's baked icons.
 *
 * What stands where the reference's props stand:
 *
 * **The reference's icons → standing cards.** The reference author has eight modelled logos; we model
 * nothing (decision 47), and this site's found packs hold no logos. The text
 * IS the icon here, the same substitution the corridor made: a tilted
 * always-emissive card on a marker stone, label over address, readable over
 * any ground by day and glowing by night. The reference's icons stand permanently — the
 * pop-up motion belongs to the reference's career area, not this one — so these stand
 * too; the only motion is the label wipe writing the cards on the first time
 * you arrive.
 *
 * **The reference's statue → the bonfire.** The centre of the reference's arc is himself on a
 * pedestal; ours is the medieval pack's bonfire with two log seats — the
 * gathering spot you park at while the prompts offer the links. The flames
 * ride the emissive band, so the contact corner is a point of light on the
 * night island for free.
 *
 * **The reference's interactive points → beacons**, at the reference's exact label geometry, opening
 * `link.url` in a new tab — the reference's `setLinks` handler verbatim, mailto included.
 */

/** Faces the camera — the plaza's constant, same reasoning (decision 16). */
const FACE_YAW = Math.PI * 0.25;

/**
 * The corridor's card, cut to one row. It carried a big white label until the
 * 3D icons landed (Michael's "it can be bigger" drive): with the glyph
 * standing behind it the label was redundant — the reference's design is icon + DOM
 * prompt, no in-world label at all — and worse, the two-row card's top edge
 * leaned up-screen into the pedestal and the white-on-white was illegible.
 * One amber address row at the pedestal's foot reads like a nameplate.
 */
const CARD = Object.freeze({ tilt: 0.38, float: 0.32, width: 2.6, length: 0.62 });

/** The corridor's marker stone, verbatim: post, base, amber night cap. */
const MARKER = Object.freeze({ post: 0.3, height: 0.85 });

/**
 * The icon's pedestal. Not decoration: the glyph and the card are both
 * white, and at ground level the tilted card's text band (top ~0.74) sits
 * inside the glyph's screen extent — white on white, both illegible. The
 * pedestal lifts the glyph's base past the text band, and its fixed collider
 * is what the dynamic icon rests asleep on.
 */
const PEDESTAL = Object.freeze({ height: 0.85, pad: 0.22, depth: 0.55 });

/** The write-on crosses a card in this many seconds (career's WIPE_TIME). */
const WIPE_TIME = 0.45;

export default class ContactArea extends Area {
  constructor(game, def) {
    super(game, def);

    this.plan = contactPlan(def.center, links);
    this.radius = CONTACT_RADIUS;
    this.buildRadius = this.radius + (def.buildAhead ?? 45);
    this.spawn = [this.plan.spawn.x, this.plan.spawn.z];
    this.heading = APPROACH_HEADING;

    /** One shared wipe: the whole arc writes on together, once, on arrival. */
    this.wipe = uniform(-0.1);
  }

  build() {
    const startedAt = performance.now();

    for (const placement of this.plan.cards) this._buildCard(placement);
    for (const placement of this.plan.icons) this._buildIcon(placement);
    this._buildPrompts();
    this._dress();
    this._assertDryFlat();

    console.info(
      `[contact] arc built: ${links.length} links, ` +
        `${(performance.now() - startedAt).toFixed(2)} ms`
    );
  }

  /**
   * One link's stand: the marker stone at its foot and the tilted card
   * floating over it, label over address — the career slab's construction
   * with the corridor's motion stripped out.
   */
  _buildCard({ link, x, z }) {
    const group = new THREE.Group();
    group.name = `contact:${link.slug}`;
    group.rotation.y = FACE_YAW;
    group.position.set(x, this.groundAt(x, z), z);

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
    marker.position.set(-CARD.width / 2 + 0.25, 0, -0.75);
    marker.castShadow = true;
    marker.receiveShadow = true;
    group.add(marker);

    const card = new THREE.Group();
    card.rotation.x = -(Math.PI / 2 - CARD.tilt);
    card.position.y = CARD.float;
    group.add(card);

    const textWidth = CARD.width - 0.2;
    const rows = [
      { text: displayAddress(link.url), fontSize: 0.3, color: COLOR.amber },
    ].filter((row) => row.text);

    const gap = 0.08;
    let yTop = CARD.length;
    for (const row of rows) {
      const plateHeight = row.fontSize * 1.18 + 0.06;
      const plate = makeTextPlate({
        text: row.text,
        width: textWidth,
        height: plateHeight,
        fontSize: row.fontSize,
        bold: true,
        material: (map) =>
          makeTextMaterial({
            map,
            colorIndex: row.color,
            reveal: this.game.reveal,
            lighting: this.game.lighting,
            sky: this.game.sky,
            emissive: 1.5,
            wipe: this.wipe,
          }),
      });
      plate.position.set(0, yTop - plateHeight / 2, 0);
      card.add(plate);
      yTop -= plateHeight + gap;
    }

    this.group.add(group);
  }

  /**
   * One link's 3D logo, standing behind its card as a **dynamic body** — the reference's
   * icons' whole charm is that the car can nudge them, and this is the reference's fans
   * pattern verbatim (`SocialArea.js:111-130`): a manual description through
   * `objects.add`, born asleep, cuboid collider from the glyph's own bounds.
   * The visual parents to the scene because `Objects` writes world-space
   * poses; the mass is light enough to shove and heavy enough not to launch.
   */
  _buildIcon({ link, x, z }) {
    const icon = makeIconGeometry(link.slug);
    if (!icon) return;

    paint(icon.geometry, COLOR.white);
    const mesh = new THREE.Mesh(icon.geometry, this.game.contentMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // The body's origin is the glyph's centre; the geometry's base is y 0,
    // so it hangs half its height below the origin inside the model group.
    const model = new THREE.Group();
    mesh.position.y = -icon.size.y / 2;
    model.add(mesh);

    const ground = this.groundAt(x, z);

    const pedestal = new THREE.BoxGeometry(
      icon.size.x + PEDESTAL.pad * 2,
      PEDESTAL.height,
      PEDESTAL.depth
    );
    pedestal.translate(0, PEDESTAL.height / 2, 0);
    this.addProp(pedestal, {
      color: COLOR.rockDark,
      position: [x, ground, z],
      rotationY: FACE_YAW,
    });
    // The collider separately: `addBox` centres the cuboid on the body, and
    // the prop's origin is the pedestal's base, not its middle.
    this.addBox(
      [(icon.size.x + PEDESTAL.pad * 2) / 2, PEDESTAL.height / 2, PEDESTAL.depth / 2],
      [x, ground + PEDESTAL.height / 2, z],
      FACE_YAW
    );

    this.game.objects.add(
      { model },
      {
        type: 'dynamic',
        position: { x, y: ground + PEDESTAL.height + icon.size.y / 2 + 0.01, z },
        rotation: new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          FACE_YAW
        ),
        mass: 1.2,
        friction: 0.7,
        sleeping: true,
        colliders: [
          {
            shape: 'cuboid',
            parameters: [icon.size.x / 2, icon.size.y / 2, icon.size.z / 2],
            category: 'object',
          },
        ],
      }
    );
  }

  /**
   * The reference's label points, the reference's handler: radius 6 from the centre at y 1, and
   * interacting opens the link in a new tab (`SocialArea.js:47-58`). The
   * beacon manager supplies what the reference's four states supplied — one prompt,
   * nearest wins, only while you are standing in this area.
   */
  _buildPrompts() {
    for (const prompt of this.plan.prompts) {
      this.beacon({
        position: [prompt.x, this.groundAt(prompt.x, prompt.z) + PROMPT_HEIGHT, prompt.z],
        label: prompt.link.label,
        onInteract: () => window.open(prompt.link.url, '_blank'),
      });
    }
  }

  /** The gathering spot: bonfire where the reference's statue stands, log seats facing it. */
  _dress() {
    const props = this.game.props;
    if (!props) return;
    const { fire, logs } = this.plan;

    // logPine seats, not logBirch: the birch bark's white snaps near amber
    // and the whole log glows at night — the haystack rule again. The fire
    // stays put; the log seats are knockable bodies (the reference's dressing
    // description, `world/props.js`) since 2 Sep — a seat you can roll.
    this._placeVisual(props.bonfire, fire, 0);
    standDynamicProp(this.game, props.logPlain, { x: logs[0].x, z: logs[0].z, rotationY: Math.PI * 0.35 });
    standDynamicProp(this.game, props.logPine, { x: logs[1].x, z: logs[1].z, rotationY: -Math.PI * 0.2 });
  }

  /** A found prop with no body — the corridor's `_placeVisual`, same reasons. */
  _placeVisual(model, at, rotationY) {
    if (!model) return;
    const clone = model.clone(true);
    clone.position.set(at.x, this.groundAt(at.x, at.z), at.z);
    clone.rotation.y = rotationY;
    this.game.objects.addFromModel(clone, {}, {});
  }

  /**
   * The arc writes itself on the first time you arrive and never unwrites —
   * one-way like the corridor's `hasRisen`, so leaving mid-write can freeze
   * nothing worse than a card that finishes next visit.
   */
  update(delta) {
    if (this.wipe.value < 1.1) {
      this.wipe.value = Math.min(1.1, this.wipe.value + delta / WIPE_TIME);
    }
  }

  /**
   * `?at=contact&p=<slug>` stands you in front of that link's card, prompt in
   * range — the plaza's per-board spawn, for links.
   */
  spawnFor(slug) {
    if (!slug) return null;
    const card = this.plan.cards.find((c) => c.link.slug === slug);
    if (!card) {
      console.warn(
        `[contact] no link with slug "${slug}"; standing at the fire instead. ` +
          `Known: ${links.map((l) => l.slug).join(', ')}`
      );
      return null;
    }
    return {
      x: card.x + Math.SQRT1_2 * 3.5,
      z: card.z + Math.SQRT1_2 * 3.5,
      heading: APPROACH_HEADING,
    };
  }

  /**
   * Every placement against the ground it stands on — the corridor's
   * assertion, verbatim reasoning: warns, never throws.
   */
  _assertDryFlat() {
    const problems = [];
    for (const point of this.plan.points) {
      const h = this.groundAt(point.x, point.z);
      if (h <= WATER_SURFACE + 0.15) {
        problems.push(
          `wet ${point.what} at [${point.x.toFixed(1)}, ${point.z.toFixed(1)}] h=${h.toFixed(2)}`
        );
      } else if (Math.abs(h) > 0.05) {
        problems.push(
          `unflat ${point.what} at [${point.x.toFixed(1)}, ${point.z.toFixed(1)}] h=${h.toFixed(2)}`
        );
      }
    }
    if (problems.length) {
      console.warn(
        `[contact] the arc has outgrown its site (${problems.length} points):\n  ` +
          problems.slice(0, 8).join('\n  ')
      );
    }
  }
}
