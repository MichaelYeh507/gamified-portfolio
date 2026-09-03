import Game from './core/Game.js';
import { flag } from './core/flags.js';

const root = document.documentElement;
const stage = document.getElementById('stage');
const loader = document.getElementById('loader');
const fill = loader.querySelector('.loader__fill');
const fallback = document.getElementById('fallback');

/**
 * The reveal gate, from the kairui.dev teardown: do not lift the loader until
 * real frames have rendered AND a minimum time has elapsed. Without the minimum
 * a warm cache produces a strobe; without the frame count a cold start shows an
 * empty canvas for a beat.
 */
function waitForFrames(count, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    let seen = 0;
    const step = () => (++seen >= count ? finish() : requestAnimationFrame(step));
    requestAnimationFrame(step);

    // A backgrounded or hidden tab suspends requestAnimationFrame entirely, so
    // the frame count alone would leave the loader up forever and the visitor
    // would return to a permanently "loading" page. Time out onto the same
    // path; the scene is already built by this point either way.
    setTimeout(finish, timeoutMs);
  });
}

function whenVisible() {
  if (document.visibilityState === 'visible') return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', check);
      resolve();
    };
    document.addEventListener('visibilitychange', check);
  });
}

async function start() {
  const startedAt = performance.now();
  fill.style.transform = 'scaleX(0.25)';

  const game = await Game.boot(stage);
  window.game = game; // deliberate: the debug handle every one of these sites has

  // The 2a colour gate, behind `#gate` and imported only when asked for, so it
  // costs the shipped bundle nothing. Built before the cinematic rather than
  // after it, because the reveal rim is one of the five things the day cycle
  // drives and four seconds is the whole of its life on screen.
  if (flag('gate')) {
    const { default: ColorGate } = await import('./debug/ColorGate.js');
    game.gate = new ColorGate(game);
  }

  fill.style.transform = 'scaleX(0.85)';

  await waitForFrames(3);
  const elapsed = performance.now() - startedAt;
  if (elapsed < 900) await new Promise((r) => setTimeout(r, 900 - elapsed));

  fill.style.transform = 'scaleX(1)';
  root.classList.remove('is-loading');
  root.classList.add('is-ready');

  // Do not play the opening cinematic into a hidden tab.
  //
  // It is four seconds long and it happens once. A visitor who opened the site
  // in a background tab and came back to it a minute later would otherwise
  // arrive at a finished world with no idea anything had happened. Chrome
  // suspends `requestAnimationFrame` while the tab is hidden, so the tweens
  // would not advance either — but they *would* all complete in one frame the
  // moment it came back, which is worse than not playing at all.
  // Where you start, decided **before** the cinematic rather than after it — and
  // before `whenVisible()`, so a tab opened in the background is already standing
  // in the right place the moment somebody looks at it.
  //
  // This used to run after `playIntro()`, on the reasoning that the visitor
  // should not be respawned into a world that was still arriving. Decision 7
  // retired that worry — the world is whole from the first frame — and leaving it
  // late had a cost nobody had looked for: with `?at=` set, the intro finished
  // and *then* the car teleported, so the one moment the site gets to make an
  // impression ended with a jump cut. Michael asked for "a starting spawn
  // seamlessly from the intro", and this is the whole of it.
  //
  // The reveal centre moves with it. `Reveal` defaults to the origin and nothing
  // had ever called `setCenter`, which was invisible only because the car also
  // started at the origin — the moment it starts anywhere else, the disc of
  // ground would open up somewhere the car is not.
  //
  // Both halves now. `&p=<slug>` names one thing inside the area: `goTo` asks the
  // area where that thing stands and puts the car there, and `openTarget` below
  // opens it once there is something to see. `ProjectsArea` has written the full
  // URL since the card layer landed; this is the reader catching up.
  //
  // `p` without `at` is deliberately not honoured. Guessing which area owns a
  // slug would mean one area's content deciding another's routing, and the
  // failure it saves is somebody hand-editing a URL — `ProjectsArea` only ever
  // writes the pair.
  const params = new URLSearchParams(location.search);
  const at = params.get('at');
  const target = params.get('p');

  const area = at && game.areas.goTo(at, target) ? game.areas.get(at) : null;
  if (area) game.reveal.setCenter(game.car.position.x, game.car.position.z);
  else game.placeAtStart();

  await whenVisible();

  // The controls sheet appears when the car actually becomes drivable, which
  // is partway through the cinematic rather than at the end of it (see
  // `render/Intro.js`). Telling someone to press a key two seconds before the
  // key does anything is how a five-second intro starts feeling like a
  // five-second wait. It replaced the one-line hint on 2 Sep; `#hint` lives
  // on for the stuck offer.
  await game.playIntro();

  game.controls.showLaunch();

  console.info(`[portfolio] renderer backend: ${game.backend}`);

  // The card the link asked for, and it waits for the *whole* cinematic rather
  // than for `playIntro()`.
  //
  // `playIntro()` resolves at the start of step 1, with two seconds of reveal
  // still to run — that is deliberate and it is the reference's (control unlocks while the
  // world is still arriving). Opening a panel into the middle of it would put a
  // 55 % scrim over the one moment the site gets to introduce itself. So: drive
  // away immediately if you want to, and the card arrives when the world has
  // finished. **This line is the knob** if that reads wrong — `game.playIntro()`
  // is two seconds earlier and `Intro.DURATION` is where the two seconds live.
  //
  // Last in the function on purpose. A promise that never settles costs the card
  // and nothing above it.
  if (area && target) {
    await game.whenIntroDone();
    area.openTarget(target);
  }
}

start().catch((error) => {
  // The dignified failure mode. A WebGL/WebGPU problem must not produce a blank
  // page — it produces the résumé.
  console.error('[portfolio] init failed, showing fallback', error);
  root.classList.remove('is-loading');
  root.classList.add('is-fallback');
  fallback.hidden = false;
});
