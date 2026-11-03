import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { PERKS } from "./content/rules.js";
import { rng } from "./logic.js";

// Original mid-poly props built offline in scripts/supplies/. Templates and
// textures belong to the renderer; an instance owns only its light materials.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const templates = new Map(),
  finishes = new Map(),
  textures = new Map();
const PICKUPS = {
  health: { color: 0xf86b5c, paint: 0x8e2e2c },
  ammo: { color: 0xf0c578, paint: 0x485844 },
  double: { color: 0xf4bc55, paint: 0xcfa352 },
  insta: { color: 0x8ee8dd, paint: 0xd7c8aa },
};
const CABINETS = {
  health: {
    paint: 0x9b3531,
    notice: "VITALITÉ RENFORCÉE",
    serial: "VF–01 / HÉMATOLOGIE",
  },
  speed: {
    paint: 0xbd903c,
    notice: "RÉFLEXES · ENDURANCE",
    serial: "VF–02 / NEUROLOGIE",
  },
  rate: {
    paint: 0xb66337,
    notice: "CADENCE · MAÎTRISE",
    serial: "VF–03 / BALISTIQUE",
  },
  focus: {
    paint: 0x31727b,
    notice: "PRÉCISION LÉTALE",
    serial: "VF–04 / OPTIQUE",
  },
};
let mobile = false;
const loadedTextures = new Set();
const shared = (object) => {
  object.userData.sharedSurface = true;
  if (object.isTexture) loadedTextures.add(object);
  return object;
};
export const supplyTextures = () => loadedTextures;

function texture(url) {
  if (!textures.has(url))
    textures.set(
      url,
      new T.TextureLoader()
        .loadAsync(url)
        .then((t) => {
          t.anisotropy = 4;
          t.flipY = false;
          return shared(t);
        })
        .catch((error) => {
          textures.delete(url);
          throw error;
        }),
    );
  return textures.get(url);
}
export async function prepareSupplies(touch = false) {
  mobile = touch;
  await document.fonts?.load('600 64px "Barlow Condensed"').catch(() => {});
  const ids = [
    ...Object.keys(PICKUPS).map((k) => `pickup-${k}`),
    ...Object.keys(CABINETS).map((k) => `machine-${k}`),
  ];
  await Promise.all(
    ids.map(async (id) => {
      const key = `${id}:${touch}`;
      if (!templates.has(key))
        templates.set(
          key,
          (async () => {
            const size = id.startsWith("machine-")
              ? touch
                ? 512
                : 1024
              : touch
                ? 256
                : 512;
            const [gltf, wear, normal] = await Promise.all([
              loader.loadAsync(
                `/models/supplies/${id}${touch ? "-mobile" : ""}.glb`,
              ),
              texture(`/models/supplies/${id}-wear-${size}.webp`),
              texture(
                `/textures/metal-normal-${touch ? 512 : 1024}.webp`,
              ).catch(() => null),
            ]);
            gltf.scene.traverse((o) => {
              if (!o.isMesh) return;
              shared(o.geometry);
              o.material = finish(
                id,
                o.material.name.split(".")[0],
                wear,
                normal,
                touch,
              );
              o.castShadow =
                id.startsWith("machine-") && !o.material.transparent;
              o.receiveShadow = true;
            });
            return gltf.scene;
          })().catch((error) => {
            templates.delete(key);
            console.warn(`Supply model unavailable: ${id}`, error);
            return null;
          }),
        );
      const template = await templates.get(key);
      if (template)
        templates.set(
          key,
          Object.assign(Promise.resolve(template), { model: template }),
        );
    }),
  );
}

function finish(id, name, wear, normal, touch) {
  const key = `${id}:${name}:${touch}`;
  if (finishes.has(key)) return finishes.get(key);
  const [category, kind] = id.split("-");
  const paint =
    category === "machine" ? CABINETS[kind].paint : PICKUPS[kind].paint;
  const color =
    category === "machine" ? PERKS[kind].color : PICKUPS[kind].color;
  const options = {
    paint: {
      color: paint,
      roughness: 0.43,
      metalness: kind === "double" ? 0.88 : kind === "insta" ? 0.02 : 0.32,
    },
    metal: { color: 0xb3a188, roughness: 0.29, metalness: 0.87 },
    dark: {
      color: 0x171d1b,
      roughness: kind === "insta" ? 0.9 : 0.58,
      metalness: kind === "insta" ? 0 : 0.28,
    },
    ivory: { color: 0xd2c6a8, roughness: 0.43, metalness: 0.12 },
    glass: {
      color: 0x99c9bf,
      roughness: 0.12,
      metalness: 0.25,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    },
    lens: { color: 0x264e5e, roughness: 0.095, metalness: 0.82 },
    light: {
      color,
      emissive: color,
      emissiveIntensity: category === "machine" ? 0.015 : 1.15,
      roughness: 0.33,
      metalness: 0.25,
    },
    print: {
      color: 0xffffff,
      map: signage(kind, touch),
      roughness: 0.64,
      metalness: 0.1,
    },
  };
  const material = new T.MeshStandardMaterial(options[name] || options.dark);
  material.name = name;
  if (!["print", "glass", "light", "lens"].includes(name)) {
    if (normal) {
      normal.wrapS = normal.wrapT = T.RepeatWrapping;
      normal.channel = 1;
      normal.repeat.set(16, 16);
      material.normalMap = normal;
      material.normalScale.set(0.18, 0.18);
    }
    material.onBeforeCompile = (shader) => {
      shader.uniforms.supplyWear = { value: wear };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec2 vSupplyUv; varying vec3 vSupplyPos;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvSupplyUv=uv; vSupplyPos=position;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
        uniform sampler2D supplyWear; varying vec2 vSupplyUv; varying vec3 vSupplyPos;
        float supplyHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
        float supplyNoise(vec2 p) {
          vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(supplyHash(vec3(i,0)),supplyHash(vec3(i+vec2(1,0),0)),f.x),mix(supplyHash(vec3(i+vec2(0,1),0)),supplyHash(vec3(i+vec2(1,1),0)),f.x),f.y);
        }
      `,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
        vec3 sw=texture2D(supplyWear,vSupplyUv).rgb;
        float grain=supplyHash(floor(vSupplyPos*530.));
        float patina=supplyNoise(vSupplyPos.xy*7.+vSupplyPos.z*.6);
        float streak=supplyNoise(vec2(vSupplyPos.x*70.+vSupplyPos.z*47.,vSupplyPos.y*2.2));
        float chip=smoothstep(.12,.65,sw.g*(.6+grain*.8));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.39,.37,.31),chip*.7);
        diffuseColor.rgb*=mix(.53,1.,sw.r)*(1.-sw.b*.33);
        diffuseColor.rgb*=.96+grain*.08;
        diffuseColor.rgb*=mix(.92,1.04,patina)*mix(.9,1.,smoothstep(.2,.6,streak));
      `,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+sw.b*.18-chip*.12+(grain-.5)*.045,.17,.98);",
        );
    };
    material.customProgramCacheKey = () => "vesper-supply-wear-1";
  }
  finishes.set(key, shared(material));
  return material;
}

const signs = new Map();
function signage(kind, touch) {
  if (!PERKS[kind]) return null;
  const key = `${kind}:${touch}`;
  if (signs.has(key)) return signs.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = touch ? 512 : 1024;
  const c = canvas.getContext("2d"),
    random = rng(448 + Object.keys(PERKS).indexOf(kind));
  c.scale(canvas.width / 1024, canvas.height / 1024);
  const accent = `#${new T.Color(PERKS[kind].color).getHexString()}`;
  const text = (value, y, size, color = "#252a26") => {
    c.fillStyle = color;
    c.font = `600 ${size}px "Barlow Condensed", sans-serif`;
    c.textAlign = "center";
    c.fillText(value, 512, y, 925);
  };
  for (let tile = 0; tile < 4; tile++) {
    c.save();
    c.translate(0, tile * 256);
    c.fillStyle = "#cec09e";
    c.fillRect(0, 0, 1024, 256);
    c.strokeStyle = "#544f40";
    c.lineWidth = 5;
    c.strokeRect(12, 10, 1000, 236);
    c.strokeStyle = accent;
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(40, 232);
    c.lineTo(984, 232);
    c.stroke();
    if (tile === 0) {
      text("V E S P E R  /  T O N I Q U E S", 49, 29);
      text(PERKS[kind].title, 151, 97);
      text("FORMULE ORIGINALE · SÉRIE NOCTURNE", 205, 26);
    } else if (tile === 1) {
      text(CABINETS[kind].notice, 113, 78);
      text("UN DOSAGE. UNE NOUVELLE CHANCE.", 192, 35);
    } else if (tile === 2) {
      text(
        String(PERKS[kind].cost).replace(/(\d)(\d{3})$/, "$1 $2") +
          "  ESSENCES",
        155,
        103,
      );
      text("INSÉREZ · RECUEILLEZ · SURVIVEZ", 208, 27);
    } else {
      text(CABINETS[kind].serial, 102, 65);
      text("MAINTENANCE HORS TENSION UNIQUEMENT", 174, 33);
    }
    for (let i = 0; i < 180; i++) {
      c.fillStyle = `rgba(42,34,22,${random() * 0.18})`;
      c.fillRect(
        random() * 1024,
        random() * 256,
        1 + random() * 6,
        0.5 + random() * 2,
      );
    }
    c.restore();
  }
  const t = shared(new T.CanvasTexture(canvas));
  t.colorSpace = T.SRGBColorSpace;
  t.flipY = false; // UVs follow the glTF convention.
  t.anisotropy = 4;
  signs.set(key, t);
  return t;
}

function instance(id) {
  const template = templates.get(`${id}:${mobile}`)?.model;
  if (template) return template.clone(true);
  // A failed download still leaves a physical, identifiable prop in the world.
  const group = new T.Group();
  const kind = id.split("-")[1];
  const machine = id.startsWith("machine-");
  const geo = new T.BoxGeometry(
    machine ? 1.1 : 0.55,
    machine ? 2.2 : 0.35,
    machine ? 0.8 : 0.3,
  );
  const material = new T.MeshStandardMaterial({
    color: PERKS[kind]?.color || PICKUPS[kind].color,
  });
  const mesh = new T.Mesh(geo, material);
  mesh.position.y = machine ? 1.1 : 0;
  group.add(mesh);
  return group;
}

let groundTexture, haloTexture;
function auraTexture(ground) {
  if (ground ? groundTexture : haloTexture)
    return ground ? groundTexture : haloTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d");
  const gradient = c.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(
    0,
    ground ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.5)",
  );
  gradient.addColorStop(0.55, "rgba(255,255,255,.11)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = gradient;
  c.fillRect(0, 0, 128, 128);
  if (ground) {
    c.strokeStyle = "rgba(255,255,255,.4)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(64, 64, 43, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 12; i++) {
      c.save();
      c.translate(64, 64);
      c.rotate((i * Math.PI) / 6);
      c.fillStyle = "rgba(255,255,255,.5)";
      c.fillRect(-1, 46, 2, 6);
      c.restore();
    }
  }
  const t = shared(new T.CanvasTexture(canvas));
  if (ground) groundTexture = t;
  else haloTexture = t;
  return t;
}
const groundGeometry = shared(new T.PlaneGeometry(1.4, 1.4));
const pilotGeometry = shared(new T.SphereGeometry(0.027, 10, 8));
export function createPickup(type, id = 0) {
  const root = new T.Group(),
    body = instance(`pickup-${type}`);
  root.name = `pickup-${type}`;
  const color = PICKUPS[type].color;
  const halo = new T.Sprite(
    new T.SpriteMaterial({
      map: auraTexture(false),
      color,
      blending: T.AdditiveBlending,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  shared(halo.geometry);
  halo.scale.setScalar(1.12);
  const ground = new T.Mesh(
    groundGeometry,
    new T.MeshBasicMaterial({
      map: auraTexture(true),
      color,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.63;
  root.add(body, halo, ground);
  root.userData.pickup = { type, id, body, halo, ground };
  root.position.y = 0.65;
  animatePickup(root, 0);
  return root;
}
export function animatePickup(root, time) {
  const p = root.userData.pickup;
  if (!p) return;
  const phase = time * 2 + p.id * 1.7;
  p.body.position.y = 0.12 + Math.sin(phase) * 0.075;
  p.body.rotation.y = time * 0.42 + p.id * 0.7;
  p.body.rotation.z = Math.sin(phase * 0.57) * 0.035;
  p.halo.position.y = p.body.position.y;
  p.halo.material.opacity = 0.22 + Math.sin(phase) * 0.035;
  p.ground.material.opacity = 0.5 + Math.sin(phase) * 0.075;
}

export function createPerkMachine(kind) {
  const root = instance(`machine-${kind}`);
  root.userData.supplyModel = true;
  root.name = `perk-${kind}`;
  let screen;
  root.traverse((o) => {
    if (o.material?.name !== "light") return;
    o.material = o.material.clone();
    o.material.userData.sharedSurface = false;
    screen = o;
  });
  if (!screen) {
    screen = new T.Mesh(
      new T.PlaneGeometry(0.5, 0.2),
      new T.MeshStandardMaterial({
        color: PERKS[kind].color,
        emissive: PERKS[kind].color,
        emissiveIntensity: 0.015,
      }),
    );
    screen.position.set(0, 1.8, 0.45);
    root.add(screen);
  }
  const bulb = new T.MeshStandardMaterial({
    color: PERKS[kind].color,
    emissive: PERKS[kind].color,
    emissiveIntensity: 0.03,
  });
  const pilot = new T.Mesh(pilotGeometry, bulb);
  pilot.position.set(0.41, 0.91, 0.61);
  const halo = new T.Sprite(
    new T.SpriteMaterial({
      map: auraTexture(false),
      color: PERKS[kind].color,
      transparent: true,
      blending: T.AdditiveBlending,
      opacity: 0.03,
      depthWrite: false,
    }),
  );
  shared(halo.geometry);
  halo.position.copy(pilot.position);
  halo.scale.setScalar(0.26);
  root.add(pilot, halo);
  return { root, screen, bulb, halo };
}
