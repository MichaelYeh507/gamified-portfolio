/**
 * The work. Pure data — no imports, no three.js, no coordinates.
 *
 * Placement is not here. Monoliths are laid out procedurally from this array's
 * length (ROADMAP decision 21), so adding an entry needs no Blender and no code.
 *
 * SCHEMA RULES (ROADMAP decision 25) — these exist to avoid the one systemic bug
 * in the reference author's own content data:
 *
 *   - `slug` is the identity and is NEVER the display string. It is the
 *     achievement save key and the deep-link key (`?at=projects&p=<slug>`).
 *     Renaming a title is free. Renaming a slug breaks saved progress.
 *   - `roles`, `stack` and `links` are ALWAYS arrays, even with one element.
 *     The reference's are `string | string[]`, which forces every consumer to normalise.
 *   - `blurb` is separate from `body`. The blurb goes on the monolith face and
 *     into the approach announcement; the body is the card. The reference's projects are
 *     all-or-nothing because the reference author has no equivalent.
 *   - `images` are filenames only. The path prefix is a constant in code.
 *
 * STATUS: scaffolded 2026-08-19, cut to three entries the same day. Everything
 * marked TODO is waiting on Michael. The structure is real; the prose is not
 * written yet, and a lorem-ipsum stand-in is deliberately not used — placeholder
 * prose has a way of shipping.
 *
 * **Slugs are immutable from the first shipped build.** ~~"From here, and this time
 * it is real"~~ — which is what this said on 19 Aug after `grappling` became
 * `aerial-ascent`, and it was wrong within a day: `rag-pipeline` became `footnote`
 * on 20 Aug when the project got its name. Recorded rather than quietly rewritten,
 * because the lesson is in the failure. **A rule cannot take effect on a date that
 * has not happened yet.** The condition that makes a rename free is *no saved
 * progress and no pasted link*, and both are still true today — no
 * `localStorage`/`sessionStorage`/`indexedDB` exists anywhere in `src/`, nothing has
 * shipped, no URL has been given to anyone. Naming the condition rather than a date
 * is what makes the rule enforceable: **the day the site is public, both stop being
 * true, and a slug change silently resets somebody's achievements and 404s their
 * link.** Until then a slug follows its title; after then it never moves again.
 */

/**
 * @typedef {Object} Project
 * @property {string}   slug        IMMUTABLE. The save key. Never change it.
 * @property {string}   title
 * @property {string[]} titleLines  pre-broken for the monolith face
 * @property {string}   blurb       <= 120 chars, shown on approach
 * @property {string}   body        real prose, shown in the card
 * @property {string}   year
 * @property {string[]} roles
 * @property {string[]} stack
 * @property {{label: string, url: string}[]} links
 * @property {string[]} images      filenames only; prefix lives in code
 */

/**
 * ORDER IS DISPLAY ORDER, AND IT IS READ FROM THE MIDDLE OUT.
 *
 * The plaza grows alternately outward from index 0 so that appending a project
 * never moves the monoliths already standing (`ProjectsArea.psiFor`). The
 * consequence is that **index 0 is the middle monolith** — the one you face when
 * you arrive on the area's spawn heading — and the rest fan out either side in
 * array order. Nothing breaks if this is reordered; the plaza just re-lays
 * itself. It is a display decision, not a structural one.
 *
 * `aerial-ascent` leads because it is the only entry that shipped to an
 * audience, which is also why Phase 2b is built against it.
 *
 * @type {Project[]}
 */
export default [
  // The one finished thing in the list, and the only one that shipped to an
  // audience — which makes it the right project for the Phase 2b vertical slice.
  // The monolith, the card and the deep link are all built against this entry.
  //
  // **It was a shared project, and one phrase is now what keeps the prose
  // honest about that.** The itch.io page credits "Ferenc, Aaron, Michael,
  // Matthew". Michael asked to drop the explicit headcount and then to cut the
  // middle paragraph, which is Michael's call twice over — but the second cut took
  // "*we* planned it" with it, so the whole of the shared credit now rests on
  // **"the first thing I *worked on*"**.
  //
  // That phrase is load-bearing. "Worked on" does not claim sole authorship;
  // "I built" or "I made" would, on a four-person project. Tighten it later and
  // the sentence stops being true, which is the kind of edit that looks like
  // copy-polish and is actually a factual change.
  //
  // `roles` is the reference's own answer, not a guess: the reference author wrote the scripts and made pixel
  // art assets. Naming two disciplines is what keeps it modest — it says which
  // parts were the reference's rather than implying all of them.
  //
  // Stack confirmed with Michael 19 Aug: **Unity and C#**, not the C++ Michael's first
  // note said. Published as HTML5, which on Unity is a WebGL export.
  {
    slug: 'aerial-ascent',
    title: 'Aerial Ascent',
    titleLines: ['Aerial', 'Ascent'],
    blurb: 'A 2D grappling-hook platformer: reach the top of the clouds, as fast as you can.',
    // Blank lines are paragraph breaks — `Card._render` splits on /\n\s*\n/.
    body: `Aerial Ascent is a 2D platformer built around one verb. You aim a grappling hook with the mouse, and an indicator tells you whether the surface will take it. The goal is the top of the clouds, as fast as you can get there.

It was the first thing I worked on that went the whole way from a design document to a build other people could actually play. That end-to-end pass is what turned making software from something I was assigned into something I went looking for.`,
    year: '2024',
    // Confirmed by Michael 19 Aug: he wrote the scripts and made pixel art
    // assets. Named as two disciplines rather than one "Solo" or "Creator",
    // because the project had four people on it and these are the parts that
    // were the reference's.
    roles: ['Developer', 'Pixel art'],
    // Unity ships C#, not C++ — see the note below. Published as an HTML5 build,
    // which on Unity means a WebGL export.
    stack: ['Unity', 'C#', 'WebGL'],
    links: [
      // Published, which none of the others are.
      { label: 'Play it on itch.io', url: 'https://fifiinart.itch.io/aerialascent' },
    ],
    // Filenames only; `ProjectsArea` owns the path prefix. 16:9 at 1024x576,
    // cropped from Michael's captures and scaled with **nearest-neighbour**,
    // which is not a detail: the game is pixel art, and a smooth filter invents
    // intermediate colours that both blur the pixel edges and wreck PNG's
    // compression. Lanczos gave 451 KB for the same frame; nearest gives 71 KB
    // and looks better.
    images: ['aerial-ascent-1.png', 'aerial-ascent-2.png'],
  },

  // Written 30 Aug from Michael's resume and the repo's "Why I built this",
  // on Michael's direction: *"more product focused and playful instead of it being
  // this technical."* The facts underneath are the resume's — the rally
  // segmentation, the denominator rule, the single laptop GPU — recast as
  // product character rather than bullet points. The table tennis background
  // (played since elementary school, qualified for US Nationals) is from the
  // repo's own Why section.
  {
    slug: 'edgeball',
    title: 'Edgeball',
    titleLines: ['Edge', 'ball'],
    blurb: 'Table tennis match analysis that shows its work. Every number knows which footage it came from.',
    body: `Edgeball watches table tennis footage the way a coach does, then shows its work. Feed it a broadcast recording and it finds the ball, cuts the match into rallies, and hands the whole thing back as numbers you can argue with, serve by serve, on a dashboard.

I have played table tennis since elementary school, far enough to qualify for US Nationals, and you can tell within seconds when an analysis tool is guessing. So Edgeball has one rule: measure what you can, refuse to display what you cannot. No denominator, no number.

It all runs on a single laptop GPU. Bring a match, get it back as data.`,
    year: '2025 – present',
    // Solo, unlike aerial-ascent — no shared credit to be careful of here.
    roles: ['Solo'],
    stack: ['Python', 'PyTorch', 'OpenCV', 'FastAPI', 'PostgreSQL', 'Next.js'],
    links: [
      { label: 'Source on GitHub', url: 'https://github.com/MichaelYeh507/Edgeball' },
    ],
    // Pulled 30 Aug from the repo's own docs/ media, on Michael's direction:
    // 1 is a frame of the demo GIF (the match dashboard with ball marker and
    // pose skeletons — the board face), 2 the README hero, 3 the evidence
    // page. 1024×576 cover-crop, JPEG — these are screenshots, not pixel art,
    // so the nearest-neighbour note on aerial-ascent does not apply.
    images: ['edgeball-1.jpg', 'edgeball-2.jpg', 'edgeball-3.jpg'],
  },

  {
    // **Renamed from `rag-pipeline` on 20 Aug, on Michael's call, and this is the
    // last time that was free.** The rule above still stands — a slug is the save
    // key and the deep-link key and is not renamed — but it is a rule about
    // breaking *existing* saves and *existing* links, and on 20 Aug there were
    // none: `grep -rn "localStorage\|sessionStorage\|indexedDB" src/` returns
    // nothing, no build has shipped, and no URL has been pasted anywhere. The
    // alternative was a permanent `?at=projects&p=rag-pipeline` for a project
    // called Footnote. Second and last exception, after `grappling` →
    // `aerial-ascent`; from a shipped build onward the answer is no.
    slug: 'footnote',
    title: 'Footnote', // Named 20 Aug by Michael.
    titleLines: ['Footnote'], // Vestigial; `_addTitleText` draws `title` on one line.
    // Written 30 Aug, same session and same register as edgeball. The "all
    // sixty of sixty" figure is the resume's (declined all 60 unanswerable
    // questions); the investment-firm origin is the repo's own Why section.
    blurb: 'Ask SEC filings a question and get an answer that quotes its source, or an honest refusal. Never a guess.',
    body: `Footnote answers questions about SEC 10-K filings, and every answer arrives holding its receipt: a quote checked word for word against the filing it came from. Ask something the filings never say and it does the rarest thing a Q&A product can do. It declines.

I built it after joining an investment firm, to learn what a financial data product is made of from the bottom up: fetch the filings, structure them, retrieve from them, answer out of them.

In finance, a wrong number with a confident citation is worse than no answer. Footnote's proudest statistic is the sixty unanswerable questions it turned down, all sixty, with the denominator attached.`,
    year: '2026 – present',
    roles: ['Solo'],
    stack: ['Python', 'FastAPI', 'PostgreSQL', 'pgvector', 'Next.js'],
    links: [
      { label: 'Source on GitHub', url: 'https://github.com/MichaelYeh507/Footnote' },
    ],
    // Pulled 30 Aug from the repo demo GIF: 1 is the answered state (question,
    // answer, citation, the verified-verbatim badge — the board face), 2 the
    // "Ask the filings" landing. Kept at the GIF's native 780×439 (already
    // 16:9 to a tenth of a percent); upscaling to 1024 would only soften the UI.
    images: ['footnote-1.jpg', 'footnote-2.jpg'],
  },

  // DEFERRED 19 Aug, not cancelled: the open-world experimentation had its own
  // entry here and Michael pulled it — "lets just keep this one project, its more
  // complete and even published on itch.io". Game development is one project
  // again, which is how it was originally given.
  //
  // Bringing it back is decision 22 working as designed: append an entry, write
  // the prose (~30 min), run two or three images through the compress script.
  // No Blender, no code, and the plaza re-lays itself from `.length`.
  //
  // The open question it carried is worth keeping with it — if that
  // experimentation is what led to *this site*, the entry can point at itself,
  // which is a good joke and a real credential. It needs the card to say so
  // rather than leaving people to work it out.
];
