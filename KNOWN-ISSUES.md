# Known issues

Everything currently wrong, unfinished, or built on a wrong assumption in our own
code. Written 2026-08-19 after reading the reference author's real source file by file
(`research/source/`), and revised the same day once every design decision was
settled (`ROADMAP.md` → *Decisions settled*).

This is the defect list Phase 2a works from. The shading block — issues 1 and 3,
plus the tone-mapping and lighting half of 9 — landed 19 Aug; the rest is still
open. **The numbering here is not a running order** — `ROADMAP.md` → Phase 2a →
*The order the rest of 2a goes in* is authoritative for sequence, and several of
these are scheduled to be picked up alongside a feature rather than on their own
(2 rides with the intro rework; 4 rides with the world shape). 8 and 12 rode with
the camera and are closed.

**Severity key** — 🔴 bug (it is doing the wrong thing right now) · 🟠 wrong
direction (it works, but we built it on a false premise) · 🟡 unfinished (known
gap, no false premise).

> **Read `ROADMAP.md` first.** Several items below are now *scheduled changes*
> rather than open questions, and one of them (issue 4) was previously framed as a
> choice that the source does not leave open. There is also a list at the bottom of
> Phase 1 code that is being deliberately deleted — do not spend time polishing it.

---

## ✅ ~~1. `DoubleSide` without a normal flip~~ — was never a bug on our three

**Closed 19 Aug, by measurement, not by a fix.** This entry asserted that "three.js
does **not** flip the normal for back faces in a node material". That is false on
three **r0.185.1**, the version we are on.

`normalView` — and therefore `normalWorld` — already passes through
`negateOnBackSide()`, which multiplies the normal by `faceDirection`
(`frontFacing ? 1 : -1`) whenever the material's `side` is `DoubleSide`
(`three/src/nodes/accessors/Normal.js:105`,
`three/src/nodes/display/FrontFacingNode.js:91-107`). Back faces have been lit
correctly all along.

Porting the reference author's explicit flip (`MeshDefaultMaterial.js:76-79`) on top of that
flips **twice** and creates the bug this entry describes. Measured on the terrain
underside — a single-sided plane seen from below, so every fragment is a back
face, with the sun above it:

| explicit flip | terrain underside renders | correct? |
|---|---|---|
| added (the reference's three lines) | lit olive `#36421f` | ✗ lit from the wrong hemisphere |
| omitted | shadowed `#131f18` | ✓ |

So the flip is **not** in `makeContentMaterial`, and the reasoning is recorded at
the top of that function so nobody re-adds it.

**What this retracts.** The claim that this was "very likely a major contributor to
the scene reading so stubbornly dark during Phase 1" was wrong — there was nothing
here to contribute. The darkness came from the rest of the stack: PBR diffuse
falloff, a `HemisphereLight` fighting a flat palette, and `NeutralToneMapping`
between the palette and the screen. All three are now gone, and the intensities
were re-derived against the flat model rather than kept.

**When an explicit flip would be needed again:** `flatShading = true`, or geometry
with no `normal` attribute. `NodeBuilder.isFlatShading()` makes three skip its own
flip in both cases. We use neither today.

**Unverified for the reference's build.** The reference author is on three `^0.183.2` and `directionToFaceDirection`
(the pre-r185 name for the same function) already existed there, so the reference author may be
double-flipping too — which would mean the reference's foliage cards light wrong from behind,
the exact case the reference's comment says the flip is for. Not our problem, but do not treat
the reference's three lines as evidence the mechanism is missing.

---

## ✅ ~~2. The reveal rim is ~40× too wide~~ — narrowed with the intro, 19 Aug

**Where:** `src/core/Game.js:50` — `rimWidth: 2.4` (overriding the 2.2 default in
`src/render/Reveal.js`)

The reference's `thickness` is **0.05**. Ours is **2.4**. The worlds are near-identically
scaled — the reference's car is 2.6 units long, ours is 3.1 — so this is not a units mismatch.
The reference's rim is 1.9 % of a car length; ours is 77 %.

The reason for the difference: the reference author draws a hard, thin, bright ring and lets **bloom**
produce the glow. We have no bloom, so we are smearing a wide cubed smoothstep ramp
across the terrain to fake one.

**Fix order matters.** Add bloom first, then narrow the rim toward ~0.1. Narrowing
without bloom just makes the seam disappear. See issue 3.

**Bloom landed 19 Aug, so this is now unblocked**, and the rim is currently the only
thing in the world over 1.0 — it is what proved the bloom pass works. At `rimWidth`
2.4 with a `pow(3)` ramp and a 2.6 multiplier it now reads as a wide amber halo
rather than a seam, and any prop within 2.4 units of the disc edge lights up with
it. Left exactly as it was on purpose: narrowing it is the reveal rework, and this
pass had to stay judgeable as a shading change on its own.

> **Priority dropped 19 Aug.** The reveal is now a five-second intro
> (`ROADMAP.md` decision 4), not a permanent on-screen element. This went from
> "must survive indefinite scrutiny" to "must look right for five seconds". Still
> fix it — it is the first thing anyone sees — but it no longer gates anything.

**Fixed 19 Aug with 2a step 4.** `rimWidth` 2.4 → **0.12**, the concentrating exponent
3 → 2, and the multiplier 2.6 → **5.5** (the reference's `intensity`, verbatim).

Not 0.05, and the reason is that ours is a `smoothstep` where the reference's is a hard `step`. A
band a twentieth of a unit wide, seen at 45° through a 25° lens, is thinner than a
pixel across most of the frame and would crawl. The ramp antialiases it and the square
biases the brightness back to the outer edge, so the *lit* part is about 0.035-0.05 —
the reference's width, drawn in a way that survives the angle. 5.5 restores the bloom headroom the
narrowing took away: the peak was 2.6 across 2.4 units and is now 5.5 across 0.12, so
the ring is brighter and the total emitted energy is a great deal lower, which is the
whole point of having a bloom pass do the glow.

The rim is also now on screen for four seconds rather than for ever — `Intro` snaps the
radius to 1e5 at step 2, which parks the seam where nothing can reach it.

---

## ✅ ~~3. No bloom, and intensities tuned around its absence~~ — landed

**Done 19 Aug.** `src/render/Renderer.js` now builds a `RenderPipeline`:
`bloom(scenePass.getTextureNode('output'))` with threshold 1, strength 0.25,
smoothWidth 1 and 5 mips, summed with the linear scene pass.

`NeutralToneMapping` is gone — `toneMapping = NoToneMapping`, matching the reference author. There
is now no curve between the palette and the screen, which is what lets threshold 1
mean "brighter than the display can show" rather than an arbitrary number.

**One correction to how this was written down, and to `B` §13 rec 1.** Both said the reference author
adds bloom *after* `renderOutput`. That describes the reference's source text, not the reference's maths.
The reference author never sets `outputColorTransform = false`, so the inner `renderOutput(scenePass)`
in `Rendering.js:87` resolves to `NoToneMapping`/`NoColorSpace` and is inert; the
pipeline's own transform encodes the sum at the end
(`three/src/renderers/common/RenderPipeline.js:203-211`,
`nodes/display/RenderOutputNode.js:119-134`). Bloom is therefore added in **linear**
space, which is also the physically right place for it. We use the reference's level-1 branch
(`Rendering.js:98`), which is the same graph written plainly.

**Still open from this entry:** luminance-normalised emissives (`B` §3.5). Nothing
emissive exists yet except the reveal rim, so there is no hue to normalise; add it
with the first emissive prop.

---

## ✅ ~~4. Terrain collision is a trimesh~~ — heightfield landed with 2a step 5

**Where:** `src/world/Island.js` — `RAPIER.ColliderDesc.trimesh(...)`

Ours is a 64×64-segment trimesh for the whole terrain, which is both the slow option
and the one most likely to produce the tunnelling and catching that make a physics
site feel broken.

> **This entry was wrong, and is corrected here.** It previously offered "either a
> Rapier heightfield or a coarse cuboid set" as if it were an open choice, and cited
> the reference's 454-cuboids-to-4-trimeshes ratio as the argument against a heightfield. That
> ratio describes the reference's **props**, not the reference's terrain. The reference's terrain physics **is a Rapier
> heightfield**, extracted from a loaded GLB, plus a kinematic "bedrock" cuboid that
> follows the player only near the world boundary so you cannot fall out
> (`Floor.js:120-153`, `research/source/B-shading-and-vfx.md` §7).

**Fix, settled:** heightfield for terrain, cuboids for props, trimesh for nothing.
Add the bedrock cuboid with it.

**The reference's heightfield and bedrock, both measured off the running clone 19 August** — and
the bedrock is not what this entry assumed:

- **The heightfield is 129 x 129 samples, cell size 1.5, extent ±96**, built from the
  terrain GLB's vertex y (`Floor.js:120-152`). Ours is a 64 x 64 trimesh over ±150.
- **Its height range is exactly 0 to -1.5.** The reference's land is *dead flat* at y = 0; the only
  physical relief in the reference's entire world is the dish that runs down to the water. Every
  bump you see is a prop or an area platform, never terrain. 65 % of the field is
  land, 23.8 % shelf, 11.2 % sitting on the -1.5 floor.
- **The bedrock is a follower floor, not a boundary wall.** Kinematic cuboid,
  half-extents `[6, 0.5, 6]`, centre at `water.depthElevation - 0.5 = -2.0`, so its
  **top face is exactly the -1.5 water floor**. It enables when `|x|` or `|z|` exceeds
  `terrain.size/2 - 6 = 90` and snaps to `round(player x/z)` every frame. It does not
  stop you leaving the island — it *carries* you. Driven and confirmed: full throttle
  off the edge runs out to x = -502 at a constant 5.45 m/s with all four wheels in
  contact, indefinitely, with nothing catching it.

That is a better answer than a wall for us too: it makes 15 unreachable by
construction rather than by a rescue, and it costs one kinematic body.

**Fixed 19 Aug with 2a step 5.** `world/Terrain.js` is a single 101 × 101 grid at the reference's
cell size of 1.5 over 150 units, and `world/Island.js` hands it straight to
`ColliderDesc.heightfield` in the reference's `heights[iz + ix * SAMPLES]` layout. The trimesh is
gone, and so is the separate 64-segment collision surface: the drawn mesh is built from
the same grid, so what you look at and what you drive on are the same surface.

The layout was the one thing that could have failed silently, so it was checked rather
than assumed: **ten asymmetric probes, including the (40,0) / (0,40) pair whose ground
heights differ by 0.9 units, all rest at 1.119–1.155 of clearance.** A transposed field
would have shown that pair disagreeing by the full 0.9.

`world/Bedrock.js` came with it, and it is the reference's follower floor rather than the wall this
entry originally imagined. Probes at (85,0), (0,85), (−95,30), (140,−140) and (300,0)
all rest at **−0.364** — the water floor plus the car's clearance. Nothing falls.

**The 6 Hz residual moved rather than vanished, and that was enough.** On a 24-unit
stretch flat to 0.004 units, driven to terminal on a treadmill, the pitch above 4 Hz
reads **0.024° RMS at 12.0 Hz** against the trimesh's 0.028° at 6.1 Hz. The amplitude
barely moved; the frequency doubled — which is what facet-tracking predicts when the
collision cell goes from 4.69 units to 1.5, so the diagnosis in this entry was right.

Michael drove it and closed it: *"12hz shake is fine dont worry about that now."* The
same residual at half the frequency was something the reference author could see and asked about twice;
at 12 Hz it is not. Nothing further is owed here.

**It has a measured symptom now (19 Aug).** After the substep fix in 14 removed the
solver artifact, a residual pitch oscillation remains while driving: **0.028 deg of
jitter at 6.1 Hz**, repeatable to the digit, and **completely immune to suspension
damping** (relaxation swept 2.7 -> 10.2 changes nothing, and top speed is 11.27 at
every value). An oscillation damping cannot touch is not a spring mode. Its spatial
period is **3.3-3.6 apparent units**, against a collision grid whose diagonal spacing
is 4.69/sqrt(2) = **3.31 units** — consistent with the wheels tracking a faceted
surface. Not proven: the 0 deg and 90 deg control runs both hit props before reaching
speed, so the heading comparison that would clinch it is missing. **Treat the
heightfield swap as the test.** Michael can still see this residual by eye.

---

## ✅ ~~5. The 1×1 warm-up render only warms one direction~~ — fixed 19 Aug

**Where:** `src/render/Renderer.js:62-84` — `warmup()`

We render one frame into a 1×1 target. The reference's `PreRenderer` uses a **32px cube camera**
— six 90° faces — so every direction is covered. A single perspective view cannot
warm shaders for geometry behind the camera, which is exactly what you drive into
three seconds later.

Keep two things from ours and take one from the reference's: keep our `await` (the reference's is
fire-and-forget), keep the timeout, and add the reference's gate — the reference author only pre-renders when
`quality.level === 0 && isWebGPUBackend`. Six passes on a phone is a visible stall on
the critical path.

**Fixed 19 Aug** — `Renderer.warmup()` now renders six 90° faces into a 32px
`CubeRenderTarget`, gated to the WebGPU backend, with our `await` kept and the whole
thing wrapped so a warm-up failure can never be the reason the site does not start.

**Two corrections came out of doing it**, and the second is the bigger half:

- **The stated mechanism was already mostly handled.** `WebGPURenderer.compileAsync`
  frustum-culls while it builds its render list — unlike the WebGL one, which walks
  the whole scene — so this entry's "a single perspective view cannot warm shaders for
  geometry behind the camera" was right about the renderer and wrong about ours: our
  warm-up already set `frustumCulled = false` on every mesh first, which defeats that
  culling entirely. With three materials in the whole world, the cube pass is
  insurance rather than a fix.

  **That count is no longer three, 19 Aug.** There are five shared materials now, plus
  **one text material per label and one image material per project** — the text mask and
  the screenshot are per-instance, so those cannot be shared. They are not in the warm-up
  because they do not exist yet when it runs: the plaza builds lazily. In practice they
  still compile behind the loader, because the plaza's build radius covers the spawn and
  so it builds on the first tick — but that is a property of *this* area's placement, not
  a guarantee. An area far enough out to build mid-drive would compile its materials
  mid-drive. Worth remembering when the next five areas land.
- **The real gap was the post chain, and nobody had noticed it.** The old warm-up
  called `renderer.renderAsync` directly, so it never touched `pipeline.render()` —
  bloom's five mip passes were compiled on the first presented frame, every time.
  That is now warmed too, and it is the part most likely to have been the hitch.

**Not measured: the cold cost.** The warm-up re-runs in 12 ms once everything is
compiled, which says the steady-state overhead is nil, but the first-run figure needs
instrumentation inside boot that would have to ship to be read. It sits inside the
loader's 900 ms minimum either way, and the WebGPU gate keeps it off phones.

---

## ✅ ~~6. No global time scale~~ — landed

**Done 19 Aug.** `src/world/Physics.js` takes a `timeScale` of 2:
`world.timestep = timestep × timeScale` (1/30 of simulated time per 1/60 of wall
clock) while `vehicleDt` stays at 1/60 and is deliberately not scaled. That 0.5
ratio is what the reference's constants were tuned against (`PhysicsVehicle.js:511-512` vs
`Physics.js:242`), and reproducing it is what let §5.2 transfer with no
arithmetic. Gravity stays a plain −9.81 and becomes an apparent −39.24, the reference's.

We keep our fixed accumulator rather than the reference's variable timestep, so this is the reference's
time scale on better foundations (`C` §13.4).

**Landed in `Ticker.js`? No — and deliberately.** The scale lives in the physics,
not the clock. Nothing outside Rapier wanted a doubled delta: the camera follow,
the zoom and the visual smoothing all run on wall-clock time in the reference's code too, and
a `ticker.scale` would have meant every consumer choosing a delta correctly
forever. One line in one file instead.

**Two traps that survive the decision:**

- Porting a rate constant from the reference's code to a plain delta is **×2, not ÷2** — the reference's
  constants multiply an already-doubled delta. (`research/source/` reports `C`
  §5.1a and `00-SYNTHESIS.md` §1.2. Report `D` carried the opposite guidance until
  19 Aug; it is now corrected in place.)
- The reference author **mixes both deltas in the same file.** The camera's position follow, zoom and
  magnet run on plain `delta` while the roll spring runs on `deltaScaled`. There is
  no blanket conversion. Stiffness is 1/s² and scales by 4; damping is 1/s and
  scales by 2.

Both were live in this pass. The two visual-smoothing rates in `Car.js` are the reference's 16
and 25 written as **32 and 50**; the roll spring in `world/View.js` is the reference's
pullStrength 100 and damping 4 written as **ω 20 (so 400) and 8** — the same four
lines needing two different factors, which is the trap inside the trap.

---

## ✅ ~~7. Car handling is untuned~~ — retuned

**Done 19 Aug.** `C` §5.2 applied, rows 1–16, in that order and with row 13 last.
Measured afterwards on flat ground with the props removed:

| | before | after |
|---|---|---|
| Top speed | — | **11.0 physics m/s ≈ 22 apparent**, settled by 5 s |
| Lift-off, 1 s later | — | 4.1 physics m/s |
| Handbrake stop from cruise | — | **0.63 s** |
| Full-lock turn radius at speed | — | **7.3 units**, holding 5–6° of slip |
| Suspension at rest | 0.27 of 0.36 | **0.74 of 0.88**, all four in contact |
| Chassis ground clearance | 0.5 | **0.84** |

The slip number is the one that matters for row 13: flat steering with the grip
values corrected produces a tight, controlled turn, not a spin. That was the risk
the row-13-last ordering existed to catch, and it is clear.

**One row `C` §5.2 does not have, added on the evidence.** The table changes the reference's
angular damping (row 6) and omits the reference's **linear** damping, which `C` §2.2 records
as 0.1 — the Rapier factory default the reference author never overrides. It is not a harmless gap:
the soft limiter only ever *softens* the engine force, so nothing but drag
actually sets a top speed. Measured both ways, full throttle to terminal:

| linear damping | top speed | behaviour |
|---|---|---|
| **0.04** (ours) | 15.4 physics m/s | still climbing at 20 s, coasts on at 9.2 after a second off the throttle |
| **0.10** (the reference's) | **11.0** physics m/s | settled by 5 s, down to 4.1 a second after lift-off |

Taken at 0.1. Most of "deliberate rather than floaty" lives in that number.

**Row 18 skipped on a premise check.** The mass-0 oversized bumper on its own
collision group exists so that *dynamic* props scatter generously without the
inflated shell catching on terrain — the reference's benches, bricks, fences, lanterns and
crates are all `type: 'dynamic'`. Every prop in our `Island.js` is a fixed body,
so an inflated shell would only stop the car further away from static trees, which
is the opposite of the intent and makes issue 8 worse. It lands with dynamic props.

**Not in this pass:** the go-kart proportions (row 17). `ROADMAP.md` decision 19
bundles those with the Phase 3 visual rework, so geometry and handling are never
changed in the same sitting. Two consequences of row 5 are therefore visible right
now and are *not* bugs: the car rides 0.84 clear of the ground on 0.84-diameter
wheels under a 0.62-tall body, which reads as a raised truck. The reference's does too. The
proportions pass is where that gets an answer.

---

## ✅ ~~8. Prop density blocks the first drive~~ — cut with the camera

**Where:** `src/world/Island.js` — the `scatter()` calls

220 trees and 70 buildings inside a 300-unit square, with only a 16-unit spawn
clearing. During testing the car repeatedly stopped dead against a tree within two
seconds of setting off. The first thirty seconds of the site are the ones that matter
most.

`Island.js` is placeholder geometry that Phase 3 replaces, so do not over-invest —
but the density has to come down before anyone drives it for evaluation, and the
island is shrinking to ~150 units, which makes it worse rather than better.

**Coupled to the camera rework, noted 19 Aug.** This stops being cosmetic the moment
decision 15 lands. FOV goes 48° → **25°** — a much longer lens — and the angle is
fixed at 45°, so any prop on the line between camera and car is a static occluder that
you cannot steer the view around. Decision 15's claim that a fixed angle "deletes
occlusion" is about not *rotating* into occluders; standing ones remain. Cut density in
the same sitting as the camera, not after.

**Done 19 Aug, in that sitting.** 70 buildings / 220 trees / 160 rocks became
**22 / 70 / 70**, and the spawn clearing went 16 → **30**. That is one colliding prop
per ~700 m² instead of per ~230. The clearing number is not arbitrary: the camera
settles 17.4 units out along +X+Z and 11.8 up, so a clearing smaller than the
camera's own reach puts a tree in shot before the car has moved.

Deliberately not tuned further. This is placeholder geometry, and the island halving
to 150 units will make the density worse rather than better — the counts get set
properly against the authored shape in the world-shape block.

---

## ✅ ~~9. The night mood was an accident~~ — chosen, 19 Aug

Nobody chose night. It fell out of light intensities that were themselves chasing
issue 1.

**Answered 19 Aug.** We adopt the reference's cycle in full: a **240-second UTC-epoch-synced day
cycle** plus a real-time year cycle, with the reveal rim colour swinging with it
(`ROADMAP.md` decisions 11 and 12). Time of day is no longer a fixed choice at all —
every visitor anywhere sees the same sky at the same instant, and it costs no more
than a fixed lighting rig once the keyframes are authored.

**Intensities re-derived 19 Aug**, and they are not the old ones. `HemisphereLight`
1.55 and `DirectionalLight` 3.2 are both gone. `src/render/Lighting.js` now carries
the three uniforms the material actually reads:

| | value | why |
|---|---|---|
| `LIGHT_COLOR` | `#fff0d8` | our existing sun hue, kept |
| `intensity` | **1.2** | `lightColor_linear x 1.2` averages 1.02, so a fully lit surface reproduces its palette colour. The brightest palette entry then lands at 0.97 — just under the bloom threshold, so the world never blooms and only emissives do. |
| `SHADOW_COLOR` | `#6b7fb8` | a tint, not a darken. Shadow/lit luminance ratio 0.21. |

The intensity agreeing with the reference's 1.2 is a coincidence worth noting rather than a
copy — it falls out of "no tone curve, so make `light x intensity` come to 1".

`SHADOW_COLOR` **was** chosen at the reference's ratio (0.16, using our indigo `#4a63c0`) and
that was too strong: a cream building rendered as a blue building, and albedo
identity was lost across the whole palette. Judged against real renders and pulled
back. Its final value belongs to the **2a colour gate** anyway — shadow colour is one
of the five properties `DayCycles` drives, and it cannot be chosen honestly until fog
and sky exist to be coherent with, because on the reference's site the blue shadow works
precisely because the sky is also blue. Ours currently sits against a black void.

**The cycle landed 19 Aug and the table above is now a floor, not a fixture.**
`DayCycles` writes all three of those uniforms every frame, so the values in
`Lighting`'s constructor are only what the first frame is built against. What
survives from this entry is the *rule*, and it is what every candidate palette in
`src/cycles/palettes.js` is derived by: `mean(linear(lightColor)) * intensity ~= 1.02`,
which reproduces the 1.2 above as 1.196, and a shadow/lit luminance ratio of 0.205,
which is what `#6b7fb8` measures against `#fff0d8` at 1.2. Two measurements came out
of applying it:

- **The 0.97 figure means the brightest non-emissive entry.** `#ffb454` (index 12,
  "emissive amber, the rim") has a channel of exactly 1.0 and lands at 1.2, which is
  the whole intent of "the world never blooms and only emissives do". Worth stating,
  because the number does not reproduce without that exclusion.
- **The reference's night breaks the rule on purpose.** `#3240ff` at 3.8 puts the brightest
  palette entry at **3.37** — every surface over the bloom threshold, not just the
  emissive one. Candidates B, C and D land at 0.56–0.64. So "adopt the reference's palette" and
  "keep the bloom rule" are not both available, and the colour gate is where that
  gets decided rather than discovered.

**Closed 19 August: the gate ran and Michael chose A**, his palette, so the second
bullet is now the shipped behaviour rather than a finding — our nights bloom, on
purpose, the way the reference's do. Nobody's mood is an accident any more: it is UTC-epoch
time of day, on keyframes somebody looked at.

The one thing that came *out* of the verdict is the mirror image of that bullet, and
it belongs here because it is a lighting fact rather than a content one. **In
daylight nothing blooms at all.** The brightest thing anywhere in the world under the reference's
day light is 0.93, against a threshold of 1 — because `#ffb454`, palette entry 12,
the only entry that would clear it and the one literally named "emissive amber", is
**used by nothing**. `Island.js` paints its accents from `accentWarm` and
`accentCool`. So the bloom pass earns its cost at night and idles through the day,
and Michael's read of the gate — *"too dark in some areas but its because we dont
have any glowing objects"* — is exactly that, measured. It is scheduled against the
arrival of emissive props (`ROADMAP.md` → *Scheduled, not open*), not open, and the
first lever is free: point something at entry 12.

---

## 🟡 10. The TSL edge-order trap — no longer latent

Chained `.step()` and `.smoothstep()` put the **receiver last**: `a.step(b)` compiles
to `step(edge = b, x = a)`, so the receiver is the *value*, not the edge
(`three/src/nodes/math/MathNode.js:1157,1207`, verified against r0.185.1).

We have already shipped one bug from reversed `smoothstep` edges — it made the entire
void grid invisible. This is the same trap wearing a different hat. Assume the chained
form is reversed until proven otherwise, and prefer the explicit functional form in
new material code.

**Confirmed against r0.185.1 while porting the toon material**, and it is not latent —
**the reference's own code trips it**. `MeshDefaultMaterial.js:105` writes the core-shadow ramp as
`reorientedNormal.dot(direction).smoothstep(coreShadowEdgeHigh /* 1 */, coreShadowEdgeLow /* -0.25 */)`.
Chained puts the receiver last (`MathNode.js:1146`, `:1222`), so that compiles to
`smoothstep(1, -0.25, x)` — edge0 > edge1, undefined in WGSL, and zero on the backend
that ate our void grid. Ported literally it would have silently deleted the entire
core-shadow term, leaving every object lit dead flat, and we would have concluded that
flat toon shading looks bad.

`src/render/materials.js` writes it rising and inverts:
`smoothstep(low, high, x).oneMinus()`. For the Hermite cubic that is exactly equal —
`h(1-t) = 1 - h(t)` — so this is a transcription fix, not a change to the reference's look.

**The day cycle is built out of smoothsteps too, and it fails differently.** Every
phase transition in `src/cycles/Cycles.js` is `smoothstep(progress, prevStop,
nextStop)`, on the CPU — so a backwards pair is not undefined and does not compile to
zero. The clamp keeps it finite and you get a **reversed ramp**: that phase would run
from the *next* colour to the *previous* one, which reads as a palette mistake rather
than as a bug, and would be blamed on whoever authored the colours. The guard is at
the other end: `_setSteps()` refuses to build a keyframe list whose stops do not
strictly increase, and it checks *after* wrap injection, so an authored list that is
fine on its own but closes badly is caught too. Verified — it throws on a duplicate
stop.

So the rule now reads in two halves. **In TSL, an inverted pair deletes the term
silently.** **In JS, it reverses it silently.** Neither is visible at the call site,
which is why both ends are guarded rather than commented.

---

## 🟡 11. Props cast a sawtooth self-shadow

**Where:** the merged props mesh, `src/world/Island.js` — visible as a regular comb of
triangular teeth along the shadow boundary on building walls.

Found 19 Aug while judging the toon material. **Pre-existing, not caused by the
shading rewrite** — but it matters much more now, because the drop shadow selects a
*colour* rather than just darkening a PBR result, so its artefacts are shading
artefacts.

**Isolated to prop-on-prop casting.** `props.castShadow = false` removes it completely.
Ruled out, each measured with no visible change:

- `shadowSide` — `FrontSide` versus three's derived `DoubleSide`
- `shadow.normalBias` — 0.03 versus 0.1 (the reference's). **0.1 made the teeth larger**, so do not
  reach for it first
- shadow-camera ortho half-extent — ±55 versus ±30, i.e. 2× texel density

That last one is the interesting negative: if doubling texel density does not move it,
plain shadow-map resolution is not the cause, and `B` §13 rec 6 (derive the ortho box
from the visible ground) will not fix it on its own. Worth 30 minutes with the shadow
frustum on screen before that rec is implemented, so the rec is not credited with a fix
it does not deliver.

**Sidestepped for the monoliths, 19 Aug, and the trick may generalise.** The plaza was
the first thing built where this mattered — a 0.16-deep recess is prop-on-prop casting
held right against the one surface anybody reads closely. Rather than fight the comb,
the readable panel is a separate mesh with `receiveShadow = false`, and the framing it
sits in reads as *recessed* through a palette step (`buildingLight` → `rockDark`)
instead of through a cast shadow. Decision 44 asks the recess for "a frame and a shadow
line so it reads without lighting tricks"; a palette step is darker than any shadow the
frame could cast, is exactly as crisp at every distance, and cannot alias.

So the entry stays open — nothing about the merged props mesh changed — but the rule
worth carrying is: **where a surface has to be read, prefer a palette step to a cast
shadow.** That is cheaper, and it is also more faithful to a shading model that already
refuses N·L.

---

## ✅ ~~12. Terrain relief is ~2.3x too tall for the camera we are about to fit~~ — flattened

**Where:** `src/world/Island.js` — `heightAt()`

```js
Math.sin(x * 0.055) * Math.cos(z * 0.061) * 1.5 +
Math.sin((x + z) * 0.021) * 1.1 +
Math.cos(x * 0.013 - z * 0.017) * 0.8
```

Amplitudes sum to **±3.4 units**. Decision 17 records the reference's total displacement as
**1.5**, and says plainly: with no vertical camera follow, *a hill tall enough to hide
the car is a bug*. Our car is roughly **1.7 units** tall (chassis 0.62 + cabin 0.6 at
+0.58, riding ~0.78 above ground on `restLength` 0.36 + wheel radius 0.42), so a single
term of this function already clears it.

Found 19 Aug while planning the camera rework. It does not show today only because the
Phase 1 chase camera follows Y and so climbs with the car.

**Two things make this more than a one-line fix:**

- `heightAt()` feeds **both** the render mesh and `collisionMesh()`, so the visual and
  physical surfaces must change together or the car drives on an invisible floor.
- It is superseded anyway by the **terrain heightfield** (issue 4 / decision 38), which
  is authored, not procedural. Do not spend long tuning these three sine terms — flatten
  them enough to make the camera judgeable, and let the heightfield carry the real
  shape. Decision 17: the island's form comes from the shore, not from hills.

**Done 19 Aug, with the camera.** `Island.js` exports `RELIEF = 1.5` and the three
terms are now fractions of it (0.44 / 0.33 / 0.23), so they sum to exactly the reference's 1.5.
Both surfaces move together for free because `heightAt()` already fed both the render
mesh and `collisionMesh()`. The underside cone's cap is derived from `RELIEF` too —
flattening the ground without it opens a two-unit gap you can see straight through
from the side.

Taken no further on purpose, per the note above. The stopgap exists to make the
camera judgeable, and the heightfield replaces all of it.

---

## ✅ ~~13. The fixed camera was wrong in two independent ways~~ — both fixed same day

### 13a. It trailed the car off the bottom of the screen

**Found by driving it**, not by reading anything.

`C` §6.7 says a 10/s exponential lerp and an ω 5 critically damped spring "both
settle in roughly 100–200 ms", and on that basis our Phase 1 ω of 5.0 was carried
into the new rig unchanged. Settling time is the wrong measure for a camera whose
target never stops moving. The right one is **steady-state trail** — how far behind
a constantly-moving target the filter sits:

| filter | trail | measured at 21.7 apparent m/s |
|---|---|---|
| exponential, rate 10 (the reference's) | `v / k` | **1.8 units** |
| critically damped, ω 5 (ours) | `2v / ω` | **8.4 units** |
| critically damped, ω 20 | `2v / ω` | **1.9 units** |

At radius 21 through a 25° lens the visible ground runs only ~6 units behind frame
centre, and the damage is **direction-dependent**, which is why it read as "something
is off" rather than as an obvious bug. Car position in NDC at full speed, where ±1 is
the frame edge:

| heading | ω 5 | ω 20 |
|---|---|---|
| toward the camera (+X+Z) | **y −1.18 — off the bottom of the screen** | y −0.14 |
| across (+X−Z) | x +0.85 | x +0.20 |
| across (−X+Z) | x −0.84 | x −0.19 |
| away from the camera (−X−Z) | y +0.16 | y +0.16 |

Driving away from the camera was fine, driving across pinned the car to the frame
edge, and driving toward the camera lost it entirely.

> **These NDC figures were measured at radius 21, before 13b moved it to 30.** The
> trail itself does not depend on the radius — `2v/ω` is a property of the filter and
> the speed — but how much of the frame it eats does. At radius 30 the visible ground
> runs ~8.9 units behind centre rather than ~6, so an 8.4-unit trail would have sat
> at the very edge instead of past it. The fix stands either way; the framing numbers
> above belong to the state they were taken in. It read as the car being
dragged rather than driven, and it made the *car* feel wrong as much as the camera.

Matching the trail is `2v/ω = v/k`, so **ω = 2k = 20**, with the acceleration
ceiling raised 140 → 300 to go with it. The ceiling matters: at ω 20 a clamp of 140
dominates teleport recovery and made respawn *slower* than it had been at ω 5
(2.33 s against 1.42 s); at 300 the same 56-unit jump recovers in 0.63 s and normal
driving never touches the clamp.

**What this does not change.** The spring stays, and so do both properties decision
15 kept it for — velocity continuity and an acceleration ceiling a lerp does not
have. ω 5 was never part of that decision; it was a Phase 1 number tuned for a
chase camera that rotated and followed Y, which is a different rig with a different
job.

**Two things ruled out** while looking for this, both measured, both no change:

- **Suspension stiffness.** Ours is 26, the reference's live value is 20 (`C` §2.4). Rest ride
  height differs by 0.04 units and squat by half a degree; turn radius and roll are
  identical. Left at 26, where `C` §5.2 row 1's critical-damping arithmetic assumes
  it.
- **The go-kart proportions** (`C` §5.2 row 17). Wheelbase 2.24 → 1.80 moves the
  turn radius 7.01 → 6.93 and the yaw rate 113 → 110 °/s. At these grip values the
  car is slip-limited, not Ackermann-limited, so row 17 carries no handling content
  at all. It is not the framing fix either — see 13b, which found the framing in the
  camera and corrects the chassis half of decision 19 outright.

### 13b. The resting radius was 21; the reference's shipped build drives at 30

Found the same day, by running the reference's repo locally and reading the live object rather
than guessing from screenshots.

`View.js:287` initialises `zoom.baseRatio = 0.6`, which is where our 0.6 came from,
and where "radius 21" in decision 15 came from. **It is only the reference's initial value.**
`Reveal.js:185` tweens it to 0 during the intro and step 2 (`Reveal.js:211-227`)
never restores it — it destroys the grid, starts the server and unsubscribes. Read
off the reference's running build after the intro: `zoom.baseRatio 0.001`, `radius.current
29.99`, `reveal.step 2`.

So the reference's shipped resting radius is **30**. Ours was **21** — 43 % closer, through the
same 25° lens. That is what "the reference's field of view looks wider" actually was.

| | camera radius | car share of frame height |
|---|---:|---:|
| the reference's | **30** | 22.9 % |
| ours, before | 21 | 37.9 % |
| ours, after | **30** | 26.5 % |

`ZOOM_BASE_RATIO` is now 0. One consequence rides along: with the base at 0 the
speed pull-back drives the ratio *negative*, and neither the reference's lerp nor
`MathUtils.lerp` clamps, so the radius runs past 30 to ~34 at our top speed. The reference's
behaves identically for the same reason. It exceeds the "radius 15–30" in decision
15, and the 15 end is now unreachable — it exists for the zoom control, which we do
not have.

**And the car was never the problem — a correction.** This was first blamed on our
car being 19 % longer than the reference's (3.1 against 2.6). That compared our *visual model*
to the reference's *collider*. Measured in its own local frame so rotation cannot inflate it,
the reference's visual chassis is **2.99 × 1.66 × 2.04**; ours is 3.1 × 1.19 × 1.7. Same length
to within 4 %, and the reference's body is taller and wider than ours.

**One divergence left standing, deliberately.** `Reveal.js:178` switches the reference's focus
point magnet **off** after the intro (`magnet.active = false`); ours is on for good.
It is inert today — while `isTracking` we copy the tracked position into the focus
point first, so the magnet's delta is always zero — but the moment anything detaches
tracking, ours pulls where the reference's does not. **Measured on the reference's running build after the
intro: `focusPoint.magnet.active === false`, `isTracking === true`.** Decide it with
whatever first detaches the focus point.

> **This corrects decision 19.** Its "chassis 3.1 m → 2.6 m" half is derived from
> the reference's collider, not the reference's model — the reference's model is 2.99, and the reference's collider is deliberately
> 13 % smaller than the thing you see. Shrinking our visual chassis to 2.6 would
> make our car *smaller* than the reference's. The wheelbase half of the decision (2.24 → 1.80)
> is unaffected and still stands.

---

## ✅ ~~14. The car shook while driving~~ — mostly fixed, residual traced to 4

**Found by feel, by Michael, on the first genuinely foreground drive** — and it is the
whole argument for that drive existing. Nothing in the geometry or the steady-state
physics showed it, because it is neither.

Measured while driving: all four wheels grounded on every frame, camera roll ±0.2°
with 0.0017° of jitter, body height and camera height jitter 0.0007 and 0.0005 units.
So not the impact shake, not the terrain, not the camera. **The chassis was pitching:
0.1178° of jitter at 29.7 Hz.** Body height barely moved while pitch oscillated, so
front and rear suspension were moving out of phase.

**29.7 Hz is half the 60 Hz substep rate** — it flipped sign on every single step.
That is an explicit solver at its stability limit, not a suspension mode, and damping
confirmed it: raising relaxation towards critical made it **worse** (0.118 → 0.385)
and cost 2.8 m/s of top speed. The first diagnosis — an underdamped rebound, since
relaxation 2.7 is only 26 % of critical — was wrong, and the damping sweep that
appeared to support it was contaminated by the artifact it was measuring through.

**The cause is decision 18's implementation, not the decision.** We bought the 2×
time scale by doubling `world.timestep` to 1/30, which halved the suspension solver's
effective rate. Halving the substep restores it and keeps the decision intact:

| substep | `world.timestep` | pitch jitter | frequency | top speed |
|---|---:|---:|---:|---:|
| 1/60 (was) | 0.0333 | 0.1178° | 29.7 Hz | 11.28 |
| **1/120 (now)** | 0.0167 | **0.0250°** | 6.0 Hz | 11.27 |
| 1/240 | 0.0083 | 0.0253° | 6.0 Hz | 11.28 |

1/120 is the knee — 1/240 buys nothing. **Top speed is identical across all three**,
so every constant in `world/Car.js` transfers untouched: the vehicle is called twice
as often with half the dt, which is the same impulse per second, and the 0.5
`vehicleDt`:`world.timestep` ratio that `C` §5.1 depends on is preserved (1/120
against 1/60). `maxSubSteps` doubled to 10 to match. Verified in a fresh build, and
reverting reproduces the old numbers exactly.

**Michael can still see a smaller shake.** That residual is the 6 Hz component, and it
is traced to 4 — see there. Do not chase it with damping; damping does not move it.

---

## ✅ ~~15. `respawn()` cannot rescue anyone who left the world~~ — fixed with 2a step 5

**Where:** `src/world/Car.js` — `respawn(position = null)`

It defaults to respawning **in place**: same x/z, `y` lifted to `max(y, 0) + 3`. So
the recovery control does nothing in the one situation a player most needs it. Drive
off the ±150 heightfield edge and every press of R drops you back into the void. An
autopilot run during testing ended at **y = −10,871**, still falling, and every
measurement it took after that point was of freefall rather than of driving.

Michael reached **159 units** from origin in ordinary play without falling, so the
edge is reachable in normal driving, not only by a test harness.

**Fix:** respawn to the nearest valid spawn point rather than in place — the same
machinery decision 43 needs for the water shelf, and which the bedrock boundary
cuboid in 4 is meant to make rare. Until then, treat any measurement taken after a
fall as void: check `y` before trusting a number.

**The reference's machinery, read and driven 19 August**, because ours should be the same shape:

- **18 authored respawn points**, loaded from `respawnsReferences.glb`, all at
  **y = 4**, each carrying an authored yaw (`Respawns.js`). Ours wants an equivalent
  list, authored with the world in 2a step 5 rather than derived at runtime.
- **`getClosest` uses horizontal distance only** — `Math.hypot(dx, dz)`, y ignored.
  That is what makes it work for a car at y = -10,871: the fall does not change which
  point is nearest. Verified live from (-502, -36): it returns `timeMachine`.
- **Every recovery path funnels through one method.** `R`, the Options menu, the map,
  and the interactive **unstuck** button all call `Player.respawn()` ->
  `getClosest(player.position)` -> `moveTo`. The unstuck button appears on a `stuck`
  event: **less than 0.5 units travelled over 3 s while `|accelerating| > 0.5`**.
- **The respawn is hidden behind `overlay.show()`**, a full-screen fade whose callback
  does the teleport — the same trick decision 43 wants for the water fade.

And the thing that makes the reference's version rarely needed: **the reference's bedrock is not a wall, it is
a floor that follows you.** See 4.

**Fixed 19 Aug with 2a step 5**, in three parts rather than one:

- `Island.closestSpawn(x, z)` over a generated list of spawn points, horizontal
  distance only, y ignored — the reference's rule, and the reason the reference's works for a car at
  y = −10,871.
- `Car.respawn(position, heading)` now takes a heading and clears the drowning state
  with it. Respawning in place survives only as the debug-console default.
- `Game._drown()` funnels **every** recovery path — the R key and the drowning
  threshold — through the same fade-teleport-fade, so there is one code path to get
  right rather than two. `View.reset()` snaps the camera spring inside the cover,
  because a spring cannot filter a teleport and should not have to.

And leaving the world is now unreachable rather than merely rescued: the shore dish
drowns you well before the height field ends, and the bedrock is under you if anything
ever gets past that.

---

## ✅ ~~16. Braking reared the car onto its nose~~ — regression, fixed same session

**Found by feel, by Michael, immediately after 14 shipped:** *"when we go full speed
and then brake it almost flips over."* It was **caused by the fix for 14**, and the
mechanism is a Rapier asymmetry worth knowing permanently:

- **`setWheelEngineForce` is a force** — integrated over the substep `dt`.
- **`setWheelBrake` is a per-step impulse** — it ignores `dt` completely.

So halving the substep left top speed *identical* (11.27 vs 11.28, which is exactly
why 14 looked free) and **doubled braking**. Measured, at the same 11 m/s entry:

| substep | deceleration | peak pitch | frames with wheels lifted | stop time |
|---|---:|---:|---:|---:|
| 1/60 (before 14) | 23.23 | 8.62° | 11 | 0.47 s |
| 1/120 (14, unfixed) | 39.22 | **69.49°** | 178 | 0.28 s |
| 1/120 + `brakeScale` | 25.54 | **8.25°** | **0** | 0.43 s |

**Fix:** derive all three brake values from the live timestep in the `Car`
constructor — `brakeScale = BRAKE_AMPLITUDE * world.timestep` — rather than hard-code
them. `HANDBRAKE` was already a per-step value ("the reference's 1.0 × brakeAmplitude 35 ×
deltaScaled") and I changed the step without rescaling it; `IDLE_BRAKE` and
`REVERSE_AS_BRAKE` had never been scaled at all and so ran ~14 % weaker than the reference's.
Deriving all three fixes both faults and makes a future substep change safe.

This lands us on the reference's braking exactly: the reference's 0.4 × 35 × 1/30 = 0.467 per step at
60 steps/s = 28 impulse/s; ours 0.4 × 35 × 1/60 = 0.233 at 120 steps/s = the same 28.
The reference author applies brake to all four wheels equally (`PhysicsVehicle.js:493`), as we do.

**Still open: the handbrake flips the car** — 49.9 m/s² of deceleration, 88° of
pitch, `upsideDown` true. This is **not** a regression: at 1.0 × 35 × 1/30 × 60 it was
already 70 impulse/s before the substep change and it is 70 impulse/s now, and it is
the reference's value. We also already match the reference's mass (2.5) and the reference's centre-of-mass offset
(`localCom` reads `[0, -0.5, 0]`, from `setAdditionalMassProperties`), so the tip
threshold — about 16.4 m/s² at a 2.24 wheelbase with the CoM 0.67 above ground — is
the reference's too.

**Answered 19 August by the instrumented A/B. Entry speed was never the unmatched
term, and the flip is authentic in kind.** Measured on the reference's running clone at a forced
1/60 (`ROADMAP.md` -> *The instrumented A/B*):

| Entry 10.96 physics m/s | The reference's | Ours |
|---|---:|---:|
| Full brake, peak nose-down | **66.3 deg** | 88 deg |
| `upsideDown` ratio peak | **0.299** (the reference's own threshold is 0.3) | over 0.3 |
| Frames with all four wheels off | 9 | — |
| Reverse-as-brake, peak pitch | 10.5 deg | 8.25 deg |

The reference's terminal speed is **11.005-11.028**, ours 11.5-11.74 — a 5 % gap, not the 2x the
`topSpeed 5` reading implied. So Michael's read was right: **his car rears violently
under a full brake too, stopping a thousandth short of tripping the reference's own flip
recovery.** Ours simply goes about a third further and trips it.

Three candidate mechanisms were checked and eliminated:

- **Principal inertia.** The reference's is `{1,1,1}` (`Physics.js:177`), the same as ours.
- **The bumper collider as a nose-guard.** Disabling it on the reference's live instance changed
  the braking result **not at all, to the digit** — the chassis never touches ground
  during the manoeuvre; the body centre stays at 1.08 throughout while the *rear*
  lifts. It is an airborne rotation, not a geometric stop.
- **Wheelbase.** The reference's is **1.8**, not the 2.24 this entry previously credited the reference author with;
  2.24 is ours. Ours is 24 % longer, which makes ours *harder* to tip, not easier —
  so this points the wrong way and cannot be the cause.

**`frictionSlip` was the last suspect, and it is eliminated too.** The reference's is 0.9 and so is
ours (`Car.js:256`), along with the reference's `sideFrictionStiffness` 3, the reference's `compression` 10, the reference's
`relaxation` 2.7, the reference's `maxTravel` 2 and the reference's `maxSuspensionForce` 150. The complete list
of what still differs, now that both sides have been read off the running build:

| | Ours | The reference's |
|---|---:|---:|
| Suspension stiffness | 26 | **20** |
| Wheel radius | 0.42 | **0.40** |
| Wheelbase | 2.24 | **1.8** |
| Track | 1.64 | **1.50** |

Wheelbase points the wrong way — ours is 24 % longer, which makes ours *harder* to tip.
Which leaves suspension stiffness as the standing candidate: a stiffer spring transfers
load to the front axle faster, and 26 against 20 is 30 % stiffer. That was a deliberate
choice (the note at `Car.js:239` picks 26 so the reference's compression of 10 lands within 2 % of
critical), so changing it is a trade, not a fix.

Also worth knowing for whatever we do: braking from **boost** is *less* violent than
from cruise (44.7 deg from 44.26 m/s), because the wheels leave the ground at once and
an airborne wheel transmits no brake at all.

---

## ✅ ~~17. Steering was inverted~~ — fixed the same session it was noticed

**Where:** `src/world/Car.js`, one sign. Pressing right turned the car left, and had
done since the vehicle was first wired up.

Michael found it by driving, immediately after the colour gate: *"invert left and
right, like how the reference author has it."*

**Measured before and after**, from rest over a short arc on flat ground, because the
first attempt to read it got the answer backwards. Two seconds of full lock had
already swung the car 143° and its final heading no longer said which way it had gone
— the position and the heading disagreed, which is the tell. Over 0.75 s instead:

| | wheel angle | Δyaw | path | | |
|---|---:|---:|---|---|---|
| Right, before | +0.5 | **+66.6°** | curves to **+X** | = the car's left | ✗ |
| Left, before | −0.5 | **−69.9°** | curves to **−X** | = the car's right | ✗ |
| Right, after | −0.5 | −69.9° | curves to −X | = the car's right | ✓ |
| Left, after | +0.5 | +66.6° | curves to +X | = the car's left | ✓ |

The two rows swap exactly, which is what confirms it is a pure sign flip and not a
change to the handling.

**Why reading the reference's source would not have caught it, and nearly said the opposite.**
The reference's maps `left → +1` (`Player.js:561-563`) where ours mapped `right → +1`, so on the
face of it ours was the inverted one — but the two rigs do not share a frame. The reference's
forward axis is **+X** with the axle on +Z; ours is **+Z**, because Rapier 0.20 exposes
`indexForwardAxis` as a getter only and fixes it there. A positive steering angle
rotates the front wheels toward the car's left in *both* frames, so the reference's mapping is
correct and ours was not. Two different-looking conventions, one of them right, and
only a measurement separates them — this is the same lesson as `ROADMAP.md`'s
wheelbase correction, arriving from the other direction.

**Why it survived several sessions of driving.** The camera is fixed at 45° and never
rotates (decision 15), so the car is nearly always travelling diagonally across the
screen rather than away from you. Inverted steering under those conditions is
genuinely hard to name: every correction you make still works, just mirrored, and you
adapt inside a few seconds. It survived a 137-second instrumented drive that produced
a verdict on the camera trail and the suspension, because the whole of that session
was watching how the car *followed*, not which way it *went*. Feel testing finds
things measurement does not — and it also needs to be told what to look for.

---

## 🟡 18. The island was a smooth blob — carved 20 Aug, density still short of the reference's

> **Downgraded from orange, 20 Aug.** `Terrain.CHANNELS` carves nine polylines through
> the flat land: median width **6.0** against the reference's 6.0, median depth **0.44** inside the reference's
> 0.42–1.17 range, and interior water at **17.6 % of the landmass** against the reference's 22.9 %.
> Land went 9,990 → 8,210 m². What is still short is **body count — 5 against the reference's 21**,
> which on 2.3× our area makes the reference's like-for-like target nearer 9. Left there on purpose:
> it is a look, and the knob is one array. Full numbers in `ROADMAP.md` → *The channel
> network as built*. The entry stays open until Michael has driven it.
>
> **The sunken-plaza half is closed — 23 Aug.** Michael judged the `#sink=` sweep
> under one rule, "most similar to the reference's": the reference's areas all stand on flat land and a
> sunken plaza exists nowhere in the reference's build, so **the plaza ships flat at 0**. The
> carved-ground ambition this entry argues for stays where the reference's is — the water
> channels — and what remains open here is exactly one thing: **channel density**
> (5 interior bodies against a like-for-like target near 9), deferred by Michael
> to the art phase with the rest of the map layout. The basin machinery keeps its
> flag as the lever for that work.

**Where:** `src/world/Terrain.js` — `heightAt()` is land relief inside `beachRadius(θ)`
and a shore dish outside it, and nothing else. There is no interior water anywhere.

Found 19 Aug, by Michael looking at his build and saying he could see a river. Decoding
the reference's terrain proved the reference author right and produced the comparison, both grids measured the same
way at the same 1.5-unit cell:

> **The "ours" column was wrong and is re-taken here, 20 Aug.** The first version read
> `land 43.5 % / floor 39.3 % / bank 17.2 %`. Decoding the reference's `terrain.glb` and our own grid
> with **one classifier applied to both sides** gives something different — and the tell
> is that 43.5 + 17.2 and the true 2.4 + 59.0 both come to 61 %. Our *sloping land relief*
> was being counted as "land" in our column and as "bank" in the reference's. Same word, two
> definitions, one table. That is **bounds are not a shape** wearing a different hat: not a
> wrong reading of the data, a wrong reading of our own.

Measured at a tolerance of 0.01 against the reference's 129 × 129 grid and our 101 × 101, both at
1.5-unit cells, land pinned at 0 and floor at −1.5:

| | the reference's | ours, before 20 Aug | ours, now |
|---|---|---|---|
| land, flat at exactly y = 0 | **51.0 %** | **2.4 %** | 37.8 % |
| **bank slope between the two** | **35.4 %** | 59.0 % | 23.6 % |
| deep floor at −1.5 | 13.6 % | 38.5 % | 38.5 % |
| coastline cells per land cell | **0.131** | 0.048 | *not re-taken* |

**Three things change, and one of them reverses.**

- **None of our land was flat** — 2.4 %, against a row that claimed 43.5 %. Every land
  vertex carried some relief, which is exactly what decision 17 forbids, and it is what
  entry 19 below turned out to be caused by.
- **We did not have too little bank. We had too much** — 59.0 % against the reference's 35.4 %,
  where the old table said 17.2 % against 32.2 %. It was simply the *wrong kind*: one
  ring of shore dish plus a whole island of gentle relief, rather than banks cut
  *through* the landmass. Flattening the land removed the relief and the number fell to
  23.6 %, which is the first point at which "we need more bank than we have" is true.
- **Our deep floor is still 2.8× the reference's** — 38.5 % against 13.6 %, and nothing here moved
  it. We are a smaller island in a bigger sea. No amount of carving fixes that; it is a
  `SIZE` and `beachRadius` question if it is ever worth fixing at all.

What survives untouched is the conclusion that sent us here: the reference's shape comes from
**water carved into flat land**, the reference author has rivers, inlets and bays *through* the landmass,
and ours has none. The reference's shoreline is **2.7× more articulated per unit of land** — that
ratio was measured separately and the classifier bug above does not touch it.

**Why this is filed as a defect and not a feature request.** Every conclusion about the
world reading as bland has so far been answered with art — props, emissives, density —
and Phase 3 is the long pole precisely because that answer is expensive. This one is
cheap and it is upstream of all of it: the machinery already exists (`Water`, the depth
texture, the drivable shelf, drowning, `Bedrock`), it is a change to one function, and
authoring art against the current shape means authoring it twice.

**Do not answer it with hills.** Every land vertex in the reference's world is exactly 0, and
decision 17 forbids relief tall enough to hide the car under a camera with no vertical
follow. The lever is *down*, not up.

**The cheapest first test was the plaza floor** — sink it below the surrounding land, to
frame the boards and buy back the height the camera ceiling costs (decision 44's
correction), before committing to a river system across the whole island.

> **Half of it was overtaken by events, 20 Aug.** Fixing entry 19 set `LAND_RELIEF` to 0,
> which dropped the plaza's ground from 1.19–1.38 to 0 — **about 1.3 units of "lower the
> ground" already applied**, and the three boards now frame identically at base 0.160 and
> top 0.574 against a frame edge of 1.0. So the *framing* half of this test is banked.
> What it has not answered is the half it was really for: **does carved ground read here
> the way it does in the reference's build?** A flat plaza on flat land says nothing about that.
>
> The test still to run is a plaza floor sunk *below* the surrounding land.
>
> **Correction, same day, and it inverts the conclusion above.** That paragraph first
> read "anything past 0.3 deep floods and starts the drowning logic inland… unless the
> water plane is given an exception over authored ground". Two errors. Water appears at
> **0.3** of sink; drowning does not start until **depth 1.0**, i.e. a bed at −1.30 —
> those are different lines and they were conflated. And **no exception is possible or
> needed**, because flooding is not a failure mode, it is the mechanism: the reference author's water
> is one camera-following quad at −0.3 with no mask anywhere, so *everything* below
> −0.3 is water and the reference's rivers and ponds are nothing but terrain carved under it.
> Michael said so before it was checked — *"honestly a pond isn't bad, it might be how
> the reference author created rivers and ponds in the reference's map"* — and the reference's source agrees.
>
> So the sink budget is not 0.3. It is **anything above a bed of −1.30 stays drivable**,
> which is 1.0 of usable sink, and past that the plaza drowns you — which is a design
> choice rather than a bug. See *The reference's water, and where the reference's rivers actually are* in
> `ROADMAP.md` for the reference's measured widths and depths.
>
> **Built and swept, 21 Aug — and the budget is a third number again.** Drowning was
> withdrawn on 20 Aug (`Car.js` → water), so nothing drowns at any depth and the
> −1.30 line is gone with it. What actually binds is **the plaza's clearing**: past a
> sink of **1.21** the basin's rim runs outside the 20-unit clearing and `Island`
> scatters trees down the slope. `Terrain.assertBasinsClear` throws at boot with that
> number in the message. Three budgets, in the order they bite: **dry** below 0.30,
> **props stay off the rim** below 1.21, **floor** at 1.50.
>
> The mechanism is `Terrain.BASINS` behind `#sink=`, defaulting to **0** — the shipped
> world is unchanged until Michael has looked at it. `npm run sweep-basin` prints the
> table. Everything measurable is measured; what is left is the look, which is the reference's.
> See `ROADMAP.md` → *The sunken-plaza test*.

---

## ✅ ~~19. The car sits off centre, and how far off depends on the ground under it~~ — fixed 20 Aug

**Where:** it read as a camera bug and it was a terrain bug. `src/world/Terrain.js` —
`LAND_RELIEF`, now 0.

Found 20 Aug by Michael driving, not by measurement: *"reference's camera always centers back
on the car no matter what movement the car has gone through or what direction is facing.
Our car seems to be off centered when facing different directions."*

**The rig was never wrong.** Ours is the reference's, line for line — `camera.position = focus +
offset` then `lookAt(focus)` in both (`View.js:390`, the reference's `View.js:711-719`). Measured on
the running build, the focus point projects to **ndc 0.0000**: dead centre, exactly as
designed. What rides above it is the car, by its ground height plus ride height.

**Both builds pin the focus point to y = 0** — ours `trackedPosition.set(t.x, 0, t.z)`,
the reference's `new THREE.Vector3(x, 0, z)`. That is free for the reference author, because every land vertex in the reference's
world is exactly 0, so the reference's car sits at one fixed screen height for the whole game. Ours
had `LAND_RELIEF = 1.5`, so the car's height above the focus plane varied with wherever it
happened to be standing. Swept at rest over 589 points of dry land:

| | min | median | max | spread |
|---|---|---|---|---|
| before | 0.149 | 0.249 | 0.330 | **0.18** |
| after | 0.1442 | 0.1442 | 0.1442 | **exactly 0** |

An 0.18 swing of half-frame **with no player input at all** — stop twice in two places and
the car is framed differently. The residual 0.1442 is pure ride height (clearance 1.135),
and the reference's build has the same one.

**Confirmed on Michael's own drive** — 7,253 frames, 52.7 s, 148 fps, zero recorder
errors: **74.3 % of resting samples within ±0.002 of 0.1442**, 91.6 % inside [0.13, 0.21].
The ~7 % tail is the intro cinematic and one drown, which the recorder did not tag. The reference's
verdict: *"the camera seems better now."*

**Half the symptom is the reference's, and it is still there by choice.** The other cause is the
camera trail, and ours is matched to the reference's deliberately (1.911 units against the reference's 1.834). A
trail puts the car off centre *along its direction of travel*, so the screen offset
rotates with heading — which is the other half of what the reference author described:

| heading | 45° | 135° | 225° | 315° |
|---|---|---|---|---|
| car ndc | (0, −0.103) | (−0.137, +0.044) | (0, **+0.177**) | (+0.137, +0.044) |

On Michael's drive the moving swing scaled with speed exactly as that predicts — 0.289 of
half-frame at 0–3 m/s, 0.361 at 3–6, 0.374 at 6–9 — and it is **larger than the 0.18 that
was just removed.** So if off-centring is raised again, it is the trail, and changing it
means departing from the reference author rather than following the reference author. Do not quietly "fix" it.

**What it cost to land, and the trap worth keeping.** Flat land broke the boot. Both
dry-land gates in `Island.js` tested `heightAt > WATER_SURFACE + 0.4` — i.e. `> 0.1` —
which land at exactly 0 can never pass, so `scatter` placed nothing, `parts` came back
empty, and `mergeGeometries([])` threw on `undefined.index`. **The margin was larger than
the headroom flat land has**: land at 0 is only 0.3 above `WATER_SURFACE`. Both gates are
0.15 now, and they stay expressed against the water surface rather than as "is this
exactly 0", because 18's river beds are carved down through the same flat land and these
tests have to keep rejecting them. Spawns went 19 → **21**, all dry, the nearest coastal
one 2 units inside the beach.

**The shoreline is provably untouched.** `heightAt` outside `beachRadius` never mentions
`LAND_RELIEF`, and sampling 4,000 points confirms it: the maximum difference between the
old and new surface outside the beach is **0**. Shelf, waterline and drowning line are
exactly where they were.

---

## ✅ ~~20. Every key was live through the opening cinematic~~ — fixed 20 Aug (second session)

**Where:** `src/core/Game.js` — `this.mode` started at `'driving'`, and the input
layer had one `suppressed` boolean that only `Card` ever wrote.

Found while building the `&p=` deep link, by asking what the visitor could press
before the car existed. Measured on the running build with `?at=projects`, with
`intro.playable` still `false` and the cinematic not yet started:

| pressed | what happened |
|---|---|
| `E` / `Enter` | **a project card opened over the cinematic** — `card.isOpen` true, title "Aerial Ascent", mode flipped to `card`, and `&p=aerial-ascent` was written into the address bar |
| `R` | **the veil dropped and the car teleported** — `_respawning` true, away from wherever the deep link had just put it |
| arrows | the throttle took, and `preventDefault` swallowed the key |

**The prompt was visible the whole time too**, which is the same bug seen rather
than felt: `beacon.hidden` was `false` for the whole cinematic, so the "Aerial
Ascent" pill sat on screen through the one animation the site gets to open with.

**Why it survived.** It is only reachable if the car starts inside a built area's
beacon radius, which the default start never does — spawn 0 is 33.4 units from the
plaza. `?at=projects` does, and that is the URL every test drive since the plaza
landed has used. Nobody presses a key in the first two seconds of a cinematic they
have already seen fifty times. **`&p=` makes it a shared link's first two seconds
rather than a developer's**, which is what moved it from latent to worth fixing.

**The fix is the input categories, not a special case.** `Game.mode` starts at
`intro`, `setMode` writes `input.setFilters([mode])`, and no action carries the
`intro` category — so nothing is allowed rather than each key being remembered
individually. `intro.playable` came out of both gates it appeared in: the mode
flips on the same frame `Intro` unlocks control, so it was the same fact twice.
Re-measured over six URLs after the change: **no card, no respawn, no throttle,
no movement, and the prompt hidden, on every one.**

The window is also longer than the four-second cinematic makes it sound.
`main.js` waits on `whenVisible()` before playing it, so a tab opened in the
background sits in this state **indefinitely** — placed, built, standing in front
of a board, with every key live.

---

## ✅ ~~21. Escape stopped closing the card the moment you clicked the world behind it~~ — fixed 20 Aug (second session)

**Where:** `src/world/areas/Card.js` — Escape was a `keydown` listener on the card
element.

A listener on the panel only ever sees a key while focus is inside the panel.
`open()` focuses the close button, so Escape worked; click the scrim — which is
the natural "dismiss this" gesture, and which does nothing else — and focus goes
to `<body>`, the listener never fires, and **the card cannot be closed with the
keyboard at all**. Measured before the change:

| focus | Escape closes it |
|---|---|
| the close button (as opened) | yes |
| `<body>`, after a click on the scrim | **no** |

Two of the four accessibility items this file exists to get right depend on
Escape working, and it worked in exactly the state a test would leave it in.

**Fixed as an input action rather than by moving the listener to `window`.**
`close` is bound to Escape with the single category `card`, so it arrives on
`window` like every other key and where focus sits stops mattering — and it
cannot fire while driving, which a window listener would have had to guard by
hand. It is also the entry that makes the categories worth having: it is the one
action that survives the `card` filter while every other action is blocked by it,
which is the thing a boolean cannot express. Re-measured: closes from `<body>`,
mode returns to `driving`, the prompt comes back, and Escape while driving moves
nothing.

**What was not changed:** clicking the scrim still does not close the card. That
is a design call about modal dismissal, not part of this defect, and it is open.

---

## ✅ ~~22. The palette texture was written linear and tagged sRGB, so the whole world rendered about 6x too dark~~ — Michael chose the corrected encode, 23 Aug

**Resolved 23 Aug, on the A/B, before any colour was picked — which was the whole
point of the ordering.** Michael judged `#fix22` against the baseline on the
running build and chose the corrected encode; it is now the only path.
`paletteBytes()` extracts sRGB bytes with `getHex(SRGBColorSpace)`,
`public/palette.png` and `public/palette.ktx` are regenerated (the KTX
round-trips pixel-exact against the new bytes), and the flag is gone. Three
things follow:

- **The world now renders its authored colours**, which is also what the reference author's
  build does — the reference's painted PNG carries sRGB bytes and gets decoded once.
- **The texture path and the uniform path agree for the first time.** The land
  and the water beside it are finally coloured through one consistent read of
  the same array.
- **The scheduled world-brightness re-judge** (*ROADMAP → Scheduled, not open*)
  now starts from a baseline ~6× brighter in linear than every earlier
  screenshot. The "reads dark in places" observations that predate 23 Aug
  described the defect, not the design.

No art had been coloured against the dark rendering, so nothing gets re-picked —
the record below stands as written, in the present tense it was found in.

**Where:** `src/render/palette.js` -> `paletteBytes()`. Found 20 Aug while taking the
before/after for the palette-file change; **not caused by it**, and deliberately
preserved through it so the format change moved nothing on screen.

`THREE.Color.set()` converts an sRGB hex into the **linear** working space --
`ColorManagement.enabled` is `true` and `workingColorSpace` is `srgb-linear`, both
read off the running build. So `new THREE.Color('#7d8f68').r` is **0.2051**, not the
0.4902 the hex digits suggest. Writing `round(c.r * 255)` into an 8-bit texture that
is then tagged `SRGBColorSpace` means the GPU applies the sRGB decode a **second**
time, and the albedo the world actually renders is `#344623` where this file says
`#7d8f68`.

**Every entry, measured end to end on the running build** -- byte in the uploaded
`DataTexture`, and again as a GPU readback of the real albedo expression through a
half-float RenderTarget. The two agree exactly, on both sides of the format change:

| # | name | authored | actually rendered |
|---|---|---|---|
| 0 | grass | `#7d8f68` | `#344623` |
| 2 | sand | `#c9b489` | `#957440` |
| 4 | rock | `#5b6472` | `#1b202b` |
| 6 | building light | `#d8d2c4` | `#afa48d` |
| 8 | foliage | `#4e7a4b` | `#133212` |
| 12 | amber | `#ffb454` | `#ff7417` |
| 13 | water | `#1b2740` | `#03050d` |
| 15 | near-black | `#20242c` | `#040406` |

**The half that makes it a defect rather than a taste question: the same palette
index gives two different colours depending on which material you use.**
`makeContentMaterial` samples the texture and gets the dark version;
`makeTextMaterial`, `makeWaterMaterial`, `Lighting` and `Reveal` build
`uniform(new THREE.Color(PALETTE[i]))`, which goes through three's ordinary path and
gets the **authored** one. So the water is currently drawn from correct palette
colours and the land beside it from double-darkened ones, off the same array.

**It also explains something already in the docs rather than being a new surprise:**
"nothing in the world currently clears the bloom threshold in daylight, which is why
it reads dark in places", and the plaza floor reading as the weakest thing on screen.
A six-fold linear cut in every albedo is a good reason for both.

**The fix is one line** -- take the sRGB bytes back out rather than the linear ones:

```js
c.set(PALETTE[slot] ?? HEADROOM_COLOR);
const hex = c.getHex(THREE.SRGBColorSpace);   // instead of c.r/c.g/c.b * 255
```

**Why it is not applied.** It brightens every surface in the world, which is a look
call and Michael's. Do not fix it in passing.

**How it was decided — 22–23 Aug.** An A/B behind `#fix22` flipped only the
runtime texture while the committed PNG and `palette:check` held the old bytes,
so Blender and the shipped world could not drift mid-decision. Michael judged it
on the running build and ruled for the correction; the flag then came out and
both files were regenerated. (This paragraph is the record of the mechanism; the
verdict is at the top of the entry.)

**What it does not block, and this is the reason the palette file shipped without
waiting for it.** UV islands address **slots**, not colours. Art baked against band 3
in Blender still lands on band 3 after the encode is corrected -- only the colour
inside the band moves. So Blender work can start against the palette as it stands and
nothing has to be re-authored when this is decided. What *would* have to be redone is
any colour chosen **by eye to harmonise with a neighbour**, so pick harmonies against
`public/palette.png` (which shows the true rendered colours) rather than against the
hex list in `palette.js` (which shows the authored ones).

The judge should be a foreground window, not this table: the numbers say how far off
it is, not whether the brighter world is the better one.

**Decide it before the first authored asset, not after — 21 Aug.** UV islands
address *slots*, so nothing modelled or unwrapped has to change whichever way this
goes. What does not survive is any colour **chosen by eye to sit next to another
one**: fix this later and every harmony picked against the dark rendering shifts
at once. Deciding it before Michael colours anything costs nothing; deciding it
after costs re-picking. This is the one item on the Phase 3 critical path that is
cheaper early purely because of ordering.

---

---

## 🟡 23. The plaza does not fit in portrait, on any portrait aspect

**Where:** `src/world/areas/ProjectsArea.js` — the arc geometry, and the claim in
its header comment at line 80. Found 20 Aug while deriving the frame rectangle for
the scale-reference GLB.

The comment says: *"only 20.9 across in portrait, which is the number that actually
sizes the arc. Three monoliths at 16.5 fit a phone."* **Measured on the running
build, they do not, and 20.9 is not the number that should have sized anything.**

**The measurement.** Real board geometry — the 504-vertex merged frames mesh, all
three boards — projected through the real camera, with the viewport driven through
the app's own resize path at each aspect and 120 frames pumped so the radius
settles. Frame edge is `|x| = 1.0`:

| viewport | aspect | radius | boards span | verdict |
|---|---|---|---|---|
| 1600 x 900 | 16:9 | 30.0 | **±0.814** | fits, 19 % margin |
| 768 x 1024 | 3:4 tablet | 42.3 | **±1.390** | **39 % off screen** |
| 720 x 1280 | 9:16 phone | 49.4 | **±1.595** | **60 % off screen** |
| 390 x 845 | 9:19.5 phone | 55.7 | **±1.733** | **73 % off screen** |

The outer two monoliths are cut roughly in half on a tablet and are most of the way
off the screen on a modern phone.

**Why the original number said otherwise — one word, two definitions.** 20.9 *is* a
real measurement: it is the frame's ground width **at the far edge**, which at 3:4
sits **24.78 units ahead of the car**. The boards stand at `ARC_AHEAD` = 5.5. The
frame is a trapezoid, so its width at 5.5 ahead is nothing like its width at 24.8,
and the comparison put a span measured at one depth against a width measured at
another. Same class as the terrain the reference's/ours table (`ROADMAP.md` → *measure both
sides the same way*): both quantities were correct, and the comparison was not.

**The number the arc should be sized against** — frame width at the boards' own
screen row, measured the same way, on the running build:

| aspect | width at the boards' row | boards need | short by |
|---|---|---|---|
| 16:9 | **28.21** | 20.34 | — (7.9 spare) |
| 3:4 tablet | **15.96** | 20.34 | 4.4 |
| 9:16 phone | **13.73** | 20.34 | 6.6 |
| 9:19.5 phone | **12.53** | 20.34 | 7.8 |

20.34 is the three boards' full extent: 16.54 between the outer centres — the
comment's "16.5" — plus half a `BOARD.width` at each end.

**Not fixed, and the fix is a design call rather than a defect repair.** The levers,
in the order the header comment already ranks them: `ARC_STEP` (16°, tightens the
spread), `ARC_RADIUS` (30, flattens the arc), `ARC_AHEAD` (5.5, and pushing the
boards *further* makes it worse rather than better — the frame narrows toward the
car, so it widens with depth). Or accept it and let a portrait visitor drive along
the arc rather than see it all at once, which may well be the right answer for a
site you steer.

**What it does not change.** Decision 44's landscape framing is untouched and still
correct — base 0.160, top 0.574 at 16:9, with the boards at ±0.814 horizontally.
Nothing here argues for a shorter board. Decision 41 already schedules the
real-device touch test for Phase 5; this says what that test will find, so the arc
can be decided during Phase 3 authoring rather than re-authored after it.

---

## ✅ ~~24. There is no touch steering at all~~ — fixed 3 Sep, late

**Where:** `src/core/Input.js`. Found 3 Sep, measured before the phone pass
rather than on it.

`Input` read keys and a `pointerdown` that only flipped the `input-touch`
class. Nothing mapped a touch to `forward`/`left`/`right`/`boost`/`jump`, so
on a phone the car could not move — and until 3 Sep the launch sheet and the
stuck hint told a touch visitor to "drag to steer", a promise nothing kept.

**Fixed the same day, after the deploy.** `core/TouchStick.js` is the
reference's touch mechanism (`Inputs/Nipple.js`): a ring anchored at the car
in the world, the finger's ground point read against the car every tick,
distance as the throttle and bearing as the steer, the rear 90° reversing, a
tap as a hop; `render/StickRing.js` draws it with the reference's shader;
boost and jump are held buttons (`#touch-pad`); the stuck hint is the touch
unstuck button; the copy says "drag to steer" again because it is true. The
maths is pure (`core/stickMath.js`) and `check-touch` is the twelfth suite.
Measured on the production build with synthetic touch events: forward,
right, reverse, the tap-hop and both buttons all do what the sheet says
(`ROADMAP.md` → *Now*). Left for the phone pass: a real thumb, the radii,
portrait, the WebGL2 fallback.

**A bug the fix's own probe found:** Chrome throws `NotFoundError` from
`setPointerCapture` for a pointer id it is not tracking, and the throw left
the stick claimed with no finger on it, re-reading a stale point every tick.
Guarded (the capture is in a try), and reproduced in the suite with a stub
that throws.

---

## 🟡 25. Rapier's wasm ships as base64 inside the JS bundle

**Where:** `@dimforge/rapier3d-compat`, imported in `src/world/Physics.js`.
Measured 3 Sep during the Phase 6 audit.

The one JS chunk is 3.9 MB minified (1.43 MB gzip, 1.06 MB Brotli). About
2.9 MB of it is the compat build's copy of the 2.0 MB physics wasm as a base64
string, decoded at `RAPIER.init()`. Measured: that wasm Brotli-compresses to
558 KB as a `.wasm` file, and to roughly 800 KB as base64 in JS — so the compat
build costs ~250 KB on the wire and puts 2.9 MB of string through the JS parser
before physics can start. three/webgpu is the rest (~670 KB minified).

**Not fixed, on purpose.** The fix is the non-compat `@dimforge/rapier3d`
(`import * as wasm from './rapier_wasm3d_bg.wasm'`) behind a wasm plugin
(`vite-plugin-wasm` + top-level await), which is a physics-packaging change and
not a deploy-day change. On the books as the next payload lever
(`ROADMAP.md` → *Carried into the next session*, 0c); the `_headers` immutable
rule and Cloudflare's Brotli already do the rest.

---

## ✅ ~~26. Nothing on the amber band glowed at night~~ — fixed 3 Sep, from the live site

**Where:** `src/render/materials.js`, `makeContentMaterial`. Broken 2 Sep by the
texture session, found 3 Sep by Michael on michaelyeh.dev ("the two street
lamps in the projects section are not glowing").

The 2 Sep `albedo` override (the terrain gradient, the grass) added a guard
around the amber-band emissive term: skip it when an albedo is supplied,
because that geometry may not carry palette UVs. The guard read
`albedo === null` **inside the shader `Fn`**, where `albedo` is the fragment's
colour var (`const albedo = albedoNode.toVar()`), not the parameter — so it was
never null and the term was compiled out of every material. Lamps, the
streetlights' glass, the bonfire, the buggy's lenses, the glow mushrooms, the
flower hearts, the marker caps: all dark for a day. Nobody saw it because the
in-world type glows through `makeTextMaterial`, which has its own term, so the
night still had light in it.

Read off the compiled WGSL (`renderer.debug.getShaderAsync` on a lamp mesh):
the headlight cone was in the fragment shader, the band test was not. The
decision is hoisted out of the `Fn` as `paletteAlbedo`. Verified at `#day=0.45`
on the plaza: both lamps bloom, the flower heart and the tail lights with them.

**The lesson, for the "things that bit" list:** a TSL `Fn` body is ordinary
JavaScript closure scope. A parameter shadowed by a local of the same name is
the same bug it is anywhere else, except that the symptom is a shader term
silently missing rather than an error.

---

## ✅ ~~27. The dev server ran two copies of three~~ — fixed 3 Sep

**Where:** `vite.config.js`. Cost an hour of the deploy session.

Vite's dependency optimizer crawls every `.html` under the project root to
find imports, and the root contains `reference/source/` — the reference author's clone,
gitignored, with its own `node_modules` and three **r183**. After
`vite.config.js` appeared on 3 Sep the optimizer re-ran, found the reference's files, and
prebundled `three/webgpu` from the reference's tree while `three.core` came from ours
(r185): `window.__THREE__ === "183"`, a "Multiple instances of Three.js"
warning, 899 "THREE.TSL: No stack defined for assign operation" errors, an
invalid fragment ShaderModule, and a world with no night and no fog. The
production build was never affected (rolldown bundles from `index.html`).

`optimizeDeps.entries: ['index.html']` did **not** stop the crawl in Vite 8.2
(the config hash did not even change). What did: `optimizeDeps.noDiscovery`
with an empty `include` (every dependency is ESM and serves unbundled) plus
`resolve.dedupe: ['three']`; `server.watch.ignored` and `server.fs.deny` keep
`reference/` and `research/` out of the watcher and the file server.
`check-site` guards both settings.

---

## ✅ ~~The build shipped three Draco decoders for the one it fetched~~ — fixed 3 Sep

**Where:** `src/pipeline/ResourcesLoader.js`, `tools/prune-dist.mjs`.

three's `DRACOLoader.js` resolves five decoder files with
`new URL(..., import.meta.url)`; Vite emits every one into `assets/`, hashed,
whether or not anything fetches it (192 KB + 286 KB wasm, two wrappers, a
719 KB JS-only decoder). Ours then pointed at a sixth copy in `public/draco/`.
dist was 6.3 MB. Now the loader uses three's own glTF pair
(`DRACO_GLTF_CONFIG`, so it rides the `assets/` immutable rule), `public/draco/`
is gone, `prune-dist` drops the other three by byte comparison and fails if the
pair it expects is missing. Verified on the preview: two decoder fetches, both
hashed, 250 KB. dist is 4.85 MB.

---

## Scheduled for deletion — do not polish

Not bugs. These work, and the 19 August decisions retire them. Listed so nobody
spends an afternoon improving code that is about to go.

| Code | Why it goes | Replaced by |
|---|---|---|
| ~~`Game._grow()` and the distance-driven radius~~ **gone 19 Aug** | World growth is deleted; the world is whole once the intro ends | Nothing — the island simply exists |
| ~~`Reveal.js` as a permanent system~~ **done 19 Aug** | Became a three-step intro that tears down its own scaffolding | `render/Intro.js`; `Reveal.js` is now uniforms and two clip rules |
| ~~`VoidGrid.js` as the permanent backdrop~~ **gone 19 Aug** | Demoted to intro scaffolding, destroyed at step 2 with the island's underside | `render/Sky.js` — fog whose colour *is* the sky colour |
| ~~`Island.js` 1,600-unit plane + `smoothstep(60,300)` camera fade~~ **gone 19 Aug** | The world edge is now water and fog | `world/Water.js` and `Sky`'s `rangeFogFactor` |
| ~~`ChaseCamera.js` rotation follow (`_forward`) and vertical follow~~ **gone 19 Aug** | Fixed 45° diorama camera; no rotation, no Y follow | `world/View.js` — our spring retained as the X/Z filter only |
| ~~`MeshStandardNodeMaterial` + `HemisphereLight`~~ **gone 19 Aug** | PBR gradients fight a 16-colour palette | `makeContentMaterial`, flat toon, `render/Lighting.js` |
| ~~`NeutralToneMapping`~~ **gone 19 Aug** | The reference author has none; a tone curve means the palette colour is never the screen colour | Bare linear→sRGB encode |

---

## Open, and genuinely undecided

- ~~**One project title.**~~ **Answered 20 Aug: `rag-pipeline` is `Footnote`.** It had
  been rendering as "(untitled)" on a board in the world, which was the point of
  leaving it visibly missing. (`grappling` was the other; it is **Aerial Ascent** as of
  19 Aug, and its slug became `aerial-ascent` in the same breath — the last free slug
  change, because nothing has shipped and so no save and no pasted link exists to
  break.) **The slug was renamed to `footnote` to match**, on Michael's call the same
  day. That is the second and final exception to the immutability rule, and it was
  taken only because the rule protects *existing* saves and links and there are
  none — no `localStorage`/`sessionStorage`/`indexedDB` anywhere in `src/`, no
  shipped build, no pasted URL. The alternative was a permanent
  `?at=projects&p=rag-pipeline` on a project called Footnote. **From the first
  shipped build onward the answer is no.**

  **With it, all three beacons were verified end to end** — each goes active, `E` and
  `Enter` both open the card, `mode` moves `driving` → `card`, and the card renders
  the right title. Worth recording because a 52-second instrumented drive on 20 Aug
  logged **12 beacon approaches and 0 cards opened**, which read like a regression in
  Phase 2b's done-condition. It was not one: nobody had pressed the key. A probe that
  measures approaches but not intent will manufacture a bug every time.
- ~~**The itch.io URL for Aerial Ascent.**~~ **Supplied 19 Aug**, along with two
  gameplay captures and the original design document. That entry is now complete —
  title, blurb, body, year, roles, stack, link, images — and the card renders all of it.
- **The rest of the prose** — ~~the roles list, the about text, and the
  GitHub/LinkedIn URLs~~ (roles and links landed 31 Aug – 1 Sep; the about text was
  cut to the drivable name letters plus one ground line on 2 Sep). Still open:
  `edgeball` and `footnote` blurbs and bodies, the optional `availability` line, and
  the cmu / cmu-ai one-liners. Structure exists in `src/content/` and worked examples
  stand beside each, so each is a ~30-minute writing job rather than an open question.
- **Plaza titles are blank until a board has greeted you once** (2 Sep, the plaza's
  hop-and-wipe borrowed the corridor's rule). From the plaza's edge two of three
  boards read as blank plates. A judging point for Michael's drive, not a defect: if
  it reads broken rather than as a reveal, the wipe's start value in
  `ProjectsArea.build` is one number.

~~**Deferred by choice, not forgotten:** the exact domain string.~~ **Answered
3 Sep: `https://michaelyeh.dev`**, bought at Cloudflare Registrar the night the
site went live, committed as `SITE_URL` in `.env.production` so the
`canonical`, `og:url` and `og:image` tags render. From here the slug rule in
`projects.js` is in force for real: a shipped build exists and links can be
pasted, so no slug moves again.

## Scheduled, not open

- **World brightness, once something in the world glows.** Carried out of the colour
  gate: it reads dark in places, and the cause was that **nothing cleared the bloom
  threshold in daylight** — `#ffb454`, the palette entry named "emissive amber", was
  used by nothing. **The emissive layer exists now (31 Aug – 2 Sep):** lamps and
  streetlights, the year counter, headlights, the boost trails, every in-world label,
  the signposts' caps and arrows, the bonfire, a third of every confetti burst. The
  re-judge itself (`#day=0.45`) is still scheduled — handoff item in `ROADMAP.md` →
  *Carried into the next session* — and the three levers are unchanged.

## Answered since this file was written

- **The day-cycle colour palette** — ~~scheduled~~ **answered 19 Aug at its gate**.
  Four candidates against four phases, judged on the running build; Michael chose
  **A, the reference's values, kept**. The mechanism that made it possible is still in the tree
  behind `#gate`, candidates and all, for the one re-judge scheduled above.

- **Driving into the water** — a drivable shallow shelf with higher drag and a lower top
  speed, then a depth threshold past which you fade out and respawn at the nearest point
  (`ROADMAP.md` decision 43). The fade doubles as cover for the respawn snap, which is
  why the reference author hides the reference's behind a full-screen overlay (`Player.js:471-487`).
- **What a monolith physically is** — a standing slab with the project image inset into a
  recessed face (decision 44). Chosen for the fixed camera: a thin flat board is nearly
  invisible from some approaches, which is fatal when driving to it *is* the navigation.

---

## Fixed already, kept for the record

- Reversed `smoothstep` edges in `materials.js` — undefined in WGSL, silently
  returned zero, made the void grid invisible.
- `Discard` behaving differently across two node materials — the void now masks by
  alpha instead.
- `mergeGeometries` rejecting mixed indexing (`IcosahedronGeometry` is non-indexed).
- `vehicle.currentVehicleSpeed()` returning negative while driving forwards. We
  project linear velocity onto the chassis forward vector instead — and the reference author reached
  the same conclusion, having commented the reference's single use of it out.
- `indexForwardAxis` being getter-only in Rapier 0.20.
- A hidden tab suspending rAF, which left `waitForFrames` hanging forever and gave
  anyone opening the site in a background tab a permanent loading screen.
- `respawn()` accepting a malformed position and writing NaN into the rigid body,
  silently corrupting the whole physics world.
- **In the research, not the code:** `D-areas-and-content.md` said "halve any ported
  constant" for `Ticker.scale = 2` in two places. It is ×2. Corrected 19 Aug.
- A blanket `preventDefault()` on every mapped key, which was harmless until `Enter`
  was bound to `interact` and it began swallowing keyboard activation of real buttons.
  Narrowed to the keys that actually scroll the page.
- The beacon element reading its own `hidden` flag back as input, so the first time a
  prompt projected off frame it was hidden permanently. `_render()` owns "is there a
  beacon", `_project()` owns "is it on screen"; caught and fixed in the same pass that
  introduced it.
- **In the research, not the code:** `D` §6.2's `addProp()` never calls `paint()`, so
  every area prop would have sampled palette texel (0, 0) — a plaza of grass-coloured
  monoliths. `color` is a required argument in ours. And `D` §6.3's `goTo()` grows the
  reveal disc so the visitor does not land inside an invisible area, which was written
  against the world that grew as you drove; decision 5 deleted it and fast travel is
  now a respawn and nothing else.
