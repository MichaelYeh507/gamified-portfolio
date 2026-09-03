/**
 * Write `public/scale-reference.glb` — the ruler Michael models against.
 *
 *   npm run scale-ref
 *
 * **Every number in it is imported from the module that owns it.** Nothing here
 * types a dimension. That is the whole point: a ruler that was transcribed is a
 * ruler that will disagree with the game the first time a constant moves, and it
 * will disagree silently, after a week of modelling against it.
 *
 * What it contains, and why each one is in it:
 *
 *   `car-chassis`     the whole visual chassis — body, cabin, spoiler and both
 *                     lamps — at its resting height. The thing every other model
 *                     is judged against, because it is on screen in every frame.
 *                     **Not just the body box:** with the spoiler and the wheels
 *                     the car is 1.96 x 3.35, against the 1.70 x 3.10 the
 *                     roadmap quotes. Fit gaps to the silhouette.
 *   `car-wheels`      r 0.42, w 0.32, resting on the ground plane. They are the
 *                     widest part of the car, so they decide what it fits through.
 *   `car-collider`    1.70 x 0.76 x 3.10 — **taller than the body box and
 *                     narrower than the silhouette**, and here as a separate
 *                     object precisely so the three are never confused again.
 *                     See the note on `Car.BODY`.
 *   `board-stack`     3.23 ground to the top of the title plate. The ruler for
 *                     "how big does a thing have to be to be readable".
 *   `terrain-cell`    1.5 cube — one cell of the collision heightfield.
 *   `frame-*`         What the camera actually holds at rest, on the ground.
 *
 * **The frame is a trapezoid, not a rectangle**, and the roadmap's "35.1 x 17.6"
 * are its two extreme measurements rather than its shape: 35.10 is the width at
 * the *far* edge and 17.56 is how far ahead that edge is. The near edge is only
 * 17.83 across. Emitting the true shape costs nothing and stops the near field
 * being overestimated by a factor of two.
 *
 * **Node names deliberately avoid the `^ref` vocabulary.** This file is a
 * reference for Blender and must never be imported as level data, so nothing in
 * it is named `ref`, `physical`, `cuboid` or anything else `F` §1 gives meaning
 * to. If the importer ever sees this file it should find nothing to do.
 *
 * The GLB writer is hand-rolled for the same reason the PNG writer is: glTF
 * binary is a header and two chunks, and it keeps a native toolchain out of a
 * repo that is currently vite plus three. It lives in `tools/lib/glb.mjs`,
 * shared with the pipeline fixture.
 */
import * as THREE from 'three/webgpu';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeGlb, box, merge } from './lib/glb.mjs';

import { BODY, HALF, WHEEL, REST_HEIGHT, CHASSIS_PARTS, WHEEL_MOUNTS } from '../src/world/Car.js';
import { BOARD, TITLE, POST, TOTAL_HEIGHT } from '../src/world/areas/ProjectsArea.js';
import { CELL } from '../src/world/Terrain.js';
import { PHI, THETA, RADIUS, IDEAL_RATIO, NON_IDEAL_RATIO_OFFSET } from '../src/world/View.js';
import { FOV } from '../src/render/Renderer.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../public/scale-reference.glb');

/**
 * The ground quad the camera holds at a given aspect, at its **resting** radius.
 *
 * Raycast onto the ground plane rather than solved in closed form, which is what
 * `View.updateOptimalArea` does and for the same reason — it stays correct if
 * the lens or the rig angles ever move. Unlike that method this one does *not*
 * apply the speed pull-back: a ruler should show what you see standing still.
 */
function groundFrame(aspect) {
  const ratioOverflow = Math.max(1, IDEAL_RATIO / aspect) - 1;
  const radius = RADIUS.max + ratioOverflow * NON_IDEAL_RATIO_OFFSET;

  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.3, 900);
  camera.position.setFromSphericalCoords(radius, PHI, THETA);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const corner = (ndcX, ndcY) => {
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) {
      throw new Error(`frame corner (${ndcX}, ${ndcY}) misses the ground at aspect ${aspect}`);
    }
    return hit;
  };

  const bl = corner(-1, -1);
  const br = corner(1, -1);
  const tr = corner(1, 1);
  const tl = corner(-1, 1);

  const forward = new THREE.Vector3(-camera.position.x, 0, -camera.position.z).normalize();
  return {
    radius,
    corners: [bl, br, tr, tl],
    widthNear: bl.distanceTo(br),
    widthFar: tl.distanceTo(tr),
    ahead: tl.dot(forward),
    behind: bl.dot(forward),
  };
}

// ---------------------------------------------------------------- primitives
// Positions are baked in world space so every object lands in Blender at scale
// 1.0. A ruler you have to read a scale field off is not a ruler.
// `box` and `merge` come from tools/lib/glb.mjs; the wheel and the ground quad
// are this file's own.

/** Axis along X, matching `Car._buildVisual`'s `rotateZ(PI/2)` cylinder. */
function wheel(radius, width, cx, cy, cz, segments = 14) {
  const positions = [];
  const indices = [];
  const hw = width / 2;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const y0 = Math.cos(a0) * radius;
    const z0 = Math.sin(a0) * radius;
    const y1 = Math.cos(a1) * radius;
    const z1 = Math.sin(a1) * radius;
    const base = positions.length / 3;
    positions.push(
      cx - hw, cy + y0, cz + z0, cx + hw, cy + y0, cz + z0,
      cx + hw, cy + y1, cz + z1, cx - hw, cy + y1, cz + z1,
      cx - hw, cy, cz, cx + hw, cy, cz
    );
    indices.push(
      base, base + 1, base + 2, base, base + 2, base + 3, // tread
      base + 4, base + 3, base, // -X cap
      base + 5, base + 1, base + 2 // +X cap
    );
  }
  return { positions, indices };
}

/** A flat quad on the ground from four corners, wound counter-clockwise. */
function quad(corners, y = 0) {
  const positions = [];
  for (const c of corners) positions.push(c.x, y, c.z);
  return { positions, indices: [0, 1, 2, 0, 2, 3] };
}

// ---------------------------------------------------------------- the ruler

function main() {
  const landscape = groundFrame(IDEAL_RATIO);
  // 3:4 rather than a phone's 9:19.5, because 3:4 is what the 20.9 recorded in
  // `ProjectsArea.js` was measured at. Both are emitted so the difference is
  // visible rather than argued about.
  const tablet = groundFrame(3 / 4);
  const phone = groundFrame(9 / 19.5);

  // Wheel centres: on flat ground at rest, a wheel's centre is exactly its own
  // radius above the ground, whatever the suspension is doing above it.
  const wheelY = WHEEL.radius;
  const wheels = merge(
    ...WHEEL_MOUNTS.map(([x, z]) => wheel(WHEEL.radius, WHEEL.width, x, wheelY, z))
  );

  // The whole visual chassis, not just `BODY`. The spoiler runs 0.25 past the
  // body's tail and the cabin 0.27 above its roof; a ruler that showed only the
  // body box would be 8 % short in length and would hide the roof line
  // altogether.
  const chassis = merge(
    ...CHASSIS_PARTS.map((part) =>
      box(part.size[0], part.size[1], part.size[2],
        part.at[0], REST_HEIGHT + part.at[1], part.at[2])
    )
  );

  const boardMid = BOARD.base + BOARD.height / 2;
  const titleMid = BOARD.base + BOARD.height + TITLE.gap + TITLE.height / 2;
  const postHeight = BOARD.base + 0.12;
  const boardStack = merge(
    box(POST.size, postHeight, POST.size, -POST.spread, postHeight / 2, 0),
    box(POST.size, postHeight, POST.size, POST.spread, postHeight / 2, 0),
    box(BOARD.width, BOARD.height, BOARD.depth, 0, boardMid, 0),
    box(BOARD.width, TITLE.height, BOARD.depth, 0, titleMid, 0)
  );

  const objects = [
    { name: 'car-chassis', color: [0.89, 0.44, 0.23, 1], geometry: chassis },
    { name: 'car-wheels', color: [0.13, 0.14, 0.17, 1], geometry: wheels },
    { name: 'car-collider', color: [0.25, 0.66, 0.63, 0.35], geometry: box(HALF.x * 2, HALF.y * 2, HALF.z * 2, 0, REST_HEIGHT, 0) },
    // Stood off to the side so it does not intersect the car.
    { name: 'board-stack', color: [0.85, 0.82, 0.77, 1], geometry: (() => {
      const g = boardStack;
      for (let i = 0; i < g.positions.length; i += 3) g.positions[i] += 6;
      return g;
    })() },
    { name: 'terrain-cell', color: [0.55, 0.45, 0.34, 1], geometry: box(CELL, CELL, CELL, -6, CELL / 2, 0) },
    { name: 'frame-landscape-16x9', color: [0.49, 0.56, 0.41, 0.25], geometry: quad(landscape.corners, 0.002) },
    { name: 'frame-portrait-3x4', color: [0.25, 0.66, 0.63, 0.25], geometry: quad(tablet.corners, 0.004) },
    { name: 'frame-portrait-9x19_5', color: [0.76, 0.44, 0.62, 0.25], geometry: quad(phone.corners, 0.006) },
  ];

  const glb = writeGlb({
    generator: 'gamified-portfolio tools/build-scale-reference.mjs',
    sceneName: 'scale-reference',
    nodes: objects.map((object) => ({
      name: object.name,
      mesh: object.geometry,
      material: { name: object.name, color: object.color },
    })),
  });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, glb);

  const f = (n) => n.toFixed(2).padStart(6);
  console.log(`wrote public/scale-reference.glb - ${glb.length} bytes, ${objects.length} objects`);
  const ext = (geometry) => {
    let mn = [Infinity, Infinity, Infinity];
    let mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < geometry.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], geometry.positions[i + k]);
        mx[k] = Math.max(mx[k], geometry.positions[i + k]);
      }
    }
    return mx.map((v, k) => v - mn[k]);
  };
  const silhouette = ext(merge(chassis, wheels));
  console.log(`  car body box  ${f(BODY.width)} x ${f(BODY.height)} x ${f(BODY.length)}  centre y ${f(REST_HEIGHT)}, underside ${f(REST_HEIGHT - BODY.height / 2)}`);
  console.log(`  car SILHOUETTE ${f(silhouette[0])} x ${f(silhouette[1])} x ${f(silhouette[2])}  <- wheels and spoiler included; this is what has to fit through a gap`);
  console.log(`  car collider  ${f(HALF.x * 2)} x ${f(HALF.y * 2)} x ${f(HALF.z * 2)}  (taller than the body by ${f(HALF.y * 2 - BODY.height)})`);
  console.log(`  wheel         r ${f(WHEEL.radius)}  w ${f(WHEEL.width)}  centre y ${f(wheelY)}`);
  console.log(`  board stack   ${f(BOARD.width)} wide, ${f(TOTAL_HEIGHT)} tall  (base ${f(BOARD.base)}, board ${f(BOARD.height)}, plate ${f(TITLE.height)})`);
  console.log(`  terrain cell  ${f(CELL)}`);
  for (const [label, fr] of [['16:9   ', landscape], ['3:4    ', tablet], ['9:19.5 ', phone]]) {
    console.log(
      `  frame ${label} radius ${f(fr.radius)}  near ${f(fr.widthNear)} wide, far ${f(fr.widthFar)} wide,` +
        ` ${f(fr.ahead)} ahead / ${f(-fr.behind)} behind`
    );
  }
}

main();
