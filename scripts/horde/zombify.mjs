// Offline "zombification" of a Rocketbox avatar atlas. All decisions are
// made from the 3D bind position of each texel (see uvraster.mjs), so every
// effect crosses UV seams continuously.
//
// Outputs:
//   color  RGB  - dead skin, veins, sunken eyes, mouth blood, torn wounds,
//                 soiled, bloodied and torn clothes
//   mask   RGBA - R fresh-blood potential (per-instance level in the shader)
//                 G wetness (blood/drool gloss), B eye glow, A roughness
//   normal RGB  - original normals with wound craters and flesh bumps
import { createNoise, smoothstep, clamp01, mix } from "./noise.mjs";

export const SKIN_PALETTES = {
  ashen: [
    [0.62, 0.62, 0.58],
    [0.42, 0.38, 0.41],
  ],
  livid: [
    [0.55, 0.6, 0.6],
    [0.38, 0.36, 0.44],
  ],
  jaundiced: [
    [0.66, 0.62, 0.45],
    [0.44, 0.36, 0.28],
  ],
  necrotic: [
    [0.5, 0.55, 0.44],
    [0.33, 0.3, 0.26],
  ],
  bruised: [
    [0.6, 0.52, 0.53],
    [0.36, 0.26, 0.32],
  ],
  charred: [
    [0.36, 0.33, 0.3],
    [0.14, 0.1, 0.09],
  ],
};

const FLESH_DARK = [0.18, 0.02, 0.02];
const FLESH_RAW = [0.5, 0.07, 0.06];
const FLESH_PINK = [0.62, 0.25, 0.22];
const BLOOD_DRY = [0.22, 0.04, 0.03];
const BLOOD_WET = [0.38, 0.03, 0.02];
const VEIN = [0.25, 0.2, 0.32];
const SOCKET = [0.12, 0.07, 0.09];
const DIRT = [0.2, 0.16, 0.11];

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function lerp3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Classic YCbCr skin test widened for pale-to-dark photographic skin. */
function skinColor(r, g, b) {
  const R = r * 255,
    G = g * 255,
    B = b * 255;
  const y = 0.299 * R + 0.587 * G + 0.114 * B;
  const cb = 128 - 0.1687 * R - 0.3313 * G + 0.5 * B;
  const cr = 128 + 0.5 * R - 0.4187 * G - 0.0813 * B;
  const s =
    smoothstep(128, 138, cr) *
    (1 - smoothstep(172, 182, cr)) *
    smoothstep(72, 82, cb) *
    (1 - smoothstep(124, 134, cb)) *
    smoothstep(28, 45, y) *
    (R > G - 4 ? 1 : 0.25);
  return s;
}

/**
 * @param {object} input
 *   width,height: atlas size
 *   color,normal,spec: Uint8Array RGBA of the atlas
 *   map: {position, normal, part} texel attributes
 *   headPart: primitive index of the head material
 *   landmarks: {eyeL, eyeR, mouth, jaw, nose}
 *   joints: {handL, handR, neck, head, pelvis}
 *   style: see roster.mjs
 */
export function zombify(input) {
  const { width, height, color, normal, spec, map, landmarks, joints } = input;
  const headPart = input.headPart ?? 1,
    eyePart = input.eyePart ?? -2,
    mouthPart = input.mouthPart ?? -2;
  const style = {
    seed: 1,
    palette: "ashen",
    rot: 0.6,
    veins: 0.6,
    mouthBlood: 0.7,
    chestBlood: 0.5,
    wounds: 6,
    tears: 0.5,
    dirt: 0.6,
    clothFade: 0.3,
    ...input.style,
  };
  const N = createNoise(style.seed);
  const R = N.random;
  const [skinLight, skinDark] = SKIN_PALETTES[style.palette];
  const n = width * height;
  const outColor = new Uint8Array(n * 4);
  const outMask = new Uint8Array(n * 4);
  const outNormal = new Uint8Array(n * 4);
  const bump = new Float32Array(n);
  const P = map.position,
    NN = map.normal;

  const eyeL = landmarks.eyeL,
    eyeR = landmarks.eyeR;
  const mouth = landmarks.mouth || [0, eyeL[1] - 0.08, eyeL[2] + 0.04];
  const neckY = joints.neck[1];
  const headY = joints.head[1];

  // Wounds: pick surface points (texels) with a body-region preference.
  const wounds = [];
  const covered = [];
  for (let i = 0; i < n; i += 97) if (map.part[i] >= 0) covered.push(i);
  let guard = 0;
  while (wounds.length < style.wounds && guard++ < 5000) {
    const o = covered[Math.floor(R() * covered.length)];
    const p = [P[o * 3], P[o * 3 + 1], P[o * 3 + 2]];
    const nz = NN[o * 3 + 2];
    // Prefer front torso, neck, forearms and face sides; avoid soles/eyes.
    if (p[1] < 0.35 && R() < 0.8) continue;
    if (dist(p, eyeL) < 0.05 || dist(p, eyeR) < 0.05) continue;
    if (nz < -0.2 && R() < 0.5) continue;
    const onFace = map.part[o] === headPart;
    const radius = onFace ? 0.012 + R() * 0.02 : 0.02 + R() * 0.045;
    wounds.push({
      p,
      radius,
      depth: 0.6 + R() * 0.4,
      seed: R() * 100,
      stretch: 0.6 + R() * 0.9,
    });
  }
  // A face/neck wound for most zombies: bite or torn cheek.
  if (style.faceWound !== false && R() < 0.8) {
    const side = R() < 0.5 ? eyeL : eyeR;
    wounds.push({
      p: [side[0] * 1.9, side[1] - 0.07 - R() * 0.08, side[2] - 0.035],
      radius: 0.016 + R() * 0.012,
      depth: 0.9,
      seed: R() * 100,
      stretch: 0.8,
    });
  }
  // Blood spray centres (splatter dots on clothes).
  const sprays = [];
  for (let i = 0; i < 3; i++) {
    const o = covered[Math.floor(R() * covered.length)];
    sprays.push({
      p: [P[o * 3], P[o * 3 + 1], P[o * 3 + 2]],
      radius: 0.12 + R() * 0.15,
    });
  }

  // Mean luminance of the original skin: every body gets the same range of
  // dead-skin brightness whatever its living complexion.
  let skinSum = 0,
    skinCount = 0;
  for (let o = 0; o < n; o += 7) {
    if (map.part[o] < 0 || map.part[o] === eyePart || map.part[o] === mouthPart)
      continue;
    const r = color[o * 4] / 255,
      g = color[o * 4 + 1] / 255,
      b = color[o * 4 + 2] / 255;
    if (skinColor(r, g, b) > 0.6) {
      skinSum += lum(r, g, b);
      skinCount++;
    }
  }
  const skinMean = skinCount ? skinSum / skinCount : 0.45;
  const skinGain = mix(
    1,
    (style.skinTarget ?? 0.44) / Math.max(0.08, skinMean),
    0.85,
  );

  const c = [0, 0, 0],
    tmp = [0, 0, 0];
  for (let o = 0; o < n; o++) {
    const r0 = color[o * 4] / 255,
      g0 = color[o * 4 + 1] / 255,
      b0 = color[o * 4 + 2] / 255;
    c[0] = r0;
    c[1] = g0;
    c[2] = b0;
    let blood = 0,
      wet = 0,
      glow = 0;
    let rough = 1 - (spec ? spec[o * 4] / 255 : 0.1) * 0.8;
    const part = map.part[o];
    if (part < 0) {
      writeOut(o, c, 0, 0, 0, rough);
      continue;
    }
    const x = P[o * 3],
      y = P[o * 3 + 1],
      z = P[o * 3 + 2];
    const nx = NN[o * 3],
      ny = NN[o * 3 + 1],
      nz = NN[o * 3 + 2];
    const p = [x, y, z];
    const isHead = part === headPart || part === eyePart || part === mouthPart;
    const L = lum(r0, g0, b0);

    // ---- classify ---------------------------------------------------------
    const dEyeL = dist(p, eyeL),
      dEyeR = dist(p, eyeR);
    const dEye = Math.min(dEyeL, dEyeR);
    // The eyeball is a small sphere around the landmark; the sockets are
    // the surrounding skin.
    const eyeball = part === eyePart ? 1 : 0;
    const dMouth = dist(p, mouth);
    const mouthInside = part === mouthPart ? 1 : 0;
    const dHand = Math.min(dist(p, joints.handL), dist(p, joints.handR));
    let skin = skinColor(r0, g0, b0);
    if (isHead) {
      const hair =
        (1 - smoothstep(0.1, 0.22, L)) *
        smoothstep(headY - 0.02, headY + 0.05, y);
      skin =
        Math.max(skin * 0.6, (1 - hair) * 0.95) *
        (1 - eyeball) *
        (1 - mouthInside);
    } else {
      const prior = dHand < 0.13 ? 1 : y > neckY - 0.06 ? 0.9 : 0.75;
      skin *= prior;
    }
    skin = clamp01(skin);

    // ---- shared fields ----------------------------------------------------
    const macro = N.fbm(x * 3.1, y * 3.1, z * 3.1, 4);
    const detail = N.fbm(x * 23 + 7, y * 23, z * 23, 3);
    const grit = N.noise(x * 140, y * 140, z * 140);

    // Blood running from the mouth: streaks flow down the chin, neck and
    // onto the collar/shirt front.
    let mouthFlow = 0;
    if (style.mouthBlood > 0 && y < mouth[1] + 0.015 && z > -0.02) {
      const below = mouth[1] - y;
      const lateral = Math.abs(x - mouth[0]);
      const width0 = 0.028 + below * 0.25;
      const streak = N.noise(x * 55 + 3.1, y * 4.5, z * 55);
      const fall = Math.exp(
        -Math.max(0, below) / (0.12 + style.mouthBlood * 0.35),
      );
      mouthFlow =
        (1 - smoothstep(width0 * 0.6, width0 * 1.6, lateral + streak * 0.02)) *
        fall *
        smoothstep(-0.02, 0.02, nz + 0.1) *
        style.mouthBlood;
      // Around the lips: irregular smears rather than a solid patch.
      const smear = smoothstep(
        0.35,
        0.65,
        N.noise(x * 70 + 5, y * 70, z * 70) * 0.5 + 0.5,
      );
      mouthFlow = Math.max(
        mouthFlow * (0.55 + smear * 0.45),
        (1 - smoothstep(0.008, 0.03, dMouth + (1 - smear) * 0.012)) *
          style.mouthBlood,
      );
      mouthFlow *= smoothstep(-0.3, 0.2, macro + 0.2);
    }

    // Wounds: torn flesh with a raw rim, bruised halo and a blood trail.
    let wound = 0,
      rim = 0,
      halo = 0,
      trail = 0,
      crater = 0;
    for (const w of wounds) {
      const dx = x - w.p[0],
        dy = (y - w.p[1]) * w.stretch,
        dz = z - w.p[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > w.radius * 4 && !(y < w.p[1] && d < w.radius * 9)) continue;
      const edge = N.noise(x * 60 + w.seed, y * 60, z * 60) * 0.35;
      const k = d / w.radius + edge;
      wound = Math.max(wound, 1 - smoothstep(0.55, 0.8, k));
      rim = Math.max(
        rim,
        (1 - smoothstep(0.8, 1.05, k)) * smoothstep(0.45, 0.75, k),
      );
      halo = Math.max(halo, (1 - smoothstep(1.0, 2.2, k)) * 0.8);
      crater = Math.max(crater, (1 - smoothstep(0.2, 0.85, k)) * w.depth);
      if (y < w.p[1]) {
        const lateral = Math.hypot(dx, dz);
        const drip = N.noise(x * 70 + w.seed, y * 5, z * 70);
        trail = Math.max(
          trail,
          (1 -
            smoothstep(
              w.radius * 0.5,
              w.radius * 1.3,
              lateral + drip * 0.015,
            )) *
            Math.exp(-(w.p[1] - y) / (0.1 + w.radius * 3)),
        );
      }
    }

    // Spray: many small droplets around a centre.
    let spray = 0;
    for (const s of sprays) {
      const d = dist(p, s.p);
      if (d > s.radius) continue;
      const dots = smoothstep(
        0.55,
        0.75,
        N.noise(x * 180 + 9, y * 180, z * 180),
      );
      spray = Math.max(spray, dots * (1 - d / s.radius));
    }

    // ---- skin ---------------------------------------------------------------
    if (skin > 0.01) {
      // Keep the photographic shading, drain the life out of the colour.
      const shade = Math.pow(Math.min(1, L * skinGain), 0.85) * 1.25 + 0.05;
      const mottling = smoothstep(-0.35, 0.35, macro);
      lerp3(
        tmp,
        skinLight,
        skinDark,
        clamp01(mottling * (0.35 + style.rot * 0.75)),
      );
      const s0 = [tmp[0] * shade, tmp[1] * shade, tmp[2] * shade];
      // Retain a little of the original hue for realism.
      s0[0] = mix(s0[0], r0, 0.12);
      s0[1] = mix(s0[1], g0, 0.12);
      s0[2] = mix(s0[2], b0, 0.12);
      // Rot patches: greenish-brown decay.
      const rotPatch =
        smoothstep(0.25, 0.6, N.fbm(x * 6 + 11, y * 6, z * 6, 3)) * style.rot;
      lerp3(
        s0,
        s0,
        [0.3 * shade + 0.08, 0.32 * shade + 0.07, 0.2 * shade + 0.04],
        rotPatch * 0.55,
      );
      // Lividity: blood pooled under the skin on the lower/back surfaces.
      const lividity =
        smoothstep(
          0.05,
          0.45,
          N.fbm(x * 4 + 17, y * 4, z * 4, 3) +
            (ny < -0.2 ? 0.25 : 0) +
            (nz < -0.3 ? 0.15 : 0),
        ) * style.rot;
      lerp3(s0, s0, [0.34 * shade, 0.2 * shade, 0.26 * shade], lividity * 0.45);
      // Veins, stronger on the neck, temples and forearms.
      const veinZone =
        (isHead ? 0.6 : 0.4) +
        smoothstep(neckY - 0.1, neckY + 0.02, y) *
          (1 - smoothstep(headY, headY + 0.05, y)) *
          0.8 +
        (dHand < 0.35 ? 0.5 : 0);
      const vein =
        (smoothstep(0.76, 0.93, N.ridged(x * 34, y * 20, z * 34, 3)) * 0.9 +
          smoothstep(0.8, 0.95, N.ridged(x * 90 + 5, y * 70, z * 90, 2)) *
            0.5) *
        veinZone *
        style.veins;
      lerp3(s0, s0, VEIN, clamp01(vein) * 0.7);
      // Sunken, bruised eye sockets with an inflamed rim.
      const socket = (1 - smoothstep(0.018, 0.058, dEye)) * (isHead ? 1 : 0);
      const inflamed = (1 - smoothstep(0.012, 0.024, dEye)) * (isHead ? 1 : 0);
      lerp3(s0, s0, SOCKET, socket * 0.88);
      lerp3(s0, s0, [0.42, 0.08, 0.08], inflamed * 0.55);
      // Hollow cheeks under the cheekbones.
      if (isHead) {
        const cheek = Math.min(
          dist(p, [eyeL[0] + 0.012, eyeL[1] - 0.05, eyeL[2] - 0.012]),
          dist(p, [eyeR[0] - 0.012, eyeR[1] - 0.05, eyeR[2] - 0.012]),
        );
        lerp3(s0, s0, SOCKET, (1 - smoothstep(0.008, 0.032, cheek)) * 0.35);
      }
      // Blackened lips.
      const lips = (1 - smoothstep(0.01, 0.028, dMouth)) * (isHead ? 1 : 0);
      lerp3(s0, s0, [0.12, 0.05, 0.06], lips * 0.7);
      // Fine grit/pores and dirt.
      const g = 1 + grit * 0.06 + detail * 0.08;
      s0[0] *= g;
      s0[1] *= g;
      s0[2] *= g;
      lerp3(c, c, s0, skin);
      rough = mix(rough, 0.62 - vein * 0.1, skin);
    }

    // ---- eyes and mouth interior -------------------------------------------
    if (eyeball) {
      // Milky, bloodshot zombie eye; the iris region will glow in-game.
      const irisDark = 1 - smoothstep(0.18, 0.5, L);
      lerp3(c, c, [0.7, 0.66, 0.55], 0.6);
      lerp3(
        c,
        c,
        [0.5, 0.1, 0.07],
        smoothstep(0.35, 0.75, N.noise(x * 400, y * 400, z * 400)) * 0.4,
      );
      glow = 0.08 + Math.pow(irisDark, 1.5) * 0.92;
      rough = 0.18;
      wet = 1;
    }
    if (mouthInside) {
      lerp3(c, c, [c[0] * 0.55 + 0.08, c[1] * 0.35, c[2] * 0.3], 0.8);
      wet = 1;
      rough = 0.3;
    }

    // ---- clothes ------------------------------------------------------------
    const cloth = 1 - skin;
    if (cloth > 0.01 && !eyeball && !mouthInside) {
      const k = [c[0], c[1], c[2]];
      // Fade and grime.
      const l2 = lum(k[0], k[1], k[2]);
      k[0] = mix(k[0], l2, style.clothFade);
      k[1] = mix(k[1], l2, style.clothFade);
      k[2] = mix(k[2], l2, style.clothFade);
      const grime =
        clamp01(
          smoothstep(-0.2, 0.5, macro) * 0.55 +
            (1 - smoothstep(0.1, 0.75, y)) * 0.6,
        ) * style.dirt;
      lerp3(
        k,
        k,
        [DIRT[0] + l2 * 0.25, DIRT[1] + l2 * 0.2, DIRT[2] + l2 * 0.15],
        grime * 0.55,
      );
      k[0] *= 0.88;
      k[1] *= 0.86;
      k[2] *= 0.84;
      // Tears: dark holes with raw flesh or shadow underneath.
      if (style.tears > 0 && !isHead) {
        const t = N.fbm(x * 9 + 31, y * 7, z * 9, 3);
        const hole = smoothstep(
          0.42 - style.tears * 0.12,
          0.46 - style.tears * 0.12,
          t,
        );
        const fringe =
          smoothstep(0.36 - style.tears * 0.12, 0.42 - style.tears * 0.12, t) -
          hole;
        lerp3(
          k,
          k,
          [k[0] * 1.25, k[1] * 1.2, k[2] * 1.15],
          clamp01(fringe) * 0.5,
        );
        lerp3(
          tmp,
          [0.32, 0.12, 0.1],
          [0.06, 0.03, 0.03],
          smoothstep(-0.2, 0.3, detail),
        );
        lerp3(k, k, tmp, hole * 0.92);
        crater = Math.max(crater, hole * 0.4);
      }
      // Blood soaked shirt front and collar.
      if (style.chestBlood > 0 && !isHead) {
        const front = smoothstep(-0.1, 0.35, nz);
        const band =
          smoothstep(0.85, 1.05, y) *
          (1 - smoothstep(neckY + 0.02, neckY + 0.08, y));
        const soak =
          smoothstep(
            0.05,
            0.45,
            N.fbm(x * 4.5 + 5, y * 2.2, z * 4.5, 4) +
              style.chestBlood * 0.45 -
              0.35,
          ) *
          front *
          band;
        blood = Math.max(blood, soak * style.chestBlood);
      }
      lerp3(c, c, k, cloth);
      rough = mix(rough, 0.92, cloth);
    }

    // ---- blood and wounds (skin and cloth alike) ---------------------------
    blood = Math.max(blood, mouthFlow, trail * 0.9, spray * 0.85, halo * 0.25);
    if (blood > 0.01) {
      const fresh = smoothstep(
        0.3,
        0.9,
        N.noise(x * 25 + 1, y * 25, z * 25) * 0.5 + 0.5,
      );
      lerp3(tmp, BLOOD_DRY, BLOOD_WET, fresh);
      const shade = 0.75 + L * 0.5;
      lerp3(
        c,
        c,
        [tmp[0] * shade, tmp[1] * shade, tmp[2] * shade],
        clamp01(blood) * 0.92,
      );
      wet = Math.max(wet, blood * fresh);
      rough = mix(rough, 0.35, blood * fresh);
    }
    if (halo > 0.01 && wound < 0.5) {
      lerp3(c, c, [0.3, 0.12, 0.17], halo * 0.35 * skin);
    }
    if (rim > 0.01) {
      lerp3(c, c, FLESH_PINK, rim * 0.7);
      lerp3(c, c, FLESH_RAW, rim * 0.5);
      wet = Math.max(wet, rim);
    }
    if (wound > 0.01) {
      const meat = smoothstep(-0.3, 0.4, N.noise(x * 90, y * 90, z * 90));
      lerp3(tmp, FLESH_DARK, FLESH_RAW, meat * 0.8);
      lerp3(c, c, tmp, wound * 0.97);
      wet = Math.max(wet, wound);
      rough = mix(rough, 0.28, wound);
    }
    bump[o] =
      -crater +
      (skin > 0.5 ? detail * 0.08 + (wound > 0 ? 0 : grit * 0.02) : 0);

    // Extra blood potential for the per-instance "fresh blood" level: front
    // of the torso, hands and around wounds and mouth.
    // Sparse: fresh blood appears in patches, most likely on the chest
    // front, the hands, around wounds and below the mouth.
    const patch = smoothstep(0.05, 0.55, N.fbm(x * 5 + 41, y * 3, z * 5, 3));
    const potential = clamp01(
      patch *
        (smoothstep(-0.2, 0.4, nz) * smoothstep(0.75, 1.15, y) * 0.8 +
          (dHand < 0.15 ? 0.6 : 0)) +
        halo * 0.55 +
        mouthFlow * 0.7,
    );
    writeOut(o, c, potential, wet, glow, rough);
  }

  dilatePainted(outColor, outMask, width, height, map.part, 24);

  // Normal map: original tangent-space normals perturbed by the bump field.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = y * width + x;
      let nx = normal[o * 4] / 127.5 - 1,
        ny = normal[o * 4 + 1] / 127.5 - 1,
        nz = normal[o * 4 + 2] / 127.5 - 1;
      const h = bump[o];
      if (h !== 0 && x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const scale = 6 * (width / 2048);
        const du = (bump[o + 1] - bump[o - 1]) * scale;
        const dv = (bump[o + width] - bump[o - width]) * scale;
        nx -= du;
        ny += dv;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      outNormal[o * 4] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      outNormal[o * 4 + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
      outNormal[o * 4 + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
      outNormal[o * 4 + 3] = 255;
    }

  function writeOut(o, col, potential, wetness, eyeGlow, roughness) {
    outColor[o * 4] = Math.round(clamp01(col[0]) * 255);
    outColor[o * 4 + 1] = Math.round(clamp01(col[1]) * 255);
    outColor[o * 4 + 2] = Math.round(clamp01(col[2]) * 255);
    outColor[o * 4 + 3] = 255;
    outMask[o * 4] = Math.round(clamp01(potential) * 255);
    outMask[o * 4 + 1] = Math.round(clamp01(wetness) * 255);
    outMask[o * 4 + 2] = Math.round(clamp01(eyeGlow) * 255);
    outMask[o * 4 + 3] = Math.round(clamp01(roughness) * 255);
  }
  return { color: outColor, mask: outMask, normal: outNormal, wounds };
}

/**
 * Fill texels outside every UV island with the nearest painted value, so
 * mipmaps never bleed the original (unpainted) padding into the islands.
 */
function dilatePainted(colorBuf, maskBuf, width, height, part, passes) {
  const filled = new Uint8Array(width * height);
  for (let i = 0; i < part.length; i++) filled[i] = part[i] >= 0 ? 1 : 0;
  let frontier = [];
  for (let i = 0; i < filled.length; i++) if (filled[i]) frontier.push(i);
  for (let p = 0; p < passes && frontier.length; p++) {
    const next = [];
    for (const o of frontier) {
      const x = o % width,
        y = (o / width) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (filled[q]) continue;
        filled[q] = 1;
        for (let k = 0; k < 4; k++) {
          colorBuf[q * 4 + k] = colorBuf[o * 4 + k];
          maskBuf[q * 4 + k] = maskBuf[o * 4 + k];
        }
        next.push(q);
      }
    }
    frontier = next;
  }
}

/** Dirty, thinned, greasy hair cards. */
export function zombifyHair(
  rgba,
  width,
  height,
  { seed = 1, grey = 0.4 } = {},
) {
  const N = createNoise(seed + 77);
  const out = new Uint8Array(rgba.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r = rgba[o] / 255,
        g = rgba[o + 1] / 255,
        b = rgba[o + 2] / 255;
      const l = lum(r, g, b);
      r = mix(r, l, grey) * 0.85;
      g = mix(g, l, grey) * 0.82;
      b = mix(b, l, grey) * 0.8;
      const clump = N.noise((x / width) * 60, (y / height) * 60, 0.5);
      // Thin the strands: raise the alpha cut-off irregularly.
      const a = (rgba[o + 3] / 255) * (0.88 + clump * 0.2);
      out[o] = Math.round(clamp01(r) * 255);
      out[o + 1] = Math.round(clamp01(g) * 255);
      out[o + 2] = Math.round(clamp01(b) * 255);
      out[o + 3] = Math.round(clamp01(a) * 255);
    }
  return out;
}
