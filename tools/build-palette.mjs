/**
 * Write `public/palette.png` from `src/render/palette.js`.
 *
 *   npm run palette         write the file
 *   npm run palette:check   fail if the committed file has drifted from the JS
 *
 * The PNG exists because Blender needs a file on disk to put in an image node —
 * decision 37 bakes palette UVs there, and a UV island is placed by eye against
 * a picture of the palette. It is a build product, and `palette.js` is the
 * source of truth; see the long note at the top of that file for why the arrow
 * points this way and what changes when the KTX2 build step lands.
 *
 * **The bytes come from `paletteBytes()`, the same function the runtime uploads
 * to the GPU.** Nothing in here knows what a colour is. That is deliberate: two
 * encoders would eventually disagree by one rounding step, and the failure would
 * surface as authored art being a shade off from code-generated geometry —
 * which is the one thing decision 37's two paths must never do.
 *
 * `three/webgpu` imports cleanly under node, verified, so this really is the
 * same code path rather than a reimplementation of it.
 *
 * The encoder is hand-rolled against the PNG spec. It is ~40 lines for a
 * 128 x 4 image and it keeps `sharp` (a native dependency, ~10 MB) out of a
 * repo whose entire toolchain is currently vite plus three.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  paletteBytes,
  PALETTE_WIDTH,
  PALETTE_HEIGHT,
  PALETTE,
  SLOTS,
  BAND,
  HEADROOM_COLOR,
} from '../src/render/palette.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../public/palette.png');

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, body) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** RGBA bytes in, an 8-bit RGB PNG out. No alpha: the palette has none. */
function encodePng(rgba, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB, which is the reference author's too
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte per scanline. Filter 0 (None) throughout: the image is 32
  // flat runs, deflate already collapses it to nothing, and a fixed filter
  // keeps the output byte-stable rather than depending on a heuristic.
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (stride + 1) + 1 + x * 3;
      raw[dst + 0] = rgba[src + 0];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Decode only what we wrote: 8-bit RGB, non-interlaced, any filter type. */
function decodePng(buf) {
  let off = 8;
  const idat = [];
  let width = 0;
  let height = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(off + 8);
      height = buf.readUInt32BE(off + 12);
      if (buf[off + 16] !== 8 || buf[off + 17] !== 2 || buf[off + 20] !== 0) {
        throw new Error('palette.png is not the 8-bit non-interlaced RGB this tool writes');
      }
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(off + 8, off + 8 + len));
    }
    off += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? out[y * stride + x - 3] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= 3 && y > 0 ? out[(y - 1) * stride + x - 3] : 0;
      const v = line[x];
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = (v + add) & 255;
    }
  }
  return { width, height, rgb: out };
}

const hex = (r, g, b) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function main() {
  const check = process.argv.includes('--check');
  const rgba = paletteBytes();
  const png = encodePng(rgba, PALETTE_WIDTH, PALETTE_HEIGHT);

  if (check) {
    let onDisk;
    try {
      onDisk = readFileSync(OUT);
    } catch {
      console.error(`palette:check FAILED - ${OUT} does not exist. Run: npm run palette`);
      process.exit(1);
    }

    const { width, height, rgb } = decodePng(onDisk);
    const problems = [];
    if (width !== PALETTE_WIDTH || height !== PALETTE_HEIGHT) {
      problems.push(`dimensions ${width}x${height}, expected ${PALETTE_WIDTH}x${PALETTE_HEIGHT}`);
    } else {
      // Compare pixels, not file bytes: zlib's output is allowed to differ
      // between node versions, and what has to match is the colours.
      for (let y = 0; y < height && problems.length < 8; y++) {
        for (let x = 0; x < width && problems.length < 8; x++) {
          const s = (y * width + x) * 4;
          const d = (y * width + x) * 3;
          if (rgba[s] !== rgb[d] || rgba[s + 1] !== rgb[d + 1] || rgba[s + 2] !== rgb[d + 2]) {
            problems.push(
              `(${x},${y}) file ${hex(rgb[d], rgb[d + 1], rgb[d + 2])}, ` +
                `js ${hex(rgba[s], rgba[s + 1], rgba[s + 2])}`
            );
          }
        }
      }
    }

    if (problems.length) {
      console.error('palette:check FAILED - public/palette.png has drifted from src/render/palette.js');
      for (const p of problems) console.error('  ' + p);
      console.error('  Run: npm run palette');
      process.exit(1);
    }
    console.log(`palette:check ok - ${PALETTE_WIDTH}x${PALETTE_HEIGHT}, ${SLOTS} slots, ${onDisk.length} bytes`);
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, png);

  const used = PALETTE.length;
  console.log(`wrote public/palette.png - ${PALETTE_WIDTH}x${PALETTE_HEIGHT}, ${png.length} bytes`);
  console.log(`  ${SLOTS} slots of ${BAND}px; ${used} assigned, ${SLOTS - used} headroom (${HEADROOM_COLOR})`);
  for (let i = 0; i < used; i++) {
    const s = (i * BAND + BAND / 2 - 1) * 4; // any pixel inside the band
    console.log(
      `  ${String(i).padStart(2)}  x ${String(i * BAND).padStart(3)}-${String(i * BAND + BAND - 1).padEnd(3)}` +
        `  u ${(((i + 0.5) / SLOTS)).toFixed(5)}  ${hex(rgba[s], rgba[s + 1], rgba[s + 2])}  ${PALETTE[i]} (authored)`
    );
  }
}

main();
