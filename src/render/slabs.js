import * as THREE from 'three/webgpu';

/**
 * The reference's paving texture, generated.
 *
 * The reference's roads are not dirt: `Floor.js:55-65` mixes a **slab texture** into the
 * ground wherever the terrain's red channel says "paved" — `static/floor/
 * slabs.png`, an 8×8 grid of rounded flagstones in greys, each stone its own
 * shade with the odd crack, tiled at 0.175 per unit and coloured between two
 * warm tones (`#a87762` → `#ffcf8b`) by its grey. Ours is that image drawn
 * on a canvas at boot rather than shipped: the same grid, the same kind of
 * variation, seeded so every boot paves the island identically. The mixing
 * lives in `makeTerrainAlbedo`.
 */
export function makeSlabsTexture({ size = 256, perSide = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Deterministic: a Park–Miller sequence, so the paving is the same every boot.
  let seed = 20250902;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const grey = (v) => {
    const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
    return `rgb(${c},${c},${c})`;
  };
  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // Mortar: the darkest value, so the joints read as lines between stones.
  ctx.fillStyle = grey(0.22);
  ctx.fillRect(0, 0, size, size);

  const cell = size / perSide;
  const gap = cell * 0.07;
  const radius = cell * 0.14;

  for (let iy = 0; iy < perSide; iy++) {
    for (let ix = 0; ix < perSide; ix++) {
      const shade = 0.5 + rand() * 0.4;
      const x0 = ix * cell + gap;
      const y0 = iy * cell + gap;
      const w = cell - gap * 2;
      const h = cell - gap * 2;

      // Each stone carries a faint diagonal gradient — the bevel the reference's
      // stones have, in one fill.
      const gradient = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
      gradient.addColorStop(0, grey(shade + 0.08));
      gradient.addColorStop(1, grey(shade - 0.08));
      ctx.fillStyle = gradient;
      roundRect(x0, y0, w, h, radius);
      ctx.fill();

      // A crack across roughly a third of the stones.
      if (rand() < 0.3) {
        ctx.strokeStyle = grey(shade - 0.3);
        ctx.lineWidth = Math.max(1, cell * 0.04);
        ctx.beginPath();
        const side = rand();
        const sx = side < 0.5 ? x0 : x0 + w * rand();
        const sy = side < 0.5 ? y0 + h * rand() : y0;
        ctx.moveTo(sx, sy);
        ctx.lineTo(x0 + w * (0.3 + rand() * 0.4), y0 + h * (0.3 + rand() * 0.4));
        ctx.lineTo(x0 + w * rand(), y0 + h * (0.5 + rand() * 0.5));
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // A mask, not a colour: sampled as `.r` and mixed between two palette tones.
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
