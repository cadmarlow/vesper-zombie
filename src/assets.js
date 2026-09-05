import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { rng } from "./logic.js";
import { ENEMIES, WEAPONS } from "./config.js";
export const boxGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.025);
export function mesh(
  geo,
  mat,
  parent,
  x = 0,
  y = 0,
  z = 0,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function box(parent, mat, x, y, z, w, h, d) {
  return mesh(boxGeo, mat, parent, x, y, z, w, h, d);
}
export function cylinder(parent, mat, x, y, z, r, h, r2 = r, sides = 12) {
  return mesh(new T.CylinderGeometry(r2, r, h, sides), mat, parent, x, y, z);
}
export function sphere(parent, mat, x, y, z, r, sx = 1, sy = 1, sz = 1) {
  return mesh(
    new T.SphereGeometry(r, 12, 10),
    mat,
    parent,
    x,
    y,
    z,
    sx,
    sy,
    sz,
  );
}
export function mat(color, roughness = 0.7, metalness = 0.1, extra = {}) {
  return new T.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
export function glow(color, intensity = 2) {
  return mat(color, 0.35, 0.25, {
    emissive: color,
    emissiveIntensity: intensity,
  });
}
export function texture(kind, seed = 7) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d"),
    r = rng(seed);
  c.fillStyle =
    kind === "metal"
      ? "#424c50"
      : kind === "wood"
        ? "#45382e"
        : kind === "skin"
          ? "#738070"
          : "#666c6b";
  c.fillRect(0, 0, 512, 512);
  const image = c.getImageData(0, 0, 512, 512);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (r() - 0.5) * 28;
    for (let j = 0; j < 3; j++) image.data[i + j] += n;
  }
  c.putImageData(image, 0, 0);
  if (kind === "steel") {
    for (let i = 0; i < 650; i++) {
      c.strokeStyle = `rgba(215,229,234,${r() * 0.16})`;
      const x = r() * 512,
        y = r() * 512;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + r() * 3, y + 40 + r() * 190);
      c.stroke();
    }
  }
  if (kind === "stone" || kind === "floor") {
    const h = kind === "floor" ? 128 : 64,
      w = kind === "floor" ? 128 : 192;
    for (let y = 0; y < 512; y += h) {
      for (let x = -w; x < 512; x += w) {
        const off = kind === "stone" && (y / h) % 2 ? w / 2 : 0;
        c.fillStyle = `rgba(${r() > 0.5 ? "0,0,0" : "230,230,220"},${r() * 0.1})`;
        c.fillRect(x + off + 3, y + 3, w - 5, h - 5);
        c.strokeStyle = "#333b3c";
        c.lineWidth = 3;
        c.strokeRect(x + off, y, w, h);
        c.strokeStyle = "rgba(190,194,176,.16)";
        c.lineWidth = 1;
        c.strokeRect(x + off + 3, y + 3, w - 6, h - 6);
      }
    }
    for (let i = 0; i < 65; i++) {
      const x = r() * 512,
        y = r() * 512;
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 5; j++) c.lineTo(x + (r() - 0.5) * 45, y + j * 8);
      c.strokeStyle = "rgba(18,23,23,.24)";
      c.lineWidth = 0.7;
      c.stroke();
    }
  }
  if (kind === "metal") {
    for (let y = 0; y < 512; y += 64) {
      c.fillStyle = "#252c2d";
      c.fillRect(0, y, 512, 3);
      for (let x = 16; x < 512; x += 96) {
        c.fillStyle = "#94978b";
        c.beginPath();
        c.arc(x, y + 12, 3, 0, Math.PI * 2);
        c.fill();
      }
    }
    for (let i = 0; i < 85; i++) {
      c.strokeStyle = `rgba(119,68,34,${r() * 0.3})`;
      c.beginPath();
      const x = r() * 512,
        y = r() * 512;
      c.moveTo(x, y);
      c.lineTo(x + r() * 10, y + r() * 100);
      c.stroke();
    }
  }
  if (kind === "wood") {
    for (let i = 0; i < 250; i++) {
      c.strokeStyle = `rgba(10,6,4,${r() * 0.4})`;
      c.beginPath();
      const y = r() * 512;
      c.moveTo(0, y);
      c.bezierCurveTo(120, y + 10, 320, y - 8, 512, y);
      c.stroke();
    }
  }
  if (kind === "skin") {
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(${r() < 0.5 ? "47,25,24" : "39,55,36"},${r() * 0.4})`;
      c.beginPath();
      c.ellipse(
        r() * 512,
        r() * 512,
        3 + r() * 14,
        2 + r() * 22,
        r() * 6,
        0,
        7,
      );
      c.fill();
    }
  }
  for (let i = 0; i < 1200; i++) {
    c.fillStyle = `rgba(5,14,16,${r() * 0.1})`;
    c.fillRect(r() * 512, r() * 512, r() * 25, 1 + r() * 8);
  }
  const t = new T.CanvasTexture(canvas);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function createMaterials() {
  const stone = texture("stone"),
    floor = texture("floor"),
    metal = texture("metal"),
    wood = texture("wood"),
    skin = texture("skin");
  return {
    stone: mat(0x7e8582, 0.92, 0.08, {
      map: stone,
      bumpMap: stone,
      bumpScale: 0.07,
    }),
    trim: mat(0x969287, 0.78, 0.1, {
      map: stone,
      bumpMap: stone,
      bumpScale: 0.045,
    }),
    dark: mat(0x1a2329, 0.63, 0.5),
    floor: mat(0x667473, 0.39, 0.32, {
      map: floor,
      bumpMap: floor,
      bumpScale: 0.045,
    }),
    metal: mat(0x6c8186, 0.48, 0.72, {
      map: metal,
      bumpMap: metal,
      bumpScale: 0.03,
    }),
    rust: mat(0x77634d, 0.72, 0.5, { map: metal }),
    wood: mat(0x978172, 0.75, 0.05, {
      map: wood,
      bumpMap: wood,
      bumpScale: 0.025,
    }),
    gold: mat(0x9a7342, 0.32, 0.8),
    copper: mat(0xbf7a50, 0.42, 0.75),
    black: mat(0x0f171b, 0.48, 0.6),
    snow: mat(0xa8c2c9, 0.97, 0.03, { map: floor }),
    red: glow(0xff683a, 3),
    cyan: glow(0x4defe7, 3),
    white: glow(0xe9f0d6, 2),
    skin,
    glass: mat(0x78d5da, 0.12, 0.35, {
      transparent: true,
      opacity: 0.23,
      depthWrite: false,
    }),
  };
}
export function label(text, color = "#eabe88", w = 3, h = 0.75) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 192;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#11191cf0";
  ctx.fillRect(0, 0, 768, 192);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 748, 172);
  ctx.fillStyle = color;
  ctx.font = "bold 54px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 384, 98, 718);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return new T.Mesh(
    new T.PlaneGeometry(w, h),
    new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }),
  );
}
export function glowSprite(color = 0xff9955, size = 2) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d"),
    g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,255,255,.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const m = new T.Sprite(
    new T.SpriteMaterial({
      map: new T.CanvasTexture(c),
      color,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
    }),
  );
  m.scale.set(size, size, 1);
  return m;
}
const sharedEnemyMaterials = {};
function buildZombieModel(type) {
  const def = ENEMIES[type],
    g = new T.Group();
  if (!sharedEnemyMaterials[type]) {
    const tex = texture("skin", 12);
    sharedEnemyMaterials[type] = {
      skin: mat(def.color, 0.91, 0, {
        map: tex,
        bumpMap: tex,
        bumpScale: 0.04,
      }),
      coat: mat(
        type === "brute" ? 0x333632 : type === "runner" ? 0x463332 : 0x293c3d,
        0.94,
        0.04,
        { map: tex },
      ),
      bone: mat(0xa49674, 0.82),
      black: mat(0x171c19, 0.8),
      eyes: glow(def.eye, 2.8),
      wound: mat(0x4f1718, 0.68),
      armor: mat(0x414846, 0.5, 0.7),
    };
  }
  const m = sharedEnemyMaterials[type];
  const torso = new T.Group();
  g.add(torso);
  torso.position.y = 1.1;
  const chest = mesh(
    new T.CylinderGeometry(0.24, 0.19, 0.61, 8),
    m.coat,
    torso,
    0,
    0.16,
    0,
    1,
    1,
    0.72,
  );
  chest.rotation.z = 0.04;
  box(torso, m.black, 0, -0.16, 0, 0.43, 0.11, 0.29);
  for (let i = -1; i <= 1; i++)
    box(torso, m.armor, i * 0.12, -0.15, 0.16, 0.06, 0.06, 0.035);
  for (let s of [-1, 1]) {
    const flap = box(torso, m.coat, s * 0.14, -0.34, -0.03, 0.2, 0.3, 0.27);
    flap.rotation.z = s * 0.11;
    box(torso, m.coat, s * 0.2, 0.37, 0.06, 0.12, 0.16, 0.09).rotation.z =
      s * -0.2;
  }
  for (let i = 0; i < 4; i++)
    sphere(torso, m.bone, 0.04, 0.31 - i * 0.11, 0.173, 0.019);
  const neck = cylinder(torso, m.skin, 0, 0.51, 0, 0.084, 0.14);
  const head = new T.Group();
  head.position.set(0.035, 0.68, 0.025);
  head.rotation.z = 0.11;
  torso.add(head);
  mesh(
    new T.SphereGeometry(0.158, 20, 16),
    m.skin,
    head,
    0,
    0,
    0,
    0.88,
    1.18,
    0.86,
  );
  box(head, m.skin, 0, -0.117, 0.066, 0.165, 0.095, 0.123);
  box(head, m.black, 0, -0.078, 0.135, 0.128, 0.03, 0.02);
  for (let i = 0; i < 6; i++)
    box(head, m.bone, -0.053 + i * 0.02, -0.08, 0.149, 0.013, 0.013, 0.008);
  for (let s of [-1, 1]) {
    sphere(head, m.black, s * 0.061, 0.025, 0.115, 0.044, 1, 0.62, 0.4);
    sphere(head, m.eyes, s * 0.061, 0.025, 0.133, 0.0125, 1, 0.7, 0.4);
    sphere(head, m.skin, s * 0.142, -0.015, 0, 0.035, 0.4, 1, 0.7);
    box(head, m.skin, s * 0.065, 0.06, 0.115, 0.083, 0.034, 0.04).rotation.z =
      -s * 0.19;
  }
  box(head, m.skin, 0, -0.02, 0.147, 0.032, 0.069, 0.042);
  box(head, m.wound, -0.085, -0.025, 0.11, 0.026, 0.095, 0.015).rotation.z =
    0.3;
  if (type === "brute") {
    mesh(
      new T.SphereGeometry(0.184, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      m.armor,
      head,
      0,
      0.04,
      0,
    );
    box(torso, m.armor, 0, 0.21, 0.163, 0.29, 0.34, 0.05);
    for (let s of [-1, 1]) {
      const plate = box(torso, m.armor, s * 0.19, 0.18, 0.11, 0.14, 0.31, 0.07);
      plate.rotation.y = s * 0.55;
      box(torso, m.black, s * 0.12, 0.18, 0.21, 0.033, 0.38, 0.019);
      box(torso, m.bone, s * 0.12, 0.06, 0.226, 0.048, 0.033, 0.018);
    }
    for (const s of [-1, 1]) {
      sphere(torso, m.armor, s * 0.33, 0.41, 0, 0.16, 1, 0.58, 1);
    }
  }
  if (type === "spitter") {
    for (let i = 0; i < 6; i++)
      sphere(
        torso,
        m.eyes,
        Math.sin(i * 2.3) * 0.2,
        0.03 + i * 0.08,
        -0.18,
        0.027 + i * 0.007,
      );
    sphere(torso, m.skin, 0, 0.2, -0.17, 0.28, 1, 1.2, 0.8);
  }
  if (type === "wraith") {
    const hood = mesh(
      new T.ConeGeometry(0.25, 0.52, 8, 1, true),
      m.coat,
      head,
      0,
      0.1,
      -0.04,
    );
    hood.rotation.x = -0.12;
  }
  // Ragged hems, asymmetric leather webbing, pouches and exposed ribs.
  const ragMat = m.coat;
  for (let j = 0; j < 9; j++) {
    const x = -0.21 + j * 0.051;
    const shape = new T.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.057, 0);
    shape.lineTo(0.039, -0.14 - (j % 3) * 0.037);
    shape.lineTo(0.013, -0.095);
    const rag = mesh(
      new T.ShapeGeometry(shape),
      ragMat,
      torso,
      x,
      -0.35,
      0.132,
    );
    rag.material.side = T.DoubleSide;
  }
  for (let side of [-1, 1]) {
    const strap = box(
      torso,
      m.black,
      side * 0.15,
      0.17,
      0.167,
      0.044,
      0.58,
      0.026,
    );
    strap.rotation.z = side * 0.15;
    box(torso, m.coat, side * 0.14, 0.08, 0.187, 0.13, 0.14, 0.075);
    box(torso, m.armor, side * 0.14, 0.14, 0.231, 0.12, 0.014, 0.014);
  }
  if (type === "runner") {
    for (let i = 0; i < 4; i++) {
      const rib = box(
        torso,
        m.bone,
        -0.15,
        0.29 - i * 0.085,
        0.162,
        0.14,
        0.026,
        0.035,
      );
      rib.rotation.z = 0.15;
    }
    box(torso, m.wound, -0.145, 0.15, 0.158, 0.13, 0.4, 0.017);
  }
  for (let j = 0; j < 5; j++) {
    const scar = box(
      head,
      m.wound,
      -0.072 + j * 0.025,
      0.12 - j * 0.007,
      0.094,
      0.009,
      0.07,
      0.01,
    );
    scar.rotation.z = 0.65;
  }
  const arms = [],
    legs = [];
  for (let s of [-1, 1]) {
    const a = new T.Group();
    a.position.set(s * 0.29, 0.38, 0);
    torso.add(a);
    mesh(new T.CapsuleGeometry(0.078, 0.27, 3, 6), m.coat, a, 0, -0.18, 0);
    const fore = new T.Group();
    fore.position.set(0, -0.36, 0);
    a.add(fore);
    mesh(new T.CapsuleGeometry(0.06, 0.25, 3, 6), m.skin, fore, 0, -0.15, 0);
    sphere(fore, m.skin, 0, -0.34, 0, 0.074, 0.8, 1.3, 0.75);
    for (let i = 0; i < 3; i++) {
      const finger = box(
        fore,
        m.skin,
        (i - 1) * 0.035,
        -0.435,
        0.028,
        0.025,
        0.12,
        0.03,
      );
      finger.rotation.x = 0.35;
    }
    sphere(fore, m.skin, 0.05, -0.34, 0.05, 0.033, 0.5, 1.3, 0.5);
    sphere(a, m.skin, 0, -0.34, 0.018, 0.075, 0.8, 0.7, 0.8);
    for (let j = 0; j < 3; j++) {
      const tear = box(
        a,
        m.wound,
        (j - 1) * 0.032,
        -0.16 - j * 0.04,
        0.076,
        0.014,
        0.13,
        0.008,
      );
      tear.rotation.z = 0.1;
    }
    fore.rotation.x = -0.45;
    arms.push(a);
    const leg = new T.Group();
    leg.position.set(s * 0.12, 0.81, 0);
    g.add(leg);
    mesh(new T.CapsuleGeometry(0.1, 0.29, 3, 6), m.coat, leg, 0, -0.2, 0);
    const shin = new T.Group();
    shin.position.y = -0.4;
    leg.add(shin);
    mesh(new T.CapsuleGeometry(0.07, 0.27, 3, 6), m.coat, shin, 0, -0.16, 0);
    box(shin, m.black, 0, -0.34, 0.048, 0.16, 0.13, 0.28);
    legs.push({ root: leg, shin });
  }
  torso.name = "torso";
  head.name = "head";
  arms.forEach((a, i) => (a.name = "arm" + i));
  legs.forEach((l, i) => {
    l.root.name = "leg" + i;
    l.shin.name = "shin" + i;
  });
  g.scale.setScalar(def.scale);
  g.userData = { torso, head, arms, legs, type };
  return g;
}
// Merge meshes attached to each rigid bone, preserving the articulated hierarchy.
// Every enemy of a type shares the resulting geometry and materials.
function mergeRigidParts(group) {
  for (const child of [...group.children])
    if (child.isGroup) mergeRigidParts(child);
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || child.children.length) continue;
    child.updateMatrix();
    const geo = child.geometry.clone().applyMatrix4(child.matrix);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (!buckets.has(child.material)) buckets.set(child.material, []);
    buckets.get(child.material).push(flat);
    group.remove(child);
  }
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    const part = new T.Mesh(merged, material);
    part.castShadow =
      !material.emissiveIntensity || material.emissiveIntensity < 1;
    part.receiveShadow = true;
    group.add(part);
    geometries.forEach((geo) => geo.dispose());
  }
}
const zombieTemplates = {};
export function zombieModel(type) {
  if (!zombieTemplates[type]) {
    const model = buildZombieModel(type);
    mergeRigidParts(model);
    model.userData = {};
    zombieTemplates[type] = model;
  }
  const g = zombieTemplates[type].clone(true);
  g.userData = {
    type,
    torso: g.getObjectByName("torso"),
    head: g.getObjectByName("head"),
    arms: [g.getObjectByName("arm0"), g.getObjectByName("arm1")],
    legs: [0, 1].map((i) => ({
      root: g.getObjectByName("leg" + i),
      shin: g.getObjectByName("shin" + i),
    })),
  };
  return g;
}
export function animateZombie(g, t, speed, attacking = false) {
  const { torso, head, arms, legs, type } = g.userData;
  const phase = t * (type === "runner" ? 9 : 5) * speed;
  torso.rotation.z = Math.sin(phase * 0.5) * 0.065;
  torso.rotation.x = type === "runner" ? 0.2 : 0.07;
  torso.position.y = 1.1 + Math.abs(Math.sin(phase)) * 0.025;
  head.rotation.z = 0.12 + Math.sin(phase * 0.5) * 0.07;
  legs.forEach((l, i) => {
    l.root.rotation.x = Math.sin(phase + i * Math.PI) * 0.5;
    l.shin.rotation.x = Math.max(0, Math.cos(phase + i * Math.PI)) * 0.5;
  });
  arms.forEach((a, i) => {
    a.rotation.x = attacking
      ? -1.6 + Math.sin(t * 12) * 0.5
      : -0.65 + Math.sin(phase + i * 2) * 0.26;
    a.rotation.z = (i ? 1 : -1) * 0.12;
  });
}
export function weaponModel(id, upgraded = false) {
  const d = WEAPONS[id],
    g = new T.Group(),
    metal = mat(0x68736e, 0.45, 0.65, { map: texture("metal", 31) }),
    dark = mat(0x151d24, 0.54, 0.45),
    grip = mat(0x222725, 0.88, 0.1),
    accent = glow(upgraded ? 0xffac4d : d.color, upgraded ? 2.5 : 0.5),
    silver = mat(0x87928e, 0.24, 0.9);
  const pistol = id === "vigil",
    shotgun = id === "requiem",
    sniper = id === "longinus",
    alien = id === "eclipse";
  const len = pistol ? 0.39 : sniper ? 0.9 : 0.7;
  box(g, metal, 0, 0, -0.12, 0.115, 0.13, len * 0.56);
  box(g, dark, 0, -0.08, 0.04, 0.12, 0.1, 0.19);
  const handle = box(g, grip, 0, -0.19, 0.085, 0.09, 0.23, 0.13);
  handle.rotation.x = 0.23;
  // Barrel points down camera -Z.
  const barrel = cylinder(
    g,
    metal,
    0,
    0.014,
    -len * 0.62,
    pistol ? 0.026 : 0.032,
    len * 0.64,
  );
  barrel.rotation.x = Math.PI / 2;
  const muzzle = cylinder(g, dark, 0, 0.014, -len * 0.96, 0.046, 0.075);
  muzzle.rotation.x = Math.PI / 2;
  const muzzleHole = cylinder(g, grip, 0, 0.014, -len - 0.001, 0.025, 0.007);
  muzzleHole.rotation.x = Math.PI / 2;
  if (pistol) {
    box(g, metal, 0, 0.045, -0.08, 0.12, 0.085, 0.34);
    for (let i = 0; i < 6; i++)
      box(g, dark, 0.061, 0.045, 0.01 + i * 0.015, 0.007, 0.059, 0.006);
  } else {
    box(g, grip, 0, -0.01, -0.34, 0.14, 0.15, shotgun ? 0.23 : 0.3);
    for (let i = 0; i < 7; i++) {
      box(g, metal, 0, 0.063, -0.43 + i * 0.034, 0.15, 0.013, 0.012);
      box(g, dark, 0.073, 0.012, -0.43 + i * 0.034, 0.01, 0.1, 0.014);
    }
    const mag = box(g, dark, 0, -0.23, -0.09, 0.085, 0.25, 0.13);
    mag.rotation.x = -0.18;
    for (let i = 0; i < 4; i++)
      box(g, metal, 0.044, -0.29 + i * 0.04, -0.086, 0.008, 0.014, 0.1);
    box(g, metal, 0, -0.045, 0.19, 0.085, 0.06, 0.27);
    box(g, grip, 0, -0.07, 0.33, 0.115, 0.23, 0.08);
    box(g, dark, 0, 0.085, -0.14, 0.065, 0.025, 0.35);
  }
  box(g, silver, 0, 0.091, -len * 0.5, 0.022, 0.044, 0.024);
  box(g, dark, 0, 0.099, 0.04, 0.068, 0.039, 0.018);
  box(g, accent, 0, 0.119, -len * 0.5, 0.009, 0.016, 0.009);
  if (sniper) {
    const scope = cylinder(g, dark, 0, 0.17, -0.15, 0.06, 0.29);
    scope.rotation.x = Math.PI / 2;
    const lens = cylinder(g, accent, 0, 0.17, -0.302, 0.047, 0.007);
    lens.rotation.x = Math.PI / 2;
    box(g, metal, 0, 0.11, -0.16, 0.05, 0.1, 0.1);
  } else if (!pistol) {
    const sight = mesh(
      new T.TorusGeometry(0.037, 0.009, 6, 12, Math.PI),
      metal,
      g,
      0,
      0.136,
      -0.05,
    );
    box(g, accent, 0, 0.138, -0.05, 0.009, 0.009, 0.009);
  }
  if (shotgun) {
    const tube = cylinder(g, metal, 0, -0.053, -0.45, 0.028, 0.57);
    tube.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++)
      box(g, accent, -0.074, 0, -0.12 + i * 0.035, 0.015, 0.07, 0.026);
  }
  if (alien) {
    for (let i = 0; i < 5; i++) {
      const coil = mesh(
        new T.TorusGeometry(0.094, 0.012, 6, 16),
        accent,
        g,
        0,
        0.012,
        -0.2 - i * 0.08,
      );
      coil.rotation.y = 0.12;
    }
    sphere(g, accent, 0, 0, -0.38, 0.074, 1, 1, 2.8);
    box(g, metal, -0.1, 0, -0.3, 0.035, 0.18, 0.4);
    box(g, metal, 0.1, 0, -0.3, 0.035, 0.18, 0.4);
  }
  for (let s of [-1, 1]) {
    for (let i = 0; i < 3; i++)
      sphere(g, silver, s * 0.062, 0.01, -0.04 - i * 0.067, 0.01);
  }
  // Gloved hands and sleeves, authored as part of the first person rig.
  const cloth = mat(0x303c3a, 0.96),
    glove = mat(0x252b29, 0.9);
  const right = new T.Group();
  g.add(right);
  right.position.set(0.012, -0.22, 0.08);
  sphere(right, glove, 0, 0, 0, 0.071, 1, 0.9, 1.1);
  const arm = mesh(
    new T.CapsuleGeometry(0.072, 0.3, 4, 8),
    cloth,
    right,
    0.08,
    -0.12,
    0.2,
  );
  arm.rotation.x = -1.03;
  arm.rotation.z = 0.35;
  if (!pistol) {
    sphere(g, glove, -0.04, -0.09, -0.34, 0.078, 1, 0.7, 1.3);
    const left = mesh(
      new T.CapsuleGeometry(0.065, 0.42, 4, 8),
      cloth,
      g,
      -0.14,
      -0.22,
      -0.13,
    );
    left.rotation.x = -0.9;
    left.rotation.z = -0.4;
  }
  const flash = new T.Group();
  g.add(flash);
  flash.position.set(0, 0.014, -len - 0.035);
  const sprite = glowSprite(alien ? 0x65fff0 : 0xffbd63, 0.42);
  flash.add(sprite);
  const burst = mesh(
    new T.OctahedronGeometry(0.1),
    glow(alien ? 0x65fff0 : 0xffd689, 8),
    flash,
  );
  burst.scale.set(0.55, 0.55, 2.8);
  flash.visible = false;
  g.userData = { flash, len, id };
  return g;
}

// Operator's field knife: bevelled steel, fuller, brass guard, wrapped grip and a gloved hand.
export function knifeModel() {
  const g = new T.Group();
  g.name = "operator-knife";
  const steel = mat(0xc4d4d9, 0.22, 0.88, { map: texture("steel", 91) });
  const edge = mat(0xe2ebec, 0.16, 0.95);
  const dark = mat(0x172126, 0.78, 0.28);
  const brass = mat(0xc39358, 0.3, 0.8);
  const glove = mat(0x3d4843, 0.95, 0.05);
  const cloth = mat(0x263633, 0.98, 0);
  const blade = new T.Shape();
  blade.moveTo(-0.054, 0.12);
  blade.lineTo(0.052, 0.12);
  blade.lineTo(0.045, 0.46);
  blade.lineTo(-0.008, 0.66);
  blade.lineTo(-0.065, 0.45);
  blade.closePath();
  const bladeMesh = mesh(
    new T.ExtrudeGeometry(blade, {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.006,
      bevelSegments: 2,
      steps: 1,
    }),
    steel,
    g,
  );
  bladeMesh.name = "blade";
  const bevel = new T.Shape();
  bevel.moveTo(-0.054, 0.13);
  bevel.lineTo(-0.065, 0.45);
  bevel.lineTo(-0.008, 0.66);
  bevel.lineTo(-0.041, 0.43);
  bevel.lineTo(-0.033, 0.13);
  bevel.closePath();
  mesh(new T.ShapeGeometry(bevel), edge, g, 0, 0, 0.022);
  box(g, dark, 0.012, 0.31, 0.022, 0.013, 0.27, 0.002);
  box(g, steel, 0.005, 0.3, 0.024, 0.003, 0.24, 0.002);
  mesh(
    new RoundedBoxGeometry(0.19, 0.026, 0.064, 2, 0.01),
    brass,
    g,
    0,
    0.115,
    0.009,
  );
  cylinder(g, dark, 0, -0.019, 0.008, 0.041, 0.24, 0.036, 12);
  for (let i = 0; i < 8; i++)
    cylinder(
      g,
      i % 2 ? glove : dark,
      0,
      -0.115 + i * 0.027,
      0.008,
      0.043,
      0.014,
      0.043,
      12,
    );
  cylinder(g, brass, 0, -0.145, 0.008, 0.045, 0.025, 0.045, 12);
  for (const y of [0.16, 0.19])
    box(g, brass, 0.023, y, 0.025, 0.018, 0.004, 0.003);
  const hand = new T.Group();
  g.add(hand);
  mesh(
    new RoundedBoxGeometry(0.13, 0.16, 0.11, 3, 0.033),
    glove,
    hand,
    0.01,
    -0.025,
    0.073,
  );
  for (let i = 0; i < 4; i++) {
    mesh(
      new T.CapsuleGeometry(0.023, 0.064, 3, 8),
      glove,
      hand,
      -0.022,
      -0.084 + i * 0.04,
      0.053,
    ).rotation.z = Math.PI / 2;
    box(hand, dark, 0.012, -0.084 + i * 0.04, 0.134, 0.073, 0.025, 0.009);
  }
  const thumb = mesh(
    new T.CapsuleGeometry(0.028, 0.063, 3, 8),
    glove,
    hand,
    0.062,
    0.025,
    0.06,
  );
  thumb.rotation.z = -0.65;
  const sleeve = mesh(
    new T.CapsuleGeometry(0.081, 0.37, 4, 10),
    cloth,
    g,
    0.05,
    -0.3,
    0.2,
  );
  sleeve.rotation.x = -0.48;
  sleeve.rotation.z = 0.12;
  box(g, dark, 0.038, -0.15, 0.135, 0.153, 0.042, 0.14);
  box(g, brass, 0.03, -0.15, 0.214, 0.037, 0.025, 0.008);
  g.visible = false;
  return g;
}
