// Armory lab: the game's ViewModel under the game's first-person lighting,
// for visual iteration: a Playwright page drives `window.lab` (setWeapon,
// patch, scrub, view, render) and takes screenshots.
// Served by Vite: /scripts/armory/lab.html?w=vigil
import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ViewModel } from "/src/armory/viewmodel.js";
import { ViewEffects } from "/src/armory/effects.js";
import { RIGS } from "/src/armory/catalog.js";
import { createFitter } from "./grip-fit.js";

const params = new URLSearchParams(location.search);
const renderer = new T.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
document.body.appendChild(renderer.domElement);
const scene = new T.Scene();
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.68;
const camera = new T.PerspectiveCamera(62, innerWidth / innerHeight, 0.01, 10);
scene.add(new T.HemisphereLight(0xc4dae7, 0x242929, 1.35));
const key = new T.DirectionalLight(0xdce7ea, 2.1);
key.position.set(-2, 3, -1);
scene.add(key);
const rim = new T.DirectionalLight(0x779ea8, 1.5);
rim.position.set(2, 0, 1);
scene.add(rim);
const bounce = new T.PointLight(0xffbb77, 1.2, 5, 1.5);
bounce.position.set(-0.7, 0.2, -1.3);
scene.add(bounce);
const backdrop = params.get("bg");
if (backdrop)
  new T.TextureLoader().load(backdrop, (t) => {
    t.colorSpace = T.SRGBColorSpace;
    scene.background = t;
  });
else scene.background = new T.Color(0x151b1f);

const deepAssign = (target, patch) => {
  for (const [k, v] of Object.entries(patch || {})) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      target[k] &&
      typeof target[k] === "object"
    )
      deepAssign(target[k], v);
    else target[k] = v;
  }
  return target;
};

const vm = new ViewModel(scene, { mobile: false });
const effects = new ViewEffects(vm.root, false);
const lab = {
  vm,
  effects,
  id: null,
  time: 0,
  state: {
    aim: false,
    sprint: false,
    crouch: false,
    speed: 0,
    strafe: 0,
    stepRate: 2.1,
    grounded: true,
    landed: 0,
    lookX: 0,
    lookY: 0,
    lowered: 0,
    hidden: false,
    shake: true,
    melee: null,
  },
  async setWeapon(id, camo = 0) {
    await vm.prepare();
    await vm.load(id, camo);
    vm.show(id, camo);
    lab.id = id;
    lab.settle();
    return lab.info();
  },
  /** Patch the live catalog entry (the view model reads it every frame). */
  patch(patch) {
    deepAssign(RIGS[lab.id], patch);
  },
  step(dt = 1 / 60) {
    lab.time += dt;
    vm.update({ ...lab.state, dt, time: lab.time });
    effects.update(dt, vm.socket("muzzle"));
  },
  settle(seconds = 1.2) {
    for (let t = 0; t < seconds; t += 1 / 60) lab.step(1 / 60);
  },
  /** Freeze an action at normalized time t (springs settled). */
  scrub(name, t, duration = 1.5) {
    vm.play(name, duration);
    const frames = 30;
    for (let i = 0; i < frames; i++) {
      vm.action.t = Math.max(0, t - ((frames - i) / frames) * 0.08);
      lab.step(1 / 240);
    }
    if (vm.action) vm.action.t = t;
    vm.update({ ...lab.state, dt: 1e-4, time: lab.time });
  },
  render() {
    renderer.render(scene, camera);
  },
  /** Camera: fp (the eye), fpz (zoomed eye), w-* around the weapon, rig-* around the body. */
  view(name = "fp") {
    camera.fov = 62;
    camera.up.set(0, 1, 0);
    const w = vm.weapon;
    w.updateMatrixWorld(true);
    if (name === "fp") {
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
    } else if (name === "fpz") {
      camera.position.set(0, 0, 0);
      camera.fov = 26;
      camera.updateProjectionMatrix();
      camera.lookAt(w.localToWorld(new T.Vector3(0, -0.04, 0.02)));
    } else if (name.startsWith("w-")) {
      const dir = {
        "w-left": [-1, 0.15, 0],
        "w-right": [1, 0.15, 0],
        "w-front": [0.25, 0.1, -1],
        "w-below": [0.2, -1, 0.15],
        "w-back": [0.15, 0.35, 1],
        "w-top": [0.05, 1, 0.1],
      }[name];
      const center = w.localToWorld(new T.Vector3(0, -0.045, 0.03));
      const offset = new T.Vector3(...dir)
        .normalize()
        .multiplyScalar(0.36)
        .applyQuaternion(w.quaternion);
      camera.position.copy(center).add(offset);
      camera.up.set(0, 1, 0).applyQuaternion(w.quaternion);
      if (name === "w-below" || name === "w-top")
        camera.up.set(0, 0, -1).applyQuaternion(w.quaternion);
      camera.lookAt(center);
    } else if (name.startsWith("rig-")) {
      const eye = {
        "rig-side": [1.3, 0.05, -0.25],
        "rig-top": [0.05, 1.4, -0.2],
        "rig-front": [0.2, 0.1, -1.6],
        "rig-34": [0.9, 0.5, -1.0],
      }[name];
      camera.fov = 40;
      camera.position.fromArray(eye);
      if (name === "rig-top") camera.up.set(0, 0, -1);
      camera.lookAt(new T.Vector3(0.05, -0.25, -0.2));
    }
    camera.updateProjectionMatrix();
  },
  info() {
    let triangles = 0,
      calls = 0;
    vm.root.traverse((o) => {
      if (o.isMesh && o.visible) {
        triangles += o.geometry.index
          ? o.geometry.index.count / 3
          : o.geometry.attributes.position.count / 3;
        calls++;
      }
    });
    return {
      triangles: Math.round(triangles),
      calls,
      parts: Object.keys(vm.weapon.userData.armory.parts),
    };
  },
  scene,
  camera,
  renderer,
  T,
};
Object.defineProperty(lab, "fit", {
  get: () => (lab._fit ||= createFitter(lab)),
});
window.lab = lab;
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
await lab.setWeapon(params.get("w") || "vigil", +(params.get("camo") || 0));
lab.view("fp");
lab.render();
lab.ready = true;
if (!params.has("still"))
  (function loop() {
    lab.step();
    lab.render();
    requestAnimationFrame(loop);
  })();
