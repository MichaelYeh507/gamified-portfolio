# Drive around my work

**Live at [michaelyeh.dev](https://michaelyeh.dev/)** since 3 September 2026.

A drivable open-world personal site. You arrive on an island in open water, seen
through a fixed diorama camera, and the content lives in the world rather than behind
routes.

Built on the model of an MIT-licensed open-world portfolio (credited in
`CREDITS.md`, and referred to throughout this repo as *the reference*), whose
source we read file by file, plus runtime hygiene from two other sites we
studied. The teardown notes are local working material and are not tracked.

```bash
npm install
npm run dev              # http://localhost:5173

npm run check            # every generated artifact and ported parser, verified
npm run palette          # rewrite public/palette.png from src/render/palette.js
npm run scale-ref        # rewrite public/scale-reference.glb from the runtime constants
npm run sweep-basin      # the sunken-plaza table (KNOWN-ISSUES 18)
npm run compress         # Draco-compress public/models (writes -compressed siblings)
npm run prep             # rebuild public/models from assets/models via the retint recipes
npm run build            # production build; reads -compressed models, ends in prune-dist
npm run preview          # serve dist/ on :4173 (falls through to :4174 if taken)
```

**After `npm run prep`, run `npm run compress`** — the production build reads
only the `-compressed` siblings and `prune-dist` fails the build if one is
missing, so a stale compress reports itself instead of shipping a 404.

**Deploying (Phase 6, 3 Sep).** The site is a static `dist/` served by a
**Cloudflare Worker with static assets** (`wrangler.toml`: an `[assets]`
directory and no script): the Git-connected project runs `npm run build` then
`npx wrangler deploy` on every push to `master` (`.node-version` pins Node
22), and the same two commands deploy from a laptop.
`public/_headers` carries the cache rules — a year, immutable, on everything
content-hashed (`assets/`) or content-versioned (`models/`, `fonts/`,
`projects/`, through `src/core/staticUrl.js`'s `?v=`), revalidation on the
HTML. The `<title>`, description, favicon, social preview tags and the
accessible fallback are rendered from `src/content/` at build
(`tools/lib/site-html.mjs`); **set `SITE_URL`** (a Pages build variable, or
`.env.production`) to the public origin so the absolute Open Graph URLs
appear — `prune-dist` warns until it is. `prune-dist` is the gate: it strips
what must not ship (raw GLBs, tooling files, three's unused Draco decoders)
and fails on what must (a placeholder in the HTML, a missing sibling,
`_headers`, the preview image).

**`npm run check` is the one to run before believing anything.** Eleven checks:
it re-derives `palette.png` from its source and diffs the pixels, runs our
`^ref` naming layer over **all 64 of the reference author's shipped GLBs** and checks the
counts against report `F`, runs the runtime pipeline over the reference's `areas.glb`
through a real `GLTFLoader`, drives a generated fixture family through the
**whole loader path** — `ResourcesLoader` → `GLTFLoader` → `parseModel` → the
material registry → `Physics.getPhysical` — into a **real Rapier world**, all
under node, proves the **retint tool** (decision 47) on both of its
assignment paths, byte-comparing the shipped lamp against its recipe, and
sweeps both content-driven districts — the **career corridor** (date rules,
slide math, digit patterns) and the **contact arc** (the reference's measured `areas.glb`
geometry, the `.length` layout) — over the **real height field** with the
island's no-overlap contracts, plus the **wayfinding** plan (roads, fords,
posts), the **leaves** simulation as a pure step, and the **shipping
surface** (`check-site`: the rendered head and fallback against the content,
the static versions, the `_headers` rules), and the **football pitch**'s swept
site. The naming and pipeline checks need
the reference build's source cloned at `reference/source/` (gitignored; the
repo is named in `CREDITS.md`); the rest need nothing but `npm install`.

**Boot flags** go in the hash and are read once at load: `#day=`/`#year=` pin the
cycles, `#palette=` picks a day-cycle candidate, `#gate` opens the colour gate,
and two art-phase levers — `#sink=` sinks the projects plaza and `#wind=` scales
tree sway. **All three look calls closed 23 Aug under one rule — most similar to
the reference's:** the corrected palette encode is simply how the world renders now
(`KNOWN-ISSUES.md` 22), wind ships at the reference's 0.5, and the plaza ships flat at 0,
because the reference's areas stand on flat land and the reference's carving is the water channels.

Arrow keys or WASD to drive. Shift boosts (the reference's real numbers: top speed 5 → 40,
force 3×, with the reference's screen speed-lines and twin ribbon trails). Space jumps —
the reference's suspension pop, not an impulse: tap to hop, hold to ride tall on extended
springs, tap in rhythm to bounce. X is the handbrake. Escape closes a card.
A car left
flipped or on its side **rights itself after three seconds** — the reference's auto-flip:
a mass-scaled hop plus a righting torque, retried until upright. R fades
out and puts you back at the nearest spawn point — **driving into the water
no longer drowns you** (decision 43 was withdrawn on
20 August, once measurement showed there is no deep water anywhere in either build:
1.2 units, everywhere, over a bedrock slab that follows you).

---

## Status

**Milestone 1 — the engine stands up end to end.** Verified in Chrome on the WebGPU
backend: boot, reveal, physics, driving, collision, shadows and the accessible
fallback all work. Measured: ~23 draw calls and ~119k triangles per frame, 1.6 ms
render encode.

**Milestone 2 — every design decision is settled** (19 August 2026). Forty-five
verdicts plus twenty-three technical ports are recorded in `ROADMAP.md` →
*Decisions settled*. The one deliberately **scheduled** rather than taken — the
day-cycle palette — has since been answered at its gate.

**Milestone 3 — content structure exists, and one project is written.**
`src/content/` holds three projects, one role and the link list against the settled
schema. **`aerial-ascent` is complete** — title, blurb, body, year, roles, stack,
link and two screenshots — so the slice is built against a real entry rather than a
placeholder. `edgeball` and `footnote` are still prose-`TODO`. **Both have titles
as of 20 Aug** — the RAG pipeline is **Footnote**, and its slug was renamed to match
in the same breath, which was the last moment that was free. The file still refuses
placeholder prose, because lorem ipsum has a way of shipping, so a blank blurb stays
blank rather than becoming filler.

**Milestone 4 — the shading block landed** (19 August 2026). Flat toon material, one
directional light, no tone mapping, bloom, and light intensities re-derived rather
than inherited. Details in `ROADMAP.md` → Phase 2a and in `KNOWN-ISSUES.md` 1, 3
and 9 — including the fact that the normal-flip "bug" that opened the block turned
out not to be a bug on our three version at all.

**Milestone 5 — the world model landed** (19 August 2026). The time scale and the
handling retune, the fixed camera, fog whose colour *is* the sky, the intro cinematic,
and the world shape. Concretely that means a 150-unit height field in infinite water, a
shore you can drive into — though not drown in, see decision 43's withdrawal — a
bedrock floor that follows you so leaving the
world is impossible, and a four-second opening that destroys its own scaffolding.
Numbers, and how each was measured against the reference's running build, are in `ROADMAP.md` →
*The instrumented A/B*.

**Milestone 6 — Phase 2a is closed** (19 August 2026). A 240-second UTC-epoch-synced
day cycle drives sky, fog, light, shadow and the reveal rim; a 365-day year cycle
carries five scalars and no colour at all. The colour gate ran — four candidate
palettes against four times of day, judged on the running build — and the answer was
**A, the reference's palette, kept**. So the sky is chosen rather than inherited, which was the
entire point of scheduling that decision instead of defaulting into it.

**Milestone 7 — the vertical slice is under way.** `Area` + `Areas` (lazy build, gated
update, fast travel) and `Beacons` (one DOM button, one active point) are in and
verified on the running build, and so are the plaza, the DOM card layer and in-world
type.

**Milestone 8 — Phase 2b is complete** (20 August 2026). Its last two items landed:
**deep links read both halves**, so `?at=projects&p=<slug>` stands you in front of
one specific board and opens its card when the cinematic ends; and **input
categories** replaced the single `suppressed` boolean with the reference's `inputs.filters`
design — every action declares the modes it is allowed in, and `Game.mode` is the
only thing that writes the filter set. The second one closed two live defects the
first one would have shipped to strangers (`KNOWN-ISSUES.md` 20 and 21).

**Milestone 9 — Phase 3's code-track opening sequence is complete** (21 August
2026). Five items, each written up in `ROADMAP.md` → *Read off the reference's running build*:
the **palette file** (`public/palette.png`, 128 × 4 — the gate on all Blender
work, since decision 37 bakes palette UVs there), a **scale-reference GLB** whose
every dimension is imported from the module that owns it, the **`^ref` import
path** (`src/pipeline/`, validated against **all 64 of the reference author's GLBs**), the
**sunken-plaza test** behind `#sink=`, and **ambient motion** — GPU-generated
noise plus the reference's shared wind field, so the world moves on shader time for the first
time.

Two things that came out of it are worth more than the features. **`npm run
check`** now re-derives every generated artifact and runs our ported parser
against the reference's real data, which corrected **four claims in report `F`**. And three
figures in our own docs turned out to describe a part as though it were the whole:
the car is **1.96 × 3.35** including wheels and spoiler, the camera's ground frame
is a **trapezoid** rather than a rectangle, and **the plaza does not fit in
portrait at all** (`KNOWN-ISSUES.md` 23).

**Milestone 10 — block A's engineering: an authored model can land** (22 August
2026). The half that touches Rapier exists now: `ResourcesLoader` (the reference's tuple
format, URL-keyed cache), the **name → material registry** (`F` rec 6 —
`palette` pre-registered, so a Blender mesh saying `palette` renders through our
whole shading model), and **`Physics.getPhysical`** (the reference's defaults to the letter:
density 0.1, friction 0.2, restitution 0.15, mass spread across colliders,
bodies born asleep). All of it is proven headlessly against a generated fixture
carrying every naming pattern at once, ending with a real Rapier body falling
onto a real trimesh floor under node. Both halves of the asset step landed with
it (`npm run compress` — Draco for models, and a pixel-exact `palette.ktx`).
The runtime glue landed 23 Aug (`src/world/Objects.js` — the reference's `Objects.add`,
with visuals following bodies through the car’s interpolation seam).
`ROADMAP.md` → *The loader path, end to end*.

**Milestone 11 — the first found asset stands in the world** (30 August 2026).
Decision 47 changed the sourcing that morning — found CC0/CC-BY models,
credited, nothing hand-modeled — and the **retint tool** landed the same day:
`npm run prep` (`tools/prep-model.mjs`) turns a found GLB into a game-ready one
(palette UVs on band centres, registry material names, the naming convention,
Y-up grounded at authored height, the licence riding the asset extras). Its
first asset is a CC-BY Sketchfab lamp post, split by connected components into
`palette` wood and a `paletteEmissive` light chamber on **band 12 — emissive
amber, the entry nothing had ever used** — standing twice in the plaza on
fixed Rapier bodies through the real `ResourcesLoader` road. `check-prep` is
the fifth `npm run check` suite; attribution lives in `CREDITS.md`.
`ROADMAP.md` → *The retint tool and the first found asset*.

**Milestone 12 — the car is a found asset** (30 August 2026, evening). An
original CC-BY concept buggy, chosen by measurement: one uniform scale makes
its wheel radius exactly `Car.WHEEL.radius` and its wheelbase land within 1 %
of the physics mounts, so the handling never moved. The prep tool grew
**extraction by node name** for models that kept their structure —
`carBuggy.glb` ships as a two-part rig (`buggyBody` plus one `buggyWheel`
instanced four times), colour-snapped onto the palette with the red tail
lights overridden onto the emissive seam. The first build shipped turned
180° — Michael caught it by driving — and the orientation is now a headless
check. `Car` takes a `visual` and generates its box car only as a fallback.
`ROADMAP.md` → *The car — 30 August, evening*.

**Milestone 13 — the island grew an undergrowth** (31 August 2026). The
retint tool learned its third input kind: **texture-atlas packs**, sampled
per triangle at the UV centroid (`sharp` decodes the embedded atlases) and
snapped to bands like any colour. Three CC-BY packs went through: bushes,
stumps, fallen logs, root snags, eight stone variants (the icosahedron rocks
retired), eight mushroom species, daisies and grass tufts, plus eight
medieval dressing props including a second streetlight. The palette spent
its first headroom on `wood`/`woodDark` (everything brown was snapping to
accent-orange), and amber-snapped triangles ride the emissive seam
automatically — with the haystack overridden to straw, because a glowing
haystack is a joke. **The found trees shipped and were pulled the same
day** — Michael drove them and called the mismatch; measured against the reference author's
own GLBs, the reference's tree is a thin branchy trunk with six icosphere puffs, so
`Island` generates trees again in exactly that construction, two-tone per
species with an orange-blobbed birch. The placeholder box houses left the
island on Michael's call. `ROADMAP.md` → *The nature packs — 31 August* and its
correction.

**Milestone 14 — a living island, a night, and the compressed build**
(31 August 2026, evening). The liveliness pass: flora spreads into the
clearings (drive-through ground texture; corridors stay drivable), trees and
undergrowth clump into four **groves**, counts up to 14 trees / 40 flora.
**The night**: `render/Night.js` + one shader term — amber is the emissive
band, so lamps, brake lights, flames, glow mushrooms and flower hearts all
light through dusk at once, merged scatter included, and the buggy gained
**headlights**: glowing lenses plus a warm shader cone pooling light on the
ground (the toon material ignores real lights, so the beam is math).
**The Draco flip**: production reads `-compressed.glb` through a 199 KB
wasm decoder — all 32 models are 166 KB on the wire (from ~2.5 MB) — while
dev keeps raw GLBs, and `npm run build` ends in `prune-dist`, which strips
dead weight and fails if compression was skipped. Verified on `vite preview`
via the performance API: zero raw GLBs fetched.

**Milestone 15 — the career corridor, and the site says its name**
(31 August – 1 September 2026). Decision 24 landed, then converged on
the reference author's real design over four of Michael's drives — the final build is
**measured out of the reference's `areas.glb` and `CareerArea.js`, not read out of
report `D`**, which twice described a corridor the reference's site doesn't have. What
stands: no sign boards — each entry is a **tilted floating text card**
(~20° off flat, always-emissive glyphs with nothing behind them) on a tiny
amber-capped stone marker, **popping out of the ground as you arrive and
sinking back after you pass**, with a time floor so a short entry read at
full throttle still stands long enough to read. The **label wipe** writes
each card on; the **7-segment year counter renders its digits in the vertex
shader** (7×10 pattern DataTexture, one uniform per digit, the reference's flat
`vec4(1.7)` white) and lies **flat on the road like pavement markings**,
gliding ahead of the car — dropped segments sink below the terrain, the
earth as the housing, which is the reference's trick exactly. Everything is
**data-driven from `content/roles.js`** with Michael's real dates:
education and work ride the same one-axis timeline in **separate lanes**
(school screen-left, work screen-right — CMU and Knollwood overlap in
time), same-lane concurrency queues in date order, and the scale is 4
world units per year (`#yearunit=` overrides live; one per year was
geometrically impossible against a three-year span). `check-career` is the
**sixth** `npm run check` suite: date rules, slide and queue math, digit
patterns, and the whole placement plan swept over the real height field —
which also forced the siting (west band, up-screen; the east belongs to
the plaza's eight-entry radius, the south to the reserved lobe). **The
landing landed with it**: `LandingArea` paints "Michael Yeh" and the
tagline as ground decals camera-side of the spawn, so the opening frame is
a title card. In-world type gained a night-glow term and a stroked
**bold**; the career cards run always-emissive, the reference's treatment verbatim.
`ROADMAP.md` → the *Now* entry.

**Milestone 16 — the contact arc** (1 September 2026). the reference author's `SocialArea`,
measured first and built second: the no-loader glTF walk over the reference's `areas.glb`
established that the reference's eight baked icons stand at **radius 7.85 on exactly the
`i·π/(N−1)` arc the reference's code computes** (3.49-unit chords, label points at radius
6 × y 1), and `contactArc.js` generalises that — the reference's step, centred on the
arc's top — so three links keep the reference's spacing instead of smearing over the
half-circle, and the module degenerates to the reference's layout digit for digit at
eight. Everything is **data-driven from `content/links.js`** (add a link,
the arc re-spaces): each link is a standing tilted always-emissive card
(label over address) on an amber-capped marker, with a beacon at the reference's exact
label geometry that opens the URL in a new tab — the reference's handler verbatim.
Where the reference's statue stands, the found **bonfire** burns with two log seats,
so the contact corner is a gathering spot by day and a point of light at
night. Sited by sweeping the height field: the north band at [-16, -26],
clear of the eight-project plaza, the corridor and the landing.
`check-contact` is the **seventh** `npm run check` suite, and the
`areas.glb` measurements live in it as failing tests rather than session
memory. **On Michael's first drive the links became objects** — extruded
3D marks (the octocat, the LinkedIn square, a generic envelope — Simple
Icons CC0 + Material's mail glyph, credited; deliberately not the Gmail
mark) at the reference's measured 0.2 thickness, each a **dynamic body asleep on a
pedestal** so the car can knock a logo off its stand, with the card cut
to a single amber address nameplate — the glyph is the label, which is
the reference's design exactly. `ROADMAP.md` → the *Now* entry.

**Milestone 17 — the content is done, and the name is drivable**
(1–2 September 2026). The last prose landed (knollwood's line and stack
from the resume), three look calls closed on Michael's verdicts (the
seaward exit stays, the cart's orange stays, every in-world label is
**always-emissive** now), and the buggy went **accent-cool teal** through
the full retint ritual. The about went through three cuts in two days —
a three-paragraph draft, then two lines, then an hour-lived card corner —
and landed on **the reference's design measured out of `areas.glb`**: the landing's
name is now **ten physical letters** ("MICHAELYEH", the same count as the reference's
"the reference name") standing at spawn as knockable dynamic bodies at the reference's mass 2
and depth ratio, with one amber ground sentence — "drive around my work" —
and nothing else. The site's whole self-introduction is a toy, which is
the reference's economy exactly; the CMU facts stand on the career corridor's
education slabs. `ROADMAP.md` → the *Now* entries.

**Milestone 18 — the car learned to play** (2 September 2026, one long
feel-tuning sitting; three details of Milestone 17 reversed inside it: the
teal went back to olive, the letters lightened to mass 0.5 under a bevel
middle weight, and the ground line reads "drive around my work and
career"). Everything came from **reading the reference's code, then judging on the
running build**: **boost** at the reference's real numbers (top speed 5 → 40, force
3×) with the reference's clip-space **speed lines** and the reference's DataTexture **ribbon
trails** — restyled after three judged candidates to a Rocket-League
read, additive, tapered, amber-to-teal; **jump** as the reference's suspension pop
(rest 0.88 → 1.63, stiffness doubled — tap to hop, hold to ride tall)
with **generated suspension-pole struts** standing in for the reference's
Blender-authored ones; and the **auto-flip** (the reference's 3-second grace, hop
plus righting torque — with the torque signs flipped, because the reference's
forward-X/axle-Z frame is opposite-handed to ours, a trap the ROADMAP
now records). Space is jump, Shift is boost, X is the handbrake.
`ROADMAP.md` → the *Now* entries.

**Milestone 19 — the island learned to point** (2 September 2026,
wayfinding — promoted by a visitor's getting-lost feedback). Measured
first, built second: the reference's `areas.glb` walked for signage found only the
bowling alley's neon marquee — **the reference's build ships no directional signposts**
(the reference's aids are roads baked into the terrain art plus the map button), so the
signs are ours in the established vocabulary. **Three sand roads** (the
career corridor's construction, one merged mesh) chain landing → plaza,
landing → contact, contact → career, ending under the plaza floor's rim
and teeing into the corridor's lead-in. **Where a road crosses a river it
fords it**: `Terrain.carveAt` eases the carve toward a 0.32 cap inside the
road's corridor, so render mesh, collision heightfield and water depth all
agree — measured at boost speed, the trunk crossing costs **zero drag and
zero vertical kick**, which closes the driving-smoothness watch item
(paving the corridors and smoothing what they cross was one task, as
predicted). **Four signposts** — marker stone, amber cap, tilted
always-emissive rows — name every other district with an arrow computed
from the **screen** bearing (the camera is fixed, so a printed arrow can
be honest); the spawn post stands in the opening frame. **And the reference's
oversized mass-0 bumper landed** — the letters are back at the reference's mass 2 and
plow with a crunch; the bumper is nearly frictionless because at the
chassis' 0.4 the first test high-centered on a toppled letter, measured
and recorded in `Car.js`. `check-wayfinding` is the **eighth** suite.

**Milestone 20 — the ground is the reference's system now** (2 September 2026, the
texture session — Michael: "his water is see through... his roads and
land actually have gradient and texture... the reference author has grass we can run
through"). The measured finding that reorganised everything: **the reference's water
and ground are one system** — the reference's water plane is invisible except for
white ripple lines and a shore band, and the "water colour" is the reference's
terrain painting the ground by depth. Ours now works the same way, on
our palette: the terrain texture grew ground-cover and blade channels,
the terrain carries a depth-driven gradient albedo (sand → teal → navy
under water, two-tone noised grass above), **roads are painted grass-free
strips** (the road meshes are deleted; the reference's roads were never meshes),
routes are **curved** through a spline all consumers share, the water is
**transparent** with the reference's scrolling ripple contours (the car wades in
plain sight), and **the reference's grass field** runs as one draw call of 40k
wind-blown billboarded blades wrapped around the camera. 0.42 ms per
tick with all of it on. Two compiled-WGSL traps recorded in the ROADMAP:
TSL's method-form `step` reverses its arguments, and
`renderer.debug.getShaderAsync` is the tool that ends blind shader
debugging.

**Milestone 21 — the first drive of the surface, five fixes** (2 September
2026, evening — Michael's list, taken before anything was built, fixed in
Michael's order, each judged from Michael's own drive frames). **The deep water was
flashing white** ("the entire thing"): the ripple port had the reference's
`terrainData.b` upside down — the reference's runs 0 at the shore to 1 in the deep,
ours ran floor to waterline — so every contour the reference's formula thins out
toward the deep was scrolling across our open sea; flipped, and gated in
behind the shore band so the fords keep their sand. **The grass is
trampled now**: the reference's `Tracks.js` ported — four wheel ribbons rendered
top-down into a 512² window around the car, the cover channel multiplied
down wherever they paint, the blades dropping out and the sand showing in
two ruts that fade ~25 units back (the reference's donuts test: a spiral of ruts on
the plaza lawn). **The roads are paved**: the reference's construction measured again
and found to be a *slab texture* masked by the terrain's red channel
(`Floor.js`), not bare dirt — so the terrain texture's spare alpha channel
is the paving mask, a flagstone texture is drawn on a canvas at boot
(`render/slabs.js`, the reference's 8×8 grid at the reference's 0.175/unit), mixed dirt → building
light by its grey and worn through by perlin, with the bare shoulder cut
from 2.2 to 0.9 units. **The letters are lighter** (mass 2 → 0.6: "much
lighter when hit"). **The arrows are shapes**: each signpost row carries
its exact screen bearing and turns an extruded amber arrow to it, the
eight glyphs demoted to the check suite. **And the far sea was the sky**:
with the water's colour on the ground, the 150-unit height field's edge
left nothing under the far water but the void — the bedrock grew a
visual sea floor in the terrain's own material, so the navy runs to the
horizon without a seam. Michael drove the whole session in the
verification tab, so every fix above was judged on Michael's drive, not a
screenshot.

**Milestone 22 — the dressing reacts** (2 September 2026, late; the
first item of Michael's "make the map feel alive" list). His set dressing
is all dynamic bodies born asleep at **mass 0.1** (`Benches.js`,
`Fences.js`, `Bricks.js`, one description); ours were visuals the car
drove through. `world/props.js` stands a found prop as the reference's description
with a collider from its own bounds: the corridor's fence panels, cart
and barrels and the contact arc's log seats are knockable now, and a run
at the fence topples the panels around the car. Michael's first drive
found the fence already down: the panel is 4.48 long and the plan stood
one every 2.1, an overlap that was invisible as visuals and a domino as
bodies. The step is a panel length now and `check-career` guards every
dressing body against being born inside another. The reference's floating props
(`waterGravityMultiplier: −1`) are not ported; ours sink.

**Milestone 23 — the plaza greets you** (2 September 2026, late; the
second item of the alive list). The reference's plaza's life is ambient loops on
authored props we do not have; the one pattern that ports is the reference's
blackboard's hop. Each board is its own group now and **hops once as you
come to it**, its title writing itself on with that first greeting (the
corridor's wipe, one-way). **A stack of three crates stands beside every
board**, the reference's mass-0.1 bodies, so each project has something to hit; a
haystack and two barrels dress the rim outside the lamps. **The reference's confetti**
is ported (`render/Confetti.js`, 500 planes over five seconds, the reference's vertex
maths on our tween, no instancing) and bursts at a board's feet when its
card opens, a third of it on the emissive band.

**Milestone 24 — leaves on the wind** (2 September 2026, late; the third
item of the alive list). The reference's `Leaves.js` is a GPU compute simulation of
instanced leaves pushed by the car, blown by the wind, lifted, damped,
dropped and clamped to the ground or the water. Ported split at the
backend: the simulation is the reference's shader as a **pure CPU step**
(`world/leavesSim.js`, the reference's numbers, the reference's doubled clock, the car's push by
its per-frame displacement exactly as the reference's reads it) and the draw is the reference's
(`world/Leaves.js`: the reference's leaf shape, tumble and spin, positions through a
float texture). **`check-leaves` is the ninth suite.** The first cut's
thousand leaves were the reference's peak-autumn density all year (Michael: "too much
leaves"); 256 is the reference's mid-season density on our window. They litter the
grass in two browns, float on the ponds, and fly when you boost through
them.

**Milestone 25 — the wind made visible** (2 September 2026, late; the
fourth item of the alive list). The reference's `WindLines.js` ported near-whole: four
pooled ribbons, each a zig-zag Catmull-Rom strip whose width bulges
mid-run and carries a travelling bump as a progress uniform runs, stood at
random around the focus every 0.3–2 s, turned to the wind, slid a unit
downwind over four seconds. White, unlit, unfogged. Ours billboards the
strip toward the eye instead of the reference's fixed tangent, and times itself on
the ticker rather than `setTimeout`.

**Milestone 26 — rain** (2 September 2026, late; the fifth item of the
alive list, and the first under Michael's new rule: his mechanisms, our
numbers). A small weather (`cycles/Weather.js`) derives rain from the
season's humidity and a shower clock, showers every few minutes;
`#rain=0.8` pins it. The reference's falling streaks (`world/RainLines.js`) fall
through a window pushed up-screen of the focus so none spawn at the eye;
the water grows hashed splash rings; the light drops a third at full
rain.

**Milestone 27 — the controls sheet** (2 September 2026, late; Michael's
call in place of the toasts). One panel, two lives: at launch a
non-blocking sheet of the seven verbs where the one-line hint stood,
fading like the stuck offer; and a menu behind `H` or the `?` button that
pauses the car under a scrim, closed by `H` or Escape. `core/Controls.js`.

**Milestone 28 — the fast-travel map** (2 September 2026, late; the
deferred wayfinding item). The reference's map modal in our vocabulary
(`core/FastTravel.js`): the island painted from its own terrain data,
turned so up-screen is up, a pin per district that travels under the
veil, a heading marker that follows the car. Centred and paused, a menu
you click a place on; the launch instructions moved to the top-right
corner to stay out of its way. `M` or its button toggles it, Escape
closes it.

**Milestone 29 — ready to ship** (3 September 2026, the deploy session).
Phase 6's repo half, every item on the production build: the audit
(6.3 MB → 4.85 MB — three Draco decoders shipped for the one fetched; now
three's own hashed glTF pair and nothing else), the head and the fallback
rendered from `src/content/` (no more "Your Name"), an SVG favicon and a
1200 × 630 preview frame, content-versioned static URLs under immutable
headers, Cloudflare Pages config, `check-site` as the tenth suite, and a full
preview run in Chrome on WebGPU — boot, intro, drive, card, map, controls,
night — with a clean console. **Live the same night at
[michaelyeh.dev](https://michaelyeh.dev/)**: a Cloudflare Worker serving
`dist/` as static assets, the domain from Cloudflare Registrar, headers and
Brotli verified on the live origin. Left: the phone pass.

**Milestone 30 — the first notes from the live site** (3 September 2026,
late). Michael's first drive on michaelyeh.dev sent back five things and all
five landed the same night: the corridor's fence is a wall (fixed bodies),
the career slabs' type is a third larger on a longer card, the plaza lamps
glow again (a shadowed-variable bug had silently compiled the amber
emissive term out of every material since 2 Sep, `KNOWN-ISSUES.md` 26), the
auto-flip rights the car in about 1.5 s instead of 4 (and now in deep water
too, where the damping used to beat the roll), the map and controls buttons
are labelled pills, and the rain rings stay off the open sea. Also found and
fixed on the way: the dev server had been running two copies of three
(`KNOWN-ISSUES.md` 27).

**Milestone 31 — a football pitch** (3 September 2026, late). A car-sized
ball at Rocket League proportions and a goal three balls wide, both
code-built, on the north shore's open ground (swept, `world/pitchPlan.js`;
`check-pitch` is the eleventh suite). Boost into the ball and it flies.

Not done yet: **touch steering** (`Input.js` reads keys only; the touch copy
says so honestly until it exists), toasts (deferred by Michael), bridges
(Michael has offered assets), the playground (designated cut), the foliage
sprite material, audio, the `availability` line when Michael writes it.

**Phase 2b is the current block**, and unlike 2a it *does* need the outstanding
writing — see `ROADMAP.md` → *Outstanding input*.

> **Before changing anything, read `KNOWN-ISSUES.md` and `ROADMAP.md`.** Places we
> built on a false premise, several corrections to claims this repo used to state
> confidently, and the rule that produced most of them: when a number describes the reference's
> build, measure it on the reference's running build rather than reading it out of the reference's source.

---

## What changed, and why

Reading the reference's source, then settling the open decisions, replaced the world model.
That replacement is now **done** — every row below has landed. It is kept here
because the parts that were removed all worked, and anyone reading Phase 1 code or
the older research reports will meet the old model and should know it is gone.

| Was | Is | Why |
|---|---|---|
| A dark neon void that grows as you drive | An island in open water, horizon dissolved by fog whose colour **is** the sky colour | Fog-equals-sky is how the reference's world edge vanishes; the void grid was never a backdrop in the reference's design |
| The reveal permanently tracking the car | A three-step intro cinematic that switches itself off after four seconds | Removes the permanent-rim quality problem, the grid aliasing past 150 units, and the deep-link-into-invisible-world collision |
| A chase camera swinging behind the car | Fixed 45° diorama camera, FOV 25° at radius 30, X/Z follow only | A fixed angle *deletes* occlusion and vertical discomfort rather than solving them |
| PBR + `NeutralToneMapping` | Flat toon shading, no tone mapping, bloom | Real PBR fights a 16-colour palette; with no tone curve every intensity in the research transfers verbatim |
| 300-unit world, trimesh collision | 150-unit height field at the reference's 1.5 cell size, one lobe left undeveloped | The reference's 192 carries a race circuit, bowling and a lab we do not need; a heightfield is the collider the reference's terrain actually uses |
| Nothing at the world edge | Water you can drive into and a bedrock floor that follows you | **The drowning half was withdrawn 20 Aug.** It had been invented on top of a world where the car cannot sink: the sea is 1.2 units deep everywhere, against a ride height of 1.135, so driving out to sea is wading. The follower floor is the reference's, and it makes falling out of the world unreachable |

**None of that Phase 1 work was wasted** — each piece was what proved the surrounding
system stands up, and the car-tracking reveal is arguably a better idea than the one
that replaced it. But do not treat any of it as final.

---

## Architecture

```
assets/
  models/              found-asset sources as downloaded (CC0/CC-BY — CREDITS.md)
public/
  projects/            project screenshots, 16:9. see the note on pixel-art scaling
  models/              game-ready GLBs, written only by npm run prep (+ -compressed siblings)
  draco/gltf/          the wasm Draco decoder the compressed build loads
src/
  main.js              boot, the reveal gate, ?at=&p= deep links, the fallback path
  content/             pure data. no imports, no three.js
    projects.js        3 entries; aerial-ascent complete, the other two prose-TODO
    areas.js           placement only — centre, spawn, heading, clearing
    roles.js           the career timeline; 1 unit per year
    about.js           prose blocks
    links.js           contact, laid out on an arc from .length
  core/
    Game.js            the singleton; hard init order lives here
    Ticker.js          one rAF loop, explicit priority slots
    Events.js          priority-aware emitter
    Viewport.js        resize + adaptive DPR with an oscillation guard
    Input.js           actions with categories; the reference's inputs.filters, device on <html>
    tween.js           ~50 lines, back.out and back.in
    Veil.js            the full-screen fade a respawn hides behind
    Controls.js        the controls sheet: launch instructions, then the
                       menu behind H / the ? button
    FastTravel.js      the map: island painted from terrain data, pins that
                       travel under the veil, a centred menu behind M
    flags.js           #gate / #palette=c / #day=0.25 debug flags, read once
  cycles/
    Cycles.js          epoch-synced keyframe walker; wrap injection, smoothstep
    DayCycles.js       240 s, the only cycle carrying colour
    YearCycles.js      365 days, five scalars, no colour anywhere
    Weather.js         rain 0..1 from the season's humidity and a shower
                       clock; #rain= pins it (ours, a tenth of the reference's)
    palettes.js        the four candidate palettes behind the 2a colour gate
  debug/
    ColorGate.js       #gate: pin a phase, step candidates, shoot the sixteen-up
  render/
    Renderer.js        WebGPU with WebGL2 fallback; bloom; cube-camera warm-up
    Reveal.js          the reveal uniforms and the two clip rules
    Intro.js           the three-step opening cinematic; deletes its own scaffolding
    Sky.js             one colour node used as both background and fog target
    Lighting.js        one directional light + the uniforms the material reads
    palette.js         one palette texture colours everything (props; the
                       terrain carries its own gradient albedo since 2 Sep)
    materials.js       content (flat toon), terrain albedo (the reference's depth
                       gradient), void, water (transparent + white details),
                       text, image
    textPlate.js       canvas -> alpha mask; Amatic SC; world-unit sizing
    slabs.js           the reference's flagstone texture, drawn on a canvas at boot
    Confetti.js        the reference's burst: 500 planes on one progress, our tween
    Trails.js          the boost streaks: the reference's DataTexture ribbon, RL-styled
  world/
    Physics.js         Rapier, 1/120 substep of wall clock, 1/60 simulated (2x)
    Terrain.js         the 101x101 height field everything reads — plus the
                       ground-cover/blade channels: roads are PAINTED here
    Island.js          placeholder props + spawn points; heightfield collider
    Water.js           three uniforms and a quad that follows the camera;
                       the surface is see-through, the reference's ripples + shore band
    Grass.js           the reference's field: one draw call of 40k wind-blown blades
                       wrapped around the camera, density from the terrain
    Leaves.js          the reference's leaves, the draw: shape, tumble, spin; positions
                       from a per-frame float texture
    leavesSim.js       the reference's leaves, the simulation: the reference's compute shader as a
                       pure CPU step — push, wind, lift, damping, floor, loop
    WindLines.js       the reference's gust streaks: four pooled zig-zag ribbons with a
                       travelling bump of width, stood around the focus
    RainLines.js       the reference's rain: static quads stretched into falling streaks
                       over a window, density by the weather's rain²
    props.js           a found prop as the reference's knockable body: mass 0.1, asleep,
                       collider from its bounds (fence, cart, barrels, logs)
    Tracks.js          the reference's wheel tracks: four ribbons rendered top-down into
                       a window around the car; the ground and grass read it
    Wayfinding.js      the four signposts, rows with turned arrow shapes
                       (roads became terrain paint, then paving)
    wayfindingPlan.js  routes (curved, sampled), fords, posts, arrows —
                       pure; shared with Terrain, Island, check-wayfinding
    Bedrock.js         kinematic follower floor at the water floor, plus the
                       visual sea floor past the height field (terrain material)
    VoidGrid.js        the neon x-glyph floor — intro scaffolding only
    Car.js             Rapier raycast vehicle; boost, suspension jump,
                       auto-flip, the reference's mass-0 bumper
    View.js            fixed-angle diorama rig, FOV 25, radius 30, X/Z only
    areas/
      Area.js          lazy build, gated update, enter/leave, spawnFor/openTarget
      Areas.js         the registry; one squared-distance test per area per frame
      Beacons.js       one DOM button, one active point, area-gated eligibility
      Card.js          the DOM content layer — dialog, focus trap, focus return
      ProjectsArea.js  the plaza: one board per project, laid out from .length
      CareerArea.js    the corridor: tilted text cards pop up + slide with the car
      careerTimeline.js  the corridor's pure arithmetic; shared with check-career
      YearCounter.js   7-seg year as flat road paint, digits in the vertex shader
      LandingArea.js   the drivable name (ten letter bodies) + tagline decal
      ContactArea.js   the arc: standing link cards + beacons around the bonfire
      contactArc.js    the reference's measured SocialArea geometry; shared with check-contact
```

Phase 2a and 2b are complete, and the four districts stand: the landing (the
drivable name), the plaza, the career corridor and the contact arc. There is
deliberately no about area — the reference's roster has none either — and the playground
is the designated cut. The content is written but for the optional
availability line. See `ROADMAP.md`.

`debug/` is never in the shipped bundle: `main.js` imports it dynamically behind
the `#gate` flag, so it builds as its own 4.5 kB chunk that nothing else references.

`content/` is live now — `ProjectsArea` lays the plaza out from `projects.length`
and `Game` builds `Island`'s clearings from `areas.js`. **Slugs in it are
immutable**: they are the achievement save keys and the deep-link keys, so
renaming one breaks saved progress and any pasted URL. Its two files are the
decision-25 split — `projects.js` is what the work *is*, `areas.js` is where it
*stands*, and neither ever contains the other.

### The frame

One loop, ordered by declared priority, so the sequence is readable in one place:

| slot | priority | does |
|---|---|---|
| `INPUT` | 0 | adaptive DPR sampling, tweens |
| `PRE_PHYSICS` | 10 | read input, set engine/brake/steer |
| `PRE_PHYSICS` | 10 | also: park the bedrock slab under the car |
| `PHYSICS` | 20 | step Rapier (1/120 substep of wall clock, 1/60 simulated, max 10) |
| `POST_PHYSICS` | 30 | sync meshes from bodies, stuck detection, water depth |
| `GAMEPLAY` | 50 | move the light rig (`Lighting.follow`) |
| `CAMERA` | 80 | fixed diorama rig (`View.update`), move the sea |
| `RENDER` | 998 | draw |

`GAMEPLAY` lost world growth with the intro rework and gains the cycles tick next.

### The reveal

A disc is defined in world XZ by `reveal.center` and `reveal.radius`. Then two
complementary rules:

- content materials **discard outside** the disc
- the void grid is **masked to zero alpha inside** it

The boundary is the glowing seam. There is no mask texture, no stencil, no second
pass, no streaming. Animating one float is the entire effect.

**This maths is ours, not the reference author's.** We originally credited the reference author, on the strength of a
teardown reverse-engineered from the reference's minified bundle. The reference's real `Reveal.js` is a
three-step intro cinematic: it runs for about 5.5 seconds, sets
`distance.value = 99999`, unsubscribes its own tick and destroys the void grid with
it. It never follows the car, and no area references it.

Having the disc *track the player* and tying growth to distance driven were our
additions — and as of 19 August those are the parts being removed, on the reasoning in
`ROADMAP.md` decisions 4–7. The discard maths stays and drives the intro.

### Palette

Every mesh shares one material and one 16-texel texture. A mesh's colour is just which
texel its UVs point at (`paint(geometry, COLOR.grass)`). Recolouring the whole site
means editing `src/render/palette.js`.

Two changes are already decided. The texture **widens to 128×4 with 4-pixel bands and
32 slots** — our 1-pixel bands are exact only because we generate them in JS, and they
will bleed the moment the palette is a KTX2 file. And once authored art arrives, UVs
are **baked at author time** — since 30 Aug (ROADMAP decision 47) that bake is a
batch retint script over *found* CC0/CC-BY models rather than a Blender session,
with `paint()` kept only for code-generated geometry. The rule generalises from
"did Blender make it" to "was it authored" (retint) vs "was it generated in code"
(`paint()`).

One correction worth recording: the comment in `palette.js` calling this "deliberately
not the reference author's magenta" was based on a false premise. The reference's base palette is sand, olive,
terracotta and gold — the synthwave read comes from a separate emissive layer entirely.
Ours is closer to the reference's than we thought, and the identity work belongs in the accent
layer.

---

## Things that bit, and why the code looks like it does

- **A TSL `Fn` body is ordinary closure scope, and a shadowed name is a
  missing shader term.** `makeContentMaterial` guarded its emissive band on
  `albedo === null` inside the `Fn`, where `albedo` was the colour var, not the
  parameter — never null, so every lamp went dark for a day with no error
  anywhere. Decide such things outside the `Fn`; read the compiled WGSL
  (`renderer.debug.getShaderAsync`) when a term seems weak rather than absent.
- **Vite's optimizer crawls every HTML file under the root, `reference/`
  included.** the reference author's clone carries its own three (r183); the dev server
  prebundled it against our r185 and the world lost its night. Discovery is
  off in `vite.config.js` and `three` is deduped. The build was never affected.

- **`smoothstep` edges must increase.** `smoothstep(0.18, 0.09, x)` is undefined in
  WGSL and silently returns zero. It made the entire void grid invisible. Every falling
  ramp in `materials.js` is written rising and inverted.
- **Chained TSL `.step()` and `.smoothstep()` put the receiver LAST.** `a.step(b)`
  compiles to `step(edge = b, x = a)` — the receiver is the *value*, not the edge
  (`three/src/nodes/math/MathNode.js:1157,1207`, r0.185.1). Read the functional way
  round, a seam that should be a 0.05-wide ring becomes the entire disc interior. Not a
  bug we have shipped, but the second edge-ordering trap in the same API, so assume the
  chained form is reversed until proven otherwise. **The reference's own core-shadow ramp trips
  it** — `MeshDefaultMaterial.js:105` chains to `smoothstep(1, -0.25, x)`, a falling
  ramp. Ported literally it silently deletes the whole core-shadow term.
- **`side: DoubleSide` does NOT need an explicit normal flip — and adding one breaks
  it.** This entry used to say the opposite, on the strength of the reference author's
  `MeshDefaultMaterial.js:76-79`. On three r0.185.1 `normalWorld` already passes
  through `negateOnBackSide()`, which multiplies by `faceDirection` for a DoubleSide
  material (`three/src/nodes/accessors/Normal.js:105`). Porting the reference's flip on top flips
  twice and lights back faces from the wrong hemisphere — measured on the terrain
  underside. `KNOWN-ISSUES.md` #1 has the numbers. Do not re-add it.
- **`Discard` inside a shared node graph.** It works in the content material and
  discarded everything in the void material. The void is transparent anyway, so it now
  masks by alpha, which has no such ambiguity.
- **`vehicle.currentVehicleSpeed()` is negative while driving forwards** against this
  chassis, which made the brake logic fight the throttle. `Car._forwardSpeed()` projects
  linear velocity onto the chassis forward vector instead. the reference author abandoned the same
  function.
- **`indexForwardAxis` is getter-only in Rapier 0.20** — only `indexUpAxis` can be set.
  Which is *why* the steering sign is what it is: the reference's rig is forward +X with the axle
  on +Z, ours is forward +Z, and a positive steering angle turns the car left in both
  frames. The reference's maps `left → +1`; ours mapped `right → +1` and therefore steered
  backwards for months. Two conventions that look opposite on the page, one of them
  correct, and only a measurement separates them (`KNOWN-ISSUES.md` 17).
- **Inverted steering is nearly invisible under a fixed camera.** The car travels
  diagonally across the screen rather than away from you, so every correction still
  works — just mirrored — and you adapt within seconds. It survived a 137-second
  instrumented drive that produced verdicts on the camera trail and the suspension,
  because that session was watching how the car *followed*, not which way it *went*.
  Feel testing finds what measurement cannot, and it still has to be told what to
  look for.
- **A focusable control cannot live inside an `aria-hidden` subtree.** `#ui` is
  `aria-hidden`, so the beacon button sits outside it — inside, it would have been
  reachable by Tab and invisible to a screen reader, which is worse than either.
- **Do not `preventDefault()` a key you did not have to.** The input layer suppressed
  the default for every mapped key, which was harmless until `Enter` was bound to
  `interact` — at which point activating any real button with the keyboard broke.
  Suppression is now limited to the keys that actually scroll the page.
- **Screen-projected UI needs an off-frame test, not just a behind-camera one.** A
  point can be in front of the camera and still project hundreds of pixels past an
  edge (measured at y = 6472 on a 682 px viewport), leaving a button invisible but
  still in the tab order.
- **`mergeGeometries` requires all-indexed or none.** `IcosahedronGeometry` is
  non-indexed; everything is normalised to non-indexed, which also gives the flat
  shading the style wants.
- **A hidden tab suspends rAF entirely**, so a frame-count reveal gate leaves a
  permanent loading screen for anyone who opens the site in a background tab.
  `waitForFrames` has a timeout fallback.
- **Porting a rate constant out of the reference's code is ×2, not ÷2.** The reference's constants multiply an
  already-doubled delta (`Ticker.scale = 2`), so their wall-clock rate is twice their
  face value. And the reference author mixes both deltas in the same file, so every constant has to be
  checked against which one it multiplies.
- **Every distance constant copied out of the `D` report is in 300-unit money.** Its
  worked example is written for a 300-unit world; ours is 150. That bit twice in one
  session — the area coordinates in §6.6 (a straight 0.5 rescale still lands the
  projects area on the waterline) and `buildAhead ?? 45` in §6.2, which on this island
  reaches most of the landmass and makes lazy building not lazy. Check radii, not just
  coordinates.
- **`flipY = false` is right for the reference's geometry and upside-down for ours.** glTF puts the
  UV origin top-left, so three sets `flipY = false` on GLTFLoader textures — and all the reference's
  text planes are Blender exports. A three-native `PlaneGeometry` has v = 1 at the *top*.
  Copying the reference's value renders every canvas label inverted. Measured with a canvas inked
  only in its top third.
- **A discard inside a transparent material's node graph draws nothing.**
  `makeVoidMaterial` already said so in a comment and `makeTextMaterial` re-learned it:
  `reveal.clipContent()` is a discard, so on a transparent surface the reveal has to be
  an alpha mask instead. The symptom is a mesh that is visible, correctly placed,
  correctly sized, and completely absent from the frame.
- **`fillText` does not wait for a webfont.** It silently draws the fallback and the
  texture is baked wrong forever, because nothing redraws it. `loadDisplayFont()` awaits
  `document.fonts` before anything draws — with a timeout, so a slow CDN costs a
  fallback face rather than a boot.
- **Reading pixels back has two traps, and both look like "it didn't render".** The
  sixth argument of `readRenderTargetPixelsAsync` is a *texture index*, not a
  destination buffer — pass an array and it fails as `Invalid value used as weak map
  key` from inside `copyTextureToBuffer`. And **the rows come back top-down**: index as
  `(y * width + x) * 4` with no flip. Assuming bottom-up samples the mirrored row, which
  is usually empty, so a perfectly uniform region is the symptom. It cost three separate
  investigations into a text plate that had been drawing correctly the whole time.
- **Bounds are not a shape.** `terrain.glb` measures `y −1.50 → 0.00`, which was read
  here as "the reference's land is dead flat with a shore dish". Decoding the actual heightfield
  shows 53 % land, 14 % floor and **32 % bank slope**, with rivers and inlets carved
  through the landmass — the thing Michael could see and the file's bounds could never
  have shown. Grepping the reference's source for `river` found nothing for the same reason: the
  river is not an object, it is an absence.
- **One word, two definitions, one comparison table.** The follow-up to that entry was
  wrong in the other column. Our side of the the reference's/ours terrain table counted sloping
  land relief as *land*, while the reference's side counted anything between 0 and −1.5 as *bank* —
  so the table reported us at 43.5 % land / 17.2 % bank when one classifier over both
  grids gives **2.4 % / 59.0 %**. The tell was that both splits sum to the same 61 %.
  It reversed the conclusion: we did not have too *little* bank, we had too much of the
  wrong kind. Both sides of a comparison have to come off the same script, not the same
  intention (`KNOWN-ISSUES.md` 18).
- **A focus point pinned to `y = 0` is only free on flat land.** The camera rig is
  `position = focus + offset; lookAt(focus)`, and the focus point projects to exactly
  ndc 0.0000 — it is the *car* that rides above it, by its ground height plus ride
  height. the reference author can pin the focus to 0 because every land vertex of the reference's is 0. With
  1.5 units of land relief the same code puts the car anywhere in an 0.18 band of
  half-frame depending on where it stopped, which reads as a camera fault and is not
  one (`KNOWN-ISSUES.md` 19).
- **Fixed-step physics read straight into a visual is a stutter on any monitor
  that is not a multiple of the step rate.** Our physics runs a fixed 1/120
  accumulator and `syncVisual` copied `body.translation()` out of it. Measured by
  driving in a straight line and sampling the *visual* mesh: at 148 Hz **18.9 % of
  frames did not move at all** and the step size varied by 48 %; at 144 Hz, 16.7 %.
  At 60 and 120 Hz it is flawless — which is exactly why it survived so long, and
  why Michael found it on his 148 Hz display and no measurement had. The fix is
  render-time interpolation: `Physics.alpha` is the accumulator remainder and the
  car draws between its previous and current pose. the reference author has none of this because
  the reference author steps once per frame with a variable delta — smooth visuals bought with
  non-deterministic handling. Interpolating buys both.
- **A carved channel is only as smooth as its bank gradient, and authoring depth
  and width separately loses control of it.** `bedDepth × 1.5 / halfWidth` is the
  peak slope of a smoothstep profile, and on a 1.5-unit collision grid it sets the
  step height the wheels track. Set independently, ours ranged 0.273 to 0.405 and
  Michael felt the steep one — *"one small puddle near the top left of the map that
  seems to make the driving rugged"* — which held six of the twelve
  highest-curvature cells in the grid. `halfWidth` is derived from `bedDepth` now.
- **`Math.max` of two smooth surfaces is not smooth.** It is continuous but its
  gradient is not: along the locus where the two are equal there is a crease, and a
  crease on a collision grid is a step. Every remaining roughness hotspot after the
  gradient fix was a channel confluence or a river mouth. A polynomial smooth-max
  took peak curvature from 0.735 to 0.540.
- **The reference's water is one quad, and every pond in the reference's world is an absence.** `Game/Water.js`
  holds two numbers and no mesh; `WaterSurface` is a single `PlaneGeometry(1,1,1,1)`
  scaled to the visible area, parked at −0.3, following the camera. There is no mask
  and no per-pond geometry — land at 0 sits above the plane so the depth buffer hides
  the water, and *everything* below −0.3 is wet. Ocean, river and pond are the same
  object. It means carving terrain is the whole of the feature, and it is why "a
  sunken plaza would fill with water" was never a problem to solve.
- **There is no deep water anywhere, in either build.** Surface −0.3, floor −1.5: the
  entire ocean is 1.2 units deep, forever, against a car ride height of 1.135. Driving
  out to sea is wading. Worth knowing before designing anything that treats depth as a
  consequence — decision 43 did, and it was withdrawn for it.
- **A coastline defined by a sum of sines is not a circle, and routing by radius fails
  silently.** `beachRadius` runs 40.7 at 105° against 61.2 at 195°. Channel endpoints
  chosen at a radius that was comfortably inland on one bearing sat twenty units out
  to sea on another, which connected two supposedly-enclosed lakes to the ocean. The
  symptom was a statistic reading 0 %, not anything visible. Place against
  `beachRadius(theta)`, never against a constant.
- **Path length and displacement are different stuck detectors.** The reference's accumulates
  distance travelled over 3 s against a 0.5 threshold; ours had summed displacement
  from 3 s ago against 1.2. A car circling at radius 1 once every 3 s has displacement
  0 and path length 6.28 — the old measure teleports someone who is plainly driving.
- **A placement gate can be stricter than the world it filters, and the symptom is a
  crash three call frames away.** Both dry-land tests asked for `heightAt >
  WATER_SURFACE + 0.4`. Flat land sits at 0, only 0.3 above the water surface, so the
  gate rejected every point on the island, `scatter` placed nothing, and
  `mergeGeometries([])` threw `Cannot read properties of undefined (reading 'index')`
  from inside three. Nothing in the message points at a margin constant. When a
  threshold is written as an offset from another constant, check it still fits after
  anything moves.

- **A deep link stands you in a place the default start never puts you, from the
  first frame, and that makes every "cannot happen yet" input path reachable.**
  Boot with `?at=projects` and the car is parked inside a beacon's radius with a
  built area around it while the opening cinematic has not started. Measured:
  `E` opened a project card over the cinematic, `R` fired the veil and teleported
  the car off the deep link's own destination, and the interact prompt was on
  screen throughout. All of it had shipped for a week behind the URL used for
  every test drive, because nobody presses a key during a cinematic they have
  seen fifty times. **The guard is a mode that starts locked** — `Game.mode`
  begins at `intro` and no action carries that category — not a list of things to
  remember to disable (`KNOWN-ISSUES.md` 20).
- **A `keydown` listener on a panel only fires while focus is inside the panel.**
  The card's Escape handler lived on the card element, which works right up until
  the visitor clicks the scrim behind it — the natural dismiss gesture — at which
  point focus is on `<body>` and the modal cannot be closed with the keyboard at
  all. Measured both ways. Escape is an input action now, arriving on `window`
  like every other key, with the single category `card` so it still cannot fire
  while driving (`KNOWN-ISSUES.md` 21).
- **The reference's input filter fails open twice, and both defaults are the wrong
  direction.** `Inputs.checkCategory` returns true when the filter set is empty,
  and true again when an action declares no categories — the comment above that
  second branch says "Forbid" and the code says allow. Forget a category on one
  action and it fires in every mode including the cinematic. Ours throws at module
  load for an action with no categories, and an empty filter set means nothing is
  allowed. A missing declaration should turn a key off, not leave it on
  everywhere.
- **Filter the keydown, never the keyup.** The reference's `start()` and `change()` check the
  category and the reference's `end()` does not, which looks like an oversight and is the
  load-bearing half: a key held across a mode change has to be able to end, or
  the throttle is stuck open with no keyup ever coming. Same class as `_onBlur`,
  and the reason the boolean this replaced only ever gated one of the two.
- **A screen-framing number means nothing without the distance it was measured
  at.** `ROADMAP` recorded the boards framing at "base 0.160 / top 0.574" and
  `ProjectsArea` recorded ground at "ny 0.53" for the same plaza; both are true
  and neither is the arrival picture. 0.160/0.574 is the *beacon standoff*, 2.0
  units out, and 0.53 was swept before the land was flattened, which moved every
  row of that table by about 0.14. Re-swept on the flat build the arrival at 5.5
  is ground 0.40 / top 0.79. Three numbers, three different questions, one label.
- **A hidden tab's `setTimeout` is throttled to ~1 Hz, and that is enough to lose
  a race against the boot.** A headless probe fired immediately after `navigate`
  read the car at the origin with the intro never started, for two of six URLs —
  which looked exactly like a deep link that had failed. It was `main.js` still
  behind `waitForFrames`' 2500 ms timeout, itself throttled. Gate a probe on
  something the code under test actually sets — `is-ready` on `<html>` here — and
  make the gate part of the recorded result, so a lost race reports itself
  instead of arriving as a finding.

---

## Next

`ROADMAP.md` is authoritative. In short:

1. ~~**Phase 2a — world model and rendering.**~~ **Closed 19 August**, all seven
   blocks, with the palette chosen at its gate rather than inherited.
2. ~~**Phase 2b — vertical slice.**~~ **Complete 20 August.** You can load the site,
   drive to a project, read it, and send someone a link that lands in front of that
   one board with its card open. Areas, beacons, the plaza, `setMode()`, the card
   layer, in-world type, both halves of the deep link and the real input categories
   have all landed, and `aerial-ascent` is written. **The only thing left in the
   block is the prose**, which is the item below.
3. **Phase 3 — the art and all the content.** The long pole. **Resourced 30 Aug
   (decision 47):** every asset is found — CC0 or CC-BY, credited in `CREDITS.md`
   and a site credits panel — and auto-retinted onto the palette by a script;
   nothing is hand-modeled. ~~Nothing clears the bloom threshold~~ — **the
   emissive layer landed 31 Aug** (milestone 14): the world glows at night, and
   what remains of the phase is the areas themselves.

   **Its shape is now measured rather than assumed** (20 August). Four findings in
   `ROADMAP.md` → *Read off the reference's running build* cut a lot of assumed effort: the reference author has
   **no animation system** at all, **~14 world textures** in total with noise and
   gradients generated at boot, models that are Blender but average **306 verts**
   with a ~14-mesh prop library reused 450 times, and areas where only about a
   **third of nodes carry visual geometry**. *The reference's 118 files against our 40* maps
   every one of the reference's systems as have / decided-out / scheduled / undecided, and
   *Immediate next actions* item 10 has the opening sequence.

   **The opening sequence is complete (21 August)** — all five code-track items:
   the palette file (`public/palette.png`, 128 × 4), the scale-reference GLB, the
   `^ref` import path, the sunken-plaza test and ambient motion. Each has a
   write-up under *Read off the reference's running build*. Two of them are validated by
   running our code against **the reference author's own 64 GLBs** (`npm run check`), which
   corrected four claims in report `F` on the way.

   **Four npm scripts came with it** and they are the fastest way to check the
   project is sane: `npm run check` (palette bytes, the naming layer against the reference's
   data, the runtime pipeline against the reference's `areas.glb`), `npm run palette`,
   `npm run scale-ref` and `npm run sweep-basin`.

**Two look calls are open and both are behind a boot flag** (21 August), so
neither has changed the shipped world: `#sink=` for how deep the projects plaza
sits, and `#wind=` for how hard the trees move. Both default to the world as it
was. `ROADMAP.md` → *Scheduled, not open*.

**The writing is now the critical path, and it is the whole of it.** It did not block
2a; it is all that is left of 2b, which is otherwise closed. **Both of the load-bearing blanks are
now filled** — `aerial-ascent` got its itch.io URL on 19 Aug and the RAG pipeline got
its name, **Footnote**, on 20 Aug. What is left is prose, which is a writing job
rather than a decision.
