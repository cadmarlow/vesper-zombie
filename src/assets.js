import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { rng } from "./logic.js";
import { worldSurface } from "./surfaces.js";
export const boxGeo = new RoundedBoxGeometry(1, 1, 1, 1, 0.025);
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
  const floor = texture("floor");
  return {
    stone: worldSurface("stone", 0x8a918e, 3.5),
    trim: worldSurface("stone", 0xa5a394, 3.5, {
      normalScale: new T.Vector2(0.4, 0.4),
    }),
    dark: mat(0x1a2329, 0.63, 0.5),
    floor: worldSurface("floor", 0x87908b, 4.5, { roughness: 0.88 }),
    metal: worldSurface("metal", 0x8b9c9b, 3, { roughness: 0.82 }),
    rust: worldSurface("metal", 0x8a6651, 2.5),
    wood: worldSurface("wood", 0x938273, 2.5),
    gold: mat(0x9a7342, 0.32, 0.8),
    copper: mat(0xbf7a50, 0.42, 0.75),
    black: mat(0x0f171b, 0.48, 0.6),
    snow: mat(0xa8c2c9, 0.97, 0.03, { map: floor }),
    red: glow(0xff683a, 3),
    cyan: glow(0x4defe7, 3),
    white: glow(0xe9f0d6, 2),
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
export { zombieModel, animateZombie } from "./creatures.js";
export { weaponModel } from "./weapons.js";

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
