import * as THREE from 'three/webgpu';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

/**
 * The 3D link icons — the reference's baked logo props, generated instead of found.
 *
 * The reference's social area's whole charm is that the links are *objects*: eight thin
 * extruded logos (~1.3–2.2 wide, **0.2 thick** — measured out of `areas.glb`)
 * standing on the ground as dynamic bodies you can nudge with the car. We
 * model nothing by hand (decision 47), but these are code-generated geometry
 * — `paint()`'s side of the rule — extruded from SVG paths at build time.
 *
 * The paths are the official marks from **Simple Icons** (CC0, credited in
 * `CREDITS.md`; the logos themselves remain trademarks of their owners —
 * shown here as link icons to Michael's own profiles, which is what the marks
 * are for). The email icon is deliberately a **generic envelope**, not the
 * Gmail M: the link is a mailto, the reference's own build uses a plain envelope, and
 * repainting Google's mark onto our palette is the kind of thing this repo
 * declines. The envelope path is Material Symbols' mail glyph (Apache 2.0).
 *
 * Browser-only on purpose (SVGLoader parses with `DOMParser`): `ContactArea`
 * imports this, the pure `contactArc.js` and the node-side check never do.
 */

/** SVG path data per `links.js` slug, all in a 24×24 viewBox. */
const ICON_PATHS = {
  email: {
    d: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
    height: 1.15,
  },
  github: {
    d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
    height: 1.5,
  },
  linkedin: {
    d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    height: 1.5,
  },
};

/** The reference's measured icon thickness — the flat logos in areas.glb are ~0.2 deep. */
const DEPTH = 0.2;

const loader = new SVGLoader();

/**
 * Extrude one slug's mark: standing upright in its local XY plane, base at
 * y = 0, centred on x and z, `height` world units tall, facing +z. Returns
 * `null` for a slug with no authored path — a new link in `links.js` costs a
 * card and a beacon either way; the icon is the optional flourish.
 *
 * @param {string} slug
 * @returns {{ geometry: THREE.BufferGeometry, size: THREE.Vector3 }|null}
 */
export function makeIconGeometry(slug) {
  const entry = ICON_PATHS[slug];
  if (!entry) return null;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${entry.d}"/></svg>`;
  const [path] = loader.parse(svg).paths;
  const shapes = SVGLoader.createShapes(path);

  // Low curveSegments on purpose: the world is faceted, and the octocat at
  // the default 12 is more triangles than some whole found props.
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: 24 * (DEPTH / entry.height),
    bevelEnabled: false,
    curveSegments: 5,
  });

  // SVG y runs down; a half-turn about x stands the glyph up without
  // mirroring (a negative scale would flip the winding and the lighting).
  geometry.rotateX(Math.PI);

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const scale = entry.height / (box.max.y - box.min.y);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();

  const b = geometry.boundingBox;
  geometry.translate(
    -(b.min.x + b.max.x) / 2,
    -b.min.y,
    -(b.min.z + b.max.z) / 2
  );
  geometry.computeBoundingBox();

  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  return { geometry, size };
}
