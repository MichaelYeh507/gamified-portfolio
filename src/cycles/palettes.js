/**
 * The day-cycle palettes. **A ships**; B, C and D lost the gate and are kept.
 *
 * Decision 45 ran as a gate on closing Phase 2a: four candidates against four times
 * of day, sixteen renders, judged on the running build over the real island. The
 * answer, 19 August, was **A — the reference's palette, kept** — with one thing carried forward,
 * which is that the world reads dark in places because nothing in it glows yet. That
 * is scheduled against the arrival of emissive props rather than fixed by exposure;
 * `ROADMAP.md` → *Scheduled, not open* has the trigger and the levers.
 *
 * The three losing candidates stay because they cost nothing, they are behind a debug
 * flag, and the re-judge above may want the whole palette rather than just the
 * exposure. `#gate` and `#palette=c` both still work.
 *
 * **Not `render/palette.js`.** That file holds the sixteen albedo colours the
 * world is painted in and it is not what this gate is about. This file holds the
 * *light around* those colours: sky, fog, sun, shadow tint and reveal rim, at
 * four times of day. The ground stays the same in all sixteen renders, which is
 * the only way the comparison means anything.
 *
 * ## What the cycle actually drives
 *
 * | property | goes to | why it is here |
 * |---|---|---|
 * | `skyHorizon` / `skyTop` | `Sky.colorA` / `.colorB` | the screen-space radial ramp that *is* the fog target |
 * | `fogNear` / `fogFar` | `Sky.setRatios()` | fog placed as a fraction of the visible ground band |
 * | `lightColor` / `lightIntensity` | `Lighting.colorUniform` / `.intensityUniform` | the flat toon material multiplies these directly |
 * | `shadowColor` | `Lighting.shadowColorUniform` | a *tint*, not a darken — see `KNOWN-ISSUES.md` 9 |
 * | `rimColor` / `rimIntensity` | `Reveal.rimColor` / `.rimIntensity` | on screen for the four seconds of the intro only |
 *
 * ## The three numbers that are derived rather than chosen
 *
 * Held constant across B, C and D so the sixteen renders differ in **hue and
 * nothing else**. A candidate that lost because it was a third of a stop darker
 * would tell us nothing.
 *
 * 1. **`lightIntensity` = 1.02 / mean(linear(lightColor))** for day, reused
 *    verbatim at dusk and dawn. That is `KNOWN-ISSUES.md` 9's rule — a fully lit
 *    surface reproduces its palette colour — and reproducing it here gives
 *    1.196 for the shipped `#fff0d8`, against the 1.2 that shipped. Holding the
 *    day intensity through dusk and dawn is the reference's structure: the *colour* does the
 *    dimming, which is why the reference's `#ff8181` dusk lands at 0.58 of full exposure
 *    while its intensity still reads 1.2.
 * 2. **Night is 0.45 of full exposure**, i.e. `0.45 * 1.02 / mean(linear)`.
 *    Swept at 0.30 / 0.45 / 0.60: at 0.30 shadowed grass falls to `#152123` and
 *    the island stops being legible, at 0.60 it reads as an overcast afternoon
 *    rather than as night. One constant, easy to move if the gate says so.
 * 3. **Shadow/lit luminance ratio 0.205**, which is what the shipped `#6b7fb8`
 *    measures against the shipped light. `KNOWN-ISSUES.md` 9 records that the reference's
 *    0.16 was too strong and turned a cream building blue. C is the deliberate
 *    exception at **0.08**, because near-black shadow *is* its direction.
 *
 * Rim intensity is normalised so the brightest channel peaks at **5.5** — what
 * the shipped amber rim does, and the headroom `materials.js` is written around.
 * Only the teal and green night rims need anything other than 5.5 to get there.
 *
 * ## What is deliberately NOT varied
 *
 * **The fog ratios are the reference's measured set in all four candidates.** They place fog
 * as a fraction of the visible ground band and so control fog *distance*, not
 * colour — and the negative near ratio at night is the mechanism behind an
 * enclosed night rather than a palette choice. Varying them would mean the
 * candidates differed in how much of the frame was sky at all, which is the one
 * confound that would make the sixteen renders unreadable. It stays a separate
 * lever, available after a palette is chosen.
 */

/** The four times of day, in cycle order. */
export const PHASES = ['day', 'dusk', 'night', 'dawn'];

/**
 * Where to pin the cycle to photograph each phase.
 *
 * Each lands on a stop where the phase is at full strength rather than
 * mid-transition, so a pinned shot is the preset and not a blend of two.
 */
export const PHASE_PROGRESS = { day: 0.0, dusk: 0.25, night: 0.475, dawn: 0.8 };

/**
 * The shape of the day, which is the reference's and stays fixed across every candidate.
 *
 * Day holds from 0.9 through 0.15, falls through dusk at 0.25 into a night that
 * holds 0.35 to 0.6, then a long two-fifths-of-a-cycle climb back out through
 * dawn at 0.8. Quarter of the cycle is full day and quarter is full night; the
 * interesting half is spent in transit. Timing is mechanism, not palette, so the
 * gate holds it constant.
 */
const STOPS = [
  ['day', 0.0],
  ['day', 0.15],
  ['dusk', 0.25],
  ['night', 0.35],
  ['night', 0.6],
  ['dawn', 0.8],
  ['day', 0.9],
];

/** The reference's two intervals, kept because night lamps and emissives will want them. */
export const DAY_INTERVALS = [
  { name: 'night', start: 0.25, end: 0.7 },
  { name: 'deepNight', start: 0.35, end: 0.6 },
];

/** Fog placement as a fraction of the visible ground band. Measured off the reference's build. */
const FOG = {
  day: { fogNear: 0.315, fogFar: 1.25 },
  dusk: { fogNear: 0.0, fogFar: 1.25 },
  night: { fogNear: -0.85, fogFar: 1.0 },
  dawn: { fogNear: 0.3, fogFar: 1.25 },
};

const withFog = (presets) => {
  const out = {};
  for (const phase of PHASES) out[phase] = { ...presets[phase], ...FOG[phase] };
  return out;
};

/**
 * **A — the reference's. The chosen palette**, and it was the control it beat. Verbatim from
 * `reference/source/sources/Game/Cycles/DayCycles.js:5-8`, logged as a
 * deliberate copy in `reference/README.md`. Cyan-to-lavender days, magenta dusk,
 * purple shadows: take the truck away and this palette is most of what people
 * recognise as the reference's site, which is exactly why adopting it needs to be a choice.
 *
 * One measured consequence worth knowing before judging it: the reference's night light is
 * `#3240ff` at **3.8**, which puts the brightest palette entry at **3.37** — more
 * than three times the bloom threshold. The reference's night does not merely look neon, the
 * whole world is over the threshold and blooming. Ours land at 0.56–0.64.
 */
export const HIS = withFog({
  day: {
    skyHorizon: '#00ffff',
    skyTop: '#9b89ff',
    lightColor: '#ffd2c2',
    lightIntensity: 1.2,
    shadowColor: '#6d3fff',
    rimColor: '#5f7dff',
    rimIntensity: 12,
  },
  dusk: {
    skyHorizon: '#3e53ff',
    skyTop: '#ff4ce4',
    lightColor: '#ff8181',
    lightIntensity: 1.2,
    shadowColor: '#4e009c',
    rimColor: '#ff86d9',
    rimIntensity: 5.55,
  },
  night: {
    skyHorizon: '#10266f',
    skyTop: '#490a42',
    lightColor: '#3240ff',
    lightIntensity: 3.8,
    shadowColor: '#2f00db',
    rimColor: '#b678ff',
    rimIntensity: 10,
  },
  dawn: {
    skyHorizon: '#f885ff',
    skyTop: '#ff7d24',
    lightColor: '#ffa882',
    lightIntensity: 1.2,
    shadowColor: '#db004f',
    rimColor: '#ff9d9d',
    rimIntensity: 4.85,
  },
});

/**
 * **B — naturalistic.** Real sky blues, a warm sun, blue-grey shadows. The safe one,
 * and the one that risks reading as generic: it is what a competent renderer produces
 * when nobody has made a decision. It was in the set as the baseline everything else
 * had to beat, and A beat it.
 */
export const NATURAL = withFog({
  day: {
    skyHorizon: '#bfe3f5',
    skyTop: '#4a86d8',
    lightColor: '#fff2dc',
    lightIntensity: 1.18,
    shadowColor: '#6e81a4',
    rimColor: '#ffe9b0',
    rimIntensity: 5.5,
  },
  dusk: {
    skyHorizon: '#ffb27a',
    skyTop: '#5f5fa8',
    lightColor: '#ff9d6b',
    lightIntensity: 1.18,
    shadowColor: '#5a5a87',
    rimColor: '#ffb27a',
    rimIntensity: 5.5,
  },
  night: {
    skyHorizon: '#1b2a4a',
    skyTop: '#080d1c',
    lightColor: '#a9c0f0',
    lightIntensity: 0.77,
    shadowColor: '#415076',
    rimColor: '#bcd4ff',
    rimIntensity: 5.5,
  },
  dawn: {
    skyHorizon: '#ffd6b0',
    skyTop: '#7fa9d9',
    lightColor: '#ffd0a8',
    lightIntensity: 1.18,
    shadowColor: '#637290',
    rimColor: '#ffd0b8',
    rimIntensity: 5.5,
  },
});

/**
 * **C — cold and graphic.** Desaturated slate days, a teal night, near-black
 * shadows, and the amber we already have carrying every warm accent on its own.
 *
 * The only candidate whose shadow ratio is not 0.205 — it runs at **0.08**,
 * because "near-black shadows" is the direction rather than an accident of
 * exposure. That makes it the highest-contrast of the four against our moss and
 * slate ground, and the one most likely to read as a deliberate style or as
 * unfinished, with not much room in between.
 */
export const GRAPHIC = withFog({
  day: {
    skyHorizon: '#dbe4e7',
    skyTop: '#8fa3ad',
    lightColor: '#f4f7f6',
    lightIntensity: 1.11,
    shadowColor: '#47525d',
    rimColor: '#ffb454',
    rimIntensity: 5.5,
  },
  dusk: {
    skyHorizon: '#f0a15a',
    skyTop: '#46545e',
    lightColor: '#ffc08a',
    lightIntensity: 1.11,
    shadowColor: '#37434f',
    rimColor: '#ff8f3c',
    rimIntensity: 5.5,
  },
  night: {
    skyHorizon: '#0d3b3f',
    skyTop: '#04171c',
    lightColor: '#5fd8cf',
    lightIntensity: 0.97,
    shadowColor: '#273e46',
    rimColor: '#4fd6c8',
    rimIntensity: 8.18,
  },
  dawn: {
    skyHorizon: '#cfd8d0',
    skyTop: '#6c8391',
    lightColor: '#e6eae4',
    lightIntensity: 1.11,
    shadowColor: '#414e56',
    rimColor: '#ffc978',
    rimIntensity: 5.5,
  },
});

/**
 * **D — warm into deep.** Ochre and rose days falling into a deep green night.
 * The only candidate that does not go blue anywhere, which makes it the real
 * opposite of A and the one that would most change what the site is *for*: a
 * warm, dusty, lived-in island rather than a synthetic one.
 */
export const DEEP = withFog({
  day: {
    skyHorizon: '#ffcf8f',
    skyTop: '#e8829a',
    lightColor: '#fff0cf',
    lightIntensity: 1.23,
    shadowColor: '#a57292',
    rimColor: '#ffd27a',
    rimIntensity: 5.5,
  },
  dusk: {
    skyHorizon: '#ff9d6b',
    skyTop: '#a45a86',
    lightColor: '#ffb07a',
    lightIntensity: 1.23,
    shadowColor: '#85558e',
    rimColor: '#ff8a5c',
    rimIntensity: 5.5,
  },
  night: {
    skyHorizon: '#0f3a30',
    skyTop: '#04140f',
    lightColor: '#6fd6a8',
    lightIntensity: 1.13,
    shadowColor: '#446b5a',
    rimColor: '#5fe0a8',
    rimIntensity: 7.38,
  },
  dawn: {
    skyHorizon: '#ffc2a8',
    skyTop: '#d98fa8',
    lightColor: '#ffcfae',
    lightIntensity: 1.23,
    shadowColor: '#93667e',
    rimColor: '#ffb2a0',
    rimIntensity: 5.5,
  },
});

/** Keyed by the letter the colour gate labels them with. */
export const DAY_PALETTES = {
  a: { label: 'A · the reference\x27s', presets: HIS },
  b: { label: 'B · naturalistic', presets: NATURAL },
  c: { label: 'C · cold and graphic', presets: GRAPHIC },
  d: { label: 'D · warm into deep', presets: DEEP },
};

/**
 * What ships. Chosen at the gate on 19 August, not defaulted into — which was the
 * whole point of shipping the reference's set as scaffolding first (decision 45).
 */
export const DEFAULT_DAY_PALETTE = 'a';

/** Lay a phase preset set onto the reference's stops. */
export function dayKeyframes(palette = DEFAULT_DAY_PALETTE) {
  const entry = DAY_PALETTES[palette];
  if (!entry) throw new Error(`unknown day palette "${palette}"`);
  return STOPS.map(([phase, stop]) => ({ stop, properties: entry.presets[phase] }));
}

/**
 * The year, which carries **no colour at all** — five scalars and nothing else.
 *
 * That is not a simplification of the reference's, it is a correction to ours: decision 12
 * originally had the year cycle tinting light and fog, and reading the reference's presets
 * against the reference's running build showed it does no such thing. Every colour in the
 * world comes from the day cycle, which is the only cycle with `Color`-typed
 * properties, and keeping it that way is what stops two cycles fighting over the
 * same uniform and over the colour gate.
 *
 * Nothing reads these yet. Foliage, rain and wind are decisions 30–32 and live
 * in Phase 3; the cycle exists now because it is three lines on top of `Cycles`
 * and because building it later would mean re-deciding all of the above.
 *
 * Values are ours, for a temperate maritime year to suit a moss-and-slate
 * island. They land near the reference's because a year is a year; the shape is what matters
 * — `leaves` peaking in autumn, wind and cloud tracking it, temperature a plain
 * sine through the seasons.
 */
export const SEASONS = {
  winter: { leaves: 0.3, temperature: 4, humidity: 0.82, clouds: 0.7, wind: 0.32 },
  spring: { leaves: 0.0, temperature: 12, humidity: 0.66, clouds: 0.5, wind: 0.22 },
  summer: { leaves: 0.15, temperature: 22, humidity: 0.5, clouds: 0.28, wind: 0.12 },
  fall: { leaves: 1.0, temperature: 13, humidity: 0.68, clouds: 0.62, wind: 0.26 },
};

/**
 * Stops at the *middle* of each season rather than at its boundary, so the
 * keyframe is the season at its most itself and the transitions sit on the
 * equinoxes. The reference's offsets by the same eighth of a year for the same reason.
 */
export const YEAR_KEYFRAMES = [
  { stop: 0.125, properties: SEASONS.winter },
  { stop: 0.375, properties: SEASONS.spring },
  { stop: 0.625, properties: SEASONS.summer },
  { stop: 0.875, properties: SEASONS.fall },
];
