/**
 * Sweep the sunken-plaza test (`KNOWN-ISSUES.md` 18) across sink depths.
 *
 *   npm run sweep-basin
 *
 * The depth is a look call and it is Michael's. What this produces is the table
 * the reference author makes it against: for each candidate depth, the four things that could make
 * a depth wrong for reasons that are **not** a matter of taste.
 *
 *   rim gradient   the number `KNOWN-ISSUES.md` 18 was really about. 0.273 is
 *                  the trunk channel Michael drove and did not complain about; 0.405
 *                  is the one the reference author found by feel and called "rugged". A basin is
 *                  supposed to hold 0.273 by construction — this checks it does
 *                  on the **sampled 1.5-unit grid**, which is where the wheels
 *                  actually are, not on the analytic surface.
 *   flooding       past 0.3 of sink the floor is under `WATER_SURFACE` and the
 *                  plaza has water in it. Not a failure — the reference's whole map is
 *                  terrain carved under one water quad — but a design choice.
 *   rim extent     past the plaza's clearing, `Island` scatters trees down the
 *                  slope. This is the limit that binds first.
 *   framing        how far down the frame the boards move, which is decision
 *                  44's lever and the reason the test exists.
 *
 * **One child process per depth**, and the first attempt got this wrong in a way
 * worth recording. `flags.js` parses `location.hash` once at module load, so
 * re-importing `Terrain.js` with a cache-busting query gives a fresh `Terrain`
 * that still resolves the **cached** `flags.js` — every row measured the same
 * world, the table filled in, and every line of it was identical and wrong. A
 * process per depth is the only isolation that is isolation. The `applied`
 * column exists so that failure can never come back silently: it is read out of
 * the terrain the child actually built, not out of the depth the parent asked
 * for.
 *
 * The camera model is `tools/build-scale-reference.mjs`'s, already verified
 * against the running build at three aspects. Sinking moves the plaza down in
 * world Y and does not move the camera at all — the focus point is pinned to
 * `y = 0` (`View.js:351`), which is the mechanism decision 46 turned on — so the
 * framing shift is exact rather than simulated. Checked: at 16:9 the model gives
 * a stack top of 0.800 flat and 0.725 at a sink of 0.6, against **0.8004 and
 * 0.7248** measured on the running build through the real camera.
 */
import './lib/hash-shim.mjs'; // MUST be first - see the file for why
import * as THREE from 'three/webgpu';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PHI, THETA, RADIUS, IDEAL_RATIO, NON_IDEAL_RATIO_OFFSET } from '../src/world/View.js';
import { FOV } from '../src/render/Renderer.js';
import { plazaLayout, plazaFloorRadius, BOARD, TOTAL_HEIGHT } from '../src/world/areas/ProjectsArea.js';
import areaDefs from '../src/content/areas.js';
import projects from '../src/content/projects.js';

const PROJECTS = areaDefs.find((d) => d.id === 'projects');
const CENTER = PROJECTS.center;
const CLEARING = PROJECTS.clearing;
const FLOOR_RADIUS = plazaFloorRadius(PROJECTS, projects.length);

const DEPTHS = [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1.0, 1.2, 1.25];

/**
 * Measure one depth in **its own process**.
 *
 * A re-import with a cache-buster is not enough: `Terrain.js` would be fresh but
 * the `flags.js` it imports would be the cached one, so every row would measure
 * the same world and the table would look plausible and be wrong. One process
 * per depth is the only isolation that is actually isolation.
 */
function measureInChild(depth) {
  const self = fileURLToPath(import.meta.url);
  const hash = depth > 0 ? `#sink=${depth}` : '';
  const run = spawnSync(process.execPath, [self, `--hash=${hash}`, `--depth=${depth}`], {
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    throw new Error(`sweep-basin: child for depth ${depth} failed:\n${run.stderr}`);
  }
  return JSON.parse(run.stdout);
}

/**
 * Peak slope across the rim, measured the way the wheels meet it: adjacent
 * samples of the **collision grid**, not the analytic derivative.
 */
function rimGradient(terrain, depth) {
  const { heightAt, CELL } = terrain;
  let peak = 0;
  let peakAt = 0;
  // Radially outward from the centre, along the worst-case bearing (any, since
  // a basin is circular) - but stepped at the grid pitch so it is the staircase
  // the collider actually presents.
  for (let r = 0; r < CLEARING + 8; r += CELL) {
    const a = heightAt(CENTER[0] + r, CENTER[1]);
    const b = heightAt(CENTER[0] + r + CELL, CENTER[1]);
    const slope = Math.abs(b - a) / CELL;
    if (slope > peak) { peak = slope; peakAt = r; }
  }
  return { peak, peakAt };
}

/** Is the floor level where the boards stand, and how deep is the water on it? */
function floorAndWater(terrain, depth) {
  const { heightAt, WATER_SURFACE } = terrain;
  const points = plazaLayout(CENTER, 3);
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const h = heightAt(p.x, p.z);
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  const centre = heightAt(CENTER[0], CENTER[1]);
  return {
    boardSpread: max - min,
    centre,
    waterDepth: Math.max(0, WATER_SURFACE - centre),
  };
}

/**
 * Where the boards sit in frame at a given sink, at rest, 16:9.
 *
 * Sinking translates every board down by `depth`; the camera does not move,
 * because its focus is pinned to y = 0 regardless of the ground under the car.
 */
function framing(depth) {
  const aspect = IDEAL_RATIO;
  const ratioOverflow = Math.max(1, IDEAL_RATIO / aspect) - 1;
  const radius = RADIUS.max + ratioOverflow * NON_IDEAL_RATIO_OFFSET;

  // The car stands on the area spawn, and the camera focuses on (x, 0, z).
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.3, 900);
  camera.position.set(CENTER[0], 0, CENTER[1]);
  const offset = new THREE.Vector3().setFromSphericalCoords(radius, PHI, THETA);
  camera.position.add(offset);
  camera.lookAt(CENTER[0], 0, CENTER[1]);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const across = { x: -Math.SQRT1_2, z: Math.SQRT1_2 };
  const toCamera = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
  const v = new THREE.Vector3();
  let top = -Infinity;
  let base = Infinity;
  let left = Infinity;
  let right = -Infinity;
  // All eight corners of the box, **including its depth**. Projecting the
  // centreline plane instead looks equivalent and is not: the front face is
  // BOARD.depth/2 closer to the camera, which lifts the stack's top edge by a
  // constant 0.006 of ndc. Checked against the running build — with the depth
  // the model lands on the measured value, without it the deltas were still
  // exact to 0.0004 but every absolute was low.
  for (const p of plazaLayout(CENTER, 3)) {
    for (const side of [-1, 1]) {
      for (const face of [-1, 1]) {
        for (const y of [0, TOTAL_HEIGHT]) {
          v.set(
            p.x + side * (BOARD.width / 2) * across.x + face * (BOARD.depth / 2) * toCamera.x,
            y - depth,
            p.z + side * (BOARD.width / 2) * across.z + face * (BOARD.depth / 2) * toCamera.z
          ).project(camera);
          top = Math.max(top, v.y);
          base = Math.min(base, v.y);
          left = Math.min(left, v.x);
          right = Math.max(right, v.x);
        }
      }
    }
  }
  return { top, base, left, right };
}

/** Child mode: one depth, one JSON line on stdout. */
async function child(depth) {
  const terrain = await import('../src/world/Terrain.js');
  const grad = rimGradient(terrain, depth);
  const fw = floorAndWater(terrain, depth);
  process.stdout.write(
    JSON.stringify({
      depth,
      grad,
      fw,
      // Reported from the child so the sink the terrain actually applied is the
      // one in the table, rather than the one the parent believes it asked for.
      basinAtCentre: terrain.basinAt(CENTER[0], CENTER[1]),
    })
  );
}

async function main() {
  const depthArg = process.argv.find((a) => a.startsWith('--depth='));
  if (depthArg) return child(Number.parseFloat(depthArg.slice('--depth='.length)));

  console.log('the sunken-plaza test - KNOWN-ISSUES 18\n');
  console.log(
    `plaza [${CENTER}], clearing ${CLEARING}, floor radius ${FLOOR_RADIUS.toFixed(2)} ` +
      `(from plazaFloorRadius, the same call ProjectsArea draws the disc with)\n`
  );
  console.log(
    'sink   applied   rim grad   at r   rim ends   spread   floor y   water   ndc top   ndc base'
  );

  const rows = [];
  for (const depth of DEPTHS) {
    const { grad, fw, basinAtCentre } = measureInChild(depth);
    const frame = framing(depth);
    const rimEnd = FLOOR_RADIUS + (depth * 1.5) / 0.273;
    rows.push({ depth, grad, fw, frame, rimEnd, basinAtCentre });

    const f = (n, w = 6, d = 3) => n.toFixed(d).padStart(w);
    console.log(
      `${depth.toFixed(2).padStart(4)}   ${f(basinAtCentre, 7)}   ${f(grad.peak)}` +
        `   ${grad.peakAt.toFixed(1).padStart(4)}` +
        `   ${rimEnd.toFixed(1).padStart(5)}${rimEnd > CLEARING ? ' !!' : '   '}` +
        `   ${f(fw.boardSpread)}   ${f(fw.centre)}  ${f(fw.waterDepth, 5, 2)}` +
        `   ${f(frame.top)}   ${f(frame.base)}`
    );
  }

  const flat = rows[0];
  console.log('\nwhat each column means for the call:');
  console.log(
    `  rim grad   0.273 is the trunk channel Michael drove without complaint; 0.405 is the`
  );
  console.log(`             one the reference author called rugged. Anything at or under 0.273 is known-good.`);
  console.log(`  rim ends   "!!" means the rim runs past the clearing of ${CLEARING} and Island will`);
  console.log(`             scatter props down the slope. This limit binds before any other.`);
  console.log(`  water      depth of water standing on the plaza floor. 0 up to a sink of 0.30.`);
  console.log(
    `  ndc top    boards' top edge; the frame edge is 1.0. At sink 0 it is ${flat.frame.top.toFixed(3)},`
  );
  console.log(`             and each 0.1 of sink moves it ${(Math.abs(rows[2].frame.top - flat.frame.top) / 0.3 * 0.1).toFixed(4)} further down, i.e. that much more top clearance.`);
  console.log('\nboard spread is the height difference between the three boards. A basin has a');
  console.log('flat floor, so it must stay 0.000 at every depth - that is what makes it a basin');
  console.log('and not a dish.');
}

main();
