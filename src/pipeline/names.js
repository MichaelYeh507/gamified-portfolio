/**
 * Node names are the level format.
 *
 * This is `F` §1 turned into code: a Blender object called
 * `refLettersPhysicalDynamic.010` with a child called `cuboid.003` is a
 * reference, a dynamic rigid body and a box collider, and none of that took a
 * level editor, a serialisation format or a placement UI. It is the single
 * highest-leverage thing in the reference's build after the palette, and `F` rec 1 calls it
 * "the deliverable".
 *
 * **Everything here is pure.** No three, no game state, no DOM — a name goes in
 * and a description comes out. That is what lets `tools/check-names.mjs` run the
 * whole layer against all 64 of the reference author's shipped GLBs and compare the counts
 * against the ones `F` §1.8 recorded independently. A parser for a format we
 * have no art for yet would otherwise be untestable until the day it mattered.
 *
 * ---
 *
 * **The thing that makes the format ergonomic is not in this file, and it is not
 * in the reference's either.** `GLTFLoader.createUniqueName()` runs
 * `PropertyBinding.sanitizeNodeName()` on every node as it loads, and that
 * deletes the characters `[ ] . : /` outright (verified in three r0.185 at
 * `PropertyBinding.js:185` and `:3` — the reserved class is exactly
 * `\[\]\.:\/`). So:
 *
 *   Blender `refLine.001` -> loader `refLine001` -> group 1 `Line`, group 2 `001`
 *
 * which means **duplicating an object in Blender with Shift+D silently joins the
 * reference array**, with no manual naming at all. Six `refLine*` objects become
 * one `line` key holding six entries. That is the whole trick, and it is
 * invisible if you only read `References.js`.
 *
 * `simulateLoaderName` reproduces it so that tooling which reads a GLB's JSON
 * chunk directly — without a loader — sees the same names the runtime will.
 */

/** The characters three deletes from node names. Not a guess; see above. */
const RESERVED = /[[\].:/]/g;

/**
 * What `GLTFLoader` will call a node.
 *
 * Whitespace becomes `_`, which is a **non-digit**, so `ref My Thing` parses to
 * the key `_My_Thing` rather than `myThing`. Do not put spaces in reference
 * names; there is a lint for it below.
 */
export function sanitizeNodeName(name) {
  return String(name).replace(/\s/g, '_').replace(RESERVED, '');
}

/**
 * Replay the loader's whole naming pass over a list of raw Blender names.
 *
 * The de-duplication half matters as much as the sanitising half: if two names
 * collide *after* sanitising, the second gets `_1` appended. An object named
 * `refLine001` sitting beside `refLine.001` therefore becomes `refLine001_1`,
 * which fails the reference regex — `001_1` is not all digits — and **vanishes
 * from the map with no error at all**. Pick one numbering style; the reference author picked
 * Blender's.
 *
 * @param {string[]} rawNames names exactly as they appear in the .blend/glTF
 * @returns {string[]} names as the runtime will see them, in the same order
 */
export function simulateLoaderNames(rawNames) {
  const used = new Map();
  return rawNames.map((raw) => {
    const sanitized = sanitizeNodeName(raw);
    if (used.has(sanitized)) {
      const next = used.get(sanitized) + 1;
      used.set(sanitized, next);
      return `${sanitized}_${next}`;
    }
    used.set(sanitized, 0);
    return sanitized;
  });
}

/**
 * The reference's regex, character for character (`References.js:18`).
 *
 * `([^0-9]+)` rather than `(\w+)` is load-bearing: it is what stops the trailing
 * digit group from being swallowed, and it is why the `.001` suffix lands in
 * group 2 and gets discarded.
 */
const REFERENCE = /^ref(?:erence)?([^0-9]+)([0-9]+)?$/;

/** Anything that *looks* like it was meant to be a reference. */
const REFERENCE_ISH = /^ref/i;

/**
 * Parse a loader-sanitised name into a reference key, or `null`.
 *
 * `ref` and `reference` are interchangeable — the reference's `.blend` uses `ref` for all
 * 214 objects and `reference` never appears, but both are legal.
 *
 * @returns {{ key: string, suffix: string|null }|null}
 */
export function parseReference(name) {
  const matches = name.match(REFERENCE);
  if (!matches) return null;
  const body = matches[1];
  return {
    key: body.charAt(0).toLowerCase() + body.slice(1),
    suffix: matches[2] ?? null,
  };
}

const PHYSICAL = /physical/i;
const DYNAMIC = /dynamic/i;
const KINEMATIC = /kinematicPositionBased/i;
/** The reference's cleanup regex, `Objects.js:119`. `fixed` is decorative — it only strips. */
const PHYSICS_WORDS = /physical|fixed|dynamic|kinematicPositionBased/gi;

/**
 * Parse the physics half of a name.
 *
 * `physical` anywhere in the name is what creates a body at all; without it
 * there is no physical description, whatever else the name says. The type words
 * are checked in the reference's order, and `fixed` is the fallthrough rather than a match —
 * it appears in the cleanup regex and selects nothing.
 *
 * `cleaned` is the name with every physics word removed, which is what the reference's
 * `Objects.js:157` writes **back onto the object**. See `stripPhysicsWords` for
 * why that mutation is the most confusing thing in the format.
 *
 * @returns {{ type: 'fixed'|'dynamic'|'kinematicPositionBased', cleaned: string }|null}
 */
export function parsePhysical(name) {
  if (!PHYSICAL.test(name)) return null;
  let type = 'fixed';
  if (DYNAMIC.test(name)) type = 'dynamic';
  else if (KINEMATIC.test(name)) type = 'kinematicPositionBased';
  return { type, cleaned: stripPhysicsWords(name) };
}

/** `refLettersPhysicalDynamic010` -> `refLetters010`. */
export function stripPhysicsWords(name) {
  return name.replaceAll(PHYSICS_WORDS, '');
}

/**
 * Collider children, sized by **scale alone** — the mesh geometry is ignored for
 * every primitive (`Objects.js:160-211`).
 *
 * Half-extent is `scale * 0.5`, which gives the format its nicest authoring
 * property: **a Blender default 2 m cube scaled to (1, 1, 1) is a 1 m collider,
 * so the scale value you type *is* the size in metres.**
 *
 * The distribution is the finding worth carrying, not the list: across the reference's whole
 * `.blend` it is 234 cuboids, 43 tubes, 10 hulls, 8 balls and **2 trimeshes**.
 * `F` rec 5 — build the cuboid path first and well, and treat trimesh as the
 * exception it is.
 */
const COLLIDER_SHAPES = [
  ['trimesh', /^trimesh/i],
  ['hull', /^hull/i],
  ['cuboid', /^cuboid/i],
  ['cylinder', /^tube/i],
  ['ball', /^ball/i],
];

/**
 * Which collider shape a child name declares, or `null`.
 *
 * Note `tube` produces `cylinder`: the Blender word and the Rapier shape differ,
 * and the reference's code silently bridges them.
 */
export function parseColliderShape(name) {
  for (const [shape, pattern] of COLLIDER_SHAPES) {
    if (pattern.test(name)) return shape;
  }
  return null;
}

/**
 * Collider half-extents from a scale, per shape. Pure, so the arithmetic is
 * testable without building a Rapier world.
 *
 * `cylinder` takes `(halfHeight, radius)` from `scale.y` and `scale.x`, and
 * `ball` takes its radius from `scale.y` — **not** from the larger of the three,
 * so a non-uniform scale on a ball silently picks one axis. That is the reference's
 * behaviour and it is worth knowing rather than "fixing", because the reference's `.blend`
 * is authored against it.
 */
export function colliderParameters(shape, scale) {
  switch (shape) {
    case 'cuboid':
      return [scale.x * 0.5, scale.y * 0.5, scale.z * 0.5];
    case 'cylinder':
      return [scale.y * 0.5, scale.x * 0.5];
    case 'ball':
      return [scale.y * 0.5];
    default:
      return null; // trimesh and hull read geometry, not scale
  }
}

/**
 * `F` rec 1's dev-mode assertion, as a pure function so the same rule serves the
 * runtime, the build tool and the tests.
 *
 * *"Add a dev-mode assertion that logs every object whose name matches `^ref`
 * but fails the full regex — that single log line prevents the entire class of
 * silent-disappearance bugs."* This returns the diagnosis as well as the fact,
 * because "refLine001_1 is not a reference" is not actionable and "you have both
 * `refLine.001` and `refLine001`, and the loader renamed one of them" is.
 *
 * @param {string} name a loader-sanitised name
 * @returns {string|null} a human-readable reason, or null if the name is fine
 */
export function diagnoseName(name) {
  if (!REFERENCE_ISH.test(name)) return null;

  const parsed = parseReference(name);
  if (parsed) {
    /**
     * **It parsed, but not to what you meant.** This branch exists because the
     * test for the branch below found it: `ref_My_Thing` *matches* the regex —
     * `_My_Thing` contains no digits, so it is a perfectly legal group 1 — and
     * quietly produces the key `_My_Thing`. Checking only for regex failure
     * therefore misses the one malformed name `F` §1.0 spends a paragraph on.
     * An underscore in a key can only have come from a space in Blender.
     */
    if (parsed.key.includes('_')) {
      return (
        `"${name}" parses, but to the key "${parsed.key}" — an underscore in a ` +
        `reference key can only have come from a space in the Blender name, ` +
        `which the loader rewrites. Rename the object without spaces.`
      );
    }
    return null;
  }

  if (/_\d+$/.test(name)) {
    return (
      `"${name}" looks like a reference but the loader de-duplicated it. Two ` +
      `objects sanitised to the same name — almost always a manually numbered ` +
      `"refThing001" sitting beside Blender's "refThing.001". Use one style; ` +
      `Blender's .001 suffix is the one that works.`
    );
  }
  if (/_/.test(name)) {
    return (
      `"${name}" looks like a reference but contains an underscore, which is ` +
      `what the loader turns a space into. Rename the Blender object without ` +
      `spaces — "ref My Thing" parses to the key "_My_Thing".`
    );
  }
  if (/^ref(?:erence)?[0-9]/.test(name)) {
    return (
      `"${name}" looks like a reference but has a digit straight after the ` +
      `prefix, so there is no name left to key on. Call it "refThing1", not ` +
      `"ref1".`
    );
  }
  if (/^ref(?:erence)?$/.test(name)) {
    return `"${name}" is the bare prefix with no name after it.`;
  }
  return (
    `"${name}" starts with "ref" but does not match ` +
    `/^ref(?:erence)?([^0-9]+)([0-9]+)?$/, so it will be silently ignored. ` +
    `Digits are only allowed as a trailing suffix.`
  );
}
