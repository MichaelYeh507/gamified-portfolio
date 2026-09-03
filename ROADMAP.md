# Roadmap

Status as of **19 August 2026**. Companion to `README.md` (architecture),
`KNOWN-ISSUES.md` (what is currently wrong) and `research/` (the teardowns this
is derived from).

Direction: **drivable open world**, the the reference site model.

**Every open decision was settled on 19 August 2026**, after reading the reference's real
MIT-licensed source file by file. Forty-five verdicts plus twenty-three technical
ports are recorded in *Decisions settled* below, with what each one changed. One
input is still outstanding — the actual written content — and one decision is
deliberately scheduled rather than taken: the day-cycle palette, which is a gate on
closing Phase 2a. See *Outstanding input* and *The 2a colour gate*.

---

## Now / Next / Later

| | |
|---|---|
| **Now** | **The football comes back — 3 Sep, late, the handoff's 0c, taken while the touch work was staged.** `pitchPlan.ballLost(pos, ground)` is the rule, pure: lost is wet ground (`heightAt ≤ WATER_SURFACE`), off the map (beyond the terrain's half size on either axis), or a non-finite position; `Pitch.update` counts how long it has been lost and at **3 s** (`RESET.seconds`) puts it back at the centre spot, upright and still, through `setTranslation`/`setLinvel`/`setAngvel` with the wake flag so `Objects.syncVisuals` copies the pose on the transition. The wait is the design: a ball that skips through a ford is still in play. R stays the car's. **Measured on the dev build** (ticks pumped): dropped 80 units out past the beach the ball fell through the void (no bedrock follower out there — the follower is the car's) to y −12.7 in a second, and at 3 s it was back at [9, −31], y 1.90, asleep, the visual at the same point; a one-second dip in the sea followed by a return to the patch: no reset, the counter back at 0. Nine guards joined `check-pitch` (the centre, the mouth and the whole patch are not lost; the sea and off-map are; the water-line edge, made to fail). Not built: a score, a second goal. Previous entry: **Touch steering — 3 Sep, late, the first item of the handoff** (`KNOWN-ISSUES.md` 24 closed). The reference's mechanism, from `Inputs/Nipple.js` and the nipple half of `Player.updatePrePhysics` (`Player.js:572-598`): the stick is not a pad in a corner but **a ring anchored at the car, in the world** — the finger's ground point (a ray through the camera onto a plane at `clamp(carY − 0.25, 0.1, 0.65)`) is read against the car **every tick**: distance is the throttle (0 inside radius 2, 1 at 4.5, then cubed, so a resting thumb creeps), bearing is the steer (a 270° forward arc, 45° off the nose = full lock), the rear 90° reverses with throttle and steer both flipped so the car backs toward the finger, and a tap inside the inner radius is a 200 ms hop. Ours: `core/stickMath.js` (pure, the sign contract written down: bearings are `atan2(z, x)`, positive offset = clockwise from above = the car's right = positive `Input.steer`), `core/TouchStick.js` (pointer events on the canvas; **the first touch owns the stick and every other canvas touch is ignored** — the reference lets go on a second finger because the reference pinches, and we do not), `render/StickRing.js` (the reference's ring shader as it stands, radii shared with `STICK`), `Input.set(name, value)` (an analog write through the same filter and edge events as a key; the falling edge never filtered), `Input.prefersTouch()` (`(hover: none) and (pointer: coarse)` seeds the mode, so the launch sheet is the touch one before the first tap), `Car.headingXZ()`, and `Car.control` now scales the engine force by `drive` (a key is still ±1). **The buttons**: `#touch-pad`, boost and jump held, bottom-left opposite the pills (the reference's touch build has neither — it has interact and unstuck, and the reference's tap is the hop; Michael asked for both); interact is the beacon already, unstuck is the hint, which is a tappable button on touch now ("Stuck? Tap here"), and the controls modal closes on a scrim tap. Copy: the title suffix is "drag to steer", a second table of gestures under `.input-touch`, key chips hidden on the pills. **Measured on the production build** (`vite preview` on :4190 — :4173 is held — synthetic `PointerEvent`s with `pointerType: 'touch'`, ticks pumped in the hidden tab): a finger 6 ahead → drive 1 and 23.5 units along the heading in 2 s; a finger 0.5 rad clockwise of the nose → steer +0.64 and yaw +0.42 rad in 1 s (to the right, as the contract says); straight behind → drive −1 and −23.0 along; a tap on the car → jump 1, the body rose 2.30, the ring hopped, 0 again after 200 ms; the boost button → `car.boosting` true; the jump button → rest length 1.63 held, 0.88 released; the ring's outer radius is 238 px on a 1351 × 823 viewport; the touch sheet reads "CONTROLS · drag to steer" over the six gestures; the scrim tap closes it. **One bug the probe found, fixed, and now guarded:** Chrome throws `NotFoundError` from `setPointerCapture` for a pointer id it is not tracking, and the throw left `_onDown` half-run — the stick claimed, no finger on it, re-reading a stale point every tick (the car drove itself 18 units during the reverse probe). The capture is in a try, and `check-touch` reproduces it with a stub that throws. **`check-touch` is the twelfth suite**: `stickMath` (fourteen guards), `Input` + `TouchStick` under a stubbed `window`/`document` with a real three camera and a real ray (a touch ahead drives, a mouse does not, a second finger is ignored, the car turning under a still finger re-reads, a mode change releases a held finger and it stays released, a tap is a 200 ms hop, the pad holds and lets go, a refused capture still works), and the copy; made to fail on the steer sign and on the mode release. **Not measured here**: portrait (the MCP window would not go below 1351 wide — Michael's phone pass), a real thumb (the same), the ring on the WebGL2 fallback. The radii are the reference's 2 / 4.5 for the first drive; Michael tunes by thumb. Previous entry: **A football pitch, at Rocket League scale — 3 Sep, late, on Michael's ask** ("can you add a soccer ball and goal near top left of the map", then, on the first cut: "add it to the top right of the map, and also make the ball similar scale to how rocket league balls are to a car"). Code-built, both halves (decision 47's `paint()` side): **the ball** (`world/Pitch.js`) is an icosahedron painted white with the palette's black on the faces around its twelve base vertices (a football's pentagons, near enough), a dynamic ball collider born asleep through `objects.add`, **radius 1.9** — Rocket League's ball is 92.75 uu against a 118 uu car, a diameter of 1.6 car lengths and five car heights; ours is 1.2 car lengths and three car heights against the 3.1-unit buggy, a touch under so it reads as a ball beside the districts and not a planet — with our numbers (`BALL`: mass 0.3, restitution 0.6, damping 0.3/0.5: light enough for a boosted bumper to loft, damped enough to stop rather than roll into the sea); **the goal** follows the ball — 11.4 wide, 5.6 tall, 3.4 deep (three balls across, a ball and a half tall; the reference game's 9.6-ball width would be a wall on a 150-unit island) — white posts, a crossbar, a back frame and a net of cords merged into one mesh, a fixed body with cuboid colliders for the frame and thin walls where the cords are, so a ball that goes in stays in and a car that drives in meets the net. **The site is swept, not chosen** (`world/pitchPlan.js`, pure): the map's frame is up-screen at the top, so "top right" is map-right > 10 and map-down < −12, and that land was swept for the widest flat disc clear of the roads, the contact hangout's clearing, the plaza's and the shore — **[9, −31]**, flat to an 11-unit radius with every margin ≥ 8, the north shore's open ground where the about corner stood for an hour on 2 Sep; the goal on the far side with its mouth toward the island's middle, the ball at the centre six units out. (The first cut sat top-LEFT at [−32, −22] on a 4-unit disc by the NW inlet, the widest flat ground that quadrant holds — which is why the bigger ball needed the other side.) The ground wears a worn patch (`Terrain.texture`, radius 9) and the island keeps its scatter out (`PITCH.clearing` 12.5). **`check-pitch` is the eleventh suite**: the patch dry and flat at three radii, clear of the roads, each district's clearing and the shore, top-right on the map, the ball car-sized, through the mouth, the car under the bar, the cords denser than the ball — the site guard made to fail twice (into the inlet: 35 wet / 36 unflat; the old top-left site: wet at r9, on the road, in the contact clearing, wrong quadrant). Verified on the build: a boosted run from the middle put the ball through the mouth (z −31 → −38.6, past the line at −36.8) with a peak of 2.9 up on the way, the car nosing into the net behind it. Not built: a score, a reset for a ball that leaves the island (R respawns the car, not the ball), a second goal. Previous entry: **The water is painted now, procedurally — 3 Sep, late, on Michael's read** ("take a look at the bodies of water [the reference] generated, it looks much less artificial compared to ours for some reason"). Measured off the reference's terrain PNG before anything was built: the reference's bodies are hand-painted — they bulge and pinch along their length, split and rejoin, carry edge detail at two scales, and the grass is mottled right up to the water — while ours were nine polylines carved with one cross-section: every river a tube of one width with parallel banks and one even sand ring. The colour and the ripples were already the reference's; the tube was the tell. Three terms in `Terrain.js` put the brush back, all sines like `relief01` so the physics reads the same function as the render: **`bankWarp`** (every channel and the coast measured from a point offset by a two-octave noise, ±1.6 at ~33 units and ±0.5 at ~12 — meanders and lobes), **`widthFactor`** (each channel's half-width swells and narrows 0.75 → 1.2 along its run, with the depth following the width so the bank gradient stays at `BANK_GRADIENT` in a pinch as in a bulge — a pinch is shallower, never steeper), **`edgeWobble`** (±0.35 on the bank distance at ~5 units), and in the cover channel a ±0.11 wander of the beach ramp's start at ~7 units so grass reaches the bank in patches. The sweeps did their job twice: the first cut's 0.7 → 1.3 bulge and then the warp itself put the west inlet on the career corridor's road at [−43, 4] (`check-career`, 4 units/yr), so the bulge came in to 0.75 → 1.2 and the inlet moved two units north; then ten suites green. Judged on the fast-travel map (the whole network at once: varied widths, lobed inlets, a wobbled coast) and the trunk river at spawn; Michael's verdict: "the shapes are much better now but the transition between water and land is just a white slosh, how did he do it?" — **measured**: the reference's shore band is `step(b, 0.17)`, solid white from the waterline to 0.2 units deep with a hard edge, and it reads as foam because the reference's dirt is a saturated orange (`#ffa94e`, the gradient's first stop, the land colour too); ours was the palette's pale sand on the bank, a white band to 0.34 deep with soft fades both sides, plus the waterline line — three pale things stacked into one halo. Now: the bank darkens to **wet sand** over the last 0.25 of height above the water (sand → dirt/wood mix, `makeTerrainAlbedo`) and the shallows start from the same tone; the bare beach ramp narrowed (0.26 → 0.18 of height, so the grass reaches closer); the band is **0.05 → 0.13 deep with crisp edges** — 0.2 was tried first and still read a unit wide, because our smoothstep bank profile flattens toward the waterline so a depth range spans more ground than on the reference's steeper banks. Verified beside the pond north of the plaza: wet-sand bank, a thin foam line, tan shallows, teal. **Then his screenshot of a ford** ("extra white lines / blobs in addition to the waves"): two things, both the flat-bank story again. The jagged bright line along the shore was the terrain material's own waterline band — every fragment within `surfaceThickness` of the water's height, interpolated across the height field's 1.5-unit triangles, so on a flat bank it zigzags along the mesh; the terrain material no longer carries it (the water plane's shore band draws the foam from the smooth depth texture; props in water keep theirs). The pale blob mid-pond was a contour FILL: the reference's mask is `ripples ≤ −0.4`, everything below the edge, which in shallow water is most of the cycle — a sliver against the reference's steep shore band, a patch on ours. The first fix gated the ripples deeper and took the waves with it (*"revert the white blobs change because now our waves are kind of gone"*); the second makes **each contour a line** — the band −0.52 ≤ ripples < −0.4, the reference's edge with a fixed thickness behind it, at every depth — with the ripples fading in from 0.14 to 0.3 of depth as before. Verified at the spawn ford and the pond: thin contours hugging every bank, no fills, no zigzag. **And then the shore band went entirely** (his third screenshot: "one thick white line around most bodies of water, its separate from the moving white lines which work great" — at 0.13; a hairline at 0.09 was offered and he asked to remove it): the reference's `step(b, 0.17)` is foam on the reference's steep banks and a border on our flat ones, and the edge of the water is the colour change from wet sand to the shallows now, with the contours as the only white. The amplitudes are ours. Previous entry: **The repo names its reference only in `CREDITS.md` — 3 Sep, late, on Michael's call** ("on github, i dont want to have any mention of [the author] other than credits.md"). Every tracked text file now says *the reference*, *the reference build*, *the reference author* or *the reference's* where it named or pronouned the author (102 name and ~2,000 pronoun replacements by script, pronouns only outside Michael's quoted speech and never within a hundred characters of his name, then 29 by hand where the script had taken one of Michael's own); `research/` (the teardown notes) and `reference/README.md` are untracked and gitignored; the local clone is reached through a `reference/source` junction so its folder name leaves the tree; `CREDITS.md` carries the reference build's name, repository, MIT notice and the list of what was ported — which the licence requires anyway; `check-site` fails on the name in any tracked file (made to fail once); and the history was squashed to one commit and force-pushed, since the old messages and file versions carried the same words. The record culture is unchanged: every measurement against the reference stands, it just calls it the reference. Previous entry: **Live, and the first notes from the live site — 3 Sep, late: michaelyeh.dev is up, and Michael's first drive on it sent back five things.** The deploy itself: the repo went to GitHub (`MichaelYeh507/gamified-portfolio`), Cloudflare created a **Worker** with static assets rather than a Pages project (its default now), the first deploy failed on the Pages-flavoured `wrangler.toml` and the `[assets]`-only config fixed it, the domain came from Cloudflare Registrar the same night, and `SITE_URL` is committed. Measured live: immutable on hashed and versioned files, revalidate on HTML, Brotli (on-the-fly, so the chunk travels at 1.35 MB rather than 1.06), `application/wasm`, the security headers. The reference's phone: *"takes much much longer to load up, but its fine for now"* — the 1.35 MB chunk plus wasm compile on a mobile GPU; the Rapier lever (`KNOWN-ISSUES.md` 25) is the answer when it matters. **The reference's five notes, all landed and verified on the build:** (1) *"make the fences in my career section not movable"* — `props.js` grew `standFixedProp` (the same bounds-derived cuboid as a fixed body); the corridor's three panels are walls now, measured: three fixed bodies, zero dynamic, a 50-unit impulse moves none. (2) *"the text for each career item bigger, its kind of hard to read"* — the rows were budget-limited before they were size-limited: a full slab was already scaled to ~0.8 of its asked sizes inside `CARD.length` 2.1, so the card grew to **2.7**, the type to 0.58/0.4/0.3/0.32 (from 0.5/0.3/0.22/0.26), and `QUEUE_SEP` to **4.0** — 4.2 was tried first and `check-career` refused it (the counter's derived parking spot ran onto unflat ground at `#yearunit=1`). (3) *"the two street lamps in the projects section are not glowing"* — **a real bug, and older than the deploy**: in `makeContentMaterial` the amber-band emissive term was gated on `albedo === null`, and inside the shader Fn `albedo` is the fragment's colour var, not the parameter — never null, so since the texture session on 2 Sep **no lamp, lens, flame or glow-cap in any material had lit up**, hidden because the in-world type glows through its own material. Found by reading the compiled WGSL for a lamp (`renderer.debug.getShaderAsync`: the headlight cone was there, the band test was not). The decision is hoisted out of the Fn; the lamps, the flower hearts and the tail lights bloom at night again. (4) *"i want the car to flip back on his feet faster"* — `FLIP.waitSeconds` 3 → 1.1 → **1.5** (the reference's second note the same night: "make the grace before hop 1.5 seconds"), `retrySeconds` 1.5 → 0.8 (ours, not the reference's 3 s grace): inverted → upright in **1.47 s** measured at the 1.1 wait, from ~4. **And in deep water** (*"the car isn't able to flip back to its feet in deep water"*): at full depth the body's damping is 1.0/s and the inverted torque's 4 rad/s decayed to ~2.8 rad of roll inside the hop — short of π, so it flopped back every retry. The hop and the torque now scale with wetness (`FLIP.wetTorqueBoost` 0.35, `wetForceBoost` 0.2) — the first cut at ×2.4 threw the car 2.5 units clear of the sea and rolled it a full turn back onto its roof, measured passing through upright twice — and at a third more torque an inverted car on the sea floor (depth 1.2) is upright in **1.85 s** and stays; at depth 0.6 it takes a second hop (3.7 s). (6) *"the 'rain hitting water' pattern near the deep ocean is still very structurally patterned"* — the reference's fifth look at the splashes, then a sixth ("the river to the left of the spawn has good rain ripple effect, make all bodies similar"), a seventh ("no its bad now, the body below the career area is good"), and then the call that ended it: *"take a look at how he does the ripple / rain, cus we've been on this for a while now and its not really working."* **The splashes are HIS now, line for line** (`WaterSurface.js:158-211`, `Noises.js:22-71`): a voronoi texture generated at boot (the reference's `voronoiNode`, eight cells per tile, `r` distance to the cell point / `g` gap to the next cell / `b` a per-cell random — `Noises.voronoi`, the second noise we generate), sampled at 0.33 per world unit so **a cell is ~0.4 units across — a third of ours** — with a ring expanding from every cell's point once per cycle on the wind clock × 6, thinned by `g` toward the cell edge, phased by `b` plus a drifting perlin, and visible per cell against **`rain²`** (nearly every cell at a downpour, ~40 % at a shower's 0.64 peak). Why a day of tuning our own never worked, recorded rather than smoothed over: every version of ours — jittered hashed cells ~1.2 units across, one ring per cycle, then sparser, re-rolled, distance-faded, patched, sea-gated — was a field of separate half-unit rings, and separate rings are dots however they are timed; the reference's are three times smaller, all ringing, fast, and the eye reads the shimmer, not the circles. Ours on top of the reference's, still: the depth gate (fords keep their sand) and the open-sea gate (the reference's world has no sea). Verified at `#rain=0.9` on the trunk river beside the spawn, console clean; the reference's call by driving. (5) *"make the map button and controls (instead of ?) more visible"* — both are `.ui-button` pills now, bottom-right, ink-on-void with an amber border and the key chip ("MAP M", "CONTROLS H"), where they were muted grey. **And one thing the session lost an hour to, recorded so the next one does not: the dev server was running two threes.** Vite's dependency optimizer crawls every HTML file under the root, which includes `reference/source/` — the reference author's clone with its own `node_modules` and three **r183** — and after today's `vite.config.js` appeared it re-optimised and prebundled `three/webgpu` from the reference's tree against our r185 core: 899 "THREE.TSL: No stack defined" errors, a world with no night and no fog, `window.__THREE__ === "183"`. `optimizeDeps.entries` did not stop the crawl in Vite 8.2; **discovery is off** (`noDiscovery: true`, every dep is ESM and serves unbundled) and `resolve.dedupe: ['three']` pins the copy; `check-site` guards both. The production build never had the problem (rolldown bundles from `index.html`; the live bundle is r185). Also noted by the reference author for later: *"we need to improve the art / map a bit more later to make it look better and like it has more content"* — the art pass, after touch steering and bridges. Previous entry: **Deploy, part one — 3 Sep: the build ships clean, the site has a real head and fallback, the host is chosen and configured; live the moment Michael does his side.** Phase 6's checklist run in his order, every item on the real `npm run build` + `vite preview`. **(1) The build audit** found the two things the phase exists for. `dist` was 6.3 MB, and 1.3 MB of it was **three Draco decoders nobody fetched**: three's `DRACOLoader.js` names five decoder files with `new URL(..., import.meta.url)`, Vite emits all five hashed into `assets/`, and `ResourcesLoader` pointed at a *sixth* copy in `public/draco/` — so the build shipped the decoder three times over. Now the loader uses three's own glTF pair (`DRACO_GLTF_CONFIG`: 192 KB wasm + 58 KB wrapper, content-hashed, so it rides the immutable cache rule), `public/draco/` is deleted, and `prune-dist` byte-compares every `assets/draco_*` against three's `libs/draco/gltf/` files and drops the three strays (the 286 KB generic wasm, its wrapper, the 719 KB JS-only decoder). The deprecated `setDecoderConfig` call went with it (it warned in the production console). **dist ships 57 files, 4.85 MB: 3.9 MB is the one JS chunk** (1.43 MB gzip, 1.06 MB Brotli), of which ~2.9 MB is `rapier3d-compat` carrying the 2.0 MB physics wasm as **base64 in the JS** — measured: the wasm alone is 558 KB Brotli against ~800 KB for its base64 form — so the next payload lever is the non-compat `@dimforge/rapier3d` behind a wasm plugin (~250 KB off the wire, and the 2.9 MB string out of the parse path), deferred: a physics-packaging change is not a deploy-day change (`KNOWN-ISSUES.md` 25). Nothing else leaked: no raw GLB, no dev texture, no `research/`, no `reference/`, no sourcemap, no `palette.*`, no ruler. **(2) The fallback and the head are data now.** `index.html` carries two markers, `<!--#meta-->` and `<!--#fallback-->`, and `vite.config.js` renders both from `src/content/` through `tools/lib/site-html.mjs` at build *and* in dev: the title (*Michael Yeh · drive around my work*), a 133-character description, `theme-color`, an SVG favicon (the car in amber on the void, `public/favicon.svg`, swappable), Open Graph + Twitter card tags, a schema.org Person record pointing at the GitHub and LinkedIn profiles, and a `<main id="fallback">` listing every project (title, year, blurb, first link), every dated role split into Work and Education with spans derived by `roles.js`'s own date rules (`null` = "to now", `''` = start only), and every contact link — escaped, no em-dashes, revealed on a boot failure and always there for a crawler. **The social preview image is a frame of the build**: `public/og.jpg`, 1200 × 630, the opening frame at noon (letters, car, signpost, the trunk river), 74 KB. **The absolute OG URLs wait on the domain**: `SITE_URL` (environment or `.env.production`) is the origin; unset, `canonical`/`og:url`/`og:image` are omitted and `prune-dist` says so at every build — set it and they appear. **(3) The host is Cloudflare Pages**, for the three things the ask named and GitHub Pages cannot do any of: Brotli on everything, a `_headers` file for `Cache-Control`, a custom domain with free TLS on a free tier with unmetered bandwidth for a static site (Netlify does all three too, but its free bandwidth is metered at 100 GB and a 1 MB-per-visit site spends it). In the repo: `public/_headers` (immutable for a year on `/assets/*`, `/models/*`, `/fonts/*`, `/projects/*`; `must-revalidate` on `/` and `/index.html`; nosniff, referrer and permissions policies everywhere), `wrangler.toml` (`pages_build_output_dir = "dist"`, so `npx wrangler pages deploy dist` works without a Git connection), `.node-version` (22, Vite 8's floor is 20.19/22.12), `public/robots.txt`. **(4) Cache headers needed the statics to be addressable first**: Vite hashes what it bundles and copies `public/` bare, so an immutable rule on `/models/*` would have served last month's car after a re-prep. `tools/lib/static-versions.mjs` hashes every file under `public/models|fonts|projects` at build into `__STATIC_VERSIONS__`, and `src/core/staticUrl.js` appends `?v=<8 hex>` — the URL changes exactly when the bytes do. Every fetch goes through it (`modelUrl`, the letter font, the project images); `check-site` fails on a bare `/models/`, `/fonts/` or `/projects/` literal anywhere else in `src/`. MIME for `.wasm` and `.glb` turned out moot: Draco fetches its wasm as an `arraybuffer` and instantiates from bytes, Rapier's wasm is inlined, and GLTFLoader reads bytes — nothing uses `instantiateStreaming`, so no server can break it (Cloudflare serves `application/wasm` regardless). **(5) The preview run, production build in Chrome, WebGPU**: boot (49 fetches, only the hashed Draco pair, 39 `-compressed` models all `?v=`, zero raw), the intro, a 26-unit drive, the Aerial Ascent card with both versioned screenshots, the map with its four pins, the controls sheet (launch and modal), noon and `#day=0.45` night at the contact fire; console clean but for the contact arc's build line. **`check-site` is the tenth suite**: the fallback against the content, the role spans, the head with and without `SITE_URL`, the markers, the versions (88 files), the bare-URL sweep, and `_headers` parsed rule by rule (every hashed/versioned directory immutable, nothing else immutable, HTML revalidating) — three guards made to fail once, one of them by accident: the placeholder guard fired on an HTML comment that *quoted* the old placeholder, which is the guard working. **What Michael does** is in the session report and the handoff: the Cloudflare account, the Pages project on the repo, the domain, `SITE_URL`. **What the touch path lacks, measured before the phone pass**: everything — `Input.js` reads keys only, there is no drag or joystick, and the touch copy promised "drag to steer"; the copy is honest now ("best driven with a keyboard, for now") and touch steering is `KNOWN-ISSUES.md` 24, the first item after the deploy is live. Two traps for the record: **a PowerShell `Get-Content -Raw` → `Set-Content` round-trip double-encodes a UTF-8 source file** (every em-dash in `Game.js` became `â€”`; restored from git, the guard-flipping is done with node or the Edit tool from now on), and **a WebGPU canvas reads back stale through `drawImage`/`toDataURL` after present** — the og image came from the screenshot tool's `save_to_disk` through sharp instead. Previous entry: **Two tunes from Michael's drive — 2 Sep, late: the letters' wedge and the signs' size.** *"The car sometimes gets stuck in my names letters during collision"*: the wedge is a letter under the chassis — at the reference's 0.65-of-height depth ratio a toppled letter stood 0.75 tall against the car's 0.48 underside, and at friction 0.7 it gripped, so the car sat on it. Letters are **0.5 deep and 0.1 friction** now (`LandingArea.LETTER`): a fallen one is under the underside, and one that gets under squirts out under throttle. Measured on the build, a fresh line each time: a boosted plow at 6 m/s clean through; a slow start from 2.2 units, a second slow start, and a reverse into the line — all through, upright, never flagged stuck (the one "stuck" reading of the session was the car nosing into the contact pedestal forty units past the letters). *"The direction signs are a little too small, make the caption and model / arrows a bit bigger"*: the marker stone, the rows and the arrows all grew by about a third together (`Wayfinding.MARKER/CARD/ROW/ARROW`: post 0.3 → 0.38 wide, 0.85 → 1.1 tall; card 2.6 → 3.4 wide; type 0.34 → 0.45; arrow 0.46 → 0.62 long), and `check-wayfinding` re-proved every post clear of its road, the decals, the plaza floor, the arc and the cart. Previous entry: **The fast-travel map — 2 Sep, late: the deferred wayfinding item, its gate passed.** The reference's `Map.js` + map modal, measured: a modal over a painted top-down image (`map-day.webp` / `map-night.webp`), a pin per respawn at `world / terrain.size + 0.5`, a heading-rotated player marker moved on the tick while open, click a pin to respawn there, `M` to toggle. Ours (`core/FastTravel.js`, `#map` in index.html) keeps the shape with three differences. **The image is drawn from the island's own data**: the terrain texture's height, cover and paving channels are painted texel by texel into a canvas at first open with the palette's colours (deep → shallow by depth, sand → grass by cover, paving over both), so a road that moves or a district that grows repaints its own map. **The map is turned to the screen**: the camera is fixed at 45°, so a world-aligned map reads rotated against what the visitor sees; ours puts up-screen at the top (`worldToMap`: right = (x − z)/√2, down = (x + z)/√2), so "projects is down" on the map is "projects ↓" on the signpost. **And it is centred and paused, like the reference's** — with one reversal for the record: Michael's *"maybe have it pop up top right instead of blocking everything"* was about the launch INSTRUCTIONS, and the map lived as a top-right corner panel for a few minutes on a misread before the reference author set it straight (*"i want the users to feel like they can click on the map and teleport, so that should be centered and opened"*). So the controls' launch sheet moved to the top-right corner, non-blocking, and the map stands in the middle over a scrim with the car paused through `setMode('card')`, `M`, Escape, its button beside the `?` or the ✕ closing it. Pins are real buttons, one per district with a spawn (Start, Projects, Career, Contact), and a pin travels through `Areas.goTo` under the veil — the stuck recovery's cover, so a jump is a blink. Verified on the build: `M` up, four pins where the maths puts them, the Career pin landing the car on the corridor at its spawn, the marker tracking a drive with the map open. Previous entry: **The controls sheet — 2 Sep, late, on Michael's call in place of the toasts** (*"at the start of the game / launch, we can add instructions text, similar to the 'get stuck?' text that disappears, also allow them to open controls menu later if they wish"*). The reference's equivalent is the Mouse/Keyboard tab of the reference's menu (`index.html:343-398`, twelve rows behind a menu button); ours is **one panel with two lives** (`core/Controls.js`, `#controls` in index.html): at **launch** it stands where the one-line hint stood — the moment the car becomes drivable, mid-cinematic, for the hint's reason — as a non-blocking sheet listing the seven verbs (drive, boost, jump, handbrake, interact, back on the road, these controls), fading after 9 s exactly as the stuck hint fades, with "press H any time to see these again"; and **as a menu** behind `H` or the new `?` button bottom-right, centred over a scrim with the car paused through `setMode('card')` — the same one string that pauses it for a project card, so the `close` action (Escape) is live for free and `H` toggles it shut. `H` is a new action in `driving` and `card` categories, ignored over an open project card (the card owns that mode). `#hint` lives on for the stuck offer; the one-line launch hint is gone from `main.js`. Touch devices get the title with "drag to steer" and no key table. Verified on the build: sheet at launch, `H` → modal with the car paused, Escape → driving. Previous entry: **Rain — 2 Sep, late, the fifth item of the alive list, and the first built under the new rule** (*Michael: "from now on you dont have to copy his like to the exact, we can tune it ourselves"* — so: the reference's mechanisms read first, our numbers, and the record says which is which). Three pieces. **The weather** (`cycles/Weather.js`, ours, shaped like the reference's): the reference's derives seven properties from the year cycle and a product-of-sines noise over the day clock with rain = humidity × clouds; ours keeps the one the world has consumers for — **rain, 0 → 1, from the season's humidity gated by a shower noise on the wall clock** (the reference's three-sine noise, our cadence: a shower every four to six minutes, ~90 s long), `#rain=0.8` pinning it for judging. **The streaks** (`world/RainLines.js`, the reference's construction): one static mesh of quads over a unit square, each stretched in the vertex stage into a falling line — the square scaled and wrapped around a window, every streak on its own phase of a scrolling clock, a share hidden 99 units up wherever a hashed random sits over the visible ratio (the reference's `rain²`), so density follows the weather with nothing rebuilt; length 1 → 3 and speed 0.2 → 0.4 with the rain (the reference's), the incline along the actual wind (ours), a near-white dimmed by the day's light (ours). Tuned on the first look: the window is pushed **9 units up-screen of the focus** — centred on the focus, the streaks between the eye and the ground magnified into fat white bars — and the thickness went 0.018 → 0.011 at opacity 0.42. **The splashes** (`makeWaterMaterial`, the reference's `splashesNode` in shape): the reference's rings grow out of a voronoi's cells and we ship one noise, so the cells are hashed on the fly — ~0.7-unit cells with jittered centres, each on its own phase, a ring expanding to a third of the cell and fading, only where the cell's hash sits under 0.55 × rain (the first cut's 1.2-unit cells all ringing at once read as a printed pattern). **Michael's second look: "so even, it doesn't seem natural"** — one ring per cell per cycle at one spot and size is a lattice however the cells are jittered, so now each cell's clock runs at its own rate and **every cycle re-rolls** whether it fires, where the drop lands and how big the ring grows, with a second layer at an unrelated scale and offset on top; no two rings share a period. **Third look, the real note: "it kind of creates a trypophobia effect... how the dots are spaced out, very structurally even"** — the grid still showed because nearly half the cells rang at once, whatever their timing. Sparse now: about one cell in eight alive at full rain, cells ~1.2 units with the drop landing anywhere in them, rings growing to a random quarter-to-half of the cell and gone by 70 % of their cycle — at any instant a scatter of a few soft rings of different sizes, judged from Michael's own drive frame on the trunk river. **Fourth look: "fixed for some bodies of water but some are not, for example the ocean"** — a body filling half the frame at a grazing angle shows hundreds of rings at once, and hundreds of anything on a lattice reads as rows. Two gates: the splashes fade with distance from the eye (34 → 48 units; only the water near the car needs them) and a slow drifting perlin patches the density across the surface so no large area is uniform. Verified parked on the western shelf: a few rings near the car, the far sea clean. (The launch controls sheet lost its dark panel the same minute: type straight over the world with a shadow; and "too much rain" halved the streaks and thinned the showers to ~20 % of the clock, peak 0.64.) **And rain darkens the day**: the light's intensity × (1 − 0.3 × rain) after the cycle writes it, ours (the reference's clouds live in the reference's sky). Verified: at `#rain=0.9` in daylight, thin grey streaks leaning with the wind over the contact hangout; at the spawn, rings on the trunk river. Not built: snow, ice, lightning (their consumers do not exist), the reference's rain achievement. Previous entry: **The wind made visible — 2 Sep, late, the fourth item of the alive list.** The reference's `World/WindLines.js` + `Geometries/WindLineGeometry.js`, ported near-whole (`world/WindLines.js`): a pool of four ribbons, each a Catmull-Rom through four handles zig-zagging ±0.5 over a 10-unit run, built as the reference's two-vertices-per-point strip with a `ratio` attribute; the vertex stage gives the strip its 0.1 width — fat mid-run, pinched at the ends — and a **bump of width that travels down the line** as a progress uniform runs 0 → 1 (the reference's `progress × 3 − 1`, so the bump enters one end and leaves the other). Every 0.3–2 s a free line stands 2 units up at a random spot within ±15 of the focus, turned to the wind's angle, and slides one unit downwind over four seconds while its bump runs; white, unlit, unfogged — a streak, not a surface. Two deliberate differences: the reference's ribbon widens along a fixed world tangent `(0, 1, −1)` that happens to face the reference's camera, ours widens perpendicular to the line and the eye (a billboard at any wind angle under the fixed rig); and the cadence rides the ticker's clock instead of `setTimeout`, so a hidden or hand-pumped tab keeps it. Verified on the build: two streaks crossing the trunk river at the spawn, the reference's read. Not ported: the reference's duration by weather (8 s calm → 2 s storm; ours is a constant 4 until weather exists). Previous entry: **Leaves on the wind — 2 Sep, late, the third item of the alive list.** The reference's `World/Leaves.js` is a GPU compute simulation: 128–2048 leaves (by the year cycle's `leaves` value) as instanced quads, each pushed by the car, blown by a perlin gust against the wind's strength, lifted by its own horizontal speed, damped 1.5 on land and 0.75 on water, pulled down by gravity × weight, clamped to the ground or the water surface, and wrapped around the focus. Ported split at the backend: **the simulation is the reference's compute shader as a pure CPU step** (`world/leavesSim.js`, the reference's numbers verbatim, integrated on the reference's doubled clock — and one measured fact that changes the port: the reference's `physicalVehicle.velocity` is a **per-frame displacement**, not m/s, `PhysicsVehicle.js:519`, which is why the reference's push multipliers are 100 and 20), because the reference's `instancedArray` + `.compute()` path needs a compute backend and this site ships a WebGL2 fallback; 1024 leaves through the loop cost ~0.5 ms with two height-field reads a leaf, collapsed to one. **The draw is the reference's** (`world/Leaves.js`): the reference's leaf shape (a unit plane, top corners +0.15, bottom −0.15, laid flat), 0.25 × a per-leaf 0.5–1, tumbled by `sin(position × 3)` while airborne, spun by a base angle, shaded by the reference's random per-leaf normal — with positions arriving as a 1024 × 1 float texture uploaded every frame (the trails' and the tracks' road) instead of an instanced storage attribute. Colours: the reference's two browns become the palette's wood and wood-dark. **Michael's first look, minutes later: "i think theres too much leaves"** — measured, he was right by a factor of eight: the reference's count is seasonal (128 → 2048 over a ~60-unit window, 0.07/m² mid-season, 0.57 at peak) and the first cut's 1024 over our 44-unit window was the reference's peak-autumn carpet all year; **256 is the reference's mid-season density on our window**, and the accent-warm third that read as confetti under the sunset light went with it. **`check-leaves` is the ninth suite** — the pure step proven headlessly: no leaf under its floor, floating on water, the window following the focus, a parked car pushing nothing, a moving car pushing every leaf ahead of it and lifting most, kicked leaves settling in ten seconds, a wind carrying them downwind — floor and push guards made to fail once. Verified on the build: a carpet across the grass, leaves floating on the pond, a boost run flicking them a unit into the air. Not ported: the reference's explosion and tornado terms (nothing explodes here yet), and the seasonal count (1024 flat until the year cycle has a consumer). Previous entry: **The plaza greets you — 2 Sep, late, the second item of the alive list ("my project area seems kind of dead right now too").** Measured first: the reference's projects area's life outside the carousel is **ambient loops on authored props** — a Newton's-cradle pendulum, a blackboard that hops (`ProjectsArea.js:1113-1132`: gsap `y: 0.25, power2.out, 0.7 s`, repeating while the area is open), an oven whose charcoal breathes, an anvil with a glowing blade, a grinder — none of which exist as assets for us, but the blackboard's hop is a reaction pattern that ports. What landed, four things: **(1) the boards greet you** — one group per monolith now (the merged-across-monoliths build was premised on "nothing here moves"), and `update()` gives each board the reference's blackboard hop once per approach (0.25 up over 0.3 s, down over 0.4; re-armed 3 units outside its 8-unit circle; measured 0 → 0.250 → 0 across 0.7 s), with its **title writing itself on** through the corridor's `wipe` material with that first hop — one-way, it stays. The file's old "no `update()`, deliberately" argument was about a per-monolith glow material; a pose costs the palette rule nothing, and the reversal is recorded in the file. **(2) A crate stack beside every board** — three of the reference's mass-0.1 bodies, two down one up, screen-right of each board at 3.2 from its centre, so every project has something to hit (`props.js` grew `lift` for the stacking and `propSize`); **(3) the rim dressed** — a haystack and two barrels outside the lamps, camera-side, off the road's arrival (it comes in behind the boards) and off every spot a fourth or fifth board would take; 'crate' and 'haystack' joined the dressing files, prepped and credited since 31 Aug and unused until now. **(4) The reference's confetti** (`render/Confetti.js`): 500 planes thrown up and out from a point over five seconds — the reference's positionNode line for line (slice-of-progress per particle, grow-in/out, `strength` from the fractional random), minus GSAP (our tween) and minus instancing (the orientation baked into one merged geometry, the two randoms as vertex attributes — the grass field's proven pattern); colours are the two accents and amber painted per quad through the palette UVs, so a third of every burst glows at night. Popped at a board's feet when its card opens. Verified on the build: crate stacks and rim props standing asleep, the middle board hopping on arrival with its title written, the burst over the board on open, eight suites green. **One thing to judge**: titles are blank until a board has greeted you once (the corridor's rule) — from the plaza's edge two of three boards read as blank plates; if that reads as broken rather than as a reveal, the wipe's start value is one number. Previous entry: **The dressing reacts — 2 Sep, late, the first item of the "make the map feel alive" list** (*Michael: "what are the other ways for us to make the map feel more alive, also my project area seems kind of dead right now too"* — the list ranked from the reference's `World/` folder: reacting props, leaves, wind lines, weather, toasts, spectacle, audio; for the plaza: the corridor's board motion, rim dressing, something to hit per project, confetti, a tighter arc; the reference author took the order, reacting props first). Measured before built: **every piece of set dressing in the reference's world is a dynamic body born asleep** — `Benches.js`, `Fences.js`, `Bricks.js` run one description, `type: 'dynamic'`, **mass 0.1** against the reference's 2.5 chassis (ours is 2.5 too, so the reference's number ports untouched), friction 0.7, `sleeping: true`, colliders off the model. Ours placed the same medieval props as **visuals with no body** — the car drove through the fence, the cart, the barrels and the log seats. `world/props.js` → `standDynamicProp` is the reference's description with the cuboid derived from the prop's own bounds (the prep tool grounds models at their base, so the box sits above the origin and the body's origin stays on the ground), through the `objects.add` road the letters and the icons already ride. The corridor's **fence (every panel its own body), cart and two barrels** and the contact arc's **two log seats** are knockable now; the streetlights stay fixed (their GLB carries the collider), the bonfire stays put. Verified on the build: a run at the corridor fence toppled six panels (0.2–1.1 units of scatter), the car through and clear, eight suites green. **Then Michael drove it and the fence was already down** ("the fences fell over by itself... it was already knocked over"). Measured with the car parked 160 units away: every panel toppled within 300 ticks of the area building, and asleep — so not woken by anything, born falling. A body parked in mid-air stayed asleep (born-asleep works), and the prop bounds told the story: **the fence panel is 4.48 long and the plan stood one every 2.1** — as visuals the overlap was invisible (the comment even says "a fence post through both"), as bodies each panel was born inside its neighbours and the solver shoved the row apart. `FENCE_STEP` is a panel length (4.55) now, the fence stops short of the second barrel, the cart parks parallel to the lane at side 3.4 (its old +0.35 tilt swung a corner into the fence line) and both barrels sit at 4.3; at rest all eight bodies measure upright, asleep, unmoved. `check-career` grew a **dressing-as-bodies** family — panel length against step (made to fail at 2.1), cart and barrels clear of the fence line, the fence ending before the barrel, at both scales — with the GLB extents embedded as the regression anchor. Not ported: the reference's `waterGravityMultiplier: −1` (the reference's props float; ours sink to the new sea floor) — on the books if a barrel in the river reads wrong. **Next in the list, in order: the plaza** (the career slabs' rise-and-wipe on the project boards, rim dressing inside the keep-out, a crate stack per board to hit, confetti on a card, and the arc step tightened for three projects), then leaves, wind lines, rain. Previous entry: **The surface survived its first drive with five fixes — 2 Sep, evening, Michael's list taken first and worked in his order** (*"the deep water has flashing white waves on the entire thing... the grass is pretty good we can try to add where if the car goes over the grass it gets trampled... the current state of the 'roads' is not very good... the letters for my name is too heavy, should be much lighter when hit... the arrow glyph taste is a little blunt / blend, take a look at what he does"*). The session opened by taking the list, as the handoff prescribed, and Michael drove the verification tab himself for the whole session — every fix below was judged from a frame of HIS drive (the car moved between two probes forty units apart, the recorded hands-off signal, and it stayed that way). **(1) The white sea was an orientation bug in the ripple port**: the reference's `terrainData.b` runs **0 at the shoreline → 1 at the floor** (the reference's gradient is sampled at `1 − b`, orange at 0, navy at 1), and the reference's ripple formula subtracts `1.3 − 1.3b`, which thins the contours out toward the DEEP; our port had normalised floor → waterline, the reverse, so every contour that belongs on the reference's shallows scrolled across our open sea. `b` is now `depth / (surface − floor)`, and the ripples fade in as the shore band fades out (0.18 → 0.34 of depth) so a ford (≤ 0.06) keeps its sand instead of inheriting the densest band of the formula. Verified from Michael's boost off the western shelf: navy sea, contours only along the bank. **(2) His `Tracks.js` ported whole** (`world/Tracks.js`): a 40-unit orthographic window around the car rendered into a 512² target, four wheel ribbons (the reference's 0.5 thickness, 128 samples at ≥ 0.2 units / ≤ 30 Hz, the reference's fade-in/fade-out/contact/edge alpha line for line) fed from the suspension rays' contact points (`Car.wheelGround`, the reference's `contactPoint`/`inContact` pair), the target rendered at `TICK.RENDER − 1` (the reference's tick 9 before terrain's 10) and once before warm-up so no material compiles against an unrendered texture. The cover channel is multiplied by `1 − tracks.r` in `makeTerrainAlbedo` (the reference's line) and the blade density by a sharpened `smoothstep(0.15, 0.5)` of it in `Grass.js`, so the blades drop out and the sand shows in two ruts that fade ~25 units back. The window's Z orientation was the one unknown (the reference's UV mapping and a top-down camera's image disagree on paper) — verified on the build: the ruts trail the car, not its mirror. Michael's donuts on the plaza lawn left a spiral. His chassis ribbon (1.5, green) only feeds his snow and is not ported. **(3) The roads were bare sand and read as a smear; the reference's are PAVED.** Measured again, deeper: the reference's terrain PNG's red channel is a SLAB mask — `Floor.js:47-65` tiles `static/floor/slabs.png` (an 8×8 grid of rounded flagstones in greys) at 0.175/unit, colours it `#a87762 → #ffcf8b` by its grey, and mixes it into the ground by `slab × perlin(0.03)` so the paving is worn through in patches. Ours: the terrain texture's spare **alpha channel is the paving mask** (the routes and the corridor's avenue, dry land only — a ford's slabs stop at the waterline), `render/slabs.js` draws the reference's texture on a canvas at boot (the reference's grid, seeded, mortar/stone/crack values), and `makeTerrainAlbedo` mixes dirt → building-light by the stone's grey under a `smoothstep(0.25, 0.75)` of the perlin. The bare-cover shoulder went from a 2.2-unit feather to **0.9** — the smear was the shoulder, not the road. Michael has offered road/bridge/texture assets; the generated slabs are the measured answer to "what does his actually do", and a found texture is a one-line swap in `slabs.js` if the reference author prefers one. **(4) Letters 2 → 0.6** ("much lighter when hit"): the reference's letters are 80 % of the reference's chassis mass, ours now a quarter — the reference's car is the reference's, ours carries a 40-speed boost. **(5) The arrows are shapes, not glyphs**: `wayfindingPlan.screenBearing` gives each row its exact screen angle, `Wayfinding._arrowGeometry` extrudes one amber arrow (shaft + head, 0.46 long) and each row turns it about the card's local Z — which IS a screen rotation, because the card faces the camera. The eight glyphs survive as each row's `arrow` for the check suite, which now proves the glyph is the quantised form of the bearing (guard made to fail) and that labels are bare names. The reference's build has no directional signs at all, so "what he does" is: everything is an object — the rows' arrows are objects now. Verified from Michael's frame at the plaza post: two turned amber arrows beside "career" and "contact". `npm run check`: eight suites green. **A sixth, from the same drive, minutes later** (*"for the very far water, it becomes like a different shade of water than the deep water, i think it might have became the sky color?"*): exactly right, and a consequence of fix (1)'s premise — the sea's colour is the GROUND's now, and the height field is 150 units wide, so past its edge there was nothing under the transparent water but the void's clear colour. The bedrock (the reference's kinematic follower slab, already the physics out there) grew its visual half: one 400-unit plane at the water floor, snapped on the water's grid, wearing the **terrain's own material** — the terrain texture clamps to its edge texels, which are the floor, so the albedo out there evaluates to the identical navy the outer ring shows, same shading, same fog, no seam (`Bedrock.buildFloor`). Verified with the car parked at x −64 looking out past the −75 edge: one navy to the frame's edge, fog to the sky only at the horizon, which is the fog everything else wears. **Open for Michael's next drive**: the track ruts' strength (bright sand — his construction, his dirt is orange too), the flagstone scale (the reference's 0.71-unit stones at our camera), whether the fords' slabs should run under the water, and the arrow's size beside the type. Previous entry: **The ground learned the reference's colour and grew the reference's grass — 2 Sep, the texture session, on Michael's read of the whole surface gap** (*"his water is see through when the car is in the water, has moving currents. His roads and land actually have gradient and texture that blend in well... his roads and bridges are curved while ours is just a straight line. he has grass we can run through and just feels more alive"*). All four systems measured out of the reference's source before anything was built, and the load-bearing finding is that **the reference's water and the reference's ground are ONE system**: `WaterSurface.js` ships a plane whose **alpha is zero except where details draw** — white ripple contours scrolled by the wind clock, a shore band, rain splashes — and the "water colour" is the reference's TERRAIN painting the ground orange→teal→navy by its height channel (`Terrain.js`: a 3-stop canvas gradient sampled by `terrainData.b`, grass mixed in by `terrainData.g`, **roads simply painted as grass-free strips in the texture** — and the reference's wheel tracks erase the g channel, which is the follow-up on the books). Ours had it backwards — flat ground bands under an opaque colour-carrying plane — which is exactly why the car vanished when wading. What shipped, in the reference's construction on our palette: **(1) the terrain texture grew channels** (R height, G ground-cover, B blade density — `Terrain.texture()`, RGBA float, every strip derived from the modules that own the shapes) and **the terrain carries its own albedo** (`makeTerrainAlbedo`: sand→accentCool→water underwater by depth, sand under two-tone perlin-mixed grass above, shared verbatim by every grass blade); **(2) the roads are PAINT now** — `Wayfinding._buildRoads` and `CareerArea._buildRoad` are deleted, the cover channel bares feathered strips along every route and the corridor lane, and a ford stays readable because the gradient's shallow stop is sand, exactly as the reference's shallow stop is orange; **(3) the routes are CURVED** — control points through a Catmull-Rom (`sampleSpline`), gentle bows on all three (+1.6/−2.4/−3.5 screen-signed), every consumer (fords, scatter keep-out, paint, checks, posts) walking the same `samples`; **(4) the water is the reference's** — transparent, white detail only: the reference's ripples formula near-verbatim (depth contours + wind localTime + index-hashed perlin, the reference's ratio-1 threshold), a shore band pulled up past the fords' splash depth so crossings get foam edges instead of a white lid, verified with the car parked mid-trunk at 0.62 of depth, wheels in plain sight; **(5) the reference's grass field** — one draw call, 40k single-triangle billboarded blades at the reference's blades-per-metre (0.1 × 0.6, height randomness 0.6), the reference's mod-loop wrap around the focus point, the reference's wind line verbatim (`offsetNode(worldPosition.xz).mul(tipness).mul(height).mul(2)`), density from the B channel so nothing grows on roads, through decals, in the arc or through slab lanes, roots seated on the real height field. Measured: 0.42 ms per pumped tick, 234 draws, ~227k triangles. **Two traps for the record, both found by dumping the compiled WGSL (`renderer.debug.getShaderAsync` — the tool that ended six blind reloads):** TSL's METHOD-form `a.step(b)` compiles to `step(b, a)` — receiver is x, argument is edge, the reverse of the function form — so `density.step(0.15)` buried every healthy blade 100 units under and the bisect chased phantom vertex-stage texture limits for an hour; and the geometry's `position` attribute must exist for the draw count even when a `positionNode` never reads it (the blades read the same buffer as `bladeAnchor`). Deliberately NOT built: the reference's `Tracks.js` grass-flattening wheel trails (render-target erase of the g channel — the "run through" leaves a wake, next session's candidate), bridges (the fords are our crossings until Michael asks), and any re-judging of ripple density, night water brightness or the bow sizes — all his to drive. `check-wayfinding` grew a **painted-roads family** (bare centrelines, grassy open land, blade kills at the decals and the arc, bare deep sea — each made to fail once). Previous entry: **The island learned to point — 2 Sep, wayfinding: three roads, two fords, four signposts, and the bumper.** The promoted priority (a visitor's "what if they can't find the necessary things... by getting lost"), built in the handoff's leverage order, and the ritual ran first: **the reference's `areas.glb` was walked for signage before anything was built, and the only `sign.*` nodes in it are the bowling alley's neon marquee** (`sign.001/002`, emissive radial-gradient materials, parented to `bowling`; `refRoadPhysicalFixed` is the circuit's physics) — the reference's build ships **no directional signposts at all**; the reference's wayfinding is roads baked into the terrain art plus the map button. So the negative measurement joins the no-about-area one, and the signs are ours in the established vocabulary. **The roads**: `wayfindingPlan.js` (pure, the `corridorPlan` pattern) derives three straight routes chaining landing → plaza → contact → career — landing-projects ends under the plaza floor's rim (`plazaFloorRadius`, road at lift 0.045 UNDER the districts' own 0.06 paving so joins overlap instead of z-fight), contact-career tees into the corridor's lead-in at a gate derived from the same `#yearunit=` flag the corridor reads, and `Wayfinding.js` builds them as one merged mesh in the corridor road's construction. The island scatter and flora learned a corridor keep-out, so nothing grows on a road. **The fords are the watch item closing**: Michael's deferred smoothness note ("bumps in rivers for when we boost too fast") and the paving turned out to be one task, as the handoff guessed — where a route crosses a channel, `Terrain.carveAt` eases the carve toward `FORD.carveCap` inside the road's corridor as a smooth minimum (a hard clamp creases the centreline; the crease class `smoothMax` exists for), so the render mesh, the collision heightfield and the water depth agree about every crossing. The numbers are constrained, not chosen: cap **0.32** keeps the splash at ~0.02–0.06 — under `Car.WATER.dragStartDepth` 0.25, so **a boosted crossing measured wetness 0.00 and no vertical kick** (chassis y 0.82→0.85 through the trunk at 13 m/s) — AND lets the road's lift emerge above the −0.3 waterline so the sand stays readable through the crossing; run **4.8** holds the ford edge at 0.26/unit, the trunk bank's own gradient. **One same-hour reversal for the record**: the first cap was 0.45, mechanically perfect and visually wrong — 0.15 of teal drowned the road and the wayfinding line broke at every crossing, caught on the running build. **The signposts**: marker stone + amber night cap + tilted always-emissive amber rows, one row per destination, arrows picked from eight glyphs by **screen** bearing (`arrowFor` — the camera is fixed, decision 16, so a printed arrow can be honest; "career ↖" from spawn is the reference's actual on-screen direction). The spawn post is custom-sited at [−5.5, 1.5] **in the opening frame** — both route-side candidates failed measurement (camera-side sits below the first frame; the contact-side start is on the trunk's carved bank) — and the contact post proved readable from 20 units on the running build. The career post takes the down-screen side (`flip`) because its route meets the corridor almost perpendicular: "beside the road" up-screen is corridor coordinate s −1.75, side 1.07 — the middle of the avenue. **The cart moved** (−4.0, 4.8 → 1.7, 3.7 in corridor coordinates): the contact route's approach fan crosses its old flank 0.17 from the road's centreline, and every down-screen spot on either flank measured carved bank (NW inlet left, the enclosed pond right), so it parks between road edge and fence up the lane. **`check-wayfinding` is the eighth suite**: the arrow bearings, the ford derivations, all three routes swept on the real height field (dry where dry, wet only at crossings, never past the drag-free depth, max step under the bank gradient), every post against the letters/tagline/plaza floor/contact arc/corridor dressing, and the career tee re-derived at `#yearunit=2`; guards made to fail once — the pre-ford world (deepest −1.018 against the −0.32 that ships), the unflipped post, a shrunk run (0.700 against 0.273). **And the bumper landed** — item 3 pulled forward: the reference's oversized mass-0 bumper (`PhysicsVehicle.js:96-98`, main [1.3,0.4,0.85] mass 2.5, bumper [1.5,0.5,0.9] mass 0, +0.1 forward −0.1 down) ported as deltas onto `HALF` in our opposite-handed frame; mass 0 is free here because every chassis collider is density-0 with the whole mass on `setAdditionalMassProperties`. **The letters are back at the reference's mass 2** and the first plow test promptly reproduced Michael's wedge from the other side: a toppled letter slid under the bumper (underside 0.48, fallen letter 0.75), the rear wheels hung, and the bumper's 0.4 friction pinned an all-wheel-drive car at full throttle. The fix is measured and in the file: **the bumper is nearly frictionless (0.05)** — a shoving surface, not a tire — and three boosted plow runs then escaped or stalled-for-a-beat-and-pulled-through, letters scattering with real weight. Jump (2.2 rise) and auto-flip (inverted → 0.996 up) re-verified with the new collider. **Deliberately not started: the fast-travel map** — the handoff's own gate ("if both land and I like them"), waiting on Michael's drive. Open questions for that drive: the ford's wet-sand read at the crossings, the wide junction apron at the career tee, arrow glyph taste (the ↓ for projects-from-spawn is honest but blunt), and whether letter mass 2 feels like a shove or a wall at cruise speed. Previous entry: **The boost and jump are HIS now — 2 Sep, after Michael sent the first home-grown version back to the source** (*"take a look at his code, his boost seems to have effects on the screen as well as behind the car, also its really fast, also check the jump too"*). What the reference's code actually says, read at the cited lines: **boost is top speed 5 → 40** — eight times cruise, not the timid 1.6 that shipped hours earlier — **with 3× engine force** (`PhysicsVehicle.js:16-18,460-462`), and **the reference's jump is not an impulse at all**: Space snaps every wheel's suspension rest length from `low` 0.88 (which IS our shipped rest length, to the centimetre) to `high` 1.63 and doubles the spring stiffness, and the springs launch the car (`PhysicsVehicle.js:31-40,495-496` — the reference's full numpad lowrider stays behind, one verb was the ask). Both effects ported with it: the **speed lines** (`View.js:462-563` — thirty clip-space slivers around the frame edge whose tips stretch toward the car's projected position, on at the reference's threshold of 15 physics m/s, three times cruise) and the **twin ribbon trails** (`Trails.js`, near-verbatim: one static 32-ring tube per trail repositioned in the vertex shader from a scrolling 32×1 DataTexture of anchor positions — no geometry ever rebuilt; the reference's rainbow gradient swapped for our **emissive amber at the reference's ×5**, so the boost burns over the bloom threshold at night). Measured on the running build: 23.8 physics m/s one second into a boost (the corridor is now a runway — the buggy launched clean off the seaward exit and crossed open water on fire, which is a feature), lines at 0.72 mid-run, tap-jump **2.29 units of air** (twice the impulse version the reference's springs replaced), hold-Space stilt-walking at +0.74 = the reference's rest-length delta exactly. Two measurement flakes for the record: both slow-boost readings were the car in water (the landing spawn boosts straight into the trunk river in under two seconds; reset between samples, test on the corridor). The zoom pull-back's speed edges went to the reference's 5–40 with the boost that justifies them (`View.js` had recorded "we have no boost" as the reason for its own 8–30). **Two follow-ups the same evening, both Michael's.** The letters dropped from his mass 2 to **0.5**: his letters weigh 80 % of his chassis and the reference's car still scatters them because the reference's oversized mass-0 BUMPER does the shoving — the one vehicle part we skipped when every island prop was fixed, whose own comment says "It lands with dynamic props"; until it lands, the reference's letter mass wedges our bumperless car ("the car sometimes gets stuck"), and 0.5 plows clean (verified: through the line at speed, three letters shoved, no wedge). **The bumper is now the recorded proper fix.** And a deferred watch item in the reference's words: *"his driving somehow still feels smoother, it might be because our map is too small and has bumps in rivers for when we boost too fast, dont worry about this for now"* — the river-bank curvature under a 40-speed boost is a real thing the reference's flat-land 192-unit world never has to cross; parked next to the wayfinding/roads work, since smoothing the boost corridors and paving them may be the same task. **And the letters found their weight**: bold was "too heavy", regular "too thin", and helvetiker has nothing between — so the middle weight is a small outward BEVEL on the extrusion (`bevelSize` 0.035 grows the glyph outline), a parametric weight the font family doesn't ship. The subheading is the reference's wording too now: "drive around my work and career". **And the auto-flip landed** ("can we add something that auto flips like a little hop back onto his feet") — the reference's `upsideDown` watch + `flip.jump` ported (`PhysicsVehicle.js:232-259,344-444`, `Player.js:345-393`): a chassis-up-dotted-with-down ratio past 0.3 arms a three-second grace, then a `force 5 × mass` hop with a righting torque impulse, re-armed until upright. **One trap for the record: the torque SIGNS do not port literally.** The reference's (forward X, axle Z) and our (forward Z, axle X) are opposite-handed axis pairs, so every righting torque reverses — the literal port rolled a side-lying car the long way round into fully inverted, caught because all three poses (side, inverted, nose-over) were tested rather than one. Verified: side 0.07 → 0.99 upright, inverted −0.97 → 0.99, nose-over settles on its wheels inside the grace with no flip at all, which is what the grace is for. **Two tunes on Michael's next drive** ("it only auto flips to its side not fully back... can we make it so it has a wheel extension when we jump / hold space"): the fully-inverted torque went 0.8 → **1.6** — against our unit inertia, the reference's 0.8 gave Δω 2 rad/s and a half roll needs π inside the hop's air time, so the car flopped onto its side and waited out a whole second grace; 1.6 turns the full roll in one hop, and follow-up hops re-arm at **1.5 s** instead of 3. A **stance latch** (tall legs held through a tapped jump's flight) lived for one drive and was reverted on the reference's read ("it now feels weird... What i wanted was that his car has like a 3d suspension pole"): the actual ask was the reference's `wheelSuspension` VISUAL — the reference's wheel containers carry a Blender strut whose `scale.y` spans chassis-underside-to-hub (`VisualVehicle.js:460-464`), the thing that makes the reference's lowrider stance read as hydraulics instead of a floating body. Our buggy rig has no such part, so each corner now generates a thin `rockDark` strut on the steer pivot, scaled per frame by the reference's rule (`−rootY − HALF.y`): a stubby 0.5 at rest, a 1.2-unit visible leg on stilts (measured 0.38 → 1.21 holding Space). **The boost exhaust went through the whole menu in one sitting and landed where it started, recolored** — which is its own lesson in judging by eye. Three candidates, three verdicts, all Michael's, all same-day: faceted amber **puffs** (the island's own language — "i dont like the puffs", deleted), a Rocket-League **jet plume** with teal electric arcs (the reference's linked reference, built, sized up once — "revert back to original", deleted), and finally **the reference's ribbon trails restyled to the reference's read** ("make it look sort of similar to rocket league boost trails"): the mechanism stays the reference's scrolling-DataTexture tube, now **additive-blended** (an energy streak that glows over what it crosses), **tapered** (full width at the nozzle to a sliver at the tail — the reference's tube is constant-radius), and **two-toned** (amber at the nozzle mixing to accent-teal down the tail; additive amber×5 reads white-hot at the head, which is exactly the reference). The judging flag is gone — `#boostfx=` lived for one hour and one decision. Verified frozen mid-drive: twin tapering cyan-to-white streaks curving through the plow-path, unmistakably RL, unmistakably this palette. Previous entry: **Boost, jump, the lighter name, and the car goes back to olive — 2 Sep, three verdicts in one message.** The buggy's one-day teal is reverted ("i dont like this blue") through the full recipe → `prep` → `compress` road, with the trial recorded in the recipe comment so the next "the car is bland" reads it first. The name's **bold face was the "too heavy"** — swapped to helvetiker regular (fetched, credited; the bold json deleted), same size, and the line reads as letters now instead of a wall of ink. And the car learned Michael's own two verbs, which the reference author's never had: **boost** (both Shifts; raises the soft limiter's force AND knee ×1.6 — raising force alone just makes the limiter bite a metre later; measured ~+38 % top speed on the running build) and **jump** (Space, which moved here from handbrake — handbrake is on X now; edge-triggered and grounded-gated through `wheelIsInContact`, impulse scaled by the live chassis mass so a retune never re-tunes the jump; measured 1.19 units of rise from rest, zero climb from holding the key, bunny-hopping on rhythm deliberately possible). One measurement flake worth remembering: the first speed test drove itself off the island and "boost" read slower — it was the water knee; reset between samples. Previous entry: **The name is drivable and the about corner is gone — 2 Sep, an hour after it was built, on Michael's read** (*"the original like one sentence ... is better, theres too much text and its too small... he had letters of his name he can run over, and thats it"*). The reversal is recorded rather than smoothed over, because both halves were correct: the corner was built to the ritual and it still lost to the reference's artifact — which the ritual then measured. The reference's landing letters, walked out of `areas.glb`: **ten dynamic letter bodies** ("the reference name"), each ~1.45 tall, ~0.94 deep — fat extrusions, not plates — with proportional widths (the reference's I is 0.53), spanning 12.4 units across the spawn approach, each on its own cuboid, and **mass 2** (the number the reference's own userData carries; our check-loader fixture had been asserting it for weeks without knowing why it mattered). What ships: **"MICHAEL YEH" — ten letters too — standing at the landing as knockable dynamic bodies** (`TextGeometry` over helvetiker bold, fetched at boot with a flat-decal fallback, credited; extruded at the reference's depth ratio, born asleep on the contact icons' proven `objects.add` pattern), with the ground line reverted to decision 42's original **"drive around my work"**, and that is the site's entire self-introduction — the reference's economy exactly. The size shipped at **1.15, not the reference's 1.45**: at the reference's size the line ran 13.5 units and clipped the frame (measured 12.25 between end-letter centres on the running build) — the reference's number, our camera, the framing wins. Verified: a knocked letter flies, topples, the visual follows through the interpolation seam, and it sleeps where it lands. The **about corner was removed whole** (files deleted, def gone, check-about retired — the chain is back to seven suites); it was staged and never committed, the swept site at [10, -38] lives in this entry, and `about.js` keeps `blocks`/`availability` as surface-less data with the retirement recorded in its header. The CMU facts a visitor loses with it already stand on the career corridor's education slabs. Previous entry: **The about corner stands — 2 Sep: the fifth district, and the area roster is complete but for the designated cut.** The ritual ran and returned a negative measurement worth recording: **the reference's roster has no about area** (sources/Game/World/Areas/, checked directly) — the reference's landing is the reference's about and `BehindTheSceneArea` is the nearest analogue, a point opening a modal. Ours diverges deliberately because Michael cut the about to two lines the day before: two lines do not deserve a modal, so they stand IN the world — one tilted always-emissive card per block of `about.js` (`aboutPlan.js` pure, `wrapToLines` giving each block as many lines as it needs), the last block in amber as the sign-off, a streetlight so the corner is findable at night, crate and barrel as the porch, the shared one-way write-on wipe. The **availability line joins as its own card the day Michael writes it** (data-driven; `check-about` proves the future). Sited by the same sweep: `[10, -38]` on the north shore, zero relief, clear of all four districts (the plaza-at-eight margin is 4.5). `check-about` is the **eighth** suite: the wrap rules, the one-card-per-block layout, a **length guard at 180 chars** (where standing cards stop being the right medium and the DOM card layer is the conversation), the site swept with and without availability, and the four no-overlap contracts. Verified on the running build; mid-verification the car started moving on its own — **Michael was driving the tab live**, which is the ritual working better than designed. Previous entry: **Three look calls closed, the prose landed, and the car went teal — 1 Sep, evening, all on Michael's verdicts in chat.** The **knollwood slab is real**: title and stack from his resume ("AI Software Engineering Intern"; Python, Salesforce, FastAPI, Azure), the line is *"Taught Salesforce and the warehouse to agree."* (the record matcher's story at driving speed — entity resolution joining Salesforce to the warehouse with no shared key), the org stays short-form "Knollwood" because the full "Knollwood Investment Advisory" wraps badly at slab sizes (swap on the reference's word), and the reference author approved the drafted cca line the same message. Verified standing on the corridor's work lane. The **verdicts**: the seaward exit stays ("I like the seaward exit"), the cart's accent-orange stays ("the carts retint is good"), and **every in-world label is always-emissive now** ("yes i want it to glow at all hours") — `game.textPlate` passes `emissive: 1.5` instead of the night-only term, so the plaza titles and the landing's name join the career and contact cards, neon at noon like the reference's world; verified at noon and at `#day=0.45`. And the **car wears accent cool** ("can you make the color of the car more unique, it looks kinda bland"): five snapOverrides in the buggy recipe send the Cube-mesh body panels to teal while wheels, chassis, cage and greebles keep their snapped greys — the hero object finally spends the one accent nothing else wears (the cart owns accent warm), through the full ritual: recipe → `npm run prep` (byte-verified) → `npm run compress` (23.8×) → `check-prep` green → judged on the running build day and night. One honest note on record: accent cool sits near the water's turquoise, so the car pops everywhere except while wading — flag it if it reads wrong in play. Still open from the look-call list: only the `#yearunit=` standing offer. Previous entry: **The links are objects now — 1 Sep, same day, on Michael's first drive ("it can be bigger… 3d objects of gmail logo, linkedin logo and github logo"): the contact arc grew the reference's 3D icons.** Each link stands as an **extruded 3D mark** — the octocat, the LinkedIn square, and for email a **generic envelope by deliberate choice** (the link is a mailto, the reference's own build uses a plain envelope, and repainting Google's mark onto the palette is the kind of IP edge this repo declines; the Gmail M is a one-line path swap if Michael overrules). The marks are the official Simple Icons paths (CC0, fetched from unpkg, credited — the logos stay their owners' trademarks, used as link icons to Michael's own profiles) plus Material's mail glyph (Apache 2.0), run through `SVGLoader` → `ExtrudeGeometry` at build time in `contactIcons.js` — code-generated geometry, `paint()`'s side of the decision-47 rule, at **the reference's measured 0.2 icon thickness**, curveSegments 5 so the octocat stays low-poly. Each glyph is a **dynamic Rapier body born asleep** — the reference's fans pattern verbatim through `objects.add` — resting on a fixed-collider `rockDark` pedestal, so the car can knock a logo off its stand (verified: an impulse sent the octocat tumbling, the visual followed through the interpolation seam, and it slept again on the ground). The pedestal is not decoration: at ground level the white glyph and the card's big white label occupied the same screen band — illegible both ways, the label literally hidden behind the pedestal box — which settled a design call: **the label row is cut**; the glyph is the label (the reference's design exactly — icon + DOM prompt, no in-world label text), and the card is now a single amber address row at the pedestal's foot, reading as a nameplate. Verified day and night on the running build; the icon points ride `contactPlan` so the dryness sweep and the eight-link future cover them. Previous entry: **The contact arc stands — 1 Sep: the reference's SocialArea, measured before built, as the fourth district.** The measurement came first this time, the corridor's lesson applied instead of relearned: the no-loader glTF walk over the reference's `areas.glb` found the reference's eight baked icon props at **radius 7.85 on exactly the `i·π/(N−1)` arc the reference's `setLinks` computes** — 3.49-unit chords, interactive label points at radius 6 × y 1 (the reference's code), the statue on a low hull pedestal at the centre. The generalisation that shipped: **the reference's angular step (π/7) is the invariant, the span derives from `.length`** — centred on the arc's top, three links keep the reference's measured spacing instead of smearing 11 units apart over the half-circle, and at eight links the formula degenerates to the reference's layout digit for digit (a `check-contact` assertion, with the measured positions embedded as the regression anchor). One deliberate mirror: the reference's `socialData[0]` stands at the far right end; `links.js` promises display order and a screen reads left to right, so our first link lands screen-left. What stands on the arc, in this site's vocabulary: **standing tilted always-emissive cards** (label over address — `displayAddress` strips the plumbing off each url) on amber-capped marker stones — the reference's icons stand permanently, so no pop-up motion; the only animation is the label wipe writing the arc on at first arrival, one-way so nothing can freeze mid-sink — with a **beacon at the reference's exact label geometry** per link, opening the url in a new tab, the reference's handler verbatim, mailto included. Where the reference's statue stands, the found **bonfire** burns between two log seats (logPine, not logBirch — the birch bark's white snapped near amber and the whole log glowed at night, the haystack rule again), so the corner reads as a campfire hangout by day and joins the emissive layer at night for free. **Sited by sweep, not by eye**: 99 flat-dry candidate discs on the real height field, `[-16, -26]` on the north band chosen for balanced margins — 4.9 units clear of the plaza at decision 21's eight entries, 5.7 clear of the corridor, 30.5 from spawn; the south stays decision 3's reserved lobe. Everything data-driven from `links.js`; `?at=contact` spawns you facing the fire, `&p=<slug>` stands you at that link's card. `check-contact` is the **seventh** `npm run check` suite: the measurement, the `.length` layout rules, `displayAddress`, the links-data guards, the site swept for today's three links and the eight-link future, and the island's no-overlap contracts. Verified on the running build day and night — the night drive is the money shot: three glowing cards, amber caps, the fire. One found defect worth the record: the first build's cards never appeared because `_buildCard` composed the group and never added it to `area.group` — caught on the running build within minutes, the reason the verify ritual exists. Previous entry: **The career corridor stands, and the site introduces itself — 31 Aug, night: decision 24 with the reference's whole motion package, plus the landing.** The corridor is `world/areas/CareerArea.js` over a pure arithmetic module (`careerTimeline.js`) and a `YearCounter`, everything data-driven from `content/roles.js` — the one thing the reference's build gets wrong (the reference's career content is baked into Blender; ours re-lays itself from the dates). The motion package is `D` §4.4 line by line: slabs **rise out of the ground and slide alongside the car** for the length of each entry (`clamp(delta, 0, size)`, exponentially smoothed), a **label wipe** writes each slab's text on as it stands (a `wipe` uniform in `makeTextMaterial`, opacity not discard), and the **7-segment year counter renders its digits in the vertex shader** — 7×10 DataTexture, one uniform per digit, inactive bars dropped into the housing — tracking beside the car at **one year per world unit** (`#yearunit=` stretches the scale live for judging). The segments sit on **band 12, so the counter glows and blooms at night for free**, beside the medieval pack's streetlights (fence, cart, barrels dress the lane; the streetlight goes through the lamp-post body pattern — cloning the whole scene instead of the physics-worded child was caught on the running build standing two lights at the origin). Education rides the same axis: `roles.js` now scaffolds CMU (`kind: 'education'`), and the date rules are explicit — `end: null` is *current*, `''` is *unwritten*; a role missing one date stands as a warned-about one-year placeholder (knollwood today, years label "···· – now"), missing both it is skipped and named in the console every boot. **Siting was forced, not chosen**: the plaza's derived radius reaches 41.6 at decision 21's eight entries, the south is the reserved lobe, and every screen-horizontal strip crosses a channel — so the corridor runs **up-screen on the west band** between the trunk and the NW inlet, slabs facing the camera *and* the approaching car. `npm run check` runs **six** suites: `check-career` proves the date rules, the slide math, the digit patterns, and sweeps the whole placement plan (a pure `corridorPlan` both the area and the check consume) over the real height field — today's data, the full-dates future, and `#yearunit=2` all dry and flat; the fence found its own bank collision this way twice. **The landing landed the same night**: `about.js` carries `name`, and `LandingArea` paints "Michael Yeh" / "drive around my work" as ground decals camera-side of the spawn (the first build laid them up-screen — in the trunk river, invisible; the guard that catches that is now in the file). Three findings for Michael's drive: the scaffolded corridor is ~6 units spawn-to-end and passes in about a second at speed (real dates + `#yearunit` are the levers, exactly as `roles.js` predicted), the corridor's exit points at the west shore (wading, nothing drowns, but judge it), and the cart retints loud accent-orange. Previous entry: **The compressed build ships — 31 Aug, late: 2.5 MB of models travel as 166 KB.** `VITE_COMPRESSED` flipped (production only; dev keeps raw GLBs), `DRACOLoader` wired behind `modelUrl()`, a 199 KB wasm-only decoder in `public/draco/`, and `npm run build` ends in `prune-dist` — which strips raw siblings and tooling files from `dist` and fails the build if compression was skipped. Measured on `vite preview`: 34 fetches, zero raw GLBs, total page 1.7 MB of which 1.34 MB is the JS bundle (the next payload target, when code-splitting matters). The KTX2 runtime half was declined on a premise check: the palette is a generated 512-byte DataTexture, and a transcoder to load 1.5 KB is a loss. Previous entry: **The world lights up at night — 31 Aug, evening: PoleLights and the headlights, as one shader term.** Amber is the emissive band, so the content material adds a luminance-normalised glow wherever UVs sit on band 12, faded by a smooth `nightness` ramp — lamps, brake lights, flames, glow mushrooms and flower hearts all light through dusk at once, merged scatter included. The buggy's headlight glass joined the band and a warm cone term pools light on the ground ahead of the car (`render/Night.js`; the toon material ignores real lights, so the beam is shader math). The same session ran the **liveliness pass** on Michael's "center island still feels dead": ground flora now spreads into the clearings (drive-through texture, corridors stay drivable), trees and undergrowth clump into four **groves**, counts up to 14 trees / 40 flora. Earlier the same day: found rocks, logs and snags from a third pack, the placeholder houses removed on the reference's call, and the trees rebuilt in the reference's blob-cluster construction after the reference's catch that the found ones didn't match. **The brightness re-judge is unblocked — the night finally has lights in it.** Previous entry: **The island has real vegetation — 31 Aug: the retint tool learned texture atlases, and two whole packs went through it.** Michael's two finds (both CC-BY, `CREDITS.md`) delivered **20 game-ready props in one run**: eight trees (oaks, birches, pines — each shipped as `treeBody`/`treeLeaves`, *the reference's* convention, so `Island` winds only the crowns exactly as it wound its cones), three bushes, a stump, and eight medieval dressing props (fence, barrel, cart, crate, haystack, bonfire, log, a second streetlight). The tool's third path is **texture sampling**: atlas packs colour via textures (all factors white), so every triangle samples its atlas at its UV centroid and snaps like any colour. Two consequences worth the record: **the palette grew its first headroom entries** (16 `wood` / 17 `woodDark` — the packs are full of timber and everything brown was snapping to bright accent-orange), and **amber-snapped triangles now ride `paletteEmissive` automatically** (bonfire flames, the streetlight's glass — light sources by any honest reading), with an override for the haystack, because a haystack that glows at night is a joke. The island scatter now places the real trees and bushes; generated cones survive as the no-loader fallback. See *The nature packs — 31 August*. Previous entry: **The car is real — 30 Aug, evening: the highest-leverage model in the project is a found asset.** Michael's second find (after a Halo Warthog was declined on IP and a 200× polygon overshoot) is an original CC-BY concept buggy that fits the physics like it was built for it: scaled so the wheel radius is **exactly** `Car.WHEEL.radius` (0.420), the wheelbase lands within 1 % of the mounts, and nothing in the handling moved. The prep tool grew the second extraction path decision 47 needed — **subtree selection by node name** for models that kept their structure — and ships `carBuggy.glb` as a two-part rig (`buggyBody` + one `buggyWheel`, instanced four times, right pair mirrored). The red tail-light lenses ride `paletteEmissive` on amber, same seam as the lamp chamber. **The first build shipped turned 180° — Michael caught it by driving** (*"our backwheels are acting as front wheels"*); the flip is removed and the orientation is now a headless check, not a reading. **Raw model bytes are now 1.62 MB — past the Draco flip criterion set this morning** (buggy compresses 23.7×); the flip is the next code item. See *The car — 30 August, evening*. Previous entry: **The first found asset stands in the world — 30 Aug, same day as decision 47.** The retint tool exists (`npm run prep`, `tools/prep-model.mjs`) and the lamp went through it: Michael's Sketchfab tōrō (CC-BY, aiiko7, recorded in `CREDITS.md` *and* riding the GLB's own asset extras) is now `public/models/lampPost.glb` — Y-up, 2.7 units, grounded, split into `palette` wood and a `paletteEmissive` light chamber on **band 12, emissive amber, the entry nothing had ever used**. Two lamps flank the plaza's standing point through the real runtime road (`ResourcesLoader` → registry → fixed Rapier bodies). `npm run check` runs **five** suites now — `check-prep` proves both retint paths, makes every guard fail once, and stands the real shipped file in a live Rapier world. `VITE_COMPRESSED` was **measured and deferred**: Draco takes the lamp 87,828 → 10,168 bytes (8.6×) but the decoder costs ~360 KB, a net loss until roughly half a megabyte of raw GLBs exist — the criterion is written in the handoff. See *The retint tool and the first found asset*. Previous entry: **Art direction changed — 30 Aug, decision 47.** Michael: nothing is hand-modeled; every asset is found (CC0/CC-BY), credited, and auto-retinted onto the palette by a script. The palette look stands; the Blender ramp and hero-modeling are cut; `CREDITS.md` exists; the next code item is the **retint tool**, and the first real asset is a found model rather than the lamp. See *Third pass — 30 August*. Previous entry: **Block A's engineering is done — 22 Aug: an authored model can land.** The gap named in the last handoff is closed end to end — `ResourcesLoader` in front of `src/pipeline/`, the name → material registry (`palette` pre-registered), and `Physics.getPhysical` behind it — all proven headlessly against a generated fixture carrying every pattern at once, through the real `load()` path into a **real Rapier world** (`npm run check` now prints **four** ok lines). Both halves of the asset step landed (`npm run compress` — Draco for models, and after the okayed toktx install, a pixel-exact `palette.ktx`). The runtime glue landed 23 Aug (`src/world/Objects.js`, proven in check-loader) — what the lamp session writes is one load call and one `addFromModel` loop; see *The runtime glue*. **All three look calls closed 23 Aug, one rule: whatever is most similar to the reference's.** `KNOWN-ISSUES.md` 22 — the corrected encode (the reference's painted PNG carries authored sRGB bytes; now so does ours). `#wind=` — stays at 0.5, which *is* the reference's constant at the reference's gust rate; no change shipped. `#sink=` — stays at 0: the reference's areas all stand on flat land and a sunken plaza exists nowhere in the reference's build, so the plaza ships flat and the carved-ground work stays where the reference's is — the water channels. The basin machinery keeps its flag as an art-phase lever. **The only thing waiting on Michael is the prose** (deferred by his call, 22 Aug). Previous entry: **Phase 3's whole opening sequence — 21 Aug.** All five code-track items landed: the palette file, the scale-reference GLB, the `^ref` import path, the sunken-plaza test and ambient motion. Each is written up under *Read off the reference's running build*, each was validated against the reference author's own data or our own running build, and between them they corrected **four claims in report `F`** and two figures in this file. Previous entry: **Phase 2b completed 20 Aug.** Its last two items landed in the evening session: `?at=<area>&p=<slug>` now stands you in front of one specific board and opens its card when the cinematic ends, and the single `input.suppressed` boolean is replaced by the reference's categories-and-filters design. The second closed two live defects that the first would otherwise have shipped to strangers — every key was live through the opening cinematic, and Escape stopped closing the card the moment you clicked the world behind it (`KNOWN-ISSUES.md` 20 and 21). **The only thing left in the block is prose**, and it is Michael's: `edgeball` and `footnote`, the roles list, the about text, and two URLs. |
| **Next** | Phase 3 — all the real art, **resourced 30 Aug by decision 47**: found assets (CC0/CC-BY), credited, auto-retinted onto the palette by a script — nothing hand-modeled, the Blender ramp cut to touch-up. Still the long pole, now curation rather than modeling, and still where the emissive layer that decision 13 hangs our identity on gets built. **The terrain finding still sits in front of it**: the reference's world's shape comes from water carved into flat land. **Both halves landed 20 Aug** — `LAND_RELIEF` is 0 (which fixed a camera defect Michael found by driving, `KNOWN-ISSUES.md` 19) and `Terrain.CHANNELS` carves nine polylines through the flat land, judged and accepted on the running build. What is left of it is density: **5 interior bodies against a like-for-like target near 9**, deferred by Michael to the art phase along with the rest of the map layout. |
| **Later** | Game feel, reach, ship. |

---

## Where we are

### Phase 0 — Research ✅

Ten reports across two rounds. The second round — reading the reference's actual source —
overturned several things the first round inferred.

| Round | Reports | Lines | What it established |
|---|---|---|---|
| Bundle teardowns | `research/00`–`03` | 2,205 | Three reference sites driven live; asset waterfalls; the model we chose |
| **Source read** | `research/source/00`–`F` | **9,576** | All 135 source files, 29,666 lines of JS, plus the asset tree and `.blend`. Every high-consequence claim verified twice at the cited line. |

Start with `research/source/00-SYNTHESIS.md`.

The finding that shaped everything below: **in all three reference sites, the
engine is the cheap part.** the reference author's dominant cost was 3D art and audio. kairui's
largest single bucket was 80–140 hours hand-placing ~350 objects. Budget
accordingly.

### Phase 1 — Engine foundation ✅

1,936 lines across 17 files. Verified running in Chrome on the **WebGPU**
backend with automatic WebGL2 fallback. Measured: ~23 draw calls, ~119k
triangles, 1.6 ms render encode per frame.

**Working and verified:** boot sequence, the reveal system, Rapier physics at a
fixed 1/60, driving, collision, world growth tied to distance driven, shadows
that follow the car, the palette texture, the chase camera, and the accessible
fallback.

> **Some of this is now deliberately being replaced.** The decisions below retire
> world growth, the permanent reveal, the void backdrop and the chase camera's
> rotation follow. That is not wasted work — each was the thing that proved the
> surrounding system stands up. But read *Decisions settled* before treating any
> Phase 1 subsystem as final.

| Subsystem | File | Origin |
|---|---|---|
| Priority-ordered single ticker | `core/Ticker.js` | the reference |
| Adaptive DPR with oscillation guard | `core/Viewport.js` | messenger |
| Action-based input, mode on `<html>` | `core/Input.js` | the reference |
| WebGPU + WebGL fallback, warm-up render | `render/Renderer.js` | messenger |
| Player-tracking reveal radius | `render/Reveal.js` | **ours** |
| One palette texture for the whole world | `render/palette.js` | the reference |
| Rapier raycast vehicle | `world/Car.js` | the reference |
| Fixed-timestep accumulator | `world/Physics.js` | **ours** — the reference's is variable |
| Fixed diorama camera, spring as its filter | `world/View.js` | the reference + kairui |
| Separate collision geometry | `world/Island.js` | the reference + messenger |
| Reveal gate before lifting the loader | `main.js` | kairui |

> **Attribution corrected after reading the reference's source.** The player-tracking reveal
> and the fixed-timestep accumulator were credited to the reference on the strength
> of a bundle-derived teardown. Both are ours. The reference's `Reveal.js` is a 5.5-second
> intro cinematic that switches itself off and destroys the void grid; the reference's Rapier
> world runs a *variable* timestep. Full list in `00-SYNTHESIS.md` §1.

**Known unfinished from Phase 1** — the full list with evidence and fix order is
`KNOWN-ISSUES.md`. Headlines: a `DoubleSide` normal-flip bug that is probably why
the scene reads dark, a reveal rim ~40× too wide, no bloom, and a terrain trimesh.

> **One correction to `KNOWN-ISSUES.md` #4.** It offers "a Rapier heightfield or a
> coarse cuboid set" for the terrain. The source settles it: the reference's terrain physics
> **is** a Rapier heightfield extracted from a GLB, plus a kinematic bedrock
> cuboid that follows the player near the world boundary (`Floor.js:120-153`,
> report `B` §7). The 454-cuboids-to-4-trimeshes ratio describes **props**, not
> terrain. Heightfield for terrain, cuboids for props, trimesh for nothing.

---

## Decisions settled

Recorded 19 August 2026. Each row is a verdict, not a preference to revisit.

### The world model

| # | Decision | Verdict |
|---|---|---|
| 1 | **World shape** | An **island surrounded by infinite water**, the reference's model. Fog colour *is* the sky colour, which is how the horizon dissolves. |
| 2 | **Island size** | **~150 units.** Smaller than the reference's 192 because the reference's carries a race circuit (`CircuitArea`, 1,690 lines — the reference's largest area file), bowling, a lab and a playground. Strip those and the reference's world is smaller than ours was. |
| 3 | **Room to grow** | Design the island with **one lobe deliberately left undeveloped.** Expanding an authored heightfield later means re-authoring terrain, shoreline and water alpha together — a Phase-3-scale task. Filling a lobe that already exists is an afternoon. |
| 4 | **The reveal** | Becomes a **three-step intro cinematic**, as the reference's is. It ends, unsubscribes its own tick, and takes the void grid with it. |
| 5 | **World growth** | **Deleted.** `Game._grow()` and the distance-driven radius go. The world is whole from the moment the intro ends. |
| 6 | **The void grid** | Demoted to **intro scaffolding**, destroyed at step 2. It is no longer the backdrop. |
| 7 | **Deep links** | Now trivial — the world is always whole, so `?at=<area>&p=<slug>` just spawns you. The reveal/deep-link collision is gone. |

**Why this was the right trade.** It retires four risks at once: the permanent
rim-quality problem, the void grid's AA sparkle past ~150 units, the
deep-link-into-invisible-world collision, and the two hardest problems in
third-person cameras. Net effort is roughly break-even.

### Look

| # | Decision | Verdict |
|---|---|---|
| 8 | **Shading model** | **Adopt the reference's package whole:** flat toon material (`albedo × lightColor × lightIntensity`, **no diffuse N·L term**), mixed to a tinted shadow. **Drop the `HemisphereLight`** — its soft normal-dependent gradient is exactly what makes flat colours read as unfinished. |
| 9 | **Tone mapping** | **Removed.** The reference author has none anywhere. With no curve between the palette and the screen, every intensity value in reports A/B/C transfers verbatim instead of being re-derived by eye. |
| 10 | **Bloom** | In. Computed from the linear pass, added after `renderOutput`. Threshold 1, strength 0.25, 5 mips. Every glow in the reference's world is an over-1.0 colour meeting that threshold. |
| 11 | **Day cycle** | **240 s, UTC-epoch-synced**, adopted fully — **including the rim colour swing** (`#5f7dff`@12 day → `#ff86d9`@5.55 dusk → `#b678ff`@10 night → `#ff9d9d`@4.85 dawn). Easy to accept now that the rim is on screen for 5 s rather than permanently. |
| 12 | **Year cycle** | **In.** 365-day epoch-synced. Drives seasonal foliage, ~~per-season light and fog tint~~ (**wrong, see correction**), and **falling leaves in autumn**. |
| 13 | **Palette identity** | **Keep moss-and-slate; differentiate on the accent layer.** The premise it was chosen against was false — the reference's base palette is sand, olive, terracotta and gold, not magenta. The synthwave read comes entirely from a separate emissive layer. Identity work belongs in the rim, the night lamps and the emissive props. |
| 14 | **Palette format** | **128 × 4, four-pixel bands, 32 slots (use ~24).** Our 1-px bands are exact only because we generate in JS; they bleed the moment the palette is a KTX2 file. The 4-px tolerance is also what makes hand-UVing fast. **Landed 20 Aug** — `public/palette.png`, 156 bytes, 16 assigned and 16 headroom. **First headroom spent 31 Aug**: 18 assigned since entries 16/17 (`wood`/`woodDark`) landed for the found packs' timber. See *The palette file* below for the source-of-truth call and the two deviations from the reference's file. |

### Camera and feel

| # | Decision | Verdict |
|---|---|---|
| 15 | **Camera rig** | **Fixed isometric, the reference's numbers.** `phi = 0.31π` (55.8°), `theta = 0.25π` (45°), **FOV 25°**, ~~radius 15–30~~ **resting radius 30, running to ~34 at speed** (see correction). **X/Z follow only** — no rotation follow, no vertical follow. Keep our spring as the *filter* (velocity continuity and an acceleration ceiling the reference's lerp lacks); delete the `_forward` rig around it. Add the reference's aspect-ratio pull-back and the roll shake (ω 20, damping 8 against a plain delta). |
| 16 | **Authoring constraint** | The world is now authored **for exactly one viewing angle.** Every monolith face, sign and readable surface is placed knowing theta is 45° and never moves. |
| 17 | **Terrain relief** | **Modest.** No vertical camera follow means a hill tall enough to hide the car is a bug. The reference's total displacement is 1.5 units — the island is nearly flat and its shape comes from the shore, not from hills. |
| 18 | **Global time scale** | **2×.** `world.timestep = 1/30` while `updateVehicle` keeps receiving `1/60` — the 0.5 ratio the reference's constants were tuned against. Every value in `C` §5.2 then transfers with no arithmetic. |
| 19 | **Car proportions** | **Wheelbase 2.24 m → 1.80 m**, bundled with the Phase 3 visual rework. ~~chassis 3.1 m → 2.6 m~~ — **withdrawn, see correction.** |

**Evidence for 2 and 23, from playing the reference's build rather than reading it (19 Aug).**
The reference's fast-travel map is a rendered top-down image, and it settles the island-size
question better than any argument so far. **The race circuit occupies roughly the
left half of the island** — a kerbed track filling ~45 % of the land area. Every
content area is packed into the right-hand side, fourteen pins inside a region of
roughly 90–100 units across. Proportions estimated off the map image, not measured
in world units, so treat them as ±10 %.

That inverts how decision 2 reads. "Strip the circuit, bowling and lab and the reference's world
is smaller than ours was" is true but understated: **the reference's content land is about
90–100 units, and we are proposing 150 for less than half the reference's area count.** 150 is
not tight, it is generous. The risk to watch is the opposite one — a sparse island —
which is what decision 3's deliberately undeveloped lobe already anticipates.

The reference's full area list, read off the live build, is thirteen: `landing`, `career`,
`social`, `projects`, `lab`, `cookie`, `altar`, `toilet`, `bowling`, `circuit`,
`behindTheScene`, `achievements`, `timeMachine`. Decision 23 takes six.

**Correction to 12, 19 August — the year cycle carries no colour.** Read off the reference's
source and confirmed against the live object: the reference's four seasonal presets
(`Cycles/YearCycles.js:15-18`, at stops 0.125 / 0.375 / 0.625 / 0.875) hold exactly
five scalars — `leaves`, `temperature`, `humidity`, `clouds`, `wind`. There is no
light tint, no fog tint and no palette in them. **Every colour in the world comes
from the day cycle**, which is the only cycle with `Color`-typed properties. Plan
the year cycle as a driver of *quantities* — foliage state, particle counts,
weather — and never as a second source of colour, or it will fight the day cycle
and the colour gate. The "128 in spring to 2,048 in autumn" leaf count is consistent
with the reference's `leaves` scalar running 0 in spring to 1 in autumn. Whether foliage
*colour* varies by season is **unverified** — it is not in the presets, so if it
happens it happens inside the foliage material.

**Corrections to 15 and 19, 19 August**, both found by measurement after the camera
landed. Recorded here rather than edited away, because both original numbers came
from reading rather than measuring and that is the lesson.

- **Radius (15).** "15–30" is the reference's declared range, but 0.6 → radius 21 is only the reference's
  *initial* state. The reference's intro tweens `zoom.baseRatio` to **0** and never restores it,
  so the reference's shipped build drives at **radius 30**, running past the declared max to ~34
  at speed because neither the reference's lerp nor `MathUtils.lerp` clamps. Read off the reference's running
  build: `baseRatio 0.001`, `radius.current 29.99`, `reveal.step 2`. Ours sat at 21 —
  43 % closer through the same 25° lens, and the whole reason the reference's world read wider.
  Our `ZOOM_BASE_RATIO` is now 0. The 15 end is unreachable without a zoom control.
- **Chassis length (19).** "3.1 → 2.6" compared our *visual model* to the reference's *collider*.
  The reference's visual chassis, measured in its own local frame, is **2.99 × 1.66 × 2.04**; the reference's
  collider is deliberately ~13 % smaller than the thing you see. Ours is
  3.1 × 1.19 × 1.7 — the same length within 4 %, with the reference's body taller and wider.
  Shortening ours to 2.6 would make it *smaller* than the reference's. **The wheelbase half
  stands**, though measurement shows it buys no handling: full-lock turn radius moves
  7.01 → 6.93 units, yaw rate 113 → 110 °/s, because the car is slip-limited rather
  than Ackermann-limited. It is a look change, which is an argument for keeping it in
  Phase 3, not against.

### Content and areas

| # | Decision | Verdict |
|---|---|---|
| 20 | **Project display** | **A plaza of monoliths**, one per project — not the reference's carousel. Deletes ~570 lines of carousel machinery because driving becomes the navigation. |
| 21 | **Plaza layout** | **Procedural from `projects.length`**, the way the reference's `SocialArea` lays links on an arc. The plaza *floor* is authored art; the monoliths are placed by code. **Sized for 8, ~~starting at 4~~ starting at 3** — the open-world entry was deferred on 19 Aug (see *Outstanding input*). Nothing in the layout code cares; that is the point of deriving it from `.length`. Worth knowing when the plaza floor is authored, though: three monoliths on an arc sized for eight will read sparse, so author the floor for what is there and let it grow outward. |
| 22 | **Adding a project later** | Append an entry to `projects.js` (~30 min, all prose) and run 2–3 images through the compress script (~5 min). **No Blender, no code.** Achievement totals derive from `.length`; the versioned save validates its shape and resets on drift. |
| 23 | **Areas** | **Six** — landing, projects, career, about, contact, playground. Playground is the designated cut if Phase 3 runs long. |
| 24 | **Career area** | **Corridor, not kiosk.** 375 lines for a better reading experience than the reference's 1,555-line kiosk: position-driven, no UI, no state, works while moving. Steal "one year per world unit". **Scope raised 30 Aug on Michael's enthusiasm** (*"i really like his career and education timeline animation"*): the port takes the reference's whole motion package, not just the layout — slabs that rise and slide alongside the car for the length of each entry, the horizontal label wipe, and the vertex-shader 7-segment year counter that tracks beside you (`D` §4.4) — plus the stone-slide in/out sound pair when audio lands (decision 29). And "career **and education**": the corridor's year axis carries both — school entries are just earlier world units on the same drive. **Built 31 Aug**, full motion package, data-driven, proven by the sixth check suite; the `isUp` edge flag waits in `update()` for the sounds. See the *Now* entry. |
| 25 | **Content schema** | **`slug` is identity and is never the display string** — this removes the reference's one systemic data bug. Always-array fields, no string-or-array polymorphism. `blurb` separate from `body`. **No coordinates in content data, ever.** |
| 26 | **Achievements** | **In, ~10**, roughly 60/40 play to content: visit all six areas · read every project (derived) · distance driven ×3 tiers · flip the car · reach the water · one hidden thing · one joke. Tiering is free — one counter drives several rows and gameplay code never knows. |
| 27 | **Whispers / multiplayer** | **Out entirely. Phase 7 is dropped**, hooks and all. It was the only server-side component in an otherwise fully static project. |
| 28 | **`consoleLog.js` + Konami** | Out. |
| 29 | **Audio** | **Synthesis-first**, with one CC0 engine loop as a time-boxed 4-hour escape hatch. **No music.** The argument is licensing and sourcing cost, not payload — the reference's 3.15 MB is affordable, the reference's sample library and four DAW sessions are not, and none of the reference's SFX licences transfer to us. |

### Weather

| # | Decision | Verdict |
|---|---|---|
| 30 | **Rain** | **In.** 2,048 pre-built quads and one `positionNode` — no compute, no per-frame CPU. The cheapest weather that exists. |
| 31 | **Wind** | **In.** One shared `offsetNode(worldXZ)` that every vegetation system reads. |
| 32 | **Grass** | **Unlocked by wind, not budgeted.** 78,400 blades in one draw call, a further 8–12 h. Documented as available. |
| 33 | **Snow, lightning, tornado, ice** | **Out.** `Snow.js` alone is 65,536 quads plus a full 257² render-target pass every frame — the reference's single most expensive system. |

### Pipeline and delivery

| # | Decision | Verdict |
|---|---|---|
| 34 | **Art sourcing** | ~~**Hybrid.** CC0 kits (Kenney, Quaternius) for filler props; **hand-model the ~6–8 hero pieces**; terrain procedural. Plus a budgeted **8 h Blender ramp**.~~ **Superseded 30 Aug by decision 47** — everything is found and credited, nothing is hand-modeled, and the palette pass is a script. Terrain stays procedural. |
| 35 | **Why not generated** | Meshy and similar generate *textured* meshes; this style deletes the texture and re-UVs onto a palette band, so generation adds a cleanup step and saves nothing. Fused single-mesh output is also the worst case for palette assignment. |
| 36 | **Why Blender is a smaller ask than it looks** | The assets are boxes, cylinders and extrusions — the reference's bricks are 56 verts, seven benches are 252 verts total. **No sculpting, no retopology, no rigging, and no texture painting at all**, because everything is flat palette colour. Unity experience already covers scene graphs, transforms, instancing, colliders and import scale. |
| 37 | **Palette assignment** | **Baked in Blender for all authored art; procedural `paint()` for code-generated geometry.** One path per origin — the rule is "did Blender make it". Baking costs 5–15 min per asset but buys WYSIWYG palette colours in the viewport, natural multi-colour meshes, and verbatim transfer of everything in report `F`. **Amended by 47:** for found assets the bake is a script, not a Blender session — the rule generalises to "was it authored" (retint tool) vs "was it generated in code" (`paint()`). The output contract is identical: palette UVs and a material named `palette`. |
| 38 | **Terrain collision** | **Rapier heightfield**, plus a kinematic bedrock cuboid near the boundary. Settled by evidence, not preference — see the correction above. |
| 39 | **Rendering block timing** | **Opens Phase 2**, before the content model. You cannot judge whether a monolith reads while the scene is lit through an inverted-normal bug with light values that were tuned chasing it. |
| 40 | **Fast-travel map** | **Moved from Phase 5 to end of Phase 3.** A static top-down image with DOM pins reusing spawn points — no GPU cost — and the single best rescue for anyone lost. It also needs an authored image, which is art, which is Phase 3. |
| 41 | **Touch** | **Real-device test moves to end of Phase 3**; the full touch implementation stays in Phase 5. The Risks table already said this and the phase plan contradicted it. |
| 42 | **Domain** | **Own name** — `michaelyeh.dev` / `.com` — with "Drive around my work" as the `<title>` and OG description. Exact string still to confirm. |

### Second pass, same day

Three that surfaced once the first forty-two were written down. Numbered after them
rather than filed into their groups, because `KNOWN-ISSUES.md` and the artifact both
cite the earlier numbers.

| # | Decision | Verdict |
|---|---|---|
| 43 | **Driving into the water** | **Built 19 Aug; the reference's build has no equivalent at all.** A drivable shallow shelf, then a fade and a respawn at the nearest point. As shipped: **2.0 units of drag-free water** past the waterline, drag ramping to full over the next 5.8, the drowning line at **7.8 units / 1.0 of depth**, and about **12 units in practice** because the 0.35 s hold carries you on at speed. Widened from 4.66 after Michael drove it — the depth is capped at 1.2 by `surfaceElevation` and `depthElevation`, so the only lever is horizontal. The fade doubles as cover for the respawn snap, as the reference's overlay does (`Player.js:471-487`). |
| 44 | ~~**What a monolith is**~~ **Superseded 19 Aug** | Was: *a standing slab with a recessed face, image inset into the carving.* Built, looked at, and rejected by Michael — *"i dont like the UI of the monoliths"*. **It is now a wide 16:9 board on two posts with a title plate above it**, which is the reference's composition rather than an invention. The recessed face and the reasoning behind it survive; the silhouette does not. See the correction below. |
| 45 | **The day-cycle colour palette** | **Answered 19 Aug: A, the reference's values, kept.** The gate ran as specified — four candidates against four phases, judged on the running build. Michael: *"I like A, lets just go with that."* Adopting his *mechanism* was decision 11; adopting his *colours* was a separate call, and it has now actually been asked and answered rather than defaulted into. B, C and D stay in `src/cycles/palettes.js` for the one re-judge that is scheduled — see *The 2a colour gate*. |
| 46 | **Land relief** | **Settled 20 Aug: there is none — every land vertex is exactly 0, as every one of the reference's is.** Not a look call: it was forced by measurement. `View.update` pins the camera focus point to y = 0, so with 1.5 units of relief the car sat anywhere in an 0.18 band of half-frame depending only on where it had stopped, which is the defect Michael reported as a camera fault. Flat land pins it to a constant 0.1442 — spread exactly zero over 589 points, and confirmed on the reference's own 52-second drive. It also drops the plaza 1.3 units down the frame for free, which is decision 44's lever. Reverses nothing in decision 17; it *completes* it. `KNOWN-ISSUES.md` 19. |

**Correction to 44, 19 August — the camera sets a hard ceiling on how tall a readable
object can be, and it is much lower than anyone guessed.** The slab was designed at
3.2 × 4.6. Measured on the running build, a 4.6-tall slab is clipped by the top of the
frame at *every* distance you would stop at, and the first plaza shipped three stubs:
standing on the area's spawn, all three bases sat at ny 0.78–0.85 against an edge at
1.0, with tops at 1.33–1.39.

The cause is decision 15 working exactly as designed. No vertical follow and no
look-ahead means the camera is pinned to the car with a fixed offset, so **ground
distance ahead of the car runs off the top of the frame fast** — 4 units ahead is
already at ny 0.46, 11 at 0.85, and past 13 the *base* of an object is off screen:

| ahead | 4 | 5 | 6 | 8 | 10 | 11 | 13 | 16 |
|---|---|---|---|---|---|---|---|---|
| screen ny | 0.46 | 0.53 | 0.59 | 0.70 | 0.80 | 0.85 | 0.94 | 1.07 |

Which inverts the intuition that mattered: **moving a monolith further away makes it
*less* visible, not more.** The ceiling on a readable object is about **3.2** at the far
edge of the beacon's range.

**Then Michael looked at the result and rejected it** — *"i dont like the UI of the
monoliths"* — which sent us to the reference's repo, and the reference's repo settles the shape. The reference's projects
display is **not a monolith**: it is a wall-mounted board inside the forge. The geometry
is authored in Blender so `ProjectsArea.js` never states it; it had to be pulled out of
`static/areas/areas.glb` by reading the glTF accessor bounds. The reference's composition:

| the reference's element | true size | sits at |
|---|---|---|
| image board | **4.0 × 2.25** | y 0.70 → 2.95 |
| thin strip | 4.0 × 0.2 | y 2.95 → 3.15 |
| title plate | 4.0 × 0.6 | y 3.13 → 3.73 |
| the forge around it | 6.94 × 4.29 × 6.29 | y −0.03 → 4.26 |

**The reference's readable surface is 16:9 to three decimals** — 4.0 / 2.25 = 1.778, against the
1920 × 1080 `setImages` loads. That is the part that was not a taste call at all: a
square recess letterboxes every screenshot into a third of the space it deserves.

**Two independent confirmations that the height ceiling is real** rather than an artefact
of our build: the reference's readable image tops out at **2.95**, and the reference's interact point sits **5.9
units in front of the board** — both landed on before any of the reference's geometry had been read.

**Where we cannot follow the reference author.** The reference's full stack is 3.73 tall, which our camera cannot hold.
The reference author affords it because pressing interact **cuts to a cinematic camera**
(`ProjectsArea.js:1296-1358`), so the reference's driving camera never has to frame the kiosk at all.
Decision 20 deleted the kiosk pattern and §6.9 defers the cinematic camera, so ours is
the reference's composition compressed to end at **3.23**: 3.36 × 1.89 image, 0.22 border, floating
0.45 clear of the ground on two posts, title plate above. Measured on the running build,
the whole thing frames at every standoff the beacon is live (2.5 → 5.5) and clips only at
6.5, where the beacon has already gone.

**The lever that buys the height back is lowering the ground, not raising the ceiling.**
A sunken plaza floor drops the base down the frame and returns every unit of it — and
decision 21 already makes the plaza floor authored terrain, so it is in the right hands
for Phase 3. Worth knowing before any other area authors something tall.

**Note on 43, added 19 August after driving the reference's build.** I drove straight out into
open water and kept driving for **more than eight seconds** with no fade and no
respawn, far enough that the island was out of frame. So the "past a depth threshold
you fade out and respawn" half of this decision is **ours, not observed behaviour** —
I did not find the reference's threshold, and I cannot say from one run that none exists, only
that it is not where we assumed. Build 43 as a design of our own and judge it on its
own merits.

> **Settled 19 August: none exists.** Driven and source-checked. The reference's water is not
> lethal, there is no depth threshold anywhere in the reference's build, and there is no
> out-of-world catch either — full throttle off the beach runs five hundred units out
> to sea at a constant 5.45 m/s, all four wheels on the bedrock, indefinitely. The
> only automatic recovery in the reference's build is the *stuck* detector, and you are not stuck
> while you are moving. So decision 43 is entirely ours, which also means nothing about
> it can be checked against the reference author and all of it has to be judged by feel.
>
> **Reversed 20 August — decision 43 is withdrawn and nothing drowns.** Michael,
> after being shown that carving rivers would put a lethal line in the middle of
> the island: *"I do like that the reference author could drive 'forever' on the deep waters too,
> how did the reference author manage that? if we do that it could fix the issue of accidentally
> drowning in the rivers?"* It does, and the fact underneath it had never been
> written down: **there is no deep water anywhere, in either build.**
> `WATER_SURFACE` is −0.3, `WATER_FLOOR` is −1.5, and the reference's decoded heightfield
> runs `y −1.500 .. 0.000` and never lower. The whole ocean is **1.2 units deep**
> over a floor that is either the height field or the follower bedrock, against a
> car ride height of 1.135. Driving out to sea was always wading, never swimming —
> so drowning was never a physical consequence, it was a scripted fade on a depth
> the car cannot sink into.
>
> What is kept is the half that was always the reference's: the drag ramp. Water still holds
> you and still roughly halves your speed. Recovery is now the **stuck detector**
> plus the manual respawn, which is exactly the reference's set. Verified on the running
> build: the car drove from inland, across the trunk river, into the sea and out
> to z = −184 with `_respawning` never once true, resting at y −0.364 the whole
> way — the bedrock's top face plus its clearance.
>
> **The reference's stuck detector is now ported properly, and ours had been wrong.**
> `PhysicsVehicle.stuck` accumulates **path length** over a rolling
> `durationTest` of 3 s against a `distanceThreshold` of 0.5. Ours summed
> straight-line *displacement* from 3 s ago against 1.2 — which calls a car
> driving tight circles "stuck". Measured: a car circling at radius 1, one
> revolution per 3 s, has a displacement of **0** and a path length of **6.28**.
> The old measure would have teleported it. And **the reference author does not auto-rescue** —
> `Player.setUnstuck` adds an `unstuck` *button* and waits to be pressed — so
> ours offers "press R" through `#hint` rather than snatching the car back from
> someone who parked to read a board.

Two things about the reference's water that *are* observed and worth keeping:

- **The shallow shelf is real, and it is 6.75 units wide.** Its definition was read off
  the reference's live build — `water.surfaceElevation = -0.3` against `water.depthElevation =
  -1.5`, so the shelf is simply wherever the terrain sits between those two heights, a
  1.2-unit vertical band rather than a separate mesh or an authored polygon. **The
  width was then measured** two independent ways that agree to 0.02: 6.75 units at the
  median, p10 4.05, p90 10.5, a 10° slope. The earlier read of "easily a tenth of the
  island's width" was of the rendered teal band and overstates the physical shelf by
  two to three times. Half the reference's waterline never reaches full depth at all.
- **The horizon does not exist.** Out on open water there is no seam anywhere — the
  water gradient runs into the fog and the fog into the sky, one continuous ramp.
  This is the single best argument for decision 1 and for doing *Fog == sky* before
  the world shape, and it is far more convincing seen than described.

### Third pass — 30 August

One decision, and it reshapes the largest remaining block of work.

| # | Decision | Verdict |
|---|---|---|
| 47 | **Art sourcing, revised** | **Hand-modeling is out entirely.** Every asset is found — CC0 or CC-BY, credited — and **auto-retinted onto the palette by a script**, not by hand in Blender. Michael, 30 Aug: *"i'm willing to use art and models i find and then just give credit to them, because i'm not a designer and thats not what my portfolio is for."* |

**What it supersedes and what it does not.** Decision 34's hybrid ("CC0 kits for
filler, hand-model the ~6–8 hero pieces") loses its second half: hero pieces are
sourced too, chosen rather than made. The 8 h Blender ramp shrinks to whatever
touch-up an individual asset forces — scale, origin, deleting a part — because
nothing is modeled from scratch and the palette pass is no longer manual. What it
does **not** touch is the look: decisions 8, 13 and 14 stand, the world stays flat
palette colour, and found models get their colours snapped onto the palette bands
before they ship. The two options considered and declined: using assets as-is
(their PBR textures fight the toon material, the no-tone-mapping exposure and the
fog-in-material design — the world would read as a mix of styles under lighting
built for exactly one), and a hybrid where hero pieces keep their original look
(same problem, fewer instances).

**Licensing is CC0 + CC-BY and no further.** CC0 carries no obligation; CC-BY
requires attribution, which a credits surface satisfies — so a **credits panel in
the site plus `CREDITS.md` in the repo** are now part of Phase 3's definition of
done, and the tracking file exists from today so the first downloaded asset has
somewhere to be recorded. Licences with NC or custom terms are out: the deployed
site redistributes the files, and per-asset terms-lawyering is exactly the kind of
cost this decision exists to delete. The pool is Kenney, Quaternius, Poly Pizza,
and Sketchfab's CC-licensed downloads — the first two already flat-coloured
low-poly, which is why the retint is cheap for them.

**Why decision 35 does not block this.** Its argument — "generation adds a cleanup
step and saves nothing" — was about *generated textured* meshes, where the texture
is the whole output and deleting it deletes the value. Found kit assets are the
opposite case: flat-coloured, palette-friendly geometry where the "cleanup" is a
colour-space nearest-band mapping a script can do. Which is the second half of the
decision: **the 5–15 min/asset manual palette pass (the 3–7 h note under *Two
notes that will otherwise bite*) becomes a batch tool** — read a GLB, map each
material/vertex colour to its nearest palette band, emit UVs onto `palette`, name
the material `palette` so the registry swaps it at load. The pipeline downstream
(loader, registry, `^ref` naming, physics seam, compress) needs no change at all;
it never cared where a GLB came from.

**What this buys and what it costs.** It deletes the two riskiest line items in
Phase 3 — the Blender ramp and hero-piece modeling — and converts a recurring
per-asset craft cost into a one-off tool. The cost is curation: assets must be
*chosen* to sit together (consistent poly density, one silhouette language), and
the retint script is new work (~a session, testable headlessly like everything
else in the pipeline). Net it is a large reduction in both hours and schedule
risk, bought at the price of a credits obligation and a style ceiling — the world
can only look as coherent as its curation.

### The 2a colour gate

Decision 45 is only meaningful if it is specified, so it is.

**Why the reference's colours are not automatically ours.** The cycle drives five colour properties
together — sky top, sky horizon, light, shadow and rim. The reference's are `#00ffff → #9b89ff` by
day, `#ff4ce4` at dusk, `#10266f → #490a42` at night, with `#3240ff` light and `#6d3fff`
shadows. Cyan-to-lavender days, magenta dusks, purple rather than dark shadows. Take the
truck away and that palette is most of what people recognise as the reference's site. It would sit
over an island of moss, slate, sand and amber — a real style (warm earthy ground, cold
synthetic sky), but one nobody has chosen.

**What has to exist for the gate to work** — ~~add to Phase 2a scope~~ **built
19 Aug**, with step 6:

- ~~**A pinnable cycle phase.**~~ Both halves, as the reference's has both. `#day=0.25` in the
  hash is the reference's `VITE_DAY_CYCLE_PROGRESS` — a boot-time pin, needed for
  photographing the intro's rim at a fixed phase. `dayCycles.override` is the live
  one, `{ progress, strength }`, blended rather than snapped, and it is what the
  gate actually uses.
- ~~**A swappable keyframe set.**~~ `src/cycles/palettes.js`, four named exports
  and a registry. `dayCycles.setPalette('c')` swaps them live, and the property
  objects survive the swap so every cached uniform keeps working.
- **And a way to look at them**, which the original list forgot: `src/debug/ColorGate.js`,
  behind `#gate`. `1`–`4` pin a phase, `0` releases, `Q`/`E` step candidates, `G`
  shoots all sixteen into a labelled contact sheet. It splits into its own 4.5 kB
  chunk, so the shipped bundle carries none of it.

**The deliverable:** four candidate palettes × four phases (day, dusk, night, dawn) =
sixteen renders, side by side. ~~Sketch directions only, to be replaced by real ones~~
— **authored 19 Aug**:

| | Direction | As built |
|---|---|---|
| A | **The reference's**, as the control | Verbatim, logged in `reference/README.md`. Cyan-to-lavender day, magenta dusk, `#10266f → #490a42` night, purple shadows |
| B | **Naturalistic** — real sky blues, warm sun, blue-grey shadows. Safest; risks generic | `#bfe3f5 → #4a86d8` day, moonlit `#a9c0f0` night |
| C | **Cold and graphic** — desaturated slate days, teal nights, near-black shadows, leaning on the amber we already have | Slate `#dbe4e7 → #8fa3ad` day, `#0d3b3f` teal night, amber rim throughout, shadow ratio 0.08 |
| D | **Warm into deep** — ochre and rose days falling into deep green nights | Ochre-and-rose `#ffcf8f → #e8829a` day, `#0f3a30` night. The only candidate that never goes blue |

**Three numbers are held constant across B, C and D so the sixteen differ in hue and
nothing else** — a candidate that lost because it was a third of a stop darker would
tell us nothing. Light intensity is derived by `KNOWN-ISSUES.md` 9's rule
(`1.02 / mean(linear(lightColor))`, which reproduces the shipped 1.2 to 1.196), night
sits at 0.45 of full exposure, and the shadow/lit luminance ratio is the shipped
0.205 — except in C, where near-black shadow *is* the direction. Rim intensity is
normalised so the brightest channel peaks at 5.5, which is what the shipped amber
rim does. **The fog ratios are the reference's measured set in all four**, because they control
fog *distance* rather than colour and varying them would change how much of the
frame is sky at all.

### The verdict, 19 August

**A. The reference's palette, kept.** Michael, having seen all sixteen: *"I like A, lets just go
with that, i think it might be too dark in some areas but its because we dont have
any glowing objects like the reference author does right now. no need to adjust we can do that later
when we have decorations."*

Three things that follow, and they are worth separating because they are three
different kinds of thing.

**The choice is made, not defaulted into.** That was the entire point of decision 45:
the reference's colours shipped as scaffolding from the start, so the risk was never that we
would be unlit, it was that we would arrive at Phase 3 having never asked. The
question got asked against sixteen renders of our own island and the answer is the reference's
palette. It does mean the site's *sky* is recognisably the reference's, which the section above
argued in front of the decision rather than after it — and decision 13 already says
where our own identity comes from instead: the rim, the night lamps and the emissive
props, none of which exist yet.

**The reference's diagnosis is correct, and measurable.** "Too dark in some areas because we
don't have any glowing objects" is exactly right, and tighter than it sounds:
**palette entry 12, `#ffb454`, the one entry actually named "emissive amber", is
used by nothing in the world.** `Island.js` paints props from `accentWarm`
(`#e4703a`) and `accentCool` (`#3fa9a0`), and under the reference's day light the brightest
thing anywhere lands at **0.93** — under the bloom threshold of 1. So in daylight
*nothing blooms at all* once the intro's rim is gone, and the bloom pass is
currently doing nothing for four minutes at a time. At night it is the opposite:
the reference's `#3240ff` at 3.8 puts pale surfaces at 2.1–3.4, so the reference's night already glows and
the daylight does not. The missing thing is authored light sources, not exposure.

**So the brightness question is scheduled, not open.** See *Scheduled, not open*.
Do not spend anything on it before there is something in the world that glows —
tuning exposure against a world with no emissives means tuning it twice, which is
the same mistake decision 39 exists to prevent.

**Judged on placeholder geometry, deliberately.** The props are still cubes at that point,
but the call is sky and shadow colour against ground colour and water, and the ground
colour is already real. Waiting for Phase 3 art would mean tuning the lighting twice,
which is the exact thing putting committed lighting in 2a was meant to prevent.

### Settled without asking

Technical ports where the research left no real judgement call. Recorded so they are
not re-litigated, and so nobody has to rediscover why.

| Port | From | Note |
|---|---|---|
| Cube-camera warm-up replaces the 1×1 render | `A` §3.5 | 32 px, six faces. Keep our `await` and timeout; add the reference's `quality.level === 0 && isWebGPUBackend` gate. |
| `renderer.setAnimationLoop` drives the ticker | `A` §6 | Guarantees the clock and the swap chain are the same callback; XR/offscreen correctness free. |
| Sparse-array `Events` | `A` §6 | O(1) insert, no sort on every `on()`. Keep our copy-on-emit safety by copying only the inner bucket. |
| 30-sample delta smoothing into the vehicle | `A` §6 | Stops one hitched frame kicking the suspension. |
| `antialias: pixelRatio < 2` | `A` §6 | MSAA on a DPR-2 display buys almost nothing. |
| `throttleChange` resize event, 400 ms debounce | `A` §3.4 | Needed before we allocate render targets on resize. |
| Rapier `-compat` → real package + `vite-plugin-wasm` | `A` §6 | `-compat` inflates the JS bundle by the whole WASM payload and blocks parsing. |
| Two resource phases, Rapier `import()` parallelised | `A` §3.8 | Free today, essential once GLBs land. |
| Quality tiers: 2 levels, UA sniff, user-overridable | `A` §3.7 | Live-swappable things subscribe to `change`; the rest read once in a constructor. The reference author does not pretend the toggle is fully live. |
| Static HTML UI driven by `<html>` classes | `A` §3.1 | Zero JS cost, crawlable. Generalise our `input-{mode}` to game state. |
| Hash-flag debug (`#debug` / `#stats` / `#skip`) | `A` §3.9 | Adopt the pattern; do **not** adopt shipping Tweakpane to production as the reference author does. |
| Bracket every offscreen render | `A` §3.9 | `RendererUtils.reset/restoreRendererState`. Needed the first time we bake anything. |
| Camera: `focusPoint` indirection | `C` §6.7 | A first-class object that can be detached, dragged and driven by cinematics. Ours looks directly at the car, so we have no seam to insert panning or fast-travel previews later. |
| ~~Camera: separate slower filter for Y~~ **dropped** | `C` §6.7 | Superseded by decision 15, which takes X/Z follow only. The camera has no Y term at all — `focusPoint.position.y` is 0 and never written — and `KNOWN-ISSUES.md` 12 flattened the terrain to suit rather than filtering the relief away. |
| Camera: spring stiffness | measured | **ω 20, acceleration ceiling 300.** Not `C` §6.7's ω 5, which trails 4.7× further than the reference's lerp and loses the car off-screen. Match on **steady-state trail** (`2v/ω = v/k` ⟹ ω = 2k), never on settling time. See `KNOWN-ISSUES.md` 13a. |
| Camera: aspect-ratio pull-back | `C` §6.7 | ~8 lines, and the difference between a usable and unusable portrait phone. |
| Camera: roll spring as impact shake | `C` §6.7 | ω 20, damping 8 against a plain delta. Random sign, kicked on hard collisions. **Not** a corner bank — that does not exist in the reference's code. |
| Mass-0 oversized bumper on its own collision group | `C` §2.6 | An inflated shell that hits props but passes through the floor. |
| Luminance-normalised emissives | `B` §3.5 | `color.div(luminance(color)).mul(intensity)` so hue never changes bloom behaviour. |
| Materials registry keyed on Blender material name | `B` §12 | ~40 lines, before the first GLB, or it is a rewrite. |
| `getStartingWith` on the reference parser | `A` §7 | Adopt with the regex, not after. |
| Dev assertion on every `^ref` near-miss | `F` §9 | Logs any node matching `^ref` that fails the full regex. One line, prevents the whole class of silent-disappearance bug the reference author has. |
| Ring-buffer spawner | `D` §7 | For anything a visitor can spawn. Unbounded `objects.add()` in a callback is how a physics site dies. |
| Deep-link scheme `?at=<area>&p=<slug>` | ours | Slug-keyed, so a new project needs no registration. |
| `sortObjects = false` + explicit `renderOrder` | `A` §6 | Premature at 23 draw calls. Revisit at hundreds. |

### Two notes that will otherwise bite

- ~~**The placement coordinates in `D` §6.6 are for a 300-unit world.**~~ **Bit, and
  bit twice, 19 Aug.** That example puts areas at `[95, -40]` and `[-100, -55]` — a
  200-unit span. Rescaling by 0.5 is *not* enough: `[47.5, -20]` is radius 51.7 against
  a beach radius of ~51 on that bearing, i.e. the projects area lands on the waterline.
  The plaza centre was swept over the real height field instead and is `[28, 18]`.

  **The second bite was in our own code.** `Area.js` took `buildAhead ?? 45` straight
  from `D` §6.2, and on a 150-unit island 45 units past a 27-unit radius reaches most
  of the landmass — lazy building stops being lazy. `ProjectsArea` derives 20 instead.
  The lesson generalises past coordinates: **any distance constant copied out of `D`
  is in 300-unit money**, including radii, and the two that were caught were caught by
  measuring rather than by reading. Check the rest as each area lands.
- ~~**The palette-UV pass is a recurring per-asset cost, not a one-off.** Budget 5–15
  minutes per authored asset. At roughly 30 prop types that is **3–7 h inside Phase 3** —
  it does not disappear because an asset came from a kit, and it is the reason the
  4-pixel band width matters.~~ **Retired 30 Aug by decision 47** — the pass becomes a
  batch retint tool, so the recurring cost is one script run per asset instead of a
  Blender session. The 4-pixel band width still matters; it is now what gives the
  script its snap tolerance.

---

## The plan

Five phases. Each ends with something you could show a person. Estimates are in
**focused hours**, anchored to the research: kairui.dev measured out at 250–450
focused hours, and the reference author's published figure for the reference's 2019 site was three months of
evenings.

---

### Phase 2a — World model and rendering · 30–42 h

**Goal:** the island exists, in water, correctly lit, seen through the right
camera. No content yet.

**Status, 19 Aug: done, all seven blocks.** The island is a 150-unit height field in
infinite water with a shore you can drive into and drown in, lit by a flat toon
material under a fog that *is* the sky, framed by a fixed diorama camera that matches
the reference's trail to 0.1 %, introduced by a four-second cinematic that deletes its own
scaffolding, and moving through a 240-second epoch-synced day whose palette has now
been chosen rather than inherited.

- ~~**Fix the normal flip.**~~ **Done 19 Aug — by deleting it, not adding it.** three
  r0.185.1 already flips the normal for back faces (`negateOnBackSide` on
  `normalWorld`); porting the reference's explicit flip double-flips and *causes* the bug.
  Measured both ways. `KNOWN-ISSUES.md` #1 has the numbers. This also retracts the
  claim that it was why the scene read dark.
- ~~**Bloom**~~ **done 19 Aug.** From the linear pass, threshold 1, strength 0.25,
  5 mips. Note that "added after `renderOutput`" describes the reference's source text, not the reference's
  maths — the reference's inner `renderOutput` is inert, so bloom is summed in linear space.
- ~~**Flat toon material**~~ **done 19 Aug**; `MeshStandardNodeMaterial` and the
  `HemisphereLight` are gone. The reference's core-shadow ramp had to be rewritten rising and
  inverted — chained, the reference's is a falling `smoothstep` and compiles to zero on WGSL.
- ~~**Remove tone mapping**~~ **done 19 Aug**, and intensities re-derived: light
  `#fff0d8` at **1.2**, shadow tint `#6b7fb8`. The 1.2 is derived, not copied —
  `lightColor_linear x 1.2` averages 1.02, so a lit surface reproduces its palette
  colour and the brightest entry sits just under the bloom threshold. The shadow
  tint is provisional and belongs to the colour gate below.
- ~~**Fog == sky.**~~ **Done 19 Aug** — `render/Sky.js`. One colour node assigned to
  `scene.backgroundNode` *and* used as the fog target in the content material, so the
  two can never drift. Fog distances are **derived from the camera**, not authored:
  `View.updateOptimalArea()` raycasts NDC (0,-1) and (0,+1) onto the ground plane from
  a probe at `radiusMax x 1.4` = 42, giving a visible-ground band of **32.44 / 63.85**
  — the reference's numbers to the digit, because decisions 15 and 18 already took the reference's phi, lens
  and radius. Fog is then placed as a *fraction* of that band, which makes it
  independent of aspect and FOV. **A hard terrain edge is still visible** and that is
  not a fog bug: fog is only 73.3 % saturated where our plate stops, and the reference's has the
  same 73 % — the reference author has no seam because the reference's water carries on past the island. Step 5
  closes it.
- ~~**Water.**~~ **Done 19 Aug** — `world/Water.js` holds the three uniforms and a
  400-unit quad that follows the camera's focus point on a snapped grid, which is
  what makes the sea infinite rather than merely large. Its depth comes from
  **sampling the terrain height field**, not from screen-space depth, so the drawn
  shoreline and the driven shoreline are one line. The waterline whitening is the reference's
  four nodes verbatim in shape (`MeshDefaultMaterial.js:92-97`): anything within
  `surfaceThickness` of the surface elevation is painted white, on the albedo as well
  as the lit colour so the band survives into shadow.
- ~~**`Cycles` + `DayCycles` + `YearCycles`.**~~ **Done 19 Aug** — `src/cycles/`.
  `Date.now()/1000/duration` against the UTC epoch, keyframes with wrap injection,
  `smoothstep` interpolation. The day cycle carries nine properties into five
  destinations: both ends of the sky ramp and both fog ratios to `Sky`, light
  colour, intensity and shadow tint to `Lighting`, and the rim's colour and
  intensity pumped by `Intro` — which takes the pump off in `destroy()`, because
  once the radius snaps to 1e5 the seam is outside the far plane and nothing reads
  those two uniforms again. The year cycle carries five scalars and no colour, and
  **nothing consumes it yet**, deliberately: foliage, rain and wind are Phase 3,
  and writing it now is what stops the no-colour correction to decision 12 being
  re-litigated then.
- ~~**Reveal → intro cinematic.**~~ **Done 19 Aug** — `render/Intro.js`. Three steps
  over four seconds: a 4.2-unit disc of ground arrives under the car with the camera
  pushed in (`baseRatio` 0.6 → 0.3), then it is flung out to 30 with the camera pulling
  back to 0, then the radius snaps to 1e5 and the void grid is destroyed. `Game._grow()`
  and the whole growth state are gone with it (decision 5). Rim narrowed 2.4 → **0.12**,
  closing `KNOWN-ISSUES.md` 2.
- ~~**Camera rework.**~~ **done 19 Aug.** `world/View.js`: phi 0.31π, theta 0.25π,
  FOV 25°, radius 15–30, aspect pull-back, `focusPoint` indirection, roll shake at
  ω 20 / damping 8. Rotation and vertical follow deleted; `ChaseCamera.js` is gone.
  The speed edges on the pull-back are the one number that is ours — the reference's 5–40 keys
  off a boost we do not have. Issues 8 and 12 landed with it.
- ~~**Terrain heightfield** plus the kinematic bedrock boundary, and the drivable shore
  shelf with its depth threshold and respawn fade (decision 43).~~ **Done 19 Aug.**
  `world/Terrain.js` is one 101 × 101 grid at the reference's cell size of 1.5, and the render
  mesh, the Rapier heightfield, the prop placement and the water's depth all read it —
  so the three-surfaces-that-nearly-agree problem is gone rather than reduced.
  `world/Bedrock.js` is the reference's follower floor, verified out to x = 300. Decision 43 is
  `Car.updateWater` plus `Game._drown` plus `core/Veil.js`.
- ~~**Time scale + the retuning patch**~~ **done 19 Aug.** `world.timestep` 1/30 per
  1/60 of wall clock with `vehicleDt` unscaled, and `C` §5.2 rows 1–16 applied, row 13
  last. Plus one row the table omits — the reference's linear damping of 0.1, without which the
  soft limiter sets no top speed at all. Row 17 deferred by decision 19; row 18 skipped
  because its premise (dynamic props) is not true of our world yet.
- ~~**A pinnable cycle phase and a swappable keyframe set**~~ **done 19 Aug**, both
  halves as the reference author has both: `#day=0.25` in the hash for the boot-time pin and a live
  `dayCycles.override = { progress, strength }` the console can write. Ours takes
  the **short way round the clock** where the reference's lerps the raw scalar — identical at
  strength 1, but a fade from 0.95 to 0.05 crosses the seam instead of running
  backwards through the afternoon.

#### The order the rest of 2a goes in

Worked out 19 Aug after the shading block landed. The remaining items are **not**
independent, and the list above is not the order — record this so it is not
re-derived every session.

| # | Block | Why here |
|---|---|---|
| ~~1~~ ✅ | **Time scale + retuning patch** (`C` §5.2) | The only item that depends on nothing. Do it *before* the camera: the camera follows the car and decision 15 keeps our spring as the X/Z filter, so tune that filter once against the car's final feel instead of twice. |
| ~~2~~ ✅ | **Camera rework** | Decision 16 — the world is authored for exactly one viewing angle. Authoring the 150-unit island, its shoreline or its prop placement before the camera is fixed means authoring against an angle about to be thrown away. Also the biggest perceptual gap left. Brings issues 8 and 12 with it. |
| ~~3~~ ✅ | **Fog == sky** (`render/Sky.js`) | Cheap, and it is the prerequisite for both of the next two. Also the only way the provisional shadow tint becomes judgeable — a blue shadow reads as deliberate against a blue sky and as a mistake against a black void. |
| ~~4~~ ✅ | **Reveal → intro cinematic** | Cannot destroy the void grid until fog replaces it as the backdrop, so it must follow 3. Narrowed the rim to 0.12 and closed issue 2. |
| ~~5~~ ✅ | **World shape** — island 300 → 150, terrain heightfield + bedrock, water, shore shelf, waterline whitening | One authored artefact: decision 3 notes terrain, shoreline and water alpha get re-authored together. Superseded the issue 12 stopgap. |
| ~~6~~ ✅ | **`Cycles` + `DayCycles` + `YearCycles`**, pinnable phase, swappable keyframes | The cycle drives sky-top, sky-horizon, light, shadow and rim; three of those do not exist before 3 and 5. Landed 19 Aug in `src/cycles/`, with a `TICK.CYCLES` slot between post-physics and gameplay so the lighting rig reads the cycle in the frame it is written — the reference's ordering (cycles 8, lighting 9). |
| 7 | **The colour gate** (decision 45) | **Built and waiting for Michael.** `#gate` opens it; the four candidates are authored. Needs all of the above — it is photographed through the camera, against the water, at pinned cycle phases. |

~~**Done when:**~~ **Done, 19 August.** You can drive around a correctly-lit island in
water, at 2× time, through the fixed camera, and the colour gate has been run and a
palette chosen (decision 45): **A, the reference's**.

---

### Phase 2b — Vertical slice · 30–42 h

**Goal:** one project, reachable by driving to it, displayed in-world, looking
like the finished thing.

- **Content data model.** `src/content/projects.js`, `roles.js`, `about.js`,
  `links.js` — plain ES modules, slug-keyed, no coordinates, no build step.
- ~~**`Area` + `Areas`**~~ **Done 19 Aug** — `src/world/areas/`, 270 lines, before
  any area exists, which is the whole point: the lazy-build/gated-update split
  cannot be retrofitted without rewriting every area against it. Two radii,
  `buildRadius` and `radius`. Verified on the running build by walking a throwaway
  area past both thresholds: build fires once at d=40 against a build radius of 50
  and is never undone, enter at 15 and leave at 30 against a radius of 20,
  `update()` runs only inside, `goTo()` forces the build and lands the camera on
  the target to the unit, duplicate ids are refused, and a `build()` that throws is
  caught so it cannot abort the frame and freeze the picture.

  **Two corrections to `D` §6.2/§6.3, both noted in the source.** Its `goTo()`
  grows the reveal disc to contain the destination "or the visitor lands inside an
  invisible area" — that was written against the world that grew as you drove, and
  decision 5 deleted it; `reveal.growTo` and `game.growthTarget` do not exist and
  fast travel is now a respawn and nothing else. And its `addProp()` never calls
  `paint()`, so every prop would have sampled palette texel (0, 0): a plaza of
  grass-coloured monoliths. `color` is a required argument in ours.
- ~~**Beacons.**~~ **Done 19 Aug** — `src/world/areas/Beacons.js`, 200 lines against
  the reference's 663, with all three cheap ideas copied verbatim: the 0.2-unit movement gate,
  exactly one active beacon globally, and eligibility gated on the owning area.
  One DOM `<button>` for the single active point, projected from world space, which
  is where the line saving comes from — focus, announcement and clicking are the
  browser's job rather than ours.

  Verified on the running build: **zero** nearest-point searches across 60 parked
  frames and one the moment the car moved 2 units; nearest wins as the car moves
  between two points 4 and 5 units away; a foreign beacon with a 30-unit radius
  sitting 5 units away **never** wins because its area is not the one you are in;
  `KeyE`, `Enter` and a real click each fire the interaction exactly once; and
  `suppress()` hides the prompt, refuses to trigger, and restores the right one.

  **Three things came out of building it that the `D` report does not cover.**
  A focusable `<button>` cannot live inside `#ui`, which is `aria-hidden` — it would
  be reachable by Tab and invisible to a screen reader, so the beacon is a sibling.
  Binding `Enter` to `interact` meant the blanket `preventDefault()` in
  `Input._onKeyDown` had to be narrowed to the keys that actually scroll the page,
  or activating any real control with the keyboard breaks — the card's close button
  next. And a beacon can be in front of the camera and still project far off frame
  (measured at y = 6472 px on a 682 px viewport), which left the button in the tab
  order while invisible; it now hides, and `_project()` owns that half of `hidden`
  while `_render()` owns the other, because the first version read the flag back as
  input and could hide a prompt permanently.
- ~~**One monolith**, with the plaza laid out procedurally from `projects.length`.~~
  **Done 19 Aug** — `src/world/areas/ProjectsArea.js`, ~330 lines of code against the reference's
  1,555, plus `src/content/areas.js` for placement. Constant angular step growing
  **alternately outward from index 0**, so appending a project never moves the
  monoliths already standing — which also means index 0 is the middle one, and
  `aerial-ascent` was moved to the front of `projects.js` to take it. Two draw
  calls for the monoliths at any count, merged per palette colour.

  **Three corrections to `D` §6.7, all found by measuring rather than reading.**
  Its per-monolith `rotationY: -angle + Math.PI * 0.5` aims each slab at the centre
  of its own arc, which is right for an orbiting camera and wrong for ours — every
  monolith is `PI/4`, the one bearing that faces a camera fixed at theta 45°, and
  D's version would turn the end slabs edge-on, exactly the failure decision 44
  picked a recessed slab to avoid. Its arc also re-spaces every monolith when the
  count changes. And its `update()` pulses a per-monolith emissive glow, which needs
  one material per monolith — breaking the shared-material rule the palette rests on
  — and would be the world's first emissive surface, which *Scheduled, not open*
  puts behind authored emissive props. Ours has no `update()` at all.

  Verified on the running build: plaza builds in **9.0 ms** on the first tick, of
  which ~6 is cold JIT (warm rebuild is ~2), and it happens behind the loader
  before `playIntro()`, so nobody sees it. Beacon fires on all three, card opens
  with the right title, Escape restores mode, input, beacons and URL.
- ~~**The card layer.**~~ **Done 19 Aug** — `src/world/areas/Card.js`, 226 lines.
  DOM over the canvas, real `<h2>/<p>/<dl>/<a>` built with `createElement` and
  `textContent`, never `innerHTML`. All four things the reference author omits: `role="dialog"`,
  `aria-modal`, a focus trap and focus restoration, plus Escape. `aria-live="polite"`
  was the fifth on that list and belongs to a notifications layer that does not
  exist — there is nothing to announce yet.
- ~~**Input categories and filters**~~ **Done 20 Aug.** The reference's `Inputs.js:183-236`
  in full: every action declares the modes it is allowed in, `Game.mode` is the
  only thing that writes the filter set, and one call now decides which keys are
  live, whether the car reads them, and whether the interact prompt is on screen.
  **The categories are decided rather than still open:** `driving` carries the
  seven driving actions, `card` carries `close` alone, `intro` carries nothing at
  all, and `cinematic` is declared and empty because `D` §6.9 has not built the
  thing it is for. **Two of the reference's defaults are deliberately not ported** — an empty
  filter set and an action with no categories both fail *open* in the reference's build, so
  ours throws at module load for the second and treats the first as "nothing is
  allowed". See *What 20 August did* for what this closed.
- ~~**Deep links.**~~ **Done 20 Aug.** `?at=<area>&p=<slug>`, both halves. `Area`
  grows two optional hooks — `spawnFor(target)`, which runs during `goTo()` before
  the cinematic, and `openTarget(target)`, which runs after it — and they are two
  hooks rather than one precisely because they fire four seconds apart.
  `ProjectsArea` derives the per-board spawn rather than authoring it, and the
  derivation is checkable: `p=aerial-ascent` comes out bit-identical to the bare
  `?at=projects`.

**Done when:** you can load the site, drive to one project, read it, and send
someone a link that lands on it.

---

### Phase 3 — Content and the art pipeline · 78–113 h ⚠️ the long pole

**Goal:** the real world, with all the real content in it.

> **Reshaped 30 Aug by decision 47.** Nothing is hand-modeled: every asset is
> found (CC0/CC-BY), credited, and retinted onto the palette by a script. The
> items below are amended in place rather than rewritten, because their evidence
> and ordering still hold.

- ~~**8 h Blender ramp**, budgeted explicitly rather than assumed free. Extrude,
  inset, bevel, loop cut, and the UV editor. Nothing else is needed.~~ **Cut by
  decision 47** — reduced to incidental touch-up (scale, origin, deleting a part
  of a found model), learned as needed rather than budgeted.
- ~~**The retint tool** *(new, decision 47)*~~ **Built 30 Aug** —
  `tools/prep-model.mjs`, both paths (colour snap and component rules), proven
  as the fifth `npm run check` suite, and its first asset — Michael's Sketchfab
  lamp — stands in the plaza. See *The retint tool and the first found asset*.
- **The credits surface** *(new, decision 47)*: `CREDITS.md` in the repo from
  day one, and a credits panel in the site before launch. CC-BY attribution is a
  licence obligation, not a courtesy — an asset is recorded when it is
  downloaded, never reconstructed later.
- **Curation replaces modeling as the craft cost.** Assets must sit together —
  one poly-density register, one silhouette language, and every readable face
  authored for the fixed 45° camera (decision 16 now constrains *selection*).
  Hero pieces are the pieces worth the longest search, not the longest session.
- ~~**Blender → runtime pipeline.**~~ **Parsing landed 21 Aug** — `src/pipeline/`,
  validated against all 64 of the reference's GLBs (`npm run check`). The dev-mode assertion
  is in and is tested by being made to fire. **What is still open is the half
  that touches Rapier**: nothing creates a body yet, because `world/Physics.js`
  has no generic add-from-description seam and inventing one with no second
  caller would be guessing. That goes with `ResourcesLoader` in block A.
- ~~**The three-file split**~~ **Landed 21 Aug** as `src/pipeline/split.js`,
  before any art exists, which is the whole point of adopting it early.
- **Asset build step.** glTF-Transform → Draco + KTX2, serial with a per-file skip
  rule. Skip Draco entirely for `*References.glb` — it saves 12 bytes on a
  transform-only file and costs a decoder dependency.
- **The island itself.** 150 units, modest relief, authored for a 45° camera, with
  one lobe left undeveloped.
- **All six areas placed**, all content written in.
- **The emissive layer** — night lamps, glowing signage, and props that actually use
  palette entry 12. Decision 13 puts our whole visual identity here rather than in
  the base palette, and the colour gate's verdict makes it load-bearing for a second
  reason: nothing in the world currently clears the bloom threshold in daylight, so
  the bloom pass is idle for most of the day cycle. `DayCycles` already exposes the
  `night` and `deepNight` intervals the reference's pole lights switch on. **This is also the
  trigger for the scheduled brightness re-judge** — see *Scheduled, not open*.
- **Ambient motion — the fifth thing that makes the reference's world feel alive, and we have
  none of it.** Michael, 20 Aug: *"we do want ambient motion as well as the other
  things you mentioned."* Three pieces, in dependency order, and the whole of it is
  small: **(a)** publish the four time uniforms from `Ticker` — `elapsed`, `delta`
  and their scaled pair, the reference's `Ticker.js:21-24`, about four lines; **(b)** a shared
  `Wind` node in the reference's shape — one function sampling two perlin textures at different
  scroll rates, returning a vec2 any material can add to `positionLocal`, masked by
  height so bases stay planted; **(c)** apply it to the foliage `Island` already
  scatters. See *How the reference's animation works* for the full mechanism inventory and the
  two patterns worth stealing.

  **It is cheaper than art and it is upstream of the CC0 decision**, because a
  swaying tree reads as authored in a way a static one does not — so this is what
  stops bought filler looking like bought filler. Do it before the kit-shopping,
  not after.
- **Instancing pass** via `InstancedGroup` with per-instance dirty flags.
- **The fast-travel map** (moved here from Phase 5).
- **Real-device touch test** (moved here from Phase 5).

**This is where the schedule lives or dies.** The *pipeline* half is materially
de-risked: `F` documents all 23 naming patterns, each verified twice, plus exact
glTF-Transform flags checked against a live CLI install. The target is known — the reference's
entire playable world is **1,446,012 bytes**, the palette is 1,504, the car is
34,824. **What remains risky is art-making, not pipeline-building.**

~~Two levers if it runs long: lean harder on CC0 kits, or cut the playground
area.~~ Decision 47 made the first lever the baseline; the remaining lever is
cutting the playground area, which a visitor never sees missing.

---

### Phase 4 — Game feel · 62–87 h

**Goal:** the difference between a 3D website and something people send to a friend.

- **Audio, fully synthesised.** Copy `Audio.register()`'s API — options object,
  `onPlay` for per-shot randomisation, `onPlaying` for per-tick drivers,
  `antiSpam`, positional fade, named groups with a never-repeat picker — with a
  synthesis backend. **Layer every one-shot 3–4 deep**; the craft lesson from the reference's
  four GarageBand projects is that the reference's best sounds are 3–9 layers. Engine note from
  **throttle, not speed**, with asymmetric easing.
- **Seasons made visible.** Four foliage palettes, per-season light and fog tint,
  falling leaves in autumn.
- **Rain and wind.**
- **Particles and marks.** Dust, tyre marks under braking, an impact puff.
- **Achievements**, ~10, with a versioned shape-validated save that resets on drift.
- **The unstuck prompt.** Detection already runs in `Car.updateStuck()`; it needs
  UI. The single highest-value safeguard on a physics site.
- **The playground toy.** A Blender node plus a predicate plus a reset. The
  upright-vector predicate and the six-call reset are directly portable.

---

### Phase 5 — Reach · 22–37 h

- **Touch controls.** On-screen steering plus auto-throttle.
- **Two quality levels**, user-overridable, dropping passes rather than resolution.
- **`prefers-reduced-motion`** and a keyboard-free route through the content.
- **Flesh out the fallback.** The semantic-HTML résumé in `index.html` is a stub.
  It is what crawlers and every failure mode see.
- **SEO and OG.** JSON-LD, cards, and a self-screenshotting OG image via `?capture=og`.

---

### Phase 6 — Ship · 15–25 h

- Minify, Brotli, `Cache-Control: public, max-age=31536000, immutable` on
  content-hashed assets. All three reference sites got at least one of these wrong.
- Pre-deploy asset audit. Messenger shipped a 434 KB dev UV-checker texture to
  production. Check what we leak.
- Debug GUI compiled to a no-op stub so instrumentation can stay in source.
- Analytics on which projects actually get opened.
- Deploy, custom domain, real-device pass.

---

## Budget

| Phase | Hours |
|---|---|
| 0 · Research | done |
| 1 · Engine foundation | done |
| 2a · World model + rendering | **done** |
| 2b · Vertical slice | 30–42, part spent |
| 3 · Content + pipeline | 78–113 |
| 4 · Game feel | 62–87 |
| 5 · Reach | 22–37 |
| 6 · Ship | 15–25 |
| **Subtotal** | **237–346** |
| Buffer (20%) | 47–69 |
| **Total** | **284–415** |

At 40 h/week that is **7–10 weeks**; at evenings and weekends, **4–6 months**. Two
phases are now off the front of that, and **the totals below have not been reduced by
what 2a actually took** — deliberately, because a budget that is quietly revised down
to match what already happened stops being a forecast.

**Decision 47 (30 Aug) should pull Phase 3 toward the low end of 78–113** — it
deletes the 8 h ramp and the hero-modeling sessions and adds back a ~1-session
retint tool plus curation time. The table is left unrevised on the same principle
as above: it moves when measured against what lands, not when a decision predicts
it will.

**This is up from the previous 240–372, and the reasons are known.** The optional
systems added this session — seasons with autumn leaves, rain, wind — account for
about 25 h. The island/water/fog world model and the camera rework account for
most of the rest, and both were previously unbudgeted rather than free. Phase 7
(20–35 h) was removed entirely.

**Cut levers, in the order I would pull them:**

| Cut | Saves |
|---|---|
| Autumn leaves (keep foliage colour + light tint) | ~6 h |
| Rain | ~7 h |
| Wind | ~9 h |
| The playground area | ~12 h |
| Down to four areas (fold contact into about) | ~20 h |

---

## Outstanding input

**The shape is captured; the prose is not.** `src/content/` now holds four real
modules scaffolded against the settled schema — `projects.js`, `roles.js`,
`about.js`, `links.js`. Slugs are chosen and immutable from here. Everything else
is a `TODO` marker rather than placeholder text, deliberately: a lorem-ipsum about
page has a way of shipping.

> **The project prose landed 30 Aug, images included.** Michael supplied his
> resume bullets and the repos' "Why I built this" sections with the register
> the reference author wanted — *"more product focused and playful instead of it being this
> technical"* (then shortened further, no em-dashes, on the reference's notes) — and both
> `edgeball` and `footnote` are written to it: the denominator rule, the
> laptop GPU, and the sixty declined questions carried over as product
> character rather than spec. The images came from the repos' own docs media
> (`sharp` frame-grabs from the demo GIFs — ffmpeg is blocked by an
> Application Control policy on this machine, `sharp` in node_modules is
> not). **The card also learned to show them**: `Card` takes `images`, lead
> image above the prose and the rest after it, because the in-world board is
> dark and at 45° and the panel is where a screenshot gets to be legible.
> **Still outstanding:** the `knollwood` role line (start date, one-liner,
> stack), the education entry for the corridor (school, degree, years — added
> to scope 30 Aug with decision 24's animation note), and the about text.
> The GitHub/LinkedIn URLs landed 30 Aug; `links.js` is complete.

**What exists**

| Slug | Kind | Have | Need |
|---|---|---|---|
| `edgeball` | project | ✅ **complete 30 Aug** — prose, plus 3 images pulled from the repo's own docs media (a demo-GIF frame, the hero, the evidence page) | — |
| `footnote` | project | ✅ **complete 30 Aug** — prose, plus 2 demo-GIF frames (the answered state, the landing) | — |
| ~~`aerial-ascent`~~ | project | ✅ **complete** — title, blurb, body, year, roles, stack, link, 2 images | — |
| `knollwood` | role | org, title | start date, the one-line description, stack |
| education | role(s) | — | school, degree, years — decision 24's corridor carries education too (Michael's call, 30 Aug) |
| `email` | link | ✅ | — |
| `github` / `linkedin` | link | ✅ **supplied 30 Aug** | — |

> **Answered 20 Aug: it is `Footnote`,** and the slug was renamed from
> `rag-pipeline` to match — the second and last free slug change. The paragraph
> below is kept because the *reasoning* is what made it the one content field that
> could not be deferred.

**`rag-pipeline` had no name** — "a RAG
pipeline" is a description of a thing, not a title that can be carved into a monolith
face. Its board read `(untitled)`, deliberately, and the console named it
every boot.

**`aerial-ascent` is written, 19 Aug — and writing it turned up two things to confirm.**
Michael supplied the itch.io URL, two captures and the shape of the description; the
prose was written against those plus the original design document, which the reference author found on an
old machine. The GDD is structured **Mechanics / Dynamics / Aesthetics** — the MDA
framework — and its Dynamics section is where the good material is: grapple-and-release
to keep momentum, bouncy platforms returning whatever you carry in, enemies used as
grapple targets. Note it is labelled *pre-development planning*, so it records intent
rather than what shipped, and the body leans on page 1's shipped instructions instead.

**Closed the same day.** Michael cut the middle paragraph and the explicit headcount, and
supplied the rest: **Developer · Pixel art, 2024, Unity / C# / WebGL.** So one project is
now complete end to end — the first entry in `projects.js` with nothing left in it.

**One thing to guard.** Cutting the middle paragraph removed the sentence that said "*we*
planned it", so the entire shared credit now rests on the phrase **"the first thing I
*worked on*"**. That is load-bearing: "worked on" does not claim sole authorship, and "I
built" or "I made" would, on a four-person project. It is exactly the sort of change that
looks like copy-polish and is really a factual one. Noted in `projects.js` beside the entry.

Two corrections, both raised rather than silently applied:

- **It was a team of four.** The itch page credits "Ferenc, Aaron, Michael, Matthew" and
  lists three author accounts. Michael's note said "all pixel art drawn", which reads
  either as *I drew it* or as *the art is hand-drawn* — very different claims on a shared
  project. The body says "a four-person project" and claims nothing about who made the
  art; **`roles` is deliberately left empty** rather than guessed, because a portfolio
  that overstates a shared credit is worse than one that is vague.
- **Unity is C#, not C++.** Michael's note said C++. Unity's scripting runtime is C#, and
  C++ only appears in native plugins or engine internals; the published build is HTML5,
  which on Unity means a WebGL export. Recorded as `['Unity', 'C#', 'WebGL']` because a
  technical reader spots "Unity + C++" on a 2D platformer immediately.

**Deferred 19 Aug, with the real deadline written down.** Michael asked whether it is
easier to change later; it is, and the answer has two halves that expire at different
times. The **title** is free to change forever — that is exactly what decision 25's
slug/title split buys, and `projects.js` says so. The **slug** is free only until the
site is public, because after that a change silently resets saved progress and 404s any
pasted deep link. So if the eventual name is not "RAG pipeline", the slug will want to
match it, and **the deadline for the name is launch, not now.** Nothing is blocked in
the meantime — the plaza lays out from `.length` and does not care.

**Both structural questions are answered, 19 August.**

1. ~~**Was game development one project or two?**~~ **One.** The grappling game is
   **Aerial Ascent**, and Michael pulled the open-world entry: *"i think we can defer
   open world for now, lets just keep this one project, its more complete and even
   published on itch.io."* Back to how it was originally given. Three projects, not
   four.
2. ~~**Does `open-world` point at this site?**~~ **Deferred with the entry**, and the
   question is kept in a comment beside it in `projects.js` so it comes back when the
   entry does.

**Aerial Ascent is the vertical slice.** It is the only project that shipped to an
audience, and Phase 2b builds one monolith, one card and one deep link — so build
them against the entry that has something real behind it rather than against a blank.

**`grappling` became `aerial-ascent`, and that was the last free slug change.** It was
free only because nothing has shipped: no saved progress exists and no deep link has
ever been pasted. Both stop being true the moment the site is public, and after that a
slug change silently resets somebody's achievements and 404s their link.

**Deferred by choice, not forgotten:** the exact domain string. Nothing depends on it
until Phase 6.

### Scheduled, not open

~~**The day-cycle palette**~~ **Judged and closed, 19 Aug** — A, the reference's, kept. See
*The 2a colour gate* for the verdict and decision 45 for the row.

**Foliage see-through, once foliage art exists.** Michael asked for it 21 Aug
after driving under a tree, and chose the trigger himself: *"lets do them when the
art exists."* The mechanism is fully captured in *Foliage see-through* below —
including the part that is not obvious, that the fade edges are `3 / radius` and
`15 / radius` so the hole stays a constant **world** size as the camera pulls
back. Do not build the cheap half on solid cones; see that section for why.

**Two look calls opened 21 Aug and still open**, both behind a boot flag and both
defaulting to the world as it was, so neither has changed anything under the reference author:

- **`#sink=`** — how deep the projects plaza sits. Nothing measurable rules out
  any depth up to 1.21; past that `assertBasinsClear` throws. `npm run
  sweep-basin` prints the table.
- **`#wind=`** — how hard the trees move. The reference's 0.5 is the default; a tip travels a
  peak of 0.497 units at that strength.

**World brightness, once there is something in the world that glows.** This is the
one thing Michael carried forward from the gate — *"it might be too dark in some
areas but its because we dont have any glowing objects like the reference author does right now"* — and
it is scheduled rather than open because the trigger, the check and the levers are
all known.

> **The trigger fired 31 Aug** — the emissive layer exists (`render/Night.js`:
> lamps, lenses, flames, glow-caps, plus the headlights) and Michael's first
> look was positive (*"okay great the light works"*). That is a first pass,
> not the sitting this item describes: the day/dusk drive with lamps lit is
> still worth doing deliberately once the areas add their own light sources,
> so this stays scheduled rather than closed — but it is no longer *blocked*
> on anything.

> **The baseline moved under this item on 23 Aug.** `KNOWN-ISSUES.md` 22 is
> resolved: every albedo was rendering ~6× too dark in linear, and the corrected
> encode is now live. Part of "too dark in some areas" was the defect, not the
> lighting. When this re-judge fires, it starts from the corrected world — do not
> reach for the levers below to claw back a darkness that no longer exists.

- **Trigger:** the first authored emissive props exist. That is the Phase 3 bullet
  below, and it is also decision 13's identity work, so it is happening anyway.
- **The check:** drive at day and at dusk, in a foreground window, with lamps lit.
  `#gate` still works and `1`–`4` still pin the phases; the four candidates are still
  in `palettes.js` if the whole palette wants re-judging rather than just the
  exposure.
- **The levers, in the order to reach for them.** First, ~~use palette entry 12~~
  **done 30–31 Aug** — entry 12 is now the emissive band with dozens of users
  (lamps, lenses, flames, glow-caps), lit at night by `render/Night.js`; if more
  glow is wanted, the lever is `EMISSIVE_NIGHT` there and *which props* carry
  the band. Then `lightIntensity` per phase in `palettes.js`, remembering
  that `KNOWN-ISSUES.md` 9's rule ties the day value to "a lit surface reproduces its
  palette colour". Only then the shadow tint, which is what actually sets how dark a
  *shaded* area reads.

**Do not touch exposure before the emissives exist.** Tuning brightness against a
world with nothing bright in it means tuning it twice — the same argument decision 39
makes for putting the rendering block before the content model.

~~**The camera trail** joins it, and on the same terms.~~ **Judged and closed, 19 Aug.**
Michael looked at it against the finished world and chose to match him, so
`SPRING_OMEGA` is **21.4** and our trail is 1.856 units at cruise against the reference's 1.834 —
0.1 % apart. The number came from a sweep on the running build, not from the formula:
the arithmetic said 24 and the arithmetic was wrong, for the reason recorded in the
correction under *The instrumented A/B*.

---

## Risks

| Risk | Mitigation |
|---|---|
| **Art scope eats the schedule.** The named failure mode from all three teardowns. | Lean on CC0 kits, or cut the playground. Decide by end of Phase 3 week one, not week three. |
| **Blender ramp runs longer than 8 h.** Almost no prior experience. | The style needs none of Blender's hard half — no sculpting, retopology, rigging or texture painting. If the ramp exceeds 16 h, shift the hero pieces to kit assets and re-UV instead. |
| **Beautiful engine, no content.** The classic outcome for projects that start with the tech. | Phase 2b is a vertical slice specifically to prevent this. The written content is called out as the one outstanding input. |
| **Authoring for a fixed camera angle is a discipline, not a setting.** | Every readable surface has to face theta = 45°. Check it in Blender at the real angle, not in a free viewport. |
| **WebGPU/TSL churn.** three.js moves fast and TSL is young. | Pin `three` exactly. The WebGL fallback path is already exercised. |
| **Physics feel never lands.** Driving is easy to get working and hard to get *good*. | The 2× time scale means the reference's tuned constants transfer verbatim. If it still resists, reduce the speed range and lean on the camera. |
| **Deleting working Phase 1 systems feels like going backwards.** | It is a net simplification: growth, the permanent reveal, the void backdrop and the camera's rotation/vertical follow together retire four risk areas. |
| **Mobile is late.** Phase 5 for a device class that may be half the traffic. | Real-device test moved to end of Phase 3. |

---

## Read off the reference's running build

Recorded 19 August, from a session that ran the reference's clone and our own side by side.
Everything here is **measured or source-verified**, not inferred — where something
is inference it says so. The point of the section is that none of it should have to
be re-derived.

**Reach for this file first.** The standing rule is now: *when unsure about a
mechanism, a constant or a shape, go and look at the reference's code before designing our own.*
Three separate defects this project has shipped came from reasoning about the reference's build
instead of reading or running it, and every one was settled in a single call once
somebody actually looked. Studying it is free; the licence permits it; and we still
write our own implementation afterwards (`reference/README.md`).

### Fog and sky — fully derived, ported in 2a step 3

| Thing | Value | How known |
|---|---|---|
| Sky | screen-space radial ramp, `mix(colorA, colorB, smoothstep(radialStart, radialEnd, len(viewportUV - radialCenter)))` | `Game/Fog.js` |
| Sky *is* fog | the same node is assigned to `scene.backgroundNode` and used as the fog target | `Game/Fog.js` |
| Fog model | `rangeFogFactor(near, far)` — linear range fog | `Game/Fog.js` |
| Fog distances | `near = area.near + nearRatio x amplitude`, `far = area.near + farRatio x amplitude`, `amplitude = area.far - area.near`. **Both ends measured from the near edge** | `Game/Fog.js` |
| `optimalArea` | probe camera at `radiusMax x (1 - speedAmplitude)` = **42**, raycast NDC (0,-1) and (0,+1) onto the ground plane; distances camera-to-hit | `Game/View.js:213-280` |
| The band | **near 32.44, far 63.85**, amplitude 31.41 | measured live; reproduced analytically from phi 0.31π, FOV 25°, radius 42 |
| Day ratios | 0.315 / 1.25, colours `#00ffff -> #9b89ff` | `Cycles/DayCycles.js:5` |
| Dusk | 0 / 1.25, `#3e53ff -> #ff4ce4` | same |
| Night | **-0.85** / 1.0, `#10266f -> #490a42` | same |
| Dawn | 0.3 / 1.25, `#f885ff -> #ff7d24` | same |

Verified three ways against the running build: night predicted 5.74 (measured 5.7397),
day predicted 42.33 (measured 42.33), dusk at progress 0.298 predicted 19.62 / 67.93
(measured 20.03 / 68.05).

**Why there is no horizon:** `fogFarRatio` at 1.0-1.25 puts full saturation within a
whisker of the top edge of the visible ground, so no ground is ever left to draw a
line against the sky. The negative near ratio at night starts the fog ~26.7 units in
front of the visible ground, which is why the reference's nights read enclosed.

### The vehicle

| Thing | The reference's value | Source |
|---|---|---|
| `topSpeed` (soft knee) | 5 | `Physics/PhysicsVehicle.js:16-18` |
| `topSpeedBoost` | 40 | same |
| `boostMultiplier` | 2 | same |
| `engineForceAmplitude` | 300 | same |
| `brakeAmplitude` | 35 | same |
| `idleBrake` / `reverseBrake` | 0.06 / 0.4 | same |
| `steeringAmplitude` | 0.5 rad | same |
| Brake maths | `brake *= brakeAmplitude * deltaScaled`, then set on **all four** wheels | `PhysicsVehicle.js:481,493` |
| Boost | `topSpeed = lerp(5, 40, boosting)` **and** `engineForce *= (1 + boosting * 2)` | `PhysicsVehicle.js:460-462` |
| Chassis main collider | cuboid, mass **2.5**, half-extents `[1.3, 0.4, 0.85]`, position y -0.1, **`centerOfMass` y -0.5** | `PhysicsVehicle.js:96` |
| Chassis top / bumper | both **mass 0**; bumper is `[1.5, 0.5, 0.9]` on its own `bumper` category | `PhysicsVehicle.js:97-98` |
| Suspension | rest length *and* stiffness are per-wheel and switchable `low`/`high` | `PhysicsVehicle.js:31-36` |

We already match the reference's mass (2.5) and the reference's centre-of-mass offset (ours reads
`localCom [0, -0.5, 0]`), and as of 19 Aug the reference's braking impulse per second too.

### Flip, unstuck and boost — not ported, spec captured

- **`flip.jump()`** (`PhysicsVehicle.js:404`): upward impulse `(0,1,0) x flip.force(5) x mass`.
  Then if on its **roof**, torque impulse `0.8 x mass` about local X; if on its **side**,
  `torqueX = sideward·up x 0.4 x mass` and `torqueZ = -(forward·up) x 0.8 x mass`. The
  torque is rotated into the body frame with `applyQuaternion(body.rotation())`.
- **Trigger** (`Player.js:360`): `upsideDown.ratio > 0.3` starts a **3 s** delayed call;
  if still upside down when it fires, `flip.jump()` runs. Also bound to an "unstuck"
  button.
- **Stuck** (`PhysicsVehicle.js:265-269`): less than **0.5 units travelled over 3 s**.
- **Trick detector** (`flip.test`, `:356`): accumulates X and Z rotation while all four
  wheels are airborne; on landing fires `flip` if `|accX| < 1` and `|accZ| > 5`. It is
  an achievement hook, not a control.
- **Boost input**: Shift or gamepad circle (`Player.js:225`).

### World and rendering

- **Water**: `surfaceElevation -0.3`, `depthElevation -1.5`. Terrain `size 192`,
  `subdivision 128`.
- **Lighting**: `phi 0.63`, `theta 0.72`, `phiAmplitude 0.62`, `thetaAmplitude 1.25`,
  shadow map 2048, `shadowRadius 3`, `shadowNormalBias 0.1`.
- **Quality**: level 0 on desktop, 1 on mobile UA; `changeLevel()` fires a live event.
- **Cycle pinning**: `dayCycles.override.progress` + `.strength` — runtime, lerped, no
  reload. This is the shape ours should copy for the colour gate.
- **Year cycle** carries only scalars (`leaves`, `temperature`, `humidity`, `clouds`,
  `wind`) — no colour anywhere. Confirms the correction to decision 12.

### Running the clone — and its one trap

Vite serves the reference's modules, so `const { Game } = await import('/Game/Game.js')` returns
the live singleton. **But without a websocket server, `world.whispers.flames` is an
`InstancedMesh` whose `count` is `NaN`, and `drawIndexed(..., NaN)` throws inside
`_renderTransparents` every frame — aborting the whole render pass and producing a
genuinely black screen** after the intro reaches `reveal.step 2`. Guard it:

```js
setInterval(() => { const f = game.world?.whispers?.flames;
  if (f && !Number.isInteger(f.count)) { f.count = 0; f.visible = false; } }, 100)
```

With the guard the console is clean and the simulation runs at ~49 fps, though the
canvas still did not present on this machine — **which does not matter for
measurement**, since physics, camera and fog all update on the ticker regardless.
Incidentally this validates decision 27: the reference's only server-side component is load-bearing
enough that its absence takes the entire renderer down.

**The deployed site gives nothing numeric.** Confirmed 19 Aug: `the reference site`'s
bundle exports exactly two symbols, a Buffer polyfill and a top-level-await helper.
No globals, no singleton. Play it to *see* behaviour; run the clone to *measure* it.

### The instrumented A/B — run headless, 19 August

Everything in this subsection is **measured on the reference's running clone**, driven by synthetic
input at a forced, exact 1/60 frame delta. It settles all four questions the previous
"still unmeasured" list was blocking on, and it corrects three things this file and
`KNOWN-ISSUES.md` had asserted from source.

**How it was run, because it is worth not re-deriving.**

- **`#skip` in the URL hash bypasses the click-to-start gate entirely** and runs the
  intro at 4x (`Reveal.js:48`, `:99`). No CDP click, no foreground window, no asking
  Michael. `Keyboard.Enter`/`ArrowUp`/`ArrowDown`/`KeyW`/`KeyD` also fire `introStart`.
- **Hand-pump the ticker rather than fighting `document.hidden`.** The reference's frame clock is
  `renderer.setAnimationLoop`, so `setAnimationLoop(null)`, stub `rendering.render`,
  and call `ticker.update(simMs)` with `simMs` advancing by exactly 1000/60. That
  gives `delta 1/60`, `deltaScaled 1/30`, `deltaAverage 1/60` — a locked-60 machine,
  deterministic and immune to occlusion.
- **Drive it with `inputs.start('Keyboard.ArrowUp')` / `inputs.end(...)`.** That is the
  exact path a real key takes and needs no focus. Set `inputs.filters` to `wandering`
  first — `Reveal.js:174` normally does it at step 1.
- **`world.step(1)` runs at load, before the intro.** The whole world, the floor
  heightfield, the bedrock and the vehicle all exist before anything is revealed;
  only `Whispers` is deferred to step 2, and that is the thing that black-screens.
  So nothing about the intro has to succeed for the physics to be measurable.
- **gsap does not advance under a hand-pumped ticker.** Anything behind
  `overlay.show()` — `Player.respawn()` included — never completes, and a
  `ticker.wait` callback that throws aborts the whole frame before `tick` is even
  emitted. Wrap `ticker.wait` in a try/catch before pumping.

**The reference's timestep, and why every number here says "at 1/60".** `Ticker` clamps
`delta` to `1/30`, scales by **2**, and `Physics.update` sets
`world.timestep = deltaScaled` and steps **once** — so at 60 fps the reference's solver runs at
30 Hz on a 1/30 timestep, exactly what decision 18 did before the substep fix in
`KNOWN-ISSUES.md` 14. `controller.updateVehicle(min(1/60, deltaAverage))` takes the
*unscaled* delta, which is our `vehicleDt`. One consequence: `engineForce` is
multiplied by `deltaScaled` **and then integrated over** `world.timestep`, so the reference's
drive impulse goes as `dt^2` and **the reference's acceleration and top speed are frame-rate
dependent**. A slower machine has a faster car.

| Measured, at a forced 1/60 | The reference's | Ours |
|---|---:|---:|
| Top speed, physics m/s | **11.005 / 11.028** (two straights) | 11.5-11.74 |
| Top speed, apparent | **22.0** | 23.0-23.5 |
| Boost top speed | **44.25** physics / 88.5 apparent | none |
| Turn radius, full lock + full throttle | **6.37** (circle fit) / **6.39** (v/omega) | 7.01 / 6.94 |
| Steady cornering speed | 6.63 physics | — |
| Yaw rate | **118.9 deg/s** | 113-116 |
| Camera trail at cruise | **1.834** units at 22.0 apparent | 1.17-1.46 (mixed speeds) |

**So we are within 5 % of the reference's top speed and 9 % of the reference's turn radius.** The "the reference's knee is
5, ours reach 11.5" worry was an artefact of reading `topSpeed 5` as a limit: it is a
soft knee (`engineForce / (1 + overflowSpeed)`) and nothing but linear damping sets a
terminal speed. Entry speed is **not** the unmatched term in `KNOWN-ISSUES.md` 16.

**Camera trail obeys `v_apparent / 12`**, dead constant across three regimes —
1.085 units at 13.3 apparent, 1.834 at 22.0, 7.376 at 88.5. The mechanism is
`smoothedPosition.lerp(position, delta * 10)` once per frame, and the *discrete*
steady state of that is `v * dt * (1 - k) / k` with `k = 10 * dt = 1/6`, i.e. `v/12` —
not the `v/10` the continuous form suggests.

> **Correction, 19 Aug.** This section originally went on to say that ours "trails
> 20 % further than the reference's" and that matching the reference author meant omega 24. Both were wrong, and
> wrong the same way: they compared our *design target* (`v/10`, a continuous-form
> figure) against the reference's *measurement*. Ours is integrated per frame too, so it also
> lags less than its continuous form predicts. Swept on our running build at
> terminal speed, the trail-over-apparent ratio is .0898 at omega 20, .0850 at 21,
> .0832 at **21.4**, .0807 at 22 and .0731 at 24. So omega 20 was **7.8 % looser**
> than the reference author rather than 20 % tighter, and the exact match is **21.4**, which is what
> shipped after Michael chose to match him.

**Wheels and chassis, read live off the controller** — three of these contradict what
this file recorded from source:

- Connection points **±0.9 along forward, ±0.75 lateral**: the reference's **wheelbase is 1.8**
  and the reference's **track 1.5**. `KNOWN-ISSUES.md` 16's "2.24 wheelbase ... is the reference's too" was
  wrong; 2.24 is ours. Ours is 24 % longer and 9 % wider.
- Wheel radius **0.40**, rest length 0.88, stiffness 20, relaxation 2.7, compression
  10, maxTravel 2, **frictionSlip 0.9**, maxSuspensionForce 150, sideFrictionStiffness 3.
- Resting body y **1.088**. Principal inertia **(1,1,1)** — the same as ours
  (`Physics.js:177`), so the pitch difference is not inertial.
- The **bumper collider fully encloses the main one** — `[1.5,0.5,0.9]` at
  `(0.1,-0.2,0)` against `[1.3,0.4,0.85]` at `(0,-0.1,0)` — so the main box never
  touches the world and the reference's effective chassis shape is 3.0 x 1.0 x 1.8. Disabling the
  bumper at runtime changed the braking result **not at all, to the digit**, so it is
  not acting as a nose-guard either.

**Braking, entry 10.96 physics m/s.** Deceleration is per *real* second over the first
0.083 s; the run ends when speed drops below 0.3.

| The reference's control | decel | peak nose-down | frames wheels lifted | all four off | `upsideDown` peak | stop |
|---|---:|---:|---:|---:|---:|---:|
| Full brake (`KeyB`, 1.0) | 44.97 | **66.3 deg** | 69 | 9 | **0.299** | 0.52 s |
| Reverse-as-brake (0.4) | 30.79 | 10.5 deg | 0 | 0 | 0.016 | 0.42 s |
| Idle brake (0.06) | 9.29 | 3.5 deg | 0 | 0 | 0.001 | 1.37 s |
| Full brake from boost (44.26) | — | 44.7 deg | — | 41 | 0.157 | — |

The reference's car rears to **66 degrees and stops a thousandth short of the reference's own 0.3 flip
threshold**. Braking from boost is *less* violent, not more, because the wheels leave
the ground at once and an airborne wheel transmits no brake. Our reverse-brake row
(25.5 decel, 8.25 deg, 0 frames lifted, 0.43 s) sits right on the reference's (30.8, 10.5 deg, 0,
0.42 s) — that fix landed. See `KNOWN-ISSUES.md` 16 for what this settles.

**The reference's terrain collision is flat.** The heightfield is **129 x 129, cell 1.5, extent
±96, and its height range is exactly 0 to -1.5**: land is dead flat at y = 0 and the
only physical relief in the entire world is the dish that runs down to the water.
65 % of the field is land, 23.8 % shelf, 11.2 % sitting on the -1.5 floor. The island
is **not a disc** — internal lakes and channels cut through it, which is why a radial
profile of it is meaningless.

**The shore shelf is 6.75 units wide** — median from the waterline (-0.3) to the deep
floor (-1.5), p10 4.05, p25 5.1, p75 8.25, p90 10.5. A 1.2-unit drop over 6.75 units
is a **10 degree slope**. Measured two independent ways that agree to 0.02: gradient
descent from all 1,402 waterline crossings, and `1.2 / |grad h|` over the band.
Depth landmarks from the waterline: **0.3 m deep at 1.2 units in, 0.6 m at 2.25,
0.9 m at 3.3**. Only 641 of those 1,402 crossings ever reach -1.5 at all, so **about
half the reference's water is shelf the whole way across**. The earlier read of "easily a tenth of
the island's width" was of the rendered teal band, and overstates the physical shelf
by two to three times.

**The bedrock is a follower floor, not a wall.** Kinematic cuboid, half-extents
`[6, 0.5, 6]`, centre at `depthElevation - 0.5 = -2.0`, so **its top face is exactly
the -1.5 water floor**. It is enabled whenever `|x|` or `|z|` exceeds
`terrain.size/2 - 6 = 90` and snapped to `round(player x/z)` every frame
(`Floor.js:175-203`). You never fall out of the reference's world; you drive out onto an infinite
seabed.

**There is no water respawn threshold, and no out-of-world catch of any kind.**
Driven and confirmed: the car crosses the waterline at 10.2, its body passes y = 0
about 3 units in, `Physics.update` sets linear *and* angular damping to 1 for any body
below y = 0, and speed clamps to **5.45 physics m/s — exactly half the reference's land top
speed** — and stays there. It then drove **418 units out to sea and on to x = -502**,
all four wheels on the bedrock, at a constant 5.45, for forty seconds, with no
respawn, no `stuck`, no unstuck button and no fall. Decision 43's fade-and-respawn is
entirely ours to design; the reference's water is simply drivable treacle.

**The reference's recovery machinery, which is what decision 43 and `KNOWN-ISSUES.md` 15 need.**
`R`, the Options menu, the map, and the interactive **unstuck** button that appears
after `stuck` (< 0.5 units travelled over 3 s while `|accelerating| > 0.5`) all call
`Player.respawn()` -> `respawns.getClosest(player.position)` -> `moveTo`. There are
**18 authored respawn points**, loaded from `respawnsReferences.glb`, all at **y = 4**,
each with an authored yaw, and "closest" is **horizontal distance only**. Verified
live: from (-502, -36) it returns `timeMachine` at (-56.5, 4, -64.7).

### What the cycle landing measured — 19 August, on our own running build

Four numbers came out of wiring `DayCycles` into the lighting rig, all measured by
rendering our island into an offscreen target and reading the pixels back, so they
are independent of whether the canvas was presenting.

- **The reference's day palette is 27 % dimmer than what shipped before it.** Measured on the
  same frame, same camera, only the three light uniforms swapped: mean green
  0.732x under the reference's `#ffd2c2` at 1.2 against our `#fff0d8` at 1.2. It is entirely
  the light colour — the reference's is warmer, so `mean(linear)` is 0.729 against our 0.853 —
  and it is not a bug in either. It is the first concrete cost of shipping the reference's
  palette as scaffolding, and it is on the list of things the colour gate settles.
- **The reference's night is over the bloom threshold across the whole world, not just on
  emissives.** `#3240ff` at 3.8 puts the brightest palette entry at **3.37**
  against a threshold of 1 (`KNOWN-ISSUES.md` 9's rule says a lit surface should
  land at 0.97). Our three candidates land at 0.56–0.64. So the reference's night is not a
  dark world with lights in it, it is a world that is *itself* blooming, and any
  candidate that keeps the bloom rule cannot look like it.
- **At the resting radius the day fog does almost nothing.** Removing the fog
  entirely from a day frame changed the mean by **1.000x** — not at all. The
  visible ground at radius 30 runs 23 to 46 units and the reference's day fog does not start
  until 42.4, so only the top few per cent of frame is touched. The fog band is
  derived from a probe at `radiusMax x 1.4 = 42` (the pulled-back worst case at
  speed), which is why it is placed so much further out than the resting frame.
  The reference's **night** ratio of −0.85 starts the fog at 5.75 units and swallows the
  entire frame, and that single number is most of why the reference's nights read enclosed and
  the reference's days read open. The night figure is also a cross-check: 5.75 measured on our
  build against the 5.7397 measured on the reference's.
- **A night factor of 0.45 is the middle of a three-value sweep.** Candidates B, C
  and D put night at 0.45 of full exposure. At 0.30 shadowed grass falls to
  `#152123` and the island stops being legible; at 0.60 it reads as an overcast
  afternoon. One constant in `palettes.js`, easy to move if the gate says so.

Two things about the harness are worth not re-deriving. **`readRenderTargetPixels`
needs a 256-byte-aligned row stride** — at 400 px wide (1,600 bytes) every frame
came back sheared into diagonal stripes and the colour means were reading shifted
rows; 320 px (1,280 = 5 x 256) is clean. And **forcing `reveal.finish()` does not
survive the intro**: the cinematic re-drives the same uniform from 0, so a world
that was whole becomes a four-unit disc a second later and the ground appears to
have vanished. Let the intro finish, or set `intro.step = 2` first.

### Read out of the reference's GLBs — 19 August, after Michael called the board bland

Four things the reference author named. Three check out, one is the opposite of what it looks like, and
the correction is the useful one because it changes what we would build.

**The reference's land is flat, but the reference's terrain is not — and there is a river.**

> **This entry was wrong when first written and is corrected here rather than edited
> away, because the mistake is the lesson.** The first version said "dead flat, the only
> drop is the shore dish, there is no river". That came from reading the terrain's
> *bounds* — `y −1.50 → 0.00` — and inferring shape from them. **Bounds describe a range,
> not a distribution.** A winding channel carved to −1.5 produces exactly those bounds.
> Michael said he could see a river and he was right; a screenshot of his build shows one,
> with banks and a wooden bridge over it. Decoding the actual heightfield confirmed it.
> Grepping the reference's source for `river` found nothing for the same underlying reason: **the
> river is not an object, it is an absence** — terrain that isn't there.

Decoded from `terrain.glb`'s POSITION accessor — 16,641 vertices, a 129 × 129 grid at
1.5-unit spacing, exactly the collision heightfield `Floor.js` extracts:

| | the reference's | ours, before 20 Aug | ours, now |
|---|---|---|---|
| land, flat at exactly y = 0 | **51.0 %** | **2.4 %** | 37.8 % |
| **bank slope in between** | **35.4 %** | 59.0 % | 23.6 % |
| deep floor at y = −1.5 | 13.6 % | 38.5 % | 38.5 % |
| coastline cells per land cell | **0.131** | 0.048 | *not re-taken* |
| land area | 19,951 m² | 9,990 m² | unchanged |

> **The "ours" column is re-taken, 20 Aug, and the original was wrong.** It read
> `43.5 / 39.3 / 17.2`. Both grids have now been classified by **one script at one
> tolerance** — the reference's decoded straight out of `terrain.glb` (16,641 verts, 129², y −1.500
> → 0.000), ours rebuilt from its own constants — and our sloping land relief turns out
> to have been counted as *land* on our side while the identical height range counted as
> *bank* on the reference's. The two splits sum to the same 61 %, which is the tell. **It reversed
> the conclusion**: we did not have too little bank, we had 59 % of it and all of the
> wrong kind. Only after flattening (23.6 % against the reference's 35.4 %) is "we need more bank"
> a true statement. Full working in `KNOWN-ISSUES.md` 18.

**One mesh. Land pinned dead flat at y = 0, water carved down to −1.5, and a third of the
whole terrain is the slope between them.** Michael's reading — "the ocean floor might be
the actual floor and the reference author just added islands on top" — is right in effect, though it is one
surface rather than two. Driving into the river is driving down a 1.5-unit bank.

So the original conclusion survives in one half and inverts in the other:

- **Still true: no hills.** Every land vertex is exactly 0. Decision 17 stands, and
  making our *land* hillier would move away from the reference's world, not toward it.
- **Now false: "the shape comes from props."** The shape comes from **water carved into
  land**. The reference's shoreline is **2.7× more articulated per unit of land** than ours, and the reference author
  has interior water — rivers, inlets, bays — where our island is a smooth radial blob
  with none at all. That is a large part of why the reference's world is interesting to drive around
  and ours is not, and it is a terrain change rather than an art change.
- **Separately, the race circuit really was the skyline.** Its trimesh is the tallest
  object in the reference's world at **y = 20** and its `jump` runs −6.1 → +6.0; `areas.glb` spans
  −6.1 → +20.0 with 76 of 286 meshes above y = 3. Decision 2 stripped that deliberately.

There is also a **waterfall** — `refWaterfallStill` / `Drop` / `Particles` in the
`achievements` area at **[70, 8], y 0.3 → 5.4**, the secret zone already on the cut list.
It is not the river; the river is terrain.

**The reference's physics objects are real and there are a lot of them.** `areas.glb` carries **120
physics-tagged nodes: 97 dynamic, 16 fixed, 7 kinematic** — `gizmoPhysicalDynamic`,
`phonePhysicalDynamic`, `refLettersPhysicalDynamic.010`–`.014` (knockable letters), and
`refBumpersPhysicalKinematic` in bowling. We have **zero dynamic bodies**; all 16 of our
colliders are fixed. This is the cheapest gap on the list to close — Rapier is already
running and `Area.addBox` already creates bodies, so a dynamic one is the same call with
`RigidBodyDesc.dynamic()`.

**The fonts, which is the cheapest win of all.** Ours is `ui-sans-serif, system-ui` —
the browser default, i.e. no choice at all. The reference's:

| where | font | how |
|---|---|---|
| **every in-world label** | **Amatic SC, weight 700** | Google Fonts, OFL |
| DOM / overlay | Nunito 400/700/900 | Google Fonts, OFL |
| one preloaded face | Pally Medium | bundled in `static/fonts/` |

`700 …px "Amatic SC"` is hard-coded at `InteractivePoints.js:216` (**the beacon prompt**),
`ProjectsArea.js:259`, `LabArea.js:260`, `AltarArea.js:354`, `CookieArea.js:309` and
`Bubble.js:23`. A hand-lettered condensed display face on every readable surface is a
large part of what Michael is responding to, and both faces are free to use.

**And the scale gap, stated plainly.** Our world is **38 props** — 6 buildings, 10 trees,
22 rocks, from `Island.COUNTS`. The reference's `areas.glb` alone is **286 meshes**, and the reference author ships
**32 GLBs across 41 asset folders** (benches, bricks, fences, flowers, lanterns,
poleLights, oak/birch/cherry trees, bushes, foliage…). No amount of shading closes that;
it is Phase 3 and it is why Phase 3 is the long pole.

### The reference's water, and where the reference's rivers actually are — 20 August

Prompted by Michael, after being told a sunken plaza would fill with water: *"honestly
a pond isn't bad, it might be how the reference author created rivers and ponds in the reference's map, lets take a
deeper look at that."* The reference author was right, and it removes a blocker that had just been
written into `KNOWN-ISSUES.md` 18.

**The reference's water is one quad. There is no mask, and there are no pond objects.**
`Game/Water.js` is 26 lines holding two numbers — `surfaceElevation -0.3`,
`depthElevation -1.5` — and no mesh at all. The surface is `World/WaterSurface.js`:

```js
this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1)          // one quad
this.mesh.scale.setScalar(halfExtent * 2)                    // sized to optimalArea
this.mesh.position.y = this.game.water.surfaceElevation      // -0.3, flat, global
this.mesh.position.x = this.game.view.optimalArea.position.x // follows the camera
```

Land sits at 0, above the plane, so the depth buffer hides the water over land and
nothing else has to. **Ocean, river and pond are the same object**: terrain below −0.3.
The terrain height texture is sampled only for ripples, ice and a shore band
(`shoreEdge 0.17`) — never to decide *where* water is.

**Ours is already the same mechanism** — a 400-unit plane at `WATER_SURFACE`, snapped
to a 4-unit grid, following the focus point, `renderOrder 1`, depth-tested against the
island. So carving below −0.3 produces water with **no new rendering code**.

**Where the reference's interior water is, measured.** Both grids classified by one script: wet is
`h <= -0.3`, "ocean" is wet and flood-reachable from the border, "interior" is wet
inside a morphological closing of the land mask at radius 8 cells (12 units).

| | the reference's | ours |
|---|---|---|
| wet (≤ −0.3) | 35.0 % | 56.5 % |
| open ocean | 27.9 % | **56.5 %** |
| **interior water cut into the landmass** | **15.8 %** | **0.0 %** |
| fully enclosed, unreachable from the sea | 7.1 % | 0.0 % |
| land area | 19,951 m² | 9,990 m² |

**Twenty-one separate interior bodies** of 4 cells or more. The shape of them is the
design input, and it is not what "pond" suggests:

| body | area | extent | median width | median depth | max depth | reaches sea |
|---|---|---|---|---|---|---|
| largest, at [21.8, 25.5] | 855 m² | 73.5 × 66 | **6.0** | 0.55 | 1.16 | no |
| [−85.5, 45.8] | 788 m² | 21 × 79.5 | 9.0 | 1.12 | 1.20 | yes |
| [51.8, 51.8] | 605 m² | 43.5 × 46.5 | 6.0 | 0.57 | 1.07 | yes |
| [21.8, −65.3] | 567 m² | 46.5 × 13.5 | 6.0 | 0.72 | 1.20 | no |
| [−50.3, 38.3] | 556 m² | 34.5 × 25.5 | 9.0 | 0.63 | 1.16 | no |

A body spanning 73 × 66 units that holds only 855 m² at a **6-unit median width** is a
branching channel network, not a lake. That is the thing to reproduce.

**The number that matters most for us: the reference's rivers are mostly drivable, not barriers.**
Median depth across the reference's interior water runs **0.42–1.17**, i.e. beds at about −0.7 to
−1.5. Our drowning line is depth 1.0, a bed of **−1.30**. So most of the reference's channels would
be shallow drivable water under our rules and only the deepest sections would drown —
which is exactly why driving the reference's island reads as a sequence of places rather than a
maze. The reference's own build has no drowning at all (decision 43), so this is ours to choose.

**Nothing else has to change to support it**, which is what `KNOWN-ISSUES.md` 18 claimed
and this confirms one system at a time: `_isPlaceable` and `_isSpawnable` already reject
anything at or below the waterline, so props and respawns stay out of channels for free;
the sand band at `WATER_SURFACE + 0.15` already paints riverbanks; `depthAt` is
position-independent; the bedrock only matters outside the grid. **That claim held** —
the network below landed without touching any of them.

### Where you start — 20 August

Michael: *"Another thing i want is like a starting spawn seamlessly from the intro, i
think projects section can be somewhere we drive to, more similar to the reference's layout."*

The layout half was already true and had been hidden by testing: the spawn is at the
origin and the plaza is **33.4 units away**, so you always had to drive to it — but
every tab handed over during development carried `?at=projects`, which skipped the
drive. The seam was real, though, and it was an ordering bug: the deep link was
applied **after** `playIntro()`, so the cinematic finished and *then* the car
teleported. It now runs before the intro, and before `whenVisible()` so a
background tab is already in position when somebody looks at it.

Two things had to move with it. `Reveal` defaults its centre to the origin and
**nothing had ever called `setCenter`** — invisible only because the car also started
at the origin, and a guaranteed bug the moment it did not. And the default start was
never authored at all: the car was constructed at `[0, heightAt(0,0) + 2.5, 0]` and
fell, so where you began was a side effect of a constructor. `Game.placeAtStart()`
now stands it on `island.spawns[0]`, settled, **facing the plaza** — bearing 57.1°,
heading 56.5°. With a fixed camera you cannot look around, so if the destination is
not in the opening frame the world reads as empty in the one moment that decides
whether anybody drives at all.

### The channel network as built — 20 August

`Terrain.CHANNELS`: nine polylines with a smooth cross-section, carved into `heightAt`.
No new mesh, no mask, no material change, exactly as the mechanism above predicted.
Measured on the running build against the reference's, one script over both grids:

| | the reference's | ours |
|---|---|---|
| median channel width | 6.0 | **6.0** |
| median depth | 0.42 – 1.17 across bodies | **0.44** |
| max depth | 1.20 | 1.02 |
| interior water, share of landmass | 22.9 % | 17.6 % |
| interior water, share of grid | 15.8 % | 7.6 % |
| enclosed bodies | 7.1 % | 0.8 % |
| separate bodies | 21 | 5 |
| land area | 19,951 m² | 9,990 → **8,210 m²** |

**Width and depth are the reference's; density is about three-quarters of the reference's and the body count is
the real gap.** The reference's 21 bodies sit on 2.3× our area, so the like-for-like target is nearer
9 than 21. Left short deliberately rather than tuned further: it is a look, Michael judges
looks on the running build, and the knob is one array.

**Judged 20 August, and three things came back.** Michael drove it: *"I do see the
rivers now and can drive in them. driving through a river and through the sea both
work."* So the mechanism is confirmed by feel as well as by measurement. The three
faults the reference author named are all fixed and all measured:

| what Michael said | what it was | after |
|---|---|---|
| *"one small puddle near the top left… makes the driving rugged"* | that channel's bank gradient was **0.405** against the trunk's 0.273, because `bedDepth` and `halfWidth` were authored independently | `halfWidth` derived from `bedDepth` via `BANK_GRADIENT`; peak grid curvature 0.823 → 0.735 |
| remaining rough spots | hard `Math.max` between overlapping channels leaves a **gradient crease**, and a crease on a 1.5-unit collision grid is a step | polynomial smooth-max at k 0.4; peak curvature 0.735 → **0.540**, against the reference's 2.056 |
| *"the car animation being more janky than the reference's"* | **not the terrain at all** — fixed 1/120 physics read straight into the visual, so on the reference's 148 Hz display 18.9 % of frames did not move | render-time interpolation; **0 % duplicate frames at every rate tested**, judder 0.483 → 0.019 |

The third is the one worth remembering, because two hypotheses were measured and
falsified before it — the terrain's own curvature is *lower* than the reference's, and the drag
ramp does not lurch. Michael named the right subsystem from feel while measurement
was busy in the wrong one.

**Three things the build taught that are worth keeping.**

- **The coastline is not a circle, and routing by radius alone fails.** `beachRadius`
  runs **40.7 at 105° against 61.2 at 195°**. Endpoints picked at a radius that is
  comfortably inland in the west sat *twenty units out to sea* in the north-west, which
  silently connected two "enclosed" systems to the ocean and reported 0 % enclosed water.
  Every enclosed endpoint is now held ≥ 13 units inside its own bearing's beach radius.
- **The keep-out assertion earned its place twice on the first day.** It caught the
  trunk at 24.2 from the plaza clearing where it needed 26.5, and later an inlet at
  exactly 25.5 needing 25.5. Both were routing errors invisible in the numbers and
  obvious in the message. Asserted rather than masked, for the reason
  `ProjectsArea._assertFitsClearing` gives.
- **Removing drowning removed the connectivity risk with it.** The scoped block carried
  "assert the drivable land stays one component" as a line item, because a channel that
  cut the island in two would strand a player. With nothing lethal, every channel is
  drivable at any depth and fragmentation costs a detour rather than a death. The line
  item is dropped, not deferred.

### How the reference's animation works — 20 August

Read out of the reference's source and the reference's GLBs after Michael asked how the boost pump on the
car is done. **The headline is that there is no animation system.**

`AnimationMixer`, `AnimationClip`, `clipAction`, `SkinnedMesh`, `Bone`, `skeleton`,
`morphTarget` — **zero occurrences across 29,666 lines of JS.** The single grep hit
is `threejs-override.js:31`, which is three's own `Object3D.copy` patched to skip
the `userData` deep-clone (a cost that matters when you clone 1,551 objects).
`static/vehicle/default-compressed.glb` confirms it from the other side:
**`animations: 0`, `skins: 0`** over 24 nodes and 18 meshes.

Five mechanisms carry everything, and they split by *what kind* of motion it is:

| # | mechanism | what it drives | cost |
|---|---|---|---|
| 1 | **Shader time.** `Ticker` publishes `elapsedUniform`, `deltaUniform`, `elapsedScaledUniform`, `deltaScaledUniform` (`Ticker.js:21-24`); **15 files** read them and write motion into `positionNode` | all ambient/idle motion | zero CPU, zero per-object state |
| 2 | **One shared wind field.** `Wind.offsetNode` (`Wind.js:30-44`) samples two perlin textures scrolling at different rates and returns a vec2; any material calls it | grass, flowers, air dancers — everything sways coherently | one noise sample per vertex |
| 3 | **gsap**, 160 call sites over 34 files, tweening **uniforms and object properties** — never skeletons | anything with a beginning and an end | one tween |
| 4 | **Hand-written per-frame CPU**, only where gameplay state drives it (`VisualVehicle.js`, 546 lines) | wheels, suspension, blinkers, brake lights, the antenna | a few lines per part |
| 5 | **Rapier.** Dynamic bodies *are* the animation | anything that gets knocked over | physics |

**The characters are mechanism 5, and this is the surprise.** The boy, Sudo and
Baguira appear **nowhere in the reference's JavaScript** — grep returns two `Audio.js` music
filenames and nothing else. They exist only as node names in `areas.glb`
(`boyPhysicalDynamic`, `sudoPhysicalDynamic`, `baguiraPhysicalDynamic`), picked up
generically by the `^ref`/`physical` naming convention from `F` §1. They are
**posed meshes bolted to dynamic rigid bodies** — props you can knock over. No code
knows they are characters. The 8 armatures in `source.blend` are authoring
tools for posing before export; they drive nothing at runtime.

**Two patterns worth stealing outright.**

*One scalar, staggered windows.* The boost pump — the engine cells sinking in
sequence — is nine lines (`VisualVehicle.js:528-536`):

```js
this.boostAnimation.mix += (this.game.player.boosting ? 1 : -1) * this.game.ticker.deltaScaled * 1.2
this.boostAnimation.mix = clamp(this.boostAnimation.mix, 0, 1)
this.boostAnimation.mixUniform.value = 1 - Math.pow(1 - this.boostAnimation.mix, 7)
this.parts.cell1.position.y = remapClamp(this.boostAnimation.mix, 0,   0.6, 0.2, 0)
this.parts.cell3.position.y = remapClamp(this.boostAnimation.mix, 0.2, 0.8, 0.2, 0)
this.parts.cell2.position.y = remapClamp(this.boostAnimation.mix, 0.4, 1,   0.2, 0)
```

Three things in that. **The stagger is three different slices of one 0→1 scalar** —
that is the whole sequence, no keyframes and no timeline. **The scalar is an
accumulator, not a tween**, so releasing boost runs it backwards from wherever it
is and it is interruptible at any point without snapping. And **one scalar feeds
two curves** — the geometry pumps on the raw `mix`, while the emissive crossfade
(`material.outputNode = mix(defaultOutput, emissiveOuput, mixUniform)`,
`VisualVehicle.js:407`) uses `1 - (1-mix)^7`, so the glow arrives fast and the
metal moves linearly. Note the firing order is cell1, cell3, cell2 — the wave
direction is a property of where the cells sit, not of their names.

*The same trick, per-instance.* `Confetti.js:82-112` gives 500 pieces staggered
start times, an arc and a pop-in/pop-out from **one `progressUniform`**, with the
randomness baked into static instanced buffers (`randomProgressBuffer`,
`angleBuffer`). One gsap tween, one draw call, no particle system.

**Blender's role in all of this is to supply *parts*, not motion.** `cell1`,
`cell2`, `cell3` are separately-named nodes in the GLB (as `cell1.001` etc — the
`.001` duplication trick from `F` §1), and `VisualVehicle.setParts` finds them with
a case-insensitive prefix regex `^(cell1)` that absorbs the suffix. **The reference's `.blend`
files are a parts catalogue, and the naming convention is what makes them one.**
That is `F` §1's "node names are the level format" extended from placement to
animation.

**Where we stand against it.** ~~We have **none of 1 or 2**.~~ **Corrected
21 Aug: we now have all five.** 3 is `core/tween.js` (~50 lines), 4 is
`Car.syncVisual`, 5 is Rapier — and **1 and 2 landed with ambient motion**:
`Ticker` publishes `elapsedUniform` and `deltaUniform` (two, not the reference's four —
decision 6 keeps the scale in the physics, so **a rate ported from the reference's shader code
is ×2**), and `render/Wind.js` is the reference's shared field over a perlin tile
`render/Noises.js` generates on the GPU at boot. See *Ambient motion*.

**And the porting trap applies to every number above.** The reference's constants multiply
`elapsedScaled` and the reference's `Ticker.scale = 2`, so a rate ported out of this section is
**×2, not ÷2** (`README.md` → *Things that bit*).

---

### Is the reference's geometry authored or generated? — 20 August

Michael asked whether the reference author, being a three.js expert, generated much of his *world
geometry* in code the way the reference author generates the reference's textures — because if so our modelling
list shrinks. **The reference author does not. The models are Blender, essentially without exception.**

**Every procedural geometry site in the reference's source, classified.** 67 `new THREE.*Geometry(`
constructors across 37 files. 34 are `PlaneGeometry` — particles, sprites, text,
water, trails, rain. Every one of the remaining 33 was read individually:

| what they are | examples |
|---|---|
| debug helpers | `View.js:157` focus-point sphere, `Zones.js:41`, `Ligthing.js:122` |
| commented out | `Noises.js` ×3, `Area.js:123`, `CircuitArea.js` ×2, `World.js` ×2 |
| VFX primitives | `Trails.js:63` cylinder, `Fireballs.js:12` sphere, `VisualTornado.js:66`, `Intro.js:61` ring |
| UI | `Nipple.js:44`, `Materials.js:206-207` debug-panel previews |
| sub-centimetre particles | `CookieArea.js:136`, `PoleLights.js:112` — `CircleGeometry(0.015, 8)` |

**Not one is a world prop.** No procedural trees, rocks or buildings anywhere.

**Confirmed from the other side, per system.** Every prop module loads from a GLB and
builds no geometry at all — `Trees`, `Bushes`, `Benches`, `Bricks`, `Fences`,
`Lanterns`, `Scenery`, `ExplosiveCrates` all measure `procGeom = 0`.

**Three real exceptions, and they are all vegetation-as-effect rather than props:**
`Grass.js` (210 lines, fully generated — decision 32's 78,400 blades), `Leaves.js`
(305 lines, generated), and `Flowers.js`, which is a hybrid — the mesh is
`mergeGeometries(planes)` in code, but the *placement* comes from
`flowersReferencesModel`, a Blender GLB.

**What the reference's world actually costs, measured off the shipped GLBs** (32 uncompressed
files parsed directly; References files separated because they carry transforms, not
geometry):

| | |
|---|---|
| distinct authored meshes | **415** |
| total authored vertices | **127,289** |
| mean | **306 verts/mesh** |
| placement-only nodes in `*References.glb` | **450**, driving ~14 prop meshes |

And it is extremely lopsided:

| file | meshes | verts | what it is |
|---|---|---|---|
| `areas/areas.glb` | **266** | 70,875 | the 13 hand-built areas — 64 % of all meshes |
| `vehicle/*` (3 variants) | 52 | 17,546 | the car |
| `terrain/terrain.glb` | 1 | 16,641 | **baked, not modelled** — a heightfield grid |
| `poleLights` + `scenery` | 58 | 13,402 | the reference's emissive layer and set dressing |
| **the entire reusable prop library** | **~14** | **~2,000** | benches, bricks, fences, lanterns, 3 tree types, bushes, flowers, crates |

**That last row is the finding.** `bricks.glb` is **1 mesh, 56 verts**, placed 30
times. `benches.glb` is **1 mesh, 252 verts**, placed 21 times. Each tree type is 2
meshes of 130–170 verts, scattered 40–52 times. `bushesReferences.glb` has **130
placements of one mesh**; `flowersReferences.glb` has 108. The multiplication is
**Blender geometry nodes and duplication, not modelling and not code** — the tree
reference files contain realised `GN Instance` nodes, which is the scatter exported
as transforms.

**So the answer to "did the reference author build a lot with three.js" is no — but the reason the reference's
world was affordable is better than that hypothesis.** It is ~14 tiny prop meshes
reused 450 times, plus bespoke geometry for the areas themselves.

**Two savings that are already ours and that the reference's numbers include.** `Island.js`
scatters in code, so we skip the reference's entire `*References.glb` placement layer — 450
authored nodes we never author. And our terrain is procedural, which is 16,641 of
the reference's 127,289 vertices. Neither changes the hero-piece list; both cut the labour
around it.

> **A measurement trap, caught before it was reported.** Counting "distinct meshes"
> by mesh *name* gives 52 for the whole world and 15 for `areas.glb`, which is
> wrong by 5x. Blender names the mesh **datablock** `Cube`, `Plane`, `Cylinder`
> — the reference author renames the *object*, not the data — so `Cube.001` … `Cube.093` are 93
> genuinely different meshes that collapse to one under a `.\d+$` strip. Count the
> `meshes` array, never the names. Same class as *one word, two definitions*: the
> classifier was reasonable and the thing it classified was not what it looked like.

---

### The reference's 118 files against our 40 — the complete map, 20 August

Written because the reference's systems had been named piecemeal across three sessions and
never mapped. **The reference's `sources/Game` is 118 files / 28,754 lines; ours is 40 files /
8,251.** Every one of the reference's files is classified below as: **have** it, **out** by a
recorded decision, **scheduled** with a phase, or **undecided** — and the last
category is the point of the exercise.

**Legend:** ✅ ours exists · ❌ decided out · 📋 decided in, scheduled · ⚠️ **no
decision yet**

#### Core spine — essentially complete

| the reference's | lines | ours | |
|---|---|---|---|
| `Game.js` | 276 | `core/Game.js` (584) | ✅ |
| `Ticker.js` + `Time.js` | 155 | `core/Ticker.js` (62) — merged | ✅ |
| `Events.js` | 64 | `core/Events.js` (51) | ✅ |
| `Viewport.js` | 48 | `core/Viewport.js` (108) | ✅ |
| `Rendering.js` | 184 | `render/Renderer.js` (185) | ✅ |
| `PreRenderer.js` | 34 | folded into `Renderer.warmup()` | ✅ |
| `Debug.js` | 90 | `core/flags.js` + `debug/ColorGate.js` | ✅ |
| `utilities/ObservableSet` / `ObservableMap` | 68 | not needed — `Input.setFilters` replaces it | ❌ |
| `Quality.js` · `Options.js` · `Monitoring.js` | 203 | — | ⚠️ **quality scaling, user settings, perf telemetry** |

#### Input — landed 20 August

| the reference's | lines | ours | |
|---|---|---|---|
| `Inputs/Inputs.js` + `Keyboard.js` | 381 | `core/Input.js` (255) | ✅ |
| `Inputs/Nipple.js` + `InteractiveButtons.js` | 392 | — | 📋 Phase 5 touch (decision 41) |
| `Inputs/Pointer.js` | 195 | partial — pointer only sets the device mode | ⚠️ |
| `Inputs/Gamepad.js` | 437 | — | ⚠️ **gamepad support was never decided** |
| `Inputs/Wheel.js` | 16 | — | ⚠️ the reference's is camera zoom; ours has none |
| `InputFlag.js` | 216 | — | ❌ decision 27 |

#### Physics, vehicle, camera — complete

| the reference's | lines | ours | |
|---|---|---|---|
| `Physics/Physics.js` | 313 | `world/Physics.js` (153) | ✅ |
| `Physics/PhysicsVehicle.js` + `World/VisualVehicle.js` | 1,136 | `world/Car.js` (710) — merged | ✅ |
| `Player.js` | 676 | split across `Game.js` / `Car.js` | ✅ |
| `Respawns.js` | 67 | `Island.spawns` / `closestSpawn` | ✅ |
| `View.js` | 788 | `world/View.js` (410) | ✅ |
| `Reveal.js` | 236 | `render/Reveal.js` (87) + `render/Intro.js` (233) | ✅ |
| `Physics/PhysicsWireframe.js` | 58 | — | ⚠️ collider debug view |

#### Rendering and materials

| the reference's | lines | ours | |
|---|---|---|---|
| `Materials/MeshDefaultMaterial.js` | 135 | ported into `render/materials.js` | ✅ |
| `Materials/MeshGridMaterial.js` | 156 | `makeVoidMaterial` | ✅ |
| `Fog.js` | 49 | `render/Sky.js` (129) | ✅ |
| `Ligthing.js` | 214 | `render/Lighting.js` (93) | ✅ |
| `TextCanvas.js` | 112 | `render/textPlate.js` (168) | ✅ |
| `Materials.js` — the **name → material registry** | 366 | partial | 📋 Phase 3 (`F` rec 6) |
| **`Noises.js`** | **292** | `render/Noises.js` (168) | ✅ **built 21 Aug** — perlin only; the reference's voronoi and hash wait for a consumer |
| `Passes/cheapDOF.js` | 57 | — | ⚠️ depth of field |

#### World

| the reference's | lines | ours | |
|---|---|---|---|
| `World/World.js` | 244 | folded into `Game.js` | ✅ |
| `Terrain.js` + `World/Floor.js` | 341 | `world/Terrain.js` (530) + `Island.js` (483) | ✅ |
| `Water.js` + `World/WaterSurface.js` | 493 | `world/Water.js` (65) — the reference's carries ice, ripples and splashes | ✅ |
| `World/Grid.js` | 101 | `world/VoidGrid.js` (32) | ✅ |
| `Zones.js` | 81 | replaced by the `Area` radius (`D` §2.4) | ✅ |
| `Trees` `Bushes` `Benches` `Bricks` `Fences` `Lanterns` `Scenery` | 527 | **one `Island._buildProps`** | ✅ |
| **`Wind.js`** | **77** | `render/Wind.js` (85) | ✅ **built 21 Aug** — decision 31 |
| `Weather.js` | 229 | — | 📋 partial — it drives wind and rain |
| `World/RainLines.js` | 257 | — | 📋 decision 30 IN, not built |
| `World/PoleLights.js` | 141 | — | 📋 Phase 3 emissive layer (decision 13) |
| `World/Leaves.js` | 305 | — | 📋 decision 12 — autumn leaves, in, not built |
| `World/Grass.js` | 210 | — | 📋 decision 32 — available, not budgeted |
| `World/Snow.js` · `Lightnings.js` · `Tornado.js` + `VisualTornado.js` | 1,392 | — | ❌ decision 33 |
| `World/Whispers.js` + `Server.js` | 660 | — | ❌ decision 27 |
| `World/Flowers.js` · `Foliage.js` | 397 | — | 📋 **decided 21 Aug** — `Foliage` + the see-through, when foliage art exists. Was ⚠️ undecided |
| `World/Confetti.js` | 183 | — | ⚠️ **`B` flags it as worth stealing** |
| `Trails.js` · `Tracks.js` · `Explosions.js` · `Fireballs.js` · `Bubble.js` · `WindLines.js` | 1,095 | — | ⚠️ **the VFX layer** |
| `World/ExplosiveCrates.js` | 189 | — | ⚠️ gameplay prop |
| `Geometries/*` | 277 | — | ⚠️ generated geometry helpers |

#### Areas

| the reference's | lines | ours | |
|---|---|---|---|
| `Areas/Area.js` + `Areas.js` | 258 | `world/areas/{Area,Areas}.js` (381) | ✅ |
| `Areas/ProjectsArea.js` | 1,555 | `areas/ProjectsArea.js` (805) | ✅ |
| `InteractivePoints.js` | 663 | `areas/Beacons.js` (237) | ✅ |
| `Areas/CareerArea.js` | 375 | — | 📋 decision 24, Phase 3 |
| `Areas/SocialArea.js` | 317 | — | 📋 the contact area, Phase 3 |
| `Areas/LandingArea.js` | 272 | — | 📋 Phase 3 |
| `Areas/AchievementsArea.js` | 348 | — | 📋 decision 26 |
| `Lab` `Circuit` `Bowling` `Cookie` `Altar` `Toilet` `Easter` `BehindTheScene` `TimeMachine` | 5,211 | — | ❌ decision 23 — not our six |
| `RayCursor.js` | 219 | — | ⚠️ **world-space mouse picking** |

#### UI and chrome — the largest undecided cluster

| the reference's | lines | ours | |
|---|---|---|---|
| `Overlay.js` | 142 | `core/Veil.js` (70) | ✅ partial |
| `ClosingManager.js` | 109 | the `close` action, landed 20 Aug | ✅ partial |
| `Map.js` | 192 | — | 📋 decision 40, end of Phase 3 |
| `Achievements.js` | 630 | — | 📋 decision 26 |
| `Audio.js` | 769 | — | 📋 decision 29, synthesis-first |
| `Modals.js` · `Menu.js` · `Tabs.js` · `Notifications.js` · `Title.js` | **872** | — | ⚠️ **nothing decided. Does the site have a menu at all?** |
| `KonamiCode.js` | 77 | — | ❌ decision 28 |
| `Easter.js` + `BlackFriday/*` | 514 | — | ❌ seasonal stunts |

#### Pipeline — all Phase 3

| the reference's | lines | ours | |
|---|---|---|---|
| `References.js` + `Objects.js` | 412 | `pipeline/` (4 files) | ✅ **parsing built 21 Aug**, validated against all 64 of the reference's GLBs. Body creation waits for a `Physics` seam |
| `ResourcesLoader.js` | 123 | — | 📋 Phase 3 block A |
| `InstancedGroup.js` | 119 | — | 📋 Phase 3 instancing pass |

#### What the map shows

**About 8,000 of the reference's 28,754 lines are already decided out** — Whispers and the
server, snow/lightning/tornado, the nine areas we do not have, Konami, the seasonal
stunts. **Another ~3,500 are scheduled with a phase.** The core spine, input,
physics, vehicle, camera and rendering are **done**.

**What is left undecided is ~4,300 lines across seven clusters** (was eight and
~4,700 — `Foliage`/`Flowers` was decided on 21 Aug), and they are not evenly
important:

1. **UI chrome** — `Modals`, `Menu`, `Tabs`, `Notifications`, `Title` (872). The real
   question underneath is whether the site has a menu at all. `Card.js` already
   notes that `aria-live="polite"` "belongs to a notifications layer that does not
   exist yet".
2. **The VFX layer** — `Trails`, `Tracks`, `Explosions`, `Fireballs`, `Bubble`,
   `WindLines`, `Confetti` (1,278). `B` singles out `Confetti` as worth stealing,
   and `Tracks` — tyre marks on the ground — is the one that would show on every
   single drive.
3. **Gamepad** (437). Never decided, and it is a reach question rather than a
   feature one.
4. ~~**Vegetation detail** — `Flowers`, `Foliage` (397).~~ **Decided 21 Aug**:
   `Foliage` is in, together with the reference's drive-under-it see-through, scheduled
   against foliage art existing. Michael asked for it after driving under a tree.
   So it is **seven clusters undecided, not eight**.
5. **`RayCursor`** (219) — world-space mouse picking. We chose a DOM button
   instead, so this is probably a clean "no", but it has never been said.
6. **Quality / Options / Monitoring** (203) — quality scaling, user settings, perf
   telemetry.
7. **`ExplosiveCrates`** (189) — the only gameplay prop of the reference's we have not ruled on.
8. **`cheapDOF`** (57) and `PhysicsWireframe` (58).

**None of these blocks Phase 3.** They are listed so the next person does not
rediscover them one at a time, and so the two that plausibly matter — the VFX layer
and the menu question — get decided deliberately rather than by omission.

---

### The palette file — 20 August, the first Phase 3 code item

Decision 14 built and shipped: **`public/palette.png`, 128 × 4, 156 bytes**, 32 slots
of four pixels, 16 assigned at the indices they already had, 16 magenta headroom.
Michael can put it in a Blender image node today; that was the whole point, since
decision 37 bakes palette UVs there and there was no file to bake against.

**Verified against the reference's, not against the report.** `reference/source/static/palette.png`
was decoded pixel by pixel rather than read about, and it confirms `F` §5.2 to the
digit — 24 bands, 8 black, every band flat across its 4 px, the row-to-row ±1 noise
of something painted rather than generated (bands 1, 2, 15, 16, 17, 20, 21).

**Which file is the source of truth: `palette.js`, and the arrow is one-way.** The
PNG is generated by `npm run palette` and checked by `npm run palette:check`. Three
reasons, and only the first is decisive: `makeTextMaterial`, `makeWaterMaterial`,
`Lighting` and `Reveal` all build `THREE.Color` uniforms **synchronously at
construction**, so an authoritative PNG would put a network load in front of every
material in the project. The other two are that a hex array diffs and a PNG does not,
and that `COLOR.foliageDark` cannot survive a round trip through an image.

**`F` §5.5's "the file has to win eventually" is honoured, not dodged.** Its point is
that a 1-px band bleeds through KTX2 — which is an argument about the *shipped
artifact*, and it is satisfied by the four-pixel bands. When the asset build lands
(Phase 3A) the runtime samples `palette.ktx` compiled from this PNG instead of the
`DataTexture`, and that swap is lossless precisely because each slot is one aligned
4×4 block. The array stays where colours are edited; the file becomes what is read.
`palette:check` exists to stop them drifting in the window where both are live, and
**it was tested by corrupting one pixel** — it named `(13,0)` and exited 1.

**Two deliberate deviations from the reference's file.**

- **Headroom is magenta, the reference's is black.** Black is a colour we already have at index
  15, so a UV island that slipped past the assigned range would land on something
  that *looks* deliberate. `#ff00ff` cannot. It costs nothing — magenta is unaffected
  by the encode in `KNOWN-ISSUES.md` 22, and any slot is overwritten when assigned.
- **One PNG, not the reference's `resources/` + `static/` pair.** The reference's split exists because the reference's
  PNG is hand-painted and therefore a source. Ours is generated, so the source is
  `palette.js` and a second copy would only be a second thing to drift.

**The measurement, one script both sides.** `paint()` had to keep landing on the same
colours even though the format changed under it. Three sections, run unchanged before
and after off the same `sessionStorage`-stashed source, gated on `is-ready`:

| | before | after |
|---|---|---|
| texture | 16 × 1, 1-px bands, 16 slots | **128 × 4, 4-px bands, 32 slots**, four identical rows |
| `paint()` u, index 0 → 15 | 0.03125 … 0.96875 | **0.01563 … 0.48438** — every one moved |
| GPU colour for those 16 | `#344623` … `#040406` | **identical, all sixteen** |
| palette-sampling meshes | 12 (14,777 verts) | 12, **byte-identical UV → colour maps** |

The GPU column is a real readback, not a model: 16 quads through the real `paint()`,
shaded by the identical `texture(paletteTexture(), uv()).rgb` expression
`makeContentMaterial` uses, into a **half-float** RenderTarget — 8-bit would have
quantised the dark entries away before they could be compared — and `gpu === cpu` on
both sides, which is what licenses the CPU nearest-sampling model used for the
whole-scene sweep.

**Three things the harness had to get right, all of them already written down.**
The tab was occluded the whole time (`hidden: true`, `frame: 0`), and the first
attempt burned a 45 s CDP timeout on an rAF-paced liveness check before storing
anything. The fix was not a foreground window: **nothing here is a screenshot**, so
the probe was made frame-independent and says so in its own output. Areas build
lazily, so a bare boot has no plaza in it and the sweep would have missed six meshes
— every area is force-built first, on both sides. And the probe reads `paint()`'s `u`
back off a throwaway quad rather than recomputing it, so it never carries its own
copy of the formula under test.

**One artifact worth naming so it is not rediscovered as a bug.** Six of the eighteen
meshes changed in the raw diff — the four text plates, the void grid and the water.
All six are `MeshBasicNodeMaterial` with UVs spanning 0…1, and at `u = 1.0` the
lookup moved from texel 15 to texel 127, which is now headroom magenta. **None of
them sample the palette**: `paletteTexture()` is read in exactly one place,
`materials.js:76`. The probe reported a palette colour for meshes that never look one
up, and it was meaningless in *both* runs.

**And it found `KNOWN-ISSUES.md` 22** — `THREE.Color.set()` returns linear
components, so `paletteBytes()` writes linear bytes into a texture tagged sRGB and
the world renders every albedo about 6× dark in linear (`#7d8f68` → `#344623`). It
was **preserved bug-for-bug** so this change moved nothing on screen, and it is a
look call. It does not block Blender work: **UV islands address slots, not colours.**

---

### The scale reference — 20 August

`public/scale-reference.glb`, 16.9 KB, eight objects, from `npm run scale-ref`.
The point of it is that **it types no numbers**: the tool imports `BODY`,
`CHASSIS_PARTS`, `WHEEL`, `WHEEL_MOUNTS`, `HALF` and `REST_HEIGHT` from `Car.js`,
`BOARD` / `TITLE` / `POST` / `TOTAL_HEIGHT` from `ProjectsArea.js`, `CELL` from
`Terrain.js`, and the rig from `View.js` + `Renderer.js`. Those constants were
private; making them exports is most of the diff, and it is what makes the ruler
unable to drift. Node imports `three/webgpu` cleanly, so the tool runs the same
code the browser does rather than a reimplementation of it.

**Everything in it was verified against the running build, not just derived.**

| | derived by the tool | measured live |
|---|---|---|
| ride height | 1.135 (recorded) | **1.135** after 240 pumped frames |
| chassis | 120 verts, 1.70 × 1.19 × 3.35 | **1.70 × 1.19 × 3.35**, 120 verts |
| frame 16:9 | r 30.00, near 17.83, far 35.10, ahead 17.56 | **identical, all four** |
| frame 3:4 | r 42.33, near 10.61, far 20.89, ahead 24.78 | **identical, all four** |
| frame 9:19.5 | r 55.67, near 8.59, far 16.91, ahead 32.59 | **identical, all four** |

The ride height is worth a sentence, because it is the one number that could have
been circular. It is **not** derivable from the constants — at full suspension
extension the body would float `restLength + radius` = 1.30 clear, and the missing
0.165 is the spring under load — and it is not written at spawn either: `respawn()`
sets `y = max(t.y, 0) + 3`, so the car is **dropped from three units up** and falls
to equilibrium. Reading exactly 1.135 after four seconds of pumped physics is a
measurement of the equilibrium, not a read-back of a constant.

**Two numbers in the roadmap's own bullet turned out to be wrong, and both are the
same mistake — describing a part as though it were the whole.**

- **"car (3.1 × 1.7)" is the body box, not the car.** The spoiler runs to z 1.80
  and the wheels to x ±0.98, so the silhouette that has to fit through a gap is
  **1.96 wide × 2.01 tall × 3.35 long** — 15 % wider and 8 % longer. A doorway
  modelled to 1.70 clips both front wheels. The GLB now carries the whole
  silhouette, and `Car.CHASSIS_PARTS` exists so it cannot fall behind
  `_buildVisual` again.
- **"the 35.1 × 17.6 frame rectangle" is a trapezoid.** 35.10 is the width at the
  *far* edge; the near edge is 17.83. Emitting the true shape costs nothing, and
  the rectangle version overstates the near field by a factor of two — which is
  exactly the error that produced `KNOWN-ISSUES.md` 23.

**And that is the substantive finding of the session: the plaza does not fit in
portrait.** The outer two monoliths run 39 % off screen on a 3:4 tablet and 73 %
off on a 9:19.5 phone, measured with real geometry through the real camera at four
aspects. The claim that they fit compared the boards' span at 5.5 units ahead
against the frame's width at 24.8 units ahead. Full numbers, the correct figure to
size the arc against, and the three levers are in `KNOWN-ISSUES.md` 23. **It is a
design call, not a repair**, and it is now decidable during Phase 3 authoring
instead of after decision 41's device test in Phase 5.

**Node names deliberately avoid the `^ref` vocabulary** — nothing in the file is
called `ref`, `physical` or `cuboid`. It is a Blender reference and must never be
importable as level data, which matters because the `^ref` parser is the next item
on this track.

---

### The `^ref` import path — 21 August

`src/pipeline/`, four files, and the reason it went in before there is any art to
import is that it is the gate on Michael's work landing at all.

- **`names.js`** — the whole format as **pure functions**. A name goes in, a
  description comes out; no three, no game state. That is what makes the layer
  testable a month before the first model exists.
- **`References.js`** — the reference's `Map<key, Object3D[]>`, plus `F` rec 1's assertion.
- **`Objects.js`** — the physics-name branch and the collider-child loop.
- **`split.js`** — `<name>References/Visual/Physical.glb`, adopted now because
  `F` rec 2 is right that retrofitting it after a world exists is painful.

**It is validated against the reference's data, not against the spec.** Two checks, both
headless, both in `npm run check`:

| | |
|---|---|
| `check-names` | all 64 GLBs, 3,084 nodes. Agrees with `F` §1.8 on **all nine** regex counts — 422 references, 302 physical, 240 dynamic, 14 kinematic, 454 cuboid, 86 tube, 20 hull, 4 ball, 4 trimesh |
| `check-pipeline` | the real parser over the reference's `areas.glb` through a real `GLTFLoader`. Agrees on collider shapes, body types, all five userData keys, and 110 reference keys over 210 objects |

`GLTFLoader.parse()` runs under node once `self` is shimmed, which is what made
the second one possible without a browser. Worth remembering — it takes an
`ArrayBuffer` and never touches the network, and only texture decoding fails.

**Four corrections to `F` §1, all made in place, all chased to the byte before
being called corrections.** In three of them F is a correct count of something
slightly different — F counts *names*, the pipeline counts *what gets created* —
and the fourth is a wrong worked example.

1. **§1.1's "214 `ref*` objects in `areas.glb`" is 210.** Every `^ref` node in
   the file matches the full regex, so no counting rule reaches 214. **214 is the
   `.blend`'s figure**, which §1.0 states correctly two pages earlier — confirmed
   by counting unique `OBref*` names in `source.blend`: exactly 214, of which
   110 carry a `.NNN` suffix. A `.blend` number was attributed to a GLB. Its
   **110 distinct keys is right**, and only right *because* of the depth rule:
   counted naively it is 111.
2. **§1.3's 191 cuboids is 191 names but 186 colliders.** Five of them —
   `cuboid.082`–`.086` — are scene roots rather than children of a physical
   object, which §1.8 already identifies as orphans "parsed and silently
   dropped". Same shape for §1.2's 120 physical nodes: **119 bodies** are built.
3. **§1.6's `preventFrustum` ×11 is 12 at runtime, and the reason is an
   authoring trap worth more than the count.** Eleven *nodes* carry the property.
   The twelfth, `refBonfireBurn.001`, carries none — its **mesh datablock** does
   (`Plane.003`) — and `GLTFLoader` copies mesh extras into `userData` too. In
   Blender a custom property can sit on the Object or on the Object Data, both
   export, and **only the Object one is safe**: a mesh datablock is shared
   between duplicates, and `.001` duplication is the ergonomic core of this
   format. One property on the data would propagate across a whole prop family.
4. **§1.2's worked example is the wrong mechanism.** It says `BowlingArea.js:84`
   asks for `items.get('pinPhysicalDynamic')` *because of depth*.
   `refPinPhysicalDynamic` is a **direct child** at depth 2; it keeps its physics
   words because it carries **`preventAutoAdd`**, so `Area.js:40` skips
   `addFromModel` and the rename never runs. There are two independent ways to
   keep the words and F conflates them. **And the depth path has no worked
   example at all** — `areas.glb` contains *zero* nodes that are both `ref*` and
   `physical*` below depth 2. The stripping half is real and load-bearing (it is
   what turns 16 keys from `lettersPhysicalDynamic` into `letters`); the
   words-survive-by-depth half is a code path nothing in the reference's world exercises.

**The dev assertion is tested by being made to fire.** The reference's 210 reference names
are clean, so the guard would never have run in either check — the same problem
`palette:check` had. Four deliberately broken names now go through it every run
(`refLine001_1`, `ref_My_Thing`, `ref1`, `ref`), plus one that must stay silent.

**And that test immediately found dead code in the assertion itself.**
`ref_My_Thing` — which is what the loader makes of `ref My Thing`, the exact
mistake `F` §1.0 spends a paragraph on — **matches the regex**: `_My_Thing`
contains no digits, so it is a legal group 1, and it quietly produces the key
`_My_Thing`. Diagnosing only *regex failures* misses it entirely, and
`References.parse` was short-circuiting before the diagnosis ran anyway. Both
fixed: the diagnosis now also flags names that parse to a suspicious key, and it
runs whether or not the name matched.

**What is deliberately not done.** Nothing creates a Rapier body yet.
`world/Physics.js` has no generic "add a body from a description" seam — every
body today is built ad hoc by `Car`, `Island` or an `Area` — and inventing that
API with no second caller would be guessing. `parseModel` stops at a description,
which is the contract; wiring it belongs with `ResourcesLoader` in Phase 3A.

---

### The sunken-plaza test — 21 August

> **Judged 23 Aug: the plaza ships flat, `#sink=0`.** Michael's rule was "most
> similar to the reference's", and the reference's areas all stand on flat land — a sunken plaza exists
> nowhere in the reference's build; the reference's carved ground is the water channels and always holds
> water. The mechanism, the sweep and the budget below stay valid as the
> groundwork for art-phase carving, and `#sink=` stays as its lever.

`KNOWN-ISSUES.md` 18's remaining half, built as a mechanism and swept. ~~The
depth is a look call and it is open~~; what is closed is everything about it that
is not a matter of taste — and, since 23 Aug, the depth too.

**A basin, not a channel.** The carving already in the world is a polyline with a
smooth cross-section — full depth on the centreline, easing to zero at the bank.
A circular one is therefore a **dish**, and a dish is the wrong shape for a
plaza: the three boards at radius 9.3 would each stand at a different height and
the car would roll to the middle. A basin is **flat to `floorRadius`, then a
smooth rim**, and the sweep asserts the flatness — board spread stays exactly
**0.000** at every depth, which is what makes it a basin rather than a dish.

**The rim run is derived from the depth, never authored**, by the same rule
`halfWidthFor` uses for a bank. That rule is what `KNOWN-ISSUES.md` 18's
peak-curvature fix bought, and authoring the two independently is the mistake
Michael found by feel the first time. It holds: measured on the **sampled 1.5-unit
collision grid** rather than the analytic surface, the rim peaks at **0.263** at
its steepest depth, against the 0.273 of the trunk channel Michael drove without
complaint and the 0.405 the reference author called rugged.

**The budget is a third number, and neither of the first two survives.**

| | | |
|---|---|---|
| **0.30** | dry | past it the floor is under `WATER_SURFACE` and the plaza has water in it — not a failure, it is the mechanism the reference's whole map is built from, but it is a choice about *this* place |
| **1.21** | props stay off the rim | **the one that actually binds.** Past it the rim leaves the 20-unit clearing and `Island` scatters trees down the slope |
| 1.50 | floor | `WATER_FLOOR`, and nothing drowns at any depth since decision 43 was withdrawn |

`KNOWN-ISSUES.md` 18 had it as 0.3, corrected it to 1.0 against the drowning
line, and the drowning line was then removed on 20 August — so the number it
records was stale in both directions. `assertBasinsClear` throws at boot naming
the deepest sink that fits, and **it was tested by being made to fail**: it
builds at 1.21, refuses at 1.25.

| sink | rim grad | rim ends | floor y | water | stack top ndc |
|---|---|---|---|---|---|
| 0.00 | 0.136 | 13.3 | 0.000 | — | 0.800 |
| 0.30 | 0.195 | 15.0 | −0.300 | — | 0.762 |
| 0.45 | 0.221 | 15.8 | −0.450 | 0.15 | 0.744 |
| 0.60 | 0.200 | 16.6 | −0.600 | 0.30 | 0.725 |
| 1.00 | 0.262 | 18.8 | −1.000 | 0.70 | 0.675 |
| 1.21 | 0.259 | 20.0 | −1.210 | 0.91 | 0.650 |

**Verified on the running build, not just derived.** At `#sink=0.6` the game's
sampled grid reads −0.600 at the plaza centre — analytic and sampled agree
exactly, so the collider matches the render mesh — and the car settles at a ride
height of **1.1351**, identical to flat land. The framing model lands on the
measured value: stack top **0.800** flat and **0.725** sunk against **0.8004** and
**0.7248** measured through the real camera at 16:9.

**Two things the harness got wrong first, both worth keeping.**

- **A cache-busting re-import is not isolation.** `flags.js` parses the hash once
  at module load, so a fresh `Terrain.js` still resolved the *cached* `flags.js`:
  every row of the first sweep measured the same world, the table filled in, and
  every line was identical and wrong. It is one child process per depth now, and
  the **`applied` column** is read out of the terrain the child actually built
  rather than the depth the parent asked for, so that failure cannot return
  quietly.
- **The guard was written against the wrong radius.** `CHANNEL_KEEP_OUT` is 21
  and the plaza's `clearing` is 20 — deliberately different, because a channel
  must clear the plaza by more than a tree does. Asserted against the keep-out,
  the guard did not fire at a sink of 1.3 whose rim reached 20.5: past the
  clearing, inside the keep-out, props on the slope and nothing said so.

**One retyped number was removed on the way.** The basin's floor radius came out
of `plazaFloorRadius(def, count)`, newly exported from `ProjectsArea` and used by
`_floorGeometry` itself, so the basin cannot end up narrower than the disc drawn
on top of it — which would leave the outer boards standing on the rim, the exact
failure a basin exists to avoid.

---

### Ambient motion — 21 August

> **Judged 23 Aug: the amplitude ships at the default 0.5.** Michael's rule was
> "most similar to the reference's", and 0.5 is the reference's constant at the reference's gust rate — nothing
> shipped changed. The caveat that survives: the reference's wind rotates leaf cutouts, ours
> bends solid crowns, so the same number acts on different geometry.

Mechanism 1 and mechanism 2 from *How the reference's animation works*, which we had none of:
`src/` published **no time uniform to TSL at all**, so nothing in our world moved
on shader time. Now the tree crowns do, and the machinery underneath is the part
that matters — it is what `Grass`, `Leaves`, `RainLines` and the water ripples
all plug into later.

**Three pieces.**

- **`render/Noises.js`** — a 128 × 128 periodic perlin, rendered once at boot by
  a `QuadMesh` into a `RenderTarget` and never loaded. 64 KB of VRAM, zero bytes
  of download. Three details in the reference's are load-bearing and none is obvious:
  `RendererUtils.reset/restoreRendererState` around the render, `setPixelRatio(1)`
  first (a `QuadMesh` renders at the renderer's DPR, so on a 2× display the tile
  generates at half size into a corner), and `RepeatWrapping` — without which the
  field clamps at the edge of the world.
- **`render/Wind.js`** — the reference's field, ported. Two perlin samples at different
  scales scrolling at different rates, summed. Its value is not that it sways a
  tree, it is that **everything sways coherently**: a gust crosses the island
  because every material samples one field at its own world position. Per-object
  wobble is the cheap alternative and reads as a collection of objects each doing
  its own thing, which is the impression this exists to remove.
- **Two time uniforms on `Ticker`, not four**, and the missing pair is a decision.
  The reference's other two are doubled by `Ticker.scale = 2`; `KNOWN-ISSUES.md` 6 put that
  scale in the physics instead. So **`TIME_FREQUENCY` is the reference's 0.1 written as 0.2**
  — the ×2 rule that entry records, and the one live instance of it. Ported the
  other way the wind would run at a quarter speed: slow enough to look like a
  bug, subtle enough not to be spotted as one.

**What it is verified by.** A CPU model of the field is a model; three things
were measured on the running build instead.

| | |
|---|---|
| the texture is real noise | mean **0.4998**, stdev 0.173, autocorrelation **0.993** at 1 px and **0.207** at 21 px — smooth and structured, neither a constant nor white noise |
| it tiles | worst wrap seam **0.0457** against a worst *interior* adjacent step of **0.053**. The seam is smaller than the noise's own largest step, so there is no discontinuity to see |
| the GPU actually moves it | **8,525 samples** of a 256 × 256 render differ between wind phases 0 and 0.6, and **exactly 0** differ between two renders at the same phase — so the difference is the wind and not render nondeterminism |

**The sway is a hinge weight, not a mask.** `Island` writes a per-vertex `sway`
attribute — 0 at the crown's base, rising with height, **squared**. Squared
matters: a linear ramp moves every vertex in proportion to its height and shears
a cone into a parallelogram. Squared, the bottom ring barely leaves the trunk and
the tip carries nearly all the offset. **280 of 2,772 prop vertices move (10.1 %)**;
trunks, rocks and buildings are all exactly 0, which is the reference's split too — `Trees.js`
winds `treeLeaves` and not `treeBody`.

The material hook is opt-in: `makeContentMaterial({ wind })` builds a second
instance for the props alone. Terrain, car and plaza carry no `sway` attribute
and have no business swaying, and writing a zero attribute across 14,777
vertices to keep one node graph uniform would be paying to move nothing.

**Amplitude is the open question and it is a look.** At the reference's strength of 0.5 a
tree tip travels a peak of **0.497 units** and a mean of **0.323** across 70
sampled tips — a lot for a crown 0.9–2.0 in radius. `#wind=` steps it.

**Two harness traps, both of which produced a confident wrong answer first.**

- **`readRenderTargetPixelsAsync` returns a buffer matching the target's
  *format*.** The perlin target is `RedFormat`, so the stride is **1**, not the
  4 an RGBA habit assumes. Reading `buf[i * 4]` ran off the end of the array, and
  because out-of-range reads decode through a half-float unpacker to *exactly
  0.0* rather than `NaN`, the result was a clean-looking report that three
  quarters of the texture was black. The tell was 12,288 zeros being exactly
  ¾ of 16,384.
- **A hidden tab has `reveal.radius` at 0, so content is clipped away.** The
  first GPU diff returned zero differing samples, which reads exactly like "the
  wind does not work". The render was not blank — 5,574 distinct colours — it was
  sky, because `main.js` gates the intro on `whenVisible()` and the reveal disc
  never opens. Setting `reveal.radius` before the capture is what made the
  measurement possible, and it is the same note `KNOWN-ISSUES` already carries
  about hidden tabs being legitimately empty.

**A defect this shipped with for a few hours, found by Michael asking whether
grass would help.** `offsetNode` was being passed the whole `positionWorld`, so
its `.xy` was **x and height** and the field ignored z entirely — a gust
travelling along one axis rather than across the ground. The reference's signature takes a
vec2 already on the ground plane and every one of the reference's callers obliges
(`Grass.js:175` passes `worldPosition.xz`, `Flowers.js:135` `positionLocal.xz`);
the convention lives at the call sites, not in the function, and reading only the
function is what missed it. **With ten scattered trees it was invisible. With
grass it would have striped**, which is exactly why the question was worth
answering with numbers instead of a yes. Re-verified after the fix: 8,286 samples
move, control still 0.

**Why more vegetation genuinely helps, measured rather than assumed.** The field's
correlation length is **1.7 world units** on the fine sample and **3.3** on the
coarse one — from the texture's own autocorrelation (0.207 at 21 px, one perlin
cell) against the sampling rate the wind uses. Our ten trees sit on 8,210 m² of
land, a mean spacing near **29 units**, so every tree is nine to seventeen
correlation lengths from its neighbour and each one samples an independent patch.
What is on screen now is the mechanism's *worst* case: ten objects wobbling
independently. Decision 32's 78,400 blades over the same land is a spacing of
**0.32 units** — five blades across a fine feature, ten across a coarse one —
which is the point at which a gust reads as a wave crossing the ground rather
than as per-object wobble.

**`Leaves` will not add that**, and it is worth not expecting it to: decision 12's
falling leaves are a particle system on the year cycle (mechanism 1 and 3), not a
consumer of the shared field. They add motion, not coherence.

**And one change that was made to prevent a future one.** `Ticker.advance(delta)`
now owns the per-frame bookkeeping that `_loop` used to do inline. Every headless
measurement in this project hand-pumps the ticker, and the moment the ticker owns
a uniform, that idiom silently stops updating it — the world advances, shader
time does not, and nothing driven by shader time moves in any capture. Pump
through `advance()` and it cannot happen.

---

### Foliage see-through — the reference's mechanism, captured 21 August, not built

Michael, after driving under a tree: *"i want our tree leaves to be like his too,
when we drive under it, it becomes transparent."* Read out of `Foliage.js` and
`Trees.js` rather than guessed, because the good part of it is not the idea — it
is two details that would take a session to rediscover.

**The whole effect is one alpha expression.** `Foliage.js:110-136`:

```js
const toVehicle = screenUV.sub(seeThroughPosition)
toVehicle.mulAssign(vec2(screenSize.x.div(screenSize.y), 1))   // circular, not elliptical
const distanceFade = smoothstep(edgeMin, edgeMax, toVehicle.length())
alpha = foliageSDF.mul(distanceFade.mul(threshold.oneMinus()).add(threshold))
alpha.subAssign(threshold)
```

which is `alpha = foliageSDF * lerp(threshold, 1, distanceFade) - threshold`, with
`threshold` 0.3. Far from the car `distanceFade` is 1 and it is the ordinary
cutout; on top of the car it is 0 and every fragment fails. **No second pass, no
sorting, no separate transparent material** — the cutout threshold simply rises
until nothing survives it.

**The detail worth having: the edges are derived from the camera radius, not
authored.** `Foliage.js:218-219`:

```js
edgeMin = 3  / view.spherical.radius.current * seeThroughMultiplier
edgeMax = 15 / view.spherical.radius.current * seeThroughMultiplier
```

So the hole is **3 world units fully clear and 15 fully opaque**, converted to a
screen fraction on the fly — it stays a constant *world* size as the camera pulls
back at speed, instead of growing with the zoom. At the reference's resting radius of 30 that
is 0.1 and 0.5. **Those numbers transfer to us unchanged**, because decision 15
put our camera at the reference's radius; `view.radius` is the same quantity.

`seeThroughPosition` is the car's projected screen position, copied per frame
from `visualVehicle.screenPosition` — `areas/Beacons.js` already projects the car
to screen for the interact prompt, so we have that machinery. `seeThroughMultiplier`
is per-instance and `Reveal.js` tweens it (0.5 for the cherry trees, 1 during the
intro), so the effect animates on with the world.

**This is two tasks, not one, and only one of them is cheap.**

1. **The see-through itself — small, ~1–2 h.** A uniform, a smoothstep, and
   something per-fragment to modulate. Our cones have no foliage texture, so the
   modulator would be a **screen-space hash** — which is exactly what the reference's unported
   `Noises.setHash()` exists for, and it is the five-line copy of `_render` that
   `render/Noises.js` already says it is skipping until something samples it.
   Dithered discard keeps the material opaque, so no sort order and no shadow
   problem. **It fixes the actual annoyance — losing the car under a tree —
   whatever the leaves look like.**
2. **Leaves that look like the reference's — a proper Phase 3 art task.** The reference's foliage is
   camera-facing alpha-cutout planes with a foliage texture, generated as a
   cluster (`Foliage.js` merges planes) and instanced. Ours are solid low-poly
   cones. That needs a foliage texture we do not have, the plane-cluster
   generator, and it touches decision 12 (autumn leaves) and the CC0 decision.

**They are coupled by look even though they are decoupled technically:** run (1)
on solid cones and a cone *dissolves* in a dither pattern rather than leaves
thinning out. That may read fine against a flat-toon world or may read as a
glitch, and it is a look call.

**Decided by Michael, 21 Aug: do them together, when the art exists.** *"Lets do
them when the art exists."* So this is not an open question — it is scheduled
against a trigger, the way the world-brightness re-judge is. **Do not build the
cheap half early** unless tree density goes up first and losing the car under a
canopy becomes a real annoyance; splitting it would mean judging a dither
dissolve on solid cones, which is not the effect anyone is asking for.

---

### The audit against the reference's build — 21 August

Run because Michael asked, after the `.xz` defect, whether anything else from
this session was missing or ported wrong. **The method is the lesson from that
defect: read the reference's call sites, not only the reference's functions.** Three things were wrong,
all three are fixed, and the rest is recorded so it does not get re-checked.

**Wrong, and fixed.**

1. **`offsetNode` was passed a vec3.** Above. Field ignored z; would have striped
   under grass.
2. **The sway weight ignored crown size.** `Grass.js:175` is
   `.mul(tipness).mul(height)` — a taller blade travels further in absolute
   terms. Ours gave every crown the same peak displacement whatever its size, so
   across a 2.4–5.6 range the small trees read as moving over twice as much *for
   their size* as the big ones, which is backwards. Now scaled by
   `crownH / mean`, normalised against the range so the amplitude Michael is
   judging did not move: peak 0.488 → **0.497**.
3. **`sleeping: true` was missing from the physical description.** `Area.js:47`
   starts every body asleep, and `areas.glb` alone carries 97 dynamic bodies.
   Waking all of them at boot means integrating a hundred props nothing has
   touched. It is in the description now rather than left for whoever builds the
   body to rediscover.

**Checked and correct, so nobody re-checks it.** Palette texture settings
(`NearestFilter` both ways, no mipmaps, `SRGBColorSpace`, default clamp wrap) are
the reference's `Game.js:107` exactly; the reference's `texture(paletteTexture).rgb` takes an implicit
`uv()` and is equivalent to ours; `paint()`'s `v = 0.5` matches what `F` §5.3
measured on every palette mesh the reference author ships. The `^ref` layer already agrees with the reference's
own data on nine counts. `preventAutoAdd`'s semantics match including the
explicit-`false` case; references are parsed on every child including skipped
ones; `addFromModel` runs on direct children only. `Noises` matches on
resolution, type, format, wrapping, the state reset and `setPixelRatio(1)`.
`Wind`'s angle, position frequency and two-sample structure are the reference's.

**Differences that are deliberate rather than defects.**

- **The reference's `Foliage` does not displace vertices at all.** `Foliage.js:104` feeds the
  wind's *magnitude* into `rotateUV` on an alpha texture — the reference's tree leaves are
  camera-facing planes with a cutout, so the leaves rotate rather than bend. Ours
  are solid cones, where that technique has nothing to act on, so `Grass`'s
  vertex displacement is the right analogue and the one we match.
- **Two time uniforms, not four** — decision 6.
- **We do not copy the reference's mis-parenthesised `preventFrustum` condition**, which
  force-adds on an explicit `false`.

**And one landmine found while reading, for whoever wires bodies to the
pipeline.** `Area.js:46` computes a body's position as
`child.position.add(this.model.position)`. `Vector3.add` is **in place**, so that
line mutates the child's own position as a side effect of reading it — every
object in an area is silently shifted by its area's offset. It works in the reference's
because nothing reads `child.position` again afterwards. Do not copy the shape of
that line.

---

### The loader path, end to end — 22 August

**Block A's gap is closed.** `src/pipeline/` parses; now something loads in
front of it and something builds bodies behind it. Three runtime pieces, one
generated fixture, a fourth `ok` line in `npm run check`, and the Draco half of
the asset build step. The day the lamp exists it has a proven road in.

**The three pieces, and where each deviates from the reference's on purpose.**

- **`src/pipeline/ResourcesLoader.js`** — the reference's 123 lines, same tuple format
  (`[name, url, type, modifier?]`), same URL-keyed forever-cache, same
  cache-hit-skips-modifier semantics (read off `Game.js:103/:132` and
  `KonamiCode.js:59`, not just the class). One defect not copied: the reference's
  `load([])` never settles — `progress()` is the only resolver and it never
  runs with zero files. `draco`/`textureKtx` loader types are deliberately not
  ported yet; `getLoader` is the seam they land in when compressed files exist.
- **`src/render/materialRegistry.js`** — `F` rec 6. `palette` is pre-registered
  by `Game.js` with **`contentMaterial`, not `propMaterial`**: authored GLBs
  carry no `sway` vertex attribute and the wind graph reads one. Deviation: an
  unknown material name is cached **as loaded** rather than auto-converted to
  our shading model — a prop rendering in stock PBR is a *visible* signal that
  a name missed the registry, where the reference's silent conversion would hide the miss.
  Material-level `prevent` is honoured (the reference's `Materials.js:362`).
- **`Physics.getPhysical`** — the reference's `Physics.js:85-240`, with the reference's defaults kept
  to the letter because the reference's `.blend` is authored against them: density 0.1 per
  collider (how an unmassed prop weighs something), friction 0.2, restitution
  0.15, category `object`, damping 0.1 both ways, body-level values winning
  over collider-level, `setMass(mass / colliders.length)` per collider, bodies
  born asleep, and the reference's exact category bitmasks. Deviation: an unknown category
  **throws** where the reference's passes `undefined` into `setCollisionGroups` and
  silently turns filtering off. Trimesh indices are coerced to `Uint32Array`
  (GLTFLoader can hand back `Uint16`) with a sequential fallback for
  non-indexed meshes. The car, island and bedrock keep Rapier's default groups
  and interact correctly with all three categories — checked, not assumed.

**Proven headlessly, against a fixture that carries every pattern at once**
(`tools/lib/fixture.mjs` → `npm run check-loader`). The GLBs go through the
**real `load()` path** as `data:` URLs — node's fetch resolves those — and into
a **real Rapier world** (`rapier3d-compat` initialises under node). Read back
from the live world, not from our descriptions: authored masses arrive (one of
them the string `"2"`, `F` rec 7), mass spreads across colliders, every body
starts asleep, category `floor` lands as `0x10001`, and a deliberately woken
ball falls 600 substeps onto the trimesh ground and rests at **y 0.500** —
ground top 0.1 plus radius 0.4, exactly. Guards were made to fail: a truncated
GLB rejects the load, a poisoned registry entry proves `prevent` discriminates,
a category typo throws naming the valid keys, and sabotaging `setSleeping` out
of the seam fails three checks.

**Two findings about the reference's data, learned building the fixture.**

- **References files are not `ref`-named.** `bushesReferences.glb` is 130 nodes
  called `Icosphere.NNN` — plain transforms. The `ref` vocabulary lives in
  area/scenery files; the split's references files are consumed positionally
  (`InstancedGroup`, `combineSplit`). Worth knowing before authoring one.
- **Blender object names are unique file-wide**, so a second bare `cuboid` in
  one file cannot come out of Blender — the reference's fences colliders are
  `cuboid.114`–`.130`. The fixture's first draft had five bare `cuboid`s and
  the loader de-duplicated them to `cuboid_1`, a world no export produces. A
  fixture should only contain worlds that can exist.

**The asset build step landed its Draco half** (`tools/compress.mjs`,
`npm run compress`), per rec 4: serial, `*References.glb` skipped entirely, an
embedded texture warned about rather than encoded (a valid export has none —
the palette node is muted), the reference's exact quantization (12/6/6/2/2), sibling
`-compressed.glb` outputs, and **readback verification as part of the step**.
**The KTX2 half landed the same day Michael okayed the install** — KTX-Software
v4.4.2 lives at `C:/dev/tools/ktx/bin` (on the user PATH; no elevation was
needed with an NSIS `/S /D=` install). `npm run compress` now writes
`public/palette.ktx` with the reference author's invocation verbatim and verifies it by
decoding the pixels back and comparing them to `paletteBytes()` byte for byte —
**all 512 pixels exact, zero delta**, which is decision 14's 4-px aligned bands
measured doing their job on our own file. `toktx` is deprecated upstream in
favour of `ktx create`; the verbatim line works in v4.4.2 and the script says
where to re-spell it the day it disappears. The runtime still reads
`palette.png` until the loader grows its `textureKtx` type with the first
compressed-build caller.

**The guard that could not fail, twice — a new shape for the fail-once rule.**
The compress readback first verified bounding boxes via glTF-Transform's
`getMin()`/`getMax()`, which return the accessor's **stored JSON bounds** —
Draco passes those through untouched, so the check compared metadata to
metadata and could never fire. Fixed to read decoded arrays, it *still* could
not fire: a box's vertices all sit on its bbox corners, and a quantization grid
always contains its own endpoints, so box-only test geometry is invariant under
the failure being guarded against. The fixture's ground became a subdivided
grid with interior vertices, verification became
nearest-original-vertex-over-a-spatial-hash, and now 2-bit sabotage fails while
12-bit passes. The lesson: **the assertion and the test data both have to be
capable of failing**, and only running the failure tells you whether either is.

**Also done:** the GLB writer extracted to `tools/lib/glb.mjs` (its second user
is the fixture) with the regenerated `scale-reference.glb` **byte-identical** —
same SHA-256 — so the refactor is proved rather than trusted; and the headless
recipe grew one line: `GLTFLoader.parse()` needs only `self`, but the full
`load()` path streams through fetch and fires `ProgressEvent`s, which node does
not have. `tools/check-loader.mjs` shims both.

**What is deliberately not done, and why.**

- **Nothing calls the loader at runtime yet.** The lamp session writes the
  glue: `load()` → `parseModel` → `registry.updateObject` → `getPhysical` →
  `scene.add`, plus the visual-follows-body sync (the reference's `Objects.update` copies
  translations per tick for awake bodies; ours should register with
  `Physics.interpolated` and use `alpha`, which is what it exists for).
- **`VITE_COMPRESSED` (rec 10) waits for its first caller** — it is three
  derived constants around a load call, and there is no load call.
- **`DRACOLoader`/`KTX2Loader` wiring plus `public/draco/` decoders (rec 9)**
  ship when the first compressed file does; wiring decoders to files that do
  not exist would be untestable.

---

### The runtime glue — 23 August

**The last piece is in: `src/world/Objects.js`, the reference's `Game/Objects.js` ported.**
`Game` now owns an `objects` instance wired between the loader, the registry
and the physics seam, with `syncVisuals()` ticking at `TICK.POST_PHYSICS`
beside `car.syncVisual`. Nothing in the shipped world calls `add` yet — the
first authored asset will — but the whole path is exercised headlessly in
`check-loader`: fixture GLBs through the real `load()`, `addFromModel`, into a
`THREE.Scene` and a live Rapier world.

The pipeline/world split settles the reference's one class into our two files:
`src/pipeline/Objects.js` is the naming half (pure, testable), this is the
orchestration half. Ported from `Area.js:40-66`, `Scenery.js:14-35` and
`Fences.js:19-52` — the three caller shapes — with the deviations documented in
the module: explicit deps instead of the Game singleton; **visuals follow
bodies through the interpolation seam** (the reference's raw per-tick copy quantises prop
motion to the physics clock — the same defect measured on the car at 148 Hz),
using the car's own shortest-arc nlerp; `addFromModel` returns `null` for
`preventAutoAdd` instead of trusting every caller to check first; and a merge
where the caller's non-undefined values win.

Proven with exactly computable interpolation cases: after one substep at
alpha 0 the visual draws the *previous* pose (y = 2.0000 while the body is at
1.9983), at alpha 0.5 it draws the midpoint to 1e-9, and a woken globe settles
its visual onto its body on the trimesh floor while every sleeping prop holds
still.

**The fail-once rule caught the check again, third time this block.** Deleting
the one-shot body→visual copy failed *nothing*, because every test placement
equalled its node's own transform — a placement that differs (the reference's `Area` offsets
every child by the area's position) is the only thing that makes the copy
falsifiable. One node now gets an area-style offset and the deleted copy fails
loudly. Same lesson as the box-bbox guard: **the assertion and the data both
have to be capable of failing.**

**What the lamp session now is:** a load call naming real files, one
`objects.addFromModel` loop over them, and — the moment a `-compressed.glb`
ships — `VITE_COMPRESSED`, `DRACOLoader` in `getLoader('gltf')` and the
`gltf/` decoders into `public/draco/`. Everything else already runs.

---

### The retint tool and the first found asset — 30 August

**Decision 47's tool exists and its first asset is in the world the same day.**
`tools/prep-model.mjs` (`npm run prep`) turns a found GLB into a game-ready one:
palette UVs on band centres (the same `paletteU` the runtime's `paint()` reads,
so the two paths cannot disagree), materials named for the registry, the naming
convention on the nodes, Y-up at authored height grounded on y = 0, and the
source's author/licence extras copied onto the output asset **so the credit
rides the file itself**, not just `CREDITS.md`.

**Two assignment paths, one per kind of found model.** Kit models (Kenney,
Quaternius) arrive with flat-coloured materials: each is snapped to the nearest
palette band in sRGB, and a colour further than 0.35 from every band **throws**
— a palette that cannot represent an asset is a decision, not a rounding error.
Sketchfab merges (the lamp: 1 mesh, 1 material, zero colours after
`materialmerger`) have nothing to snap, so the mesh is split into connected
components — union-find over position-welded triangles — and per-recipe rules
assign each component a band by its normalised height. The recipe is the
authored half; everything measurable is measured by `--report`.

**The lamp itself.** Michael's pick, and the inspection that approved it held:
CC-BY 4.0 with the attribution embedded by Sketchfab, no textures, 3,128 tris.
Two surprises, both now encoded in the tool: the wrapper node carries its
−90° X rotation as a *matrix*, which the world-transform bake absorbs (the
recipe says `up: 'Y'` — saying `'Z'` would rotate it twice; found by the
component report printing spans wider than the source's own bounds), and the
model splits into **four** clean components — roof cap, base-and-post, collar,
and the light chamber at 0.57..0.76 of its height. The chamber went on **band
12, emissive amber** — the entry the colour gate's verdict called out as used
by nothing — under material `paletteEmissive`, a registry name `Game` maps to
`contentMaterial` today and `PoleLights` will remap to a real glowing material
the day the emissive layer lands. The collider is one cuboid sized to the
pedestal (scale-is-size, the format's own property), not the wider roof, which
nothing 1.2 units tall can ever reach.

**Placement.** Two lamps flank the plaza's standing point at ±7 along the
across-screen axis — measured 4.6 units clear of the nearest board, inside the
20-unit scatter clearing, both in frame on arrival — through exactly the load
call and `addFromModel` loop the runtime-glue session promised. Cloned per
placement, because `parseModel` mutates.

**`check-prep` is the fifth suite** in `npm run check`: the colour snap proven
on a generated fixture with known colours, every guard made to fail once (the
no-answer colour, the rule typo, the rule gap, the bad axis, and `verify` fed
bytes with one UV nudged 1.5 px off-centre), the shipped GLB byte-compared
against its recipe (the drift guard, `palette:check`'s shape), and the real
file stood in a live Rapier world through `ResourcesLoader` — fixed, asleep,
0.675 half-extents read back from the collider, registry materials on both
primitives.

**`VITE_COMPRESSED` was measured and deferred, not forgotten.** Draco takes the
lamp 87,828 → 10,168 bytes (8.6×) — and the decoder the runtime would have to
ship costs ~360 KB, so at one model the switch is a ~280 KB net loss. The
sibling `-compressed.glb` is deleted rather than committed (it would ship in
`dist` as dead weight — the exact Phase 6 audit mistake). **Flip it when raw
model bytes pass ~0.5 MB**, where 8.6× starts beating the decoder; the seam
(`getLoader('gltf')`) is unchanged and waiting.

> **The criterion was met the same evening.** The buggy put raw model bytes at
> 1.62 MB, and it Draco-compresses 23.7× (1,529,536 → 64,612). Compressed
> models plus the decoder come to ~435 KB against 1.62 MB raw — the flip now
> saves ~1.2 MB and is the next code item. See the handoff.

---

### The car — 30 August, evening

**The hero asset is a found model, and the fit is the story.** Two candidates:
a Halo Warthog was declined — not on separability, which would have worked, but
on **licence** (a CC-BY tag on a fan model cannot launder Microsoft's vehicle
design, and the car is on screen in every frame) and on **register** (1.2 M
triangles against a world whose entire target payload is 1.4 MB). The second
find, Herrsher's *Foxter buggy* concept — original design, CC-BY, 38 K tris —
was accepted on a measurement: one uniform scale (1.657517) makes its wheel
radius **exactly** `Car.WHEEL.radius` (raw 0.253391 → 0.420000) *and* its
wheelbase 2.26 against the mounts' 2.24. The physics did not move; decision
19's wheelbase question stays open and now competes with "the found model
matched at 2.24".

**The tool grew the second extraction path.** The lamp needed connectivity
splitting because Sketchfab had fused it; the buggy kept its 202-node
structure, so `extract` selects **subtrees by node name** — the four road
wheels out (`Cylinder.012/.021/.042/.044`), everything else including the
tail-mounted spare into `buggyBody`, and one wheel recentred on its own axle
as `buggyWheel`. Explicit measured transforms (scale; translate) replace the
standing-prop normalise, and `verify` holds parts to recipe-authored triangle
counts instead of groundedness, which a wheel centred on its axle
deliberately fails.

**The first build shipped backwards, and Michael caught it by driving.** The
−Z end's roof structure was read as a steering wheel and its red lenses as a
front light bar, so the recipe turned the model 180° — *"our backwheels are
acting as front wheels."* The −Z end is the **tail**: rear-mounted spare, red
**brake** lights (the colour was the clue misread). The flip is removed, the
axles re-centred, and the orientation is now a *check* rather than a reading —
`check-prep` asserts the emissive lenses sit behind z −1.0, so turning the
car around again fails headlessly. Same lesson as ever: read twice, but
measure on the running build before calling it right.

**Colour snap did the entire palette job.** The source is olive drab and greys
— 37 of 38 materials land inside snap tolerance on the moss-and-slate bands as
if painted for them. The one refusal (the tail lights' red lenses, #a11500,
0.51 from every band) became the `snapOverrides` mechanism: by source material
name, to **amber under `paletteEmissive`** — so the brake lights join the lamp
chambers in glowing the day PoleLights lands.

**`Car` takes a `visual` now and generates only as a fallback.** The rig is
`buggyBody` in body-local space plus `buggyWheel` cloned per corner (right
pair turned 180° so the rim faces out; the spin axis survives the half-turn).
The generated box car remains for callers with no loader in front of them —
the scale-reference tool and the headless checks. Worth knowing: the real
footprint is now **~2.14 wide × 3.64 long** (wheels at ±0.82 plus a 0.50-wide
tyre), which supersedes the "1.96 × 3.35" the box car's silhouette measured —
anything sized against the car from here is sized against the buggy.

**Verified** in `check-prep` (byte-drift against the recipe, wheel radius
0.420 to 2 mm, tail lenses emissive and behind −1.0 z — the orientation
guard born from the correction above — attribution in the extras) and on the
running build: spawned facing the plaza, driven to the boards, wheels
planted, steering at the leading end.

---

### The nature packs — 31 August

> **Corrected the same day, by Michael driving it:** *"i dont think the trees
> match what the reference author has"* — and measured against the reference author's own `birchTreesVisual.glb`
> the reference author was exactly right. The reference's tree is a thin branchy trunk with **six instances
> of one 20-triangle icosphere** floating around its upper half — a
> constellation of puffs, not a solid crown — and no found model has that
> silhouette. **The found trees were pulled and trees are generated again, in
> the reference's construction** (`Island.TREE_SPECIES`: trunk + branches + blob cluster,
> two-tone per species including an orange-blobbed birch on a pale trunk, the reference's
> `World.js:69-71` idea in our palette). The packs' contribution settled as
> the undergrowth instead: bushes, the stump, **four mushrooms** (one with an
> emissive cap), **three flower daisies** (first shipped car-sized — a Mario
> prop in the plaza — and cut to flowerbed scale) and a grass tuft, scattered
> as a 26-count flora layer. The paragraphs below describe the day as it ran;
> the tree recipes they mention died in this correction.
>
> **A third pack followed the same afternoon** (Ragat Vdoo Kaf's forest pack,
> CC-BY): its opaque half delivered the island's first **found rocks** — four
> clean and four mossy stones replacing the generated icosahedrons, with a
> random uniform scale for variety — plus fallen logs, root snags, and four
> more mushroom species (fly agaric included). Its trees, bushes, ferns and
> dandelions are all **alpha-cutout sprite planes** and wait on the
> transparent foliage material (the reference's `Foliage` system, still unbuilt) — the
> first concrete consumer for that roadmap item. The placeholder box
> buildings also left the island the same day, on Michael's call: the areas
> bring their own architecture.

**Two packs, twenty props, one new tool capability.** Michael's finds:
artikora's *Prehistorical* pack (trees with separate trunk/leaves meshes, the
reason it was accepted) and anastasita.3d's *Medieval Environment* pack (42
cohesive props under one hand). Both CC-BY, both colour via **texture
atlases** — every baseColorFactor is white — which the colour snap could not
read. The tool's third assignment path closes that: `decodeTextures` (sharp,
already in node_modules) turns each embedded atlas into raw RGBA once per
pack, and every triangle samples it at its UV centroid, then snaps to the
nearest band exactly as a flat colour would. The medieval atlas is a stripe
palette — the friendliest case there is — and the prehistoric pack's painted
regions are near-flat, so centroid sampling lands cleanly on both. Proven in
`check-prep` on a generated two-stripe atlas: one material, two bands, which
no baseColorFactor could ever produce.

**Pack mode** is the second addition: one source read, one texture decode,
N verified game-ready GLBs (`prepPack`), each item a standing prop sharing
the pack's snap settings, with `nodes` partitioning an item into named output
nodes normalised in one shared frame — a tree's `treeBody`/`treeLeaves` keep
standing on the same ground, unlike the buggy's recentred wheel. The
partition throws if its lists miss geometry (guard made to fail in
check-prep), and every item is byte-compared against its shipped file.

**The snap's judgment was checked, not assumed** — a band-distribution
histogram per prop, and it read well almost everywhere: birch trunks landed
on white-bark colours, pine needles took the checker-placeholder override,
oak crowns came out two-tone foliage. Two systematic findings:

- **The palette had no brown.** Every piece of medieval timber snapped to
  accent warm — a world of bright-orange fences. Fixed at the source, not
  per-prop: entries **16 `wood` (#8a5f3c)** and **17 `woodDark` (#5e412a)**,
  the first spend of decision 14's sixteen headroom slots. 18 assigned, 14
  in reserve; `palette.png` and `palette.ktx` regenerated pixel-exact.
- **Amber means emissive, so the tool now says so.** A source colour that
  snaps to band 12 — the bonfire's flames, the streetlight's lamp glass, the
  axe blade's glint — rides `paletteEmissive` automatically: light sources
  by any honest reading, glowing the day PoleLights lands. The haystack,
  whose hay is amber-coloured but must never glow, is the override that
  proves the default (`snapOverrides: sand`).

**The island scatter places the real thing now.** `Island.build` takes the
loaded geometries; trees keep the exact hinge the cones had (squared height
inside the crown's own bounds, size-scaled against the mean crown so the
wind amplitude Michael judged is unchanged in the average), bushes and the
stump scatter like rocks (no colliders — soft ground detail), and the
generated cones survive as the no-loader fallback for headless callers.
Verified on the running build: oaks and birches standing over the shore,
crowns two-tone, trunks on the wood band with the flat-toon shadow side
reading correctly.

**Not taken, and why:** the prehistoric pack's mushroom set (bumper and
emissive shrooms — practically a playground-area kit; noted for decision
23's playground before it is designed), its skateboard/xylophone/watermelons
(a game's asset dump, not island fauna), and the medieval flowers/grass
(the flower clusters are authored at a scale that needs its own look at,
and grass is decision 32's shader system, not a prop).

---

### Still unmeasured

The four items that used to sit here are all **answered** — see *The instrumented A/B*
above. What is left is smaller and blocks nothing:

- **The reference's frictionSlip 0.9 against ours.** The one plausible remaining source of the
  66 deg / 88 deg braking gap, and cheap to check on our side.
- **Whether the turn-radius figures need re-taking.** Ours were measured at
  7.01 / 6.94 units against the reference's 6.37 / 6.39, before `KNOWN-ISSUES.md` 17 showed the
  steering sign was inverted. A mirrored turn should be symmetric and the numbers
  should stand, but they were taken in one direction only and nobody checked both.
- **What the reference's `zoom.baseRatio` actually rests at in a shipped session.** Ours reads 0
  from decision 13b; the clone's had drifted to 0.92 by the time it was sampled, so
  the absolute camera radius numbers taken in that session are not the reference's resting ones.
  The *constants* are solid: `radius.edges 15-30`, `nonIdealRatioOffset 9`.

---

## Immediate next actions

Rewritten 19 August. The previous list was fully stale — its first two items are
done, and its first item turned out not to be a bug at all (`KNOWN-ISSUES.md` #1).

1. ~~**Drive our own build in a genuinely foreground window.**~~ **Done, 19 August,
   and it paid for itself.** Michael drove it: 18,056 frames over 137 s at 164 fps.
   The reference's verdict — *"it felt okay, more similar to the actual car now"* — so the
   "deliberate rather than floaty" claim is **verified**, and 2a steps 1–2 are
   finished on the feel gate.

   Both camera defects hold up under real driving rather than arithmetic. **Zero
   off-screen frames**, worst excursion 0.377 against a frame edge of 1.0, where
   ω 5 had put the car at −1.18 driving toward the camera. Mean trail 1.17–1.46
   units against the 1.38 that `2v/ω` predicts. Camera radius ranged 30 → 33.66,
   which is 13b exactly. Turn radius re-measured at 7.01 / 6.94 units and
   113–116 °/s, confirming the documented figures.

   Three things came out of it that measurement alone had missed:

   - **The car shook, and the reference author found it by feel** — a 29.7 Hz solver artifact from
     decision 18's doubled `world.timestep`. Fixed by halving the substep to
     1/120; jitter 0.1178° → 0.0250° with top speed unchanged at 11.27. See
     `KNOWN-ISSUES.md` 14. A 6 Hz residual remains, traced to the trimesh terrain
     (`KNOWN-ISSUES.md` 4), and the reference author can still see it.
   - **Top speed was understated.** Clean straight runs reach **11.5–11.74 physics
     / 23.0–23.5 apparent**, not the 11 / 22 `world/View.js` claimed, and none had
     reached the asymptote. Corrected in place. `ZOOM_SPEED_EDGE.max` of 30 still
     sits above anything reachable, so nothing downstream moves.
   - **`respawn()` cannot rescue a car that left the world** — `KNOWN-ISSUES.md` 15.

   The harness itself was wrong twice before it produced anything, and both are
   worth remembering: the sampler called `.clone().project()` on `car.position`,
   which is a **Rapier** vector with neither method, so it threw every frame at a
   priority *ahead* of `TICK.RENDER` and froze the picture while the car drove on
   invisibly; and the first autopilot respawned in place, so it drove off the edge
   and measured freefall for three runs. Sample after render, and check `y`.
2. ~~**Run the instrumented A/B against the reference's local clone — headless.**~~ **Done,
   19 August, and it unblocked everything it was supposed to.** All four questions are
   answered, in full, in *The instrumented A/B* above. The short version:

   - **The reference's top speed is 11.005–11.028 physics m/s (22.0 apparent)** against our
     11.5–11.74. **The reference's turn radius is 6.37–6.39** against our 7.01/6.94. We are within
     5 % and 9 % of the reference author. The `topSpeed 5` figure is a soft knee, not a limit.
   - **The reference's camera trail is `v_apparent / 12`** — 1.834 units at cruise. Ours targets
     `v/10`, so ours trails 20 % further at matched speed. Feel call, scheduled below.
   - **The shore shelf is 6.75 units wide** (p10 4.05, p90 10.5), a 1.2-unit drop at
     about 10 degrees, measured two independent ways.
   - **There is no water respawn threshold and no out-of-world catch at all.** Water
     is drivable at exactly half top speed; the bedrock is a follower floor, not a
     wall; recovery is `getClosest` over 18 authored respawn points.

   It also corrected three things we had asserted from source: the reference's wheelbase is **1.8**,
   not 2.24; the reference's terrain heightfield is **flat land at y = 0** with relief only in the
   shore dish; and the reference's bumper collider is not a nose-guard. And the harness technique
   is worth keeping — `#skip` in the hash defeats the click gate, and hand-pumping
   `ticker.update` at a forced 1/60 makes `document.hidden` irrelevant.
3. ~~**Then step 3, `Fog == sky`.**~~ **Done 19 Aug** — `render/Sky.js`, wired through
   `materials.js`, `Game.js` and `View.js`. Independently derived and it landed on the reference's
   band (32.44 / 63.85) and the reference's day fog (42.33 / 71.70) to the digit. The remaining
   hard terrain edge is **step 5's** problem, not fog's: saturation is 73.3 % where our
   plate stops, and the reference's is the same 73 % — the reference's water simply carries on. Do **not**
   "fix" it by dropping `fogFarRatio` to 1.0; that tunes a number to a world shape
   about to be deleted.
4. ~~**Then 2a step 4, the intro cinematic.**~~ **Done 19 Aug** — `render/Intro.js`,
   with `Game._grow()` and the growth state deleted and the rim narrowed to 0.12.
   Verified by hand-stepping the ticker through the whole four seconds: radius runs
   0 → 4.62 → 4.2 → **2.65** → 30 → 1e5, camera 24.4 → 31.4 → 38.5, control unlocks at
   t = 2.0 s, the grid leaves the scene at t = 4.0 s, no console output. The dip to
   2.65 is `back.in`'s wind-up and is the reference's behaviour, not a bug.

   **It has not been looked at.** The numbers are right and nothing throws; whether
   four seconds is the right length and whether the wind-up reads as intent rather
   than a stutter are Michael's calls, and they need a foreground window.
5. ~~**Then step 5, world shape.**~~ **Done 19 Aug.** The island is 150 units across on
   a 101 × 101 height field at the reference's cell size of 1.5, with a shore dish measured to give
   the reference's 6.75-unit shelf, an infinite sea that follows the camera, the reference's follower bedrock,
   and decision 43's drag-then-drown-then-respawn. Verified by hand-stepping:

   - **The height field is not transposed.** Ten deliberately asymmetric probes,
     including the (40,0) / (0,40) pair whose ground heights differ by 0.9, all rest at
     the same 1.119–1.155 clearance. That was the one failure mode that would have been
     invisible on a symmetric world.
   - **Top speed on flat ground is 11.18**, against 11.27 measured through the substep
     sweep and 11.5–11.74 on Michael's drive. Over the new rolling terrain it reads
     10.48, and the difference is the car climbing — not a regression.
   - ~~**The 6 Hz shake residual moved rather than vanished.**~~ **Closed.** On a
     24-unit stretch flat to 0.004 units the pitch above 4 Hz reads **0.024° RMS at
     12.0 Hz**, against the trimesh's 0.028° at 6.1 Hz — same amplitude, twice the
     frequency, which is what facet-tracking predicts from a collision grid that went
     from 4.69-unit cells to 1.5. Michael drove it and called it: *"12hz shake is fine
     dont worry about that now."* Do not spend more on it.
   - **Decision 43 discriminates, which is the whole point.** Widened after Michael's first
     drive, then verified across two of the reference's sessions: **five casual trips into the
     water, zero drowns** (deepest 0.98 of a possible 1.2), and **five deliberate runs
     at the edge, five drowns** (every one to the full 1.2). Splashing about is free;
     going for it costs you. Every drown held for exactly the 0.35 s and was carried
     3.9–5.1 units past the line by its entry speed, so waterline to fade is about
     twelve units and one second.
   - **The bedrock caught something real.** The reference author got 14 frames past the ±75 height field
     at a radius of 75.4; the slab switched on at r 69.2 and the car's lowest point in
     the whole session was **−0.38**, which is the water floor plus its clearance. It
     is not dead code, and it did not have to be noticed to work.
   - **The bedrock catches everything.** Probes at (85,0), (0,85), (−95,30),
     (140,−140) and (300,0) all rest at −0.364, which is the water floor plus the car's
     clearance. Nothing falls, anywhere.

6. ~~**Then the smaller carried items.**~~ **Done 19 Aug**, all three, on Michael's
   verdicts:

   - **Coastal spawn points.** 6 spawns → 19, sixteen of them walked in from the
     waterline. Being drowned now sets you down a median of **10.1 units from where
     you entered the water**, against ~30 before; the floor on that is the shelf
     itself, since you cross ~12 units of water before the fade.
   - **Camera trail matched to the reference's.** `SPRING_OMEGA` **21.4**, not the 24 the
     arithmetic gave — see the correction under *The instrumented A/B*. Ours is now
     1.856 units at cruise against the reference's 1.834.
   - **The warm-up render** (`KNOWN-ISSUES.md` 5). The reference's cube camera, gated to WebGPU,
     plus the post chain that the old warm-up never touched at all.

7. ~~**Then 2a step 6, the cycles.**~~ **Done 19 Aug** — `src/cycles/`, three files
   plus a palette registry. Verified two ways, neither of which needed the canvas to
   be presenting:

   - **Headless, in node.** Sixty-odd assertions over the pure-JS mechanism: wrap
     injection closes both cycles' loops (day 0→1, year −0.125→1.125), epoch sync
     matches `Date.now()/1000/240` and two instances constructed moments apart agree
     to 1e-4, every pinned phase reproduces its preset **exactly**, the seam pin
     0.95→0.05 at half strength passes through 0.0 rather than 0.5, a live palette
     swap keeps the same `Color` instances, and the three guards all throw.
   - **On the running build**, reading the live uniforms through the real keyboard
     path. All five destinations land on the preset to the digit at every pinned
     phase — including night fog at **5.75** units against the 5.7397 measured on
     the reference's build. Stepping Q/E through the four candidates at a pinned night moves all
     nine properties and restores cleanly. And `Intro.destroy()` does take the rim
     pump off: after it, pinning to night leaves the rim at its last value.

   Two things it corrected on the way, both recorded under *What the cycle landing
   measured*: the reference's day palette is **27 % dimmer** than the constants it replaces, and
   the reference's night is **3.37x over the bloom threshold** across the whole world.

8. ~~**Then 2a step 7, the colour gate**~~ **Done 19 Aug, and it closed Phase 2a.**
   Sixteen renders, judged on the running build, and the answer is **A — the reference's palette,
   kept**. `#gate` remains in the tree behind its flag, with all four candidates, for
   the one re-judge that is scheduled once emissives exist. The verdict and what
   follows from it are under *The 2a colour gate*.

9. **Write the content** (see *Outstanding input*). **Now the head of the list**, and
   still the only thing on the critical path that no amount of engineering shortens.
   Everything in front of it is done.

   **The one genuinely undecided item is answered, 20 Aug: `rag-pipeline` is
   `Footnote`,** and the slug was renamed from `rag-pipeline` to match. That was the
   only content field that could not be deferred, because
   it decides what an object in the world says; the board had been reading
   "(untitled)". What remains is prose rather than decisions — `edgeball` and
   `Footnote` blurbs and bodies, the roles list, the about text, and the
   GitHub/LinkedIn URLs — each about a thirty-minute writing job now that
   `aerial-ascent` exists as a worked example beside them.

10. **The Phase 3 opening sequence**, set 20 Aug after four sessions of reading the reference's
    build. **Two tracks that do not block each other** — Michael authors, the code
    side clears the path in front of the reference author.

    **Michael's track**

    1. **The prose.** Unchanged, still the critical path, still the thing no
       engineering shortens. Eight TODOs in `projects.js` plus the roles line, the
       about text and two URLs. See *Outstanding input*.
    2. ~~**One small model, end to end, before anything ambitious** — a lamp.~~
       **Superseded 30 Aug by decision 47** — nothing is hand-modeled; the first
       asset is a *found* lamp (or similar small prop), retinted by the tool. The
       measured reasoning survives the swap: start with something the size of the reference's
       `lanterns.glb` (**2 meshes / 524 verts** against the reference's car at **18 meshes /
       5,874**) so the *pipeline* is what gets tested, and a lamp is still the
       identity-layer piece that unblocks the brightness re-judge that
       *Scheduled, not open* has been holding since 19 Aug. Michael's half is now
       **finding** it, not modeling it — see decision 47's pool.
    3. ~~**Then the car**, once the round trip is boring.~~ **Same swap (47):**
       found, not modeled. It is on screen in every frame and it is the
       highest-leverage model in the project, which now makes it the piece worth
       the longest search. Wheelbase note in decision 19 still applies to
       whatever is chosen (collider stays ours; the visual must plausibly wrap it).
    4. Two look calls that are open and not urgent: **when the deep-link card
       opens** (one line in `main.js`) and **whether a scrim click closes a card**.

    **The code track, in dependency order**

    1. ~~**The palette file — this is the gate on all of Michael's Blender work, and
       it goes first.**~~ **Done 20 Aug.** `public/palette.png` is 128 × 4, 156 bytes,
       32 slots of four pixels, 16 assigned at their existing indices and 16 magenta
       headroom. Generated by `npm run palette` from `paletteBytes()`, guarded by
       `npm run palette:check`. **`paint()` lands on the same colour for all sixteen
       entries** although every `u` halved — verified on the running build, one
       script both sides. Full write-up under *The palette file*, and it turned up
       `KNOWN-ISSUES.md` 22.
    2. ~~**A scale-reference GLB**, exported from our own runtime constants.~~
       **Done 20 Aug.** `public/scale-reference.glb`, 16.9 KB, eight objects,
       written by `npm run scale-ref`. Every dimension is *imported* from the
       module that owns it — nothing in the tool types a number — and all of it
       was checked against the running build. It corrected two of the four
       figures in this bullet on the way: the car is **1.96 × 3.35**, not
       3.1 × 1.7, and the frame is a **trapezoid**, not a rectangle. See *The
       scale reference* below, and `KNOWN-ISSUES.md` 23.
    3. ~~**The `^ref` import path** — the parser, the three-file split, and the
       dev-mode assertion.~~ **Done 21 Aug.** `src/pipeline/` — `names.js` (pure),
       `References.js`, `Objects.js`, `split.js`. **Validated against the reference author's own
       64 GLBs**: `npm run check-names` agrees with `F` §1.8 on all nine regex
       counts, and `npm run check-pipeline` runs the real parser over the reference's
       `areas.glb` through a real `GLTFLoader` and agrees on colliders, body
       types, userData and reference keys. It corrected `F` in four places on the
       way. See *The `^ref` import path* below.
    4. ~~**The sunken-plaza test.**~~ **Built and swept 21 Aug; the look call is
       Michael's and is open.** `Terrain.BASINS` behind `#sink=`, defaulting to
       **0** so the shipped world is unchanged. `npm run sweep-basin` prints the
       table. The budget is a third number again — not 0.3, not 1.0, but
       **1.21**, where the rim leaves the plaza's clearing. See *The sunken-plaza
       test* below.
    5. ~~**Ambient motion**~~ **Done 21 Aug.** `render/Noises.js` (perlin generated
       on the GPU at boot), `render/Wind.js` (the reference's shared field), and **two** time
       uniforms on the `Ticker` rather than four — the scaled pair would reverse
       decision 6. Tree crowns sway; trunks, rocks and buildings do not. Proved
       on the GPU: 8,525 samples of a 256 x 256 render move between two wind
       phases, 0 between two renders at the same phase. Amplitude is a look call
       and `#wind=` steps it. See *Ambient motion* below.

    **All five landed on 21 August**, in one session, each written up under *Read
    off the reference's running build*. What that bought, beyond the features: the palette is
    a real file Blender can open, the ruler cannot drift from the code, the naming
    convention is validated against **all 64 of the reference's GLBs** before we own a single
    model, ground authoring is unblocked with its budget measured, and the world
    has ambient motion for the first time. It also cost four corrections to report
    `F` and two to this file — see *The audit against the reference's build*.

    **They were the opening sequence, not the phase.** The rest of Phase 3
    follows in four blocks, and the ordering is set by what blocks what:

    **A. Finish the pipeline** — once anything can be imported.
    `ResourcesLoader`, the **name → material registry** (`F` rec 6, ~15 lines and
    it is what keeps draw calls low across a whole world), and the **asset build
    step** — glTF-Transform → Draco + KTX2, serial, with the per-file skip rules
    from `F` rec 4. The palette becoming a real KTX2 file is exactly why decision
    14's four-pixel bands have to land first.
    **Done 22 Aug except two halves** — see *The loader path, end to end* above.
    Loader, registry and the `Physics.getPhysical` seam are in and proven
    headlessly (`npm run check-loader`); the Draco half of the asset step is in
    (`npm run compress`). Still open: the **KTX2 half waits on `toktx`**
    (Michael installs or defers), and the **runtime glue** — nothing calls the
    loader in the game yet — belongs to the first-real-asset session along with
    `VITE_COMPRESSED` and the decoder shipping.

    **B. World systems** — none need authored art, all improve what already exists.
    `Weather` (it drives wind and rain), **`RainLines`** (decision 30 — 2,048
    pre-built quads and one `positionNode`), **`Leaves`** (decision 12, autumn),
    and **`Grass`** last because decision 32 has it unlocked-but-unbudgeted.
    **`Foliage` + the see-through** belongs here too — Michael asked for it 21
    Aug; the mechanism is fully captured in *Foliage see-through* above and it
    splits into a cheap half and an art half.

    **C. The areas and the emissive layer** — these *do* wait on ~~Michael's models~~ the found-and-retinted models (decision 47, 30 Aug — sourced, not authored).
    The **emissive layer first** (`PoleLights`, decision 13), because it is the
    identity work *and* it is the trigger that releases the world-brightness
    re-judge in *Scheduled, not open*. Then **landing, career, contact, about** —
    the reference's equivalents are 7,163 / 1,724 / 10,266 verts and the reference's career corridor is 22
    meshes of which one plane is 1,004 verts, so decision 24's "corridor, not
    kiosk" is nearly free. Then the **instancing pass** (`InstancedGroup`), which
    is worth doing after there is enough in the world to instance.

    **D. End of phase.** `Achievements` (decision 26), `Audio` (decision 29,
    synthesis-first), the **fast-travel map** (decision 40 — needs an authored
    image), and the **real-device touch test** (decision 41).

    **Eight clusters stay undecided and none of them blocks any of this** — see
    *The reference's 118 files against our 40*. Two are worth deciding deliberately rather
    than by omission: **the VFX layer** (`Tracks` — tyre marks — would show on
    every drive) and **whether the site has a menu at all**.

    **What this sequence is built on.** Four findings from 20 Aug, all recorded
    above: the reference author has **no animation system** (five mechanisms instead, two worth
    stealing outright); the reference author has **almost no textures** (~14 world textures, and the
    noise and gradients are generated at boot); the reference's **models are Blender, not
    code**, but average **306 verts** and the whole reusable prop library is ~14
    meshes reused 450 times; and **only about a third of the reference's area nodes carry
    visual geometry** — the rest is placement and collision metadata that we
    already generate in code.

    **Three savings are therefore already banked and the reference's numbers include them:**
    procedural terrain (16,641 of the reference's 127,289 verts), code scatter (450 authored
    placement nodes we never author), and code colliders. None of it shrinks the
    hero-piece list; all of it cuts the labour around it. *(Decision 47 then cut
    the hero-piece list's cost a different way: the pieces are found, not made —
    the list itself survives as the shopping list.)*

## What 20 August did

One session, and it ran on Michael's driving rather than on the plan. Every item below
started as something the reference author *felt* and ended as something measured; in two cases the
measurement went to the wrong subsystem first and the reference author was right about which one.

| Michael said | it turned out to be | evidence |
|---|---|---|
| *"our car seems to be off centered when facing different directions"* | not the camera — the camera rig is the reference author's line for line and the focus point projects to **ndc 0.0000**. It was `LAND_RELIEF = 1.5` against a focus point pinned to y = 0 | resting spread **0.18 → exactly 0** over 589 points; confirmed on the reference's drive, 74.3 % of samples within ±0.002 of 0.1442 |
| *"a pond isn't bad, it might be how the reference author created rivers and ponds in the reference's map"* | exactly right, and it removed a blocker I had just written into the docs. The reference's water is **one camera-following quad** with no mask; ocean, river and pond are all "terrain below −0.3" | `WaterSurface.js`; the reference's interior water measured at **15.8 % of the reference's map in 21 bodies**, median width 6.0 |
| *"i do like that the reference author could drive forever on the deep waters"* | there is **no deep water anywhere in either build** — 1.2 units, everywhere, over a bedrock slab that follows you. Drowning was a scripted fade on a depth the car cannot sink into | decision 43 withdrawn; car driven to z = −184 with `_respawning` never true |
| *"one small puddle near the top left… makes the driving rugged"* | one channel's bank gradient was **0.405** against the trunk's 0.273, because `bedDepth` and `halfWidth` were authored independently | six of the twelve highest-curvature cells were in it; peak curvature **0.823 → 0.540** after deriving width from depth and smoothing confluences |
| *"it might just be the car animation being more janky than the reference's"* | **the right subsystem, after I had measured two wrong ones.** Fixed 1/120 physics read straight into the visual | at 148 Hz, **18.9 % of frames did not move**; judder 0.483 → **0.019** after render-time interpolation |
| *"a starting spawn seamlessly from the intro"* | the deep link was applied **after** `playIntro()`, so the cinematic ended and then the car teleported | reordered; default start now stands settled on spawn 0 **facing the plaza**, 33.4 units away |

**What shipped:** decision 46 (land relief 0), decision 43 withdrawn, `Terrain.CHANNELS`
(nine carved polylines), `BANK_GRADIENT`, smooth-max confluences and river mouths,
`Physics.alpha` + `Car.savePose` interpolation, the reference's stuck detector ported properly,
`Game.placeAtStart`, and `Footnote` — the last genuinely undecided content field,
with its slug renamed to match.

**Three claims in our own docs were wrong and are corrected in place:** the the reference's/ours
terrain table had counted our land relief as *land* on our side and as *bank* on the reference's,
which reversed its conclusion; `Physics.js` called our fixed accumulator "strictly
better than the reference's version" when it was costing us the smoothness Michael could see; and
`projects.js` said slugs were immutable "from here, and this time it is real" on a date
that had not happened yet.

### The evening session: Phase 2b's last two items

Both of them, and the second turned out to be why the first was worth doing
carefully. **Nothing here started as a feel report** — this was the planned work
— but the standing rule still produced the findings: measure the running build
before designing, and both defects fell out of asking what a visitor could press
before the car existed.

**Deep links, both halves.** `Area` grows two optional hooks. `spawnFor(target)`
runs inside `goTo()`, before the cinematic, so the car is standing in the right
place when the curtain goes up; `openTarget(target)` runs after the cinematic has
*finished*. They are two hooks rather than one because they fire four seconds
apart, and no single "arrive at" call could have picked one moment for both.

The per-board spawn is **derived rather than authored**: `board + ARC_AHEAD *
TO_CAMERA`, facing `FACE_YAW - PI`, which is the relationship the area's own spawn
already has to the middle board. Two properties fall out of that and both were
checked on the running build rather than argued:

| | aerial-ascent | edgeball | footnote | bare `?at=projects` |
|---|---|---|---|---|
| spawn | (28.000, 18.000) | (22.975, 24.669) | (34.669, 12.975) | (28.000, 18.000) |
| heading | −135° | −135° | −135° | −135° |
| board ahead | 5.500 | 5.500 | 5.500 | 5.500 |
| board base, ndc y | 0.450 | 0.450 | 0.450 | 0.450 |
| board top, ndc y | 0.794 | 0.794 | 0.794 | 0.794 |
| card on arrival | Aerial Ascent | Edgeball | Footnote | none |

`p=aerial-ascent` is **bit-identical to the bare link**, because index 0 sits at
`center - ARC_AHEAD * TO_CAMERA` and adding it back lands on the centre — a free
self-check that the derivation is the same one `plazaLayout` already uses. And all
three boards frame *identically*, which is not luck: the camera offset is a fixed
world direction (decision 16), so car, board and camera are a pure translation of
the middle case. Measured at 1552 × 796, radius 30, zoom settled.

**The card waits for the whole cinematic, not for `playIntro()`.** `playIntro()`
resolves at the start of step 1 with two seconds of reveal still to run — that is
deliberate and it is the reference's. Opening a panel into the middle of it would put a 55 %
scrim over the one animation the site gets to open with, so `Game.whenIntroDone()`
exists and `main.js` awaits it last, after the hint and the console line, so a
promise that never settles costs the card and nothing else. **This is a look call
and the knob is one line in `main.js`.**

**Input categories, and the two things they caught.** The mechanism is the reference's:
actions declare categories, `filters` holds the ones currently allowed, keydown is
gated and keyup never is. What made it more than the boolean it replaced was
finding an action that has to survive a filter the others do not — and there is
one. Both defects were measured before the fix and re-measured after:

| | before | after |
|---|---|---|
| `E` during the cinematic | **opened a project card** over it, wrote `&p=` to the URL | nothing |
| `R` during the cinematic | **veil dropped, car teleported** off the deep link's destination | nothing |
| arrows during the cinematic | throttle took, `preventDefault` swallowed the key | nothing, and the key is left to the browser |
| the interact prompt during the cinematic | **on screen** for the whole four seconds | hidden |
| Escape with focus on `<body>` | **did not close the card** | closes it |
| arrows with a card open | already correct — panel scrolls | unchanged |

The first four are one root cause: `Game.mode` started at `'driving'`, so every
key was live while the car was not. **It was only ever reachable from a deep
link** — the default start is 33.4 units from the nearest beacon — which is why a
week of testing on `?at=projects` never hit it, and why `&p=` was the thing that
made it matter: it turns a developer's first two seconds into a stranger's.
`KNOWN-ISSUES.md` 20 and 21 have the full readings.

`intro.playable` disappeared from both gates it guarded. The mode flips on the
same frame `Intro` unlocks control, so `intro.playable && mode === 'driving'` was
one fact stored twice.

**One correction, in the file that carried it.** `ProjectsArea`'s ahead-distance
sweep table is **pre-flattening and every row is about 0.14 too high** — it was
measured when the plaza's ground ran 1.19–1.38. Re-swept on flat land it is in the
file beside the old row. The same check also reconciles a number in *this*
document: the "base 0.160 / top 0.574" recorded above is the framing at the
**beacon standoff**, 2.0 units out, not at the arrival point — it reproduces to
three decimals at `ahead = 2`. Three numbers, three different questions, and only
one of them was labelled.

**And the harness lied once, in the way the rule predicts.** A probe fired
straight after `navigate` reported two of six deep links landing the car at the
origin with the intro never started — which looks exactly like a broken deep link.
It was `setTimeout` throttled to ~1 Hz in a hidden tab, so `main.js` was still
behind `waitForFrames`' 2500 ms timeout when the probe measured. The fix is not
"wait longer": the probe now gates on `is-ready`, the class the code under test
actually sets, and **records the gate in its own output**, so a lost race reports
itself instead of arriving as a finding.

### Carried into the next session

**THE CODE TRACK PICKS UP HERE — THE SITE IS LIVE AND A PHONE CAN DRIVE IT
(3 Sep, late); the phone pass, the payload lever, bridges, then the art
pass.** The 3 Sep session, in one line each (every
item has a *Now* entry above with the measurements):

- **Deployed.** The build audit (6.3 → 4.9 MB; three Draco decoders shipped
  for one fetched), the head and the accessible fallback rendered from
  `src/content/`, content-versioned statics under immutable headers,
  `og.jpg`, `check-site`. GitHub `MichaelYeh507/gamified-portfolio`; a
  Cloudflare **Worker** with static assets (not Pages — the dashboard's
  default now), Git-connected: push to `master` = build + deploy. Domain
  from Cloudflare Registrar: **https://michaelyeh.dev**, `SITE_URL`
  committed. Live headers measured: immutable on hashed/versioned files,
  revalidate on HTML, Brotli (on-the-fly: the chunk travels at 1.35 MB, not
  the 1.06 a full encode gives), `application/wasm`, the security headers.
- **His first live notes, all landed:** fence fixed, career type up a third
  on a longer card (rows drawn over every model), the amber glow term back
  in every material (a shadowed variable had compiled it out since 2 Sep),
  auto-flip at 1.5 s and in deep water (wet torque/hop boosts), labelled MAP
  / CONTROLS pills, rain splashes as the reference's `splashesNode` verbatim over a
  generated voronoi at 0.45 of the reference's density.
- **The water, three passes on his screenshots:** channels and the coast
  through a two-octave warp with width varying along the run (bank gradient
  held), a wet-sand bank, a narrower beach ramp, mottled grass to the
  water, ripple contours as lines rather than fills, and **no white edge
  bands at all** (the terrain's zigzagged along the mesh; the water's read
  as a border) — the edge is the colour change now.
- **A football pitch at Rocket League scale** at [9, −31] (map top-right,
  swept): car-sized ball, a goal three balls wide with net colliders,
  `check-pitch` the **eleventh** suite.
- **The repo names the reference only in `CREDITS.md`** (his call): ~2,100
  replacements by script and hand, `research/` and the clone untracked, the
  clone reached through a `reference/source` junction, `check-site` guards
  the name, history squashed to one commit and force-pushed, and the
  co-author trailer dropped from commits (his call: no Claude contributor).
- **Dev trap fixed:** Vite's optimizer crawled the reference clone and
  prebundled two threes (`KNOWN-ISSUES.md` 27); discovery is off, three is
  deduped.

**What the next session does, in order:**

0. ~~**Touch steering**~~ — **landed 3 Sep, late** (the *Now* entry has the
   measurements): the reference's ring stick anchored at the car, boost and
   jump buttons, the hint as the touch unstuck button, the copy back to
   "drag to steer", `check-touch` the twelfth suite. **Left for Michael's
   phone pass** on the live URL, in this order: a real thumb on the stick
   (the radii 2 / 4.5 are the reference's; the ring is a third of the frame's
   height on a desktop viewport and will be larger in portrait, where the
   camera sits further out), boot time on cellular ("much much longer" was
   his first read — the Rapier lever in 0b is the answer), the fallback on
   a browser without WebGPU/WebGL2, the plaza in portrait (`KNOWN-ISSUES.md`
   23), the cards, the ring on a WebGL2 phone.
0b. **The payload lever**: `@dimforge/rapier3d` (non-compat) behind a wasm
   plugin takes the 2.0 MB physics wasm out of the JS — ~250 KB less on the
   wire here (Cloudflare's weak Brotli), 2.9 MB of base64 out of the parse
   path (`KNOWN-ISSUES.md` 25).
0c. **The pitch's loose ends**, when he asks: ~~a reset for a ball that
   leaves the island~~ (landed 3 Sep, late: 3 s wet or off the map and it
   is back at the spot — `pitchPlan.ballLost`), a score, a second goal.
0d. **The art pass** (Michael, 3 Sep: "improve the art / map a bit more
   later to make it look better and like it has more content") — after
   bridges; his offered assets first, the retint tool, `CREDITS.md`.

The items below keep their order after that. After the six surface fixes,
the 2 Sep session ran
Michael's "make the map feel alive" list in his order — reacting props,
the plaza's greeting and dressing, leaves, wind lines, rain — then the
controls sheet and the fast-travel map on Michael's call (toasts deferred by
the reference author), with several same-hour tunes on the reference's live drive (leaf density, rain
density, the splash lattice three times, the sheet's placement and wash).
`npm run check` runs **nine suites** green (`check-leaves` joined). From
here: **the reference's source is the mechanism reference and the numbers are ours**
(Michael's word, 2 Sep late). What the next session does, in order:

1. **Bridges.** The last deferred wayfinding item: the reference's channels are
   crossed by real bridges where ours ford. Michael has offered road /
   bridge / texture assets — take them through the retint tool
   (CC0/CC-BY, `CREDITS.md`) and stand them at the three fords, or build
   a plank bridge in code if none arrive. The fords' physics (the eased
   carve in `Terrain.carveAt`) stays; a bridge is the visual and a
   collider over it.
2. **The reference's verdict on the session's look calls, judged by driving.** Still
   only screenshot-judged or seen once: the track ruts' strength, the
   flagstone scale and tones (a found texture is a one-line swap in
   `render/slabs.js`), fords' slabs under water, the arrow size, the
   letters at 0.6, plaza titles blank until greeted, the crate stacks,
   leaf density at 256, the wind lines' cadence, rain at ~20 % of the
   clock, the night water's brightness, the bow sizes, the blade height.
3. **Toasts**, when Michael wants them (the reference's `Achievements.js` /
   `Notifications.js`): first jump, first boost, a ford, every letter
   down, all four districts visited.
4. **Weather's other consumers**, cheap now that `Weather` exists: the reference's
   ice (ponds freeze, friction drops), snow with track ruts, lightning.
5. **Standing offers and small holes, unchanged:** the `#yearunit=` scale
   (shipped 4, judged once); a career card frozen mid-air if the car
   exits the radius during its hold window (cosmetic); the stuck-hint
   fires when parked reading 3+ s (pre-existing); at eight projects the
   plaza's radius swallows the spawn (`STANDING_ROOM`, contract written
   into the island checks); boost can launch the car off the island onto
   the void grid — recoverable (bedrock + R), arguably a feature, worth
   one deliberate look.
6. **Further out, per the phase plan:** audio (decision 29 — the
   corridor's `isUp` edge flag and the boost's force-field loop wait for
   it), achievements (decision 26), the **brightness re-judge**
   (`#day=0.45` — the night is fully populated now: counter, streetlights,
   lamps, headlights, glowing type, the bonfire, the boost trails, and the
   signposts), and Phase 6's two leftovers — analytics on which cards get
   opened, and the debug GUI stub (the `ColorGate` is already a 4 KB
   dynamic chunk behind `#gate`, so the stub is mostly done by accident).
   Waiting on Michael: only the optional `availability` line and the
   cmu/cmu-ai lines.

---

**The wayfinding handoff below is kept as written — items 1–3 landed 2
Sep in one session; items 4–5 carry forward above.**

**THE PREVIOUS CODE-TRACK HANDOFF (landed) — wayfinding.** The 1–2 Sep
sessions finished the district roster (contact arc, drivable-letters
landing; there is deliberately no about area) and gave the car its whole
game-feel kit — boost with speed lines and the RL-styled two-tone trails,
the suspension jump with visible pole struts, the auto-flip — every
mechanic read out of the reference's source and every look judged by Michael on the
running build, with several same-day reversals recorded in the *Now*
chain. What the next session did:

1. ~~**Wayfinding, the promoted priority**~~ **Done 2 Sep, measured
   first:** the reference's areas.glb walked for signage (none exists in the reference's build —
   the bowling marquee is the only `sign.*`), then **signposts** (marker
   post + emissive directional rows with screen-bearing arrows, at spawn
   and each district threshold) and **roads** (the corridor's sand path
   chaining spawn → plaza → contact → career) together, as prescribed.
   The **fast-travel map** honoured its gate and waits on Michael's
   drive.
2. ~~**The driving-smoothness watch item, adjacent to the roads**~~
   **Done, same mechanism:** smoothing the boost corridors and paving
   them was the same task, exactly as guessed — the fords in
   `Terrain.carveAt` are the paving reaching the physics. A boosted
   river crossing now costs zero drag and zero vertical kick.
3. ~~**The reference's mass-0 oversized bumper**~~ **Done, with one measured
   surprise:** the letters went back to the reference's mass 2, the first plow test
   high-centered on a toppled letter, and the bumper shipped nearly
   frictionless (0.05) — a shoving surface, not a tire. See the *Now*
   entry.

---

**The contact handoff below is kept as written — item 1 landed 1 Sep; items
2–5 carry forward above.**

**THE PREVIOUS CODE-TRACK HANDOFF (landed) — the contact area, and the last
prose.** The 31 Aug–1 Sep sessions built the **career corridor** (decision
24 — converged on the reference author's measured design over four of Michael's drives:
tilted floating text cards popping from the ground, the year as glowing road
paint; see Milestone 15) and the **landing** (name + tagline as ground
decals at spawn). What the next session did:

1. ~~**The contact area.**~~ **Done 1 Sep, in the order prescribed:**
   `SocialArea.js` read directly, then the reference's social geometry measured out of
   `areas.glb` with the no-loader walk — and the measurement earned its
   keep immediately: the reference's labels are at radius 6 (code) but the reference's icons stand
   at **7.85** (baked only), a number no report carries, and the whole arc
   formula was confirmed against the reference's baked markers rather than trusted
   from the reference's source. Data-driven from `links.js`; sited by height-field
   sweep; `check-contact` is the seventh suite and holds the measurements
   as assertions. See the *Now* entry.

---

**The corridor handoff below is kept as written — all of it landed 31 Aug–1
Sep, including every amendment recorded inline.**

**THE CORRIDOR HANDOFF (landed) — the corridor is judged, then the remaining
areas.** The 31 Aug night session built the **career corridor** (decision 24,
full motion package, sixth check suite) and the **landing** — see the *Now*
entry for what stands. What the next session does, in order:

1. **Michael drives the corridor and judges it** — `?at=career`, and the bare
   URL for the landing. The look calls open on it: the **scale** (see item 2
   — shipped at 4 units/yr, `#yearunit=` overrides live, 2–4 fit the site,
   the whole run is ~1.5 s at full throttle), the corridor's seaward exit,
   the slab/counter proportions, the lane split, and the **cart's loud
   accent-orange retint** — if it reads wrong, the fix is a recipe override
   onto `wood`, one line in `tools/prep-model.mjs`, then `npm run prep` +
   `npm run compress`.
2. ~~**The dates make it real.**~~ **Done, same night — Michael supplied the
   dates in chat** (Canyon Crest Academy 2024 → fall, game development; CMU
   Information Systems from fall 2024, the AI additional major begun 2025;
   Knollwood from June 2026, current), and the real data forced two design
   moves worth the record. **The corridor is two-lane now**: CMU and
   Knollwood both run to *now* — school and job at once — and on one lane
   the two current slabs stood inside each other's screen space, so
   education takes screen-left and work screen-right (`laneFor`), which is
   also just true. And **the shipped scale is 4 units per year**
   (`SHIPPED_UNITS_PER_YEAR`): decision 24 stole "one year per world unit"
   from a fifteen-year career, and against Michael's real three-year span
   that put three ~3-unit-wide slabs on a 3-unit axis — geometrically
   impossible, not a taste call. The reference's mechanic survives whole (the counter is
   still `floor(offset / unit)`); 4 makes the corridor exactly the length
   the site was already proven to hold, and 5 runs the road into the beach
   (check-career says so). The cca one-liner is **drafted from the reference's
   chat facts** and flagged in `roles.js` for Michael's read; the knollwood line
   and stack are still the reference's. The counter track also gained a 2.5-unit lead-in
   before year zero — the 0-clamp parked the digits inside the first slab.
   **Two follow-ups landed on Michael's calls the same sitting.** *"Make the career
   section glow like the reference's does"*: in-world type joined the emissive layer — a
   `night` term in `makeTextMaterial` (luminance-normalised, `TEXT_GLOW` 0.5
   against the lamps' 2.5, applied before fog) wired through `game.textPlate`
   so every label in the world glows legible through dusk, and each slab wears
   a thin **amber inlay on band 12** that lights with the streetlights. And
   *"have the AI additional major separate from information systems"*: it is
   its own entry (`cmu-ai`, 2025 → now), which put **two concurrent stones on
   one lane** and forced the **same-lane queue** — within a lane, in date
   order, each slab keeps `QUEUE_SEP` (2.4, a *visual* depth constant; a
   width-derived gap was wrong because slab width extends across the road)
   behind its predecessor, riding in file with the newest chapter furthest
   along; the counter's parking spot is now **derived past the last left-lane
   park** (`counterTrackEnd`) after the AI stone parked exactly on top of it.
   Both are covered by new check-career assertions (queue spacing, counter
   clearance) and were verified standing and at night on the running build.
   **And two more of Michael's calls, after Michael drove it.** *"After i drive above
   all it should stay up"*: rising is one-way now — `hasRisen` never clears,
   the wipe never reverses, and driving the corridor leaves the whole
   timeline built behind you. The reference's own build is halfway there
   (`CareerArea.js:304-330`: only `hasEnd` lines sink; the reference's current job
   stands forever), so this is the reference's mechanic with the ended-jobs exception
   removed on Michael's call — the stone-slide "in" sound (decision 29) will
   simply never fire. *"The year sort of phases into the signs… take a look
   at the reference's"*: **the reference's source was read this time, not the report** — the reference's digits
   are `MeshBasicNodeMaterial` with `outputNode = vec4(1.7)`, flat overbright
   white, unlit, unfogged, blooming at every hour, and the reference's career labels are
   always-emissive too (`baseColor.div(luminance).mul(1.7)` against a dark
   mask — the area is neon at noon; the reference's 7-seg table also confirmed ours
   digit for digit). The counter now carries the reference's digit material verbatim on
   a **slim signpost above slab-top height** (digits at 2.55, post 0.34
   across, `COUNTER_SIDE` out to −5.3, track start pulled to −1.2 off the
   inlet bank): the glide crosses risen education slabs as a hairline of
   post instead of a housing through a stone, and the readout no longer
   shares a colour family with the slabs beside it. **And a readability
   pass on Michael's call** (*"can you make the text more readable? i can't really
   read it that well on the stones"*): all stones went dark (`rockDark` on a
   `black` plinth — the education slabs were light building-grey under white
   type, and the plaza's title plates already state the light-on-dark rule;
   the lanes carry the kind distinction now), long strings **wrap to two
   lines** instead of shrinking (a width-limited string lands at the same
   tiny size whatever fontSize asks — the wrap is the only real lever), rows
   grew and stack top-down, and a crowded slab **scales its whole stack to
   fit** rather than pushing its years row off the stone, which is exactly
   what the first stack did to Canyon Crest.
   **Then the sign boards died entirely — 1 Sep, on Michael's second look** (*"he
   didn't have signs, the reference author had like pop ups from the ground that goes back
   into the ground after you drive past it"*), and this time the reference's geometry
   was **measured out of `areas.glb`**, not just the reference's code read. What the
   measurement settled: the reference's "stones" are tiny buried markers (0.3 wide, top
   flush with the ground); the TEXT is the object — planes lying nearly flat
   (~17° up toward the camera, 0.57 rise over 2.3 run in the reference's authored data),
   floating just off the ground, glyphs **always-emissive** (the reference's 1.7×, ours
   1.5 via the new `emissive` option in `makeTextMaterial`) so they read
   over any ground with nothing behind them; and **the reference's year digits lie flat
   on the ground** — horizontal planes at y 0.13, the earth itself as the
   housing for dropped segments. The corridor is rebuilt to all of it:
   tilted floating cards on amber-capped markers, popping up at the reference's tight
   window (±1–2 rather than the old 7-ahead) and **sinking back behind you
   unless the entry is current** (the reference's `hasEnd` rule verbatim — this
   supersedes the brief everything-stays call; matching the reference author was the newer
   ask), and the counter as **glowing pavement markings dead centre on the
   road**, gliding ahead of the car — the reference's lateral-separation answer, adapted
   to a west band too narrow for two side-by-side bands. Low text also
   dissolved the "AI major blocked by the sign in front" complaint: a card
   0.9 high cannot hide the card behind it, though the tilt taught one more
   number — a tilted card's top rows climb the screen by elevation as well
   as depth, so `QUEUE_SEP` rose to 2.8 to cover footprint plus climb.
   **The reference's first drive of the pop-up build tuned it three ways** (*"texts
   should be bigger and more readable maybe bolded… the highschool one is
   disappearing too fast… the other ones aren't going back into the ground
   at all"*): the type grew (org 0.5, card length 2.1, `QUEUE_SEP` 3.4) and
   gained a real **bold** — `makeTextTexture` strokes each glyph at 5% of
   its size before filling, since Amatic's 700 is still a thin hand; the pop
   gained a **time floor** (`MIN_UP_SECONDS` 2.6 — distance windows scale
   with car speed, so the 2.3-unit high-school segment at full throttle was
   up for a blink; time does not scale); and **every card sinks after you
   pass now** — the reference's current-entries-stay nuance cut on Michael's read. Two
   speed constants moved with them: the wipe writes in 0.45 s and the
   counter leads by 4.6, because at full throttle the smoothing lag ate the
   3.5 lead and the car drove onto its own year.
3. **The remaining areas ride the same patterns**: about (the card layer
   exists; the prose is the blocker), contact (`links.js` is complete; the reference's
   `SocialArea` arc), playground (the designated cut). The area registration
   is now a keyed map in `Game`, and `LandingArea` is the minimal example.
4. **Known small holes**: a slab that was up freezes mid-air if you leave the
   area's radius sideways at exactly the wrong moment (cosmetic — the radius
   makes it hard to see); the stuck-hint fires when you park to read the
   corridor for 3+ s, which is the pre-existing parked-car behaviour, worth a
   look someday; `tools/_analyze-tmp.mjs` is a leftover scratch file from the
   30 Aug session, delete at will.
5. **At eight projects the plaza's derived radius (41.6) will swallow the
   spawn and overlap everything** — `STANDING_ROOM` is the lever, and
   `check-career`'s island-contract check is where the constraint is written
   down. Not urgent before five more projects exist.

**Waiting on Michael:** the knollwood one-liner and stack (the slab shows org,
title and years without them); a read of the drafted cca/cmu lines in
`roles.js` (the reference's facts, our words — replace freely); and the about text and
tagline (`about.js` — the landing falls back to "drive around my work",
decision 42's own string, until the tagline is written). The dates are no
longer waiting — they landed 31 Aug, in chat, and the corridor is real.

---

**The 31 Aug daytime handoff below is kept as written — all of it landed the
same day** (the emissive layer as `render/Night.js`, the compressed build,
the nature packs, the liveliness pass).

**THE EMISSIVE-LAYER HANDOFF (landed) — the emissive layer, and more found assets.**
Everything in the 22 Aug handoff below landed; the runtime glue followed on
23 Aug, and **the retint tool and the first found asset landed 30 Aug** (*The
retint tool and the first found asset* above) — the whole road from a
Sketchfab download to a credited, palette-true prop standing on a Rapier body
is proven end to end, and `npm run check` prints five suites. What the next
code session does, in order:

1. ~~The retint tool~~ **Done 30 Aug** — `tools/prep-model.mjs`
   (`npm run prep`), both assignment paths (colour snap for kit models, part
   rules for Sketchfab merges), proven in `check-prep` with every guard made
   to fail once and the shipped file byte-compared against its recipe.
2. ~~One load call and one `addFromModel` loop~~ **Done 30 Aug** — two lamp
   posts flank the plaza standing point; `paletteEmissive` is pre-registered
   beside `palette` as the seam PoleLights fills.
3. ~~**`VITE_COMPRESSED`**~~ **Flipped 31 Aug, measured on the wire**: all 32
   models load as `-compressed.glb` at **166 KB total** (they were ~2.5 MB
   raw) plus a one-time 199 KB wasm decoder — the 700 KB JS decoder fallback
   is deliberately not shipped, and neither is the KTX2 runtime half, on a
   premise check: the palette is a 512-byte DataTexture generated in JS, so
   a basis transcoder to load a 1.5 KB file is a net loss in every
   direction (`palette.ktx` stays as a tooling artifact). Dev builds keep
   reading raw GLBs so `npm run prep` iterates without a compress step;
   `.env.production` carries the flag; `modelUrl()` is the one place the
   variant is chosen; and **`npm run build` now ends in `prune-dist`**,
   which strips the raw siblings, the scale-reference ruler and the palette
   files from `dist` (2.5 MB of exactly the dead weight the Phase 6 audit
   exists to catch) and **fails the build if a model lacks its compressed
   sibling** — the forgot-to-compress case reports itself instead of
   shipping 404s. Verified on `vite preview` via the performance API: 34
   resource fetches, zero raw GLBs.
4. ~~**`PoleLights`**~~ **Done 31 Aug, as `render/Night.js` + one shader
   term** — and it is smaller than the plan because of what the retint tool
   had already established: **amber IS the emissive band**, so the content
   material tests the palette *u* and adds a luminance-normalised emissive
   (`B` §3.5) wherever a texel sits on band 12, faded by a smooth
   `nightness` ramp inside the `night` interval. Every light source lights
   at once — lamp chambers, the buggy's brake lights, bonfire flames, glow
   mushrooms, flower hearts — **merged scatter included**, because the test
   rides UVs, not materials. Michael's addition landed with it: **the car
   headlights** — lens glass moved onto the emissive band (a recipe
   override) plus a warm cone term in the same shader that brightens the
   ground's own albedo ahead of the car, because the flat toon material
   ignores three's lights and a real SpotLight would illuminate nothing.
   One boot-order bug on the way (`Night` created after the first
   `_applyCycles`; the fallback résumé caught it, working as designed).
   **The scheduled brightness re-judge is now unblocked** — Michael judges
   the night with lights in it (*Scheduled, not open*).
5. ~~**More found assets through the same tool**~~ — ~~the car~~ **landed
   30 Aug (the buggy)**; ~~a nature pack~~ **landed 31 Aug — two packs,
   twenty props, the texture-snap path** (*The nature packs — 31 August*).
   The island scatters real trees and bushes; the medieval dressing waits
   on its areas.

**Waiting on Michael:** the `knollwood` role line, the education entry, and
the about text — the shopping list is, for the first time, empty. All
three look calls were judged on 23 Aug under one rule the reference author set — *most similar to
the reference's*: `KNOWN-ISSUES.md` 22 decided and applied (corrected encode; the reference's bytes are
authored sRGB too), `#wind=` closed at the default 0.5 (the reference's constant, the reference's gust
rate — nothing shipped changed), and `#sink=` closed at 0 (the reference's areas sit on
flat land; a sunken plaza exists nowhere in the reference's build). The basin machinery
stays behind its flag as an art-phase lever. The `toktx` install is done.

---

**The 21 Aug handoff below is kept as written — all of it landed 22 Aug.**
Written as a handoff rather than a summary, because the next session should be
able to start without re-deriving any of it. The contract table remains the
reference for what the implementation honours.

**The gap: `src/pipeline/` parses, but nothing loads and nothing builds a body.**
There is no loader in front of it and no Rapier factory behind it. So the day
Michael's lamp exists, **it cannot land**. Three pieces close it:

1. **`ResourcesLoader`** (the reference's is 123 lines). A GLB actually fetched and parsed at
   runtime. Nothing in `src/` loads a model today.
2. **The name → material registry** (`F` rec 6, ~15 lines). `getFromName(material.name, material)`
   over a global cache keyed on the **Blender material name**, so the first mesh
   to use a name defines the runtime material and every later mesh anywhere
   shares the instance. That is what keeps draw calls low across a whole world.
   Pre-register `palette` before the first model loads, as the reference author pre-registers seven.
3. **A `Physics` add-from-description seam.** Deliberately not invented yet — see
   `pipeline/Objects.js` — because there was no second caller. `ResourcesLoader`
   is that caller, so build it now rather than guessing earlier.

**Build it against a generated fixture, before the lamp exists.** Decided with
Michael 21 Aug. `tools/build-scale-reference.mjs` already contains a working GLB
writer — **extract it to `tools/lib/glb.mjs` first**, since this will be its second
user — and emit a fixture carrying every pattern at once: `.001` duplicates, a
`preventAutoAdd` node, collider children of each shape, `mass`/`restitution`
userData, and the three-file split. Then the lamp is a drop-in rather than a
debugging session while Michael waits. **`GLTFLoader.parse()` runs under node with
a `self` shim** (`tools/check-pipeline.mjs` does exactly this), so the whole path
is testable headlessly and belongs in `npm run check`.

**What the implementation must honour — already established, do not re-derive.**

| | |
|---|---|
| `parseModel` returns | `{ visual, physical, userData, preventAutoAdd, preventFrustum }` |
| `physical` | `{ type, colliders, sleeping: true, restitution?, friction?, category?, mass? }` |
| a collider | `{ shape, position[3], quaternion[4], parameters, ...overrides }`, local to its body |
| `cuboid` / `cylinder` / `ball` | parameters from **scale alone**; geometry ignored |
| `trimesh` / `hull` | `[positions, indices]` off the child geometry |
| mass | **spread across colliders** — `setMass(mass / colliders.length)` each, the reference's `Physics.js:182-185` |
| the reference's defaults | restitution **0.15**, friction **0.2**, category **`'object'`** — and only `floor` / `object` / `bumper` are valid keys |
| bodies start | **asleep** |
| the depth rule | strip physics words on an area group's **direct children** only |

**One landmine, found while reading and worth not copying.** The reference's `Area.js:46`
computes a body position as `child.position.add(this.model.position)` —
`Vector3.add` is **in place**, so that line mutates the child's own position as a
side effect of reading it. It works in the reference's only because nothing reads it again.

**Then the rest of block A**: the asset build step, glTF-Transform → Draco + KTX2,
serial, with `F` rec 4's per-file skip rules. The palette becoming a real KTX2 is
exactly why decision 14's four-pixel bands landed first.

**And one thing to settle with Michael before he colours anything:**
`KNOWN-ISSUES.md` **22**. It is one line either way and it brightens every surface
in the world, so it is the reference's — but deciding it *after* the first authored asset
means re-picking every colour chosen by eye. Deciding it before costs nothing.

---


- ~~The trees move now, and the amplitude is your call.~~ **Judged 23 Aug —
  closed at the default, by the rule "most similar to the reference's".** 0.5 *is* the reference's
  amplitude constant and 0.1/s is the reference's gust rate, so nothing shipped changed.
  The recorded caveat stands: the reference's leaves rotate a camera-facing cutout where
  our crowns bend solid geometry, so the same number acts on different things —
  if it ever reads too strong, that is the difference to revisit, not the
  constant. `#wind=` stays as a debug lever. The original brief follows.
  `#wind=` sets the
  strength; the default is the reference's 0.5. At 0.5 a tree tip travels a peak of **0.49
  units**, which is a lot for a crown 0.9–2.0 across — `#wind=0.25` halves it,
  `#wind=0` stops it. The gusts are slow on purpose: `localTime` advances at
  0.1/s, so a full cycle of the field takes tens of seconds, which is the reference's rate
  exactly. Judge it parked as well as moving.

- ~~The sunken-plaza test is waiting on your eye.~~ **Judged 23 Aug — closed
  at 0, by the rule "most similar to the reference's".** The reference's areas all stand on flat land;
  a sunken plaza exists nowhere in the reference's build — the reference's carved ground is the water
  channels, and always holds water. So the plaza ships flat, the carved-ground
  ambition stays with the channels (density deferred to the art phase,
  `KNOWN-ISSUES.md` 18), and the basin machinery keeps its flag as an
  art-phase lever — it is the groundwork for any future carving, not a dead
  end. The original brief follows. The world
  ships flat — `#sink=` defaults to 0 — so nothing has changed under you. To judge
  it, reload with a depth in the hash:

  | | |
  |---|---|
  | `#sink=0.3` | the deepest **dry** plaza. Past this there is water on the floor |
  | `#sink=0.45` | 0.15 of water standing in it |
  | `#sink=0.6` | 0.30 of water, and the stack sits 0.075 further down the frame |
  | `#sink=1.21` | the deepest that fits. Anything more throws at boot |

  It is a boot-time flag, so each depth is a reload. The question `KNOWN-ISSUES.md`
  18 actually asks is not "how deep" but **does carved ground read here the way it
  does in the reference's build** — a flat plaza on flat land could never answer that, which is
  why the mechanism had to exist before the question could be put. Drivability,
  gradient, flooding and framing are all measured and in the table; none of them
  rules out any depth up to 1.21.

- **The naming convention is live, and these are the rules it enforces.** Nothing
  imports models yet, but `src/pipeline/` decides what your Blender names mean, so
  it is worth knowing before you name anything:
  - **Duplicate with Shift+D and it just works.** `refLamp`, `refLamp.001`,
    `refLamp.002` all land under one `lamp` key, because three deletes the dot
    before the regex runs. Never number by hand — `refLamp001` sitting beside
    `refLamp.001` makes the loader rename one to `refLamp001_1`, which matches
    nothing and vanishes silently.
  - **No spaces in `ref` names.** `ref My Lamp` becomes the key `_My_Lamp`. It
    parses, so nothing errors — the dev assertion is what catches it.
  - **`physical` makes a body; `dynamic` / `kinematicPositionBased` pick the type;
    `fixed` is the default** and selects nothing.
  - **Colliders are children, sized by scale alone.** Name a child `cuboid`,
    `tube`, `ball`, `hull` or `trimesh`. Half-extent is `scale x 0.5`, so **the
    scale value you type is the size in metres**. Reach for `cuboid` — the reference's world
    is 234 cuboids against 2 trimeshes.
  - **Custom properties go on the Object, never on the Object Data.** A mesh
    datablock is shared between duplicates, so a property on the data leaks to
    every copy. The reference's own file has one of these already.

- **The scale reference is on disk too** — `public/scale-reference.glb`, eight
  objects, all at scale 1.0 with positions applied so Blender needs no unit
  wrangling. Three things to know before modelling against it:
  - **Fit gaps to `car-wheels`, not `car-chassis`.** The wheels are the widest
    part of the car at 1.96; the body box is only 1.70. The full silhouette is
    1.96 × 2.01 × 3.35.
  - **The frame objects are trapezoids and there are three of them**, one per
    aspect. Ask "does it fit" at the depth the thing actually stands at — the
    landscape frame is 17.83 across at the near edge and 35.10 at the far one.
  - **Do not import it into the game.** Its node names deliberately avoid the
    `^ref` vocabulary so the importer finds nothing in it, but it is a ruler.

- **The palette file is on disk and the Blender half is unblocked** —
  `public/palette.png`, 128 × 4. Four rules for using it, three of them the reference's
  (`F` §3.3, §5.3, and the readme quoted in `F` §2):
  1. Image Texture node with **Interpolation: Closest** and the image's **Color
     Space: sRGB** (it is a colour texture, not data). Closest is the one that
     matters — Linear blends neighbouring bands at an island's edge, which is
     exactly what the four-pixel width is there to prevent.
  2. **UV islands go anywhere inside a band**, not on its centre. Band `i` is
     x = `4i` … `4i+3`; the four-pixel width is the tolerance and the reference's own islands
     miss centre by up to 0.4 px.
  3. Name the material **`palette`**. `F` rec 6's name → material registry is what
     keeps draw calls low, and it keys off that name.
  4. **Mute the palette image node before exporting**, and do not enable Draco in
     the exporter. The runtime substitutes its own material and would discard a
     baked texture; shipping it inside every GLB is pure waste.
  - Slots 16–31 are magenta on purpose: if you see magenta in the viewport or the
    game, a UV landed in unassigned headroom.
  - ~~Pick harmonies against the PNG, not against the hex list~~ **Moot since
    23 Aug: they agree.** `KNOWN-ISSUES.md` 22 is resolved — Michael chose the
    corrected encode on the A/B — so the PNG, the hex list and the rendered
    world are now the same colours. Pick harmonies against either.

- **Everything from 19 and 20 Aug is committed or staged.** The plaza, `setMode`, the
  card layer, in-world type and `aerial-ascent`'s content went in as `e9c8fb0`; the
  area system, beacons and the content cut as `1806896`. The whole of 20 August is
  staged and unmade — Michael commits.
- **The terrain finding is closed as a finding and open as a look.** Both halves landed:
  land is flat at exactly 0 and `Terrain.CHANNELS` carves nine polylines through it,
  judged and accepted on the running build. What is left is **density — 5 interior
  bodies against a like-for-like target near 9**, and Michael has deferred that to the
  art phase along with the rest of the map layout. Re-measured with one classifier over
  both grids, we sit at **23.6 % bank against the reference's 35.4 %** — and note that the old
  "17 % against 32 %" was wrong in a way that reversed the sign: before flattening we
  had *59 %* bank, all of it land relief rather than carved banks. All the machinery a
  river needs already exists: water material, depth texture, shelf, drowning, bedrock.
- **The plaza-sink test is now half-answered and half-blocked.** Flattening dropped the
  plaza 1.3 units down the frame by itself, so the *framing* half is banked — the three
  boards sit at base 0.160 / top 0.574 against an edge of 1.0. What is unanswered is
  whether **carved ground reads here the way it does in the reference's build**, and a flat plaza on
  flat land cannot answer it. The blocker is a real one: land is at 0 and
  `WATER_SURFACE` is −0.3, so **a sink deeper than 0.3 floods and fires the drowning
  logic inland**. Either the sink is worth ≤ 0.3 of ground, or authored ground needs an
  exception from the water plane. That choice is open and it is the first thing the
  carving work has to settle.
- **Steering is judged.** Michael drove the corrected build — *"I think its driving
  pretty well right now"* — so `KNOWN-ISSUES` 17 is closed by feel as well as by
  measurement. The one thing still not measured is whether full-lock left and full-lock
  right give the same radius; it was only ever measured one way, and nothing depends on
  the answer until the handling is touched again.
- **The monolith is deliberately not being judged again, and that is Michael's call**
  (20 Aug): *"for monoliths no need to spend too much time on it right now since we will
  be bringing in art and assets in later."* The slab is gone and the second version — a
  16:9 board on posts with a title plate above, to the reference's proportions — stands as the
  placeholder until Phase 3 replaces it wholesale. **Do not schedule further look calls
  on it**, and that covers the `dirt` floor colour and the waist-high beacon with it.
  What still holds is the *measurement*: the camera ceiling under decision 44, and the
  fact that any replacement has to frame inside it.
- **The type system landed with it.** `src/render/textPlate.js` is `D` §6.8's helper,
  ported from the reference's `TextCanvas` — canvas as an alpha *mask*, dimensions in world units
  with `density` as pixels per unit. **Amatic SC 700** now carries the in-world titles
  and the beacon prompt, **Nunito** the card, both from Google Fonts under the OFL.
  Three traps are recorded in the code where they bit: `flipY` (the reference's `false` is right
  for glTF's top-left UV origin and upside-down on a three-native `PlaneGeometry`), a
  discard inside a transparent material's node graph (`makeVoidMaterial` had already
  written the rule down and `makeTextMaterial` re-learned it), and awaiting
  `document.fonts` before drawing, since `fillText` bakes the fallback face without
  complaint and nothing ever redraws it.
- ~~**The image recess is still empty.**~~ **Filled 19 Aug.** Michael supplied the itch.io
  URL and two gameplay captures; they are in `public/projects/` and the first one renders
  in the recess. **The compression finding is worth keeping: the game is pixel art, and
  the scaling filter decides the file size.** Lanczos to 1024 × 576 gave 451 KB, because
  a smooth filter invents intermediate colours that both blur the pixel edges and destroy
  PNG's palette compression. Nearest-neighbour at the same size gives **71 KB** and looks
  better. Lossless WebP was 289 KB and q88 WebP 99 KB — both beaten by plain PNG once the
  filter was right. That is the whole "compress script" for pixel-art sources.
- **The plaza floor is now the weakest thing on screen, and flattening made it more so.**
  It is a flat `dirt` disc filling most of the frame with nothing in it — the stand-in
  for decision 21's authored art — and it now sits on land with no relief anywhere in
  shot. **This is the honest cost of decision 46 and it is not hidden:** the island is
  blander than it was, and `KNOWN-ISSUES.md` 18 is the argument for why the answer is
  carved water rather than the relief that was just removed. Judge the two together, not
  the flatten on its own.
- **Do not raise `TOTAL_HEIGHT` without re-running the framing sweep.** The correction
  under decision 44 has the numbers and the reason; the ceiling is the camera, not the
  board, and the only real lever is lowering the ground. **The sweep's numbers moved on
  20 Aug** — with the plaza at 0 rather than 1.19–1.38, the boards frame at base 0.160 /
  top 0.574, so there is more headroom than decision 44 measured. That is headroom to
  *spend on the world*, not an invitation to a taller board: the ceiling argument is
  unchanged and a taller stack still clips first at the far edge of the beacon range.
- **`static/areas/areas.glb` is readable without a loader**, and that is worth
  remembering — the reference's shapes are all in Blender, so the source files say nothing about
  them. Parse the glTF JSON chunk and walk node transforms against the POSITION
  accessors' `min`/`max`, and every object's world bounding box falls out with no
  buffer decoding at all. It is how the board's 4.0 × 2.25 was established.
- **The console is clean again.** `RenderPipeline.renderAsync()` is deprecated in
  three r0.185 and the warm-up was the only caller; it is `render()` now, which the
  deprecation message asks for once `renderer.init()` has been awaited, and it had
  been the only output at boot.
- **Phase 2b is complete.** Load the site, drive to a project, read it, send someone a
  link that lands on that one board with its card open — all of it works. `Area`/`Areas`,
  beacons, the plaza, `setMode()`, the card layer, in-world type, both halves of the deep
  link and the real input categories have all landed, and `aerial-ascent` is written end
  to end. **What is left in the block is prose, and it is Michael's** — see *Outstanding
  input*. Note that `?at=projects&p=edgeball` is a working link to a card that says "Not
  written yet.", which is the deliberate visible hole rather than a defect; it becomes a
  real link the moment the blurb exists.
- **Two look calls are open and neither is urgent.** *When* the deep link's card
  opens — it waits for the whole cinematic today, and `playIntro()` is two seconds
  earlier; the knob is one line in `main.js`. And whether clicking the scrim should
  close a card, which it does not, and which is a modal-dismissal decision rather
  than part of the Escape defect that was just fixed.
- **Steering was inverted and is not any more** (`KNOWN-ISSUES.md` 17). Michael found
  it by driving, right after the gate. One sign in `Car.js`, measured both ways to
  confirm it is a pure flip. It had shipped since the vehicle was first wired up and
  survived a 137-second instrumented drive, because a fixed 45° camera makes mirrored
  steering almost impossible to name — you correct, the correction works, and you
  adapt. Worth remembering when planning what to *ask* someone to look for.
- **Phase 2a is closed.** All seven blocks, and the palette is chosen rather than
  inherited. The next engineering block is **Phase 2b — the vertical slice**: one
  project, reachable by driving to it, displayed in world.
- **The prose is no longer the whole critical path — one project proves it works.**
  `aerial-ascent` is complete and the card renders it properly. `edgeball` and
  `footnote` are still blank of prose, but **both now have titles** (20 Aug), so the
  shape is proven and each remaining entry is a ~30-minute writing job rather than an
  unknown. See *Outstanding input*.
- **Do not tune world brightness yet.** It is scheduled against the arrival of
  emissive props, not open — *Scheduled, not open* has the trigger, the check and the
  three levers in the order to reach for them. The first lever is free: palette entry
  12 exists, is called "emissive amber", and nothing in the world points at it.
- **`KNOWN-ISSUES.md` has one orange entry again: 18, the island's shape.** 10 and 11
  remain as yellow notes. 11 is now sidestepped for the boards specifically — the
  readable surface does not receive shadows, and the recess reads through a palette step
  instead — but nothing about the merged props mesh changed.
- **The reference clone needs its whispers guard reinstalled** before it is measured
  again — it is runtime-only and a reload loses it. `#skip` in the hash and the
  hand-pumped ticker are the two things that make it measurable at all; both are in
  `reference/README.md`.
- **Our own build is measurable headlessly too, and this session is how.** A hidden
  tab suspends `requestAnimationFrame`, so pump `ticker.emit('tick', 1/60, t)` by
  hand; timers are throttled to ~1 Hz in a background tab but **microtasks are not**,
  so a promise-paced loop drives a whole capture run in 450 ms where a
  `setInterval` pump timed out. `canvas.toDataURL()` returns a stale frame while
  occluded — render into a `RenderTarget` and use `readRenderTargetPixelsAsync`
  instead, at a width that is a multiple of 64. Bare specifiers do not resolve in an
  inline eval; find three's real URL in `performance.getEntriesByType('resource')`
  and import that, which returns the same module instance rather than a second copy.

  **Two traps inside `readRenderTargetPixelsAsync`, both of which cost a measurement
  round on 19 Aug.** Its sixth argument is a *texture index*, not a destination
  buffer — passing a `Uint8Array` there makes it look up `renderTarget.textures[buf]`
  and the failure surfaces as `TypeError: Invalid value used as weak map key` from
  deep inside `copyTextureToBuffer`. Await the returned array instead. And **the rows
  come back top-down**: index a screen pixel as `(y * width + x) * 4` with no flip.
  Assuming the usual bottom-up order samples the mirrored row, and because the
  mirrored row is usually empty sky or flat ground, the symptom is a region that
  reads perfectly uniform — which is indistinguishable from "the thing I am looking
  for did not render". It sent three separate investigations after a text plate that
  had been drawing correctly the whole time.
- **Do not edit files while Michael is driving.** Vite hot-reloads on save and it will
  yank the page out from under the reference author mid-run.
- **Hand the reference author a bare URL unless a deep link is the thing under test.** A week of
  driving from `?at=projects` hid two things: that the plaza is 33 units away and
  meant to be driven to, and that every key was live through the cinematic —
  because the deep link is the only way to reach that state. The convenience link
  is not the shipped experience, and it has now cost a finding twice.
- **Mirror any recorder to `sessionStorage`**, and gate it on something the code
  under test sets rather than on a timer. A reload ate a whole run earlier on
  20 Aug; a throttled timer manufactured two false failures in the evening.
