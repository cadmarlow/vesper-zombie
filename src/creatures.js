import * as T from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ENEMIES } from "./config.js";
import { surface } from "./surfaces.js";
import { rng } from "./logic.js";
import { buildCreatureHead, creatureSkinTexture } from "./creature-head.js";
import {
  hordeModel,
  setHordeDetail,
  releaseHorde,
  destroyHordeHead,
} from "./horde/library.js";
import { animateHorde } from "./horde/animator.js";
import { animateZombie as animateProcedural } from "./creature-motion.js";

const templates = new Map();
// These dimensions are shared by every geometric LOD. Keeping a single bind
// skeleton lets a close-up hand keep its pose when its mesh changes detail.
const RIG_DIMENSIONS = Object.freeze({
  hipHeight: 0.88,
  upperLeg: 0.42,
  lowerLeg: 0.36,
  ankleHeight: 0.1,
  ankleForward: 0.025,
  soleHeight: 0.024,
  toePivotZ: 0.13,
  hipWidth: 0.23,
});
const FINGER_LENGTHS = [0.091, 0.112, 0.106, 0.083];
let skinTexture;
let stumpGeometry, stumpMaterial;
function fleshTexture() {
  if (skinTexture) return skinTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d"),
    r = rng(84021);
  c.fillStyle = "#b7b1a2";
  c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2800; i++) {
    const x = r() * 512,
      y = r() * 512,
      size = 1 + r() ** 3 * 38;
    const gradient = c.createRadialGradient(x, y, 0, x, y, size);
    gradient.addColorStop(
      0,
      i % 3 ? "rgba(52,55,41,.15)" : "rgba(92,31,30,.24)",
    );
    gradient.addColorStop(1, "rgba(50,30,25,0)");
    c.fillStyle = gradient;
    c.fillRect(x - size, y - size, size * 2, size * 2);
  }
  for (let i = 0; i < 75; i++) {
    let x = r() * 512,
      y = r() * 512;
    c.beginPath();
    c.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (r() - 0.45) * 18;
      y += r() * 17;
      c.lineTo(x, y);
    }
    c.strokeStyle = "rgba(67,46,40,.24)";
    c.lineWidth = 0.4 + r();
    c.stroke();
  }
  const image = c.getImageData(0, 0, 512, 512);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (r() - 0.5) * 17;
    for (let j = 0; j < 3; j++) image.data[i + j] += n;
  }
  c.putImageData(image, 0, 0);
  skinTexture = new T.CanvasTexture(canvas);
  skinTexture.colorSpace = T.SRGBColorSpace;
  skinTexture.userData.sharedSurface = true;
  return skinTexture;
}

// detail: "full" (close range), "lite" (phones, mid range) or "far" (distant
// horde members: a few pixels tall, no teeth, coarse limbs).
function build(type, detail = "full") {
  const lite = detail !== "full",
    far = detail === "far";
  const g = new T.Group(),
    def = ENEMIES[type],
    // A boss reuses another type's anatomy with its own tint, scale and eyes.
    look = def.look || type,
    bones = [],
    indices = {};
  const bone = (name, parent, x, y, z = 0) => {
    const b = new T.Bone();
    b.name = name;
    b.position.set(x, y, z);
    b.userData.restPosition = [x, y, z];
    b.userData.restQuaternion = [0, 0, 0, 1];
    parent.add(b);
    indices[name] = bones.length;
    bones.push(b);
    return b;
  };
  const hips = bone("hips", g, 0, 0.88);
  const spine = bone("spine", hips, 0, 0.19);
  const torso = bone("torso", spine, 0, 0.28);
  const neck = bone("neck", torso, 0, 0.22);
  const head = bone("head", neck, 0, 0.2);
  bone("jaw", head, 0, -0.039, -0.018);
  for (const [i, s] of [-1, 1].entries()) {
    const shoulder = bone(`shoulder${i}`, torso, s * 0.12, 0.1);
    const a = bone(`arm${i}`, shoulder, s * 0.145, 0.01);
    const e = bone(`elbow${i}`, a, s * 0.016, -0.305);
    const wrist = bone(`wrist${i}`, e, 0, -0.29);
    for (let j = 0; j < 4; j++) {
      const finger = bone(
        `finger${i}_${j}`,
        wrist,
        s * (j - 1.5) * 0.025,
        -0.067,
        0.01,
      );
      bone(`fingerTip${i}_${j}`, finger, s * 0.001, -0.043, -0.006);
    }
    const thumb = bone(`thumb${i}`, wrist, -s * 0.047, -0.011, 0.008);
    bone(`thumbTip${i}`, thumb, -s * 0.023, -0.038, -0.01);
    const thigh = bone(`leg${i}`, hips, s * 0.115, 0);
    const shin = bone(`shin${i}`, thigh, 0, -0.42);
    const foot = bone(`foot${i}`, shin, 0, -0.36, 0.025);
    bone(`toe${i}`, foot, 0, -0.033, 0.105);
  }
  g.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones);
  const skin = new T.MeshStandardMaterial({
    color:
      def.tint ||
      (look === "spitter" ? 0xb5bd8a : look === "wraith" ? 0xb3c4c7 : 0xd1c6b5),
    map: creatureSkinTexture(lite) || fleshTexture(),
    bumpMap: creatureSkinTexture(lite) || fleshTexture(),
    bumpScale: 0.0018,
    roughness: 0.8,
    metalness: 0,
  });
  const cloth = surface(
    "cloth",
    look === "runner"
      ? 0x625247
      : look === "wraith"
        ? 0x303537
        : look === "spitter"
          ? 0x969887
          : look === "brute"
            ? 0x434c47
            : 0x61716a,
    { roughness: 1, metalness: 0, normalScale: new T.Vector2(0.42, 0.42) },
  );
  // Coat panels, hood and stole show their reverse side; the rest of the
  // garment is a closed volume and stays single-sided (half the fragments).
  // Phones keep one double-sided cloth pass: an extra draw call per zombie
  // costs their CPU more than the hidden back faces cost their GPU.
  const drape = lite ? cloth : cloth.clone();
  drape.side = T.DoubleSide;
  const leather = surface("cloth", 0x1b2423, {
    roughness: 0.8,
    metalness: 0,
    normalScale: new T.Vector2(0.28, 0.28),
  });
  const steel = surface("metal", 0x73786b, {
    roughness: 0.78,
    metalness: 0.65,
    normalScale: new T.Vector2(0.3, 0.3),
  });
  const wound = new T.MeshStandardMaterial({
    color: 0x351a17,
    roughness: 0.63,
  });
  const eye = new T.MeshStandardMaterial({
    color: def.eye,
    emissive: def.eye,
    emissiveIntensity: 1.05,
    roughness: 0.3,
  });
  const tooth = new T.MeshStandardMaterial({
    color: 0xa59472,
    roughness: 0.85,
  });
  // Teeth and oral tissue must retain their own color and depth, without the
  // mottled skin map darkening the enamel. One shared pass for all oral parts.
  const oral = new T.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.91,
    vertexColors: true,
    side: T.DoubleSide,
  });
  const buckets = new Map();
  skin.vertexColors = cloth.vertexColors = drape.vertexColors = true;
  function add(
    geo,
    material,
    weight,
    x = 0,
    y = 0,
    z = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    rotation = null,
  ) {
    const matrix = new T.Matrix4().compose(
      new T.Vector3(x, y, z),
      new T.Quaternion().setFromEuler(rotation || new T.Euler()),
      new T.Vector3(sx, sy, sz),
    );
    geo.applyMatrix4(matrix);
    const p = geo.attributes.position,
      si = new Uint16Array(p.count * 4),
      sw = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const weights =
        typeof weight === "string"
          ? [[weight, 1]]
          : weight(p.getY(i), p.getX(i), p.getZ(i));
      weights.forEach(([name, w], j) => {
        si[i * 4 + j] = indices[name];
        sw[i * 4 + j] = w;
      });
    }
    geo.setAttribute("skinIndex", new T.Uint16BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new T.Float32BufferAttribute(sw, 4));
    // Batch compatible surfaces while preserving anatomical vertex tints.
    const sourceColor = material.color;
    if (material === wound || material === tooth) material = oral;
    if (material === leather) material = cloth;
    if (material.vertexColors) {
      const colors = new Float32Array(p.count * 3);
      const rgb = [
        sourceColor.r / material.color.r,
        sourceColor.g / material.color.g,
        sourceColor.b / material.color.b,
      ];
      const authored = geo.getAttribute("color");
      for (let i = 0; i < p.count; i++) {
        colors.set(
          authored
            ? [
                rgb[0] * authored.getX(i),
                rgb[1] * authored.getY(i),
                rgb[2] * authored.getZ(i),
              ]
            : rgb.map((v, j) => {
                // Mud darkens boots, hems and elbows; broad discoloration is
                // authored per vertex and remains free of new texture fetches.
                const y = p.getY(i),
                  x = p.getX(i),
                  z = p.getZ(i);
                const soil = 1 - T.MathUtils.smoothstep(y, 0.1, 0.62);
                const stain = Math.max(
                  0,
                  Math.sin(x * 17 + y * 9) * Math.sin(z * 23 - y * 7),
                );
                return v * (1 - soil * 0.4 - stain * (j === 0 ? 0.12 : 0.18));
              }),
          i * 3,
        );
      }
      geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    }
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geo.index ? geo.toNonIndexed() : geo);
  }
  const blend = (a, b, lo, hi) => (y) => {
    const t = T.MathUtils.smoothstep(y, lo, hi);
    return [
      [a, 1 - t],
      [b, t],
    ];
  };
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
  const block = (material, weight, x, y, z, w, h, d, rotation) =>
    add(
      lite
        ? new T.BoxGeometry(w, h, d)
        : new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * 0.18),
      material,
      weight,
      x,
      y,
      z,
      1,
      1,
      1,
      rotation,
    );
  const tube = (material, weight, points, radius) =>
    add(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
        far ? 5 : 9,
        radius,
        far ? 4 : 6,
        false,
      ),
      material,
      weight,
    );
  const garment = (profile, segments = 18) => {
    const closedProfile = [
      [0, profile[0][1]],
      ...profile,
      [0, profile.at(-1)[1] + 0.006],
    ];
    const geo = new T.LatheGeometry(
      closedProfile.map(([radius, y]) => new T.Vector2(radius, y)),
      far ? Math.min(segments, 8) : lite ? Math.min(segments, 14) : segments,
    );
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        a = Math.atan2(z, x);
      const fold =
        1 + Math.sin(y * 64 + a * 3) * 0.027 + Math.cos(a * 7 + y * 31) * 0.033;
      p.setXYZ(i, x * fold, y, z * fold * 0.91);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const torsoWeights = (y) =>
    y > 1.13
      ? blend("spine", "torso", 1.13, 1.36)(y)
      : blend("hips", "spine", 0.86, 1.13)(y);
  const body = new T.LatheGeometry(
    [
      new T.Vector2(0.21, 0.7),
      new T.Vector2(0.235, 0.78),
      new T.Vector2(0.21, 0.93),
      new T.Vector2(0.19, 1.04),
      new T.Vector2(0.22, 1.24),
      new T.Vector2(0.268, 1.39),
      new T.Vector2(0.245, 1.46),
      new T.Vector2(0.12, 1.53),
    ],
    far ? 12 : lite ? 22 : 36,
  );
  // Irregular cloth folds form part of the skinned silhouette.
  for (let i = 0; i < body.attributes.position.count; i++) {
    const p = body.attributes.position,
      x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      a = Math.atan2(z, x);
    const ripple =
      1 + Math.sin(y * 48 + a * 4) * 0.025 + Math.cos(a * 9 + y * 22) * 0.021;
    p.setXYZ(i, x * ripple, y, z * ripple * 0.66);
  }
  body.computeVertexNormals();
  add(body, cloth, torsoWeights);
  buildCreatureHead({
    type: look,
    skinTint: def.tint,
    lite,
    far,
    add,
    ball,
    tube,
    skin,
    wound,
    tooth,
    eye,
    cloth,
  });
  // Collar and lapels, seam, folded pockets, thin leather webbing and buckles.
  for (const s of [-1, 1]) {
    block(
      cloth,
      "torso",
      s * 0.082,
      1.474,
      0.084,
      0.105,
      0.145,
      0.027,
      new T.Euler(0, 0, s * 0.28),
    );
    if (look !== "wraith" && !(look === "runner" && s === -1)) {
      block(cloth, torsoWeights, s * 0.116, 1.278, 0.15, 0.135, 0.16, 0.027);
      block(
        leather,
        torsoWeights,
        s * 0.145,
        1.25,
        0.178,
        0.033,
        0.43,
        0.019,
        new T.Euler(0, 0, s * 0.1),
      );
      block(steel, torsoWeights, s * 0.145, 1.15, 0.194, 0.045, 0.031, 0.013);
      block(cloth, "hips", s * 0.19, 0.898, 0.115, 0.108, 0.12, 0.065);
      // Pocket flap, stitching and a slanted seam catch light at normal range.
      block(
        cloth,
        torsoWeights,
        s * 0.116,
        1.353,
        0.17,
        0.141,
        0.037,
        0.011,
        new T.Euler(-0.18, 0, s * 0.06),
      );
      tube(
        leather,
        torsoWeights,
        [
          [s * 0.054, 1.195, 0.168],
          [s * 0.174, 1.202, 0.151],
          [s * 0.177, 1.326, 0.153],
        ],
        0.0018,
      );
    }
  }
  block(leather, "hips", 0, 0.94, 0.015, 0.427, 0.062, 0.289);
  block(steel, "hips", 0.02, 0.939, 0.171, 0.066, 0.052, 0.012);
  for (let i = 0; i < 5; i++)
    ball(
      steel,
      torsoWeights,
      0.008,
      1.04 + i * 0.085,
      0.148,
      0.009,
      0.009,
      0.006,
    );
  // Torn coat tails and frayed sleeves break up the clean uniform silhouette.
  for (let i = 0; i < 13; i++) {
    const angle = (i * Math.PI * 2) / 13,
      x = Math.sin(angle) * 0.213,
      z = Math.cos(angle) * 0.144;
    const shape = new T.Shape();
    shape.moveTo(-0.055, 0.8);
    shape.lineTo(0.051, 0.8);
    shape.lineTo(0.03, 0.65 - (i % 3) * 0.033);
    shape.lineTo(-0.013, 0.704);
    shape.lineTo(-0.04, 0.68);
    const geo = new T.ShapeGeometry(shape);
    geo.rotateY(angle);
    geo.translate(x, 0, z);
    add(geo, drape, "hips");
  }
  for (const [i, s] of [-1, 1].entries()) {
    const x = s * 0.281,
      armWeight = (y) =>
        y < 1.4
          ? blend(`elbow${i}`, `arm${i}`, 1.1, 1.24)(y)
          : blend(`arm${i}`, `shoulder${i}`, 1.4, 1.49)(y);
    add(
      garment([
        [0.062, 1.145],
        [0.073, 1.17],
        [0.061, 1.23],
        [0.074, 1.31],
        [0.087, 1.4],
        [0.075, 1.46],
        [0.012, 1.49],
      ]),
      cloth,
      armWeight,
      s * 0.27,
      0,
      0,
      1,
      1,
      1.05,
    );
    // Flesh tapers into the wrist; overlapping weighted rings hide the elbow seam.
    const forearm = new T.LatheGeometry(
      [
        new T.Vector2(0.043, 0.848),
        new T.Vector2(0.047, 0.9),
        new T.Vector2(0.066, 1.02),
        new T.Vector2(0.066, 1.12),
        new T.Vector2(0.062, 1.19),
      ],
      18,
    );
    add(
      forearm,
      skin,
      blend(`wrist${i}`, `elbow${i}`, 0.88, 1.05),
      x,
      0,
      0,
      1,
      1,
      0.9,
    );
    block(cloth, armWeight, x, 1.162, 0, 0.14, 0.052, 0.133);
    if (look === "walker" || look === "spitter" || look === "wraith") {
      add(
        garment(
          [
            [0.045, 0.887],
            [0.057, 0.93],
            [0.065, 1.015],
            [0.073, 1.065],
            [0.068, 1.14],
            [0.071, 1.18],
          ],
          22,
        ),
        cloth,
        blend(`wrist${i}`, `elbow${i}`, 0.88, 1.05),
        x,
        0,
        0,
        1,
        1,
        1.04,
      );
      block(leather, `wrist${i}`, x, 0.91, 0, 0.104, 0.028, 0.1);
    }
    ball(skin, `wrist${i}`, x, 0.837, 0.006, 0.059, 0.069, 0.032);
    for (let j = 0; j < 4; j++) {
      const fx = x + s * (j - 1.5) * 0.025,
        length = FINGER_LENGTHS[j],
        root = `finger${i}_${j}`,
        tip = `fingerTip${i}_${j}`,
        // Blend across each knuckle rather than hinging separate rigid tubes.
        weights = (y) =>
          y > 0.783
            ? blend(root, `wrist${i}`, 0.783, 0.815)(y)
            : blend(tip, root, 0.742, 0.769)(y);
      tube(
        skin,
        weights,
        [
          [fx, 0.807, 0.01],
          [fx + s * 0.001, 0.755, 0.004],
          [fx + s * 0.003, 0.798 - length, -0.016],
        ],
        0.0105,
      );
      // Close the distal tube with a low-cost rounded fingertip. This stays
      // attached to the second joint when the hand closes near the camera.
      add(
        new T.SphereGeometry(1, far ? 6 : 8, 4),
        skin,
        tip,
        fx + s * 0.003,
        0.798 - length,
        -0.016,
        0.0105,
        0.012,
        0.0105,
      );
      // Nail beds and knuckles remain on the lightweight mobile hand too.
      ball(skin, weights, fx, 0.798, 0.015, 0.012, 0.015, 0.013);
      block(
        tooth,
        tip,
        fx + s * 0.003,
        0.811 - length,
        -0.0035,
        0.009,
        look === "runner" ? 0.025 : 0.012,
        0.003,
        new T.Euler(0.33, 0, -s * 0.04),
      );
      if (!lite)
        tube(
          skin,
          weights,
          [
            [fx, 0.856, 0.035],
            [fx, 0.824, 0.039],
            [fx, 0.795, 0.031],
          ],
          0.0023,
        );
    }
    tube(
      skin,
      (y) =>
        y > 0.844
          ? blend(`thumb${i}`, `wrist${i}`, 0.844, 0.874)(y)
          : blend(`thumbTip${i}`, `thumb${i}`, 0.8, 0.834)(y),
      [
        [x - s * 0.043, 0.87, 0.014],
        [x - s * 0.07, 0.816, -0.002],
        [x - s * 0.059, 0.79, -0.023],
      ],
      0.017,
    );
    add(
      new T.SphereGeometry(1, far ? 6 : 8, 4),
      skin,
      `thumbTip${i}`,
      x - s * 0.059,
      0.79,
      -0.023,
      0.016,
      0.018,
      0.016,
    );
    const thighWeights = blend(`shin${i}`, `leg${i}`, 0.4, 0.55);
    add(
      garment(
        [
          [0.079, 0.421],
          [0.093, 0.47],
          [0.084, 0.515],
          [0.099, 0.63],
          [0.11, 0.76],
          [0.101, 0.87],
          [0.066, 0.91],
        ],
        20,
      ),
      cloth,
      thighWeights,
      s * 0.115,
      0,
      0,
      1,
      1,
      0.94,
    );
    add(
      garment(
        [
          [0.057, 0.12],
          [0.066, 0.16],
          [0.063, 0.2],
          [0.076, 0.29],
          [0.073, 0.37],
          [0.078, 0.45],
        ],
        18,
      ),
      cloth,
      blend(`foot${i}`, `shin${i}`, 0.1, 0.25),
      s * 0.115,
      0,
      0.005,
    );
    ball(cloth, thighWeights, s * 0.115, 0.464, 0.005, 0.081, 0.063, 0.076);
    const boot = new T.SphereGeometry(
      1,
      far ? 8 : lite ? 12 : 20,
      far ? 6 : lite ? 8 : 12,
    );
    const bootPosition = boot.attributes.position;
    for (let j = 0; j < bootPosition.count; j++) {
      const x = bootPosition.getX(j),
        y = bootPosition.getY(j),
        z = bootPosition.getZ(j);
      bootPosition.setXYZ(
        j,
        x * 0.085,
        Math.max(0.033, 0.09 + y * 0.065),
        0.066 + z * 0.145,
      );
    }
    boot.computeVertexNormals();
    const footWeights = (_y, _x, z) => {
      const toe = T.MathUtils.smoothstep(z, 0.105, 0.155);
      return [
        [`foot${i}`, 1 - toe],
        [`toe${i}`, toe],
      ];
    };
    add(boot, leather, footWeights, s * 0.115, 0, 0);
    add(
      garment(
        [
          [0.059, 0.07],
          [0.064, 0.105],
          [0.062, 0.172],
          [0.057, 0.187],
        ],
        16,
      ),
      leather,
      `foot${i}`,
      s * 0.115,
      0,
      -0.012,
    );
    // A shaped outsole follows heel and toe instead of a rectangular slab.
    const soleOutline = new T.Shape();
    soleOutline.moveTo(-0.05, -0.077);
    soleOutline.quadraticCurveTo(-0.083, -0.071, -0.077, 0.005);
    soleOutline.quadraticCurveTo(-0.098, 0.151, -0.054, 0.199);
    soleOutline.quadraticCurveTo(0, 0.231, 0.054, 0.199);
    soleOutline.quadraticCurveTo(0.098, 0.151, 0.077, 0.005);
    soleOutline.quadraticCurveTo(0.083, -0.071, 0.05, -0.077);
    soleOutline.closePath();
    const sole = new T.ExtrudeGeometry(soleOutline, {
      depth: 0.023,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.003,
      bevelSegments: 1,
      curveSegments: far ? 2 : lite ? 4 : 7,
      steps: 1,
    });
    sole.rotateX(Math.PI / 2);
    add(sole, leather, footWeights, s * 0.115, 0.049, 0);
    for (let j = 0; j < 4; j++)
      block(
        steel,
        footWeights,
        s * 0.115,
        0.146,
        0.115 - j * 0.026,
        0.063,
        0.008,
        0.009,
      );
  }
  if (look === "brute") {
    add(
      new T.SphereGeometry(
        0.165,
        far ? 10 : lite ? 18 : 28,
        far ? 6 : 12,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.57,
      ),
      steel,
      "head",
      0,
      1.84,
      0,
      1,
      0.69,
      1.05,
    );
    block(leather, "torso", 0, 1.273, 0.18, 0.364, 0.4, 0.071);
    for (let j = 0; j < 4; j++) {
      block(
        steel,
        torsoWeights,
        0,
        1.12 + j * 0.086,
        0.217,
        0.337 - j * 0.008,
        0.09,
        0.032,
        new T.Euler(-0.11, 0, (j % 2 ? 1 : -1) * 0.016),
      );
      for (const s of [-1, 1])
        ball(
          steel,
          torsoWeights,
          s * 0.14,
          1.12 + j * 0.086,
          0.237,
          0.006,
          0.006,
          0.004,
        );
    }
    for (const s of [-1, 1]) {
      ball(
        steel,
        `arm${s === -1 ? 0 : 1}`,
        s * 0.286,
        1.48,
        0,
        0.119,
        0.075,
        0.122,
      );
      block(
        steel,
        `arm${s === -1 ? 0 : 1}`,
        s * 0.318,
        1.438,
        0,
        0.1,
        0.113,
        0.24,
        new T.Euler(0, 0, s * 0.2),
      );
      block(
        leather,
        "head",
        s * 0.125,
        1.77,
        -0.009,
        0.014,
        0.21,
        0.041,
        new T.Euler(0, 0, -s * 0.11),
      );
      ball(steel, "head", s * 0.113, 1.846, 0.124, 0.009, 0.009, 0.005);
    }
    tube(
      steel,
      "head",
      [
        [-0.146, 1.846, 0.04],
        [-0.109, 1.839, 0.126],
        [0, 1.837, 0.166],
        [0.109, 1.839, 0.126],
        [0.146, 1.846, 0.04],
      ],
      0.007,
    );
  }
  if (look === "runner") {
    const tornChest = new T.SphereGeometry(
      1,
      far ? 8 : lite ? 12 : 18,
      far ? 6 : 12,
    );
    const tissue = [];
    for (let i = 0; i < tornChest.attributes.position.count; i++)
      tissue.push(0.44, 0.18, 0.14);
    tornChest.setAttribute("color", new T.Float32BufferAttribute(tissue, 3));
    add(tornChest, skin, torsoWeights, -0.101, 1.24, 0.15, 0.083, 0.153, 0.038);
    for (let j = 0; j < 5; j++)
      tube(
        tooth,
        torsoWeights,
        [
          [-0.172, 1.34 - j * 0.04, 0.172],
          [-0.111, 1.35 - j * 0.04, 0.205],
          [-0.041, 1.33 - j * 0.04, 0.183],
        ],
        0.0065,
      );
    tube(
      cloth,
      torsoWeights,
      [
        [-0.169, 1.396, 0.166],
        [-0.19, 1.33, 0.15],
        [-0.177, 1.25, 0.166],
        [-0.174, 1.15, 0.169],
        [-0.137, 1.091, 0.17],
      ],
      0.008,
    );
    tube(
      cloth,
      torsoWeights,
      [
        [-0.05, 1.393, 0.184],
        [-0.025, 1.29, 0.174],
        [-0.03, 1.21, 0.179],
        [-0.064, 1.1, 0.185],
      ],
      0.007,
    );
  }
  if (look === "spitter") {
    ball(skin, "torso", 0, 1.3, -0.17, 0.21, 0.28, 0.18);
    for (let i = 0; i < 7; i++)
      ball(
        i % 3 === 0 ? eye : skin,
        "torso",
        Math.sin(i * 2.4) * 0.16,
        1.14 + i * 0.048,
        -0.29,
        0.036,
        0.04,
        0.04,
      );
    for (const s of [-1, 1]) {
      ball(skin, "neck", s * 0.064, 1.544, 0.039, 0.05, 0.082, 0.048);
      for (let j = 0; j < 3; j++) {
        ball(
          skin,
          "torso",
          s * (0.16 + j * 0.019),
          1.39 - j * 0.047,
          0.13 - j * 0.022,
          0.034,
          0.042,
          0.031,
        );
        ball(
          eye,
          "torso",
          s * (0.168 + j * 0.019),
          1.397 - j * 0.047,
          0.15 - j * 0.022,
          0.008,
          0.01,
          0.006,
        );
      }
    }
  }
  if (look === "walker") {
    // A shredded sleeve and patched field coat define the basic wave-one enemy.
    block(
      leather,
      "arm0",
      -0.282,
      1.382,
      0.08,
      0.092,
      0.106,
      0.009,
      new T.Euler(0, 0, -0.09),
    );
    for (let j = 0; j < 3; j++)
      tube(
        tooth,
        "arm0",
        [
          [-0.318, 1.413 - j * 0.024, 0.087],
          [-0.282, 1.399 - j * 0.024, 0.094],
          [-0.247, 1.413 - j * 0.024, 0.087],
        ],
        0.0018,
      );
    block(
      leather,
      torsoWeights,
      0.116,
      1.064,
      0.145,
      0.121,
      0.099,
      0.011,
      new T.Euler(0, 0, 0.12),
    );
    for (let j = 0; j < 5; j++)
      block(
        tooth,
        torsoWeights,
        0.065 + j * 0.022,
        1.109,
        0.157,
        0.003,
        0.012,
        0.003,
      );
  }
  if (look === "wraith") {
    // A continuous folded cowl with a real front opening, close to the skull.
    const profile = [
      [1.54, 0.144, 0.125],
      [1.65, 0.15, 0.148],
      [1.79, 0.154, 0.17],
      [1.87, 0.145, 0.172],
      [1.94, 0.11, 0.135],
      [1.988, 0.044, 0.05],
      [2.005, 0.003, 0.004],
    ];
    const pos = [],
      uv = [],
      index = [],
      segments = far ? 10 : lite ? 20 : 32;
    for (let row = 0; row < profile.length; row++) {
      const [y, rx, rz] = profile[row];
      for (let i = 0; i <= segments; i++) {
        const a = 0.83 + (i / segments) * (Math.PI * 2 - 1.66);
        const folds = 1 + Math.sin(a * 9 + y * 8) * 0.036;
        pos.push(Math.sin(a) * rx * folds, y, Math.cos(a) * rz * folds - 0.023);
        uv.push(i / segments, row / (profile.length - 1));
        if (row < profile.length - 1 && i < segments) {
          const b = row * (segments + 1) + i,
            n = b + segments + 1;
          index.push(b, n, b + 1, b + 1, n, n + 1);
        }
      }
    }
    const hood = new T.BufferGeometry();
    hood.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    hood.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    hood.setIndex(index);
    hood.computeVertexNormals();
    add(hood, drape, "head");
    for (const sign of [-1, 1]) {
      tube(
        cloth,
        "head",
        profile.map(([y, rx, rz]) => [
          sign * Math.sin(0.83) * rx,
          y,
          Math.cos(0.83) * rz - 0.023,
        ]),
        0.006,
      );
      // Long ragged stole, with alternating edges instead of rigid side blocks.
      const shape = new T.Shape();
      shape.moveTo(sign * 0.03, 1.46);
      shape.lineTo(sign * 0.165, 1.42);
      shape.lineTo(sign * 0.2, 0.72);
      shape.lineTo(sign * 0.156, 0.46);
      shape.lineTo(sign * 0.128, 0.55);
      shape.lineTo(sign * 0.093, 0.42);
      shape.lineTo(sign * 0.071, 0.61);
      const stole = new T.ShapeGeometry(shape);
      const p = stole.attributes.position;
      for (let j = 0; j < p.count; j++)
        p.setZ(j, 0.175 + Math.sin(p.getY(j) * 13) * 0.025);
      stole.computeVertexNormals();
      add(stole, drape, torsoWeights);
    }
    tube(
      leather,
      "hips",
      [
        [-0.213, 0.928, 0.015],
        [-0.17, 0.927, 0.165],
        [0, 0.919, 0.185],
        [0.17, 0.936, 0.165],
        [0.218, 0.926, 0.01],
      ],
      0.01,
    );
  }
  for (const [material, parts] of buckets) {
    const merged = mergeGeometries(parts, false);
    // Preserve UV/normal/skin-weight seams while reusing identical vertices.
    // A horde must not run the bone shader three times for every triangle.
    const geometry = mergeVertices(merged, 0.00001);
    merged.dispose();
    const mesh = new T.SkinnedMesh(geometry, material);
    mesh.name =
      material === skin
        ? "skin"
        : material === cloth
          ? "cloth"
          : material === drape
            ? "drape"
            : material === steel
              ? "steel"
              : material === oral
                ? "oral"
                : material === eye
                  ? "eye"
                  : "face";
    mesh.castShadow = material !== eye;
    mesh.receiveShadow = true;
    // Conservative animated bounds include the full lunge, without rendering
    // every off-screen member of the horde.
    mesh.boundingSphere = new T.Sphere(new T.Vector3(0, 1, 0), 1.75);
    mesh.frustumCulled = true;
    g.add(mesh);
    mesh.bind(skeleton);
    parts.forEach((p) => p.dispose());
  }
  g.scale.setScalar(def.scale);
  g.userData = {};
  return g;
}

const normalizeDetail = (detail) =>
  detail === true ? "lite" : detail || "full";
// Network entity IDs can be numbers or strings. Explicit seeds always produce
// the same proportions and movement identity on the host and every peer.
function creatureSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed | 0;
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function creatureTemplate(type, detail) {
  const key = `${type}-${detail}`;
  if (!templates.has(key)) templates.set(key, build(type, detail));
  return templates.get(key);
}
export function zombieModel(type, detail = "full", seed) {
  detail = normalizeDetail(detail);
  // Motion-captured Rocketbox bodies when their packs are loaded; the
  // procedural species remains the fallback of every type.
  const horde = hordeModel(
    type,
    detail,
    seed === undefined ? (Math.random() * 0x7fffffff) | 0 : creatureSeed(seed),
  );
  if (horde) return horde;
  const template = creatureTemplate(type, detail);
  const g = clone(template);
  const motionSeed =
    seed === undefined
      ? (Math.random() * 0x100000000) >>> 0
      : creatureSeed(seed);
  const variation = rng(motionSeed)();
  g.scale.x *= 0.94 + variation * 0.12;
  g.scale.y *= 0.97 + variation * 0.06;
  let sharedSkeleton;
  g.traverse((o) => {
    if (o.isSkinnedMesh) {
      if (!sharedSkeleton) sharedSkeleton = o.skeleton;
      else o.skeleton = sharedSkeleton;
    }
  });
  g.userData = {
    type,
    look: ENEMIES[type].look || type,
    variation,
    motionSeed,
    rig: RIG_DIMENSIONS,
    headDestroyed: false,
    detail,
    lite: detail !== "full",
    torso: g.getObjectByName("torso"),
    spine: g.getObjectByName("spine"),
    neck: g.getObjectByName("neck"),
    head: g.getObjectByName("head"),
    jaw: g.getObjectByName("jaw"),
    hips: g.getObjectByName("hips"),
    shoulders: [0, 1].map((i) => g.getObjectByName(`shoulder${i}`)),
    arms: [0, 1].map((i) => g.getObjectByName(`arm${i}`)),
    elbows: [0, 1].map((i) => g.getObjectByName(`elbow${i}`)),
    wrists: [0, 1].map((i) => g.getObjectByName(`wrist${i}`)),
    // Index/middle/ring/little/thumb, mirrored across the two hands. Positive
    // local X rotation curls each joint toward the palm, including the thumb.
    fingers: [-1, 1].map((side, i) => [
      ...FINGER_LENGTHS.map((length, j) => ({
        root: g.getObjectByName(`finger${i}_${j}`),
        tip: g.getObjectByName(`fingerTip${i}_${j}`),
        thumb: false,
        length,
        side,
      })),
      {
        root: g.getObjectByName(`thumb${i}`),
        tip: g.getObjectByName(`thumbTip${i}`),
        thumb: true,
        length: 0.072,
        side,
      },
    ]),
    legs: [0, 1].map((i) => ({
      root: g.getObjectByName(`leg${i}`),
      shin: g.getObjectByName(`shin${i}`),
      foot: g.getObjectByName(`foot${i}`),
      toe: g.getObjectByName(`toe${i}`),
      lengths: { upper: 0.42, lower: Math.hypot(0.36, 0.025) },
    })),
  };
  return g;
}

export function destroyZombieHead(g, position) {
  if (g.userData.headDestroyed) return false;
  g.updateWorldMatrix(true, true);
  g.userData.head.getWorldPosition(position);
  if (g.userData.horde) return destroyHordeHead(g);
  // Bone transforms belong to this clone; shared geometry/materials and every
  // other zombie stay intact. A tiny non-zero scale avoids singular transforms.
  g.userData.head.scale.setScalar(0.0001);
  g.userData.headDestroyed = true;
  if (!stumpGeometry) {
    stumpGeometry = new T.CylinderGeometry(0.06, 0.056, 0.018, 12);
    stumpMaterial = new T.MeshStandardMaterial({
      color: 0x65181b,
      roughness: 0.57,
    });
  }
  const stump = new T.Mesh(stumpGeometry, stumpMaterial);
  stump.name = "neck-wound";
  stump.position.set(0, 0.078, 0);
  g.getObjectByName("neck").add(stump);
  g.updateWorldMatrix(true, true);
  return true;
}

export function setZombieDetail(g, detail, castShadow = true) {
  detail = normalizeDetail(detail);
  if (g.userData.horde) return setHordeDetail(g, detail, castShadow);
  if (g.userData.detail !== detail) {
    const template = creatureTemplate(g.userData.type, detail);
    const source = new Map(
      template.children
        .filter((o) => o.isSkinnedMesh)
        .map((o) => [o.name, o.geometry]),
    );
    // Levels are matched by bucket role. A level lacking a bucket hides it;
    // a level with a bucket this instance never had is skipped entirely.
    const own = new Set(
      g.children.filter((o) => o.isSkinnedMesh).map((o) => o.name),
    );
    if ([...source.keys()].every((name) => own.has(name))) {
      for (const o of g.children)
        if (o.isSkinnedMesh) {
          const geometry = source.get(o.name);
          o.visible = !!geometry;
          if (geometry) o.geometry = geometry;
        }
      g.userData.detail = detail;
      g.userData.lite = detail !== "full";
    }
  }
  for (const o of g.children)
    if (o.isSkinnedMesh)
      o.castShadow = castShadow && o.material.emissive.getHex() === 0;
}

export function releaseZombie(g) {
  if (g.userData.horde) return releaseHorde(g);
  const skeletons = new Set();
  g.traverse((o) => {
    if (o.skeleton) skeletons.add(o.skeleton);
  });
  skeletons.forEach((s) => s.dispose());
}

/** Animate either body kind with the shared per-frame signature. */
export function animateZombie(g, ...args) {
  if (g.userData.horde) return animateHorde(g, ...args);
  return animateProcedural(g, ...args);
}
