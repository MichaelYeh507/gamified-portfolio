import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { VOID_COLOR } from './palette.js';

/** Vertical field of view, degrees. The reference's, and decision 15 fixes it. */
export const FOV = 25;

/**
 * WebGPU with an automatic WebGL2 fallback, which is what the reference site's
 * current build does. Writing materials in TSL rather than GLSL is what makes
 * that fallback free — the same node graph compiles to either backend.
 */
export default class Renderer {
  constructor({ container, viewport }) {
    this.viewport = viewport;

    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    this.renderer.setClearColor(VOID_COLOR, 1);
    // No tone curve, deliberately, and the same as the reference author has. A tone curve means
    // the palette colour is never the colour on screen: every entry in
    // palette.js would have to be authored against the curve, and every
    // intensity in the research would have to be re-derived by eye instead of
    // transferring verbatim. Without one, `albedo x light` lands where the
    // arithmetic says it lands.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.domElement = this.renderer.domElement;
    this.domElement.id = 'webgl';
    container.appendChild(this.domElement);

    // 25 degrees is the reference's, and it is not a preference: a long lens flattens
    // perspective, which is most of what makes a fixed 3/4 view read as a model
    // village rather than as a game camera (decision 15). The rig that swings
    // it lives in `world/View.js`.
    this.camera = new THREE.PerspectiveCamera(FOV, viewport.aspect, 0.3, 900);
    this.camera.position.set(0, 12, 18);

    this.scene = new THREE.Scene();

    this._resize = this._resize.bind(this);
    viewport.on('resize', this._resize);
    this._resize();
  }

  async init() {
    await this.renderer.init();
    this.backend = this.renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl';
    this._buildPipeline();
    return this.backend;
  }

  /**
   * Bloom, and nothing else.
   *
   * Threshold 1 is the whole design: with no tone mapping, a linear value over
   * 1.0 is by definition something the screen cannot show, so the threshold
   * separates "a bright surface" from "a light source" without anyone tagging
   * geometry. Every glow in the reference's world is an over-1.0 colour meeting this
   * number, and it is why the reveal rim can be a thin hard band rather than a
   * wide smeared ramp faking a glow it never had.
   *
   * `getTextureNode('output')` is the scene in *linear* working space, before
   * any output encode — bloom has to sample light, not display values, or the
   * threshold means nothing.
   *
   * Note on the reference's source: the reference author writes the level-0 chain as
   * `cheapDOF(renderOutput(scenePass)).add(bloomPass)`, which reads as "bloom
   * after renderOutput". It is not, and the difference is visible. The reference author never
   * sets `outputColorTransform = false`, so that inner `renderOutput` resolves
   * to NoToneMapping/NoColorSpace and is inert, and the pipeline's own
   * transform encodes the sum at the end. What is below is the reference's level-1 branch
   * (`Rendering.js:98`) — the same graph, written so it says what it does.
   */
  _buildPipeline() {
    const scenePass = pass(this.scene, this.camera);
    const scenePassColor = scenePass.getTextureNode('output');

    const bloomPass = bloom(scenePassColor);
    bloomPass._nMips = 5;
    bloomPass.threshold.value = 1;
    bloomPass.strength.value = 0.25;
    bloomPass.smoothWidth.value = 1;

    this.bloom = bloomPass;
    this.pipeline = new THREE.RenderPipeline(this.renderer);
    this.pipeline.outputNode = scenePassColor.add(bloomPass);
  }

  _resize() {
    const { width, height, pixelRatio, aspect } = this.viewport;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
  }

  /**
   * Shader warm-up, so nothing compiles mid-play.
   *
   * Three steps, and the middle one is the reference's (`PreRenderer.js`).
   *
   * 1. **Force everything visible and unculled.** `WebGPURenderer.compileAsync`
   *    frustum-culls while it builds its render list, unlike the WebGL one
   *    which walks the whole scene — so without this it would only compile what
   *    the loading camera happens to be pointed at.
   * 2. **Render six 90° faces into a 32px cube.** A single perspective view
   *    cannot exercise the draw path for geometry behind the camera, which is
   *    exactly what you drive into three seconds later. The reference's `PreRenderer` uses
   *    a 32px `CubeRenderTarget` for this and so does ours.
   * 3. **Render one frame through the post pipeline**, which the old warm-up
   *    never touched at all — it called `renderer.renderAsync` directly and so
   *    skipped bloom's five mip passes entirely. That was the larger of the two
   *    gaps: the scene has three materials between it, and bloom has a chain.
   *
   * Gated to WebGPU, as the reference's is (`Game.js:201`, `quality.level === 0 &&
   * isWebGPUBackend`). Six cube faces plus a post chain on a phone is a visible
   * stall on the critical path, and the WebGL fallback compiles cheaply anyway.
   * Kept from ours: the `await`, where the reference's is fire-and-forget, so the loader
   * cannot lift halfway through.
   */
  async warmup() {
    const restore = [];
    this.scene.traverse((obj) => {
      if (!obj.isMesh && !obj.isPoints && !obj.isLine) return;
      restore.push([obj, obj.visible, obj.frustumCulled]);
      obj.visible = true;
      obj.frustumCulled = false;
    });

    try {
      await this.renderer.compileAsync(this.scene, this.camera);

      if (this.backend === 'webgpu') {
        const target = new THREE.CubeRenderTarget(32, { type: THREE.HalfFloatType });
        const cubeCamera = new THREE.CubeCamera(0.3, 100000, target);
        this.scene.add(cubeCamera);
        cubeCamera.update(this.renderer, this.scene);
        this.scene.remove(cubeCamera);
        target.dispose();

        // The post chain, at whatever the canvas currently is. One frame, into
        // a loader the visitor is already looking at.
        //
        // `render()` rather than `renderAsync()`: three r0.185 deprecates the
        // async form and says to use the sync one once `renderer.init()` has been
        // awaited, which `Renderer.init()` does before this runs. Nothing is lost
        // by dropping the await — the shader compilation is the `compileAsync`
        // above, and this is only the pass that exercises bloom's mip chain.
        this.pipeline.render();
      } else {
        const target = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType });
        const previous = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(target);
        await this.renderer.renderAsync(this.scene, this.camera);
        this.renderer.setRenderTarget(previous);
        target.dispose();
      }
    } catch (error) {
      // A warm-up is an optimisation. It must never be the reason the site
      // fails to start, or it has cost more than the stall it was preventing.
      console.warn('[portfolio] shader warm-up failed, continuing', error);
    } finally {
      for (const [obj, visible, culled] of restore) {
        obj.visible = visible;
        obj.frustumCulled = culled;
      }
    }
  }

  render() {
    this.pipeline.render();
  }

  dispose() {
    this.viewport.off('resize', this._resize);
    this.pipeline?.dispose();
    this.renderer.dispose();
    this.domElement.remove();
  }
}
