/**
 * Prove touch steering headlessly:
 *
 *   npm run check-touch
 *
 * The twelfth suite (3 Sep 2026, the touch session). Three layers, each
 * proven on the real module rather than a description of it:
 *
 *   - `core/stickMath.js`, pure: the reference's ring mapping — distance is
 *     the throttle (cubed), bearing is the steer, the rear 90° reverses, and
 *     the sign contract `Car.control` relies on (positive steer = right);
 *   - `core/Input.js` + `core/TouchStick.js` under a stubbed `window` and
 *     `document`, with a real three camera and a real ray: a touch ahead of
 *     the car writes `forward`, a mouse does not, a mode change releases a
 *     held finger and it stays released, a tap is a 200 ms hop, and the pad's
 *     buttons hold and let go through the same edges as a key;
 *   - the copy: `index.html` and `styles.css` say "drag to steer" on touch
 *     and no longer say "for now".
 *
 * **Every guard is made to fail once** (the standing rule). Exits 1 on any
 * mismatch.
 */
import { readFileSync } from 'node:fs';

// ---- the DOM a stubbed Input needs ----------------------------------------
class ClassList {
  constructor() {
    this.set = new Set();
  }
  add(...names) {
    for (const n of names) this.set.add(n);
  }
  remove(...names) {
    for (const n of names) this.set.delete(n);
  }
  contains(name) {
    return this.set.has(name);
  }
}
class Element extends EventTarget {
  constructor(rect = { left: 0, top: 0, width: 1000, height: 600 }) {
    super();
    this.classList = new ClassList();
    this.rect = rect;
    this.dataset = {};
    this.captured = [];
  }
  getBoundingClientRect() {
    return this.rect;
  }
  setPointerCapture(id) {
    // Chrome's behaviour for a pointer it is not tracking (a synthetic
    // event, a pointer that already ended): NotFoundError.
    if (id >= 900) throw new Error('NotFoundError: No active pointer with the given id is found.');
    this.captured.push(id);
  }
}
let coarse = true;
const windowStub = new EventTarget();
windowStub.innerWidth = 1000;
windowStub.innerHeight = 600;
windowStub.matchMedia = (query) => ({ matches: coarse && query.includes('pointer: coarse') });
globalThis.window = windowStub;
globalThis.document = { documentElement: new Element(), getElementById: () => null };
globalThis.self = globalThis;

const THREE = await import('three/webgpu');
const { readStick, stickActions, wrapAngle, STICK } = await import('../src/core/stickMath.js');
const { default: Input } = await import('../src/core/Input.js');
const { default: TouchStick, TouchPad } = await import('../src/core/TouchStick.js');

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${label.padEnd(62)}${ok ? 'ok' : '<-- FAIL'}${detail ? `  ${detail}` : ''}`);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('check-touch: the stick, the pad and the copy\n');

console.log('stickMath (the reference\'s ring, our numbers):');
{
  const far = STICK.radiusHigh + 1;
  const mid = (STICK.radiusLow + STICK.radiusHigh) / 2;
  // Heading 0 is +X; the car's right is +Z (right = forward × up, Y up).
  const ahead = readStick({ dx: far, dz: 0, heading: 0 });
  check('ahead, past the ring: full throttle, no steer', ahead.forward && ahead.drive === 1 && ahead.steer === 0);
  const inside = readStick({ dx: STICK.radiusLow * 0.5, dz: 0, heading: 0 });
  check('inside the inner radius: progress 0, throttle 0', inside.progress === 0 && inside.drive === 0);
  const half = readStick({ dx: mid, dz: 0, heading: 0 });
  check('halfway across the ring: progress ½, throttle ⅛ (cubed)', near(half.progress, 0.5) && near(half.drive, 0.125));
  const right = readStick({ dx: far * Math.cos(0.3), dz: far * Math.sin(0.3), heading: 0 });
  check('clockwise from above (toward +Z) steers RIGHT (positive)', right.forward && right.steer > 0 && right.steer < 1, right.steer.toFixed(3));
  const left = readStick({ dx: far * Math.cos(-0.3), dz: far * Math.sin(-0.3), heading: 0 });
  check('anticlockwise steers left, the mirror', near(left.steer, -right.steer));
  const lock = (Math.PI * 2 - STICK.forwardAmplitude) / 2;
  const atLock = readStick({ dx: far * Math.cos(lock), dz: far * Math.sin(lock), heading: 0 });
  check('45° off the nose is full lock', near(atLock.steer, 1));
  const beside = readStick({ dx: 0, dz: far, heading: 0 });
  check('90° off the nose is still forward, full lock', beside.forward && near(beside.steer, 1) && beside.drive === 1);
  const behind = readStick({ dx: -far, dz: 0, heading: 0 });
  check('straight behind: reverse, full throttle, no steer', !behind.forward && behind.drive === -1 && behind.steer === 0);
  const behindRight = readStick({ dx: -far * Math.cos(0.3), dz: far * Math.sin(0.3), heading: 0 });
  // Behind and to the car's right: the tail points at −X, the finger is at
  // +Z of it — anticlockwise from the tail, and the reverse flips the steer.
  check('behind-right: reverse, steer flipped (the reference\'s `*= -1`)', !behindRight.forward && behindRight.drive < 0 && behindRight.steer > 0);
  const turned = readStick({ dx: 0, dz: far, heading: Math.PI / 2 });
  check('a turned car reads the same finger as ahead', turned.forward && near(turned.steer, 0) && turned.drive === 1);
  const wrapped = readStick({ dx: far * Math.cos(-3), dz: far * Math.sin(-3), heading: 3 });
  check('the bearing wraps (heading 3, finger −3 = 0.28 apart)', wrapped.forward && near(Math.abs(wrapped.offset), 2 * Math.PI - 6));
  check('wrapAngle(3π) = π, wrapAngle(−3π) = π, wrapAngle(0.5) = 0.5', near(wrapAngle(3 * Math.PI), Math.PI) && near(wrapAngle(-3 * Math.PI), Math.PI) && near(wrapAngle(0.5), 0.5));
  const actions = stickActions({ drive: -0.3, steer: 0.7 });
  check('stickActions splits signs into the four keys', actions.forward === 0 && near(actions.back, 0.3) && near(actions.right, 0.7) && actions.left === 0);
  check('the numbers are a ring a thumb can use (low < high, arc < 2π)', STICK.radiusLow > 0 && STICK.radiusHigh > STICK.radiusLow && STICK.forwardAmplitude < Math.PI * 2);
}

console.log('\nInput + TouchStick (stubbed DOM, real camera, real ray):');
{
  // A camera above and behind a car at the origin, looking at it; the
  // screen point for any ground point comes from the same projection the
  // stick unprojects, so the test never guesses a pixel.
  const camera = new THREE.PerspectiveCamera(40, 1000 / 600, 0.1, 500);
  camera.position.set(0, 24, 24);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  let heading = Math.PI / 2; // facing +Z, toward the camera
  const car = { position: { x: 0, y: 1.135, z: 0 }, headingXZ: () => heading };
  const surface = new Element();
  const toClient = (x, z) => {
    const v = new THREE.Vector3(x, 0.65, z).project(camera);
    return { clientX: ((v.x + 1) / 2) * 1000, clientY: ((1 - v.y) / 2) * 600 };
  };
  const event = (type, id, at, pointerType = 'touch') =>
    Object.assign(new Event(type), { pointerId: id, pointerType, button: 0, ...at });

  const input = new Input({ filters: ['driving'] });
  check('a coarse, hover-less device boots in touch mode', input.mode === 'touch');
  const hops = [];
  const ring = { update() {}, hop: () => hops.push(1) };
  const stick = new TouchStick({ input, surface, camera, car, ring });

  const edges = [];
  input.on('action', (name, value) => edges.push(`${name}:${value > 0 ? 'on' : 'off'}`));

  // A finger ahead of the car (+Z), past the ring.
  const far = STICK.radiusHigh + 1;
  surface.dispatchEvent(event('pointerdown', 7, toClient(0, far)));
  check('a touch ahead of the car drives forward', stick.active && input.actions.forward === 1 && input.drive === 1, `drive ${input.drive.toFixed(3)}`);
  check('the surface captured the pointer', surface.captured.includes(7));
  check('the rising edge was emitted once', edges.filter((e) => e === 'forward:on').length === 1);

  // Move it ahead-right. Facing +Z, right = forward × up = (0,0,1) × (0,1,0)
  // = (−1, 0, 0): the car's right is −X.
  surface.dispatchEvent(event('pointermove', 7, toClient(-far, far)));
  check('moving the finger to the right of the nose steers right', input.steer > 0 && input.actions.left === 0, `steer ${input.steer.toFixed(3)}`);

  // A second canvas touch is ignored (ours, not the reference's: no pinch).
  surface.dispatchEvent(event('pointerdown', 8, toClient(0, -far)));
  check('a second finger on the canvas is ignored', stick.pointerId === 7 && input.drive > 0);
  surface.dispatchEvent(event('pointerup', 8, toClient(0, -far)));
  check('and its lift changes nothing', stick.active && input.drive > 0);

  // The car turns under a still finger: the reading follows on update().
  heading = -Math.PI / 2; // now facing −Z, away from the finger: it is behind
  stick.update(1 / 60);
  check('the car turning under a still finger re-reads on tick', input.drive < 0, `drive ${input.drive.toFixed(3)}`);

  // A mode change (a card opens) zeroes the actions and the stick lets go.
  input.setFilters(['card']);
  input._onBlur();
  check('the mode change zeroed the actions', input.drive === 0 && input.steer === 0);
  stick.update(1 / 60);
  check('the held finger is released on the next tick, not replayed', !stick.active && input.drive === 0);
  input.setFilters(['driving']);
  stick.update(1 / 60);
  check('and stays released when control returns', !stick.active && input.drive === 0);
  surface.dispatchEvent(event('pointerup', 7, toClient(0, far)));
  check('the late lift is a no-op', !stick.active && input.drive === 0);

  // A mouse is not a touch.
  surface.dispatchEvent(event('pointerdown', 9, toClient(0, far), 'mouse'));
  check('a mouse pointer does not drive the stick', !stick.active && input.drive === 0);
  const desk = new TouchStick({ input, surface, camera, car, anyPointer: true });
  surface.dispatchEvent(event('pointerdown', 10, toClient(far, 0), 'mouse'));
  check('unless anyPointer (the #touch flag) lets it', desk.active && input.drive === 1);
  surface.dispatchEvent(event('pointerup', 10, toClient(far, 0), 'mouse'));
  desk.dispose();

  // A tap inside the inner radius is a hop.
  edges.length = 0;
  surface.dispatchEvent(event('pointerdown', 11, toClient(0.3, 0.3)));
  check('a touch on the car itself moves nothing', stick.active && input.drive === 0 && stick.inRadiusLow);
  surface.dispatchEvent(event('pointerup', 11, toClient(0.3, 0.3)));
  check('lifting it is a tap: jump on, the ring hops', input.actions.jump === 1 && hops.length === 1 && edges.includes('jump:on'));
  stick.update(STICK.tapSeconds / 2);
  check('still tall halfway through the reference\'s 200 ms', input.actions.jump === 1);
  stick.update(STICK.tapSeconds);
  check('and low after it, with the falling edge', input.actions.jump === 0 && edges.includes('jump:off'));
  surface.dispatchEvent(event('pointerdown', 12, toClient(0.3, 0.3)));
  surface.dispatchEvent(event('pointermove', 12, toClient(0, far)));
  surface.dispatchEvent(event('pointerup', 12, toClient(0, far)));
  check('a drag that leaves the inner radius is not a tap', input.actions.jump === 0 && hops.length === 1);

  // A capture the browser refuses must not wedge the stick (measured on the
  // production build, 3 Sep: an aborted _onDown left it claimed).
  surface.dispatchEvent(event('pointerdown', 900, toClient(0, -far))); // ahead: the car faces −Z now
  check('a refused pointer capture still drives', stick.active && input.drive === 1, `drive ${input.drive}`);
  surface.dispatchEvent(event('pointerup', 900, toClient(0, -far)));
  check('and still lets go', !stick.active && input.drive === 0);

  // Not while the mode forbids it.
  input.setFilters(['card']);
  surface.dispatchEvent(event('pointerdown', 13, toClient(0, far)));
  check('no stick while driving is filtered out', !stick.active && input.drive === 0);
  input.setFilters(['driving']);

  // Input.set's contract.
  let threw = false;
  try {
    input.set('nope', 1);
  } catch {
    threw = true;
  }
  check('Input.set refuses an unknown action', threw);
  edges.length = 0;
  input.set('forward', 0.5);
  input.set('forward', 0.7);
  check('a fractional value is stored and one edge emitted per press', input.actions.forward === 0.7 && edges.filter((e) => e === 'forward:on').length === 1);
  input.set('forward', 0);
  check('0 ends it', input.actions.forward === 0 && edges.at(-1) === 'forward:off');

  // The pad.
  const boost = new Element();
  boost.dataset.action = 'boost';
  const jump = new Element();
  jump.dataset.action = 'jump';
  const root = { querySelectorAll: () => [boost, jump] };
  new TouchPad(input, root);
  boost.dispatchEvent(event('pointerdown', 20, {}));
  check('holding the boost button boosts', input.actions.boost === 1 && boost.classList.contains('is-down'));
  boost.dispatchEvent(event('pointerup', 20, {}));
  boost.dispatchEvent(event('pointerdown', 901, {}));
  check('a refused capture still presses the button', input.actions.boost === 1);
  boost.dispatchEvent(event('pointerup', 901, {}));
  boost.dispatchEvent(event('pointerdown', 20, {}));
  boost.dispatchEvent(event('pointerup', 20, {}));
  check('letting go stops it', input.actions.boost === 0 && !boost.classList.contains('is-down'));
  jump.dispatchEvent(event('pointerdown', 21, {}));
  jump.dispatchEvent(new Event('pointercancel'));
  check('a cancelled pointer lets go too', input.actions.jump === 0);
  jump.dispatchEvent(event('pointerdown', 22, {}));
  check('a held jump is the tall stance, like Space', input.actions.jump === 1);
  input.setFilters(['card']);
  input._onBlur();
  check('a mode change ends a held button (the stuck-throttle rule)', input.actions.jump === 0);
  jump.dispatchEvent(event('pointerup', 22, {}));
  check('the pad has no elements without a root and does not throw', new TouchPad(input, null).buttons.length === 0);

  // A keyboard-first device.
  coarse = false;
  const desk2 = new Input({ filters: ['driving'] });
  check('a hover-capable device boots in keyboard mode', desk2.mode === 'keyboard');
  stick.dispose();
}

console.log('\nthe copy:');
{
  const html = readFileSync('index.html', 'utf8');
  const css = readFileSync('src/styles.css', 'utf8');
  check('index.html has the touch pad with boost and jump', /id="touch-pad"/.test(html) && /data-action="boost"/.test(html) && /data-action="jump"/.test(html));
  check('the controls sheet has a touch table beside the keys table', /controls__table--touch/.test(html) && /controls__table--keys/.test(html));
  check('the touch table teaches the drag, the tap and the buttons', /drag from the car/.test(html) && /tap the car/.test(html) && /hold <span class="key">boost<\/span>/.test(html));
  check('the feet name the pill on touch', /for-touch">Tap <span class="key">controls<\/span>/.test(html));
  check('the stylesheet says "drag to steer" on touch', /\.input-touch \.controls__title::after\s*\{[^}]*drag to steer/.test(css));
  check('nothing says "for now" any more', !/for now/.test(css) && !/for now/.test(html));
  check('the pad shows only under .input-touch', /\.input-touch \.touch-pad\s*\{[^}]*display:\s*flex/.test(css) && /\.touch-pad\s*\{[^}]*display:\s*none/.test(css));
  check('the canvas refuses the browser\'s touch gestures', /#webgl\s*\{[^}]*touch-action:\s*none/.test(css));
  check('the hint is clickable (the touch unstuck button)', /\.hint\s*\{[^}]*pointer-events:\s*auto/.test(css));
  check('no em-dashes in the touch copy (prose register)', !/controls__table--touch[\s\S]*?<\/table>/.exec(html)?.[0].includes('—'));
}

console.log(`\ncheck-touch: ${failed ? `${failed} FAILED` : 'ok'}`);
process.exit(failed ? 1 : 0);
