import Events from '../../core/Events.js';
import { TICK } from '../../core/Ticker.js';

/**
 * The registry, and the whole of area routing.
 *
 * One squared-distance test per area per frame. With six areas that is six
 * compares and no square roots — genuinely free, and it replaces routing entirely.
 * There is no spatial index, no zone graph and no scene-graph traversal, because
 * at six places any of those would cost more than the thing they optimise.
 *
 * `D` §6.3, with the emitter changed and one section deleted:
 *
 * **It emits on itself** rather than through a `game.events` bus. `Game` has no
 * emitter and does not need one — `Ticker` and `Input` each own theirs, which is
 * the pattern here, and a subsystem-owned emitter means a listener cannot
 * accidentally depend on a global that outlives what it is listening to.
 *
 * **`goTo()` no longer touches the reveal**, and this is a correction rather than
 * a simplification. The report has it growing the reveal disc to contain the
 * destination "or the visitor lands inside an invisible area", which was true of
 * the world that grew as you drove. Decision 5 deleted that: the world is whole
 * from the moment the intro ends, `Reveal.radius` sits at 1e5 and nothing ever
 * writes it again, and `reveal.growTo` / `game.growthTarget` do not exist. Fast
 * travel is now a respawn and nothing else.
 */
export default class Areas extends Events {
  constructor(game) {
    super();
    this.game = game;

    /** @type {Map<string, import('./Area.js').default>} */
    this.items = new Map();
    /** The area the car is inside, or null. Areas do not overlap. */
    this.current = null;

    this._offTick = game.ticker.on(
      'tick',
      (delta, elapsed) => this.update(delta, elapsed),
      TICK.GAMEPLAY
    );
  }

  /**
   * @param {typeof import('./Area.js').default} AreaClass
   * @param {object} def see `Area`'s constructor
   */
  register(AreaClass, def) {
    if (this.items.has(def.id)) throw new Error(`area id "${def.id}" is already registered`);
    const area = new AreaClass(this.game, def);
    this.items.set(area.id, area);
    this.game.scene.add(area.group);
    return area;
  }

  get(id) {
    return this.items.get(id) ?? null;
  }

  update(delta, elapsed) {
    const position = this.game.car.position;

    for (const area of this.items.values()) {
      const distanceSq = area.distanceSq(position);

      // 1. Lazy build, once, before arrival.
      if (!area.isBuilt && distanceSq < area.buildRadius * area.buildRadius) {
        this._build(area);
      }

      if (!area.isBuilt) continue;

      // 2. Enter / leave.
      const inside = distanceSq < area.radius * area.radius;
      if (inside && !area.isIn) {
        area.isIn = true;
        this.current = area;
        area.enter();
        this.emit('enter', area);
      } else if (!inside && area.isIn) {
        area.isIn = false;
        if (this.current === area) this.current = null;
        area.leave();
        this.emit('leave', area);
      }

      // 3. Per-frame work only while inside.
      if (area.isIn) area.update(delta, elapsed);
    }
  }

  /**
   * Build now, whatever the distance.
   *
   * A throwing `build()` must not take the frame with it — it runs inside the
   * tick, so an exception here would abort every subsystem after `TICK.GAMEPLAY`
   * including the render, and the symptom would be a frozen picture rather than a
   * broken area. The area is marked built either way, so a broken one fails once
   * and visibly instead of every frame forever.
   */
  _build(area) {
    area.isBuilt = true;
    try {
      area.build();
      area.group.visible = true;
    } catch (error) {
      console.error(`[areas] "${area.id}" failed to build`, error);
    }
  }

  /**
   * Deep links (`?at=<id>&p=<target>`) and the fast-travel map both land here.
   *
   * The build is forced first because we are about to be standing in it, and one
   * frame of an empty plaza is exactly the thing lazy building is supposed to
   * hide. It also has to happen before `spawnFor`, which is allowed to read
   * whatever `build()` produced — the monolith it names does not exist until it
   * has run.
   *
   * A `target` this area does not recognise falls back to the area spawn rather
   * than failing. A stale or mistyped link should land you in the right district
   * with no card, which is a mild disappointment; refusing the whole link would
   * drop you at the island's default spawn instead, which looks like the link
   * was for a different site.
   *
   * @param {string} id
   * @param {string|null} [target] the `&p=` half
   */
  goTo(id, target = null) {
    const area = this.items.get(id);
    if (!area) return false;

    if (!area.isBuilt) this._build(area);

    const place = area.spawnFor(target) ?? {
      x: area.spawn[0],
      z: area.spawn[1],
      heading: area.heading,
    };

    // `respawn` lifts by 3 and zeroes the velocities itself; hand it the ground.
    this.game.car.respawn(
      { x: place.x, y: this.game.terrain.heightAt(place.x, place.z), z: place.z },
      place.heading
    );
    // The camera spring cannot filter a teleport and should not have to — the
    // same reason `Game._drown` resets it (`KNOWN-ISSUES.md` 15).
    this.game.view.reset(this.game.car.position);
    return true;
  }

  dispose() {
    this._offTick?.();
    this.clear();
  }
}
