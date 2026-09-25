// Builds the first-person arms (public/models/armory/arms*.{glb,webp}) from
// the Rocketbox Military_Male_01 avatar (MIT). Blender keeps the sleeves and
// gloves (scripts/armory/blender/arms.py); this script crops the body
// textures to the arms' UV rectangle, repaints the ACU camouflage as a dark
// charcoal-olive fabric that keeps its folds, and converts the specular map
// to roughness.
//
//   node scripts/armory/build-arms.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import { readTga } from "../horde/tga.mjs";
import { ROCKETBOX_REPO } from "../horde/roster.mjs";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const BLENDER =
  process.env.BLENDER ||
  path.join(ROOT, ".cache/tools/Blender.app/Contents/MacOS/Blender");
const SRC = path.join(
  ROOT,
  ".cache/horde-sources/rocketbox/Professions/Military_Male_01",
);
const BUILD = path.join(ROOT, ".cache/armory-build");
const OUT = path.join(ROOT, "public/models/armory");
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

async function download(rel, file) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(
    `${ROCKETBOX_REPO}/Professions/Military_Male_01/${rel}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${rel}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
const fbx = path.join(SRC, "Export/Military_Male_01.fbx");
await download("Export/Military_Male_01.fbx", fbx);
for (const channel of ["color_acu", "normal", "specular"])
  await download(
    `Textures/sm002_body_${channel}.tga`,
    path.join(SRC, `Textures/sm002_body_${channel}.tga`),
  );

const raw = path.join(BUILD, "arms.glb"),
  json = path.join(BUILD, "arms.json");
execFileSync(
  BLENDER,
  [
    "-b",
    "--factory-startup",
    "--python",
    path.join(ROOT, "scripts/armory/blender/arms.py"),
    "--",
    fbx,
    raw,
    json,
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);
const meta = JSON.parse(fs.readFileSync(json, "utf8"));

// ------------------------------------------------------------ textures
const [vb, vt] = meta.v;
const read = (channel) =>
  readTga(path.join(SRC, `Textures/sm002_body_${channel}.tga`));
const color = read("color_acu"),
  normal = read("normal"),
  spec = read("specular");
const W = color.width,
  H = color.height;
// Destination column -> source column, strip by strip.
const strips = meta.strips.map(([a, b]) => [
  Math.round(a * W),
  Math.round(b * W),
]);
const top = Math.round((1 - vt) * H),
  height = Math.round((vt - vb) * H),
  width = strips.reduce((s, [a, b]) => s + (b - a), 0);
const sourceX = (x) =>
  x < strips[0][1] - strips[0][0]
    ? strips[0][0] + x
    : strips[1][0] + x - (strips[0][1] - strips[0][0]);

/** Glove texels, rasterized from the glove triangles of the source UVs. */
function mask(tris) {
  const m = new Uint8Array(W * H);
  for (const t of tris) {
    const p = t.map(([u, v]) => [u * W, (1 - v) * H]);
    const minX = Math.max(0, Math.floor(Math.min(...p.map((q) => q[0]))) - 2),
      maxX = Math.min(W - 1, Math.ceil(Math.max(...p.map((q) => q[0]))) + 2);
    const minY = Math.max(0, Math.floor(Math.min(...p.map((q) => q[1]))) - 2),
      maxY = Math.min(H - 1, Math.ceil(Math.max(...p.map((q) => q[1]))) + 2);
    const [a, b, c] = p;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5,
          py = y + 0.5;
        const w0 =
          ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
        const w1 =
          ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
        const w2 = 1 - w0 - w1;
        // Dilated edges keep seams inside the right class.
        if (w0 > -0.08 && w1 > -0.08 && w2 > -0.08) m[y * W + x] = 1;
      }
  }
  return m;
}
const glove = mask(meta.gloveTris);
const srgb = (c) => c / 255;
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const enc = (c) =>
  Math.round(
    255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055),
  );
// Sleeve: charcoal-olive field jacket; the pattern survives as a faint mottle.
const SLEEVE = [0.042, 0.045, 0.034],
  GLOVE = [0.03, 0.031, 0.03];
const outColor = Buffer.alloc(width * height * 3),
  outNormal = Buffer.alloc(width * height * 3),
  outRough = Buffer.alloc(width * height * 3);
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const sx = sourceX(x),
      sy = top + y,
      si = (sy * W + sx) * 4,
      o = (y * width + x) * 3;
    const r = lin(srgb(color.data[si])),
      g = lin(srgb(color.data[si + 1])),
      b = lin(srgb(color.data[si + 2]));
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const isGlove = glove[sy * W + sx] === 1;
    const base = isGlove ? GLOVE : SLEEVE;
    // Luminance relative to the source average keeps folds and stitching.
    const rel = Math.pow(l / (isGlove ? 0.12 : 0.16), isGlove ? 0.9 : 0.55);
    for (let k = 0; k < 3; k++)
      outColor[o + k] = enc(Math.min(1, base[k] * rel));
    for (let k = 0; k < 3; k++) outNormal[o + k] = normal.data[si + k];
    const s = spec.data[si] / 255;
    const rough = isGlove ? 0.58 + (1 - s) * 0.3 : 0.82 + (1 - s) * 0.15;
    outRough[o] = 255;
    outRough[o + 1] = Math.round(Math.min(1, rough) * 255);
    outRough[o + 2] = 0;
  }
const sizes = [
  [1024, "1024"],
  [512, "512"],
];
for (const [size, tag] of sizes) {
  // Keep the crop's aspect: the longer side becomes `size`.
  const scale = size / Math.max(width, height);
  const w = Math.max(4, Math.round(width * scale)),
    h = Math.max(4, Math.round(height * scale));
  await sharp(outColor, { raw: { width, height, channels: 3 } })
    .resize(w, h, { kernel: "lanczos3" })
    .webp({ quality: 90 })
    .toFile(path.join(OUT, `arms-color-${tag}.webp`));
  await sharp(outNormal, { raw: { width, height, channels: 3 } })
    .resize(w, h, { kernel: "lanczos3" })
    .webp({ quality: 94 })
    .toFile(path.join(OUT, `arms-normal-${tag}.webp`));
  await sharp(outRough, { raw: { width, height, channels: 3 } })
    .resize(w, h, { kernel: "lanczos3" })
    .webp({ quality: 90 })
    .toFile(path.join(OUT, `arms-rough-${tag}.webp`));
}

// ---------------------------------------------------------------- mesh
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(raw);
// FBX vertex colours are not used; UVs must survive the texture-less material.
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives())
    for (const semantic of prim.listSemantics())
      if (semantic.startsWith("COLOR_")) prim.setAttribute(semantic, null);
await doc.transform(
  dedup(),
  prune({ keepAttributes: true, keepLeaves: false }),
);
for (const material of doc.getRoot().listMaterials()) material.setName("arms");
await io.write(path.join(OUT, "arms.glb"), doc);
const info = {
  source: "Rocketbox Military_Male_01 (MIT)",
  triangles: meta.triangles,
  vertices: meta.vertices,
  crop: { strips, top, width, height },
  landmarks: meta.landmarks,
  bones: meta.bones,
};
fs.writeFileSync(
  path.join(OUT, "arms.json"),
  JSON.stringify(info, null, 1) + "\n",
);
console.log(
  `arms: ${meta.triangles} triangles, ${meta.vertices} vertices, crop ${width}x${height}, ` +
    `${(fs.statSync(path.join(OUT, "arms.glb")).size / 1024).toFixed(0)} KiB`,
);
