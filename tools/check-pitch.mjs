/**
 * Prove the football pitch's site and shape, headlessly:
 *
 *   npm run check-pitch
 *
 * `world/pitchPlan.js` is pure, so the layout the world builds can be swept
 * here against the real height field the way the districts are: the patch
 * dry and flat at three radii, clear of the roads, the contact hangout, the
 * career corridor's clearing and the shore; and the goal's shape against
 * the ball and the car. **Every guard is made to fail once** (the standing
 * rule). Exits 1 on any mismatch.
 */
const { pitchPlan, PITCH, GOAL, BALL, BUMP, BUTTON, RESET_PROMPT } = await import('../src/world/pitchPlan.js');
const { heightAt, beachRadius, WATER_SURFACE, HALF } = await import('../src/world/Terrain.js');
const { distanceToRoutes, ROAD } = await import('../src/world/wayfindingPlan.js');
const { default: areaDefs } = await import('../src/content/areas.js');

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${label.padEnd(60)}${ok ? 'ok' : '<-- FAIL'}${detail ? `  ${detail}` : ''}`);
};

console.log('check-pitch: the ball and the goal, plan to ground\n');

const plan = pitchPlan();

console.log('the site:');
{
  const wet = plan.ring.filter((p) => heightAt(p.x, p.z) <= WATER_SURFACE + 0.15);
  const unflat = plan.ring.filter((p) => Math.abs(heightAt(p.x, p.z)) > 0.05);
  const worst = wet[0] ?? unflat[0];
  check(
    'the patch stands on dry flat ground at three radii',
    wet.length === 0 && unflat.length === 0,
    worst ? `${wet.length} wet / ${unflat.length} unflat, first: ${worst.what} at [${worst.x.toFixed(1)}, ${worst.z.toFixed(1)}]` : `${plan.ring.length} points`
  );
  for (const p of [plan.goal, plan.ball]) {
    check(`${p === plan.goal ? 'goal' : 'ball'} stands on dry flat ground`, Math.abs(heightAt(p.x, p.z)) <= 0.05, heightAt(p.x, p.z).toFixed(3));
  }
  const road = distanceToRoutes(plan.center.x, plan.center.z);
  check('clear of every road (patch edge past the shoulder)', road - PITCH.radius > ROAD.half + 1.5, `${road.toFixed(1)} from a route`);
  for (const def of areaDefs.filter((d) => d.clearing)) {
    const d = Math.hypot(plan.center.x - def.center[0], plan.center.z - def.center[1]);
    check(`outside the ${def.id} clearing`, d > def.clearing + PITCH.radius * 0.5, `${d.toFixed(1)} against ${def.clearing}`);
  }
  const d = Math.hypot(plan.center.x, plan.center.z);
  const beach = beachRadius(Math.atan2(plan.center.z, plan.center.x));
  check('well inside the shore', beach - d > PITCH.radius + 3, `${(beach - d).toFixed(1)} inside`);
  // "Top right of the map": the map's frame is up-screen at the top.
  const right = (plan.center.x - plan.center.z) / Math.SQRT2;
  const down = (plan.center.x + plan.center.z) / Math.SQRT2;
  check('top-right of the map (guard made to fail)', right > 10 && down < -10, `map [${right.toFixed(0)}, ${down.toFixed(0)}]`);
}

console.log('\nthe goal and the ball:');
{
  // Rocket League's proportions, near enough: a ball about a car length
  // across, a goal a few balls wide and over a ball tall.
  check('the ball is car-sized (0.9 to 1.6 car lengths across)', BALL.radius * 2 > 3.1 * 0.9 && BALL.radius * 2 < 3.1 * 1.6, `${(BALL.radius * 2).toFixed(1)}`);
  check('the ball fits through the mouth with room', BALL.radius * 2 < GOAL.height - 1 && BALL.radius * 2 < GOAL.width / 2.5);
  check('the car (1.2 tall) fits under the crossbar', GOAL.height > 1.3);
  check('the net cords are denser than the ball', GOAL.mesh < BALL.radius && GOAL.mesh > BALL.radius * 0.3, `${GOAL.mesh} against ${BALL.radius}`);
  check('the ball is lighter than the car and heavier than a leaf', BALL.mass > 0.02 && BALL.mass < 2.5);
  check('the ball bounces but does not fly away', BALL.restitution > 0.3 && BALL.restitution < 0.8 && BALL.linearDamping > 0.2);
  check('the ball is floaty but still falls (gravity scale 0.15..0.8)', BALL.gravityScale >= 0.15 && BALL.gravityScale <= 0.8, `${BALL.gravityScale}`);
  const dGoalBall = Math.hypot(plan.goal.x - plan.ball.x, plan.goal.z - plan.ball.z);
  check('the ball starts in front of the goal, inside the patch', dGoalBall > GOAL.depth + BALL.radius && dGoalBall <= PITCH.radius, dGoalBall.toFixed(2));
  check('the clearing covers the patch and the goal', PITCH.clearing >= PITCH.radius + GOAL.depth);
}

console.log('\nthe reset prompt (beside the goal, on the real ground):');
{
  const p = plan.resetPrompt;
  check('stands on dry flat ground', heightAt(p.x, p.z) > WATER_SURFACE + 0.15 && Math.abs(heightAt(p.x, p.z)) <= 0.05, heightAt(p.x, p.z).toFixed(3));
  check('is inside the map', Math.abs(p.x) < HALF && Math.abs(p.z) < HALF);
  const dGoal = Math.hypot(p.x - plan.goal.x, p.z - plan.goal.z);
  check('is beside the goal, outside its width (guard made to fail)', dGoal > GOAL.width / 2 && dGoal < GOAL.width / 2 + RESET_PROMPT.side + RESET_PROMPT.ahead + 0.01, dGoal.toFixed(2));
  // On the mouth's side of the goal line, not behind the net.
  const mouth = { x: Math.sin(plan.goal.heading), z: Math.cos(plan.goal.heading) };
  const ahead = (p.x - plan.goal.x) * mouth.x + (p.z - plan.goal.z) * mouth.z;
  check('is in front of the goal line, not behind the net', ahead > 0 && ahead < GOAL.depth, ahead.toFixed(2));
  check('its reach covers the walk from the ball spot side (radius 5..12)', RESET_PROMPT.radius >= 5 && RESET_PROMPT.radius <= 12);
  check('the label says what it does', /reset/i.test(RESET_PROMPT.label) && /ball/i.test(RESET_PROMPT.label));
  const buttonTop = BUTTON.pedestal[1] + BUTTON.cap[1] + BUTTON.ring[1] + BUTTON.button[1];
  check('the pill floats above the button, within reach of it', RESET_PROMPT.height > buttonTop && RESET_PROMPT.height < buttonTop + 1, `${RESET_PROMPT.height} over ${buttonTop.toFixed(2)}`);
  check('the button is waist-high to the car, not a wall (0.8..1.6)', buttonTop > 0.8 && buttonTop < 1.6);
  check('the button sits inside its ring, the ring inside the cap', BUTTON.button[0] < BUTTON.ring[0] && BUTTON.ring[0] * 2 < BUTTON.pedestal[0] + BUTTON.cap[0] * 2);
}

console.log('\nthe bump loft:');
{
  check('a nudge lifts, a boosted hit flies (loft 1..6 m/s)', BUMP.loft >= 1 && BUMP.loft <= 6, `${BUMP.loft}`);
  check('the scale brackets 1 and the floor is below the ceiling', BUMP.scale[0] < 1 && BUMP.scale[1] >= 1 && BUMP.scale[0] < BUMP.scale[1]);
  check('a resting touch is not a bump (minSpeed > 0), full loft under boost cruise', BUMP.minSpeed > 0 && BUMP.fullSpeed > BUMP.minSpeed && BUMP.fullSpeed <= 40);
  check('one kick per contact, not sixty a second (cooldown 0.2..1 s)', BUMP.cooldown >= 0.2 && BUMP.cooldown <= 1);
  // Under the ball's own gravity a full loft hangs long enough to get under.
  const g = 9.81 * BALL.gravityScale;
  const hang = (2 * BUMP.loft) / g;
  check('a full loft hangs over a second (guard made to fail)', hang > 1 && hang < 6, `${hang.toFixed(2)} s`);
}

console.log(`\ncheck-pitch: ${failed ? `${failed} FAILED` : 'ok'}`);
process.exit(failed ? 1 : 0);
