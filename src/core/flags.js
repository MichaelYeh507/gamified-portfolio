/**
 * Debug flags in the URL hash — the pattern from the reference's build (`#debug`, `#stats`,
 * `#skip`), adopted without the half we do not want.
 *
 * The hash is the right place for these and a query string is not: it never
 * reaches the server, it survives a reload, it is trivially shareable, and it
 * costs nothing in the bundle. What we do **not** adopt is the reference's other half —
 * shipping a full Tweakpane to production so the flag has something to open.
 * Every flag here either does nothing or lazily imports its own tooling.
 *
 * Read once at boot. Changing the hash means reloading, which is the same
 * contract the reference's has and is what makes a flag a boot-time decision rather than a
 * piece of live state nothing owns.
 *
 *   #gate            open the 2a colour gate (decision 45)
 *   #palette=c       ship a named candidate palette this session
 *   #day=0.25        pin the day cycle, the reference's VITE_DAY_CYCLE_PROGRESS
 *   #year=0.6        pin the year cycle
 *   #sink=0.3        sink the projects plaza (KNOWN-ISSUES 18; 0 = flat)
 *   #wind=0.25       tree sway strength (the reference's default 0.5; 0 = still)
 *   #yearunit=2      career corridor scale, world units per year (shipped: 4 —
 *                    SHIPPED_UNITS_PER_YEAR; the corridor, counter and
 *                    dressing re-derive. 5 runs the road into the beach)
 */
const parsed = (() => {
  const out = new Map();
  const hash = typeof location === 'undefined' ? '' : location.hash.replace(/^#/, '');
  for (const part of hash.split('&')) {
    if (!part) continue;
    const equals = part.indexOf('=');
    if (equals === -1) out.set(part, true);
    else out.set(part.slice(0, equals), decodeURIComponent(part.slice(equals + 1)));
  }
  return out;
})();

/** Is a bare flag present? */
export function flag(name) {
  return parsed.has(name);
}

/** A flag's string value, or `fallback` if it is absent or bare. */
export function flagString(name, fallback = null) {
  const value = parsed.get(name);
  return typeof value === 'string' ? value : fallback;
}

/**
 * A flag's numeric value, or `fallback`.
 *
 * A flag that is present but unparseable returns the fallback rather than NaN:
 * `#day=dusk` should give you the ordinary sky, not a world where every uniform
 * is NaN and the screen is black.
 */
export function flagNumber(name, fallback = null) {
  const value = Number.parseFloat(parsed.get(name));
  return Number.isFinite(value) ? value : fallback;
}
