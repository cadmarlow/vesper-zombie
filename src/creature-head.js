import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Each head has a continuous facial surface around an OPEN mouth. The inner
// boundary continues into a throat; no teeth or cavity are buried in a sphere.
const FACES = {
  walker: {
    width: 0.119,
    height: 0.166,
    mouth: 0.05,
    gape: 0.018,
    jaw: 0.036,
  },
  runner: { width: 0.108, height: 0.174, mouth: 0.061, gape: 0.026, jaw: 0.13 },
  brute: { width: 0.133, height: 0.177, mouth: 0.056, gape: 0.019, jaw: 0.045 },
  spitter: {
    width: 0.127,
    height: 0.168,
    mouth: 0.068,
    gape: 0.032,
    jaw: 0.16,
  },
  wraith: { width: 0.11, height: 0.179, mouth: 0.049, gape: 0.02, jaw: 0.09 },
};

const faceTextures = new Map();
export async function prepareCreatureSkins(lite = false) {
  const size = lite ? 512 : 1024;
  if (!faceTextures.has(size)) {
    const texture = Promise.all(
      ["face", "skin"].map(async (channel) => {
        const map = await new T.TextureLoader().loadAsync(
          `/textures/creatures/${channel}-${size}.webp`,
        );
        map.colorSpace = T.SRGBColorSpace;
        map.anisotropy = 4;
        if (channel === "skin") map.wrapS = map.wrapT = T.RepeatWrapping;
        map.userData.sharedSurface = true;
        faceTextures.set(`${channel}-${size}-ready`, map);
        return map;
      }),
    ).catch((error) => {
      faceTextures.delete(size);
      throw error;
    });
    faceTextures.set(size, texture);
  }
  return faceTextures.get(size);
}

export function creatureSkinTexture(lite = false, channel = "skin") {
  return (
    faceTextures.get(`${channel}-${lite ? 512 : 1024}-ready`) ||
    faceTextures.get(`${channel}-1024-ready`) ||
    faceTextures.get(`${channel}-512-ready`)
  );
}

const gaussian = (x, y, cx, cy, rx, ry) =>
  Math.exp(-(((x - cx) / rx) ** 2) - ((y - cy) / ry) ** 2);

export function buildCreatureHead({
  type,
  skinTint = null,
  lite,
  far = false,
  add: append,
  skin,
  wound,
  tooth,
  eye,
}) {
  const f = FACES[type],
    cy = 1.781,
    my = 1.699,
    depth = 0.131;
  const count = far ? 24 : lite ? 48 : 72,
    rows = far ? 9 : lite ? 17 : 26,
    backRows = far ? 4 : lite ? 8 : 12;
  const faceMaterial = skin.clone();
  faceMaterial.map = creatureSkinTexture(lite, "face") || skin.map;
  faceMaterial.bumpMap = faceMaterial.map;
  faceMaterial.bumpScale = 0.0015;
  faceMaterial.roughness = 0.78;
  faceMaterial.color.set(
    skinTint ||
      (type === "spitter" ? 0xb5bd8a : type === "wraith" ? 0xb3c4c7 : 0xd1c6b5),
  );
  const add = append;
  const ball = (material, weight, x, y, z, sx, sy, sz) =>
    add(
      new T.SphereGeometry(
        1,
        far ? 7 : lite ? 10 : 16,
        far ? 5 : lite ? 8 : 12,
      ),
      material,
      weight,
      x,
      y,
      z,
      sx,
      sy,
      sz,
    );
  const tube = (material, weight, points, radius) =>
    add(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
        far ? 6 : lite ? 12 : 18,
        radius,
        far ? 4 : lite ? 5 : 6,
        false,
      ),
      material,
      weight,
    );
  ball(skin, "neck", 0, 1.56, 0, 0.066, 0.092, 0.06);
  const faceUV = (x, y) => {
    const anchors = [
      [cy - f.height, 0.995],
      [my - f.gape, 0.8],
      [my, 0.727],
      [my + f.gape, 0.651],
      [1.764, 0.527],
      [1.809, 0.337],
      [1.838, 0.238],
      [cy + f.height, 0.012],
    ];
    let v = 0.012;
    for (let i = 1; i < anchors.length; i++) {
      if (y <= anchors[i][0]) {
        const [ya, va] = anchors[i - 1],
          [yb, vb] = anchors[i];
        v = T.MathUtils.lerp(
          va,
          vb,
          T.MathUtils.clamp((y - ya) / (yb - ya), 0, 1),
        );
        break;
      }
    }
    const mouthInfluence = Math.exp(-(((y - my) / 0.04) ** 2));
    return [
      T.MathUtils.clamp(
        0.5 + x * T.MathUtils.lerp(3.75, 0.2 / f.mouth, mouthInfluence),
        0.035,
        0.965,
      ),
      1 - v,
    ];
  };
  const jawWeight = (y, x, z) => {
    const amount =
      (1 - T.MathUtils.smoothstep(y, my - 0.014, my + 0.016)) *
      T.MathUtils.smoothstep(z, -0.067, 0.018);
    return [
      ["head", 1 - amount],
      ["jaw", amount],
    ];
  };
  const faceZ = (x, y) => {
    const xn = x / f.width,
      yn = (y - cy) / f.height;
    const front = Math.sqrt(Math.max(0, 1 - xn * xn - yn * yn));
    let z = depth * front - 0.01;
    // Asymmetric atrophy and brow creases keep the silhouette from reading as
    // a mirrored mask. These are geometry, so they survive every quality mode.
    z -= gaussian(x, y, -0.073, 1.73, 0.022, 0.048) * 0.011;
    z += gaussian(x, y, 0.081, 1.784, 0.021, 0.015) * 0.008;
    z -= gaussian(x, y, -0.026, 1.863, 0.004, 0.025) * 0.003;
    z -= gaussian(x, y, 0.021, 1.863, 0.004, 0.025) * 0.0025;
    // Bony planes, hollow temples and cheeks, orbital sockets, nasal bridge.
    z += gaussian(x, y, 0, 1.792, 0.018, 0.057) * 0.036;
    z += gaussian(x, y, 0, 1.764, 0.022, 0.018) * 0.031;
    z += gaussian(x, y, 0, 1.643, 0.055, 0.033) * 0.012;
    for (const s of [-1, 1]) {
      z -= gaussian(x, y, s * 0.048, 1.811, 0.027, 0.021) * 0.034;
      z += gaussian(x, y, s * 0.049, 1.838, 0.038, 0.012) * 0.018;
      z += gaussian(x, y, s * 0.076, 1.779, 0.027, 0.017) * 0.023;
      z -=
        gaussian(x, y, s * 0.079, 1.728, 0.03, 0.034) *
        (type === "spitter" ? 0.009 : 0.028);
      z -= gaussian(x, y, s * 0.095, 1.828, 0.022, 0.029) * 0.013;
      z += gaussian(x, y, s * 0.036, 1.744, 0.01, 0.021) * 0.011;
    }
    return z;
  };
  const lip = (angle) => {
    const x = Math.cos(angle) * f.mouth;
    const sine = Math.sin(angle);
    const y =
      my +
      Math.sign(sine) * Math.abs(sine) ** (sine > 0 ? 0.65 : 0.85) * f.gape +
      Math.cos(angle) * 0.003;
    return [x, y, faceZ(x, y) + 0.008];
  };
  const positions = [],
    uvs = [],
    colors = [],
    indices = [];
  const tint = new T.Color();
  for (let row = 0; row <= rows + backRows; row++) {
    for (let i = 0; i <= count; i++) {
      const a = (i / count) * Math.PI * 2;
      const [mx, myy, mz] = lip(a);
      const lower = Math.max(0, -Math.sin(a));
      const jawWidth =
        type === "brute" ? 0.13 : type === "spitter" ? 0.1 : -0.08;
      const ox = Math.cos(a) * f.width * (1 + lower * jawWidth);
      const oy = cy + Math.sin(a) * f.height;
      let x, y, z;
      if (row <= rows) {
        const r = row / rows;
        x = T.MathUtils.lerp(mx, ox, r);
        y = T.MathUtils.lerp(myy, oy, r);
        z = faceZ(x, y) + (1 - T.MathUtils.smoothstep(r, 0, 0.16)) * 0.008;
        // Resolve the shared cranium seam exactly even on the broad mandible.
        if (row === rows) z = -0.01;
      } else {
        const theta = (((row - rows) / backRows) * Math.PI) / 2;
        x = ox * Math.cos(theta);
        y = cy + (oy - cy) * Math.cos(theta);
        z = -0.01 - Math.sin(theta) * 0.128;
      }
      positions.push(x, y, z);
      if (row <= rows) uvs.push(...faceUV(x, y));
      else {
        const boundary = faceUV(ox, oy),
          blend = T.MathUtils.smoothstep((row - rows) / backRows, 0, 0.6);
        uvs.push(
          T.MathUtils.lerp(boundary[0], 0.14 + Math.cos(a) * 0.07, blend),
          T.MathUtils.lerp(boundary[1], 0.87 + Math.sin(a) * 0.065, blend),
        );
      }
      // Authored discoloration follows anatomy, independent of texture LOD.
      const orbit = [-1, 1].reduce(
        (sum, s) => sum + gaussian(x, y, s * 0.049, 1.81, 0.034, 0.029),
        0,
      );
      const lips = row < 2 ? (1 - row / 2) * 0.15 : 0;
      const temple = gaussian(x, y, -0.077, 1.859, 0.035, 0.034) * 0.28;
      tint.setRGB(
        1 - orbit * 0.1 - lips * 0.27,
        1 - orbit * 0.12 - lips * 0.66 - temple * 0.3,
        1 - orbit * 0.12 - lips * 0.58 - temple * 0.2,
      );
      colors.push(tint.r, tint.g, tint.b);
      if (row < rows + backRows && i < count) {
        const b = row * (count + 1) + i,
          n = b + count + 1;
        indices.push(b, n, b + 1, b + 1, n, n + 1);
      }
    }
  }
  const face = new T.BufferGeometry();
  face.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  face.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  face.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  face.setIndex(indices);
  face.computeVertexNormals();
  add(face, faceMaterial, jawWeight);

  // Recessed oral walls are a closed funnel, with correct depth/occlusion from
  // every angle. Lower lip, gums, teeth, tongue and chin follow the jaw bone.
  const cavityPositions = [],
    cavityUV = [],
    cavityIndices = [];
  for (let r = 0; r <= 5; r++) {
    for (let i = 0; i <= count; i++) {
      const [x, y, z] = lip((i / count) * Math.PI * 2),
        t = r / 5;
      cavityPositions.push(
        x * (1 - t * 0.96),
        T.MathUtils.lerp(y, my, t * 0.94),
        T.MathUtils.lerp(z - 0.001, 0.014, t),
      );
      cavityUV.push(i / count, t);
      if (r < 5 && i < count) {
        const b = r * (count + 1) + i,
          n = b + count + 1;
        cavityIndices.push(b, b + 1, n, b + 1, n + 1, n);
      }
    }
  }
  const cavity = new T.BufferGeometry();
  cavity.setAttribute(
    "position",
    new T.Float32BufferAttribute(cavityPositions, 3),
  );
  cavity.setAttribute("uv", new T.Float32BufferAttribute(cavityUV, 2));
  cavity.setAttribute(
    "color",
    new T.Float32BufferAttribute(
      new Float32Array(cavityPositions.length).fill(0.13),
      3,
    ),
  );
  cavity.setIndex(cavityIndices);
  cavity.computeVertexNormals();
  add(cavity, wound, jawWeight);
  ball(wound, "head", 0, my, 0.01, f.mouth * 0.5, f.gape * 0.65, 0.008);
  for (const upper of [true, false]) {
    const points = [];
    for (let j = 0; j <= 16; j++) {
      const angle = (upper ? 0 : Math.PI) + (j / 16) * Math.PI;
      const p = lip(angle);
      p[2] += 0.001;
      points.push(p);
    }
    tube(wound, jawWeight, points, type === "spitter" ? 0.0038 : 0.0023);
    for (let i = 0; i < (far ? 0 : 9); i++) {
      const missing =
        type === "runner"
          ? [1, 6]
          : type === "spitter"
            ? [1, 4, 7]
            : type === "wraith"
              ? [2, 7]
              : [upper ? 2 : 6];
      if (missing.includes(i)) continue;
      const u = (i - 4) / 5.1,
        x = u * f.mouth;
      const edge =
        my + (upper ? 1 : -1) * (f.gape * 0.71 - Math.abs(u) * 0.007);
      const length =
        0.0085 +
        (i % 3) * 0.0012 +
        (type === "runner" && (i === 2 || i === 7) ? 0.006 : 0);
      const y = edge + (upper ? -1 : 1) * (length / 2 + 0.0015);
      const geo = new RoundedBoxGeometry(
        0.0073 + (i % 2) * 0.0007,
        length,
        0.009,
        1,
        0.0015,
      );
      const p = geo.attributes.position;
      const enamel = [];
      for (let v = 0; v < p.count; v++) {
        const tip = upper ? p.getY(v) < 0 : p.getY(v) > 0;
        if (tip) p.setX(v, p.getX(v) * 0.78);
        if (tip && p.getX(v) > 0)
          p.setY(v, p.getY(v) + (upper ? 1 : -1) * 0.0025);
        const stain = (tip ? 0.89 : 0.61) - (i % 3) * 0.04;
        enamel.push(stain, stain * 0.91, stain * 0.75);
      }
      geo.setAttribute("color", new T.Float32BufferAttribute(enamel, 3));
      geo.computeVertexNormals();
      add(
        geo,
        tooth,
        upper ? "head" : "jaw",
        x,
        y,
        faceZ(0, my) - 0.002 - u * u * 0.031,
        1,
        1,
        1,
        new T.Euler(0, u * 0.75, ((i % 3) - 1) * 0.09),
      );
    }
  }
  ball(wound, "jaw", 0, my - 0.019, 0.06, 0.026, 0.008, 0.034);

  for (const s of [-1, 1]) {
    const x = s * 0.048,
      y = 1.809,
      z = faceZ(x, y);
    // An open orbital rim, not a dark ellipsoid enclosing the whole eyeball.
    // The previous closed socket hid the sclera and left floating iris discs.
    add(
      new T.TorusGeometry(
        1,
        0.16,
        far ? 3 : lite ? 5 : 8,
        far ? 8 : lite ? 18 : 28,
      ),
      wound,
      "head",
      x,
      y,
      z + 0.002,
      0.019,
      0.0105,
      0.012,
    );
    // Emission belongs to the iris, not a glowing sphere filling the socket.
    ball(tooth, "head", x, y, z + 0.01, 0.013, 0.0075, 0.008);
    ball(
      eye,
      "head",
      x - s * 0.001,
      y - 0.0005,
      z + 0.018,
      0.0048,
      0.0043,
      0.003,
    );
    ball(
      wound,
      "head",
      x - s * 0.001,
      y - 0.0005,
      z + 0.0205,
      0.0022,
      0.0033,
      0.0014,
    );
    for (const upper of [true, false]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI;
        pts.push([
          x + Math.cos(a) * 0.021,
          y + (upper ? 1 : -1) * Math.sin(a) * 0.009 + s * Math.cos(a) * 0.003,
          z + 0.013 - Math.abs(Math.cos(a)) * 0.006,
        ]);
      }
      tube(skin, "head", pts, upper ? 0.0023 : 0.0017);
    }
    // Helix, concha and lobe give the ear depth in a three-quarter view.
    ball(
      skin,
      "head",
      s * (f.width + 0.004),
      1.776,
      -0.011,
      0.018,
      0.035,
      0.022,
    );
    ball(
      wound,
      "head",
      s * (f.width + 0.009),
      1.778,
      0.008,
      0.009,
      0.023,
      0.005,
    );
    tube(
      skin,
      "head",
      [
        [s * (f.width + 0.009), 1.753, 0.011],
        [s * (f.width + 0.02), 1.782, 0.009],
        [s * (f.width + 0.012), 1.806, 0.002],
        [s * (f.width - 0.002), 1.803, 0.009],
      ],
      0.0045,
    );
    tube(
      skin,
      "neck",
      [
        [s * 0.039, 1.639, 0.011],
        [s * 0.032, 1.567, 0.061],
        [s * 0.078, 1.507, 0.052],
      ],
      0.005,
    );
    // Nasolabial crease and taut cheek tendon frame the opening.
    const crease = [
      [s * 0.028, 1.755],
      [s * 0.042, 1.735],
      [s * f.mouth * 0.94, 1.711],
    ];
    tube(
      skin,
      jawWeight,
      crease.map(([xx, yy]) => [xx, yy, faceZ(xx, yy) - 0.001]),
      0.0015,
    );
  }
  if (type === "spitter") {
    ball(skin, "neck", 0, 1.546, 0.023, 0.07, 0.078, 0.05);
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.023,
        y = 1.627 + Math.sin(i * 2.1) * 0.006;
      ball(skin, "jaw", x, y, faceZ(x, y), 0.009, 0.009, 0.01);
    }
  }
  return { restingJaw: f.jaw };
}

export function jawOpening(type, t, attacking) {
  const breath = (Math.sin(t * (type === "runner" ? 5.3 : 2.1)) + 1) * 0.024;
  return (
    FACES[type].jaw + breath + (attacking ? 0.2 + Math.sin(t * 7) * 0.055 : 0)
  );
}
