import * as T from "three";
import { rng } from "./logic.js";

const finishes = new Map();
export function weaponFinish(polymer = false) {
  const key = polymer ? "polymer" : "steel";
  if (finishes.has(key)) return finishes.get(key);
  const n = 512,
    r = rng(polymer ? 8831 : 4751),
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const c = canvas.getContext("2d"),
    pixels = c.createImageData(n, n);
  const normal = new Uint8Array(n * n * 4),
    rough = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4,
        grain = r(),
        brushed = Math.sin(y * 2.7) * 2 + Math.sin(y * 0.77) * 2;
      const base = polymer ? 158 + grain * 33 : 168 + grain * 18 + brushed;
      pixels.data.set([base, base, base, 255], i);
      const bump = polymer ? 14 : 4;
      normal.set(
        [128 + (r() - 0.5) * bump, 128 + (r() - 0.5) * bump, 255, 255],
        i,
      );
      const sheen = polymer ? 193 + grain * 36 : 100 + grain * 42;
      rough.set([255, sheen, polymer ? 0 : 255, 255], i);
    }
  c.putImageData(pixels, 0, 0);
  if (!polymer)
    for (let i = 0; i < 95; i++) {
      const x = r() * n,
        y = r() * n;
      c.strokeStyle = `rgba(230,235,230,${0.035 + r() * 0.1})`;
      c.lineWidth = 0.35 + r() * 0.7;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 4 + r() * 45, y + (r() - 0.5) * 4);
      c.stroke();
    }
  const color = new T.CanvasTexture(canvas),
    bump = new T.DataTexture(normal, n, n),
    arm = new T.DataTexture(rough, n, n);
  color.colorSpace = T.SRGBColorSpace;
  for (const map of [color, bump, arm]) {
    map.wrapS = map.wrapT = T.RepeatWrapping;
    map.anisotropy = 4;
    map.generateMipmaps = true;
    map.minFilter = T.LinearMipmapLinearFilter;
    map.needsUpdate = true;
    map.userData.sharedSurface = true;
  }
  const result = {
    map: color,
    normalMap: bump,
    roughnessMap: arm,
    normalScale: new T.Vector2(0.45, 0.45),
  };
  finishes.set(key, result);
  return result;
}

export function weaponMarking(id, upgraded) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = upgraded ? "#c3a879" : "#a5aaa5";
  c.font = "500 36px monospace";
  c.fillText(`VESPER / ${id.toUpperCase()}`, 18, 48);
  c.font = "20px monospace";
  c.fillText("CAL. 04   /   N° 071-238", 18, 86);
  const r = rng(730);
  c.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 150; i++)
    c.fillRect(r() * 512, r() * 128, 1 + r() * 6, 0.6 + r() * 2);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return new T.MeshBasicMaterial({
    map,
    color: 0xa9ada6,
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

export function finishGeometry(geometry, material) {
  if (!material.userData.weaponFinish) return;
  const p = geometry.attributes.position,
    n = geometry.attributes.normal;
  const colors = [],
    uv = [];
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)),
      ny = Math.abs(n.getY(i)),
      nz = Math.abs(n.getZ(i));
    const bevel = 1 - Math.max(nx, ny, nz) ** 8;
    const abrasion =
      (0.5 + 0.5 * Math.sin(p.getZ(i) * 163 + p.getY(i) * 351)) * bevel;
    const base = material.userData.weaponFinish === 2 ? 1 : 1 + abrasion * 0.6;
    colors.push(base, base, base);
    uv.push(
      (nx > nz ? p.getZ(i) : p.getX(i)) * 8,
      (ny > 0.8 ? p.getZ(i) : p.getY(i)) * 8,
    );
  }
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
}
