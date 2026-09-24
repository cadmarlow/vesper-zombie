// Developer lab for the horde pipeline: views a converted character with a
// retargeted clip library and renders pose strips for review. Not bundled.
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import {
  prepareHordeMaterial,
  instanceMaterial,
} from "../../src/horde/material.js";

const params = new URLSearchParams(location.search);
const renderer = new T.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new T.Scene();
scene.background = new T.Color(0x151b20);
const camera = new T.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 100);
const hemi = new T.HemisphereLight(0xc4d6e5, 0x3a3029, 1.1);
const key = new T.DirectionalLight(0xffe6cf, 2.6);
key.position.set(-2.5, 4, 3.5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = key.shadow.camera.bottom = -3;
key.shadow.camera.right = key.shadow.camera.top = 3;
const rim = new T.DirectionalLight(0x8dacbe, 2.2);
rim.position.set(2.5, 2.2, -3);
scene.add(hemi, key, key.target, rim);
const floor = new T.Mesh(
  new T.PlaneGeometry(60, 60),
  new T.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new T.GridHelper(60, 60, 0x3d464d, 0x30373c);
grid.position.y = 0.001;
scene.add(grid);

const loader = new GLTFLoader();
const textures = new T.TextureLoader();
function tex(url, srgb = true) {
  const t = textures.load(url);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 8;
  return t;
}

async function loadCharacter(url, texBase, prefix) {
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  if (gltf.parser.json.extras?.vesperHorde) {
    // Built pack: keep one detail level and its embedded materials.
    const detail = params.get("detail") || "full";
    for (const child of [...root.children])
      if (
        child.userData?.vesperDetail &&
        child.userData.vesperDetail !== detail
      )
        root.remove(child);
    let template = null;
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        o.frustumCulled = false;
        if (o.material.name === "zombie") {
          template ||= prepareHordeMaterial(o.material, {
            mobile: params.has("mobile"),
          });
          o.material = instanceMaterial(template);
          const u = o.material.userData.hordeUniforms;
          u.hordeBlood.value = +(params.get("blood") ?? 0.3);
          u.hordeEye.value.setRGB(3.2, 1.7, 0.4);
          window.lab.uniforms = u;
        }
      }
    });
    root.userData.hordeMeta = gltf.parser.json.extras.vesperHorde;
    return root;
  }
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.frustumCulled = false;
    const name = o.material.name;
    if (texBase && name.endsWith("_opacity")) {
      o.material = new T.MeshStandardMaterial({
        map: tex(`${texBase}/${prefix}_opacity_color.png`),
        alphaTest: 0.35,
        side: T.DoubleSide,
        roughness: 0.8,
      });
    } else if (texBase) {
      const part = name.endsWith("_head") ? "head" : "body";
      o.material = new T.MeshStandardMaterial({
        map: tex(`${texBase}/${prefix}_${part}_color.png`),
        normalMap: tex(`${texBase}/${prefix}_${part}_normal.png`, false),
        roughness: 0.78,
        metalness: 0,
      });
    }
  });
  return root;
}

const state = { clips: new Map(), mixer: null, actor: null };
async function init() {
  const character =
    (params.get("pack") && `/models/horde/${params.get("pack")}.glb`) ||
    params.get("character") ||
    "/.cache/horde-build/Male_Adult_08.glb";
  const texBase = params.get("tex") ?? "/.cache/horde-build/tex";
  const prefix = params.get("prefix") || "m014";
  const anims = params.get("anims") || "/models/horde/horde-anims.glb";
  const [actor, library] = await Promise.all([
    loadCharacter(character, texBase, prefix),
    loader.loadAsync(anims),
  ]);
  for (const clip of library.animations) state.clips.set(clip.name, clip);
  state.actor = actor;
  scene.add(actor);
  state.mixer = new T.AnimationMixer(actor);
  state.pelvis = actor.getObjectByName("Bip01_Pelvis");
  window.lab.ready = true;
  window.lab.clipNames = [...state.clips.keys()];
}

function poseAt(name, time) {
  const clip = state.clips.get(name);
  state.mixer.stopAllAction();
  const action = state.mixer.clipAction(clip);
  action.reset().play();
  action.time = Math.min(time, clip.duration);
  state.mixer.update(0);
  state.actor.updateMatrixWorld(true);
  return clip;
}

const focus = new T.Vector3();
function frame(view = "three-quarter", distance = 4.2) {
  state.pelvis.getWorldPosition(focus);
  const height = 0.95;
  const angle =
    view === "side"
      ? Math.PI / 2
      : view === "front"
        ? 0
        : view === "back"
          ? Math.PI
          : 0.75;
  camera.position.set(
    focus.x + Math.sin(angle) * distance,
    height + 0.35,
    focus.z + Math.cos(angle) * distance,
  );
  camera.lookAt(focus.x, height, focus.z);
  key.target.position.copy(focus);
  key.position.set(focus.x - 2.5, 4, focus.z + 3.5);
}

/** Render `count` poses of a clip as a grid; returns the tile layout. */
function strip(
  name,
  { count = 12, cols = 6, view, start = 0, end, distance } = {},
) {
  const clip = state.clips.get(name);
  if (!clip) throw new Error(`no clip ${name}`);
  const t1 = end ?? clip.duration;
  const rows = Math.ceil(count / cols);
  const w = Math.floor(innerWidth / cols),
    h = Math.floor(innerHeight / rows);
  renderer.setScissorTest(true);
  renderer.setClearColor(0x151b20);
  renderer.clear();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const times = [];
  for (let i = 0; i < count; i++) {
    const t = start + ((t1 - start) * i) / Math.max(1, count - 1);
    times.push(+t.toFixed(3));
    poseAt(name, t);
    frame(view, distance);
    const x = (i % cols) * w,
      y = innerHeight - (Math.floor(i / cols) + 1) * h;
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.render(scene, camera);
  }
  renderer.setScissorTest(false);
  document.getElementById("info").textContent =
    `${name}  ${clip.duration.toFixed(2)}s  t=${times.join(" ")}`;
  return { duration: clip.duration, times };
}

/** Single large render: framing "body", "bust" or "face". */
function portrait({
  clip = "idle_sway",
  time = 0,
  angle = 0.35,
  framing = "body",
} = {}) {
  poseAt(clip, time);
  const target = new T.Vector3();
  const headBone = state.actor.getObjectByName("Bip01_Head");
  if (framing === "face") headBone.getWorldPosition(target);
  else state.pelvis.getWorldPosition(target);
  const distance = framing === "face" ? 0.75 : framing === "bust" ? 1.5 : 3.6;
  const lift = framing === "face" ? 0.02 : framing === "bust" ? 0.45 : 0.1;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = framing === "face" ? 24 : 32;
  camera.updateProjectionMatrix();
  camera.position.set(
    target.x + Math.sin(angle) * distance,
    target.y + lift,
    target.z + Math.cos(angle) * distance,
  );
  camera.lookAt(target.x, target.y + lift * 0.8, target.z);
  key.target.position.copy(target);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.render(scene, camera);
  return true;
}

window.lab = {
  ready: false,
  strip,
  portrait,
  poseAt,
  frame,
  state,
  T,
  scene,
  camera,
  renderer,
};
init().catch((e) => {
  window.lab.error = String(e.stack || e);
  console.error(e);
});
