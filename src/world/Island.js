import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, paletteU, COLOR } from '../render/palette.js';
import { SIZE, SAMPLES, HALF, WATER_SURFACE, RESERVED_LOBE, beachRadius } from './Terrain.js';
import { distanceToSegment } from './wayfindingPlan.js';

/**
 * Placeholder world.
 *
 * Everything here is procedural stand-in geometry so the systems around it —
 * reveal, physics, camera, palette, water — can be built and tuned before any
 * art exists. It is deliberately shaped like the real thing will be:
 *
 *   - two draw calls total (terrain, then every prop merged into one mesh)
 *   - a **Rapier heightfield** for the ground and cuboids for the props, which
 *     is the reference's arrangement exactly and what `KNOWN-ISSUES.md` 4 asked for
 *   - colour carried entirely by palette UVs
 *
 * The shape itself now lives in `Terrain`, and both the drawn surface and the
 * collider are built from the same sampled grid — so unlike the old
 * 150-segment render plane against a 64-segment collision trimesh, what you
 * look at and what you drive on are the same surface to the last sample.
 *
 * When Blender assets arrive, `build()` gets replaced by a GLB load plus the
 * node-name convention parser; nothing else in the codebase changes.
 */

/** Deterministic PRNG so the world is identical on every reload. */
function mulberry32(seed) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How much land is kept clear around the spawn.
 *
 * The camera sits about 17 units out along +X+Z through a 25° lens and cannot
 * be steered, so every prop inside that corridor is a permanent occluder
 * (`KNOWN-ISSUES.md` 8). It was 30 when the island was 300 units across; at 150
 * that would be a third of the whole landmass, so it comes down to 24 — still
 * comfortably past the camera's own reach.
 */
const SPAWN_CLEARING = 24;

/** Nothing is placed within this of the beach, so no prop stands in the surf. */
const SHORE_MARGIN = 4;

/**
 * Prop counts, cut with the island.
 *
 * The number that mattered in the 300-unit world was **one colliding prop per
 * ~690 m²** of drivable annulus, which is what stopped the first drive ending
 * against a tree. Holding that ratio on this island would allow about five
 * props in total, which reads as an empty field rather than a sparse one — the
 * ratio was measured on a world you cross in straight lines, and this is one
 * you are turning on constantly. 16 colliding props over roughly 4,600 m² is
 * one every ~17 units: sparse enough to drive through without stopping, dense
 * enough that the island has objects in it. Placeholder either way; Phase 3
 * replaces the lot.
 */
// `buildings` was here until 31 Aug — six placeholder boxes with roof caps,
// standing in for the eventual area architecture. Michael: "lets remove the
// temporary stuff like the houses for now." The areas bring their own
// buildings when they are built; nothing generic replaces these.
const COUNTS = { trees: 14, rocks: 22, shrubs: 16, flora: 40 };

/**
 * Tree height range (trunk top), and the mean the wind's size scaling is
 * normalised against. Declared rather than inlined so `sizeScale` cannot
 * drift from the range it is meant to centre.
 */
const TREE_H = { min: 5.0, max: 7.2, mean: (5.0 + 7.2) / 2 };

/**
 * Tree species — the construction is the reference's, measured off `birchTreesVisual.glb`
 * on 31 Aug after Michael drove the found trees and called it: *"i dont think
 * the trees match what the reference author has."* The reference author was exactly right. the reference author's tree is a thin
 * branchy trunk with **six instances of one 20-triangle icosphere** floating
 * around its upper half (scales 0.42–1.03, y 2.8–7.8 on an ~8-unit trunk) —
 * a constellation of puffs, not a solid crown, and no found model had that
 * silhouette. So trees are generated again, in that construction, with our
 * palette: the two-tone-per-species idea is also the reference's (`World.js:69-71` —
 * birch orange over a pale trunk, which is where `accentWarm`/`amber` blobs
 * on a `white` trunk comes from).
 */
const TREE_SPECIES = [
  { trunk: COLOR.wood, blobs: [COLOR.foliage, COLOR.foliageDark], share: 0.45 },
  { trunk: COLOR.woodDark, blobs: [COLOR.grass, COLOR.foliage], share: 0.35 },
  { trunk: COLOR.white, blobs: [COLOR.accentWarm, COLOR.amber], share: 0.2 },
];

/**
 * Write the per-vertex `sway` attribute the wind material reads.
 *
 * **Every geometry that goes into the props mesh needs one**, including the ones
 * that never move: `mergeGeometries` requires every input to carry the same
 * attribute set, and it fails loudly rather than filling in a default. That is
 * the right behaviour — a silent zero-fill would mean a rock inheriting whatever
 * the buffer happened to hold — but it means "no sway" is `0`, not "omitted".
 *
 * `weightFor` takes a **world** Y, because it is called after the prop has been
 * placed. Passing local Y instead would key the hinge off the geometry's own
 * centre and every tree would bend around its middle.
 */
function writeSway(geometry, weightFor) {
  const position = geometry.attributes.position;
  const sway = new Float32Array(position.count);
  if (weightFor) {
    for (let i = 0; i < position.count; i++) sway[i] = weightFor(position.getY(i));
  }
  geometry.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
}

export default class Island {
  /**
   * @param {import('./Terrain.js').default} terrain
   * @param {object} [options]
   * @param {number} [options.seed]
   * @param {{x:number, z:number, radius:number}[]} [options.clearings]
   *   Ground the areas own. Nothing is scattered inside one.
   * @param {{points:number[][], halfWidth:number}[]} [options.corridors]
   *   Paved routes (`wayfindingPlan`). Nothing is scattered onto one — the
   *   clearings rule stretched along a polyline: a road with a bush on it is
   *   a road that lies about being drivable.
   */
  constructor(terrain, { seed = 7, clearings = [], corridors = [] } = {}) {
    this.terrain = terrain;
    this.size = SIZE;
    this.rand = mulberry32(seed);

    /**
     * `SPAWN_CLEARING` generalised, and it is the same argument one step out.
     *
     * That constant exists because the camera corridor cannot contain props;
     * this exists because a district cannot share its ground with them.
     * Decision 21 makes the plaza floor authored art and the monoliths code —
     * neither can negotiate with a building the scatter happened to drop on
     * them, and measured, that is exactly what happens: the third monolith
     * lands 4.14 units inside a wall.
     *
     * Costs nothing in prop count. `scatter()` retries up to 200 times per prop,
     * so a clearing moves props rather than deleting them.
     *
     * Deliberately *not* applied to `_isSpawnable`: a respawn point inside the
     * plaza is a good place to be put down, and excluding them would throw
     * anyone who drowned off this coast to the far side of the island. The gap
     * that leaves — a spawn point could land inside a monolith, since area
     * colliders do not exist when spawns are placed — is checked rather than
     * assumed. At `[28, 18]` the nearest spawn sits 9.1 units clear.
     */
    this.clearings = clearings;
    this.corridors = corridors;

    this.group = new THREE.Group();
    this.group.name = 'island';

    /** @type {{position:[number,number,number], halfExtents:[number,number,number], rotationY:number}[]} */
    this.boxColliders = [];

    /** @type {{x:number, z:number, heading:number}[]} */
    this.spawns = [];
  }

  /**
   * @param {THREE.Material} material  terrain and underside
   * @param {THREE.Material} [propMaterial]  the props, which may carry wind
   * @param {{ shrubs?: THREE.BufferGeometry[],
   *           flora?: THREE.BufferGeometry[] }} [models]
   *   Found-asset geometries from the prep tool (decision 47), palette UVs
   *   already baked: bushes and the stump in `shrubs`, mushrooms and flower
   *   patches in `flora`. Trees are NOT here — they are generated, in the reference's
   *   blob-cluster construction (see `TREE_SPECIES`). With no models the
   *   island still builds, just bare of undergrowth (headless callers).
   */
  build(material, propMaterial = material, models = null, { terrainMaterial = material } = {}) {
    this.models = models;
    this.group.add(this._buildTerrain(terrainMaterial));
    this.underside = this._buildUnderside(material);
    this.group.add(this.underside);
    this.group.add(this._buildProps(propMaterial));
    this._placeSpawns();
    return this.group;
  }

  /**
   * The island's underside — and it is intro scaffolding now, not scenery.
   *
   * The reveal clips a *vertical cylinder* through the world, so while the disc
   * is small you would see straight through the cut. That was a permanent
   * problem when the world grew as you drove; it is a four-second one now
   * (decision 4), and once the disc snaps past the shoreline the ground is a
   * continuous surface running down into the sea with no cut anywhere and
   * nothing under the island a fixed 45° camera can see.
   *
   * So it is sized to the expansion rather than to the island — the seam never
   * gets past 30 — and `Intro` destroys it along with the void grid.
   */
  _buildUnderside(material) {
    const geometry = new THREE.ConeGeometry(40, 26, 48, 1, false);
    geometry.scale(1, -1, 1); // apex down
    // Flat cap just under the lowest ground the disc can expose. Derived rather
    // than hard-coded, or flattening the land opens a gap you can see through.
    geometry.translate(0, -0.2 - 13, 0);
    paint(geometry, COLOR.rockDark);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'underside';
    return mesh;
  }

  /**
   * The drawn ground: the same 101 × 101 grid the collider is built from.
   *
   * Matching them is free — 10k vertices — and it removes a whole class of
   * "the car is floating / the car is buried" that a coarser collider makes
   * inevitable. The old comment here claimed collision "much coarser than what
   * you look at" as a virtue; with a heightfield it is only a source of
   * disagreement.
   */
  _buildTerrain(material) {
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SAMPLES - 1, SAMPLES - 1);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // PlaneGeometry after the rotation runs -x..+x along rows and +z..-z down
      // columns; going through the sampler rather than the index maths keeps
      // this immune to that.
      pos.setY(i, this.terrain.sample(pos.getX(i), pos.getZ(i)));
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();

    // The palette UVs are the FALLBACK colour now: since 2 Sep the terrain's
    // material carries its own albedo (`makeTerrainAlbedo` — the reference's height-
    // driven gradient plus the ground-cover channel), and these two painted
    // bands only show if the terrain is ever handed the plain content
    // material again (headless callers, the scale reference).
    paint(geometry, COLOR.grass);
    const uvs = geometry.attributes.uv;
    const sandU = paletteU(COLOR.sand);
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) <= WATER_SURFACE + 0.15) uvs.setX(i, sandU);
    }
    uvs.needsUpdate = true;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'terrain';
    mesh.receiveShadow = true;
    return mesh;
  }

  /** True inside the lobe decision 3 reserves for later content. */
  _inReservedLobe(x, z) {
    let delta = Math.atan2(z, x) - RESERVED_LOBE.center;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return Math.abs(delta) < RESERVED_LOBE.halfWidth;
  }

  /** Inside any paved route's keep-out band. */
  _onCorridor(x, z) {
    for (const corridor of this.corridors) {
      for (let i = 0; i < corridor.points.length - 1; i++) {
        const [ax, az] = corridor.points[i];
        const [bx, bz] = corridor.points[i + 1];
        if (distanceToSegment(x, z, ax, az, bx, bz) < corridor.halfWidth) return true;
      }
    }
    return false;
  }

  /** Dry, developed, outside every clearing, off the roads, clear of the surf. */
  _isPlaceable(x, z) {
    const d = Math.hypot(x, z);
    if (d < SPAWN_CLEARING) return false;
    if (this._inReservedLobe(x, z)) return false;
    if (this._onCorridor(x, z)) return false;
    for (const c of this.clearings) {
      if (Math.hypot(c.x - x, c.z - z) < c.radius) return false;
    }
    if (d > beachRadius(Math.atan2(z, x)) - SHORE_MARGIN) return false;
    // Above the waterline with room to spare. The margin is 0.15 and not the
    // 0.4 it was: land is flat at exactly 0 now (`Terrain.LAND_RELIEF`), which
    // is only 0.3 above `WATER_SURFACE`, so a 0.4 margin excluded *every point
    // on the island* — `scatter` placed nothing and `mergeGeometries` threw on
    // an empty array. Expressed against the water surface rather than as "is
    // this exactly 0" on purpose: `KNOWN-ISSUES.md` 18 carves river beds down
    // through the same flat land, and this test has to keep rejecting those.
    return this.terrain.heightAt(x, z) > WATER_SURFACE + 0.15;
  }

  _buildProps(material) {
    const rand = this.rand;
    const parts = [];

    const push = (geometry, colorIndex, x, y, z, rotY = 0, sway = null) => {
      paint(geometry, colorIndex);
      const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
      geometry.applyMatrix4(m);
      writeSway(geometry, sway);

      // mergeGeometries requires every input to be indexed or none of them to
      // be. Box/Cone/Cylinder are indexed; Icosahedron is not. Normalising to
      // non-indexed also gives flat shading, which suits the low-poly look.
      if (geometry.index) {
        const flat = geometry.toNonIndexed();
        geometry.dispose();
        parts.push(flat);
      } else {
        parts.push(geometry);
      }
    };

    /**
     * A found-asset geometry: palette UVs already baked by the prep tool, so
     * it must NOT be repainted — `push`'s `paint()` would collapse it onto a
     * single band. Everything else is `push`'s contract: bake the transform,
     * write sway, normalise to non-indexed for the merge.
     */
    const pushReady = (geometry, x, y, z, rotY = 0, sway = null) => {
      const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
      geometry.applyMatrix4(m);
      writeSway(geometry, sway);
      if (geometry.index) {
        const flat = geometry.toNonIndexed();
        geometry.dispose();
        parts.push(flat);
      } else {
        parts.push(geometry);
      }
    };

    /**
     * Position samplers — the 31 Aug liveliness pass (Michael: *"the center
     * island still feels dead"*). Three ways to pick a spot:
     *
     *  - `sampleAnnulus`: the original — anywhere outside the spawn clearing.
     *  - `sampleAnywhere`: the whole island including the clearings. Only
     *    ground flora uses it: flowers and mushrooms are drive-through
     *    texture, so the corridors the clearings protect stay drivable while
     *    the middle stops being bare.
     *  - `sampleGrove`: gaussian around one of a few grove centres, so trees
     *    and undergrowth clump into woods instead of a uniform sprinkle —
     *    a landscape reads in patches, and the reference's island works the same way.
     */
    const sampleAnnulus = () => {
      const angle = rand() * Math.PI * 2;
      const radius = SPAWN_CLEARING + rand() * (HALF - SPAWN_CLEARING);
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    };
    const sampleAnywhere = () => {
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(rand()) * HALF; // sqrt: uniform by area
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    };

    // Grove centres: mutually spaced, on placeable ground.
    const groves = [];
    for (let guard = 0; groves.length < 4 && guard < 400; guard++) {
      const p = sampleAnnulus();
      if (!this._isPlaceable(p.x, p.z)) continue;
      if (groves.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 18)) continue;
      groves.push(p);
    }
    const gauss = (spread) => (rand() + rand() + rand() - 1.5) * spread;
    const sampleGrove = () => {
      const g = groves[Math.floor(rand() * groves.length)];
      return { x: g.x + gauss(6), z: g.z + gauss(6) };
    };

    /**
     * @param {number} count
     * @param {() => {x: number, z: number}} sample  position source; a mix is
     *   expressed by passing a closure that rolls between samplers
     * @param {(x: number, z: number) => boolean} placeable
     * @param {Function} fn
     */
    const scatter = (count, fn, sample = sampleAnnulus, placeable = (x, z) => this._isPlaceable(x, z)) => {
      let placed = 0;
      let guard = 0;
      while (placed < count && guard < count * 200) {
        guard++;
        const { x, z } = sample();
        if (!placeable(x, z)) continue;
        fn(x, z, rand);
        placed++;
      }
    };

    /** Flora goes everywhere the ground is dry — clearings included, but not
     *  the roads: drive-through or not, a flower growing out of packed sand
     *  reads as a mistake. */
    const floraPlaceable = (x, z) => {
      if (this._inReservedLobe(x, z)) return false;
      if (this._onCorridor(x, z)) return false;
      const d = Math.hypot(x, z);
      if (d > beachRadius(Math.atan2(z, x)) - SHORE_MARGIN) return false;
      return this.terrain.heightAt(x, z) > WATER_SURFACE + 0.15;
    };

    const groundAt = (x, z) => this.terrain.heightAt(x, z);

    // Trees — HIS construction, generated (see TREE_SPECIES for the story
    // and the measurements). A thin tapered trunk, one or two branches, and
    // a constellation of 5–7 icosphere puffs around the upper half. Every
    // blob is one 20-tri icosahedron, which is literally what the reference's is.
    scatter(COUNTS.trees, (x, z) => {
      const y = groundAt(x, z);
      const h = TREE_H.min + rand() * (TREE_H.max - TREE_H.min);

      let roll = rand();
      let species = TREE_SPECIES[0];
      for (const s of TREE_SPECIES) {
        species = s;
        roll -= s.share;
        if (roll <= 0) break;
      }

      const trunkR = 0.16 + rand() * 0.06;
      push(new THREE.CylinderGeometry(trunkR * 0.65, trunkR, h, 5), species.trunk, x, y + h / 2, z);

      /**
       * The wind hinge, unchanged in shape from the cones it replaces:
       * squared height inside the canopy's span, size-scaled against the
       * mean tree so the amplitude Michael judged holds in the average.
       * Squared because a linear ramp shears; squared reads as a hinge.
       */
      const crownBase = y + h * 0.5;
      const crownSpan = h * 0.65;
      const sizeScale = h / TREE_H.mean;
      const sway = (worldY) => {
        const t = Math.max(0, Math.min(1, (worldY - crownBase) / crownSpan));
        return t * t * sizeScale;
      };

      // One or two branches reaching up and out, a blob on each tip — the
      // blobs sitting on branch ends is what stops the cluster reading as
      // balloons around a pole.
      const blobAt = [];
      const branches = 1 + Math.round(rand());
      for (let i = 0; i < branches; i++) {
        const azimuth = rand() * Math.PI * 2;
        const tilt = 0.6 + rand() * 0.35; // rad from vertical
        const length = 1.2 + rand() * 0.8;
        const baseY = h * (0.5 + rand() * 0.2);
        const dir = new THREE.Vector3(
          Math.sin(tilt) * Math.cos(azimuth),
          Math.cos(tilt),
          Math.sin(tilt) * Math.sin(azimuth)
        );
        const branch = new THREE.CylinderGeometry(0.06, 0.09, length, 4);
        branch.translate(0, length / 2, 0);
        branch.applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        );
        push(branch, species.trunk, x, y + baseY, z, 0, sway);
        blobAt.push([dir.x * length, baseY + dir.y * length, dir.z * length]);
      }

      // The rest of the constellation, around and above the trunk top.
      const puffs = 4 + Math.floor(rand() * 3);
      for (let i = 0; i < puffs; i++) {
        const azimuth = rand() * Math.PI * 2;
        const radial = 0.2 + rand() * 0.9;
        blobAt.push([
          Math.cos(azimuth) * radial,
          h * (0.72 + rand() * 0.33),
          Math.sin(azimuth) * radial,
        ]);
      }

      for (const [bx, by, bz] of blobAt) {
        const r = 0.55 + rand() * 0.6;
        const blob = new THREE.IcosahedronGeometry(r, 0);
        blob.scale(1, 1.05 + rand() * 0.15, 1); // the reference's blob is slightly tall
        push(
          blob,
          species.blobs[Math.floor(rand() * species.blobs.length)],
          x + bx, y + by, z + bz, rand() * Math.PI, sway
        );
      }

      this.boxColliders.push({
        position: [x, y + h / 2, z],
        halfExtents: [0.45, h / 2, 0.45],
        rotationY: 0,
      });
    }, () => (groves.length && rand() < 0.85 ? sampleGrove() : sampleAnnulus()));

    // Rocks — no colliders; they read as ground detail and clipping them is
    // cheaper than making the car catch on scenery. These are allowed down to
    // the waterline, where they pick up the foam band for free.
    const rocks = this.models?.rocks ?? [];
    scatter(COUNTS.rocks, (x, z) => {
      const y = groundAt(x, z);
      if (rocks.length) {
        // Found stones (four clean, four mossy — the forest pack), with a
        // random uniform scale for size variety the eight variants alone
        // would not give across twenty-two placements.
        const s = 0.6 + rand() * 0.9;
        const stone = rocks[Math.floor(rand() * rocks.length)].clone();
        stone.scale(s, s, s);
        pushReady(stone, x, y, z, rand() * Math.PI * 2);
        return;
      }
      const r = 0.4 + rand() * 1.3;
      const geo = new THREE.IcosahedronGeometry(r, 0);
      geo.scale(1, 0.6 + rand() * 0.5, 1);
      push(geo, rand() > 0.5 ? COLOR.rock : COLOR.rockDark, x, y + r * 0.25, z, rand() * 3.14);
    });

    // Shrubs — bushes, stumps, fallen logs and root snags, found models only
    // (no generated fallback: a world without them is just the world before
    // 31 Aug).
    // No colliders, same reasoning as the rocks: soft ground detail the car
    // drives through rather than scenery it catches on.
    const shrubs = this.models?.shrubs ?? [];
    if (shrubs.length) {
      scatter(COUNTS.shrubs, (x, z) => {
        const y = groundAt(x, z);
        const variant = shrubs[Math.floor(rand() * shrubs.length)];
        pushReady(variant.clone(), x, y, z, rand() * Math.PI * 2);
      }, () => (groves.length && rand() < 0.6 ? sampleGrove() : sampleAnnulus()));
    }

    // Flora — mushrooms, flower patches, grass tufts; Michael's "make the
    // map more lively" layer. Same contract as the shrubs, twice the count
    // at a fraction of the silhouette: this is ground texture, not scenery.
    const flora = this.models?.flora ?? [];
    if (flora.length) {
      scatter(COUNTS.flora, (x, z) => {
        const y = groundAt(x, z);
        const variant = flora[Math.floor(rand() * flora.length)];
        pushReady(variant.clone(), x, y, z, rand() * Math.PI * 2);
      },
      // Half around the groves (mushrooms under trees), half anywhere dry —
      // including the clearings and the island's bare middle, which is the
      // whole point of the pass.
      () => (groves.length && rand() < 0.45 ? sampleGrove() : sampleAnywhere()),
      floraPlaceable);
    }

    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();

    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'props';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Somewhere to put a drowned car.
   *
   * The reference's are 18 authored points loaded from a GLB, one per area, each with a
   * yaw, and "closest" is horizontal distance with y ignored — which is exactly
   * what makes the reference's work for a car at y = −10,000 (`Respawns.js`,
   * `KNOWN-ISSUES.md` 15). Ours are generated because there is no content to
   * hang them on yet, but the interface is the same one the authored list will
   * fill: a flat array, and a nearest lookup.
   *
   * They face the origin, so being respawned always leaves you pointing at the
   * middle of the island rather than back out to sea — which matters most for
   * the coastal ones, where the alternative is being set down aimed at the
   * water you just drowned in.
   */
  _placeSpawns() {
    this.spawns.push({ x: 0, z: 0, heading: 0 });

    const inland = 34;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.4;
      const x = Math.cos(angle) * inland;
      const z = Math.sin(angle) * inland;
      if (this._inReservedLobe(x, z)) continue;
      if (!this._isSpawnable(x, z)) continue;
      // Face the origin: heading is measured the way `Car.respawn` applies it.
      this.spawns.push({ x, z, heading: Math.atan2(-x, -z) });
    }

    /**
     * A ring of beach spawns, and this is the half that makes drowning feel
     * right rather than merely work.
     *
     * With only the inland ring, every drown put the car back at radius 34 —
     * so going in at radius 70 threw you 36 units inland, five times out of
     * five in one of Michael's sessions, four of them to the same point. A
     * drowning that always sends you home reads as a punishment; one that puts
     * you back on the beach you drove off reads as being washed ashore.
     *
     * The reference's list covers the coast for the same reason: 18 points spread across
     * the island, and `getClosest` on horizontal distance, so wherever you go
     * in there is usually one nearby. Sixteen bearings here puts one roughly
     * every 20 units of coastline, which is comfortably closer than the ~12
     * units of water you can cross before the fade starts.
     *
     * The reserved lobe is *not* skipped. Decision 3 keeps it clear of
     * content, and a respawn point is not content — leaving it out would mean
     * drowning off that whole coast throws you to the far side of the island.
     */
    const BEARINGS = 16;
    for (let i = 0; i < BEARINGS; i++) {
      const angle = (i / BEARINGS) * Math.PI * 2 + 0.13;
      const cx = Math.cos(angle);
      const cz = Math.sin(angle);
      const beach = beachRadius(angle);

      // Walk inland from the waterline until the ground is dry enough to sit on
      // and there is room for a car. Stop well before the inland ring, or a
      // "coastal" spawn stops being coastal.
      for (let back = 2; back <= 18; back += 1) {
        const x = cx * (beach - back);
        const z = cz * (beach - back);
        if (!this._isSpawnable(x, z)) continue;
        this.spawns.push({ x, z, heading: Math.atan2(-x, -z) });
        break;
      }
    }
  }

  /**
   * Dry land with room for a car and nothing solid in it.
   *
   * Deliberately weaker than `_isPlaceable`: a spawn may sit inside the
   * clearing and inside the reserved lobe, because neither of those is about
   * whether a car can stand there.
   */
  _isSpawnable(x, z) {
    // 0.15 above the water surface, and the old 0.4 was not a safety margin so
    // much as an accident of relief: flat land sits at exactly 0, which is 0.3
    // above `WATER_SURFACE`, so 0.4 rejected the whole island. Any dry point is
    // already enormous safety — drowning needs 1.0 of the 1.2 available depth —
    // so this only has to stop the car's own footprint straddling the line.
    // The old note about spawns being pushed "up the hill" no longer applies:
    // there is no hill, and coastal spawns now sit on the flat right up to the
    // beach edge, which is where they were always meant to be.
    if (this.terrain.heightAt(x, z) <= WATER_SURFACE + 0.15) return false;

    for (const box of this.boxColliders) {
      const [bx, , bz] = box.position;
      const [hx, , hz] = box.halfExtents;
      // Car half-diagonal is about 1.8; 2.6 leaves room to drive away too.
      if (Math.hypot(bx - x, bz - z) < Math.hypot(hx, hz) + 2.6) return false;
    }

    for (const spawn of this.spawns) {
      if (Math.hypot(spawn.x - x, spawn.z - z) < 12) return false;
    }

    return true;
  }

  /** Nearest spawn by horizontal distance, y deliberately ignored. */
  closestSpawn(x, z) {
    let best = this.spawns[0];
    let bestDistance = Infinity;
    for (const spawn of this.spawns) {
      const d = Math.hypot(spawn.x - x, spawn.z - z);
      if (d < bestDistance) {
        bestDistance = d;
        best = spawn;
      }
    }
    return best;
  }

  /**
   * Register the ground and the props with Rapier.
   *
   * The ground is a heightfield, which is what `KNOWN-ISSUES.md` 4 settled on
   * after the entry's original "heightfield or a coarse cuboid set" turned out
   * to be citing the reference's *prop* counts as an argument about the reference's terrain. The reference's
   * terrain physics is a heightfield extracted from a loaded GLB
   * (`Floor.js:120-152`) and so is this, extracted from a generated grid.
   *
   * The layout is the reference's: `heights[iz + ix * SAMPLES]`, with the scale carrying
   * the world extent in x and z and 1 in y, so the stored values are absolute
   * world heights. Replicated rather than re-derived because a transposed
   * height field is invisible on a symmetric world and catastrophic on this one
   * — and verified after the fact by dropping the car at asymmetric points and
   * checking where it comes to rest.
   */
  addToPhysics(physics) {
    const { RAPIER, world } = physics;

    world.createCollider(
      RAPIER.ColliderDesc.heightfield(SAMPLES - 1, SAMPLES - 1, this.terrain.heights, {
        x: SIZE,
        y: 1,
        z: SIZE,
      })
        // The reference's floor: friction 0.2, restitution 0.15.
        .setFriction(0.2)
        .setRestitution(0.15)
    );

    for (const box of this.boxColliders) {
      const [x, y, z] = box.position;
      const [hx, hy, hz] = box.halfExtents;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(x, y, z)
          .setRotation({
            x: 0,
            y: Math.sin(box.rotationY / 2),
            z: 0,
            w: Math.cos(box.rotationY / 2),
          })
      );
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body);
    }
  }
}
