/**
 * The build gate — runs after `vite build` (see package.json): strips what the
 * compressed build must not ship, refuses what it must ship without, and
 * prints what is left. Vite copies `public/` wholesale, which is right for
 * dev and wrong for dist:
 *
 *   - the RAW `.glb` models: the compressed build reads only `-compressed`
 *     siblings (`ResourcesLoader.modelUrl`), so the raws are pure dead
 *     weight — ~2.5 MB of exactly the mistake the Phase 6 audit exists to
 *     catch (messenger shipped a 434 KB dev texture the same way).
 *   - `scale-reference.glb`: the ruler. It exists for Blender, and
 *     `compress.mjs` already refuses to compress it for the same reason.
 *   - `palette.ktx` and `palette.png`: tooling artifacts. The runtime
 *     palette is a 512-byte DataTexture generated in JS; neither file is
 *     ever fetched.
 *   - three's Draco decoders that the runtime never fetches. `DRACOLoader.js`
 *     names five decoder files with `new URL(..., import.meta.url)`, and Vite
 *     emits every one into `assets/` hashed: the glTF pair we load
 *     (`DRACO_GLTF_CONFIG`, 250 KB), the generic wasm pair, and the 700 KB
 *     JS-only decoder. The last three are found by byte-comparing against
 *     three's `libs/draco/gltf/` copies and dropped (the 3 Sep audit's
 *     find: 1.3 MB of decoders in dist for 250 KB fetched).
 *
 * Fails loudly if:
 *   - a model lacks its compressed sibling — `npm run compress` was not run
 *     after `npm run prep`, and pruning the raw would ship a build that 404s;
 *   - the glTF decoder pair is not in `assets/` — three moved its decoder
 *     and `ResourcesLoader` would 404 on the first compressed model;
 *   - `index.html` still carries a placeholder or an unreplaced marker
 *     (`tools/lib/site-html.mjs`), or lacks its `<title>` / description;
 *   - `_headers` (the cache rules) did not make it to the root, or a
 *     sourcemap or the old `draco/` copy did.
 *
 * Warns (not fails) when `SITE_URL` was unset at build: the absolute Open
 * Graph tags are omitted, which is right for a preview and wrong for launch.
 */
import { readdirSync, rmSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PLACEHOLDERS } from './lib/site-html.mjs';

const dist = 'dist';
if (!existsSync(dist)) {
  console.error('prune-dist: no dist/ - run vite build first');
  process.exit(1);
}

let removed = 0;
let bytes = 0;
let failed = false;

const fail = (message) => {
  console.error(`prune-dist: ${message}`);
  failed = true;
};

const drop = (path) => {
  bytes += statSync(path).size;
  rmSync(path, { recursive: true });
  removed++;
};

// 1. Raw models.
const models = join(dist, 'models');
if (existsSync(models)) {
  for (const entry of readdirSync(models, { withFileTypes: true })) {
    if (!/\.glb$/i.test(entry.name) || /-compressed\.glb$/i.test(entry.name)) continue;
    const sibling = join(models, entry.name.replace(/\.glb$/i, '-compressed.glb'));
    if (!existsSync(sibling)) {
      fail(`${entry.name} has no -compressed sibling - run npm run compress before building`);
      continue;
    }
    drop(join(models, entry.name));
  }
}

// 2. Tooling artifacts, and the pre-3-Sep decoder copy if it ever comes back.
for (const name of ['scale-reference.glb', 'palette.ktx', 'palette.png', 'draco']) {
  const path = join(dist, name);
  if (existsSync(path)) drop(path);
}

// 3. The Draco decoders three makes Vite emit: keep the glTF pair, drop the rest.
const assets = join(dist, 'assets');
{
  const gltfDir = 'node_modules/three/examples/jsm/libs/draco/gltf';
  const keep = ['draco_wasm_wrapper.js', 'draco_decoder.wasm'].map((name) => ({
    name,
    bytes: readFileSync(join(gltfDir, name)),
    found: false,
  }));
  if (existsSync(assets)) {
    for (const name of readdirSync(assets)) {
      if (!/^draco_/.test(name)) continue;
      const path = join(assets, name);
      const content = readFileSync(path);
      const match = keep.find((k) => !k.found && k.bytes.equals(content));
      if (match) match.found = true;
      else drop(path);
    }
  }
  for (const k of keep) {
    if (!k.found) fail(`three's glTF Draco decoder (${k.name}) is not in dist/assets - ResourcesLoader would 404`);
  }
}

// 4. Nothing that should never be in a static deploy.
const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
};
for (const path of walk(dist)) {
  if (/\.map$/.test(path)) fail(`sourcemap in dist: ${relative(dist, path)}`);
}

// 5. The HTML: real content, complete head.
{
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  for (const placeholder of PLACEHOLDERS) {
    if (html.includes(placeholder)) fail(`index.html still contains "${placeholder}"`);
  }
  if (!/<title>[^<]+<\/title>/.test(html)) fail('index.html has no <title>');
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail('index.html has no meta description');
  if (!/property="og:title"/.test(html)) fail('index.html has no Open Graph title');
  if (!/property="og:image"/.test(html)) {
    console.warn(
      'prune-dist: SITE_URL was unset at build - no canonical, og:url or og:image (fine for a preview, set it for launch)'
    );
  }
}

// 6. The host config made it.
if (!existsSync(join(dist, '_headers'))) fail('_headers missing from dist root (public/_headers)');
if (!existsSync(join(dist, 'favicon.svg'))) fail('favicon.svg missing from dist root');
if (!existsSync(join(dist, 'og.jpg'))) fail('og.jpg (the social preview image) missing from dist root');

if (failed) process.exit(1);

// 7. What ships.
const files = walk(dist).map((path) => ({ path: relative(dist, path).replace(/\\/g, '/'), size: statSync(path).size }));
const total = files.reduce((sum, f) => sum + f.size, 0);
files.sort((a, b) => b.size - a.size);
console.log(`prune-dist: removed ${removed} file(s), ${(bytes / 1024).toFixed(0)} KB of dead weight`);
console.log(`prune-dist: dist ships ${files.length} files, ${(total / 1024).toFixed(0)} KB total; the five biggest:`);
for (const f of files.slice(0, 5)) console.log(`  ${String((f.size / 1024).toFixed(0)).padStart(6)} KB  ${f.path}`);
