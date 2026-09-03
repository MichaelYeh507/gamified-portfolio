/**
 * Where the six places are. Placement only — no prose, ever.
 *
 * The other half of decision 25's split: `projects.js` says what the work is,
 * this says where it stands. Changing where the plaza lives never touches the
 * writing, and writing never moves the world. the reference author's `CareerArea` is the
 * counter-example — the reference's placement is baked into the GLB, so editing a job title
 * means a Blender re-export.
 *
 * **Every coordinate here was rescaled from `D` §6.6, and it needed it.** That
 * example places areas at `[95, -40]` and `[-100, -55]`: a 200-unit span, written
 * for a 300-unit world. Ours is 150 with a land radius of 40.2–61.4, so a
 * literal copy would have put four of the six areas in open water. Rescaling by
 * 0.5 is not enough either — `[47.5, -20]` is radius 51.7 against a beach radius
 * of about 51 on that bearing, i.e. exactly on the waterline. The projects centre
 * below was swept over the real height field instead; see `ProjectsArea`.
 *
 * @typedef {Object} AreaDef
 * @property {string} id                the deep-link key (`?at=<id>`). Immutable.
 * @property {[number, number]} center  world XZ
 * @property {number} [radius]          inside this, `update()` runs
 * @property {number} [buildAhead]      how far outside `radius` to build
 * @property {[number, number]} [spawn] where fast travel puts the car
 * @property {number} [heading]         which way it faces you when it does
 * @property {number} [clearing]        keep `Island`'s prop scatter this far out
 */

/** @type {AreaDef[]} */
export default [
  {
    id: 'landing',
    // The island's first spawn. The radius is deliberately tiny — the plaza's
    // derived radius reaches within 6.4 units of the spawn, and areas must
    // not overlap; LandingArea's header carries the arithmetic.
    center: [0, 0],
    radius: 5,
    // Face the projects plaza, the same bearing `Game.placeAtStart` derives —
    // the one moment the site gets to say "there is somewhere to go".
    heading: 1.0,
  },
  {
    id: 'projects',
    // Swept over the real terrain rather than chosen: flattest footprint that
    // still holds all eight future monoliths on dry, developed land. Relief
    // 0.18 over the plaza, 33.3 units from spawn, bearing 33 degrees.
    center: [28, 18],
    // `radius` and `buildAhead` are derived from the arc in `ProjectsArea`, so
    // they cannot fall out of step with the monolith count. Left out here on
    // purpose — a number in this file would be the one that goes stale.
    spawn: [28, 18],
    // Face the middle monolith: -X-Z, which is the one direction that has the
    // recessed faces pointing back at you under a camera fixed at theta = 45.
    heading: -Math.PI * 0.75,
    // Decision 21's plaza floor is authored art and cannot share ground with a
    // randomly scattered building. This is `SPAWN_CLEARING` generalised: the
    // island refuses to scatter inside it. 20 covers the three-monolith arc
    // (12.9 from centre) plus the floor apron; `ProjectsArea.build()` warns if
    // a future monolith outgrows it.
    clearing: 20,
  },
  {
    id: 'career',
    // The west band between the trunk river and the north-west inlet — the
    // one strip of the island that holds a straight corridor. The east is
    // spoken for (ProjectsArea's radius reaches 41.6 once decision 21's eight
    // entries exist, and areas must not overlap), the south is decision 3's
    // reserved lobe, and every screen-horizontal strip crosses a channel.
    // Verified against the real height field by `check-career`, which sweeps
    // the whole placement plan for dry, flat ground — the corridor's version
    // of Terrain's channel-routing assertion.
    center: [-49.3, -4.3],
    // `radius`, `spawn` and the corridor's length all derive from the dates
    // in `content/roles.js` inside `CareerArea` — a new role lengthens the
    // district by itself. Numbers here would be the ones that go stale.
    // The heading drives up the corridor: −3π/4, the axis of increasing
    // years (careerTimeline.AXIS_HEADING — restated here because this file
    // imports nothing, by design).
    heading: -Math.PI * 0.75,
    // Keeps Island's scatter off the road, the slab line and the dressing.
    clearing: 16,
  },
  {
    id: 'contact',
    // The north band, swept over the real height field like the plaza was:
    // zero relief across an 11-unit disc, 4.9 units clear of the projects
    // area even at decision 21's eight entries, 5.7 clear of the career
    // corridor, 30.5 from spawn. The south stays decision 3's reserved lobe.
    center: [-16, -26],
    // `radius` and `spawn` derive from the measured arc inside `ContactArea`
    // (`contactArc.js` carries the areas.glb numbers) — same staleness rule
    // as the career def above. The heading faces up-screen into the arc.
    heading: -Math.PI * 0.75,
    // Keeps Island's scatter out of the arc and the fire circle.
    clearing: 12,
  },
  // There is deliberately NO about area, and it existed for one hour on
  // 2 Sep before Michael cut it ("he had letters of his name he can run
  // over, and thats it" — which is also the measured truth of the reference author's own
  // roster). The landing's drivable letters plus one ground sentence are
  // the whole self-introduction; the CMU facts live on the career slabs.
  // The swept site at [10, -38] is recorded in git history if it is ever
  // wanted back.
];
