/**
 * The contact arc — pure arithmetic, no three.js, shared by `ContactArea` and
 * `tools/check-contact.mjs` the way `careerTimeline` is shared with its check.
 *
 * Every number here was **measured out of the reference's `areas.glb`** (the no-loader
 * glTF walk, 1 Sep), not read from a report — the corridor was rebuilt twice
 * for trusting descriptions over the reference's authored artifacts, and this module is
 * where the social area's measurement is written down:
 *
 *  - The reference's eight baked icon props stand at **radius 7.85** from `refCenter`
 *    (25.951, −18.093), at angles `i·π/7` exactly — the same `i·π/(N−1)`
 *    layout the reference's `SocialArea.setLinks` computes, confirmed in the geometry.
 *  - The reference's interactive label points sit inside the icons at **radius 6, y = 1**
 *    (`SocialArea.js:36-45`, code this time — the labels are not baked).
 *  - Adjacent icons are **3.49 units apart** (chord of π/7 at 7.85).
 *  - The centre holds the reference's statue on a low 3.0 × 0.79 hull pedestal; the icons
 *    are ~1.3–2.2 wide and thin (~0.2), all facing the camera uniformly.
 *
 * **The generalisation, and why it is the reference's layout rather than near it**: the reference's
 * code's `i·π/(N−1)` spreads any count over the full half-circle, which at
 * our three links would stand them 11.1 units apart — the arc reads as three
 * strays, not a place. But at the reference's N = 8, `i·π/(N−1)` is *identical* to "step
 * π/7, centred on the arc's top", and the centred form keeps the reference's measured
 * 3.49 chord at every count. So the step is the invariant we keep and the
 * span is what derives from `.length`; `check-contact` proves the two forms
 * agree digit for digit at N = 8.
 *
 * The frame is ours: the reference's arc bulges toward −z because the reference's camera looks down
 * −z; ours bulges up-screen along −(√½, √½) so every card faces the fixed
 * camera (decision 16) and the car arriving from the island's heart.
 */

/** The reference's baked icon radius, measured. Cards stand here. */
export const CARD_RADIUS = 7.85;

/** The 3D logo stands this far up-screen behind its card, rising over it. */
export const ICON_BACK = 0.9;

/** The reference's label-point radius and height (`SocialArea.js:36,44`). Beacons float here. */
export const PROMPT_RADIUS = 6;
export const PROMPT_HEIGHT = 1;

/** The reference's angular step at eight links — the measured 3.49-unit chord at 7.85. */
export const ANGLE_STEP = Math.PI / 7;

/** Screen-right and up-screen in world XZ, for a camera bearing of (√½, √½). */
export const RIGHT = Object.freeze({ x: Math.SQRT1_2, z: -Math.SQRT1_2 });
export const UP = Object.freeze({ x: -Math.SQRT1_2, z: -Math.SQRT1_2 });

/** Where `?at=contact` stands you: down-screen of the fire, facing the arc. */
export const SPAWN_BACK = 6.5;
export const APPROACH_HEADING = -Math.PI * 0.75;

/**
 * Inside this, `update()` runs and the beacons are eligible; the arc plus the
 * standing room in front of it. Exported so the island contracts in
 * `check-contact` read the same number the area claims.
 */
export const CONTACT_RADIUS = 14;

/**
 * Angles for `count` links, first link at the screen-LEFT end. The reference's
 * `socialData[0]` stands at the reference's angle 0 — the far end — but `links.js`
 * promises display order, and on a screen that reads left to right; the arc
 * is mirrored so the data's order is the reading order. Centred on π/2, at
 * the reference's measured step, never wider than the half-circle the reference's code spans.
 *
 * @param {number} count
 * @returns {number[]}
 */
export function arcAngles(count) {
  if (count <= 0) return [];
  if (count === 1) return [Math.PI / 2];
  const step = Math.min(ANGLE_STEP, Math.PI / (count - 1));
  return Array.from(
    { length: count },
    (_, i) => Math.PI / 2 - (i - (count - 1) / 2) * step
  );
}

/**
 * A point on the arc: `angle` 0 is screen-right, π/2 up-screen, π screen-left.
 *
 * @param {[number, number]} center world XZ
 */
export function arcPoint(center, angle, radius) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: center[0] + (c * RIGHT.x + s * UP.x) * radius,
    z: center[1] + (c * RIGHT.z + s * UP.z) * radius,
  };
}

/**
 * What a card's second row reads: the address itself, stripped of plumbing.
 * `mailto:` keeps the mailbox; anything URL-shaped keeps host and path. The
 * fallback is the string as written — a bad url should cost polish, not a boot.
 *
 * @param {string} url
 * @returns {string}
 */
export function displayAddress(url) {
  if (typeof url !== 'string' || url.length === 0) return '';
  if (url.startsWith('mailto:')) return url.slice('mailto:'.length);
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    return parsed.host.replace(/^www\./, '') + path;
  } catch {
    return url;
  }
}

/**
 * Everything the area stands on the ground, plus the sweep list — the plan
 * `ContactArea.build()` executes and `check-contact` re-runs over the real
 * height field, `corridorPlan`'s shape.
 *
 * @param {[number, number]} center the area def's centre
 * @param {{slug: string, label: string, url: string}[]} links
 */
export function contactPlan(center, links) {
  const angles = arcAngles(links.length);

  const cards = links.map((link, i) => ({
    link,
    angle: angles[i],
    ...arcPoint(center, angles[i], CARD_RADIUS),
  }));

  /** The standing logos, one step further out on each card's own bearing. */
  const icons = links.map((link, i) => ({
    link,
    ...arcPoint(center, angles[i], CARD_RADIUS + ICON_BACK),
  }));

  const prompts = links.map((link, i) => ({
    link,
    angle: angles[i],
    ...arcPoint(center, angles[i], PROMPT_RADIUS),
  }));

  /** The gathering spot where the reference's statue stands: the fire, and two log seats
   *  down-screen of it — the camera side, so the seats read in front of the
   *  flames instead of hiding behind them. */
  const fire = { x: center[0], z: center[1] };
  const logs = [
    arcPoint(center, -Math.PI / 2 - 0.45, 2.4),
    arcPoint(center, -Math.PI / 2 + 0.45, 2.4),
  ];

  const spawn = arcPoint(center, -Math.PI / 2, SPAWN_BACK);

  const points = [
    { what: 'fire', ...fire },
    ...logs.map((at, i) => ({ what: `log ${i}`, ...at })),
    ...cards.map((c) => ({ what: `card ${c.link.slug}`, x: c.x, z: c.z })),
    ...icons.map((c) => ({ what: `icon ${c.link.slug}`, x: c.x, z: c.z })),
    ...prompts.map((p) => ({ what: `prompt ${p.link.slug}`, x: p.x, z: p.z })),
    { what: 'spawn', ...spawn },
  ];

  return { cards, icons, prompts, fire, logs, spawn, points };
}
