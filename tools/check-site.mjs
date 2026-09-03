/**
 * Prove the shipping surface that is not the world, headlessly:
 *
 *   npm run check-site
 *
 * The tenth suite (3 Sep 2026, the deploy session). `index.html`'s head and
 * accessible fallback are rendered from `src/content/` by
 * `tools/lib/site-html.mjs`; the static files Vite copies are versioned by
 * `tools/lib/static-versions.mjs`; the host's cache rules live in
 * `public/_headers`. Each has a contract the others rely on, and a build is
 * not needed to prove any of them:
 *
 *   - the fallback carries every project, role and link, escaped, and none
 *     of the placeholders the first deploy would otherwise have shipped;
 *   - the meta is complete, the description fits a result page, and the
 *     absolute Open Graph tags appear exactly when a `SITE_URL` is given;
 *   - `index.html` still has the two markers the build replaces;
 *   - every runtime fetch of a `public/` file goes through `staticUrl`, so
 *     the immutable rule in `_headers` never serves a stale file; and every
 *     file in those directories has a version;
 *   - `_headers` marks every hashed/versioned directory immutable and the
 *     HTML revalidating, and the host config files exist.
 *
 * **Every guard is made to fail once** (the standing rule). Exits 1 on any
 * mismatch.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const { renderFallback, renderMeta, escapeHtml, roleSpan, SITE, PLACEHOLDERS } = await import('./lib/site-html.mjs');
const { staticVersions, VERSIONED_DIRS } = await import('./lib/static-versions.mjs');
const { default: projects } = await import('../src/content/projects.js');
const { default: roles } = await import('../src/content/roles.js');
const { default: links } = await import('../src/content/links.js');
const { default: about } = await import('../src/content/about.js');

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${label.padEnd(64)}${ok ? 'ok' : '<-- FAIL'}${detail ? `  ${detail}` : ''}`);
};

console.log('check-site: the head, the fallback, the versions and the headers\n');

console.log('the fallback:');
{
  const html = renderFallback();
  check('is one <main id="fallback" hidden>', /^<main id="fallback" hidden>[\s\S]*<\/main>$/.test(html));
  check('names the reference author', html.includes(`<h1>${escapeHtml(about.name)}</h1>`));
  check('carries the tagline', html.includes(escapeHtml(about.tagline)));
  for (const placeholder of PLACEHOLDERS) {
    check(`no "${placeholder}"`, !html.includes(placeholder));
  }
  check(
    'every project: title, year, blurb, first link',
    projects.every(
      (p) =>
        html.includes(escapeHtml(p.title)) &&
        html.includes(escapeHtml(p.year)) &&
        html.includes(escapeHtml(p.blurb)) &&
        (!p.links?.[0] || html.includes(`href="${escapeHtml(p.links[0].url)}"`))
    )
  );
  const dated = roles.filter((r) => r.start || r.end);
  check(
    'every dated role: title, org, span',
    dated.every((r) => html.includes(`${escapeHtml(r.title)}, ${escapeHtml(r.org)}`) && html.includes(escapeHtml(roleSpan(r))))
  );
  check('every link: href and address', links.every((l) => html.includes(`href="${escapeHtml(l.url)}"`)));
  check('the email is a mailto', /href="mailto:[^"]+@[^"]+"/.test(html));
  check('no em-dashes in the fallback (prose register)', !html.includes('—'));
  // Content strings are escaped on the way in: a title with markup in it must
  // not become markup. Proven on the escaper directly (guard made to fail).
  check('content is escaped', escapeHtml('<b>&"\'') === '&lt;b&gt;&amp;&quot;&#39;');
}

console.log('\nthe role spans (roles.js date rules):');
{
  check('current (end null) reads "to now"', roleSpan({ start: '2026-06', end: null }) === '2026 to now');
  check('unwritten (end \'\') says only the start', roleSpan({ start: '2024-09', end: '' }) === '2024');
  check('one year collapses', roleSpan({ start: '2024', end: '2024-08' }) === '2024');
  check('a span reads "from to to"', roleSpan({ start: '2022', end: '2024' }) === '2022 to 2024');
}

console.log('\nthe head:');
{
  const bare = renderMeta();
  check('title names the reference author', bare.includes(`<title>${escapeHtml(SITE.title)}</title>`) && SITE.title.includes(about.name));
  check('description fits a result page (50..160)', SITE.description.length >= 50 && SITE.description.length <= 160, `${SITE.description.length}`);
  check('description, og:title, og:description, twitter:card', ['name="description"', 'property="og:title"', 'property="og:description"', 'name="twitter:card"'].every((s) => bare.includes(s)));
  check('icon and theme colour', bare.includes('href="/favicon.svg"') && bare.includes(`content="${SITE.themeColor}"`));
  check('a Person record with the profiles', bare.includes('"@type":"Person"') && links.filter((l) => /^https?:/.test(l.url)).every((l) => bare.includes(l.url)));
  check('no absolute OG tags without SITE_URL', !bare.includes('og:image') && !bare.includes('canonical') && !bare.includes('og:url'));
  const withUrl = renderMeta({ siteUrl: 'https://example.test/' });
  check(
    'with SITE_URL: canonical, og:url, og:image absolute, trailing slash trimmed',
    withUrl.includes('href="https://example.test/"') &&
      withUrl.includes('content="https://example.test/"') &&
      withUrl.includes(`content="https://example.test${SITE.image}"`) &&
      !withUrl.includes('example.test//')
  );
  check('no em-dashes in the head', !bare.includes('—'));
}

console.log('\nindex.html:');
{
  const html = readFileSync('index.html', 'utf8');
  check('carries the <!--#meta--> marker once', html.split('<!--#meta-->').length === 2);
  check('carries the <!--#fallback--> marker once', html.split('<!--#fallback-->').length === 2);
  check('no hand-written <title> (the build renders it)', !/<title>/.test(html));
  check('no hand-written fallback (the build renders it)', !/<main id="fallback"/.test(html));
  for (const placeholder of PLACEHOLDERS.filter((p) => !p.startsWith('<!--'))) {
    check(`no "${placeholder}"`, !html.includes(placeholder));
  }
}

console.log('\nthe static versions:');
{
  const versions = staticVersions();
  const expected = [];
  for (const dir of VERSIONED_DIRS) {
    const path = join('public', dir);
    if (!existsSync(path)) continue;
    for (const name of readdirSync(path)) if (statSync(join(path, name)).isFile()) expected.push(`${dir}/${name}`);
  }
  check('every file under models/, fonts/, projects/ has a version', expected.every((key) => /^[0-9a-f]{8}$/.test(versions[key] ?? '')), `${expected.length} files`);
  check('the compressed models are versioned', Object.keys(versions).some((k) => /-compressed\.glb$/.test(k)));
  check('versions are stable (same bytes, same hash)', JSON.stringify(staticVersions()) === JSON.stringify(versions));
  check('a missing directory versions nothing rather than throwing', Object.keys(staticVersions('does-not-exist')).length === 0);

  // Every runtime fetch of a public/ file goes through staticUrl. A bare
  // '/models/', '/fonts/' or '/projects/' string literal anywhere else in
  // src/ is a URL the immutable rule would serve stale.
  const bare = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.js$/.test(entry.name) && !path.endsWith('staticUrl.js')) {
        const source = readFileSync(path, 'utf8');
        for (const dir of VERSIONED_DIRS) {
          const literal = new RegExp(`['\`]/${dir}/`);
          // Strip comments before looking: prose about the directories is fine.
          const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
          if (literal.test(code)) bare.push(`${path.replace(/\\/g, '/')} ('/${dir}/')`);
        }
      }
    }
  };
  walk('src');
  check('no bare /models/, /fonts/, /projects/ URL in src/ outside staticUrl', bare.length === 0, bare.join(', '));
  check('staticUrl itself resolves', existsSync('src/core/staticUrl.js'));
}

console.log('\nthe host config:');
{
  check('public/_headers exists', existsSync('public/_headers'));
  const headers = readFileSync('public/_headers', 'utf8');
  const rules = new Map();
  let current = null;
  for (const raw of headers.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      rules.set(current, []);
    } else if (current) {
      rules.get(current).push(line.trim());
    }
  }
  const immutable = (path) => (rules.get(path) ?? []).some((h) => /^Cache-Control:.*immutable/.test(h));
  check('/assets/* is immutable', immutable('/assets/*'));
  check('every versioned directory is immutable', VERSIONED_DIRS.every((dir) => immutable(`/${dir}/*`)));
  const revalidates = (path) => (rules.get(path) ?? []).some((h) => /^Cache-Control:.*(max-age=0|no-cache).*must-revalidate|no-store/.test(h));
  check('/ and /index.html revalidate', revalidates('/') && revalidates('/index.html'));
  check('nothing unversioned is immutable', [...rules.keys()].filter(immutable).every((p) => p === '/assets/*' || VERSIONED_DIRS.some((d) => p === `/${d}/*`)));
  check('nosniff on everything', (rules.get('/*') ?? []).some((h) => /^X-Content-Type-Options: nosniff/.test(h)));
  check('public/robots.txt, public/favicon.svg', existsSync('public/robots.txt') && existsSync('public/favicon.svg'));
  const wrangler = readFileSync('wrangler.toml', 'utf8');
  check('wrangler.toml serves dist as static assets', /\[assets\][\s\S]*?directory\s*=\s*"\.\/dist"/.test(wrangler));
  check('wrangler.toml has no Worker script and no Pages key', !/^\s*main\s*=/m.test(wrangler) && !/pages_build_output_dir/.test(wrangler));
  check('.node-version pins a Vite 8 node (>= 20.19 / 22.12)', /^(2[2-9]|[3-9]\d)\s*$|^20\.(19|[2-9]\d)/.test(readFileSync('.node-version', 'utf8')));
  check('no public/draco copy (three ships the decoder)', !existsSync('public/draco'));
  // reference/source carries its own node_modules (three r183); an
  // optimizer that crawls it prebundles two threes (3 Sep).
  // The reference build's author is named in CREDITS.md and nowhere else
  // (Michael, 3 Sep: no mention on GitHub outside the credits). Tracked text
  // files only; the clone and the teardown notes are gitignored.
  {
    const { execSync } = await import('node:child_process');
    const tracked = execSync('git ls-files', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && f !== 'CREDITS.md' && f !== 'tools/check-site.mjs' && /\.(md|js|mjs|html|css|toml|txt)$/.test(f));
    const named = tracked.filter((f) => /bruno|folio-2025|\bsimon\b/i.test(readFileSync(f, 'utf8')));
    check('the reference author is named only in CREDITS.md', named.length === 0, named.slice(0, 3).join(', '));
  }
  const viteConfig = readFileSync('vite.config.js', 'utf8');
  check('dev optimizer discovery is off (reference/ has its own three)', /noDiscovery:\s*true/.test(viteConfig));
  check('three is deduped to the root copy', /dedupe:\s*\['three'\]/.test(viteConfig));
}

console.log(`\ncheck-site: ${failed ? `${failed} FAILED` : 'ok'}`);
process.exit(failed ? 1 : 0);
