/**
 * The pipeline fixture — a generated GLB family carrying **every pattern the
 * format defines at once**, so the loader path is proven before the first
 * authored asset exists. Decided with Michael 21 Aug: build against this, and
 * the lamp is a drop-in rather than a debugging session the reference author waits through.
 *
 * The shapes are copied from the reference author's real files, not invented:
 *
 *   - `fixtureReferences.glb` is `bushesReferences.glb`'s shape — plain-named
 *     transform nodes, no meshes, no materials. (The reference's references files do NOT
 *     use `ref` names; those live in area/scenery files. `combineSplit` places
 *     whatever nodes it finds.)
 *   - `fixturePhysical.glb` is `fences.glb`'s shape — `*Physical*` nodes each
 *     holding collider children — plus the userData patterns `areas.glb`
 *     carries (`mass`, `restitution`, `friction`, `category`,
 *     `preventAutoAdd`) and one of every collider shape.
 *   - `fixtureVisual.glb` is `playgroundVisual.glb`'s shape — meshes with
 *     named materials, including two sharing `palette` (the registry key,
 *     `F` §1.5) and one carrying `prevent` on the material.
 *
 * Patterns exercised, by file:
 *
 *   references  `.001` duplicates (`lamp`, `lamp.001`, `lamp.002`)
 *   physical    every collider shape (cuboid, tube→cylinder, ball, hull,
 *               trimesh); all three body types; `mass` as a **string** on one
 *               node and a number on another (`F` rec 7 — Blender custom
 *               properties are untyped and the reference's own data has both);
 *               body-level and collider-level `restitution`/`friction`;
 *               `category: "floor"`; a `preventAutoAdd` node whose collider
 *               child must NOT be harvested; ref-named physical duplicates
 *               (`refLetterPhysicalDynamic`, `.001`)
 *   visual      material-name sharing, first-use-defines, material `prevent`
 *
 * Collider names are dotted uniques (`cuboid.002`, `tube.001`) because
 * Blender object names are unique file-wide — a second bare `cuboid` in one
 * file cannot come out of Blender, and a fixture should only contain worlds
 * that can. (The reference's fences.glb colliders are `cuboid.114`–`cuboid.130`.)
 *
 * `expected` beside each buffer is what the check asserts — authored here, in
 * the same file as the data, so the two cannot drift apart silently.
 */
import { writeGlb, box, grid } from './glb.mjs';

const GENERATOR = 'gamified-portfolio tools/lib/fixture.mjs';

/** A collider child sized by scale alone — the mesh is deliberately absent,
 *  which is legal glTF and proves the parser never looks at collider geometry
 *  for a primitive. */
const collider = (name, scale, extras) => {
  const node = { name, scale };
  if (extras) node.extras = extras;
  return node;
};

export function buildFixture() {
  const references = writeGlb({
    generator: GENERATOR,
    sceneName: 'fixtureReferences',
    nodes: [
      { name: 'lamp', translation: [2, 0, -3] },
      { name: 'lamp.001', translation: [-4, 0, 1], rotation: [0, 0.3826834, 0, 0.9238795] },
      { name: 'lamp.002', translation: [0.5, 0, 6], scale: [1.5, 1.5, 1.5] },
    ],
  });

  const visual = writeGlb({
    generator: GENERATOR,
    sceneName: 'fixtureVisual',
    nodes: [
      { name: 'lamp', mesh: box(0.4, 1.6, 0.4), material: { name: 'palette' } },
      { name: 'crate', mesh: box(1, 1, 1), material: { name: 'palette' } },
      { name: 'globe', mesh: box(0.8, 0.8, 0.8), material: { name: 'glass' } },
      { name: 'globeStand', mesh: box(0.3, 0.5, 0.3), material: { name: 'glass' } },
      {
        name: 'label',
        mesh: box(1, 0.4, 0.02),
        // The reference's careerText* materials carry this; the registry must not touch it.
        material: { name: 'careerText', extras: { prevent: true } },
      },
    ],
  });

  const physical = writeGlb({
    generator: GENERATOR,
    sceneName: 'fixturePhysical',
    nodes: [
      {
        name: 'refLetterPhysicalDynamic',
        translation: [1, 0.6, 0],
        // mass as a STRING — Blender custom properties are untyped and the reference's own
        // areas.glb has `size: "4"` beside `size: 2`. parseFloat or lose it.
        extras: { mass: '2', restitution: 0.5 },
        children: [
          collider('cuboid', [0.6, 0.6, 0.6]),
          collider('cuboid.001', [0.4, 0.4, 0.4]),
        ],
      },
      {
        name: 'refLetterPhysicalDynamic.001',
        translation: [3, 0.6, 0],
        extras: { mass: 2 },
        children: [collider('cuboid.002', [0.6, 0.6, 0.6])],
      },
      {
        name: 'lampPhysical', // no type word: `fixed` is the fallthrough
        translation: [2, 0, -3],
        children: [collider('cuboid.003', [0.4, 1.6, 0.4])],
      },
      {
        name: 'postPhysicalKinematicPositionBased',
        translation: [-2, 0.9, 4],
        children: [collider('tube', [0.5, 1.8, 0.5])],
      },
      {
        name: 'globePhysicalDynamic',
        translation: [0, 2, 0],
        children: [collider('ball', [0.8, 0.8, 0.8], { friction: 0.6, restitution: 1 })],
      },
      {
        name: 'rockPhysical',
        translation: [5, 0, 5],
        // hull and trimesh read geometry, so these children carry a mesh —
        // at scale 1, as Blender demands (the parser never applies scale to
        // harvested vertices, exactly like the reference's).
        children: [{ name: 'hull', mesh: box(1.2, 0.8, 1) }],
      },
      {
        name: 'groundPhysical',
        extras: { category: 'floor' },
        children: [{ name: 'trimesh', mesh: grid(8, 8, 0.1, 4) }],
      },
      {
        name: 'refFanPhysicalDynamic',
        translation: [-5, 0, -5],
        // preventAutoAdd: no body, no collider harvest, no rename — the tube
        // child must still be attached afterwards and the reference key keeps
        // its physics words (`fanPhysicalDynamic`), exactly like the reference's pin.
        extras: { preventAutoAdd: true },
        children: [collider('tube.001', [0.4, 1.2, 0.4])],
      },
    ],
  });

  const expected = {
    references: {
      placements: 3,
      // what the loader will call them once the dots are stripped
      names: ['lamp', 'lamp001', 'lamp002'],
    },
    visual: {
      // mesh name → material name, after the registry pass
      paletteMeshes: ['lamp', 'crate'],
      sharedMeshes: ['globe', 'globeStand'],
      preventedMesh: 'label',
    },
    physical: {
      bodies: 7, // 8 nodes, minus the preventAutoAdd fan
      types: { dynamic: 3, fixed: 3, kinematicPositionBased: 1 },
      colliders: { cuboid: 4, cylinder: 1, ball: 1, hull: 1, trimesh: 1 },
      // References parsed after the strip, the reference's ordering: two letters under one
      // key, and the fan keeps its words because the rename never ran.
      referenceKeys: { letter: 2, fanPhysicalDynamic: 1 },
      letterMass: 2, // per body, spread across its colliders
    },
  };

  return { files: { references, visual, physical }, expected };
}
