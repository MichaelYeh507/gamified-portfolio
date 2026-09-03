import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLOR, paint, paletteU } from '../render/palette.js';
import { pitchPlan, ballLost, GOAL, BALL, RESET } from './pitchPlan.js';

/**
 * The football pitch: a goal and a ball, both code-built (decision 47's
 * `paint()` side — a goal is bars and a ball is a sphere, and neither earns
 * a found asset). Sited by `pitchPlan`.
 *
 *   - **The goal** is white posts, a crossbar, a back frame and a net of
 *     thin cords, merged into one mesh on the content material; its body is
 *     fixed, with cuboid colliders for the posts and the bar and thin ones
 *     for the back, the sides and the roof, so a ball that goes in stays in
 *     and a car that drives in meets the net.
 *   - **The ball** is an icosahedron painted white with the palette's black
 *     on the faces around its twelve original vertices — the pentagons of a
 *     football, near enough at this size — on a dynamic ball collider born
 *     asleep, the same `objects.add` road as the letters and the crates. Its
 *     numbers are ours (`BALL`): light enough for the bumper to loft, damped
 *     enough to roll to a stop rather than wander into the sea.
 *
 *   - **The reset** (`update`): a ball that is in the water or off the map
 *     for `RESET.seconds` comes back to the centre spot, still — the rule is
 *     `pitchPlan.ballLost`, and the wait is what lets a ball skip a ford.
 *     R stays the car's.
 *
 * Not built: a score, a second goal.
 */
export default class Pitch {
  constructor(game) {
    this.game = game;
    this.plan = pitchPlan();
    this.goal = null;
    this.ball = null;
    /** Seconds the ball has been lost for. */
    this._lostFor = 0;
    /** How many times it has come back (read by probes). */
    this.resets = 0;
  }

  /** Once per tick after the physics step. */
  update(delta) {
    const body = this.ball?.physical?.body;
    if (!body) return;
    // Sleeping or not: a ball that has stopped in the water is not coming
    // back on its own, and one height lookup a tick is nothing.
    const t = body.translation();
    if (ballLost(t, this.game.terrain.heightAt(t.x, t.z))) {
      this._lostFor += delta;
      if (this._lostFor >= RESET.seconds) this.reset();
    } else {
      this._lostFor = 0;
    }
  }

  /** Back to the centre spot, upright and still. */
  reset() {
    const body = this.ball?.physical?.body;
    if (!body) return;
    const { ball } = this.plan;
    const ground = this.game.terrain.heightAt(ball.x, ball.z);
    body.setTranslation({ x: ball.x, y: ground + BALL.radius + 0.02, z: ball.z }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this._lostFor = 0;
    this.resets++;
  }

  build() {
    this._buildGoal();
    this._buildBall();
  }

  _buildGoal() {
    const { goal } = this.plan;
    const { width, height, depth, post, cord, mesh } = GOAL;
    const hw = width / 2;
    const parts = [];
    const colliders = [];

    const bar = (w, h, d, x, y, z, solid = false) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      paint(g, COLOR.white);
      parts.push(g);
      if (solid) colliders.push({ shape: 'cuboid', parameters: [w / 2, h / 2, d / 2], position: [x, y, z] });
    };

    // Frame: two posts, the crossbar, the back frame and the ground bars.
    bar(post, height, post, -hw, height / 2, 0, true);
    bar(post, height, post, hw, height / 2, 0, true);
    bar(width + post, post, post, 0, height - post / 2, 0, true);
    bar(post, height, post, -hw, height / 2, -depth);
    bar(post, height, post, hw, height / 2, -depth);
    bar(width + post, post, post, 0, height - post / 2, -depth);
    bar(post, post, depth, -hw, height - post / 2, -depth / 2);
    bar(post, post, depth, hw, height - post / 2, -depth / 2);
    bar(post, post, depth, -hw, post / 2, -depth / 2);
    bar(post, post, depth, hw, post / 2, -depth / 2);
    bar(width + post, post, post, 0, post / 2, -depth);

    // The net: cords on the back, the two sides and the roof.
    for (let x = -hw + mesh; x < hw; x += mesh) {
      bar(cord, height, cord, x, height / 2, -depth); // back, vertical
      bar(cord, cord, depth, x, height - cord / 2, -depth / 2); // roof, along
    }
    for (let y = mesh; y < height; y += mesh) {
      bar(width, cord, cord, 0, y, -depth); // back, horizontal
      bar(cord, cord, depth, -hw, y, -depth / 2); // sides, along
      bar(cord, cord, depth, hw, y, -depth / 2);
    }
    for (let z = -mesh; z > -depth; z -= mesh) {
      bar(cord, height, cord, -hw, height / 2, z); // sides, vertical
      bar(cord, height, cord, hw, height / 2, z);
      bar(width, cord, cord, 0, height - cord / 2, z); // roof, across
    }

    // What the net stops: thin walls where the cords are.
    const skin = 0.04;
    colliders.push(
      { shape: 'cuboid', parameters: [hw + post / 2, height / 2, skin], position: [0, height / 2, -depth] },
      { shape: 'cuboid', parameters: [skin, height / 2, depth / 2], position: [-hw, height / 2, -depth / 2] },
      { shape: 'cuboid', parameters: [skin, height / 2, depth / 2], position: [hw, height / 2, -depth / 2] },
      { shape: 'cuboid', parameters: [hw + post / 2, skin, depth / 2], position: [0, height, -depth / 2] }
    );

    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    const model = new THREE.Mesh(merged, this.game.contentMaterial);
    model.name = 'goal';

    const ground = this.game.terrain.heightAt(goal.x, goal.z);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), goal.heading);
    this.goal = this.game.objects.add(
      { model, updateMaterials: false },
      {
        type: 'fixed',
        position: [goal.x, ground, goal.z],
        rotation,
        friction: 0.4,
        restitution: 0.3,
        colliders,
      }
    );
  }

  _buildBall() {
    const { ball } = this.plan;
    const r = BALL.radius;
    const geometry = new THREE.IcosahedronGeometry(r, 2);
    paint(geometry, COLOR.white);

    // The pentagons: the twelve vertices of the base icosahedron are the
    // patch centres; every face whose centroid lies within ~20° of one is
    // black. Read off a detail-0 icosahedron so the axes are exact.
    const base = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
    const axes = [];
    for (let i = 0; i < base.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(base, i).normalize();
      if (!axes.some((a) => a.distanceTo(v) < 1e-4)) axes.push(v);
    }
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const blackU = paletteU(COLOR.black);
    const centroid = new THREE.Vector3();
    const cosLimit = Math.cos(0.36);
    for (let f = 0; f < position.count; f += 3) {
      centroid.set(0, 0, 0);
      for (let k = 0; k < 3; k++) centroid.add(new THREE.Vector3().fromBufferAttribute(position, f + k));
      centroid.normalize();
      if (axes.some((a) => a.dot(centroid) > cosLimit)) {
        for (let k = 0; k < 3; k++) uv.setX(f + k, blackU);
      }
    }
    uv.needsUpdate = true;

    const model = new THREE.Mesh(geometry, this.game.contentMaterial);
    model.name = 'ball';
    const ground = this.game.terrain.heightAt(ball.x, ball.z);
    this.ball = this.game.objects.add(
      { model, updateMaterials: false },
      {
        type: 'dynamic',
        position: [ball.x, ground + r + 0.02, ball.z],
        mass: BALL.mass,
        friction: BALL.friction,
        restitution: BALL.restitution,
        linearDamping: BALL.linearDamping,
        angularDamping: BALL.angularDamping,
        sleeping: true,
        colliders: [{ shape: 'ball', parameters: [r] }],
      }
    );
  }
}
