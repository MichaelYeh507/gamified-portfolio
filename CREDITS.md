# Credits

Third-party art used in this site, per `ROADMAP.md` decision 47 (30 Aug 2026):
every asset is CC0 or CC-BY, recorded here **when it is downloaded**, never
reconstructed later. This file is the source of truth; the in-site credits
panel (a Phase 3 deliverable, required before launch for the CC-BY entries)
is generated or transcribed from it.

Accepted licences: **CC0** (no attribution required, credited anyway) and
**CC-BY** (attribution required). Nothing with NC, ND, or custom terms — the
deployed site redistributes the files.

Colours are remapped onto the site's palette by the retint tool, which CC0 and
CC-BY both permit (CC-BY requires the modification to be indicated — the
"palette-retinted" column does that).

## Assets

| Asset | Author | Source | Licence | Retinted | Used for |
|---|---|---|---|---|---|
| Traditional japanese Lamp post | [aiiko7](https://sketchfab.com/aiiko7) | [Sketchfab](https://sketchfab.com/3d-models/traditional-japanese-lamp-post-6fd13785f0fb4dbd81ece2ca4dd465d9) | CC-BY 4.0 | yes | plaza lamp posts / the emissive layer's first piece (`public/models/lampPost.glb`) |
| Foxter buggy low ploy concept | [Herrsher](https://sketchfab.com/Herrsher) | [Sketchfab](https://sketchfab.com/3d-models/foxter-buggy-low-ploy-concept-afc99fc1ed6c444f9c008966a95ad654) | CC-BY 4.0 | yes | the car — body and wheels split into a drivable rig (`public/models/carBuggy.glb`) |
| Prehistorical - Stylized low poly asset pack | [artikora](https://sketchfab.com/artikora978) | [Sketchfab](https://sketchfab.com/3d-models/prehistorical-stylized-low-poly-asset-pack-37455152285a47b28c70ed77b12d30ce) | CC-BY 4.0 | yes | the island's trees (oaks, birches, pines), bushes, and stump (`public/models/tree*.glb`, `bush*.glb`, `stump.glb`) |
| Low Poly Medieval Environment Pack (35+ Props) | [anastasita.3d](https://sketchfab.com/anastasita.3d) | [Sketchfab](https://sketchfab.com/3d-models/low-poly-medieval-environment-pack-35-props-a850530905a24d97bc4aa83353aba134) | CC-BY 4.0 | yes | area dressing — fence, barrel, cart, crate, haystack, bonfire, log, a second streetlight — and the flower/grass flora (`public/models/*.glb`) |
| low poly forest pack | [Ragat Vdoo Kaf](https://sketchfab.com/mae_bul_01) | [Sketchfab](https://sketchfab.com/3d-models/low-poly-forest-pack-low-poly-environment-pack-47b2cb567d1b437fb86d2897353079ab) | CC-BY 4.0 | yes | the island's stones (clean and mossy), fallen logs, root snags, and four mushroom species (`public/models/stone*.glb`, `log*.glb`, `snag*.glb`, `shroom*.glb`) |
| Simple Icons (GitHub, LinkedIn marks) | [Simple Icons contributors](https://github.com/simple-icons/simple-icons) | [unpkg v13](https://unpkg.com/simple-icons@13/icons/) | CC0 1.0 (icon set) | yes — extruded to 3D, palette-tinted | the contact arc's GitHub and LinkedIn logos (`contactIcons.js`). The marks themselves remain trademarks of GitHub, Inc. and LinkedIn Corp., used as link icons to Michael's own profiles |
| Material Symbols mail glyph | [Google](https://fonts.google.com/icons) | [Material Icons](https://fonts.google.com/icons?icon.query=mail) | Apache 2.0 | yes — extruded to 3D, palette-tinted | the contact arc's email envelope (`contactIcons.js`) — a generic envelope on purpose, not the Gmail mark |
| Helvetiker Regular (typeface.json) | [Magenta / three.js examples](https://github.com/mrdoob/three.js) | [unpkg three@0.150.0](https://unpkg.com/three@0.150.0/examples/fonts/helvetiker_regular.typeface.json) | MIT (three.js conversion) | yes — extruded to 3D, palette-tinted | the landing's drivable name letters (`public/fonts/`, `LandingArea._buildLetters`) |

## The reference build

This site is built on the model of **[Bruno Simon's folio-2025](https://github.com/brunosimon/folio-2025)**
(bruno-simon.com), released under the MIT License, and the codebase refers to it
everywhere as *the reference* or *the reference build*. Its source was read
file by file, and several of its mechanisms were ported into `src/` — among
them the flat toon material, the periodic perlin and voronoi generators, the
wheel tracks, the leaves simulation, the wind lines, the rain lines and
splashes, the boost trails, the suspension jump and the auto-flip, the
day-cycle and weather shapes, the input filters, and the areas' motion
patterns. Where a port is line for line, the source file is named in the
comment above it. No asset from that repository is redistributed here.

MIT License. Copyright (c) 2025 Bruno Simon.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions: The above copyright
notice and this permission notice shall be included in all copies or
substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Row rules

- **Asset** — the pack or model name as the source titles it.
- **Source** — a link to the exact download page, not the site root.
- **Licence** — `CC0` or `CC-BY 4.0` (with version), as stated at the source.
- **Retinted** — `yes` once the retint tool has run on it; CC-BY requires
  modifications to be indicated.
- One row per pack is fine when a whole pack shares one licence and source;
  individual models from different sources get their own rows.
