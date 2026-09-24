// Live lab: the game's own horde modules (library, animator, material) on a
// test floor, with deterministic stepping for screenshots. Not bundled.
import * as T from "three";
import {
  prepareHorde,
  hordeModel,
  hordeLoseLegs,
  destroyHordeHead,
} from "../../src/horde/library.js";
import { animateHorde, animateHordeDeath } from "../../src/horde/animator.js";
import { ENEMIES } from "../../src/content/enemies.js";

const params = new URLSearchParams(location.search);
const renderer = new T.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new T.Scene();
scene.background = new T.Color(0x10151a);
scene.fog = new T.Fog(0x10151a, 12, 40);
const camera = new T.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
scene.add(new T.HemisphereLight(0x9fb4c8, 0x2b241f, 0.9));
const key = new T.DirectionalLight(0xffe2c4, 2.4);
key.position.set(-4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {
  left: -10,
  right: 10,
  top: 10,
  bottom: -10,
});
scene.add(key, key.target);
const rim = new T.DirectionalLight(0x7f9bb5, 1.6);
rim.position.set(3, 3, -5);
scene.add(rim);
const floor = new T.Mesh(
  new T.PlaneGeometry(80, 80),
  new T.MeshStandardMaterial({ color: 0x32383b, roughness: 0.92 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new T.GridHelper(80, 80, 0x444c52, 0x394046);
grid.position.y = 0.002;
scene.add(grid);

const actors = [];
let clock = 0;

function spawn({
  type = "walker",
  id = 1,
  x = 0,
  z = 0,
  yaw = 0,
  speed,
  emerge = false,
  detail = "full",
}) {
  const model = hordeModel(type, detail, id);
  if (!model) throw new Error(`no horde body for ${type}`);
  model.position.set(x, emerge ? -1.15 : 0, z);
  model.rotation.y = yaw;
  model.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });
  scene.add(model);
  const actor = {
    id,
    type,
    model,
    speed: speed ?? ENEMIES[type].speed,
    motion: { action: "none" },
    action: null,
    dead: false,
    enemy: { model, id, type, dead: false },
  };
  actors.push(actor);
  return actor;
}

/** Advance the simulation by dt seconds in `steps` fixed steps. */
function step(seconds, { steps, move = true } = {}) {
  const n = steps ?? Math.max(1, Math.round(seconds * 60));
  const dt = seconds / n;
  for (let i = 0; i < n; i++) {
    clock += dt;
    for (const a of actors) {
      const m = a.model;
      if (a.dead) {
        animateHordeDeath(a.enemy, dt);
        continue;
      }
      if (m.position.y < 0) {
        m.position.y = Math.min(0, m.position.y + dt * (1.15 / (1.35 * 0.85)));
        animateHorde(m, clock, 0, false, 0, {
          dt,
          velocityX: 0,
          velocityZ: 0,
          clock,
          isGrounded: false,
          targetYaw: m.rotation.y,
          expectedSpeed: a.speed,
          action: "none",
        });
        continue;
      }
      let vx = 0,
        vz = 0;
      const act = a.action;
      if (act) {
        const phase = (clock - act.start) / act.duration;
        if (phase >= 1) a.action = null;
        else {
          Object.assign(a.motion, {
            action: act.kind,
            actionPhase: phase,
            actionContact: act.contact,
            actionDuration: act.duration,
            actionSide: act.side,
            actionSequence: act.sequence,
          });
        }
      }
      if (!a.action) a.motion.action = "none";
      if (move && !a.action && !(clock < (a.fallUntil || 0))) {
        vx = Math.sin(m.rotation.y) * a.speed;
        vz = Math.cos(m.rotation.y) * a.speed;
        m.position.x += vx * dt;
        m.position.z += vz * dt;
      }
      Object.assign(a.motion, {
        dt,
        velocityX: vx,
        velocityZ: vz,
        clock,
        isGrounded: true,
        targetYaw: a.lookYaw ?? m.rotation.y,
        expectedSpeed: a.speed,
      });
      animateHorde(m, clock, 0, !!a.action, 0, a.motion);
    }
  }
}

function attack(
  actor,
  {
    kind = "melee",
    duration = 1.15,
    contact = 0.38,
    side = -1,
    sequence = 1,
  } = {},
) {
  actor.action = { kind, start: clock, duration, contact, side, sequence };
}

function hit(
  actor,
  { head = false, strength = 0.8, side = 1, heavy = false, push = 1 } = {},
) {
  const r = (actor.model.userData.hitReaction ||= { serial: 0 });
  r.serial++;
  Object.assign(r, { head, strength, side, heavy, push });
}

/** Blow the lower legs off: the actor falls, then crawls at `speed`. */
function cripple(actor, speed = 0.44) {
  hordeLoseLegs(actor.model);
  actor.speed = speed;
  actor.fallUntil = clock + 1.0;
}

function kill(actor) {
  actor.dead = true;
  actor.enemy.dead = true;
}

function view({
  target = [0, 1, 0],
  distance = 4,
  yaw = 0.6,
  height = 1.4,
  fov = 50,
} = {}) {
  camera.fov = fov;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  camera.position.set(
    target[0] + Math.sin(yaw) * distance,
    height,
    target[2] + Math.cos(yaw) * distance,
  );
  camera.lookAt(target[0], target[1], target[2]);
  renderer.render(scene, camera);
}

function follow(actor, opts = {}) {
  const p = actor.model.position;
  view({ ...opts, target: [p.x, opts.targetY ?? 1.0, p.z] });
}

function clear() {
  for (const a of actors) scene.remove(a.model);
  actors.length = 0;
}

window.live = {
  ready: false,
  spawn,
  step,
  attack,
  hit,
  kill,
  cripple,
  behead: (actor) => destroyHordeHead(actor.model),
  view,
  follow,
  clear,
  actors,
  scene,
  camera,
  renderer,
  T,
};
prepareHorde(params.has("mobile"))
  .then(() => {
    window.live.ready = true;
  })
  .catch((e) => {
    window.live.error = String(e.stack || e);
  });
import { solveLeg } from "../../src/horde/animator.js";
window.live.solveLeg = solveLeg;
