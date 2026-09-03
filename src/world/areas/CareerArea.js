import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import Area from './Area.js';
import roles from '../../content/roles.js';
import { COLOR, paint } from '../../render/palette.js';
import { makeTextMaterial } from '../../render/materials.js';
import { makeTextPlate } from '../../render/textPlate.js';
import { WATER_SURFACE } from '../Terrain.js';
import { flagNumber } from '../../core/flags.js';
import YearCounter from './YearCounter.js';
import { standDynamicProp, standFixedProp } from '../props.js';
import {
  AXIS_HEADING,
  LEAD_IN,
  COUNTER_SIDE,
  SHIPPED_UNITS_PER_YEAR,
  QUEUE_SEP,
  COUNTER_TRACK_START,
  counterTrackEnd,
  buildTimeline,
  corridorPlan,
  posAt,
  sOf,
  sideOf,
  slabPlacements,
  slabCenterFor,
  yearsLabel,
} from './careerTimeline.js';

/**
 * The career corridor — decision 24, with the scope Michael raised on 30 Aug:
 * not just the reference's layout but the reference's whole motion package (`D` §4.4, read line by
 * line): slabs that **rise out of the ground and slide alongside the car** for
 * the length of each entry, the **horizontal label wipe** that writes each
 * slab's text on as it stands up, and the **vertex-shader 7-segment year
 * counter** that tracks beside you. One year per world unit; education rides
 * the same axis as work, just earlier along the drive.
 *
 * What is deliberately the reference's and what is deliberately not:
 *
 * **The reference's**: the 1D parameterisation (`delta = sCar − s0`, the whole area runs
 * on one scalar), the slide (`offsetTarget = clamp(delta, 0, size)` — a long
 * job scrolls its slab beside you for its whole span, then parks), the
 * exponential smoothing on elevation and offset, the wipe, the counter
 * technique, the `isUp` edge flag (kept for the stone-slide sound pair when
 * audio lands, decision 29).
 *
 * **Not the reference's**: everything is data-driven from `content/roles.js`. The reference's career
 * content lives in Blender `userData` and a baked label texture — the one
 * thing on the reference's site that needs a re-export to edit, called out as the reference's one
 * mistake in `roles.js`'s header. Ours lays itself out from the dates, draws
 * its labels through `textPlate`, and a new role is prose plus nothing.
 *
 * **No beacon, no card, no input mode** — the area's entire interface is
 * driving through it, which is the point of the corridor over the reference's 1,555-line
 * kiosk. `update()` is position-driven and stateless beyond the animations.
 *
 * ## Siting (west side, up-screen)
 *
 * The corridor runs along −(√½,√½): an avenue receding up the frame, so every
 * slab faces the fixed camera (`FACE_YAW`, the plaza's rule) and faces the car
 * driving toward it. A screen-horizontal corridor was measured against the
 * island first and rejected by it: every east-west strip long enough crosses
 * a channel, the south is decision 3's reserved lobe, and the east belongs to
 * the plaza — `ProjectsArea`'s radius reaches 41.6 once decision 21's eight
 * entries exist, and areas must not overlap. The west band between the trunk
 * river and the north-west inlet holds the full run with dry margins;
 * `_assertDryFlat` re-checks every placement against the real height field on
 * every build, and `tools/check-career.mjs` does the same headlessly so a
 * data edit that outgrows the site fails `npm run check` instead of flooding
 * a slab.
 *
 * `#yearunit=2` stretches the scale live for judging (the shipped value is
 * `UNITS_PER_YEAR`); the corridor, counter and dressing all re-derive.
 */

/** Faces the camera — the plaza's constant, same reasoning (decision 16). */
const FACE_YAW = Math.PI * 0.25;

/**
 * The counter leads the car so the pavement digits read ahead of your
 * position — by more than the smoothing lag eats at full throttle: at
 * 10 u/s the glide trails its target by ~1.1 (speed / SLIDE_RATE), and at
 * 3.5 of lead the car drove onto its own year. 4.6 keeps the row clear of
 * the nose at any speed the buggy reaches.
 */
const COUNTER_LEAD = 4.6;

/**
 * The card — the reference's design, measured out of `areas.glb` after Michael drove the
 * sign-board version and called it (*"the reference author didn't have signs, the reference author had like pop
 * ups from the ground"*). The reference's entries are not boards: the TEXT is the
 * object — planes lying nearly flat (~17° up toward the camera, 0.57 of rise
 * over 2.3 of run in the reference's authored data), floating just above the ground on a
 * tiny buried stone marker, glyphs always-emissive so they read over any
 * ground with nothing behind them. Low text also dissolves the occlusion
 * complaint that boards created: a card ~0.9 high cannot hide the card 2.4
 * behind it.
 */
const CARD = Object.freeze({
  /** Radians up from flat — a touch steeper than the reference's measured 0.3, buying
   *  less foreshortening for the type (screen factor sin(34° + tilt)). */
  tilt: 0.38,
  /** The card plane's bottom edge floats this far above the ground. */
  float: 0.32,
  /** Row-stack budget along the incline. The card's depth footprint plus
   *  its tilt-height is what QUEUE_SEP has to cover. 2.1 → 2.7 on 3 Sep
   *  (Michael, from the live site: "the text for each career item bigger,
   *  its kind of hard to read"): the rows are width-limited AND
   *  budget-limited, and at 2.1 a full slab (org + title + line + years,
   *  two of them wrapped) was already scaled to ~0.8 of its asked sizes,
   *  so bigger type needed a longer card before it needed bigger numbers.
   *  `careerTimeline.QUEUE_SEP` grew with it. */
  length: 2.7,
});

/** The reference's marker: a small stone at the card's head, mostly buried at rest. */
const MARKER = Object.freeze({ post: 0.3, height: 0.85 });

/** Where a sunken assembly rests: everything under the flat ground. */
const DOWN_Y = -2.6;

/**
 * Rise as the car reaches the entry; sink after it ends — every entry now,
 * current ones included (Michael, on the first drive of the pop-up build:
 * the standing cards "aren't going back into the ground at all"; the reference's
 * `hasEnd` nuance lost to that reading).
 */
const RISE_AHEAD = 3.5;
const SINK_BEHIND = 1.5;
/**
 * A card that rose stays up at least this long, whatever the car does. The
 * fix for "the high school one is disappearing too fast": distance windows
 * scale with car speed, so a short entry crossed at full throttle was up
 * for a blink. Time doesn't scale — the pop is guaranteed readable.
 */
const MIN_UP_SECONDS = 2.6;
/** Wandering off the road drops the stones back into the ground. */
const RISE_LATERAL = 10;

/** Exponential smoothing rates (1/s). The reference's elevation rate is 3, slide 10;
 *  the rise is quicker than the reference's so the hold timer starts from fully-up. */
const ELEVATION_RATE = 4.5;
const SLIDE_RATE = 9;
/** The wipe crosses a card in this many seconds, constant speed. Quick: at
 *  full throttle the car covers 7 units in 0.7 s, and a half-written card
 *  is what you'd see for most of a pass. */
const WIPE_TIME = 0.45;


/**
 * Break a long string into at most two lines at the space nearest its
 * middle. Two lines at readable size beat one line shrunk to fit — which is
 * what `makeTextTexture` otherwise does, and for a width-limited string the
 * requested fontSize cancels out of the fit entirely.
 */
function wrapLines(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const middle = text.length / 2;
  let best = -1;
  for (let i = text.indexOf(' '); i !== -1; i = text.indexOf(' ', i + 1)) {
    if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
  }
  if (best === -1) return [text];
  return [text.slice(0, best), text.slice(best + 1)];
}

export default class CareerArea extends Area {
  constructor(game, def) {
    super(game, def);

    this.timeline = buildTimeline(roles, {
      unitsPerYear: flagNumber('yearunit', SHIPPED_UNITS_PER_YEAR),
    });
    /** Every ground position the corridor uses — shared with check-career. */
    this.plan = corridorPlan(def.center, this.timeline);
    this.frame = this.plan.frame;

    /**
     * Both radii derive from the data, `ProjectsArea`'s rule: a new role
     * lengthens the district by itself, and a number in `content/areas.js`
     * would be the one that goes stale.
     */
    this.radius = Math.max(18, this.timeline.spanUnits / 2 + LEAD_IN + 10);
    this.buildRadius = this.radius + (def.buildAhead ?? 20);

    /** Where `?at=career` stands you: the lead-in, facing up the years. */
    const spawn = posAt(this.frame, -LEAD_IN, 0);
    this.spawn = [spawn.x, spawn.z];
    this.heading = AXIS_HEADING;

    /** Runtime state per entry, built in `build()`. */
    this.slabs = [];
    this.counter = null;
  }

  build() {
    const startedAt = performance.now();

    for (const warning of this.timeline.warnings) {
      console.warn(`[career] ${warning}`);
    }

    for (const placement of slabPlacements(this.timeline)) this._buildSlab(placement);
    this._buildCounter();
    this._dress();
    this._assertDryFlat();

    console.info(
      `[career] corridor built: ${this.timeline.entries.length} of ${roles.length} roles ` +
        `standing, ${this.timeline.firstYear}–${this.timeline.lastYear} at ` +
        `${this.timeline.unitsPerYear} unit/yr, ${(performance.now() - startedAt).toFixed(2)} ms`
    );
  }

  /**
   * `_buildRoad` lived here from 31 Aug to 2 Sep and died in the texture
   * session: the corridor's lane is now **painted into the terrain texture**
   * (`Terrain.texture()` bares the ground-cover channel along the corridor
   * axis, the same rule the wayfinding routes use), because that is what the reference's
   * roads actually are — grass-free strips in the ground art, not meshes
   * floating over it. The lane's dry-flat sweep in `check-career` still
   * walks the same centreline.
   */

  /**
   * One entry's slab: stone on a plinth, org and title and the one-liner on
   * its face, everything in a group whose position `update()` owns. The group
   * starts sunk; the ground is opaque and flat, so an interred slab simply
   * does not exist on screen until it rises.
   */
  _buildSlab(placement) {
    const { entry, side, width, rest } = placement;
    const group = new THREE.Group();
    group.name = `career:${entry.role.slug}`;
    group.rotation.y = FACE_YAW;

    /**
     * The reference's marker stone at the card's head: a small post, a base, and an
     * amber cap on band 12 so each entry carries a waypoint light at night.
     * Tucked inside the entry's lateral footprint so the dryness sweep's
     * width extremes stay honest.
     */
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
    marker.position.set(-width / 2 + 0.25, 0, -0.9);
    marker.castShadow = true;
    marker.receiveShadow = true;
    group.add(marker);

    /**
     * The card: a tilted sub-group the text rows mount on — nothing behind
     * them. Tilted the reference's ~17° up from flat, floating just off the ground, so
     * from the fixed camera the type reads like a raised plaque.
     */
    const card = new THREE.Group();
    card.rotation.x = -(Math.PI / 2 - CARD.tilt);
    card.position.y = CARD.float;
    group.add(card);

    /** The wipe uniform every plate on this card shares. −0.1 = blank. */
    const wipe = uniform(-0.1);
    const textWidth = width - 0.2;

    /**
     * The rows, sized to be read — the other half of Michael's "can't really
     * read it" call. The old sizes were not the real problem for the long
     * strings: `makeTextTexture` shrinks to fit, and a width-limited string
     * lands at the same tiny size whatever fontSize asks for. So long titles
     * **wrap to two lines** instead of shrinking, and every row that fits
     * gets bigger type. Blocks stack top-down so a slab missing its optional
     * rows breathes instead of leaving holes.
     */
    // Sizes up ~a third on 3 Sep with the longer card (see CARD.length);
    // the title and the one-liner carry the most words, so they gained most.
    const rows = [
      { lines: wrapLines(entry.role.org, 20), fontSize: 0.58, color: COLOR.white },
      entry.role.title
        ? { lines: wrapLines(entry.role.title, 20), fontSize: 0.4, color: COLOR.white }
        : null,
      entry.role.line
        ? { lines: wrapLines(entry.role.line, 24), fontSize: 0.3, color: COLOR.white }
        : null,
      { lines: [yearsLabel(entry)], fontSize: 0.32, color: COLOR.amber },
    ].filter(Boolean);

    /**
     * Fit along the incline by scaling rather than clipping: a card whose
     * org and line both wrap carries more lines than the budget holds, and
     * an earlier stack pushed the years row clean off the stone this once
     * was. Everything scales down together so the hierarchy survives.
     *
     * The rows are **always-emissive** — the reference's exact text treatment
     * (`emissive` in `makeTextMaterial`, the reference's 1.7 softened a touch): glyphs
     * that carry their own light read over grass by day and bloom at night,
     * which is the whole reason the reference's corridor needs no boards.
     */
    const gap = 0.08;
    const budget = CARD.length;
    const heightOf = (row, scale) => row.lines.length * row.fontSize * scale * 1.18 + 0.06;
    const total =
      rows.reduce((sum, row) => sum + heightOf(row, 1), 0) + gap * (rows.length - 1);
    const fit = Math.min(1, (budget - gap * (rows.length - 1)) / (total - gap * (rows.length - 1)));

    let yTop = budget;
    for (const row of rows) {
      row.fontSize *= fit;
      const plateHeight = heightOf(row, 1);
      const plate = makeTextPlate({
        text: row.lines,
        width: textWidth,
        height: plateHeight,
        fontSize: row.fontSize,
        lineHeight: row.fontSize * 1.12,
        bold: true,
        material: (map) =>
          makeTextMaterial({
            map,
            colorIndex: row.color,
            reveal: this.game.reveal,
            lighting: this.game.lighting,
            sky: this.game.sky,
            emissive: 1.5,
            wipe,
          }),
      });
      plate.position.set(0, yTop - plateHeight / 2, 0);
      /**
       * Drawn over everything (Michael, 3 Sep, from the live site: "the text
       * in my career section should be above all models, right now some is
       * under post / lamp"): the streetlight at the corridor's head and a
       * neighbouring slab's marker stone stood between the camera and the
       * top rows of a card. No depth test, and a render order above the
       * leaves (2) and the water (1) — the same treatment the speed lines
       * get, for the same reason: type is read, not occluded.
       */
      plate.material.depthTest = false;
      plate.renderOrder = 5;
      card.add(plate);
      yTop -= plateHeight + gap;
    }

    group.visible = false; // until first update positions it
    this.group.add(group);

    this.slabs.push({
      entry,
      width,
      group,
      wipe,
      /** Which side of the road: education −, work + (careerTimeline.laneFor). */
      side,
      elevation: DOWN_Y,
      /** The pop's time floor: armed on each rise (see MIN_UP_SECONDS). */
      holdUntil: 0,
      /** The queued rest position, so the first frame already honours the lane. */
      sCenter: rest,
      /** The edge flag the stone-slide sounds will key off (decision 29). */
      isUp: false,
    });
  }

  _buildCounter() {
    this.counter = new YearCounter();
    this.counter.group.rotation.y = FACE_YAW;
    this._counterEnd = counterTrackEnd(this.timeline);
    this.counterS = COUNTER_TRACK_START;
    this.counter.setYear(this.timeline.firstYear);
    this._placeCounter(this.counterS);
    this.group.add(this.counter.group);
  }

  _placeCounter(s) {
    const at = posAt(this.frame, s, COUNTER_SIDE);
    this.counter.group.position.set(at.x, this.groundAt(at.x, at.z), at.z);
  }

  /**
   * The medieval dressing — fence, cart, barrels, streetlights — through the
   * same road every found asset travels: registry-swapped materials, and
   * since 2 Sep **bodies**: the streetlights fixed (their GLB carries the
   * collider), the cart and barrels the reference's knockable dynamic props
   * (`world/props.js` — mass 0.1, born asleep, exactly `Fences.js`), and
   * **the fence fixed since 3 Sep** — the reference's fences topple, ours held for one
   * day and Michael sent it back from the live site ("make the fences in my
   * career section not movable"): a lane edge that falls over on the first
   * brush stops being an edge. Until 2 Sep they were visuals the car drove
   * through, which is a set, not a place. Positions are corridor
   * coordinates, so `#yearunit=` moves the furniture with the years.
   */
  _dress() {
    const props = this.game.props;
    if (!props) return;
    const { fence, lights, cart, barrels } = this.plan;

    // Streetlights flank the two ends, road-left with the counter. Emissive
    // glass — the corridor lights itself at night through `render/Night.js`.
    for (const at of lights) this._placeBody(props.streetlight, at, FACE_YAW);

    // The fence runs behind the slab line, against the river bank: the
    // corridor reads as a lane, not a row of stones in a field. Each panel
    // is its own fixed body — a wall the car bounces off, not a prop it
    // scatters (the panels still stand end to end, `check-career`).
    for (const at of fence) standFixedProp(this.game, props.fence, { x: at.x, z: at.z, rotationY: Math.PI * 0.75 });

    // A cart and barrels make the lead-in an arrival rather than a road that
    // starts from nothing.
    // Parallel to the lane (its long axis is z; the fence's is x, hence the
    // quarter turn) — the old +0.35 tilt swung a corner into the fence line.
    this._placeDynamic(props.cart, cart, Math.PI * 1.25);
    this._placeDynamic(props.barrel, barrels[0], 0);
    this._placeDynamic(props.barrel, barrels[1], 1.1);
  }

  /** A found prop as a knockable body, the reference's dressing description. */
  _placeDynamic(model, at, rotationY) {
    standDynamicProp(this.game, model, { x: at.x, z: at.z, rotationY });
  }

  /**
   * A found prop whose GLB carries physics words — the lamp-post pattern
   * exactly: the words live on the scene's first child, so that is what gets
   * cloned and parsed. Cloning the whole scene instead hands `parseModel` a
   * wordless `Scene` node, no body is built, and the placement in the
   * physical description is silently ignored — the prop stands at the GLB's
   * own origin, which is how the first streetlights ended up at [0, 0].
   */
  _placeBody(model, at, rotationY) {
    if (!model?.children?.length) return;
    this.game.objects.addFromModel(model.children[0].clone(true), {}, {
      position: [at.x, this.groundAt(at.x, at.z), at.z],
      rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
    });
  }

  /**
   * The whole mechanic, per frame, exactly `D` §4.4's shape: one scalar for
   * the car, one delta per slab, targets, and smoothing. Runs only while the
   * car is inside the area's radius — outside it every stone holds its pose,
   * which for anything you can see from that far away means "down".
   */
  update(delta, elapsed) {
    const car = this.game.car.position;
    const sCar = sOf(this.frame, car.x, car.z);
    const lateral = Math.abs(sideOf(this.frame, car.x, car.z));
    const onRoad = lateral < RISE_LATERAL;

    const elevationBlend = 1 - Math.exp(-ELEVATION_RATE * delta);
    const slideBlend = 1 - Math.exp(-SLIDE_RATE * delta);

    /**
     * The same-lane queue, per frame: a slab may never target a spot inside
     * the slab before it on its own lane. Concurrent entries (both CMU
     * majors run to now) would otherwise ride to the same s and stand inside
     * each other; with the clamp they ride in file, the newer chapter ahead.
     * The clamp reads the predecessor's *smoothed* centre, so the file moves
     * as a soft chain rather than a rigid train. Slabs are in date order —
     * `buildTimeline` sorts — which is what makes one pass enough.
     */
    const lastInLane = new Map();

    for (const slab of this.slabs) {
      const { entry, width } = slab;
      const progress = sCar - entry.s0;
      const inRange =
        onRoad && progress > -RISE_AHEAD && progress < entry.size + SINK_BEHIND;

      /**
       * Pop up in range, sink after — with a **time floor**: entering the
       * range arms a hold, and the card may not sink until it expires. The
       * distance window alone made visibility a function of car speed, and
       * the high-school card (2.3 units of segment at ~10 u/s) was gone
       * before it could be read. Every entry sinks now, current ones too —
       * the reference's `hasEnd` exception was cut on Michael's drive.
       */
      if (inRange && !slab.isUp) slab.holdUntil = elapsed + MIN_UP_SECONDS;
      const up = inRange || elapsed < slab.holdUntil;
      const targetY = up ? 0 : DOWN_Y;
      slab.elevation += (targetY - slab.elevation) * elevationBlend;

      // The slide: the slab rides beside you for the length of its entry,
      // then parks at the far end. Smoothed separately, the reference's `:334/:352` pair.
      let targetCenter = entry.s0 + slabCenterFor(progress, entry.size, width);
      const prev = lastInLane.get(slab.side);
      if (prev) {
        targetCenter = Math.max(targetCenter, prev.sCenter + QUEUE_SEP);
      }
      lastInLane.set(slab.side, slab);
      slab.sCenter += (targetCenter - slab.sCenter) * slideBlend;

      // The label wipe: constant speed, writing on as the card rises and
      // wiping off as it sinks — the reference's gsap pair (`:281`, `:291`). A card
      // that stays standing keeps its text, unlike the reference's (`:291` wipes even
      // standing stones); inscriptions on a permanent stone should stay.
      const wipeTarget = up && slab.elevation > DOWN_Y * 0.25 ? 1.1 : -0.1;
      const step = delta / WIPE_TIME;
      const diff = wipeTarget - slab.wipe.value;
      slab.wipe.value += Math.max(-step, Math.min(step, diff));

      // The edge flag — this is where the stone-slide sound pair fires when
      // decision 29 lands ("in" delayed 0.3 s, the reference's `:313`).
      if (inRange !== slab.isUp) slab.isUp = inRange;

      const at = posAt(this.frame, slab.sCenter, slab.side);
      const ground = this.groundAt(at.x, at.z);
      slab.group.position.set(at.x, ground + slab.elevation, at.z);
      // Fully sunk and settled: stop drawing it at all.
      slab.group.visible = slab.elevation > DOWN_Y + 0.05;
    }

    // The counter tracks beside you, clamped to the corridor, leading a
    // little; the year it shows is its own position read back through the
    // scale — distance is time. Both ends of the track are pulled clear of
    // the education lane's stable spots: it starts 2.5 before year zero (the
    // display clamps to the first year) so the entrance slab has the band to
    // itself, and it ends past the last left-lane park (`counterTrackEnd`)
    // instead of at `span`, where the AI major's stone parked on top of it.
    const counterTarget = Math.max(
      COUNTER_TRACK_START,
      Math.min(this._counterEnd, sCar + COUNTER_LEAD)
    );
    this.counterS += (counterTarget - this.counterS) * slideBlend;
    this._placeCounter(this.counterS);
    this.counter.setYear(
      this.timeline.firstYear +
        Math.floor(
          Math.max(0, Math.min(this.counterS, this.timeline.spanUnits - 0.001)) /
            this.timeline.unitsPerYear
        )
    );
  }

  /**
   * `?at=career&p=<slug>` stands you at that entry's start, facing up the
   * years — the corridor's version of the plaza's per-board spawn. No
   * `openTarget`: there is nothing to open, the drive is the interface.
   */
  spawnFor(slug) {
    if (!slug) return null;
    const slab = this.slabs.find((s) => s.entry.role.slug === slug);
    if (!slab) {
      console.warn(
        `[career] no role with slug "${slug}"; standing at the corridor start instead. ` +
          `Known: ${this.timeline.entries.map((e) => e.role.slug).join(', ')}`
      );
      return null;
    }
    const at = posAt(this.frame, slab.entry.s0 - 3, 0);
    return { x: at.x, z: at.z, heading: AXIS_HEADING };
  }

  /**
   * Every placement, checked against the ground it actually stands on — the
   * corridor's version of Terrain's channel-routing assertion, and the reason
   * the siting above is a fact rather than a hope. Warns, never throws: a wet
   * fence post should cost a console line, not the area.
   */
  _assertDryFlat() {
    const problems = [];

    for (const point of this.plan.points) {
      const h = this.groundAt(point.x, point.z);
      if (h <= WATER_SURFACE + 0.15) {
        problems.push(
          `wet ${point.what} at s=${point.s} [${point.x.toFixed(1)}, ${point.z.toFixed(1)}] h=${h.toFixed(2)}`
        );
      } else if (Math.abs(h) > 0.05) {
        problems.push(
          `unflat ${point.what} at s=${point.s} [${point.x.toFixed(1)}, ${point.z.toFixed(1)}] h=${h.toFixed(2)}`
        );
      }
    }

    if (problems.length) {
      console.warn(
        `[career] the corridor has outgrown its site (${problems.length} points):\n  ` +
          problems.slice(0, 8).join('\n  ')
      );
    }
  }
}
