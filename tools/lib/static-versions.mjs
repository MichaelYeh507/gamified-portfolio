/**
 * Content versions for the static files Vite does not hash.
 *
 * `vite build` fingerprints everything it bundles (`assets/*-<hash>.js`) and
 * copies `public/` untouched — so the models, the letter font and the project
 * screenshots would ship under bare names, and a bare name cannot be cached
 * immutably: a re-prepped `carBuggy-compressed.glb` behind a year-long
 * `max-age` is a visitor driving last month's car.
 *
 * This maps each such file to the first 8 hex of its SHA-1, computed at build
 * (and at dev-server start) and baked into the bundle as
 * `__STATIC_VERSIONS__`; `src/core/staticUrl.js` appends it as `?v=`. The URL
 * changes exactly when the bytes do, so `public/_headers` can mark these
 * directories immutable with the same rule as `assets/`.
 *
 * Shared by `vite.config.js` and `tools/check-site.mjs`.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The directories under `public/` that runtime code fetches from. */
export const VERSIONED_DIRS = Object.freeze(['models', 'fonts', 'projects']);

/**
 * @param {string} [root='public']
 * @returns {Record<string, string>} `models/x.glb` → `'1a2b3c4d'`
 */
export function staticVersions(root = 'public') {
  const versions = {};
  for (const dir of VERSIONED_DIRS) {
    const path = join(root, dir);
    let entries = [];
    try {
      entries = readdirSync(path);
    } catch {
      continue; // a directory that does not exist yet has nothing to version
    }
    for (const name of entries.sort()) {
      const file = join(path, name);
      if (!statSync(file).isFile()) continue;
      versions[`${dir}/${name}`] = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);
    }
  }
  return versions;
}
