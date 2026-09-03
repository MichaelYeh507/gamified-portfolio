/**
 * Build configuration. Three jobs, all for shipping (Phase 6):
 *
 *   1. `index.html`'s `<!--#meta-->` and `<!--#fallback-->` markers are
 *      replaced with markup rendered from `src/content/` — the title, the
 *      description, the social preview tags and the accessible fallback
 *      (`tools/lib/site-html.mjs`). In dev too, so what the dev server shows
 *      is what ships.
 *   2. `__STATIC_VERSIONS__`: a content hash per file under `public/models`,
 *      `public/fonts` and `public/projects`, so `staticUrl()` can version the
 *      files Vite copies rather than hashes (`tools/lib/static-versions.mjs`).
 *   3. `SITE_URL` (environment, or `.env.production`) is the public origin the
 *      absolute Open Graph URLs need. Unset, those tags are omitted and
 *      `prune-dist` warns.
 *
 * `npm run build` runs `vite build` and then `tools/prune-dist.mjs`, which is
 * the gate: it strips what must not ship and fails on what must.
 */
import { defineConfig, loadEnv } from 'vite';
import { renderFallback, renderMeta } from './tools/lib/site-html.mjs';
import { staticVersions } from './tools/lib/static-versions.mjs';

export default defineConfig(({ mode }) => {
  // '' as the prefix so SITE_URL (no VITE_ prefix: it is build-time only and
  // has no business in the bundle) is read from .env.production as well.
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = (env.SITE_URL || '').trim();

  return {
    define: {
      __STATIC_VERSIONS__: JSON.stringify(staticVersions()),
    },
    /**
     * No dev-time dependency discovery. Left to its default the optimizer
     * crawls every HTML file under the root, which includes
     * `reference/source/` — the reference author's clone, with its own `node_modules`
     * and three **r183** — and on 3 Sep it prebundled `three/webgpu` from
     * there against our r185 core: 899 "THREE.TSL: No stack defined"
     * errors, a world with no night and no fog, and an hour that could have
     * been a minute. `optimizeDeps.entries` did not stop the crawl in Vite
     * 8.2, so discovery is off: every dependency is ESM and serves fine
     * unbundled, and `dedupe` pins any `three` import to the root copy.
     * The build never had this problem (rolldown bundles from index.html).
     */
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { dedupe: ['three'] },
    server: {
      // Nothing under reference/ or research/ is ours to watch or serve.
      watch: { ignored: ['**/reference/**', '**/research/**'] },
      fs: { deny: ['reference/**', 'research/**'] },
    },
    build: {
      sourcemap: false,
      /**
       * The one chunk is ~4.0 MB minified (1.06 MB Brotli), measured 3 Sep:
       * three/webgpu (~0.67 MB min) and rapier3d-compat (~2.9 MB, most of it
       * the physics wasm as base64 — the next payload lever, see the ROADMAP).
       * The default 500 KB warning would fire on every build and say nothing;
       * this threshold is set just above today's size so it fires on growth.
       */
      chunkSizeWarningLimit: 4100,
    },
    plugins: [
      {
        name: 'site-html',
        transformIndexHtml(html) {
          return html
            .replace('<!--#meta-->', renderMeta({ siteUrl }))
            .replace('<!--#fallback-->', renderFallback());
        },
      },
    ],
  };
});
