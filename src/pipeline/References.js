import { parseReference, diagnoseName } from './names.js';

/**
 * `Map<key, Object3D[]>` built from `ref*` object names. The reference's `References.js`,
 * ported, with one addition.
 *
 * The values are **always arrays**, even for a key with one member. That is not
 * defensiveness — it is the point of the format. `refLine`, `refLine.001` …
 * `refLine.005` are six separate Blender objects that all land under `line`,
 * because the loader deletes the dot before the regex runs, and the reference's
 * `CareerArea` then iterates six career entries out of one `items.get('line')`.
 * Duplicating with Shift+D *is* the authoring gesture. See `names.js`.
 *
 * **The addition is `problems`** — `F` rec 1's dev-mode assertion. Every object
 * whose name starts with `ref` but fails the full regex is collected with a
 * reason. Without it, a mistyped name does not error, does not warn, and does
 * not appear: it is simply absent from the map, and the symptom is a prop
 * missing from the world with nothing anywhere to explain it. One log line
 * prevents the whole class.
 *
 * `getStartingWith` is deliberately **not** ported. It exists at
 * `References.js:33-50` in the reference's build and is called from nowhere in `sources/`.
 */
export default class References {
  constructor(model = null) {
    /** @type {Map<string, import('three').Object3D[]>} */
    this.items = new Map();
    /** @type {{ name: string, reason: string }[]} */
    this.problems = [];

    if (model) this.parse(model);
  }

  /**
   * Walk a model and index every reference under it.
   *
   * Call this **after** any physics-word stripping you intend to do, not before.
   * That ordering is the reference's, it is load-bearing, and it is `F` §1.2's trap: a
   * direct child of an area group is keyed on its stripped name (`letters`)
   * while a grandchild keeps the words (`pinPhysicalDynamic`). Depth changes
   * the key, and both spellings appear in the reference's own area code.
   */
  parse(object) {
    object.traverse((child) => {
      const reference = parseReference(child.name);
      if (reference) {
        const existing = this.items.get(reference.key);
        if (existing) existing.push(child);
        else this.items.set(reference.key, [child]);
      }

      /**
       * Run the diagnosis **whether or not it parsed**, and do not short-circuit
       * on a match. A name can parse perfectly and still be wrong:
       * `ref_My_Thing` — which is what the loader makes of `ref My Thing` — is a
       * legal match producing the key `_My_Thing`. Indexing it and saying
       * nothing is exactly the silent failure the assertion exists to prevent.
       */
      const reason = diagnoseName(child.name);
      if (reason) this.problems.push({ name: child.name, reason });
    });
    return this;
  }

  /** Every object under a key, or an empty array. Never undefined. */
  get(key) {
    return this.items.get(key) ?? [];
  }

  /**
   * The one object under a key.
   *
   * Throws on a miss rather than returning undefined, because the caller asked
   * for something it believes the artist placed, and a silent undefined here
   * becomes a `TypeError` three frames later with no mention of the name.
   */
  one(key) {
    const items = this.get(key);
    if (items.length !== 1) {
      throw new Error(
        `references: expected exactly one "${key}", found ${items.length}` +
          (items.length === 0 ? `. Known keys: ${[...this.items.keys()].join(', ') || '(none)'}` : '')
      );
    }
    return items[0];
  }

  /** `F` rec 1's log line. Returns the number of problems reported. */
  report(log = console.warn) {
    for (const { reason } of this.problems) log(`[references] ${reason}`);
    return this.problems.length;
  }
}
