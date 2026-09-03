/**
 * A hand-rolled GLB writer, shared by `build-scale-reference.mjs` and the
 * pipeline fixture (`tools/lib/fixture.mjs`).
 *
 * Extracted the day it got its second user, per the roadmap. glTF binary is a
 * 12-byte header and two chunks; writing it directly keeps a native toolchain
 * out of a repo that is currently vite plus three.
 *
 * What it supports is exactly what its two users need and no more:
 *
 *   - a node tree — children, so collider children and area groups exist
 *   - per-node TRS (`translation`, `rotation` as an [x,y,z,w] quaternion,
 *     `scale`) — the reference files are transforms and nothing else
 *   - `extras` on a node — Blender custom properties ride glTF `extras`, and
 *     `GLTFLoader` copies them into `userData`; this is how `mass`,
 *     `restitution` and `preventAutoAdd` reach the runtime
 *   - meshes with **named materials, deduplicated by name** — the material
 *     name is part of the level format (`F` §1.5), so two meshes saying
 *     `palette` must point at one glTF material, exactly as Blender exports it
 *
 * Nodes without a mesh become glTF nodes without a `mesh` property, which is
 * what a Blender empty exports as and what a references file is made of.
 */

/**
 * @typedef {{ positions: number[], indices: number[] }} Geometry
 * @typedef {{
 *   name: string,
 *   mesh?: Geometry|null,
 *   material?: { name: string, color?: number[], extras?: object }|null,
 *   translation?: number[],
 *   rotation?: number[],
 *   scale?: number[],
 *   extras?: object,
 *   children?: NodeDescriptor[],
 * }} NodeDescriptor
 */

/**
 * Build a GLB from a list of root node descriptors.
 *
 * @param {{ generator: string, sceneName?: string, nodes: NodeDescriptor[] }} scene
 * @returns {Buffer}
 */
export function writeGlb({ generator, sceneName = 'scene', nodes: rootDescriptors }) {
  const bin = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = [];
  const materialIndexByName = new Map();

  const align4 = (n) => (n + 3) & ~3;

  const pushBytes = (bytes, target) => {
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    bin.push(bytes);
    offset += bytes.length;
    const pad = align4(offset) - offset;
    if (pad) { bin.push(Buffer.alloc(pad)); offset += pad; }
    return view;
  };

  const addMesh = (descriptor) => {
    const { positions, indices } = descriptor.mesh;

    const posArray = new Float32Array(positions);
    const posView = pushBytes(
      Buffer.from(posArray.buffer, posArray.byteOffset, posArray.byteLength), 34962);

    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], positions[i + k]);
        max[k] = Math.max(max[k], positions[i + k]);
      }
    }
    const posAccessor = accessors.length;
    accessors.push({
      bufferView: posView, componentType: 5126, count: positions.length / 3,
      type: 'VEC3', min, max,
    });

    const idxArray = new Uint32Array(indices);
    const idxView = pushBytes(
      Buffer.from(idxArray.buffer, idxArray.byteOffset, idxArray.byteLength), 34963);
    const idxAccessor = accessors.length;
    accessors.push({ bufferView: idxView, componentType: 5125, count: indices.length, type: 'SCALAR' });

    const materialDescriptor = descriptor.material ?? { name: descriptor.name };
    let material = materialIndexByName.get(materialDescriptor.name);
    if (material === undefined) {
      material = materials.length;
      materialIndexByName.set(materialDescriptor.name, material);
      const entry = {
        name: materialDescriptor.name,
        pbrMetallicRoughness: {
          baseColorFactor: materialDescriptor.color ?? [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        doubleSided: true,
      };
      if (materialDescriptor.extras !== undefined) entry.extras = materialDescriptor.extras;
      materials.push(entry);
    }

    const mesh = meshes.length;
    meshes.push({
      name: descriptor.name,
      primitives: [{ attributes: { POSITION: posAccessor }, indices: idxAccessor, material }],
    });
    return mesh;
  };

  const addNode = (descriptor) => {
    // Reserve the index before recursing so a parent precedes its children,
    // which is the order Blender exports in and the order a reader expects.
    const node = { name: descriptor.name };
    const index = nodes.length;
    nodes.push(node);

    if (descriptor.mesh) node.mesh = addMesh(descriptor);
    if (descriptor.translation) node.translation = descriptor.translation;
    if (descriptor.rotation) node.rotation = descriptor.rotation;
    if (descriptor.scale) node.scale = descriptor.scale;
    if (descriptor.extras !== undefined) node.extras = descriptor.extras;
    if (descriptor.children && descriptor.children.length) {
      node.children = descriptor.children.map(addNode);
    }
    return index;
  };

  const rootIndices = rootDescriptors.map(addNode);

  const binBuffer = Buffer.concat(bin);
  const json = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ name: sceneName, nodes: rootIndices }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuffer.length }],
  };
  // A file of empties (a references file) has no meshes at all; glTF forbids
  // empty arrays, so drop them rather than ship an invalid file.
  for (const key of ['meshes', 'materials', 'accessors', 'bufferViews']) {
    if (json[key].length === 0) delete json[key];
  }
  if (binBuffer.length === 0) delete json.buffers;

  let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = align4(jsonBytes.length) - jsonBytes.length;
  if (jsonPad) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  const binChunk = binBuffer.length ? 8 + binBuffer.length : 0;
  header.writeUInt32LE(12 + 8 + jsonBytes.length + binChunk, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBytes.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const parts = [header, jsonHeader, jsonBytes];
  if (binBuffer.length) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binBuffer.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN'
    parts.push(binHeader, binBuffer);
  }
  return Buffer.concat(parts);
}

// ------------------------------------------------------------- geometry

/** An axis-aligned box, positions baked around an optional world-space centre. */
export function box(w, h, d, cx = 0, cy = 0, cz = 0) {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const p = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
  ].map(([px, py, pz]) => [px + cx, py + cy, pz + cz]);

  const faces = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5],
  ];
  const positions = [];
  const indices = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const v of f) positions.push(...p[v]);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, indices };
}

/**
 * A subdivided ground plane in XZ, centred on the origin — `segments²` quads
 * with **interior vertices off the bounding box**. The fixture's trimesh uses
 * this rather than a box because a box's vertices all sit on bbox corners,
 * which every quantization grid reproduces exactly: compressing a box can
 * never show position error, and a fixture that cannot fail is not a fixture.
 */
export function grid(width, depth, y = 0, segments = 4) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= segments; j++) {
      positions.push((i / segments - 0.5) * width, y, (j / segments - 0.5) * depth);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j;
      indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  return { positions, indices };
}

/** Concatenate geometries, re-basing indices. */
export function merge(...parts) {
  const positions = [];
  const indices = [];
  for (const part of parts) {
    const offset = positions.length / 3;
    positions.push(...part.positions);
    for (const i of part.indices) indices.push(i + offset);
  }
  return { positions, indices };
}
