/**
 * The reference's leaves, the simulation half — `World/Leaves.js:171-253`, the reference's compute
 * shader rewritten as a pure step over flat arrays.
 *
 * Pure on purpose, the `corridorPlan` pattern: no three.js, no game state,
 * every input injected, so `check-leaves` can run the same maths the world
 * runs and prove the contracts headlessly — a leaf never sinks under its
 * floor, never leaves the window, is not pushed by a parked car and is
 * pushed by a moving one.
 *
 * **Why CPU, when the reference's is a GPU compute pass.** The reference's `instancedArray` +
 * `.compute()` path needs a compute-capable backend, and this site ships a
 * WebGL2 fallback. A thousand leaves through this loop cost well under a
 * tenth of a millisecond, and the positions travel to the vertex stage as
 * one 1024 × 1 float texture — the boost trails' and the wheel tracks'
 * proven road. The numbers are all the reference's: push 100 / sideways 20 by the
 * car's **per-frame displacement** (the reference's `physicalVehicle.velocity` is a
 * position delta, not m/s — read at `PhysicsVehicle.js:519`), wind by a
 * perlin gust against the wind strength times the leaf's weight, an upward
 * lift proportional to horizontal speed that fades by 6 units up, damping
 * 1.5 on land and 0.75 on water (leaves skate on water), gravity 9.807 by
 * weight, integrated on the reference's doubled clock (`deltaScaled`, ×2).
 */

export const LEAF = Object.freeze({
  scale: 0.25,
  rotationFrequency: 3,
  pushSideways: 20,
  push: 100,
  windFrequency: 0.005,
  windMultiplier: 0.5,
  upward: 1,
  damping: 1.5,
  waterDamping: 0.75,
  gravity: 9.807,
  /** The reference's `ticker.scale`: the sim integrates on twice the wall clock. */
  clockScale: 2,
});

/**
 * A tiny 2D value noise in 0..1, smooth, tileable enough for gusts. Stands in
 * for the reference's perlin texture sample on the CPU; the wind field the trees sway in
 * stays the GPU one, this only decides which leaves a gust reaches.
 */
export function gustNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * The arrays, seeded: positions scattered over the window and clumped by
 * the gust noise (the reference's `position.x += perlin * 15`), weights 0.1..0.2.
 */
export function createLeaves(count, size, rand = Math.random) {
  const position = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  const weight = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x = (rand() - 0.5) * size;
    const z = (rand() - 0.5) * size;
    x += gustNoise(x * 0.02, z * 0.02) * 15;
    position[i * 3] = x;
    position[i * 3 + 1] = 0;
    position[i * 3 + 2] = z;
    weight[i] = rand() * 0.1 + 0.1;
  }
  return { count, size, position, velocity, weight };
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const remapClamp = (v, a, b, ra, rb) => ra + (rb - ra) * clamp01((v - a) / (b - a));

/**
 * One step. `car` carries the position and the per-frame displacement;
 * `groundAt(x, z)` is the height field, sampled once per leaf, and
 * `waterLevel` decides both where a leaf floats and where it skates.
 *
 * @param {ReturnType<typeof createLeaves>} leaves
 * @param {{
 *   delta: number,
 *   focus: { x: number, z: number },
 *   car: { x: number, y: number, z: number, dx: number, dz: number },
 *   wind: { dx: number, dz: number, strength: number, time: number },
 *   groundAt: (x: number, z: number) => number,
 *   waterLevel: number,
 * }} env
 */
export function stepLeaves(leaves, env) {
  const { count, size, position, velocity, weight } = leaves;
  const { focus, car, wind, groundAt, waterLevel } = env;
  const dt = env.delta * LEAF.clockScale;
  const half = size / 2;
  const carSpeed = Math.hypot(car.dx, car.dz);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    let px = position[i3];
    let py = position[i3 + 1];
    let pz = position[i3 + 2];
    let vx = velocity[i3];
    let vy = velocity[i3 + 1];
    let vz = velocity[i3 + 2];
    const w = weight[i];

    // Push from the car: along its motion, plus straight away from it,
    // scaled by how fast it moves and how close the leaf is (0.5 → 2).
    const dx = px - car.x;
    const dy = py - car.y;
    const dz = pz - car.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const vehicleMultiplier = remapClamp(distance, 0.5, 2, 1, 0);
    if (vehicleMultiplier > 0 && carSpeed > 0) {
      const flat = Math.hypot(dx, dz) || 1;
      const sideX = (dx / flat) * LEAF.pushSideways;
      const sideZ = (dz / flat) * LEAF.pushSideways;
      vx += (car.dx * LEAF.push + sideX) * carSpeed * vehicleMultiplier;
      vz += (car.dz * LEAF.push + sideZ) * carSpeed * vehicleMultiplier;
    }

    // Wind: a gust where the noise dips under the wind's strength.
    const gust = gustNoise(
      px * LEAF.windFrequency + wind.dx * wind.time,
      pz * LEAF.windFrequency + wind.dz * wind.time
    );
    const windStrength = Math.max(0, (wind.strength - gust) * w * LEAF.windMultiplier);
    vx += wind.dx * windStrength;
    vz += wind.dz * windStrength;

    // Upward fly: moving leaves lift, less the higher they are.
    const upwardDim = remapClamp(py, 0, 6, 1, 0);
    vy = Math.min(Math.hypot(vx, vz), 2) * LEAF.upward * upwardDim;

    // One height-field read per leaf: the floor it rests on (or the water
    // it floats on), and whether it skates.
    const ground = groundAt(px, pz);
    const wet = ground < waterLevel;

    // Damping: lower on water so leaves skate, full in the air.
    const groundDamping = wet ? LEAF.waterDamping : LEAF.damping;
    const airDamping = py > 0.05 ? LEAF.damping : 0;
    const damping = Math.max(groundDamping, airDamping) * dt;
    const keep = 1 - damping;
    vx *= keep;
    vy *= keep;
    vz *= keep;

    // Gravity, per step as the reference's is.
    vy -= LEAF.gravity * w;

    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    // Rest on the ground, or float on the water. Sampled before the move:
    // a step is a few centimetres and the field is 1.5-unit cells.
    const floor = (wet ? waterLevel : ground) + 0.02;
    if (py < floor) py = floor;

    // The loop: the window follows the focus, a leaf that leaves one side
    // comes back on the other.
    px = ((((px + half - focus.x) % size) + size) % size) - half + focus.x;
    pz = ((((pz + half - focus.z) % size) + size) % size) - half + focus.z;

    position[i3] = px;
    position[i3 + 1] = py;
    position[i3 + 2] = pz;
    velocity[i3] = vx;
    velocity[i3 + 1] = vy;
    velocity[i3 + 2] = vz;
  }
}
