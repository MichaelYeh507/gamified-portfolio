/**
 * Contact and social links, in display order. Pure data.
 *
 * The ContactArea lays these on an arc computed from `.length` — the reference author's
 * SocialArea trick — so adding or removing one never touches Blender or geometry
 * code (ROADMAP decision 21, and E report §11.3).
 *
 * STATUS: complete 2026-08-30 — GitHub and LinkedIn supplied by Michael.
 */

/**
 * @typedef {Object} Link
 * @property {string} slug   IMMUTABLE. Also the icon key.
 * @property {string} label  what the visitor reads
 * @property {string} url
 */

/** @type {Link[]} */
export default [
  { slug: 'email',    label: 'Email',    url: 'mailto:michaelyeh507@gmail.com' },
  { slug: 'github',   label: 'GitHub',   url: 'https://github.com/MichaelYeh507' },
  { slug: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/in/michael-yeh-cmu/' },
  // Add or remove freely — the arc resizes itself.
];
