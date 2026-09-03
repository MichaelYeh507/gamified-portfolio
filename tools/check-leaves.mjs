/**
 * Prove the leaves' simulation, headlessly:
 *
 *   npm run check-leaves
 *
 * `world/leavesSim.js` is the reference's compute shader as a pure step, so the contracts
 * the world relies on can be run here without a GPU: a leaf never sinks under
 * its floor and floats on water, never leaves the window around the focus, is
 * not pushed by a parked car and is pushed by a moving one, and settles
 * rather than drifting on a still day. **Every guard is made to fail once**
 * (the standing rule).
 *
 * Exits 1 on any mismatch.
 */
const { createLeaves, stepLeaves, gustNoise, LEAF } = await import('../src/world/leavesSim.js');

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${label.padEnd(58)}${ok ? 'ok' : '<-- FAIL'}${detail ? `  ${detail}` : ''}`);
};

console.log('check-leaves: the reference\x27s leaves, the simulation half\n');

// A seeded rand so a failure reproduces.
let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const SIZE = 44;
const still = {
  delta: 1 / 60,
  focus: { x: 0, z: 0 },
  car: { x: 1000, y: 0, z: 1000, dx: 0, dz: 0 },
  wind: { dx: 0, dz: 1, strength: 0, time: 0 },
  groundAt: () => 0,
  waterLevel: -0.3,
};
const run = (leaves, env, steps) => {
  for (let i = 0; i < steps; i++) stepLeaves(leaves, env);
};

console.log('the noise:');
{
  let min = 1;
  let max = 0;
  for (let i = 0; i < 2000; i++) {
    const n = gustNoise(rand() * 100, rand() * 100);
    min = Math.min(min, n);
    max = Math.max(max, n);
  }
  check('gust noise stays in 0..1', min >= 0 && max <= 1, `${min.toFixed(2)}..${max.toFixed(2)}`);
  check('gust noise is continuous (guard made to fail)', Math.abs(gustNoise(3.2, 4.7) - gustNoise(3.2001, 4.7)) < 0.01);
}

console.log('\nthe floor and the window:');
{
  const leaves = createLeaves(256, SIZE, rand);
  check('leaves are born inside the window', [...Array(256).keys()].every((i) =>
    Math.abs(leaves.position[i * 3]) <= SIZE / 2 + 15 && Math.abs(leaves.position[i * 3 + 2]) <= SIZE / 2));
  run(leaves, still, 120);
  let under = 0;
  let outside = 0;
  for (let i = 0; i < 256; i++) {
    if (leaves.position[i * 3 + 1] < 0.02 - 1e-6) under++;
    if (Math.abs(leaves.position[i * 3]) > SIZE / 2 || Math.abs(leaves.position[i * 3 + 2]) > SIZE / 2) outside++;
  }
  check('no leaf sinks under its floor (guard made to fail)', under === 0, `${under} under`);
  check('no leaf leaves the window', outside === 0, `${outside} outside`);

  // Water: the floor is the surface, the leaf floats.
  const wet = createLeaves(32, SIZE, rand);
  run(wet, { ...still, groundAt: () => -1.2 }, 120);
  check('over water a leaf floats on the surface', [...Array(32).keys()].every((i) =>
    Math.abs(wet.position[i * 3 + 1] - (-0.3 + 0.02)) < 1e-4));

  // The window follows the focus.
  const moved = createLeaves(64, SIZE, rand);
  run(moved, { ...still, focus: { x: 100, z: -50 } }, 2);
  check('the window follows the focus point', [...Array(64).keys()].every((i) =>
    Math.abs(moved.position[i * 3] - 100) <= SIZE / 2 && Math.abs(moved.position[i * 3 + 2] + 50) <= SIZE / 2));
}

console.log('\nthe car:');
{
  const parked = createLeaves(64, SIZE, rand);
  // Put every leaf right beside the car.
  for (let i = 0; i < 64; i++) {
    parked.position[i * 3] = 1 + (rand() - 0.5) * 0.4;
    parked.position[i * 3 + 2] = (rand() - 0.5) * 0.4;
  }
  const before = Float32Array.from(parked.position);
  run(parked, { ...still, car: { x: 0, y: 0, z: 0, dx: 0, dz: 0 } }, 30);
  let drift = 0;
  for (let i = 0; i < 64; i++) drift = Math.max(drift, Math.abs(parked.position[i * 3] - before[i * 3]));
  check('a parked car pushes nothing', drift < 1e-3, `max drift ${drift.toFixed(4)}`);

  const driven = createLeaves(64, SIZE, rand);
  for (let i = 0; i < 64; i++) {
    driven.position[i * 3] = 1 + (rand() - 0.5) * 0.4;
    driven.position[i * 3 + 2] = (rand() - 0.5) * 0.4;
  }
  // A car at 6 m/s: 0.1 units per frame, driving +x through the leaves.
  run(driven, { ...still, car: { x: 0, y: 0, z: 0, dx: 0.1, dz: 0 } }, 1);
  let pushed = 0;
  let lifted = 0;
  for (let i = 0; i < 64; i++) {
    if (driven.velocity[i * 3] > 0.5) pushed++;
  }
  run(driven, { ...still, car: { x: 0, y: 0, z: 0, dx: 0.1, dz: 0 } }, 10);
  for (let i = 0; i < 64; i++) if (driven.position[i * 3 + 1] > 0.05) lifted++;
  check('a moving car pushes the leaves ahead of it (guard made to fail)', pushed === 64, `${pushed}/64 pushed`);
  check('pushed leaves take to the air', lifted > 32, `${lifted}/64 airborne`);

  // Kicked leaves settle: damping wins over ten seconds.
  run(driven, still, 600);
  let flying = 0;
  for (let i = 0; i < 64; i++) if (driven.position[i * 3 + 1] > 0.05) flying++;
  check('kicked leaves settle again', flying === 0, `${flying} still airborne`);
}

console.log('\nthe wind:');
{
  const leaves = createLeaves(128, SIZE, rand);
  const before = Float32Array.from(leaves.position);
  run(leaves, { ...still, wind: { dx: 1, dz: 0, strength: 0.5, time: 0 } }, 120);
  let downwind = 0;
  for (let i = 0; i < 128; i++) {
    // Compare modulo the window: a leaf that wrapped still moved +x.
    const d = leaves.position[i * 3] - before[i * 3];
    if (d > 0 || d < -SIZE / 2) downwind++;
  }
  check('a wind moves leaves downwind, most of them', downwind > 96, `${downwind}/128 downwind`);
  check('the reference\x27s numbers stand', LEAF.push === 100 && LEAF.pushSideways === 20 && LEAF.gravity === 9.807 && LEAF.clockScale === 2);
}

console.log('');
if (failed) {
  console.error(`check-leaves: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('check-leaves: ok');
