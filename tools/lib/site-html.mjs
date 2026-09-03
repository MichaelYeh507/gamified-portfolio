/**
 * The site's HTML that is NOT the world: the `<head>` meta and the accessible
 * fallback, rendered from `src/content/` so a crawler, a link unfurler or a
 * browser without WebGL/WebGPU gets the real site and not a template.
 *
 * Shared by `vite.config.js` (which splices the output into `index.html` at
 * build and in dev through `transformIndexHtml`) and `tools/check-site.mjs`
 * (which proves the output against the content, headlessly). One renderer,
 * two consumers, so the check can never drift from what ships.
 *
 * Before 3 Sep the fallback was a placeholder ("Your Name",
 * "you@example.com") that would have gone live with the first deploy — the
 * exact Phase 6 audit item. It is data now: adding a project or a role
 * updates the fallback and the meta for free, the way the plaza and the
 * corridor re-lay themselves.
 *
 * Pure: no DOM, no three.js. The content modules are pure data too.
 */
import about from '../../src/content/about.js';
import projects from '../../src/content/projects.js';
import roles from '../../src/content/roles.js';
import links from '../../src/content/links.js';

/** Escape for text and attribute positions. Every content string goes through it. */
export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The site's identity, in one place. */
export const SITE = Object.freeze({
  name: about.name,
  /** The tab title. The reference's name first for search results; the site's own line after the dot the UI already uses. */
  title: `${about.name} · drive around my work`,
  /**
   * The meta description: `about.tagline` recast in the third person, plus what
   * the site is. Under 160 characters (`check-site` guards it) so a result
   * page shows all of it.
   */
  description: `${about.name} builds software that shows its work. Drive a car around an island to find the projects, the career and the contact links.`,
  /** Path of the social preview image, generated from a frame of the build (`public/og.jpg`, 1200 × 630). */
  image: '/og.jpg',
  imageAlt: `${about.name}'s portfolio: a small car on an island, seen from above`,
  themeColor: '#05070c',
});

/** The year of an ISO-ish date ("2024", "2024-09"), or '' for nothing. */
const year = (date) => (date ? String(date).slice(0, 4) : '');

/**
 * The years a role spans, honouring `roles.js`'s date rules: `null`/omitted
 * end is CURRENT, `''` is unwritten (say nothing rather than guess).
 */
export function roleSpan(role) {
  const from = year(role.start);
  if (role.end === null || role.end === undefined) return from ? `${from} to now` : 'now';
  if (role.end === '') return from;
  const to = year(role.end);
  return from === to ? from : `${from} to ${to}`;
}

/** A link's address without the plumbing, for display (`mailto:` stripped). */
export const displayAddress = (url) => url.replace(/^mailto:/, '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/**
 * The fallback `<main>`: the whole portfolio as real markup. Hidden while the
 * world runs, revealed by `main.js` if boot fails, always there for crawlers.
 */
export function renderFallback() {
  const byStart = (a, b) => String(b.start ?? '').localeCompare(String(a.start ?? ''));
  const dated = roles.filter((role) => role.start || role.end);
  const work = dated.filter((role) => (role.kind ?? 'work') === 'work').sort(byStart);
  const education = dated.filter((role) => role.kind === 'education').sort(byStart);

  const roleItem = (role) => {
    const head = `${escapeHtml(role.title)}, ${escapeHtml(role.org)}`;
    const line = role.line ? ` ${escapeHtml(role.line)}` : '';
    return `        <li><strong>${head}</strong> (${escapeHtml(roleSpan(role))}).${line}</li>`;
  };

  const projectItem = (project) => {
    const link = project.links?.[0];
    const anchor = link
      ? ` <a href="${escapeHtml(link.url)}" rel="noopener">${escapeHtml(link.label)}</a>`
      : '';
    return `        <li><strong>${escapeHtml(project.title)}</strong> (${escapeHtml(project.year)}). ${escapeHtml(project.blurb)}${anchor}</li>`;
  };

  const linkItem = (link) =>
    `        <li>${escapeHtml(link.label)}: <a href="${escapeHtml(link.url)}"${link.url.startsWith('mailto:') ? '' : ' rel="me noopener"'}>${escapeHtml(displayAddress(link.url))}</a></li>`;

  return [
    '<main id="fallback" hidden>',
    `      <h1>${escapeHtml(about.name)}</h1>`,
    `      <p>${escapeHtml(about.tagline)}</p>`,
    '      <p>This site is an island you drive a car around. Your browser could not start the 3D world, so here is everything that stands on it.</p>',
    '      <h2>Projects</h2>',
    '      <ul>',
    ...projects.map(projectItem),
    '      </ul>',
    '      <h2>Work</h2>',
    '      <ul>',
    ...work.map(roleItem),
    '      </ul>',
    '      <h2>Education</h2>',
    '      <ul>',
    ...education.map(roleItem),
    '      </ul>',
    '      <h2>Contact</h2>',
    '      <ul>',
    ...links.map(linkItem),
    '      </ul>',
    '    </main>',
  ].join('\n');
}

/**
 * The `<head>` block: title, description, icons, social preview and a
 * Person record for search engines.
 *
 * `siteUrl` is the public origin (`SITE_URL` in the environment, or in
 * `.env.production` once the domain exists). Open Graph requires ABSOLUTE
 * image and canonical URLs, so without it those tags are left out rather
 * than emitted wrong — `prune-dist` says so loudly at build.
 */
export function renderMeta({ siteUrl = '' } = {}) {
  const origin = siteUrl.replace(/\/+$/, '');
  const absolute = (path) => (origin ? `${origin}${path}` : '');
  const title = escapeHtml(SITE.title);
  const description = escapeHtml(SITE.description);
  const image = absolute(SITE.image);

  const lines = [
    `<title>${title}</title>`,
    `    <meta name="description" content="${description}" />`,
    `    <meta name="author" content="${escapeHtml(SITE.name)}" />`,
    `    <meta name="theme-color" content="${SITE.themeColor}" />`,
    '    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    '    <meta property="og:type" content="website" />',
    `    <meta property="og:site_name" content="${escapeHtml(SITE.name)}" />`,
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${description}" />`,
    '    <meta name="twitter:card" content="summary_large_image" />',
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${description}" />`,
  ];
  if (origin) {
    lines.push(
      `    <link rel="canonical" href="${escapeHtml(origin)}/" />`,
      `    <meta property="og:url" content="${escapeHtml(origin)}/" />`,
      `    <meta property="og:image" content="${escapeHtml(image)}" />`,
      '    <meta property="og:image:width" content="1200" />',
      '    <meta property="og:image:height" content="630" />',
      `    <meta property="og:image:alt" content="${escapeHtml(SITE.imageAlt)}" />`,
      `    <meta name="twitter:image" content="${escapeHtml(image)}" />`
    );
  }

  // A Person record: name, the site, and the profiles the contact arc links
  // to, so a search engine ties them together. Email deliberately left out
  // of the structured data (it is in the markup for humans already).
  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: SITE.name,
    ...(origin ? { url: `${origin}/` } : {}),
    sameAs: links.filter((link) => /^https?:/.test(link.url)).map((link) => link.url),
  };
  lines.push(
    `    <script type="application/ld+json">${JSON.stringify(person).replace(/</g, '\\u003c')}</script>`
  );

  return lines.join('\n');
}

/** Strings that must never reach a shipped `index.html`. */
export const PLACEHOLDERS = Object.freeze(['Your Name', 'you@example.com', 'Short line about', '<!--#meta-->', '<!--#fallback-->']);
