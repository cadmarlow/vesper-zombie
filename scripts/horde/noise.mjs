// Seeded 3D gradient noise for the offline texture painter.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

export function createNoise(seed = 1) {
  const random = mulberry32(seed);
  const p = new Uint8Array(512);
  const base = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  function grad(h, x, y, z) {
    const g = GRAD[h % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  }
  /** Perlin noise in [-1, 1] (approximately). */
  function noise(x, y, z) {
    const X = Math.floor(x),
      Y = Math.floor(y),
      Z = Math.floor(z);
    x -= X;
    y -= Y;
    z -= Z;
    const xi = X & 255,
      yi = Y & 255,
      zi = Z & 255;
    const u = fade(x),
      v = fade(y),
      w = fade(z);
    const a = p[xi] + yi,
      aa = p[a] + zi,
      ab = p[a + 1] + zi;
    const b = p[xi + 1] + yi,
      ba = p[b] + zi,
      bb = p[b + 1] + zi;
    return lerp(
      lerp(
        lerp(grad(p[aa], x, y, z), grad(p[ba], x - 1, y, z), u),
        lerp(grad(p[ab], x, y - 1, z), grad(p[bb], x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(grad(p[aa + 1], x, y, z - 1), grad(p[ba + 1], x - 1, y, z - 1), u),
        lerp(
          grad(p[ab + 1], x, y - 1, z - 1),
          grad(p[bb + 1], x - 1, y - 1, z - 1),
          u,
        ),
        v,
      ),
      w,
    );
  }
  function fbm(x, y, z, octaves = 4, lacunarity = 2.03, gain = 0.5) {
    let sum = 0,
      amp = 0.5,
      f = 1,
      norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * f, y * f, z * f);
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }
  /** Ridged noise in [0, 1]: thin bright creases (veins, cracks). */
  function ridged(x, y, z, octaves = 3) {
    let sum = 0,
      amp = 0.5,
      f = 1,
      norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(noise(x * f, y * f, z * f));
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return sum / norm;
  }
  return { noise, fbm, ridged, random };
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const mix = (a, b, t) => a + (b - a) * t;
