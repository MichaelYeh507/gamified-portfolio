/**
 * URLs for the static files under `public/` that Vite copies rather than
 * hashes — models, the letter font, the project screenshots.
 *
 * Each carries `?v=<content hash>` from `tools/lib/static-versions.mjs`,
 * baked in at build as `__STATIC_VERSIONS__`, so the URL changes exactly when
 * the file's bytes do and the host can cache it as immutable
 * (`public/_headers`). Under node (`check-loader`, `check-prep`) the define
 * does not exist and the bare path comes back — those tools never fetch.
 *
 * Every fetch of a `public/` file goes through here; `check-site` fails on a
 * bare `/models/`, `/fonts/` or `/projects/` literal anywhere else in `src/`,
 * because a bare URL under an immutable rule is a stale file waiting to happen.
 */

/* global __STATIC_VERSIONS__ */
const VERSIONS = typeof __STATIC_VERSIONS__ !== 'undefined' ? __STATIC_VERSIONS__ : {};
const BASE = import.meta.env?.BASE_URL ?? '/';

/**
 * @param {string} path relative to `public/`, e.g. `models/crate-compressed.glb`
 * @returns {string}
 */
export function staticUrl(path) {
  const version = VERSIONS[path];
  return `${BASE}${path}${version ? `?v=${version}` : ''}`;
}
