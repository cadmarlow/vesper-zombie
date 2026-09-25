// Model viewer: one weapon GLB with its game materials, orbit views.
// /scripts/armory/model.html?w=spectre&camo=0
import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createWeapon } from "/src/armory/models.js";
import { tickArmory } from "/src/armory/material.js";

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
scene.environment = new T.PMREMGenerator(renderer).fromScene(
  new RoomEnvironment(),
  0.04,
).texture;
scene.environmentIntensity = 0.75;
scene.background = new T.Color(0x1a2126);
scene.add(new T.HemisphereLight(0xc4dae7, 0x242929, 1.2));
const key = new T.DirectionalLight(0xfff4e6, 2.4);
key.position.set(-1.5, 2.5, 1.2);
scene.add(key);
const rim = new T.DirectionalLight(0x9fc2d0, 1.6);
rim.position.set(2, 0.8, -1.5);
scene.add(rim);
const camera = new T.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 20);
const viewer = {
  weapon: null,
  async load(id, camo = 0) {
    if (viewer.weapon) scene.remove(viewer.weapon);
    viewer.weapon = await createWeapon(id, { camo });
    scene.add(viewer.weapon);
    const box = new T.Box3().setFromObject(viewer.weapon);
    viewer.center = box.getCenter(new T.Vector3());
    viewer.size = box.getSize(new T.Vector3()).length();
    let triangles = 0,
      calls = 0;
    viewer.weapon.traverse((o) => {
      if (o.isMesh) {
        calls++;
        triangles +=
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      }
    });
    return {
      triangles: Math.round(triangles),
      calls,
      parts: Object.keys(viewer.weapon.userData.armory.parts),
      sockets: Object.keys(viewer.weapon.userData.armory.sockets),
      size: box
        .getSize(new T.Vector3())
        .toArray()
        .map((v) => +v.toFixed(3)),
    };
  },
  /** yaw: 0 = from behind (shooter), -90 = left side, 90 = right side. */
  view(yaw = -90, pitch = 5, zoom = 1, target = null) {
    const d = (viewer.size * 1.75) / zoom;
    const y = T.MathUtils.degToRad(yaw),
      p = T.MathUtils.degToRad(pitch);
    const c = target ? new T.Vector3(...target) : viewer.center;
    camera.position.set(
      c.x + Math.sin(y) * Math.cos(p) * d,
      c.y + Math.sin(p) * d,
      c.z + Math.cos(y) * Math.cos(p) * d,
    );
    camera.lookAt(c);
    tickArmory(1.3);
    renderer.render(scene, camera);
  },
};
window.viewer = viewer;
const info = await viewer.load(
  params.get("w") || "vigil",
  +(params.get("camo") || 0),
);
document.getElementById("info").textContent = JSON.stringify(info);
viewer.view();
viewer.ready = true;
