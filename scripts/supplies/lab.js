import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import "@fontsource/barlow-condensed/latin-400.css";
import "@fontsource/barlow-condensed/latin-600.css";
import {
  prepareSupplies,
  createPickup,
  animatePickup,
  createMachine,
  updateMachine,
} from "../../src/supplies.js";
import { disposeModel } from "../../src/resources.js";

const touch = matchMedia("(pointer:coarse)").matches;
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);
const scene = new T.Scene();
scene.background = new T.Color(0x101412);
scene.fog = new T.Fog(0x101412, 8, 18);
const camera = new T.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 40);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 0.8;
controls.maxDistance = 9;
const pmrem = new T.PMREMGenerator(renderer),
  room = new RoomEnvironment();
const environment = pmrem.fromScene(room, 0.04);
scene.environment = environment.texture;
scene.environmentIntensity = 0.75;
room.dispose();
pmrem.dispose();
const key = new T.DirectionalLight(0xffedce, 4.5);
key.position.set(3, 6, 4);
key.castShadow = true;
key.shadow.mapSize.setScalar(touch ? 1024 : 2048);
key.shadow.normalBias = 0.025;
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -3;
scene.add(key);
const fill = new T.DirectionalLight(0xa5c8d5, 1.8);
fill.position.set(-4, 3, 2);
scene.add(fill);
const rim = new T.DirectionalLight(0xe9b877, 3);
rim.position.set(-1, 4, -3);
scene.add(rim, new T.HemisphereLight(0xc7d2ce, 0x34302a, 0.8));
const floor = new T.Mesh(
  new T.PlaneGeometry(80, 80),
  new T.MeshStandardMaterial({
    color: 0x252d29,
    roughness: 0.7,
    metalness: 0.15,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
let active,
  power = true,
  night = false,
  id = "machine-health";
await prepareSupplies(touch);
document.querySelector("#status").textContent =
  `VERSION ${__APP_VERSION__} · MODÈLES DU JEU`;
function choose(next) {
  if (
    ![...document.querySelectorAll("[data-id]")].some(
      (b) => b.dataset.id === next,
    )
  )
    next = "machine-health";
  if (active) {
    scene.remove(active.root);
    disposeModel(active.root);
  }
  id = next;
  const [category, kind] = next.split("-");
  if (category === "pickup") {
    active = { root: createPickup(kind) };
    active.root.traverse((o) => {
      if (o.isMesh && !o.material.transparent) o.castShadow = true;
    });
    controls.target.set(0, 0.8, 0);
    camera.position.set(1.05, 1.4, 1.9);
  } else {
    active = createMachine(kind);
    controls.target.set(0, 1.3, 0);
    camera.position.set(2.2, 2.15, 4.65);
  }
  scene.add(active.root);
  document
    .querySelectorAll("[data-id]")
    .forEach((b) => b.classList.toggle("active", b.dataset.id === next));
  document.querySelector("#caption").textContent = document.querySelector(
    `[data-id="${next}"]`,
  ).textContent;
  controls.update();
}
document
  .querySelectorAll("[data-id]")
  .forEach((b) => (b.onclick = () => choose(b.dataset.id)));
document.querySelector("#power").onclick = (e) => {
  power = !power;
  e.currentTarget.textContent = `Courant · ${power ? "activé" : "coupé"}`;
};
document.querySelector("#light").onclick = (e) => {
  night = !night;
  e.currentTarget.textContent = `Lumière · ${night ? "nuit" : "atelier"}`;
};
choose(new URL(location.href).searchParams.get("id") || id);
const started = performance.now();
function frame() {
  const t = (performance.now() - started) / 1000;
  const lit = power || id === "machine-ammo";
  if (active.root.userData.pickup) animatePickup(active.root, t);
  if (
    id.startsWith("machine-") &&
    ["power", "ammo", "upgrade"].includes(id.split("-")[1])
  )
    updateMachine(active, id.split("-")[1], 1 / 60, power ? 1 : 0);
  else if (active.screen)
    active.screen.material.emissiveIntensity = power ? 3 : 0.015;
  if (active.parts?.lever) active.parts.lever.rotation.x = power ? 0.6 : -0.5;
  if (active.bulb) active.bulb.emissiveIntensity = lit ? 3 : 0.03;
  if (active.halo) active.halo.material.opacity = lit ? 0.25 : 0.03;
  key.intensity = night ? 0.6 : 4.5;
  fill.intensity = night ? 0.3 : 1.8;
  rim.intensity = night ? 0.8 : 3;
  scene.environmentIntensity = night ? 0.24 : 0.75;
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
document.addEventListener("visibilitychange", () =>
  renderer.setAnimationLoop(document.hidden ? null : frame),
);
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
