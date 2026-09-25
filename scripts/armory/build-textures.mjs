// Tileable detail maps shared by every weapon (public/textures/armory/):
//   grunge   R smudges and fingerprints, G scratches, B fine grain, A mottling
//   micro    normal map: machining grain and fine scratches (metal)
//   stipple  normal map: polymer grip stipple
//   checker  normal map: 20 lpi checkering (grip panels, front straps)
//   wood     sRGB albedo: walnut grain with pores
// Every map wraps on both axes. Desktop loads 512 px, phones 256 px.
//
//   node scripts/armory/build-textures.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const OUT = path.join(ROOT, "public/textures/armory");
fs.mkdirSync(OUT, { recursive: true });
const N = 1024; // authored size, downsampled for delivery

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function periodicNoise(seed, period) {
  const r = mulberry32(seed);
  const g = Float32Array.from({ length: period * period }, () => r() * 2 - 1);
  const at = (i, j) =>
    g[
      (((j % period) + period) % period) * period +
        (((i % period) + period) % period)
    ];
  return (u, v) => {
    // u, v in [0, 1): one period across the texture.
    const x = u * period,
      y = v * period,
      xi = Math.floor(x),
      yi = Math.floor(y),
      sx = smooth(x - xi),
      sy = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
}
function fbm(seed, base, octaves = 5, gain = 0.5) {
  const layers = Array.from({ length: octaves }, (_, i) =>
    periodicNoise(seed + i * 101, base << i),
  );
  return (u, v) => {
    let sum = 0,
      amp = 1,
      norm = 0;
    for (const n of layers) {
      sum += n(u, v) * amp;
      norm += amp;
      amp *= gain;
    }
    return sum / norm;
  };
}
const wrap = (i) => ((i % N) + N) % N;
const field = () => new Float32Array(N * N);

/** Anti-aliased wrapped line accumulated into a float field. */
function line(f, x0, y0, x1, y1, width, value) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len * 2));
  const r = Math.ceil(width + 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x0 + (x1 - x0) * t,
      cy = y0 + (y1 - y0) * t;
    // Taper both ends.
    const taper = Math.sin(Math.PI * t) ** 0.35;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const px = Math.round(cx) + dx,
          py = Math.round(cy) + dy;
        const d = Math.hypot(px - cx, py - cy);
        const w = Math.max(0, 1 - d / (width * taper + 0.35));
        if (w <= 0) continue;
        const i = wrap(py) * N + wrap(px);
        f[i] = Math.max(f[i], value * w);
      }
  }
}

function toNormal(height, strength) {
  const out = Buffer.alloc(N * N * 3);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const h = (dx, dy) => height[wrap(y + dy) * N + wrap(x + dx)];
      const gx =
        (h(1, -1) +
          2 * h(1, 0) +
          h(1, 1) -
          h(-1, -1) -
          2 * h(-1, 0) -
          h(-1, 1)) *
        strength;
      const gy =
        (h(-1, 1) +
          2 * h(0, 1) +
          h(1, 1) -
          h(-1, -1) -
          2 * h(0, -1) -
          h(1, -1)) *
        strength;
      // OpenGL convention (green up), as three.js expects.
      let nx = -gx,
        ny = gy,
        nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * N + x) * 3;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  return out;
}

async function save(
  name,
  data,
  channels,
  { lossless = false, quality = 90 } = {},
) {
  for (const size of [512, 256]) {
    await sharp(data, { raw: { width: N, height: N, channels } })
      .resize(size, size, { kernel: "lanczos3" })
      .webp(
        lossless
          ? { lossless: true, exact: true }
          : { quality, alphaQuality: 100, exact: true, smartSubsample: true },
      )
      .toFile(path.join(OUT, `${name}-${size}.webp`));
  }
  console.log(name);
}

// ---------------------------------------------------------------- grunge
{
  const rand = mulberry32(71);
  const smudge = fbm(3, 3, 5, 0.55),
    grain = fbm(9, 64, 3, 0.5),
    mottle = fbm(17, 6, 4, 0.5);
  const prints = field();
  // Fingerprint whorls: concentric elliptical ridges fading out.
  for (let k = 0; k < 7; k++) {
    const cx = rand() * N,
      cy = rand() * N,
      rx = 50 + rand() * 40,
      ry = rx * (1.25 + rand() * 0.3),
      rot = rand() * Math.PI,
      spacing = 3.4 + rand() * 0.8,
      amp = 0.35 + rand() * 0.4;
    const c = Math.cos(rot),
      s = Math.sin(rot);
    const warp = periodicNoise(300 + k, 8);
    for (let dy = -ry - 4; dy <= ry + 4; dy++)
      for (let dx = -ry - 4; dx <= ry + 4; dx++) {
        const u = (dx * c + dy * s) / rx,
          v = (-dx * s + dy * c) / ry;
        const r = Math.hypot(u, v);
        if (r > 1) continue;
        const px = wrap(Math.round(cx + dx)),
          py = wrap(Math.round(cy + dy));
        const ridges =
          0.5 +
          0.5 *
            Math.cos(
              ((r * rx) / spacing + warp(px / N, py / N) * 1.5) * Math.PI * 2,
            );
        const fade = (1 - smooth(Math.min(1, r))) * amp;
        const i = py * N + px;
        prints[i] = Math.max(prints[i], ridges * fade);
      }
  }
  const scratches = field();
  for (let k = 0; k < 420; k++) {
    const x = rand() * N,
      y = rand() * N,
      brushed = rand() < 0.55;
    const a = brushed ? (rand() - 0.5) * 0.25 : rand() * Math.PI;
    const len = brushed ? 30 + rand() * 180 : 8 + rand() * 60;
    line(
      scratches,
      x,
      y,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
      0.35 + rand() * 0.6,
      0.25 + rand() * 0.75,
    );
  }
  const data = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N,
        v = y / N,
        i = y * N + x;
      const s = Math.min(1, Math.max(0, 0.5 + smudge(u, v) * 1.6));
      data[i * 4] = Math.round(Math.min(1, s * 0.75 + prints[i] * 0.6) * 255);
      data[i * 4 + 1] = Math.round(scratches[i] * 255);
      data[i * 4 + 2] = Math.round(
        Math.min(1, Math.max(0, 0.5 + grain(u, v) * 1.4)) * 255,
      );
      data[i * 4 + 3] = Math.round(
        Math.min(1, Math.max(0, 0.5 + mottle(u, v) * 1.5)) * 255,
      );
    }
  await save("grunge", data, 4, { quality: 92 });
}

// ------------------------------------------------------------ micro (metal)
{
  const rand = mulberry32(5);
  const fine = fbm(41, 128, 3, 0.5),
    tool = periodicNoise(43, 512);
  const h = field();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N,
        v = y / N;
      // Faint machining lines along u plus a bead-blasted grain.
      h[y * N + x] = fine(u, v) * 0.55 + tool(u * 0.02, v) * 0.25;
    }
  const cuts = field();
  for (let k = 0; k < 260; k++) {
    const x = rand() * N,
      y = rand() * N,
      a = rand() * Math.PI,
      len = 10 + rand() * 90;
    line(
      cuts,
      x,
      y,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
      0.4 + rand() * 0.5,
      0.5 + rand() * 0.5,
    );
  }
  for (let i = 0; i < N * N; i++) h[i] -= cuts[i] * 1.4;
  await save("micro", toNormal(h, 0.9), 3, { quality: 94 });
}

// -------------------------------------------------------- stipple (polymer)
{
  const rand = mulberry32(12);
  const h = field();
  const cell = 7; // px between bumps on average
  for (let k = 0; k < ((N * N) / (cell * cell)) * 1.6; k++) {
    const cx = rand() * N,
      cy = rand() * N,
      r = 2.2 + rand() * 2.6,
      amp = 0.6 + rand() * 0.4;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const d = Math.hypot(dx + (cx % 1), dy + (cy % 1)) / r;
        if (d >= 1) continue;
        const i = wrap(Math.floor(cy) + dy) * N + wrap(Math.floor(cx) + dx);
        h[i] = Math.max(h[i], amp * (1 - d * d));
      }
  }
  const fine = fbm(21, 128, 2, 0.5);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) h[y * N + x] += fine(x / N, y / N) * 0.15;
  await save("stipple", toNormal(h, 1.1), 3, { quality: 94 });
}

// ------------------------------------------------------ checker (G10/steel)
{
  const h = field();
  const lines = 24; // diamonds across the tile
  const fine = fbm(33, 64, 2, 0.5);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x / N) * lines,
        v = (y / N) * lines;
      const a = Math.abs(((u + v) % 1) - 0.5) * 2,
        b = Math.abs(((u - v + lines) % 1) - 0.5) * 2;
      // Pyramids: the lower of the two ridges, flattened at the top.
      h[y * N + x] =
        Math.min(1, Math.min(1 - a, 1 - b) * 1.25) + fine(x / N, y / N) * 0.05;
    }
  await save("checker", toNormal(h, 2.2), 3, { quality: 94 });
}

// ----------------------------------------------------------- wood (walnut)
{
  // Quarter-sawn walnut: fine straight grain along u, gentle figure, open
  // pores and darker latewood lines.
  const warp = fbm(51, 2, 4, 0.5),
    fine = fbm(53, 64, 3, 0.5),
    streak = fbm(57, 8, 3, 0.55),
    figure = fbm(59, 3, 4, 0.5);
  const rand = mulberry32(55);
  const pores = field();
  for (let k = 0; k < 14000; k++) {
    const x = rand() * N,
      y = rand() * N,
      len = 2 + rand() * 7;
    line(
      pores,
      x,
      y,
      x + len,
      y + (rand() - 0.5) * 0.4,
      0.4,
      0.35 + rand() * 0.65,
    );
  }
  const data = Buffer.alloc(N * N * 3);
  // Linear sRGB colours of oiled walnut heartwood.
  const light = [0.16, 0.085, 0.042],
    dark = [0.05, 0.026, 0.013],
    red = [0.2, 0.08, 0.035];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N,
        v = y / N,
        i = y * N + x;
      const w = v * 22 + warp(u, v) * 0.9 + figure(u * 0.5, v) * 0.35;
      const ring = Math.pow(0.5 + 0.5 * Math.sin(w * Math.PI * 2), 2.2);
      let t =
        0.45 +
        ring * 0.3 +
        fine(u, v) * 0.18 +
        streak(u * 0.25, v) * 0.35 -
        pores[i] * 0.4;
      t = Math.min(1, Math.max(0, t));
      const warm = Math.min(1, Math.max(0, 0.5 + figure(u, v * 0.7) * 1.2));
      for (let c = 0; c < 3; c++) {
        const base = dark[c] + (light[c] - dark[c]) * t;
        const lin = base + (red[c] - light[c]) * warm * 0.25 * t;
        data[i * 3 + c] = Math.round(Math.pow(Math.max(0, lin), 1 / 2.2) * 255);
      }
    }
  await save("wood", data, 3, { quality: 90 });
}
