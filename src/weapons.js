import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import { surface } from "./surfaces.js";
import { WEAPONS } from "./config.js";
import { glowSprite } from "./assets.js";
import {
  weaponFinish,
  weaponMarking,
  finishGeometry,
} from "./weapon-finish.js";

function add(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function block(p, m, x, y, z, w, h, d, r = 0.005) {
  return add(
    p,
    new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w * 0.3, h * 0.3, d * 0.3)),
    m,
    x,
    y,
    z,
  );
}
function tube(p, m, x, y, z, r, length) {
  const o = add(p, new T.CylinderGeometry(r, r, length, 20), m, x, y, z);
  o.rotation.x = Math.PI / 2;
  return o;
}
function line(p, m, points, r = 0.005) {
  return add(
    p,
    new T.TubeGeometry(
      new T.CatmullRomCurve3(points.map((v) => new T.Vector3(...v))),
      12,
      r,
      6,
      false,
    ),
    m,
  );
}
function profile(p, m, points, width) {
  const s = new T.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const geo = new T.ExtrudeGeometry(s, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.004,
    bevelSegments: 2,
    steps: 1,
  });
  // Local shape X is weapon Z; the extrusion runs across the weapon's width.
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  return add(p, geo, m);
}
function batch(group) {
  for (const c of [...group.children]) if (c.isGroup) batch(c);
  const buckets = new Map();
  for (const o of [...group.children]) {
    if (!o.isMesh || o.children.length) continue;
    o.updateMatrix();
    const geo = o.geometry.clone().applyMatrix4(o.matrix);
    finishGeometry(geo, o.material);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(flat);
    o.geometry.dispose();
    group.remove(o);
  }
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    const geo = mergeVertices(merged, 0.00001);
    merged.dispose();
    add(group, geo, material);
    geometries.forEach((g) => g.dispose());
  }
}

function hand(parent, cloth, glove, detail, x, y, z, left = false) {
  const h = new T.Group();
  h.name = left ? "support-hand" : "trigger-hand";
  h.position.set(x, y, z);
  parent.add(h);
  block(h, glove, 0, 0, 0, 0.092, 0.107, 0.1, 0.022);
  for (let i = 0; i < 4; i++) {
    const f = add(
      h,
      new T.CapsuleGeometry(0.016, 0.059, 4, 10),
      glove,
      0,
      -0.044 + i * 0.028,
      -0.035,
    );
    f.rotation.z = Math.PI / 2;
    block(
      h,
      detail,
      0.021,
      -0.044 + i * 0.028,
      0.035,
      0.046,
      0.019,
      0.014,
      0.006,
    );
    line(
      h,
      cloth,
      [
        [-0.035, -0.044 + i * 0.028, 0.043],
        [0, -0.04 + i * 0.028, 0.052],
        [0.031, -0.044 + i * 0.028, 0.046],
      ],
      0.0015,
    );
  }
  const thumb = add(
    h,
    new T.CapsuleGeometry(0.021, 0.055, 4, 12),
    glove,
    left ? 0.051 : -0.051,
    0.043,
    -0.012,
  );
  thumb.rotation.z = left ? -0.5 : 0.5;
  block(h, glove, 0, -0.07, 0.023, 0.104, 0.06, 0.105, 0.018);
  const sleeve = add(
    h,
    new T.CapsuleGeometry(0.067, 0.3, 5, 14),
    cloth,
    left ? -0.045 : 0.05,
    -0.16,
    0.18,
  );
  sleeve.rotation.x = -0.98;
  sleeve.rotation.z = left ? -0.26 : 0.24;
  block(h, detail, 0, -0.09, 0.045, 0.118, 0.041, 0.117, 0.01);
  return h;
}

export function weaponModel(id, upgraded = false, viewModel = false) {
  const g = new T.Group(),
    def = WEAPONS[id],
    look = def.look || id,
    pistol = look === "vigil",
    shotgun = look === "requiem",
    sniper = look === "longinus",
    alien = look === "eclipse";
  g.name = `weapon-${id}`;
  const metal = new T.MeshStandardMaterial({
    color: 0x687475,
    roughness: 0.8,
    metalness: 0.88,
    ...weaponFinish(),
  });
  const black = new T.MeshStandardMaterial({
    color: 0x283237,
    roughness: 0.94,
    metalness: 0.78,
    ...weaponFinish(),
  });
  const edge = new T.MeshStandardMaterial({
    color: 0x9ba5a4,
    roughness: 0.68,
    metalness: 0.92,
    ...weaponFinish(),
  });
  const polymer = new T.MeshStandardMaterial({
    color: 0x333a36,
    roughness: 0.86,
    metalness: 0,
    ...weaponFinish(true),
  });
  for (const m of [metal, black, edge, polymer]) {
    m.userData.weaponFinish = m === polymer ? 2 : 1;
    m.vertexColors = true;
  }
  const cloth = surface("cloth", 0x596053, {
    roughness: 0.96,
    metalness: 0,
    normalScale: new T.Vector2(0.5, 0.5),
  });
  const glove = surface("cloth", 0x2c342f, {
    roughness: 0.77,
    metalness: 0,
    normalScale: new T.Vector2(0.3, 0.3),
  });
  const accent = new T.MeshStandardMaterial({
    color: upgraded ? 0xc9a568 : 0x727c70,
    roughness: 0.4,
    metalness: 0.65,
  });
  const luminous = new T.MeshStandardMaterial({
    color: upgraded ? 0xffb957 : alien ? 0x66ffcf : 0xa6bea7,
    emissive: upgraded ? 0xff963c : alien ? 0x49ffc9 : 0x4c8f70,
    emissiveIntensity: upgraded || alien ? 2.1 : 0.12,
  });
  const slide = new T.Group();
  slide.name = "action";
  g.add(slide);
  const magazine = new T.Group();
  magazine.name = "magazine";
  g.add(magazine);
  const len = pistol
    ? 0.4
    : sniper
      ? 1.08
      : shotgun
        ? 0.91
        : alien
          ? 0.8
          : look === "spectre"
            ? 0.69
            : 0.83;
  if (pistol) {
    profile(
      slide,
      metal,
      [
        [-0.35, 0.043],
        [-0.34, 0.083],
        [-0.08, 0.096],
        [0.043, 0.085],
        [0.048, 0.025],
        [-0.31, 0.017],
      ],
      0.085,
    );
    profile(
      g,
      black,
      [
        [-0.29, 0.01],
        [0.039, 0.016],
        [0.075, -0.068],
        [0.016, -0.105],
        [-0.12, -0.053],
        [-0.28, -0.036],
      ],
      0.078,
    );
    tube(g, black, 0, 0.045, -0.346, 0.026, 0.115);
    tube(g, edge, 0, 0.045, -0.396, 0.022, 0.008);
    tube(g, black, 0, 0.045, -0.402, 0.016, 0.006);
    profile(
      g,
      polymer,
      [
        [0.008, -0.056],
        [0.079, -0.052],
        [0.13, -0.244],
        [0.047, -0.258],
        [-0.018, -0.098],
      ],
      0.075,
    );
    block(magazine, black, 0.001, -0.258, 0.087, 0.087, 0.018, 0.081, 0.007);
    block(magazine, metal, 0, -0.183, 0.069, 0.05, 0.14, 0.051, 0.004);
    // Ejection port, extractor, slide serrations and a rounded trigger guard.
    block(slide, black, 0.044, 0.057, -0.097, 0.007, 0.025, 0.082, 0.003);
    block(slide, edge, 0.047, 0.049, -0.098, 0.003, 0.007, 0.055, 0.001);
    for (const s of [-1, 1])
      for (let i = 0; i < 8; i++) {
        block(
          slide,
          black,
          s * 0.045,
          0.057,
          0.022 - i * 0.012,
          0.003,
          0.043,
          0.004,
          0.001,
        ).rotation.x = -0.18;
        if (i < 5)
          block(
            slide,
            black,
            s * 0.043,
            0.052,
            -0.3 + i * 0.011,
            0.003,
            0.028,
            0.003,
            0.001,
          );
      }
    line(
      g,
      black,
      [
        [0, -0.035, -0.105],
        [0, -0.098, -0.106],
        [0, -0.126, -0.07],
        [0, -0.11, -0.019],
        [0, -0.075, -0.007],
      ],
      0.009,
    );
    line(
      g,
      metal,
      [
        [0, -0.049, -0.048],
        [0, -0.077, -0.035],
        [0, -0.095, -0.045],
      ],
      0.006,
    );
    // Open rear notch, a beveled slide end and cocking hammer read at eye level.
    for (const s of [-1, 1])
      block(slide, black, s * 0.024, 0.107, 0.029, 0.026, 0.022, 0.022, 0.003);
    block(slide, black, 0, 0.096, 0.029, 0.075, 0.008, 0.022, 0.002);
    block(g, edge, 0, 0.057, 0.062, 0.023, 0.036, 0.019, 0.004).rotation.x =
      -0.24;
    block(slide, black, 0, 0.101, -0.326, 0.018, 0.028, 0.025, 0.002);
    for (const s of [-1, 1])
      block(
        slide,
        luminous,
        s * 0.027,
        0.12,
        0.043,
        0.008,
        0.007,
        0.003,
        0.001,
      );
    block(slide, luminous, 0, 0.114, -0.313, 0.006, 0.007, 0.003, 0.001);
    block(g, edge, -0.043, -0.018, 0.005, 0.006, 0.013, 0.038, 0.003);
    for (const s of [-1, 1]) {
      block(g, accent, s * 0.041, -0.15, 0.067, 0.005, 0.046, 0.032, 0.003);
      for (let i = 0; i < 11; i++)
        block(
          g,
          black,
          s * 0.04,
          -0.105 - i * 0.012,
          0.059 + i * 0.003,
          0.003,
          0.004,
          0.057,
          0.001,
        );
    }
  } else {
    profile(
      g,
      black,
      [
        [-0.38, 0.045],
        [-0.31, 0.081],
        [-0.07, 0.09],
        [0.08, 0.037],
        [0.086, -0.07],
        [-0.19, -0.085],
        [-0.32, -0.018],
      ],
      0.093,
    );
    block(g, metal, 0, 0.029, -0.16, 0.1, 0.068, 0.29, 0.012);
    block(slide, edge, 0.052, 0.028, -0.105, 0.008, 0.026, 0.086, 0.003);
    block(g, black, 0.055, 0.032, -0.101, 0.004, 0.037, 0.126, 0.002);
    block(slide, metal, 0.072, 0.011, -0.055, 0.042, 0.018, 0.024, 0.004);
    profile(
      g,
      polymer,
      [
        [0.006, -0.056],
        [0.07, -0.065],
        [0.12, -0.228],
        [0.045, -0.247],
        [-0.018, -0.12],
      ],
      0.077,
    );
    line(
      g,
      metal,
      [
        [0, -0.067, -0.134],
        [0, -0.137, -0.113],
        [0, -0.144, -0.037],
        [0, -0.093, -0.011],
      ],
      0.008,
    );
    line(
      g,
      black,
      [
        [0, -0.07, -0.065],
        [0, -0.099, -0.047],
        [0, -0.117, -0.055],
      ],
      0.007,
    );
    const forward = shotgun ? 0.36 : 0.32;
    tube(g, black, 0, 0.03, -len * 0.69, 0.023, len * 0.6);
    tube(g, edge, 0, 0.03, -len * 0.88, 0.033, 0.045);
    tube(g, black, 0, 0.03, -len, 0.036, 0.08);
    tube(g, edge, 0, 0.03, -len - 0.041, 0.03, 0.006);
    tube(g, black, 0, 0.03, -len - 0.045, 0.023, 0.004);
    if (!alien) {
      block(g, polymer, 0, -0.004, -0.4, 0.121, 0.127, forward, 0.018);
      for (let i = 0; i < 8; i++) {
        const z = -0.26 - i * 0.033;
        block(g, black, 0, 0.074, z, 0.12, 0.021, 0.02, 0.003);
        for (const s of [-1, 1])
          block(g, black, s * 0.061, 0.015, z, 0.005, 0.044, 0.021, 0.006);
      }
      for (let i = 0; i < 10; i++)
        block(
          g,
          edge,
          0,
          0.084,
          -0.275 + i * 0.034,
          0.103,
          0.012,
          0.018,
          0.002,
        );
    }
    // Stock tube and cheek rest give each long gun a complete rear silhouette.
    tube(g, black, 0, -0.012, 0.17, 0.033, 0.25);
    profile(
      g,
      polymer,
      [
        [0.125, 0.022],
        [0.325, 0.019],
        [0.343, -0.155],
        [0.3, -0.173],
        [0.135, -0.055],
      ],
      0.086,
    );
    block(g, black, 0, -0.077, 0.342, 0.094, 0.198, 0.035, 0.012);
    for (let i = 0; i < 6; i++)
      block(g, polymer, 0, -0.15 + i * 0.031, 0.364, 0.076, 0.01, 0.008, 0.001);
    if (!shotgun) {
      profile(
        magazine,
        black,
        [
          [-0.19, -0.064],
          [-0.1, -0.071],
          [-0.107, -0.252],
          [-0.175, -0.288],
          [-0.226, -0.28],
        ],
        0.065,
      );
      for (const s of [-1, 1])
        for (let i = 0; i < 3; i++)
          line(
            magazine,
            metal,
            [
              [s * 0.036, -0.098, -0.18 + i * 0.022],
              [s * 0.036, -0.19, -0.19 + i * 0.022],
              [s * 0.036, -0.252, -0.195 + i * 0.022],
            ],
            0.0025,
          );
      block(magazine, polymer, 0, -0.282, -0.178, 0.077, 0.023, 0.115, 0.006);
    } else {
      tube(g, metal, 0, -0.048, -0.49, 0.028, 0.63);
      for (let i = 0; i < 9; i++)
        block(
          slide,
          black,
          0,
          -0.057,
          -0.35 - i * 0.022,
          0.123,
          0.093,
          0.013,
          0.005,
        );
      for (let i = 0; i < 4; i++) {
        const shell = add(
          g,
          new T.CylinderGeometry(0.018, 0.018, 0.07, 12),
          accent,
          -0.064,
          -0.012,
          -0.12 + i * 0.04,
        );
        shell.rotation.z = 0.1;
        add(
          g,
          new T.CylinderGeometry(0.019, 0.019, 0.015, 12),
          edge,
          -0.064,
          -0.052,
          -0.12 + i * 0.04,
        );
      }
    }
    if (sniper) {
      for (const z of [-0.2, -0.025])
        block(g, black, 0, 0.119, z, 0.045, 0.083, 0.035, 0.005);
      tube(g, black, 0, 0.18, -0.13, 0.052, 0.35);
      tube(g, metal, 0, 0.18, -0.306, 0.074, 0.12);
      tube(g, black, 0, 0.18, 0.048, 0.069, 0.045);
      const lens = new T.MeshStandardMaterial({
        color: 0x173d45,
        metalness: 0.9,
        roughness: 0.08,
      });
      tube(g, lens, 0, 0.18, 0.073, 0.053, 0.004);
      for (const z of [-0.242, -0.015])
        tube(g, polymer, 0, 0.18, z, 0.057, 0.028);
      add(
        g,
        new T.CylinderGeometry(0.025, 0.025, 0.04, 16),
        black,
        0,
        0.242,
        -0.11,
      );
    } else if (!alien) {
      const sight = add(
        g,
        new T.TorusGeometry(0.035, 0.006, 8, 28, Math.PI),
        black,
        0,
        0.127,
        -0.023,
      );
      sight.rotation.z = 0;
      block(g, black, 0, 0.115, -0.022, 0.082, 0.022, 0.048, 0.003);
      block(g, luminous, 0, 0.139, -0.002, 0.004, 0.004, 0.003, 0.001);
      block(g, black, 0, 0.114, -0.48, 0.009, 0.042, 0.018, 0.002);
      block(g, luminous, 0, 0.137, -0.468, 0.004, 0.006, 0.003, 0.001);
    }
    if (alien) {
      tube(g, black, 0, 0.02, -0.43, 0.075, 0.47);
      for (let i = 0; i < 6; i++) {
        add(
          g,
          new T.TorusGeometry(0.092, 0.009, 8, 28),
          i % 2 ? luminous : accent,
          0,
          0.018,
          -0.25 - i * 0.072,
        );
      }
      for (const s of [-1, 1])
        block(g, metal, s * 0.098, 0.016, -0.43, 0.025, 0.15, 0.45, 0.009);
      tube(g, luminous, 0, 0.016, -0.43, 0.058, 0.43);
      block(g, black, 0, 0.12, -0.048, 0.078, 0.052, 0.048, 0.005);
      block(g, luminous, 0, 0.143, -0.021, 0.006, 0.006, 0.004, 0.001);
    }
  }
  // Recessed fasteners, worn edge strips and tiny serial marking.
  for (const s of [-1, 1])
    for (const z of [-0.21, -0.036]) {
      const screw = add(
        g,
        new T.CylinderGeometry(0.006, 0.006, 0.003, 12),
        edge,
        s * (pistol ? 0.046 : 0.055),
        pistol ? 0.023 : -0.032,
        z,
      );
      screw.rotation.z = Math.PI / 2;
      block(
        g,
        black,
        s * (pistol ? 0.049 : 0.058),
        pistol ? 0.023 : -0.032,
        z,
        0.002,
        0.002,
        0.008,
        0.0005,
      );
    }
  if (upgraded)
    for (const s of [-1, 1])
      line(
        g,
        luminous,
        [
          [s * 0.051, 0.05, -0.25],
          [s * 0.052, 0.053, -0.16],
          [s * 0.052, 0.046, -0.1],
        ],
        0.002,
      );
  const right = viewModel
    ? hand(g, cloth, glove, polymer, 0.013, -0.171, 0.075)
    : new T.Group();
  const left = viewModel
    ? hand(
        g,
        cloth,
        glove,
        polymer,
        pistol ? -0.072 : -0.042,
        pistol ? -0.183 : -0.091,
        pistol ? 0.015 : -0.365,
        true,
      )
    : new T.Group();
  if (pistol) {
    left.rotation.y = 0.18;
    left.rotation.z = -0.3;
  }
  const flash = new T.Group();
  flash.position.set(0, pistol ? 0.045 : 0.03, -len - 0.06);
  flash.name = "muzzle-flash";
  const sprite = glowSprite(alien ? 0x61ffcc : 0xffb675, 0.28);
  flash.add(sprite);
  const flareMat = new T.MeshBasicMaterial({
    color: alien ? 0x99ffe5 : 0xffe1a2,
    transparent: true,
    opacity: 0.87,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i < 3; i++) {
    const shape = new T.Shape();
    shape.moveTo(0, 0.08);
    shape.lineTo(0.018, 0.019);
    shape.lineTo(0.055, -0.025);
    shape.lineTo(0.012, -0.018);
    shape.lineTo(-0.009, -0.07);
    shape.lineTo(-0.017, -0.014);
    shape.lineTo(-0.05, 0.025);
    shape.lineTo(-0.01, 0.019);
    const f = add(
      flash,
      new T.ShapeGeometry(shape),
      flareMat,
      0,
      0,
      -i * 0.025,
    );
    f.rotation.z = i * 1.9;
  }
  batch(g);
  const marking = new T.Mesh(
    new T.PlaneGeometry(pistol ? 0.15 : 0.22, 0.038),
    weaponMarking(id, upgraded),
  );
  marking.rotation.y = -Math.PI / 2;
  marking.position.set(pistol ? -0.047 : -0.057, pistol ? 0.054 : 0.04, -0.166);
  (pistol ? slide : g).add(marking);
  g.add(flash);
  flash.visible = false;
  g.userData = {
    flash,
    len,
    id,
    look,
    slide,
    magazine,
    left,
    right,
    cycle: 0,
    supportRest: left.position.clone(),
    supportRotation: left.rotation.clone(),
  };
  return g;
}

export function animateWeapon(g, dt, reload, shot, sprint, time, aim) {
  const d = g.userData;
  d.cycle = Math.max(0, d.cycle - dt * 12);
  d.slide.position.z =
    Math.sin(d.cycle * Math.PI) * (d.look === "requiem" ? 0.11 : 0.048);
  const release =
    T.MathUtils.smoothstep(reload, 0.16, 0.3) *
    (1 - T.MathUtils.smoothstep(reload, 0.55, 0.74));
  if (d.look !== "requiem") {
    d.magazine.position.set(-release * 0.018, -release * 0.31, release * 0.09);
    d.magazine.rotation.x = -release * 0.16;
  }
  d.left.position.copy(d.supportRest);
  d.left.rotation.copy(d.supportRotation);
  if (reload > 0 && d.look === "requiem") {
    // Tube-fed: the support hand feeds shells through the loading port, then
    // racks the fore-end. No magazine ever drops from this weapon.
    const window =
      T.MathUtils.smoothstep(reload, 0.06, 0.18) *
      (1 - T.MathUtils.smoothstep(reload, 0.74, 0.84));
    const feed = Math.abs(Math.sin(reload * Math.PI * 4)) * window;
    d.left.position.y -= window * 0.07 + feed * 0.035;
    d.left.position.z += window * 0.12 - feed * 0.03;
    d.left.rotation.x += window * 0.55;
    d.left.rotation.z -= feed * 0.2;
    const pump =
      reload > 0.84 ? Math.sin(((reload - 0.84) / 0.16) * Math.PI) : 0;
    d.slide.position.z = Math.max(d.slide.position.z, pump * 0.11);
    d.left.position.z += pump * 0.11;
  } else if (reload > 0) {
    d.left.position.x -= release * 0.045;
    d.left.position.y -= release * 0.22;
    d.left.position.z += release * 0.19;
    d.left.rotation.z -= release * 0.3;
  }
  g.rotation.x += shot * 0.58;
  if (!aim && !sprint) g.rotation.z += Math.sin(time * 1.7) * 0.003;
}
