import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { staticUrl } from '../core/staticUrl.js';

/**
 * Whether this build reads the Draco-compressed siblings (`F` rec 10). Set in
 * `.env.production`, off in dev: `npm run prep` iterates on the raw GLBs and
 * a dev server has no business waiting on `npm run compress`.
 *
 * Flipped 31 Aug, when the criterion written on the 30th was met and passed:
 * raw model bytes reached ~1.6 MB against a 251 KB wasm decoder (wrapper +
 * wasm only — the 700 KB JS fallback is deliberately not shipped; every
 * browser that can run this world has WebAssembly). The buggy alone
 * compresses 23.7×.
 */
export const COMPRESSED = !!import.meta.env?.VITE_COMPRESSED;

/**
 * The URL for a game-ready model, honouring the compressed build. Every
 * call site goes through here so "which variant ships" is decided in exactly
 * one place. Through `staticUrl`, so the URL carries the file's content
 * version and the host can cache it as immutable (Phase 6, 3 Sep).
 */
export function modelUrl(name) {
  return staticUrl(`models/${name}${COMPRESSED ? '-compressed' : ''}.glb`);
}

/**
 * The loader in front of the pipeline — the reference's `ResourcesLoader.js`, ported.
 *
 * A file list goes in, a `{ name: resource }` object comes out, and every URL
 * is fetched exactly once for the life of the game: the cache is keyed on the
 * URL, so two `load()` calls naming the same file share one download and one
 * parse. The reference's `Game.js:103` and `:132` lean on exactly that — the first call
 * loads the four boot-critical files, the second loads the world, and
 * `KonamiCode.js:59` loads its extras years later through the same instance.
 *
 * A file is a tuple, the reference's shape exactly:
 *
 *   [ name, url, type, modifier? ]
 *
 * `name` is the key in the resolved object; `type` picks the loader
 * (`'gltf'` or `'texture'` today); `modifier` runs once on the raw resource
 * before it is cached — the reference's call sites use it to set texture filtering, and a
 * cache hit deliberately does not run it again, because the cached resource
 * already carries the modification.
 *
 * **What is deliberately not ported yet.** The reference's `'draco'` and `'textureKtx'`
 * loader types exist for the compressed build (`F` §2, rec 10). They arrive
 * with the asset build step — wiring decoders to files that do not exist would
 * be untestable, and `getLoader` is the seam they land in.
 *
 * **One defect of the reference's not copied.** The reference's `load([])` never settles: `progress()`
 * is the only thing that resolves and it never runs with zero files. Ours
 * resolves an empty list immediately.
 */
export default class ResourcesLoader {
  /**
   * @param {{ renderer?: import('three/webgpu').WebGPURenderer|null }} [options]
   *   The renderer is unused today; it is here because `KTX2Loader` needs
   *   `detectSupport(renderer)` the day the compressed build lands, and
   *   threading it through later means touching every construction site.
   */
  constructor({ renderer = null } = {}) {
    this.renderer = renderer;
    this.loaders = new Map();
    /** @type {Map<string, unknown>} url → resource, for the life of the game */
    this.cache = new Map();
  }

  getLoader(type) {
    if (this.loaders.has(type)) return this.loaders.get(type);

    let loader = null;
    if (type === 'texture') {
      loader = new THREE.TextureLoader();
    } else if (type === 'gltf') {
      loader = new GLTFLoader();
      if (COMPRESSED) {
        // The compressed build's other half: the decoder, wasm-only (see
        // COMPRESSED above). Attached only when the flag is on so a dev
        // build never fetches decoder files that a raw GLB will not use.
        //
        // The decoder files are THREE'S OWN copy, resolved with
        // `new URL(..., import.meta.url)` inside DRACOLoader.js, which Vite
        // emits into `assets/` with a content hash — so they ride the same
        // immutable cache rule as the bundle. Until 3 Sep this pointed at a
        // second copy in `public/draco/`, and the build shipped both (the
        // Phase 6 audit's find: 1.3 MB of decoders in dist for 250 KB
        // fetched). `DRACO_GLTF_CONFIG` is the glTF-specific pair (192 KB
        // wasm), the smaller of the two three ships; `prune-dist` drops the
        // other three files three's URLs make Vite emit. No JS-decoder
        // fallback on purpose: every browser that runs this world has
        // WebAssembly, and the fallback is 700 KB.
        const draco = new DRACOLoader();
        draco.setDecoderPath(DRACO_GLTF_CONFIG);
        loader.setDRACOLoader(draco);
      }
    } else {
      // 'textureKtx' would land here — and deliberately has not: the palette
      // is a 512-byte DataTexture generated in JS (`paletteTexture()`), so
      // loading a 1.5 KB palette.ktx through a ~300 KB basis transcoder
      // would be a net loss in every direction. `palette.ktx` exists for
      // Blender/tooling parity, not for the runtime.
      throw new Error(`ResourcesLoader: no loader for type "${type}"`);
    }

    this.loaders.set(type, loader);
    return loader;
  }

  /**
   * Load a list of file tuples. Resolves `{ [name]: resource }` once every
   * file has arrived; rejects with the failing URL on the first error, after
   * logging it — the reference's shape, kept because a name in the console beats an
   * unhandled promise trace.
   *
   * @param {[string, string, string, ((resource: unknown) => void)?][]} files
   * @param {(remaining: number, total: number) => void} [progressCallback]
   */
  load(files, progressCallback = null) {
    return new Promise((resolve, reject) => {
      let toLoad = files.length;
      const loadedResources = {};

      if (toLoad === 0) {
        resolve(loadedResources);
        return;
      }

      const progress = () => {
        toLoad--;
        if (typeof progressCallback === 'function') progressCallback(toLoad, files.length);
        if (toLoad === 0) resolve(loadedResources);
      };

      for (const file of files) {
        const [name, url, type, modifier] = file;

        if (this.cache.has(url)) {
          loadedResources[name] = this.cache.get(url);
          progress();
          continue;
        }

        this.getLoader(type).load(
          url,
          (resource) => {
            if (typeof modifier === 'function') modifier(resource);
            loadedResources[name] = resource;
            this.cache.set(url, resource);
            progress();
          },
          undefined,
          () => {
            console.error(`ResourcesLoader: couldn't load ${url}`);
            reject(new Error(`ResourcesLoader: couldn't load ${url}`));
          }
        );
      }
    });
  }
}
