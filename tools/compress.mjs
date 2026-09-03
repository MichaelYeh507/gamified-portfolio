/**
 * The asset build step — the reference's `compress.js`, restructured per `F` rec 4.
 *
 *   npm run compress            (compresses public/models)
 *   node tools/compress.mjs <dir>
 *
 * Same shape as the reference's: every step writes a **sibling** file (`X.glb` →
 * `X-compressed.glb`), nothing is overwritten, and the runtime chooses via
 * `VITE_COMPRESSED` — that switch lands with the first runtime `load()` call
 * that has a compressed file to name (F rec 10; it has no caller today).
 *
 * The three deliberate differences from the reference's, all rec 4:
 *
 *   - **Serial.** The reference's spawns all N processes at once; ours awaits each file.
 *   - **`*References.glb` is skipped entirely.** Draco saves 12 bytes on a
 *     transform-only file and costs a decoder dependency.
 *   - **The texture step (`etc1s`) is skipped for GLBs with no textures** —
 *     which, in our pipeline, is *every* valid GLB: the export checklist mutes
 *     the palette image node, so an embedded texture is an authoring mistake
 *     and gets a warning, not an encode.
 *
 * The reference's Draco settings, byte for byte (`F` §2 block 1) — every one below the
 * CLI default on purpose, and `--quantize-texcoord 6` is only safe because
 * the palette's 4-px bands are 3.1 % wide against its ±0.8 % error:
 * edgebreaker, 12-bit positions, 6-bit normals, 6-bit UVs, 2-bit colour.
 *
 * **Standalone textures (KTX2) are detected but not yet encoded.** The reference's block 2
 * shells out to `toktx` (KTX-Software), which is not installed here; when it
 * is, `palette.png` gets `--encode uastc --genmipmap --assign_oetf srgb`
 * (`F` §3.4) and `ResourcesLoader` grows its `textureKtx` type. The script
 * says so per run rather than silently doing half its job.
 *
 * Verification is part of the step, not a favour: every compressed file is
 * read back through the decoder and must match the original's triangle count
 * and bounding box (to 12-bit quantization tolerance). Note Draco welds
 * identical vertices, so *vertex* counts are allowed to drop on meshes without
 * normals — collision geometry, typically — while triangles never may.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';

const DRACO_OPTIONS = {
  method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
  quantizationBits: { POSITION: 12, NORMAL: 6, TEX_COORD: 6, COLOR: 2, GENERIC: 2 },
};

function* walkGlbs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkGlbs(path);
    else if (/\.glb$/i.test(entry.name) && !/-compressed\.glb$/i.test(entry.name)) yield path;
  }
}

/**
 * Triangle count plus every decoded vertex position, concatenated. The
 * positions come from `getArray()` — the DECODED data — never from
 * `getMin()`/`getMax()`: those return the accessor's stored JSON bounds, which
 * pass through Draco untouched, so a check against them compares metadata to
 * metadata and can never fail. Found by making this guard fail on purpose.
 */
function stats(document) {
  let triangles = 0;
  const positions = [];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      triangles += (indices ? indices.getCount() : position.getCount()) / 3;
      positions.push(position.getArray());
    }
  }
  return { triangles, positions };
}

/**
 * Every decoded vertex must lie within `tolerance` of SOME original vertex.
 *
 * Not index-to-index — Draco reorders vertices and welds positionally
 * identical ones (legal: collision meshes carry no normals, so a box's 24
 * corner-duplicates come back as 8; triangle count is checked separately).
 * And not bounding-box — a quantization grid always contains its own
 * endpoints, so bbox corners survive ANY bit depth and a bbox check cannot
 * fire. Spatial hash keeps it O(n).
 */
function verticesWithin(originalArrays, decodedArrays, tolerance) {
  const cell = tolerance;
  const key = (x, y, z) =>
    `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const buckets = new Map();
  for (const array of originalArrays) {
    for (let i = 0; i < array.length; i += 3) {
      const k = key(array[i], array[i + 1], array[i + 2]);
      let bucket = buckets.get(k);
      if (!bucket) buckets.set(k, (bucket = []));
      bucket.push(array[i], array[i + 1], array[i + 2]);
    }
  }
  const t2 = tolerance * tolerance;
  for (const array of decodedArrays) {
    for (let i = 0; i < array.length; i += 3) {
      const [x, y, z] = [array[i], array[i + 1], array[i + 2]];
      let ok = false;
      for (let dx = -1; dx <= 1 && !ok; dx++)
        for (let dy = -1; dy <= 1 && !ok; dy++)
          for (let dz = -1; dz <= 1 && !ok; dz++) {
            const bucket = buckets.get(key(x + dx * cell, y + dy * cell, z + dz * cell));
            if (!bucket) continue;
            for (let j = 0; j < bucket.length; j += 3) {
              const d = (x - bucket[j]) ** 2 + (y - bucket[j + 1]) ** 2 + (z - bucket[j + 2]) ** 2;
              if (d <= t2) { ok = true; break; }
            }
          }
      if (!ok) return false;
    }
  }
  return true;
}

export async function compressDirectory(dir, { log = console.log } = {}) {
  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });

  const results = [];
  for (const file of walkGlbs(dir)) {
    const name = file.slice(dir.length + 1).replaceAll('\\', '/');

    if (/References\.glb$/.test(file)) {
      log(`  ${name.padEnd(44)} skipped - references (transforms only, rec 4)`);
      results.push({ name, skipped: 'references' });
      continue;
    }

    // The ruler. Never imported, never shipped compressed - it exists for
    // Blender, and a Draco'd copy of it is dead weight in dist. Learned by
    // sweeping public/ by hand and finding one.
    if (/scale-reference\.glb$/.test(file)) {
      log(`  ${name.padEnd(44)} skipped - the scale reference is a ruler, not an asset`);
      results.push({ name, skipped: 'scale-reference' });
      continue;
    }

    const source = readFileSync(file);
    const document = await io.readBinary(new Uint8Array(source));

    const textures = document.getRoot().listTextures().length;
    if (textures > 0) {
      log(`  ${name.padEnd(44)} WARNING - carries ${textures} embedded texture(s); ` +
        `the export checklist mutes the palette node, so this is probably a mistake`);
    }

    const before = stats(document);
    document.createExtension(KHRDracoMeshCompression).setRequired(true)
      .setEncoderOptions(DRACO_OPTIONS);
    const out = Buffer.from(await io.writeBinary(document));

    // Read back through the decoder before trusting the bytes.
    const back = stats(await io.readBinary(new Uint8Array(out)));
    let extent = 1e-6;
    for (const array of before.positions) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < array.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], array[i + k]);
          max[k] = Math.max(max[k], array[i + k]);
        }
      }
      extent = Math.max(extent, ...max.map((v, k) => v - min[k]));
    }
    // 12-bit quantization over the mesh extent, with slack for the grid's
    // rounding — half a step is the theoretical bound, one step is the guard.
    const tolerance = extent / 4096 + 1e-6;
    if (back.triangles !== before.triangles ||
      !verticesWithin(before.positions, back.positions, tolerance)) {
      throw new Error(
        `compress: ${name} failed readback - triangles ${before.triangles} -> ${back.triangles}, ` +
        `or a decoded vertex drifted over ${tolerance.toFixed(5)}`
      );
    }

    const outFile = file.replace(/\.glb$/i, '-compressed.glb');
    writeFileSync(outFile, out);
    const ratio = source.length / out.length;
    log(`  ${name.padEnd(44)} ${String(source.length).padStart(8)} -> ${String(out.length).padStart(8)} bytes  (${ratio.toFixed(1)}x)`);
    results.push({ name, before: source.length, after: out.length });
  }
  return results;
}

/**
 * Where KTX-Software lives. `toktx` is on the user PATH after the 22 Aug
 * install (`C:\dev\tools\ktx\bin`), but a shell older than the PATH edit — or
 * another machine — falls back to the known install location before giving up.
 */
function findKtxBin() {
  for (const prefix of ['', 'C:\\dev\\tools\\ktx\\bin\\']) {
    try {
      execSync(`"${prefix}toktx" --version`, { stdio: 'pipe' });
      return prefix;
    } catch { /* next candidate */ }
  }
  return null;
}

/**
 * Block 2 — standalone textures, KTX2 via `toktx`.
 *
 * One entry today, and it is the one that mattered: the palette, with the reference author's
 * invocation **verbatim** (`compress.js:80/97`, quoted in `F` §3.4) — UASTC
 * because ETC1S would band it, mipmapped because the reference's is (never sampled: the
 * runtime is NearestFilter with no mips), sRGB because it is colour. `toktx`
 * is deprecated in favour of `ktx create`, but v4.4.2 still ships it and the
 * verbatim line provably produced every one of the reference's 88 shipped .ktx files —
 * re-spell against `ktx create --help` the day it disappears.
 *
 * Verification closes the loop through the single source of truth:
 * `ktx extract --transcode rgba8 --raw` hands back the decoded pixels, and
 * they must equal `paletteBytes()` — the same function the PNG and the
 * runtime texture come from — **byte for byte**. Measured 22 Aug: all 512
 * pixels exact, zero delta. That is decision 14's 4-px aligned bands doing
 * precisely what they were bought for; a 1-px band would not survive this.
 */
async function compressTextures(ktxBin, { log = console.log } = {}) {
  const { paletteBytes } = await import('../src/render/palette.js');

  const src = 'public/palette.png';
  const out = 'public/palette.ktx';
  execSync(
    `"${ktxBin}toktx" --nowarn --2d --t2 --encode uastc --genmipmap ` +
    `--assign_oetf srgb --target_type RGB ${out} ${src}`,
    { stdio: 'pipe' }
  );

  const raw = execSync(
    `"${ktxBin}ktx" extract --transcode rgba8 --raw ${out} -`,
    { maxBuffer: 1 << 20 }
  );
  const expected = Buffer.from(paletteBytes());
  if (!raw.equals(expected)) {
    let first = -1;
    for (let i = 0; i < expected.length; i++) {
      if (raw[i] !== expected[i]) { first = i; break; }
    }
    throw new Error(
      `compress: ${out} failed readback - decoded pixels differ from paletteBytes() ` +
      `(length ${raw.length} vs ${expected.length}, first difference at byte ${first})`
    );
  }
  const bytes = statSync(out).size;
  log(`  ${src} -> ${out}`.padEnd(46) + ` ${String(bytes).padStart(8)} bytes  (512 px verified exact)`);
}

async function main() {
  const dir = resolve(process.argv[2] ?? 'public/models');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    // No models yet is a normal state before the first authored asset — the
    // texture block below must still run, or the palette KTX could only be
    // rebuilt by passing a directory by hand.
    console.log(`compress: ${dir} does not exist - no models to compress.`);
  } else {
    console.log(`compress: ${dir}\n`);
    const results = await compressDirectory(dir);
    const done = results.filter((r) => !r.skipped);
    console.log(`\n${done.length} file(s) compressed, ${results.length - done.length} skipped.`);
  }

  const ktxBin = findKtxBin();
  if (ktxBin === null) {
    console.log(
      '\ntextures: SKIPPED - toktx (KTX-Software) is not installed.\n' +
      '  The palette KTX2 (uastc, mipmapped, srgb - F 3.4) waits on it; the runtime\n' +
      '  keeps reading palette.png until then, which is correct and costs 156 bytes.'
    );
  } else {
    console.log('\ntextures:');
    await compressTextures(ktxBin);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop());
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
