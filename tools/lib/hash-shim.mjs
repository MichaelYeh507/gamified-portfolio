/**
 * Give node a `location.hash` before anything reads one.
 *
 * `src/core/flags.js` parses the hash **once, at module load** — deliberately,
 * because a debug flag is a boot-time decision and not live state. That makes it
 * unsweepable in-process: re-importing `Terrain.js` with a cache-busting query
 * gives a fresh `Terrain`, but it still resolves the *cached* `flags.js`, so
 * every candidate silently measures the same world. That failure is quiet — the
 * table fills in and every row is identical — so it is worth a file to prevent.
 *
 * Import this **first**, before any module that might reach `flags.js`. ESM
 * evaluates static imports depth-first in source order, so being the first
 * import line is enough; being anywhere else is not.
 *
 * Reads `--hash=<value>` from argv. One process per flag value.
 */
const arg = process.argv.find((a) => a.startsWith('--hash='));
globalThis.location = { hash: arg ? arg.slice('--hash='.length) : '' };
