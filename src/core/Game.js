import * as THREE from 'three/webgpu';
import { positionWorld, uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import Ticker, { TICK } from './Ticker.js';
import Viewport from './Viewport.js';
import Input from './Input.js';
import { updateTweens } from './tween.js';

import Veil from './Veil.js';
import Controls from './Controls.js';
import FastTravel from './FastTravel.js';

import DayCycles from '../cycles/DayCycles.js';
import YearCycles from '../cycles/YearCycles.js';

import Renderer from '../render/Renderer.js';
import Night from '../render/Night.js';
import Trails from '../render/Trails.js';
import { COLOR, PALETTE } from '../render/palette.js';
import Reveal from '../render/Reveal.js';
import Intro from '../render/Intro.js';
import Sky from '../render/Sky.js';
import Lighting from '../render/Lighting.js';
import {
  makeContentMaterial,
  makeVoidMaterial,
  makeWaterMaterial,
  makeTextMaterial,
  makeTerrainAlbedo,
} from '../render/materials.js';
import { loadDisplayFont, makeTextPlate } from '../render/textPlate.js';
import MaterialRegistry from '../render/materialRegistry.js';

import Physics from '../world/Physics.js';
import Objects from '../world/Objects.js';
import ResourcesLoader, { modelUrl } from '../pipeline/ResourcesLoader.js';
import { staticUrl } from './staticUrl.js';
import Terrain from '../world/Terrain.js';
import Noises from '../render/Noises.js';
import Wind from '../render/Wind.js';
import Island from '../world/Island.js';
import Grass from '../world/Grass.js';
import Tracks, { Track } from '../world/Tracks.js';
import Leaves from '../world/Leaves.js';
import WindLines from '../world/WindLines.js';
import RainLines from '../world/RainLines.js';
import Weather from '../cycles/Weather.js';
import { makeSlabsTexture } from '../render/slabs.js';
import Confetti from '../render/Confetti.js';
import Wayfinding from '../world/Wayfinding.js';
import Pitch from '../world/Pitch.js';
import { PITCH } from '../world/pitchPlan.js';
import { wayfindingPlan, ROAD } from '../world/wayfindingPlan.js';
import Water from '../world/Water.js';
import Bedrock from '../world/Bedrock.js';
import VoidGrid from '../world/VoidGrid.js';
import Car from '../world/Car.js';
import View from '../world/View.js';
import Areas from '../world/areas/Areas.js';
import Beacons from '../world/areas/Beacons.js';
import Card from '../world/areas/Card.js';
import ProjectsArea from '../world/areas/ProjectsArea.js';
import CareerArea from '../world/areas/CareerArea.js';
import LandingArea from '../world/areas/LandingArea.js';
import ContactArea from '../world/areas/ContactArea.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

import areaDefs from '../content/areas.js';

/** What the car is handed whenever something other than the driver has control. */
const IDLE_INPUT = Object.freeze({ steer: 0, drive: 0, actions: Object.freeze({ handbrake: 0 }) });


/**
 * Where the first found asset stands: two lamp posts flanking the plaza's
 * *approach* — 4 units camera-side of the standing point, ±6 along the
 * across-screen axis (√½, −√½ — the axis `ProjectsArea`'s arc grows along).
 * The heading squares each post's faces with the boards' (`FACE_YAW`),
 * because under a camera fixed at theta 45° an axis-aligned box reads
 * corner-on.
 *
 * **The first placement flipped the car.** They stood at ±7 beside the
 * boards — 4.6 units from each wing board, which read as clearance — but a
 * `&p=` deep link stands the car on the board's *interact point*, 2.3 units
 * from the lamp, against a lamp half-extent of 0.675 plus a car half-length
 * of 1.55 = 2.23 of combined body. The car spawned touching the collider
 * and physics threw it onto its roof. These positions are ≥ 6 units from
 * every interact point and off the spawn→plaza drive line (closest pass
 * 5.0); on arrival they frame the foreground instead of the boards.
 *
 * A placement list in code, deliberately small: when the emissive layer
 * lands, lamps become `PoleLights`' business and this list moves there.
 */
const LAMP_PLACEMENTS = [
  { at: [35.1, 16.6], heading: Math.PI * 0.25 },
  { at: [26.6, 25.1], heading: Math.PI * 0.25 },
];

/**
 * The singleton, with a hard and explicit init order.
 *
 * Every teardown in the research folder converges on this shape: one owner, one
 * loop, subsystems that declare when in the frame they want to run. The order
 * below is load-bearing — physics cannot exist before Rapier's WASM resolves,
 * materials cannot exist before the reveal uniforms do, and the warm-up render
 * has to happen after the whole scene is assembled but before anyone sees it.
 */
export default class Game {
  static async boot(container) {
    const game = new Game();
    await game.init(container);
    return game;
  }

  async init(container) {
    /**
     * Who has the controls. `D` §6.5, and now the reference's `inputs.filters` properly
     * rather than in its smallest useful form.
     *
     * Four values and one rule: **only `driving` reaches the car.** Anything
     * else feeds it `IDLE_INPUT`, which is the same frozen zero the intro
     * already used, so this is one condition on a handler that existed rather
     * than a new system. `cinematic` is declared because the value is part of
     * the contract and nothing sets it yet — the cinematic camera is `D` §6.9's
     * "later, not now".
     *
     * **It starts at `intro`, and that is a fix rather than a tidy-up.** It used
     * to start at `driving`, so for the whole of the opening cinematic — and for
     * an unbounded time before it, since `main.js` waits on `whenVisible()` —
     * every key was live while the car was not. Measured on the running build
     * with `?at=projects`: `E` opened a project card over the cinematic and `R`
     * fired the veil and teleported the car away from where the deep link had
     * just placed it, both with `intro.playable` still false. Only reachable
     * because a deep link stands you inside a beacon's radius from the first
     * frame, which is exactly what `&p=` now does from a shared link.
     *
     * The `intro.playable` term that used to guard the car is gone with it: mode
     * flips to `driving` on the same frame `Intro` unlocks control (see
     * `playIntro`), so the two were the same fact stored twice.
     */
    this.mode = 'intro';
    /** Whether the "press R" offer is currently up. See `_updateStuckHint`. */
    this._stuckHint = false;
    /**
     * True while a teleport is in flight behind the veil. Declared here rather
     * than created on first write by `_recover()`: it is read every tick by the
     * `playable` gate, and relying on `!undefined` for the first few seconds of
     * every session is the kind of accident that survives until it doesn't.
     */
    this._respawning = false;
    /**
     * Resolved by `Intro`'s `onDone`, awaited by `whenIntroDone()`. Created here
     * rather than on demand, because the thing that awaits it does so *after*
     * the cinematic has already started — a promise made at that point would
     * have missed the event it is waiting for.
     *
     * Written the long way rather than with `Promise.withResolvers()`, which
     * would be the only API in `src/` newer than Chrome 119 / Safari 17.4. The
     * failure mode is not a missing card, it is `start()` rejecting into the
     * résumé fallback, and this file already refuses to be the reason a browser
     * that could have run the world gets the plain page instead.
     */
    this._resolveIntroDone = null;
    this._introDone = new Promise((resolve) => {
      this._resolveIntroDone = resolve;
    });

    // 1. Plumbing that has no dependencies.
    this.viewport = new Viewport();
    this.ticker = new Ticker();
    // The mode is the only source of the filter set — see `setMode`. Seeding it
    // from `this.mode` rather than repeating the literal is what stops the two
    // drifting the day a fifth mode is added.
    this.input = new Input({ filters: [this.mode] });

    // 2. The renderer, which decides WebGPU vs WebGL.
    this.renderer = new Renderer({ container, viewport: this.viewport });
    this.backend = await this.renderer.init();
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;

    // 3. Physics (async: Rapier is WASM).
    this.physics = await Physics.create();

    // 4. The cycles, which depend on nothing but the clock and are depended on
    //    by everything carrying colour. Every visitor anywhere sees the same
    //    time of day at the same instant, because progress is read off the UTC
    //    epoch rather than counted from page load (decision 11).
    this.dayCycles = new DayCycles();
    this.yearCycles = new YearCycles();
    // The weather: rain from the season's humidity and a shower clock
    // (`cycles/Weather.js`); the water and the rain lines read `rain.value`.
    this.weather = new Weather({ yearCycles: this.yearCycles });
    this.rainUniform = uniform(0);
    /**
     * The night uniforms — emissive intensity and the headlight cone,
     * written per frame in `_applyCycles`. Created beside the cycles because
     * `_applyCycles` runs once before the materials exist, and both content
     * materials bake these uniforms into their node graphs at construction.
     */
    this.night = new Night();

    // 5. Everything the materials bake into their node graphs at construction:
    //    the reveal uniforms, the lighting rig, the sky/fog node and the three
    //    water elevations. All of them have to exist before any material does.
    this.reveal = new Reveal({ radius: 0 });
    this.lighting = new Lighting(this.scene);
    this.sky = new Sky(this.scene);
    this.terrain = new Terrain();
    this.water = new Water();
    // The reference's wheel tracks: the render target the ground and the grass read
    // their trampling from. Before the terrain albedo, which samples it.
    this.tracks = new Tracks();

    // Before the first material compiles and long before the warm-up render, so
    // nothing is ever built or drawn against the constructor defaults.
    this._applyCycles();

    /**
     * Ambient motion. Generated on the GPU at boot, so it costs no download and
     * nothing has to be loaded before a material can compile.
     *
     * Built here rather than lazily because `Wind.offsetNode` closes over the
     * noise texture at material-construction time, and a material built against
     * a texture that does not exist yet samples black — which is not a crash,
     * it is a world with no wind in it and no error to explain why.
     */
    this.noises = new Noises(this.renderer.renderer);
    this.wind = new Wind(this.noises);
    this._offWind = this.ticker.on('tick', (delta) => this.wind.update(delta), TICK.CYCLES);

    this.contentMaterial = makeContentMaterial({
      reveal: this.reveal,
      lighting: this.lighting,
      sky: this.sky,
      water: this.water,
      night: this.night,
      side: THREE.DoubleSide, // the reveal cuts through solids
    });
    /**
     * The ground's colour system — the reference's: a depth-driven gradient painted onto
     * the terrain itself, shared by every grass blade (see
     * `makeTerrainAlbedo`). Held on the game because the terrain material
     * and the grass field both sample the same Fn.
     */
    // The reference's flagstone texture, drawn at boot; the roads' paving.
    this.slabs = makeSlabsTexture();
    this.terrainAlbedo = makeTerrainAlbedo({
      terrain: this.terrain,
      water: this.water,
      noises: this.noises,
      tracks: this.tracks,
      slabs: this.slabs,
    });
    this.terrainMaterial = makeContentMaterial({
      reveal: this.reveal,
      lighting: this.lighting,
      sky: this.sky,
      /**
       * No waterline band on the ground itself (3 Sep, Michael's screenshot
       * of a ford: "extra white lines"). The band paints every fragment
       * within `surfaceThickness` of the water's height, and on the
       * terrain that height is interpolated across 1.5-unit triangles, so
       * on our flat banks the line zigzags along the mesh. The water
       * plane's own shore band draws the foam from the smooth depth
       * texture instead; props standing in water keep the band, where it
       * reads as a wet line on a barrel.
       */
      water: null,
      night: this.night,
      side: THREE.DoubleSide,
      albedo: this.terrainAlbedo(positionWorld.xz),
    });
    /**
     * A second instance of the same material with the wind hooked up, for the
     * props alone. One extra material, no extra draw call — the props are
     * already their own mesh — and it keeps the `sway` attribute off the
     * terrain, the car and the plaza, none of which carry one.
     */
    this.propMaterial = makeContentMaterial({
      reveal: this.reveal,
      lighting: this.lighting,
      sky: this.sky,
      water: this.water,
      night: this.night,
      side: THREE.DoubleSide,
      wind: this.wind,
    });
    /**
     * The loader and the material registry, in front of and behind every GLB
     * that will ever enter the world. `palette` is pre-registered **before the
     * first model loads** (F rec 6): a Blender mesh whose material is named
     * `palette` renders through `contentMaterial` — the whole shading model —
     * and the exported material is discarded. `contentMaterial`, not
     * `propMaterial`: authored GLBs carry no `sway` vertex attribute, and the
     * wind graph reads one.
     */
    this.resourcesLoader = new ResourcesLoader({ renderer: this.renderer.renderer });
    this.materials = new MaterialRegistry();
    this.materials.save('palette', this.contentMaterial);
    /**
     * The emissive seam, named before anything glows. The prep tool puts the
     * parts that will emit — the lamp's light chamber, on palette entry 12 —
     * under this material name, so the day PoleLights lands (the identity
     * layer, decision 13) it replaces one registry entry and every lamp in
     * every GLB starts glowing. Until then it renders as plain palette,
     * which is correct: an amber chamber by day, lit by the world's light.
     */
    this.materials.save('paletteEmissive', this.contentMaterial);
    // The runtime glue behind them: loaded model in, visual in the scene and a
    // Rapier body out. Nothing calls it until the first authored asset loads;
    // it is proven headlessly by check-loader against the fixture.
    this.objects = new Objects({
      scene: this.scene,
      physics: this.physics,
      materials: this.materials,
    });

    /**
     * The found assets (decision 47), through the whole proven road: fetched
     * by `ResourcesLoader`, materials swapped by the registry, and for the
     * lamps a fixed Rapier body per placement — exactly the "one load call
     * and one `addFromModel` loop" the runtime-glue session promised. Loaded
     * this early because the *island* is built from some of them: the tree
     * and bush geometries feed the prop scatter, so they have to exist before
     * `island.build()` runs, and the car is built from the buggy right after.
     *
     * The lamp is cloned per placement because `parseModel` mutates — it
     * strips the physics words and detaches the collider child — so two
     * placements of one instance would leave the second with nothing to
     * parse. The buggy parts are cloned so the loader's cached scene stays
     * pristine for any later caller.
     */
    // No trees in this list, deliberately: the found trees shipped 31 Aug and
    // were pulled the same day on Michael's call — measured against the reference author's
    // own GLBs, the reference's trees are blob-cluster canopies on thin branchy trunks,
    // a silhouette no found model had, so `Island` generates them again in
    // exactly that construction.
    const SHRUB_FILES = [
      'bush1', 'bush2', 'bush3', 'stump',
      'logPine', 'logBirch', 'logPlain', 'snagPine', 'snagOak', 'snagBirch',
    ];
    const FLORA_FILES = [
      'shroomUmbrella', 'shroomBlue', 'shroomFoliage', 'shroomGlow',
      'shroomAgaric', 'shroomCeps', 'shroomHoney', 'shroomChanterelle',
      'flowers1', 'flowers2', 'flowers3', 'grassTuft',
    ];
    const ROCK_FILES = [
      'stoneA', 'stoneB', 'stoneC', 'stoneD',
      'mossStoneA', 'mossStoneB', 'mossStoneC', 'mossStoneD',
    ];
    // The career corridor's dressing (the medieval pack, CREDITS.md). Loaded
    // whole rather than merged like the scatter geometries: areas place these
    // as individual clones through `objects.addFromModel`, so the scene graphs
    // and any physics words (the streetlight carries a collider) must survive.
    // 'bonfire' and the logs joined for the contact area's gathering spot —
    // already prepped and credited with the rest of the medieval pack.
    // 'crate' and 'haystack' joined 2 Sep for the plaza's dressing — prepped
    // and credited with the pack on 31 Aug, unused until then.
    const DRESSING_FILES = [
      'fence', 'cart', 'barrel', 'streetlight', 'bonfire', 'logPlain', 'logPine',
      'crate', 'haystack',
    ];
    const found = await this.resourcesLoader.load([
      ...['lampPost', 'carBuggy', ...SHRUB_FILES, ...FLORA_FILES, ...ROCK_FILES,
        ...DRESSING_FILES].map((name) => [name, modelUrl(name), 'gltf']),
    ]);

    // Geometry only — the scatter merges everything into one mesh under
    // `propMaterial`, so the loaded scene graphs and materials are never
    // added; the palette UVs baked by the prep tool are the whole contract.
    // A prop whose emissive parts split it into two primitives (the glow
    // shroom, the flower hearts) loads as a group of meshes, so everything
    // under the resource is merged back into one geometry.
    const geometryIn = (resource) => {
      const geometries = [];
      resource.scene.traverse((o) => { if (o.isMesh) geometries.push(o.geometry); });
      return geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    };
    const foundModels = {
      shrubs: SHRUB_FILES.map((name) => geometryIn(found[name])),
      flora: FLORA_FILES.map((name) => geometryIn(found[name])),
      rocks: ROCK_FILES.map((name) => geometryIn(found[name])),
    };

    /**
     * Cloneable dressing for the areas, keyed by name. The loader's cached
     * scenes stay pristine: every placement clones (`parseModel` mutates —
     * the same reason the lamp is cloned below).
     */
    this.props = Object.fromEntries(
      DRESSING_FILES.map((name) => [name, found[name].scene])
    );

    for (const { at, heading } of LAMP_PLACEMENTS) {
      this.objects.addFromModel(found.lampPost.scene.children[0].clone(true), {}, {
        position: [at[0], this.terrain.heightAt(at[0], at[1]), at[1]],
        rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading),
      });
    }

    // The buggy is not an `objects` entry — it is the car's visual, and the
    // car owns its body. Registry materials are swapped here since nothing
    // else will touch it.
    this.materials.updateObject(found.carBuggy.scene);
    const carVisual = {
      body: found.carBuggy.scene.children.find((o) => o.name === 'buggyBody').clone(true),
      wheel: found.carBuggy.scene.children.find((o) => o.name === 'buggyWheel').clone(true),
    };

    this.voidMaterial = makeVoidMaterial(this.reveal, { cellSize: 2.4 });
    this.waterMaterial = makeWaterMaterial({
      rain: this.rainUniform,
      time: this.ticker.elapsedUniform,
      terrain: this.terrain,
      water: this.water,
      reveal: this.reveal,
      sky: this.sky,
      // The rebuilt surface is white detail over a transparent plane (the reference's
      // construction — see makeWaterMaterial), so it needs the day cycle's
      // tint and the wind clock that scrolls the currents.
      lighting: this.lighting,
      noises: this.noises,
      wind: this.wind,
    });

    // 6. The world. The island is drawn and collided from the same height
    //    field the water reads its depth from, so there is exactly one
    //    shoreline rather than three that nearly agree.
    // The areas get their ground before the scatter runs. `SPAWN_CLEARING`
    // already keeps props out of the corridor the camera sits in; a district
    // needs the same promise, or decision 21's authored plaza floor shares its
    // ground with a randomly placed building. Measured: without this, the third
    // monolith stands 4.14 units inside the wall of one.
    this.island = new Island(this.terrain, {
      seed: 7,
      clearings: [
        ...areaDefs
          .filter((def) => def.clearing)
          .map((def) => ({ x: def.center[0], z: def.center[1], radius: def.clearing })),
        // The football pitch (3 Sep): nothing grows on it or leans over it.
        { x: PITCH.center[0], z: PITCH.center[1], radius: PITCH.clearing },
      ],
      // The roads get the clearings' promise stretched along their length: a
      // margin past the sand so nothing leans over the drivable line.
      corridors: wayfindingPlan().routes.map((route) => ({
        points: route.samples,
        halfWidth: ROAD.half + 1.2,
      })),
    });
    this.scene.add(
      this.island.build(this.contentMaterial, this.propMaterial, foundModels, {
        terrainMaterial: this.terrainMaterial,
      })
    );
    this.island.addToPhysics(this.physics);

    this.scene.add(this.water.build(this.waterMaterial));

    // The reference's grass field: one draw call of wind-blown blades wrapped around the
    // camera, density read from the terrain texture's blade channel. After
    // the island so the texture (and its painted roads) already exists.
    this.grass = new Grass(this);
    this.scene.add(this.grass.mesh);

    // The reference's leaves: a thousand on the wind, kicked up by the car (`Leaves.js`).
    this.leaves = new Leaves(this);
    this.scene.add(this.leaves.mesh);

    // The reference's wind lines: the gusts made visible (`WindLines.js`).
    this.windLines = new WindLines({ scene: this.scene, wind: this.wind });

    // Rain: the reference's falling streaks over the window (`RainLines.js`), shown by
    // the weather; the water's splashes ride the same value.
    this.rainLines = new RainLines({ scene: this.scene, lighting: this.lighting, wind: this.wind });

    // The floor that follows you past the edge of the height field, so leaving
    // the world is impossible rather than merely discouraged.
    this.bedrock = new Bedrock(this.physics);
    // Its visual half: the sea floor past the height field, in the terrain's
    // own material so the deep water's colour continues without a seam.
    this.scene.add(this.bedrock.buildFloor(this.terrainMaterial));

    this.voidGrid = new VoidGrid(this.voidMaterial, { extent: 1600, y: 0 });
    this.scene.add(this.voidGrid.mesh);

    this.car = new Car({
      physics: this.physics,
      material: this.contentMaterial,
      visual: carVisual,
      position: [0, this.terrain.heightAt(0, 0) + 2.5, 0],
    });
    this.scene.add(this.car.object);

    // One track ribbon per wheel, the reference's 0.5 thickness (`VisualVehicle.js:287`).
    this._wheelTracks = [0, 1, 2, 3].map(() => this.tracks.add(new Track(0.5)));
    this._wheelGround = new THREE.Vector3();

    this.veil = new Veil(document.getElementById('veil'));

    // The view writes the fog's distance band; see View.updateOptimalArea().
    this.view = new View(this.camera, { viewport: this.viewport, sky: this.sky });
    // The boost's screen half: the speed-lines mesh lives in the scene but
    // positions itself in clip space (View._buildSpeedLines).
    this.scene.add(this.view.speedLines.mesh);

    // The boost's world half: the reference's twin ribbon trails, amber where the reference's are
    // rainbow, anchored at the buggy's rear corners.
    /**
     * The boost exhaust: the reference's ribbon trails, two-toned. The look went
     * through the full menu on 2 Sep — faceted puffs (rejected), a
     * Rocket-League jet (rejected) — and landed back on the reference's mechanism
     * with our colours ("revert back to original but we change the color
     * scheme a bit"): amber at the nozzle running to accent-teal down
     * the tail.
     */
    this.trails = new Trails({
      scene: this.scene,
      color: new THREE.Color(PALETTE[COLOR.amber]),
      tailColor: new THREE.Color(PALETTE[COLOR.accentCool]),
    });
    this._trailItems = this.car.trailAnchors.map(() => this.trails.create());

    // The reference's confetti, for the plaza's card openings (`render/Confetti.js`).
    this.confetti = new Confetti(this);

    // The area system. After the view because `goTo` resets the camera spring.
    this.areas = new Areas(this);

    // The interact prompt. One manager, one DOM button, one active point — and
    // it is constructed after `Areas` because a beacon's eligibility is gated on
    // its owning area (`Beacons._search`).
    this.beacons = new Beacons(this);

    // The controls sheet: the launch instructions and the menu behind `H`.
    this.controls = new Controls(this);
    // The fast-travel map, behind `M` and its button.
    this.fastTravel = new FastTravel(this);

    // The first application of the mode, now that everything it writes exists.
    // `this.mode` has been `intro` since the top of this method; the `Input`
    // constructor was seeded from it because it is built long before this line,
    // and this is where the rule itself lives from here on.
    this._applyMode();

    // The content layer. After `beacons`, because opening a card suppresses the
    // prompt that opened it.
    this.card = new Card(this);

    // The areas. `register` only constructs — the geometry, the bodies and
    // the beacons are all made by `build()`, on whichever tick the car first
    // comes within `buildRadius`, so the ordering constraint here is only that
    // `beacons` and `card` exist by then. Registration is keyed by the def's
    // id, so a def without a class fails loudly instead of silently.
    const AREA_CLASSES = {
      landing: LandingArea,
      projects: ProjectsArea,
      career: CareerArea,
      contact: ContactArea,
    };
    for (const def of areaDefs) {
      const AreaClass = AREA_CLASSES[def.id];
      if (!AreaClass) throw new Error(`no area class registered for "${def.id}"`);
      this.areas.register(AreaClass, def);
    }


    // 7. The opening cinematic. It owns the reveal radius from here on, and it
    //    is the only thing that ever writes it — decision 5 deleted the
    //    distance-driven growth this used to sit next to.
    this.intro = new Intro({
      reveal: this.reveal,
      view: this.view,
      scene: this.scene,
      // The intro owns the rim pump, because the rim is the one cycle-driven
      // thing that stops existing when the cinematic ends.
      ticker: this.ticker,
      dayCycles: this.dayCycles,
      // Both of these exist only while the reveal disc is cutting a cylinder
      // through the world: the grid was the backdrop until `Sky` took the job,
      // and the underside is what stops you seeing through the cut.
      scaffolding: [this.voidGrid, this.island.underside],
      onDone: () => {
        this.voidGrid = null;
        this._resolveIntroDone();
      },
    });

    /**
     * Short static labels on in-world surfaces. `D` §6.8 asks for this as
     * `game.textPlate`, and it is the only piece of the reference's `TextCanvas` worth
     * porting — prose belongs in the card.
     *
     * A material per plate, unavoidably: the mask is the text, so two different
     * strings cannot share one. The reference's `createMaterialOnMesh` does the same. It is
     * one extra draw call per label, which is the price of type on a surface.
     */
    this.textPlate = ({ text, width, height, fontSize, colorIndex, lineHeight }) =>
      makeTextPlate({
        text,
        width,
        height,
        fontSize,
        lineHeight,
        material: (map) =>
          makeTextMaterial({
            map,
            colorIndex,
            reveal: this.reveal,
            lighting: this.lighting,
            sky: this.sky,
            // Every in-world label is ALWAYS-emissive — the reference's treatment, and
            // Michael's call (1 Sep: "yes i want it to glow at all hours"):
            // the plaza titles and the landing decals join the career and
            // contact cards at the same 1.5, neon at noon like the reference's world.
            emissive: 1.5,
          }),
      });

    // 8. Compile everything while the loader is still up.
    //
    // The font goes first and is awaited: `fillText` does not wait for a
    // webfont, so a plate drawn before the face arrives is baked in the
    // fallback and never redrawn. See `loadDisplayFont` — it times out rather
    // than holding the boot hostage to a CDN.
    await loadDisplayFont();

    /**
     * The letter font, for the landing's drivable name — the reference's letters, our
     * glyphs. Fetched rather than bundled (62 KB of JSON has no business in
     * the JS chunk), parsed once, and allowed to fail: the landing keeps
     * its flat-decal fallback, so a blocked fetch costs the toy, not the
     * name. Loaded before the ticker starts because `build()` is sync.
     */
    this.letterFont = null;
    try {
      // Regular weight, not bold — the bold name read as a wall of ink
      // (Michael, 2 Sep: "the michael yeh is too heavy").
      const json = await (await fetch(staticUrl('fonts/helvetiker_regular.typeface.json'))).json();
      this.letterFont = new FontLoader().parse(json);
    } catch {
      console.warn('[landing] letter font failed to load; the name falls back to a ground decal');
    }

    /**
     * The wayfinding layer — roads and signposts, world-level: a signpost's
     * whole job is standing there before you know the district exists, so it
     * cannot ride any area's lazy build. After `loadDisplayFont`, because the
     * post rows are baked canvas type; before `warmup`, so their materials
     * compile behind the loader with everything else's.
     */
    this.wayfinding = new Wayfinding(this);
    this.scene.add(this.wayfinding.build());

    // The football pitch (3 Sep, Michael: "a soccer ball and goal near top
    // left of the map"): world-level like the signposts, through
    // `objects.add`, so the ball is a body from the first frame.
    this.pitch = new Pitch(this);
    this.pitch.build();

    // The tracks target is drawn once before anything samples it, so the
    // warm-up compiles the ground against a real (black) texture rather than
    // an unrendered one.
    this.tracks.follow(this.car.position.x, this.car.position.z);
    this.tracks.render(this.renderer.renderer);

    await this.renderer.warmup();

    this._bindTicks();
    this._bindActions();
    this.ticker.start();

    return this;
  }

  _bindTicks() {
    const { ticker } = this;

    ticker.on(
      'tick',
      (delta) => {
        this.viewport.sample(delta);
        updateTweens(delta);
      },
      TICK.INPUT
    );

    ticker.on(
      'tick',
      () => {
        // Locked while the veil is covering a respawn, and whenever something
        // other than the driver has the controls — which now includes the
        // opening cinematic, because `mode` starts at `intro`. Fed a zeroed
        // input rather than skipped, so the idle brake still runs and the car
        // sits still instead of coasting — the reference's `Player.updatePrePhysics` zeroes
        // the same four values when the player state is locked
        // (`Player.js:524-530`).
        //
        // Was `!this.car.drowning`, then `this.intro.playable && … && mode`.
        // Drowning is gone (decision 43 reversed) and the intro term is now
        // carried by the mode, so the lock is two facts rather than three: the
        // controls are somewhere else, or a teleport is in flight.
        const playable = this.mode === 'driving' && !this._respawning;
        this.car.control(playable ? this.input : IDLE_INPUT);

        // Before the step, so the slab is under the car for the step that needs
        // it rather than one frame late.
        this.bedrock.follow(this.car.position);
      },
      TICK.PRE_PHYSICS
    );

    ticker.on(
      'tick',
      (delta) => {
        this.physics.step(delta);
      },
      TICK.PHYSICS
    );

    ticker.on(
      'tick',
      (delta, elapsed) => {
        this.car.syncVisual(delta);
        this.objects.syncVisuals();
        this.car.updateStuck(elapsed);
        this.car.updateFlip(elapsed);
        this.car.updateWater(delta, this.terrain);
        this._updateStuckHint();

        // The boost trails, after the visual has its interpolated pose. The reference's
        // trigger verbatim (`VisualVehicle.js:521`): going forward, boosting,
        // on the throttle — no speed threshold, unlike the screen lines, so
        // the streaks ignite the moment the boost does.
        const trailAlpha =
          this.car.boosting && this.car.accelerating > 0 && this.car.speed > 0 ? 1 : 0;
        for (let i = 0; i < this._trailItems.length; i++) {
          const item = this._trailItems[i];
          this.car.trailAnchors[i].getWorldPosition(item.position);
          item.alpha = trailAlpha;
        }
        this.trails.update(delta);

        // The wheel tracks, fed from the suspension rays' ground hits — the reference's
        // `groundTrack.update(contactPoint, inContact)` per wheel.
        for (let i = 0; i < 4; i++) {
          const touching = this.car.wheelGround(i, this._wheelGround);
          this._wheelTracks[i].update(this._wheelGround, touching, elapsed);
        }
      },
      TICK.POST_PHYSICS
    );

    // The tracks window renders after everything has moved and before the
    // main pass reads it — the reference's tick order 9 (tracks) before 10 (terrain).
    ticker.on(
      'tick',
      () => {
        this.tracks.follow(this.car.position.x, this.car.position.z);
        this.tracks.render(this.renderer.renderer);
      },
      TICK.RENDER - 1
    );

    ticker.on(
      'tick',
      (_delta, elapsed) => {
        this.dayCycles.update();
        this.yearCycles.update();
        this.weather.update(elapsed);
        this._applyCycles();
      },
      TICK.CYCLES
    );

    ticker.on(
      'tick',
      () => {
        this.lighting.follow(this.car.position);
      },
      TICK.GAMEPLAY
    );

    ticker.on(
      'tick',
      (delta, elapsed) => {
        this.view.update(delta, this.car);
        // The sea follows what the camera is looking at, which is what makes it
        // infinite rather than merely large.
        const focus = this.view.focusPoint.position;
        this.water.follow(focus.x, focus.z);
        this.grass.follow(focus.x, focus.z);
        this.bedrock.followFloor(focus.x, focus.z);
        this.leaves.update(delta, focus);
        this.windLines.update(elapsed, focus);
        this.rainLines.update(delta, this.weather.rain.value, focus);
      },
      TICK.CAMERA
    );

    ticker.on(
      'tick',
      () => {
        this.renderer.render();
      },
      TICK.RENDER
    );
  }

  /**
   * Copy the day cycle out into the uniforms that read it.
   *
   * Five destinations, nine properties: the two ends of the sky ramp and the two
   * fog ratios go to `Sky`, the light colour, its intensity and the shadow tint
   * go to `Lighting`, and the rim's colour and intensity are pumped by `Intro`
   * because they are the only pair that stops mattering (see its `destroy()`).
   *
   * The year cycle has no destination at all yet, and that is deliberate — it
   * carries five scalars for foliage, rain and wind, all of which are Phase 3.
   */
  _applyCycles() {
    this.sky.applyCycle(this.dayCycles);
    this.lighting.applyCycle(this.dayCycles);
    // Rain darkens the day: a third of the light at full rain, after the
    // cycle has written its own level, so a shower reads as weather and not
    // as dusk. Ours — the reference's clouds live in the reference's sky.
    const rain = this.weather.rain.value;
    this.lighting.intensityUniform.value *= 1 - 0.3 * rain;
    this.rainUniform.value = rain;
    // The emissive layer and the headlights, faded by the same clock that
    // colours the sky. Guarded: the first application runs at construction,
    // before the car exists; the beam parks underground until it does.
    this.night.update(this.dayCycles.progress, this.car?.object ?? null);
  }

  /**
   * Decision 43's second half: past the shelf you fade out and come back at the
   * nearest spawn point.
   *
   * The reference's build has no equivalent — there is no depth threshold anywhere in it,
   * and driving into the reference's sea simply means driving slowly forever
   * (`ROADMAP.md` → *The instrumented A/B*). What is the reference's is the shape of the
   * recovery: the teleport happens inside the cover, and the destination is the
   * nearest authored point rather than wherever you happen to be
   * (`Player.js:471-487`, and `KNOWN-ISSUES.md` 15).
   */
  /**
   * Stand the car on the island's first spawn, facing something worth driving to.
   *
   * **The default start was never actually authored.** The car was constructed at
   * `[0, heightAt(0,0) + 2.5, 0]` and fell, so where you began was a side effect
   * of the constructor rather than a decision, and it faced +Z for no reason. The reference's
   * is a real respawn point out of `Respawns`, and the first thing the reference's camera
   * shows you is somewhere to go.
   *
   * The heading points at the projects plaza. That matters more than it sounds:
   * with a fixed 45-degree camera you cannot look around, so if the destination
   * is not in the opening frame the world reads as empty in the one moment that
   * decides whether anybody drives at all. Michael, 20 Aug: *"i think projects
   * section can be somewhere we drive to, more similar to the reference's layout."* It always
   * was — the spawn is at the origin and the plaza is 33 units away — but the
   * `?at=projects` link used for testing skipped the drive every time.
   */
  placeAtStart() {
    const spawn = this.island.spawns[0] ?? { x: 0, z: 0, heading: 0 };
    const projects = this.areas.get('projects');
    const heading = projects
      ? Math.atan2(projects.center.x - spawn.x, projects.center.z - spawn.z)
      : spawn.heading;

    this.car.respawn(
      { x: spawn.x, y: this.terrain.heightAt(spawn.x, spawn.z), z: spawn.z },
      heading
    );
    this.view.reset(this.car.position);
    this.reveal.setCenter(this.car.position.x, this.car.position.z);
  }

  /**
   * Offer the way out when the car is wedged, and take it away when it is not.
   *
   * **The reference's flow, not an invention:** `PhysicsVehicle` emits `stuck`, and
   * `Player.setUnstuck` responds by adding an `unstuck` *button* —
   * `inputs.interactiveButtons.addItems(['unstuck'])` — which calls
   * `respawn()` only if the player presses it. **The reference author never teleports anyone
   * automatically**, and neither do we: an automatic rescue fires on someone
   * who has parked to read a board.
   *
   * Reuses `#hint`, which the intro has finished with long before this can
   * fire — `main.js` fades it 6 s after control unlocks and the stuck test
   * needs 3 s of not moving on top of that.
   */
  _updateStuckHint() {
    const stuck = this.car.stuck && this.mode === 'driving' && !this._respawning;
    if (stuck === this._stuckHint) return;
    this._stuckHint = stuck;

    const el = document.getElementById('hint');
    if (!el) return;

    if (stuck) {
      el.textContent = 'Stuck? Press R to get back on the road';
      el.hidden = false;
      // Next frame, or the transition has nothing to animate from.
      requestAnimationFrame(() => el.classList.remove('is-fading'));
    } else {
      el.classList.add('is-fading');
    }
  }

  /**
   * Put the car back on land. **Was `_drown()`**; nothing drowns any more, and
   * this is now only ever reached deliberately — the `respawn` action, or a
   * player who is stuck and takes the offer.
   */
  _recover() {
    if (this._respawning) return;
    this._respawning = true;

    const p = this.car.position;
    const spawn = this.island.closestSpawn(p.x, p.z);
    this.veil.cover(() => {
      this.car.respawn(
        { x: spawn.x, y: this.terrain.heightAt(spawn.x, spawn.z), z: spawn.z },
        spawn.heading
      );
      this.view.reset(this.car.position);
      this._respawning = false;
    });
  }

  _bindActions() {
    this.input.on('action', (name, value) => {
      if (name !== 'respawn' || !value) return;
      // The manual control gets the same treatment, for the same reason: the
      // camera spring cannot filter a teleport and should not have to.
      this._recover();
    });
  }

  /**
   * Hand the controls to something else, or take them back.
   *
   * The `_onBlur()` call is the whole reason this is a method rather than an
   * assignment. Opening a card while the throttle is held would otherwise leave
   * `actions.forward` at 1 with no keyup ever coming — the driver's finger comes
   * off the key at some point, but the card had focus by then and the event went
   * somewhere else. It is the same stuck-throttle `Input._onBlur` already guards
   * for on tab-switch, reached for deliberately: duplicating the clearing here
   * would be one more place to forget a key.
   *
   * The filter set is not a second copy of the `PRE_PHYSICS` gate. That gate
   * stops the car reading input; the filters stop the *browser* being robbed of
   * it — without them, `Input`'s `preventDefault` on the arrow keys means a long
   * card body cannot be scrolled with the keyboard, and `R` still respawns the
   * car behind a panel the visitor is reading. **The mode is the only writer**:
   * one string decides which actions are live, whether the car reads them, and
   * whether the interact prompt is on screen.
   *
   * The prompt moves with the mode for the same reason the keys do. It used to
   * be `Card`'s job — `beacons.suppress(true)` beside `setMode('card')` — which
   * covered the card and nothing else, so the "Aerial Ascent" pill sat on screen
   * through the whole opening cinematic on any `?at=projects` load. Measured:
   * `beacon.hidden` false with `intro.playable` false. Suppression is a
   * consequence of not being in control, and there is exactly one place that
   * knows whether we are.
   *
   * @param {'intro'|'driving'|'card'|'cinematic'} mode
   */
  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this._applyMode();
    this.input._onBlur();
  }

  /**
   * Everything the mode decides, in one place, so the boot and every later
   * transition run the same two lines rather than two copies of the same
   * predicate. Called once at the end of construction and once per `setMode`.
   */
  _applyMode() {
    this.input.setFilters([this.mode]);
    this.beacons.suppress(this.mode !== 'driving');
  }

  /**
   * Run the opening cinematic. Resolves when the car becomes drivable, which is
   * two seconds before the cinematic finishes — see the note in `Intro`.
   *
   * The mode flip happens **here**, on the same frame `Intro` reaches step 1 and
   * before the promise resolves, so the world unlocks in one place rather than
   * in `main.js` a microtask later.
   */
  playIntro() {
    return new Promise((resolve) => {
      this.intro.onPlayable = () => {
        this.setMode('driving');
        resolve();
      };
      this.intro.start();
    });
  }

  /**
   * Resolves when the cinematic has finished — about two seconds *after*
   * `playIntro()`, which resolves at the moment control unlocks rather than at
   * the end of the reveal.
   *
   * The one caller is the `&p=` deep link, which opens a card on arrival and
   * should not do it over the top of a disc that is still flying outwards. The
   * card is a right-hand panel over a 55 % scrim, so the world stays visible
   * behind it — which is precisely why interrupting the reveal halfway would
   * read as the world having stopped arriving rather than as a card opening.
   */
  whenIntroDone() {
    return this._introDone;
  }
}
