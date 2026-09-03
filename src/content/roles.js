/**
 * The career timeline. Pure data, date-ordered, no coordinates.
 *
 * This drives the CareerArea, which is a CORRIDOR rather than a kiosk
 * (ROADMAP decision 24): position-driven, no UI, no state, readable while
 * moving. the reference author's equivalent is 375 lines against the reference's 1,555-line project kiosk
 * and it is the better reading experience of the two.
 *
 * SCALE: the corridor runs at ONE YEAR PER WORLD UNIT. So the span from the
 * earliest `start` to the latest `end` literally sets the district's length in
 * metres. Two roles across three years is a 3-unit corridor, which is nothing —
 * expect to either stretch the scale or lean on the walls until the list grows.
 * `#yearunit=2` stretches it live for judging; the shipped value is a constant
 * in `CareerArea`.
 *
 * the reference author's career data is the ONE thing on the reference's site that needs a Blender
 * re-export to edit, because the reference author baked placement into the model. Ours does not.
 *
 * EDUCATION RIDES THE SAME CORRIDOR (Michael, 30 Aug: "i really like his
 * career and education timeline animation"). A school entry is just an
 * earlier stretch of world units on the same drive — same Role shape, `org`
 * is the school, `title` is the degree, `kind: 'education'` so the corridor
 * can dress it differently.
 *
 * DATES, precisely, because the corridor draws them:
 *   - `end: null` (or omitted) means CURRENT — the slab runs to today.
 *   - `end: ''` means the date is NOT WRITTEN YET — a TODO, not a claim.
 *   An entry missing one date stands as a warned-about one-year placeholder;
 *   an entry missing both is skipped (a timeline cannot show an undated span
 *   without lying) and named in the console every boot until the dates land.
 *
 * STATUS: scaffolded 2026-08-19 from one title; the education entries
 * scaffolded 2026-08-31 when the corridor was built; knollwood's title, line
 * and stack landed 2026-09-01 from Michael's resume, and he approved the
 * drafted cca line the same day ("cca tagline is good"). Still optional and
 * unwritten: the cmu and cmu-ai lines.
 */

/**
 * @typedef {Object} Role
 * @property {string}   slug     IMMUTABLE. The save key.
 * @property {string}   org
 * @property {string}   title
 * @property {string}   start    ISO-ish: "2025-03" is enough
 * @property {string}   [end]    omit or null while current; '' while unwritten
 * @property {string}   line     ONE line. This is what you read while driving past.
 * @property {string[]} stack
 * @property {'education'|'work'} [kind]  default 'work'
 * @property {string}   [body]   optional longer text, if the role gets a card
 */

/**
 * Dates supplied by Michael in chat, 31 Aug 2026: the corridor starts from
 * 2024 in high school; CMU Information Systems from fall 2024, the additional
 * major in Artificial Intelligence begun 2025; Knollwood from June 2026,
 * current. The `line` fields on cca and cmu are DRAFTED from those facts in
 * the site's register (short, product-focused, no em-dashes) — Michael's words
 * replace them on Michael's read. The knollwood line is still entirely Michael's.
 *
 * CMU AND KNOLLWOOD OVERLAP — school and job at once — which is why the
 * corridor runs education and work in separate lanes (education screen-left,
 * work screen-right; `CareerArea`).
 *
 * @type {Role[]}
 */
export default [
  {
    slug: 'cca',
    org: 'Canyon Crest Academy',
    title: 'High school',
    start: '2024',
    end: '2024-08',
    line: 'Where game development took hold.',
    stack: [],
    kind: 'education',
  },
  {
    slug: 'cmu',
    org: 'Carnegie Mellon University',
    title: 'BS Information Systems',
    start: '2024-09',
    end: null, // current
    line: '', // TODO — optional; org, title and years already carry the slab
    stack: [],
    kind: 'education',
  },
  {
    // Its own slab, on Michael's call (31 Aug: "you can have the artificial
    // intelligence additional major separate from information systems").
    // It overlaps the IS entry on the same lane — the corridor's same-lane
    // queue keeps the two stones spaced (`CareerArea`).
    slug: 'cmu-ai',
    org: 'Carnegie Mellon University',
    title: 'Additional major in Artificial Intelligence',
    start: '2025',
    end: null, // current
    line: '', // TODO — optional
    stack: [],
    kind: 'education',
  },
  {
    // Filled 1 Sep 2026 from Michael's resume. Full employer name is
    // "Knollwood Investment Advisory" (Baltimore, MD) — the slab keeps the
    // short form because a 29-char org wraps badly at driving-read sizes;
    // swap it back if Michael prefers the full name. The line is the record
    // matcher's story: entity resolution joining Salesforce to the
    // warehouse with no shared key, now the firm's canonical entity ID.
    slug: 'knollwood',
    org: 'Knollwood',
    title: 'AI Software Engineering Intern',
    start: '2026-06',
    end: null, // null = current. Set a date if it has ended.
    line: 'Taught Salesforce and the warehouse to agree.',
    stack: ['Python', 'Salesforce', 'FastAPI', 'Azure'],
    body: '', // optional
  },
];
