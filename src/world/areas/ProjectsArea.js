import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import Area from './Area.js';
import projects from '../../content/projects.js';
import { COLOR, paint } from '../../render/palette.js';
import { makeImageMaterial, makeTextMaterial } from '../../render/materials.js';
import { makeTextPlate } from '../../render/textPlate.js';
import { ease } from '../../core/tween.js';
import { standDynamicProp, propSize } from '../props.js';
import { staticUrl } from '../../core/staticUrl.js';

/**
 * Where project images live. Filenames only in `content/projects.js` — the
 * prefix is a constant in code, per decision 25's schema rules, so moving the
 * directory never touches the prose. Versioned through `staticUrl` so the
 * host can cache a screenshot as immutable (Phase 6, 3 Sep).
 */
const imageUrl = (file) => staticUrl(`projects/${file}`);

/**
 * The plaza. One monolith per project, laid out from `projects.length`.
 *
 * Decision 20 threw away the reference's carousel, and it is the largest single deletion in
 * the project: the reference's `ProjectsArea.js` is 1,555 lines, of which ~570 are the image
 * carousel and its chrome — pagination, adjacent previews, next/previous
 * bookkeeping, a cross-fade shader, five hand-rolled `status: 'hiding'`
 * animation guards. None of it is here, because **driving is the navigation**.
 * You do not page between projects; you drive to one.
 *
 * ## The one viewing angle, and what it buys
 *
 * Decision 16: theta is 45 degrees and never moves again. The consequence
 * usually treated as the cost of that is the thing that makes this file short.
 *
 * **Every monolith has the same rotation.** `FACE_YAW` is PI/4 for all of them,
 * everywhere on the island, because "facing the camera" is a fixed world
 * direction rather than a per-object lookAt. `D` §6.7's worked example instead
 * writes `rotationY: -angle + Math.PI * 0.5`, aiming each slab at the centre of
 * its own arc — correct under an orbiting camera, and wrong under ours: it would
 * turn the monoliths at the ends of the arc edge-on to the viewer, which is
 * precisely the failure decision 44 chose a recessed slab to avoid.
 *
 * **No monolith can ever occlude another.** Write each one's position in camera
 * axes — `ACROSS` for screen-horizontal, `TO_CAMERA` for depth. A constant
 * angular step on a circle gives `across = -R sin(psi)`, strictly monotonic in
 * `psi` over the range we use, so no two monoliths ever share a line of sight.
 * That is a guarantee out of the geometry, not a placement that happens to work,
 * and it holds for every entry that will ever be added.
 *
 * ## Growing outward
 *
 * Decision 21 sizes the plaza for 8 and starts at 3. The layout therefore keeps
 * a **constant angular step and grows alternately outward from index 0**, so
 * adding a project never moves the ones already there. One visible consequence
 * is worth stating plainly: **index 0 sits dead centre**, so the array's order
 * reads as distance from the middle rather than left to right.
 *
 * Measured on the real height field at `center = [28, 18]`:
 *
 * |                        | 3 entries | 8 entries  |
 * |------------------------|-----------|------------|
 * | screen-horizontal span | 16.5      | 49.3       |
 * | neighbour gaps, across | 8.3, 8.3  | 4.7 … 8.3  |
 * | neighbour gaps, ground | 8.35      | 8.35       |
 * | depth spread           | 1.2       | 16.8       |
 * | furthest from centre   | 12.9      | 27.6       |
 *
 * Those two gap rows are both true and they are not the same number. Centre to
 * centre on the ground the spacing is a constant 8.35 whatever the count, which
 * is what keeps the plaza drivable — 4.55 units of clear ground between 3.80-wide
 * boards, everywhere, forever. *Across the screen* the arc curls the outer ones
 * toward the viewer, so their apparent separation closes to 4.7 by the eighth.
 * The first number decides whether you can drive between two of them; the second
 * decides whether they read as two objects.
 *
 * **The board got wider than the slab it replaced, and that moved the 8-entry
 * limit closer.** 3.80 against 4.7 of screen separation leaves 0.9 of daylight
 * between the outermost pair — they will read as one wall before they overlap.
 * `ARC_STEP` is still the lever, and it is still not worth pulling until five
 * more projects exist.
 *
 * The frame at rest holds **35.1 units across and 17.6 ahead of the car** —
 * derived from the real rig, phi 0.31π, theta 0.25π, 25 degree lens, radius 30,
 * and re-derived independently on 20 Aug to the same two decimals.
 *
 * **The portrait claim that used to sit here was wrong, and it is worth keeping
 * the correction visible. See `KNOWN-ISSUES.md` 23.** It read: *"only 20.9
 * across in portrait, which is the number that actually sizes the arc. Three
 * monoliths at 16.5 fit a phone."* They do not. 20.9 is the frame's width at its
 * **far edge**, which at 3:4 is 24.8 units ahead of the car; the boards stand at
 * `ARC_AHEAD` = 5.5, where the frame is only **15.96** across, and on a 9:19.5
 * phone **12.53**. Against the three boards' 20.34 of extent, the outer two run
 * 39–73 % off screen. Measured on the running build, real geometry through the
 * real camera.
 *
 * Landscape is unaffected and comfortable: the boards span ndc **±0.814** at
 * 16:9 against an edge of 1.0. The gaps leave 5.1 units of clear ground between
 * 3.2-wide slabs, so you can drive between any two of them.
 *
 * **The frame is a trapezoid, not a rectangle**, and that is the whole of the
 * mistake above: it is 17.83 across at the bottom edge and 35.10 at the top. Any
 * "does it fit" question has to be asked at the depth the thing actually stands
 * at. `public/scale-reference.glb` carries the real shape at three aspects.
 *
 * **The known limit is 8**, where the outer gaps close to 4.7 (1.5 units of
 * daylight between slabs) and the bowl gets 16.8 deep against 17.6 of forward
 * view. Reach for `ARC_STEP` first if that ever matters; it will not before five
 * more projects exist.
 */

/**
 * Toward the camera, on the ground.
 *
 * `View` builds its offset with `setFromSphericalCoords(radius, PHI, THETA)`,
 * which puts the eye in the +X +Y +Z octant, so a surface facing the viewer has
 * its normal on this bearing. Fixed for the life of the project (decision 16).
 */
const TO_CAMERA = Object.freeze({ x: Math.SQRT1_2, z: Math.SQRT1_2 });

/** Across the screen. The axis the plaza grows along. */
const ACROSS = Object.freeze({ x: Math.SQRT1_2, z: -Math.SQRT1_2 });

/**
 * The yaw that points a box's +Z face at the camera.
 *
 * A rotation of `a` about Y sends +Z to `(sin a, 0, cos a)`; setting that equal
 * to `TO_CAMERA` gives `a = PI/4`. The same convention `Car.respawn` uses for a
 * heading, one axis apart.
 */
const FACE_YAW = Math.PI * 0.25;

const ARC_RADIUS = 30;
const ARC_STEP = (16 * Math.PI) / 180;

/**
 * How far in front of the standing point the middle monolith sits.
 *
 * **Was 11, and 11 framed nothing.** Measured on the running build: standing on
 * the area's spawn, all three slabs were clipped by the top of the frame — bases
 * at ny 0.78–0.85 against an edge at 1.0, tops at 1.33–1.39. You arrived at the
 * plaza and saw three stubs.
 *
 * The mistake was assuming distance helps. It does the opposite here, and the
 * reason is decision 15: the camera has no vertical follow and no look-ahead, so
 * it is pinned to the car with a fixed offset and the ground runs off the top of
 * the frame quickly. Swept on the running build, ground distance ahead of the
 * car against its screen height:
 *
 * | ahead | 4    | 5    | 6    | 8    | 10   | 11   | 13   | 16   |
 * |-------|------|------|------|------|------|------|------|------|
 * | ny    | 0.46 | 0.53 | 0.59 | 0.70 | 0.80 | 0.85 | 0.94 | 1.07 |
 *
 * **That row is pre-flattening and every number in it is about 0.14 too high.**
 * It was swept when the plaza's ground ran 1.19–1.38; decision 46 put land at
 * exactly 0, and the focus point is pinned to y = 0 in both builds, so the whole
 * plaza dropped down the frame. Re-swept on the flat build, same camera
 * (radius 30, zoom settled), same script:
 *
 * | ahead  | 2    | 4    | 5    | 5.5  | 6    | 8    | 10   | 11   | 13   |
 * |--------|------|------|------|------|------|------|------|------|------|
 * | ground | 0.16 | 0.30 | 0.37 | 0.40 | 0.44 | 0.55 | 0.66 | 0.71 | 0.81 |
 * | base   | 0.21 | 0.35 | 0.42 | 0.45 | 0.48 | 0.60 | 0.71 | 0.76 | 0.85 |
 * | top    | 0.57 | 0.71 | 0.77 | 0.79 | 0.82 | 0.93 | 1.03 | 1.07 | 1.16 |
 *
 * The conclusion the old row was chosen for is unchanged and the flattening made
 * it safer: past about 10 the *top* of the stack leaves the frame, and 5.5 puts
 * the whole composition inside it — ground 0.40, top 0.79 against an edge of
 * 1.0 — with the two wings at 9.3, partly clipped, which is the right arrival
 * picture: the thing in front of you is legible and the others are visibly there
 * to drive to.
 *
 * **The 2 column is the one `ROADMAP` quotes as "base 0.160 / top 0.574".** That
 * is this table's `ground` and `top` at the *beacon standoff*, i.e. standing on
 * the interact point rather than arriving — a different question with a
 * different answer, not a disagreement. Driving closer only ever improves the
 * framing.
 */
const ARC_AHEAD = 5.5;

/** Room to stand between the furthest monolith and the edge of the district. */
const STANDING_ROOM = 14;

/**
 * How far outside `radius` the plaza builds.
 *
 * `D` §6.2 defaults this to 45, which is the *other* half of the 300-unit-world
 * problem `content/areas.js` records: on a 150-unit island, 45 units past a
 * 27-unit radius reaches most of the landmass and lazy building stops being
 * lazy. 20 is derived instead — the nearest monolith is 12.9 from the centre and
 * the frame shows 17.6 ahead, so a build radius of about 47 finishes the plaza
 * roughly 34 units before any of it can be seen.
 *
 * At `[28, 18]` that still covers the spawn, so in practice this plaza builds on
 * the first tick. That is a property of one area on a small island rather than a
 * fault in the gate, and the build logs its own cost so the claim that it does
 * not matter is checkable rather than asserted.
 */
const BUILD_AHEAD = 20;

/**
 * The monolith, in metres — and it is a **wide board on posts**, not the standing
 * slab decision 44 first described.
 *
 * ## Read off the reference's build, not designed from scratch
 *
 * The reference's projects display is authored in Blender, so `ProjectsArea.js` never states
 * its shape — every part arrives through `references.items.get(...)`. The shape
 * is in `static/areas/areas.glb`, and pulling the world AABBs out of its glTF
 * accessors gives the whole composition (the boxes are axis-aligned and the
 * board is rotated ~40°, so the raw extents divide back out by its own axes —
 * 3.06/0.77 and 2.57/0.64 both land on 4.0, which is how we know the width is
 * exact and not inferred):
 *
 * | the reference's element        | true size    | sits at      |
 * |--------------------|--------------|--------------|
 * | image board        | **4.0 × 2.25** | y 0.70 → 2.95 |
 * | thin strip         | 4.0 × 0.2    | y 2.95 → 3.15 |
 * | title plate        | 4.0 × 0.6    | y 3.13 → 3.73 |
 * | the forge around it| 6.94 × 4.29 × 6.29 | y −0.03 → 4.26 |
 *
 * **The reference's readable surface is 16:9 to three decimals** — 4.0 / 2.25 = 1.778, and
 * `setImages` loads 1920 × 1080. That is the one number here that is not a taste
 * call: project screenshots are landscape, and the square recess this file
 * shipped first would have letterboxed every one of them into a third of the
 * space it deserved. It is also landscape and wide where ours was portrait and
 * narrow, it floats clear of the ground rather than standing on it, and its
 * title is a separate plate above the image rather than a plinth below.
 *
 * ## Where we cannot follow the reference author, and why the stack is shorter
 *
 * The reference's whole composition is 3.73 tall, which our camera cannot frame. The reference author gets
 * away with it because pressing interact **cuts to a cinematic camera**
 * (`ProjectsArea.js:1296-1358` → `view.cinematic.start`), so the driving camera
 * never has to hold the kiosk at all. Decision 20 deleted the kiosk pattern and
 * §6.9 puts the cinematic camera in "later, not now" — so here the *driving*
 * camera has to frame the board, and the ceiling measured on our own build is
 * about 3.2 at the far edge of the beacon's range.
 *
 * So the stack is the reference's, compressed: same 16:9 board, same title-above-image
 * order, same floating base, ending at 3.23 instead of 3.73.
 *
 * Two independent confirmations that the ceiling is real rather than ours: the reference's
 * readable image tops out at **2.95**, and the reference's interact point sits **5.9 units
 * in front of the board** — almost exactly the height and the standoff our own
 * sweep landed on before any of this file had been read.
 *
 * Worth knowing for Phase 3: the lever that buys height back is **lowering the
 * ground**, not raising the ceiling. A sunken plaza floor drops the base down
 * the frame and returns every unit of it — and the plaza floor is authored
 * terrain by decision 21, so it is already in the right hands.
 */

/** The image area. 16:9, because that is the shape of a screenshot. */
export const IMAGE = Object.freeze({ width: 3.36, height: 1.89 });
/** Border around the image, which is what makes it a board rather than a plane. */
export const BORDER = 0.22;
/** Depth of the board body, and how far the image is recessed into it. */
export const BOARD = Object.freeze({
  width: IMAGE.width + BORDER * 2, // 3.80
  height: IMAGE.height + BORDER * 2, // 2.33
  depth: 0.22,
  recessDepth: 0.14,
  /** Height of the board's underside above the ground. The reference's is 0.70. */
  base: 0.4,
});
/**
 * The title plate, above the image the way the reference's is.
 *
 * The reference's is 0.6 tall carrying 0.4 type, a ratio of 0.667 which is what
 * `TITLE.fontSize` keeps. Ours is shorter because the whole stack is capped at
 * `TOTAL_HEIGHT`, and the 0.05 that buys the extra plate height comes off
 * `BOARD.base` rather than off the image — the image is the content.
 */
export const TITLE = Object.freeze({ height: 0.45, gap: 0.05, fontSize: 0.3 });
/** The two posts holding it up. */
export const POST = Object.freeze({ size: 0.26, spread: 1.35 });

/** Total height of the composition, ground to the top of the title plate. */
export const TOTAL_HEIGHT = BOARD.base + BOARD.height + TITLE.gap + TITLE.height; // 3.23

/**
 * Where the interact prompt sits, and how close you have to be.
 *
 * These two set the far edge of the zone you are invited to stop in, and that
 * edge has to be somewhere the slab is still legible: standoff plus radius is
 * 6.5 from the slab's centre, and a 3.0 slab is whole out to about 6. `D` §6.7
 * suggests 6 metres "so you can stop roughly and still get it" — with our
 * camera that would let you trigger a monolith from a distance where its top is
 * off screen.
 */
const BEACON_STANDOFF = 2.0;
const BEACON_RADIUS = 4.5;
/**
 * Low, and that is the whole point.
 *
 * Was 1.2, which put the prompt across the middle of the board — the pill is
 * drawn with its *bottom* on the anchor (`translate(-50%, -100%)` in
 * `styles.css`), so it grows upward from here, and at 1.2 it covered the
 * screenshot it was inviting you to look at. 0.25 puts it over the posts and
 * the ground in front, clear of the image area which starts at 0.62.
 *
 * The standoff is left alone rather than pushed further forward, because the
 * same position is also the trigger centre: moving the prompt down the screen
 * that way would drag the far edge of the interact zone out past the distance
 * where the board still frames.
 */
const BEACON_HEIGHT = 0.25;

/**
 * How far the floor sits proud of the terrain, and it is measured rather than
 * nudged until the flicker stopped.
 *
 * Two surfaces have to be cleared, and they are different surfaces. The *drawn*
 * ground interpolates linearly across 1.5-unit triangles built from
 * `terrain.sample()`, while `heightAt` is bilinear over the same grid — worst
 * disagreement over the plaza, sampled: **0.0064**. And the floor's own quads
 * are much coarser than the terrain's, so the ground bulges up to **0.0257**
 * above the plane between four floor vertices. 0.032 total; 0.06 clears it with
 * the margin doubled.
 */
const FLOOR_LIFT = 0.06;
/**
 * Apron of floor beyond the outermost monolith.
 *
 * 4 rather than something rounder: at this centre it puts the floor's edge 3.0
 * units short of the beach, and 7 put it 0.1 units *past* it — a dirt disc
 * running into the sea. The radius is also capped at the area's clearing, which
 * is the ground this area actually owns.
 */
const FLOOR_APRON = 4;

/**
 * The greeting hop — the reference's blackboard (`ProjectsArea.js:1113-1132`, a gsap
 * `y: 0.25, power2.out, 0.7 s` on a loop while the area is open), cut to
 * one hop per approach: a board bounces the first time you come within
 * `radius` of it, re-armed once you are `rearm` further away, and its
 * title writes itself on with that first hop and stays. Landed 2 Sep on
 * Michael's "my project area seems kind of dead" — the boards greet you.
 */
const HOP = Object.freeze({ radius: 8, rearm: 3, height: 0.25, up: 0.3, down: 0.4 });
/** The corridor's label wipe time, so every written label on the island
 *  writes at one speed. */
const WIPE_TIME = 0.6;
/** A crate stack beside each board, screen-right: this far from the board's
 *  centre, on its depth line. Between the stack and the next board stays
 *  drivable (8.35 centre to centre, 3.8 boards, ~0.85 of crates). */
const CRATE_ASIDE = BOARD.width / 2 + 1.3;

/**
 * Where entry `i` sits on the arc, in radians either side of centre.
 *
 * 0, -1, +1, -2, +2, … so the monoliths already standing never move when one is
 * added. Symmetric spacing about the count's midpoint would shift every slab by
 * half a step each time a project was appended.
 */
function psiFor(i) {
  if (i === 0) return 0;
  return (i % 2 === 1 ? -1 : 1) * Math.ceil(i / 2) * ARC_STEP;
}

/**
 * The plaza's world positions, from a centre and a count.
 *
 * Pure — no three.js, no game state — so `Island`'s clearing, the monoliths and
 * any future fast-travel pin are all checked against the same numbers rather
 * than against three copies of them.
 *
 * @param {[number, number]} center world XZ of the standing point
 * @param {number} count
 */
export function plazaLayout(center, count) {
  // The circle's centre: ARC_AHEAD in front of the standing point, then
  // ARC_RADIUS back toward the camera.
  const ox = center[0] + (ARC_RADIUS - ARC_AHEAD) * TO_CAMERA.x;
  const oz = center[1] + (ARC_RADIUS - ARC_AHEAD) * TO_CAMERA.z;

  const points = [];
  for (let i = 0; i < count; i++) {
    const psi = psiFor(i);
    const c = Math.cos(psi);
    const s = Math.sin(psi);
    points.push({
      index: i,
      psi,
      x: ox - ARC_RADIUS * c * TO_CAMERA.x + ARC_RADIUS * s * ACROSS.x,
      z: oz - ARC_RADIUS * c * TO_CAMERA.z + ARC_RADIUS * s * ACROSS.z,
    });
  }
  return points;
}

/**
 * Radius of the plaza's ground disc — the monoliths, plus the apron, capped by
 * the clearing.
 *
 * Exported because `Terrain` sinks a basin under exactly this disc and the two
 * must not be able to disagree: a basin narrower than the floor would leave the
 * outer boards standing on the rim, which is the failure that makes a basin a
 * dish. `_floorGeometry` calls it too, so there is one definition rather than a
 * constant on each side.
 */
export function plazaFloorRadius(def, count) {
  const wanted = plazaReach(def.center, count) + FLOOR_APRON;
  return Math.min(wanted, def.clearing ?? wanted);
}

/** How far the furthest monolith stands from the plaza's centre. */
export function plazaReach(center, count) {
  return plazaLayout(center, count).reduce(
    (max, p) => Math.max(max, Math.hypot(p.x - center[0], p.z - center[1])),
    0
  );
}

export default class ProjectsArea extends Area {
  constructor(game, def) {
    super(game, def);

    this.points = plazaLayout(def.center, projects.length);

    /**
     * Both radii come off the arc rather than out of the def, so a fourth
     * project widens the district by itself. A number in `content/areas.js`
     * would be the one that goes stale the day a project is appended — which
     * decision 22 promises is a 30-minute, code-free job.
     */
    this.radius = plazaReach(def.center, projects.length) + STANDING_ROOM;
    this.buildRadius = this.radius + (def.buildAhead ?? BUILD_AHEAD);

    /** @type {{project: object, x: number, y: number, z: number}[]} */
    this.monoliths = [];
  }

  build() {
    const startedAt = performance.now();

    projects.forEach((project, i) => {
      const point = this.points[i];
      const y = this.groundAt(point.x, point.z);

      /**
       * One group per monolith since 2 Sep, because the boards MOVE now (the
       * greeting hop in `update`) — the merged-across-monoliths construction
       * that stood here was built on "nothing here moves". Local origin on the
       * ground, +Z facing the viewer, every part authored in the heights the
       * tables above quote. Three draws per board (frame, plate, image or
       * panel) plus the title: the same count the merge saved at three
       * projects, and it is the count that lets a board have a pose.
       */
      const group = new THREE.Group();
      group.name = `monolith:${project.slug}`;
      group.rotation.y = FACE_YAW;
      group.position.set(point.x, y, point.z);
      this.group.add(group);

      const part = (geometry, color, { receiveShadow = true } = {}) => {
        paint(geometry, color);
        const mesh = new THREE.Mesh(geometry, this.game.contentMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = receiveShadow;
        group.add(mesh);
        return mesh;
      };
      part(mergeGeometries(this._structureParts(), false), COLOR.buildingLight);
      // The title plate is dark and its type is near-white, rather than the
      // other way round: the day cycle runs the light down at night, and
      // light-on-dark holds its contrast as the level drops.
      part(this._titlePlate(), COLOR.rockDark);

      const wipe = uniform(-0.1);
      group.add(this._titleText(project, wipe));

      // A project with a screenshot gets its own panel and its own material;
      // one without gets the dark plate, which looks deliberate rather than
      // broken. Neither readable surface receives shadows — `KNOWN-ISSUES`
      // 11: prop-on-prop casting is what produces the sawtooth comb, and the
      // recess's palette step from buildingLight to rockDark is darker than
      // any shadow the frame could cast anyway.
      if (project.images.length) group.add(this._imageMesh(project));
      else part(this._imagePanel(), COLOR.rockDark, { receiveShadow: false });

      // One box, ground to the top of the title plate. The board floats, but
      // its underside is at 0.45 and the car stands about 1.2 tall, so "drive
      // underneath it" was never on offer — a single collider is honest about
      // that and cheaper than three.
      this.addBox(
        [BOARD.width / 2, TOTAL_HEIGHT / 2, BOARD.depth / 2],
        [point.x, y + TOTAL_HEIGHT / 2, point.z],
        FACE_YAW
      );

      this.beacon({
        position: [
          point.x + TO_CAMERA.x * BEACON_STANDOFF,
          y + BEACON_HEIGHT,
          point.z + TO_CAMERA.z * BEACON_STANDOFF,
        ],
        // A missing title is left visibly missing. `projects.js` refuses
        // placeholder prose on the grounds that lorem ipsum ships; the same
        // argument holds in the world, and "(untitled)" cannot be mistaken for
        // something somebody wrote. The slug is never shown — decision 25.
        label: project.title || '(untitled)',
        radius: BEACON_RADIUS,
        onInteract: () => this.openProject(project),
      });

      this.monoliths.push({
        project,
        x: point.x,
        y,
        z: point.z,
        group,
        wipe,
        armed: true,
        hopAt: null,
        written: false,
      });
    });

    this.addProp(this._floorGeometry(), { color: COLOR.dirt }).castShadow = false;
    this._dress();

    this._assertFitsClearing();
    this._warnAboutMissingContent();

    console.info(
      `[projects] plaza built: ${projects.length} monoliths, ` +
        `${(performance.now() - startedAt).toFixed(2)} ms`
    );
  }

  /**
   * The posts and the board's frame, in the monolith's own space: origin on the
   * ground, +Z facing the viewer.
   *
   * The frame is four bars standing proud of a back plate — a recess made out of
   * the one primitive that costs nothing. Six boxes with the posts, 72
   * triangles, and every edge lands on a palette texel rather than on a bevel.
   */
  _structureParts() {
    const box = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      return g;
    };

    const bottom = BOARD.base;
    const mid = bottom + BOARD.height / 2;
    const backDepth = BOARD.depth - BOARD.recessDepth;
    const backZ = -BOARD.depth / 2 + backDepth / 2;
    const barZ = BOARD.depth / 2 - BOARD.recessDepth / 2;
    const sideX = IMAGE.width / 2 + BORDER / 2;
    const barY = IMAGE.height / 2 + BORDER / 2;

    return [
      // Posts. They run up past the board's underside so the joint is a solid
      // overlap rather than two faces touching.
      box(POST.size, bottom + 0.12, POST.size, -POST.spread, (bottom + 0.12) / 2, 0),
      box(POST.size, bottom + 0.12, POST.size, POST.spread, (bottom + 0.12) / 2, 0),
      // The board's back plate, and the four bars that make the recess.
      box(BOARD.width, BOARD.height, backDepth, 0, mid, backZ),
      box(BORDER, BOARD.height, BOARD.recessDepth, -sideX, mid, barZ),
      box(BORDER, BOARD.height, BOARD.recessDepth, sideX, mid, barZ),
      box(IMAGE.width, BORDER, BOARD.recessDepth, 0, mid + barY, barZ),
      box(IMAGE.width, BORDER, BOARD.recessDepth, 0, mid - barY, barZ),
    ];
  }

  /**
   * The image area: a thin plate on the floor of the recess, 16:9.
   *
   * Its own geometry because it is its own palette colour, and it is where the
   * project screenshot goes once Phase 3 supplies one — the plate is already the
   * right shape, the right size and in the right plane, so that step is a
   * texture and nothing else.
   */
  _imagePanel() {
    const floorZ = BOARD.depth / 2 - BOARD.recessDepth;
    // 0.04 thick, sunk 0.01 into the back plate. The overlap is the point: a
    // plate sitting exactly on the recess floor would put its back face coplanar
    // with the back plate's front face, and two coplanar DoubleSide faces are a
    // z-fight waiting for the first camera angle that exposes them.
    const g = new THREE.BoxGeometry(IMAGE.width, IMAGE.height, 0.04);
    g.translate(0, BOARD.base + BOARD.height / 2, floorZ + 0.01);
    return g;
  }

  /**
   * The title plate, sitting above the image the way the reference's does.
   *
   * Above rather than below, which is the reference's order and the better one: the title is
   * the thing you read from a distance, and the higher of two stacked bars is
   * the one still on screen when you are close enough for the board to fill the
   * frame. Its own palette colour so it reads as a separate element rather than
   * as more frame — this is the surface a `textPlate` lands on in Phase 3.
   */
  _titlePlate() {
    const bottom = BOARD.base + BOARD.height + TITLE.gap;
    const g = new THREE.BoxGeometry(BOARD.width, TITLE.height, BOARD.depth);
    g.translate(0, bottom + TITLE.height / 2, 0);
    return g;
  }

  /**
   * The project's first screenshot, inset into the recess.
   *
   * A plane rather than a box, sitting on the recess floor where the merged dark
   * panel would otherwise be. The geometry is already 16:9 by construction, and
   * `content/projects.js` crops its images to match, so nothing here has to
   * letterbox or stretch — which is the whole reason the board was rebuilt to
   * the reference's proportions in the first place.
   *
   * Loaded rather than awaited. `build()` runs inside a tick and cannot be
   * async, so the panel appears the frame the image decodes; until then it is
   * the recess's own dark colour, which is exactly the degrade-to-grey the reference's
   * `loadProgress` uniform produces (`ProjectsArea.js:435-507`) for one line
   * instead of seventy.
   */
  _imageMesh(project) {
    const url = imageUrl(project.images[0]);
    const map = new THREE.TextureLoader().load(url, undefined, undefined, () =>
      console.warn(`[projects] could not load "${url}" for ${project.slug}`)
    );
    map.colorSpace = THREE.SRGBColorSpace;
    // The art is pixel art. Nearest keeps it crisp instead of smearing the
    // pixels the source deliberately has, and the recess is small on screen so
    // there is no minification shimmer to trade against.
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.anisotropy = 4;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(IMAGE.width, IMAGE.height),
      makeImageMaterial({
        map,
        reveal: this.game.reveal,
        lighting: this.game.lighting,
        sky: this.game.sky,
      })
    );
    // In the monolith's own frame: on the recess floor, facing local +Z.
    mesh.position.set(0, BOARD.base + BOARD.height / 2, BOARD.depth / 2 - BOARD.recessDepth + 0.02);
    // Same reasoning as the dark panel it replaces: the readable surface must
    // not receive the frame's sawtooth self-shadow (`KNOWN-ISSUES.md` 11).
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  /**
   * The project's name, carved on the title plate.
   *
   * Its own mesh rather than part of the merged plates, and unavoidably so: the
   * text *is* the alpha mask, so two different titles cannot share a material.
   * One extra draw call per project, which is the price of type on a surface and
   * the same price the reference's pays (`ProjectsArea.js:254-292`).
   *
   * `project.title` on one line, not `titleLines`. That field was pre-broken for
   * the portrait slab this board replaced — on a 3.8-wide landscape plate a
   * two-line title would be small and cramped where one line is neither.
   */
  _titleText(project, wipe) {
    const localY = BOARD.base + BOARD.height + TITLE.gap + TITLE.height / 2;
    // Just proud of the plate's front face, in the monolith's own frame.
    const localZ = BOARD.depth / 2 + 0.01;

    // The corridor's material rather than `game.textPlate`, for the `wipe`:
    // the title writes itself on with the board's first greeting hop.
    const plate = makeTextPlate({
      text: project.title || '(untitled)',
      width: BOARD.width,
      height: TITLE.height,
      fontSize: TITLE.fontSize,
      material: (map) =>
        makeTextMaterial({
          map,
          colorIndex: COLOR.white,
          reveal: this.game.reveal,
          lighting: this.game.lighting,
          sky: this.game.sky,
          emissive: 1.5,
          wipe,
        }),
    });
    plate.position.set(0, localY, localZ);
    return plate;
  }

  /**
   * The plaza's dressing, all of it the reference's knockable-body description
   * (`world/props.js`): a stack of three crates beside every board — the
   * "something to hit per project" — and a haystack and two barrels on the
   * rim outside the lamps, camera-side, off the road's arrival (which comes
   * in behind the boards) and off every spot a fourth or fifth board would
   * take. The reference's plaza is ringed with authored props (an oven, an anvil, a
   * grinder); ours is ringed with the pack we have.
   */
  _dress() {
    const props = this.game.props;
    if (!props?.crate) return;
    const crate = propSize(props.crate);
    const half = crate.x / 2 + 0.03;

    for (const m of this.monoliths) {
      const at = (aside, back = 0) => ({
        x: m.x + ACROSS.x * (CRATE_ASIDE + aside) - TO_CAMERA.x * back,
        z: m.z + ACROSS.z * (CRATE_ASIDE + aside) - TO_CAMERA.z * back,
      });
      standDynamicProp(this.game, props.crate, { ...at(-half), rotationY: FACE_YAW });
      standDynamicProp(this.game, props.crate, { ...at(half), rotationY: FACE_YAW });
      standDynamicProp(this.game, props.crate, { ...at(0), rotationY: FACE_YAW, lift: crate.y + 0.02 });
    }

    // The rim: outside the lamps (which stand at ±6 across, +4 toward the
    // camera of the standing point), still on the floor disc.
    const rim = (aside, toward) => ({
      x: this.center.x + ACROSS.x * aside + TO_CAMERA.x * toward,
      z: this.center.z + ACROSS.z * aside + TO_CAMERA.z * toward,
    });
    standDynamicProp(this.game, props.haystack, { ...rim(-9.2, 2.6), rotationY: FACE_YAW + 0.4 });
    standDynamicProp(this.game, props.barrel, { ...rim(9.0, 2.4), rotationY: 0.3 });
    standDynamicProp(this.game, props.barrel, { ...rim(9.9, 3.3), rotationY: 1.1 });
  }

  /**
   * The greeting: a board hops once as you come to it and its title writes
   * on; the hop re-arms when you leave its circle, the title stays. Runs only
   * while the car is inside the area, which is the only time a board is
   * close enough to be greeted.
   */
  update(delta, elapsed) {
    const car = this.game.car.position;
    for (const m of this.monoliths) {
      const d = Math.hypot(car.x - m.x, car.z - m.z);
      if (m.armed && d < HOP.radius) {
        m.armed = false;
        m.hopAt = elapsed;
        m.written = true;
      } else if (!m.armed && d > HOP.radius + HOP.rearm) {
        m.armed = true;
      }

      let lift = 0;
      if (m.hopAt !== null) {
        const t = elapsed - m.hopAt;
        if (t < HOP.up) lift = HOP.height * ease.quadOut(t / HOP.up);
        else if (t < HOP.up + HOP.down) {
          const u = (t - HOP.up) / HOP.down;
          lift = HOP.height * (1 - u * u);
        } else m.hopAt = null;
      }
      m.group.position.y = m.y + lift;

      if (m.written && m.wipe.value < 1.1) {
        m.wipe.value = Math.min(1.1, m.wipe.value + delta / WIPE_TIME);
      }
    }
  }

  /**
   * A stand-in for decision 21's authored plaza floor.
   *
   * Procedural like the rest of the placeholder world, and it follows the height
   * field rather than sitting flat on it — the land runs 0 to 1.5 and a flat
   * disc would bury one edge and float the other. Sized off the arc so it always
   * covers what is actually there, which is decision 21's "author the floor for
   * what is there and let it grow outward" done in code until the real art
   * exists.
   */
  _floorGeometry() {
    const radius = plazaFloorRadius(this.def, projects.length);
    const geometry = new THREE.RingGeometry(0, radius, 56, 8);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(this.center.x, 0, this.center.z);

    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, this.groundAt(position.getX(i), position.getZ(i)) + FLOOR_LIFT);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * The assertion `D` never writes anywhere: say so when the data outgrows the
   * world it was placed in.
   *
   * `content/areas.js` declares a clearing radius that `Island` keeps free of
   * scattered props. Appending a project moves the outermost monolith outward,
   * and the day it steps outside that clearing it will stand inside a tree.
   * Nothing crashes; it just looks wrong, which is the worst kind of failure to
   * find later.
   */
  _assertFitsClearing() {
    const clearing = this.def.clearing;
    if (!clearing) return;
    const reach = plazaReach(this.def.center, projects.length);
    if (reach + BOARD.width / 2 <= clearing) return;
    console.warn(
      `[projects] the plaza has outgrown its clearing: reach ${reach.toFixed(1)} plus ` +
        `half a slab against a clearing of ${clearing}. Raise "clearing" in ` +
        `content/areas.js, or props get scattered into the plaza.`
    );
  }

  /** The prose is the critical path. Name what is missing, every boot. */
  _warnAboutMissingContent() {
    const untitled = projects.filter((p) => !p.title).map((p) => p.slug);
    if (untitled.length) {
      console.warn(`[projects] no title yet, showing "(untitled)": ${untitled.join(', ')}`);
    }
  }

  /**
   * Where `?at=projects&p=<slug>` stands you: in front of that board, on the
   * area spawn's own relationship to the board it faces.
   *
   * **Derived, not chosen.** The area spawn sits `ARC_AHEAD` behind the middle
   * monolith along `TO_CAMERA`, facing it — that is what `plazaLayout` does with
   * the centre, and it is the framing the ahead-distance sweep above settled on.
   * Applying the same offset to any board reproduces it exactly, because the
   * camera offset is a fixed world direction (decision 16, `View._offset` is
   * `setFromSphericalCoords(radius, PHI, THETA)` with no heading term), so the
   * whole configuration — car, board, camera — is a pure translation of the
   * middle one. Measured on the running build, all three boards frame within
   * 0.001 of each other.
   *
   * Two properties fall out of that and both are worth stating because they are
   * checkable rather than hoped for:
   *
   * - **`p=aerial-ascent` is bit-identical to the bare `?at=projects`.** Index 0
   *   sits at `center - ARC_AHEAD * TO_CAMERA`, so adding it back lands on the
   *   centre, and `FACE_YAW - PI` is the `-3PI/4` `content/areas.js` declares.
   *   The heading is written that way round rather than `+ PI` for exactly that
   *   reason: the same rotation, but the same *number*, so the identity holds
   *   through the quaternion too.
   * - **The beacon is already up when you arrive.** `ARC_AHEAD - BEACON_STANDOFF`
   *   is 3.5 against a beacon radius of 4.5, on every board, forever — both are
   *   constants and neither depends on the count.
   */
  spawnFor(slug) {
    if (!slug) return null;

    const monolith = this._monolithFor(slug);
    if (!monolith) {
      // The only place this warns. `openTarget` runs on the same bad slug two
      // seconds later and saying so twice would read as two faults.
      console.warn(
        `[projects] no project with slug "${slug}"; standing at the plaza instead. ` +
          `Known: ${projects.map((p) => p.slug).join(', ')}`
      );
      return null;
    }

    return {
      x: monolith.x + TO_CAMERA.x * ARC_AHEAD,
      z: monolith.z + TO_CAMERA.z * ARC_AHEAD,
      heading: FACE_YAW - Math.PI,
    };
  }

  /** The other half of the deep link, once the visitor can actually see it. */
  openTarget(slug) {
    const monolith = this._monolithFor(slug);
    if (monolith) this.openProject(monolith.project);
  }

  /**
   * Reads `monoliths`, which only exists after `build()`. That is fine for both
   * callers — `Areas.goTo` forces the build before either runs — and returning
   * undefined for an area whose build threw is the right answer anyway.
   */
  _monolithFor(slug) {
    if (!slug) return null;
    return this.monoliths.find((m) => m.project.slug === slug) ?? null;
  }

  openProject(project) {
    this.game.card.open({
      title: project.title || '(untitled)',
      subtitle: [project.roles.join(' · '), project.year].filter(Boolean).join(' — '),
      lead: project.blurb,
      body: project.body,
      // Every image the entry has, not just the board's images[0] — the card
      // is the one place a screenshot is legible rather than dark and at 45°.
      images: project.images.map((file, i) => ({
        url: imageUrl(file),
        alt: `${project.title} — screenshot ${i + 1} of ${project.images.length}`,
      })),
      meta: [['Stack', project.stack.join(', ')]].filter(([, value]) => value),
      links: project.links.filter((link) => link.url),
      onClose: () => this._writeDeepLink(null),
    });

    this._writeDeepLink(project.slug);

    // The reference's confetti, popped at the board's feet: opening a project is the
    // one thing the plaza is for, and the burst says so.
    const monolith = this._monolithFor(project.slug);
    if (monolith && this.game.confetti) {
      this.game.confetti.pop(
        new THREE.Vector3(
          monolith.x + TO_CAMERA.x * 1.2,
          monolith.y + 0.5,
          monolith.z + TO_CAMERA.z * 1.2
        ),
        4,
        6
      );
    }
  }

  /**
   * Keep the address bar on the thing being looked at. `replaceState` rather
   * than `pushState`: the back button should leave the site, not step back
   * through every monolith somebody happened to read.
   */
  _writeDeepLink(slug) {
    history.replaceState(null, '', slug ? `?at=${this.id}&p=${slug}` : `?at=${this.id}`);
  }

  enter() {
    document.documentElement.classList.add('in-projects');
  }

  leave() {
    document.documentElement.classList.remove('in-projects');
    // Driving away closes the card. No modal left standing behind you.
    this.game.card.close();
  }

  /**
   * On `update()`: this file said "no update, deliberately" until 2 Sep,
   * against `D` §6.7's per-frame glow pulse (one material per monolith, the
   * shared-palette rule broken). The greeting hop above spends the frame on
   * a pose instead of a material — nothing about the palette rule moved.
   */
}
