import * as T from "three";
import { mesh, plainBoxGeo, cylinder } from "../../assets.js";
import { worldSurface } from "../../surfaces.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Dynamic bridge leaves keep their transform but submit one mesh per material.
export function mergeMovingParts(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(),
    buckets = new Map();
  group.traverse((object) => {
    if (!object.isMesh) return;
    const transformed = object.geometry
      .clone()
      .applyMatrix4(
        new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld),
      );
    const part = transformed.index ? transformed.toNonIndexed() : transformed;
    if (part !== transformed) transformed.dispose();
    if (!buckets.has(object.material)) buckets.set(object.material, []);
    buckets.get(object.material).push(part);
  });
  group.clear();
  for (const [material, parts] of buckets) {
    const merged = new T.Mesh(mergeGeometries(parts, false), material);
    merged.castShadow = merged.receiveShadow = true;
    group.add(merged);
    for (const geometry of parts) geometry.dispose();
  }
}

export function architect(w) {
  const stage = w.static;
  const m = {
    stone: worldSurface("ashlar", 0xa5aaa1, 3, { roughness: 0.82 }),
    trim: worldSurface("plaster", 0xbab9a6, 2.5, { roughness: 0.87 }),
    wall: worldSurface("plaster", 0x969d8f, 3.4, { roughness: 0.94 }),
    concrete: worldSurface("concrete", 0xc4c8c1, 6, { roughness: 0.94 }),
    ground: worldSurface("floor", 0x8b9999, 3.5, { roughness: 0.37 }),
    slate: worldSurface("stone", 0x394d50, 1.6, { roughness: 0.8 }),
    copper: worldSurface("metal", 0x75b3a2, 2.1, {
      roughness: 0.73,
      metalness: 0.48,
    }),
    iron: worldSurface("steel", 0x394447, 1.5, {
      roughness: 0.66,
      metalness: 0.65,
    }),
    rust: worldSurface("metal", 0x956443, 1.7, {
      roughness: 0.81,
      metalness: 0.4,
    }),
    wood: worldSurface("wood", 0x877c5c, 1.5, { roughness: 0.85 }),
    glass: new T.MeshStandardMaterial({
      color: 0x10272c,
      roughness: 0.38,
      metalness: 0.45,
    }),
    gold: new T.MeshStandardMaterial({
      color: 0xc0a779,
      roughness: 0.42,
      metalness: 0.7,
    }),
    dark: new T.MeshStandardMaterial({ color: 0x1b2a28, roughness: 0.98 }),
    moss: new T.MeshStandardMaterial({ color: 0x455648, roughness: 1 }),
    warning: new T.MeshStandardMaterial({
      color: 0xd4a047,
      roughness: 0.75,
      emissive: 0x8c5318,
      emissiveIntensity: 0.08,
    }),
  };
  const block = (material, x, y, z, width, height, depth, parent = stage) =>
    mesh(plainBoxGeo, material, parent, x, y, z, width, height, depth);
  const solid = (material, x, y, z, width, height, depth) => {
    const object = block(material, x, y, z, width, height, depth);
    w.obstacle(x, z, width, depth, height, {
      bloodSurface: { minY: y - height / 2, maxY: y + height / 2 },
    });
    return object;
  };
  // All town signs share one atlas/material, and are batched with their sector.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext("2d"),
    atlas = new T.CanvasTexture(canvas);
  atlas.colorSpace = T.SRGBColorSpace;
  const enamel = new T.MeshStandardMaterial({ map: atlas, roughness: 0.73 });
  let signIndex = 0;
  const sign = (text, x, y, z, width = 6, rotation = 0, color = "#e9d8b4") => {
    if (signIndex >= 32) throw new Error("Lacuna sign atlas is full");
    const sx = (signIndex % 2) * 1024,
      sy = Math.floor(signIndex++ / 2) * 128;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 128 / 144);
    ctx.fillStyle = "#152b27";
    ctx.fillRect(0, 0, 1024, 144);
    ctx.strokeStyle = "#b6a578";
    ctx.lineWidth = 2;
    ctx.strokeRect(9, 9, 1006, 126);
    ctx.strokeRect(15, 15, 994, 114);
    ctx.font = "46px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, 512, 74, 936);
    for (let i = 0; i < 350; i++) {
      ctx.fillStyle = i % 2 ? "#acb0a216" : "#0b1e191f";
      ctx.fillRect((i * 173) % 1024, (i * 67) % 144, 2 + (i % 7), 1);
    }
    ctx.restore();
    atlas.needsUpdate = true;
    const geometry = new T.PlaneGeometry(width, width * 0.14),
      uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        (sx + uv.getX(i) * 1024) / 2048,
        1 - (sy + (1 - uv.getY(i)) * 128) / 2048,
      );
    const board = new T.Mesh(geometry, enamel);
    const back = new T.Mesh(board.geometry, board.material);
    back.rotation.y = Math.PI;
    back.position.z = -0.035;
    board.add(back);
    board.position.set(x, y, z);
    board.rotation.y = rotation;
    stage.add(board);
    return board;
  };
  const column = (x, z, height = 6, radius = 0.36) => {
    block(m.stone, x, 0.25, z, radius * 3, 0.5, radius * 3);
    w.obstacle(x, z, radius * 3, radius * 3, height);
    cylinder(
      stage,
      m.trim,
      x,
      height / 2,
      z,
      radius,
      height,
      radius * 0.85,
      10,
    );
    block(m.trim, x, height - 0.1, z, radius * 3, 0.35, radius * 3);
  };
  const arch = (x, y, z, radius, rotation = 0, material = m.trim) => {
    const object = mesh(
      new T.TorusGeometry(radius, 0.27, 5, 18, Math.PI),
      material,
      stage,
      x,
      y,
      z,
    );
    object.rotation.y = rotation;
    return object;
  };
  const window = (x, y, z, width, height, rotation = 0, shutter = false) => {
    const group = new T.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    stage.add(group);
    block(m.trim, 0, 0, 0, width + 0.34, height + 0.3, 0.22, group);
    block(m.glass, 0, 0, 0.14, width, height, 0.07, group);
    block(m.trim, 0, 0, 0.2, 0.075, height, 0.07, group);
    block(m.trim, 0, 0.15, 0.2, width, 0.07, 0.07, group);
    block(m.stone, 0, -height / 2 - 0.2, 0.2, width + 0.55, 0.17, 0.55, group);
    if (shutter)
      for (const side of [-1, 1]) {
        const slat = block(
          m.copper,
          side * (width / 2 + 0.33),
          0,
          0.22,
          0.5,
          height,
          0.1,
          group,
        );
        slat.rotation.y = side * 0.2;
      }
    const damage = Math.abs(Math.floor(x * 3 + y * 4 + z * 1.8)) % 5;
    if (damage < 2) {
      for (const side of [-1, 1]) {
        const plank = block(
          m.wood,
          0,
          side * height * 0.2,
          0.3,
          width * 1.2,
          0.22,
          0.1,
          group,
        );
        plank.rotation.z = side * 0.26;
      }
    } else if (damage === 2) {
      const crack = new T.Shape();
      crack.moveTo(-0.35, -0.45);
      for (const [xx, yy] of [
        [-0.43, 0.08],
        [-0.17, 0.19],
        [-0.21, 0.48],
        [0.12, 0.3],
        [0.38, 0.43],
        [0.28, -0.1],
        [0.4, -0.45],
      ])
        crack.lineTo(xx, yy);
      crack.closePath();
      mesh(
        new T.ShapeGeometry(crack),
        m.dark,
        group,
        0,
        0,
        0.255,
        width,
        height,
        1,
      ).castShadow = false;
    }
  };
  const rail = (x, z, length, rotation = 0, parent = stage) => {
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    parent.add(group);
    block(m.stone, 0, 0.13, 0, length, 0.26, 0.42, group);
    block(m.iron, 0, 1.15, 0, length, 0.09, 0.14, group);
    block(m.iron, 0, 0.42, 0, length, 0.06, 0.1, group);
    for (let dx = -length / 2 + 0.35; dx < length / 2; dx += 0.8)
      block(m.iron, dx, 0.74, 0, 0.045, 0.83, 0.045, group);
  };
  const lampBulb = new T.MeshStandardMaterial({
    color: 0xad795c,
    emissive: 0xe97645,
    emissiveIntensity: 0.1,
    roughness: 0.4,
  });
  w.lacunaLamps.push(lampBulb);
  const lamp = (x, z, height = 4.8) => {
    cylinder(stage, m.iron, x, height / 2, z, 0.09, height, 0.055, 7);
    cylinder(stage, m.iron, x, 0.25, z, 0.22, 0.5, 0.16, 8);
    block(m.iron, x, height, z, 0.65, 0.12, 0.65);
    block(m.iron, x, height + 0.65, z, 0.72, 0.14, 0.72);
    const body = block(lampBulb, x, height + 0.32, z, 0.46, 0.5, 0.46);
    body.castShadow = false;
    // Lamp posts are narrow visual details, not invisible movement traps.
  };
  const bench = (x, z, rotation = 0) => {
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    stage.add(group);
    for (const side of [-1, 1])
      block(m.iron, side * 0.8, 0.3, 0, 0.1, 0.6, 0.65, group);
    for (let i = 0; i < 4; i++) {
      block(m.wood, 0, 0.61, (i - 1.5) * 0.15, 2.1, 0.08, 0.12, group);
      if (i < 3)
        block(m.wood, 0, 0.85 + i * 0.15, -0.3, 2.1, 0.12, 0.08, group);
    }
    w.obstacle(x, z, rotation ? 0.7 : 2.1, rotation ? 2.1 : 0.7, 1.25);
  };
  return { m, block, solid, sign, column, arch, window, rail, lamp, bench };
}

export function thermalBaths(w, a) {
  const { m, block, solid, column, arch, window, sign } = a;
  const x = -44,
    z = -3;
  // Ground-floor colonnades leave north/south/east approaches open.
  solid(m.stone, -61.5, 4, z, 1, 8, 35);
  // Open central atrium, ring roof and drum support a copper cupola.
  for (const zz of [-18.5, 12.5]) block(m.wall, x, 9, zz, 36, 4, 4);
  for (const xx of [-60, -28]) block(m.wall, xx, 9, z, 4, 4, 27);
  for (const zz of [-20.5, 14.5]) {
    block(m.trim, x, 6.9, zz, 37, 0.45, 1.3);
    block(m.trim, x, 11.2, zz, 37, 0.6, 1.4);
    for (let xx = -60; xx <= -28; xx += 8) column(xx, zz, 6.8, 0.5);
    for (let xx = -56; xx <= -32; xx += 8) arch(xx, 4.3, zz, 3.45);
    for (let xx = -56; xx <= -32; xx += 8)
      window(xx, 9, zz + (zz > 0 ? 0.1 : -0.1), 2, 2.4, zz > 0 ? 0 : Math.PI);
  }
  for (const zz of [-12, -3, 6]) {
    column(-26, zz, 6.8, 0.5);
    arch(-26, 4.1, zz + 4.4, 3.8, Math.PI / 2);
  }
  block(m.trim, -26, 6.9, -3, 1.2, 0.45, 36);
  const drum = mesh(
    new T.CylinderGeometry(11.8, 12, 3.4, 40, 1, true),
    m.stone,
    w.static,
    x,
    12,
    z,
  );
  drum.material = m.stone.clone();
  drum.material.side = T.DoubleSide;
  const innerMaterial = m.trim.clone();
  innerMaterial.side = T.BackSide;
  mesh(
    new T.SphereGeometry(11.92, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    innerMaterial,
    w.static,
    x,
    13.7,
    z,
    1,
    0.72,
    1,
  ).castShadow = false;
  mesh(
    new T.SphereGeometry(12, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    m.copper,
    w.static,
    x,
    13.7,
    z,
    1,
    0.72,
    1,
  );
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8;
    const seam = mesh(
      new T.TorusGeometry(12.08, 0.055, 4, 22, Math.PI / 2),
      m.gold,
      w.static,
      x,
      13.7,
      z,
      1,
      0.72,
      1,
    );
    seam.rotation.y = angle;
  }
  cylinder(w.static, m.copper, x, 23.2, z, 1.5, 3, 0.85, 12);
  cylinder(w.static, m.gold, x, 25.6, z, 0.13, 2.8, 0.03, 8);
  // Empty medicinal pool is below the walk plane; a broad coping is cover.
  solid(m.stone, x, 0.4, -4, 10.5, 0.8, 12);
  block(m.glass, x, 0.815, -4, 9.4, 0.03, 10.8);
  for (const xx of [-50, -38])
    for (const zz of [-11, 3]) column(xx, zz, 10.8, 0.55);
  sign("THERMES · SAINTE-LUCIE", x, 6.2, 15.25, 16);
  sign("SANG DE FER", -59.9, 3.6, -6, 5, Math.PI / 2, "#e6b29f");
}

export function hotel(w, a) {
  const { m, block, solid, column, arch, window, sign, rail } = a;
  solid(m.stone, 57, 11, -43, 9, 22, 39);
  solid(m.stone, 42, 3.5, -62, 30, 7, 1.2);
  block(m.wall, 40, 14.6, -43, 26, 15, 39);
  for (const yy of [7.2, 11.2, 15.5, 20, 22.3])
    block(m.trim, 40, yy, -43, 28, 0.4, 40.5);
  for (const zz of [-59, -51, -43, -35, -27]) {
    column(26, zz, 7, 0.43);
    if (zz < -27) arch(26, 4.3, zz + 4, 3.45, Math.PI / 2);
    for (const yy of [9.2, 13.5, 18]) {
      window(26.85, yy, zz, 2.2, 2.7, -Math.PI / 2, true);
      window(61.6, yy, zz, 2.2, 2.7, Math.PI / 2, true);
    }
  }
  for (const xx of [31, 38, 45, 51])
    for (const yy of [9.2, 13.5, 18]) window(xx, yy, -23.4, 2.2, 2.7, 0, true);
  const roof = block(m.slate, 40, 24.1, -43, 30, 4, 43);
  roof.geometry = new T.CylinderGeometry(0.77, 1, 1, 4, 1);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(22, 4, 30);
  for (const zz of [-55, -34]) block(m.stone, 45, 27.5, zz, 2, 4, 2);
  rail(28.4, -43, 37, Math.PI / 2);
  // Gallery railing is upstairs; ground-level path remains open.
  const railing = w.static.children[w.static.children.length - 1];
  railing.position.y = 7.5;
  sign("GRAND HÔTEL DES EAUX", 41, 5.8, -22.8, 20);
  block(m.copper, 40, 4.5, -21, 18, 0.25, 4);
  for (const xx of [32, 48]) column(xx, -19.5, 4.4, 0.15);
}

export function clocktower(w, a) {
  const { m, block, solid, arch, sign } = a;
  solid(m.stone, 19, 10, -7, 5.6, 20, 5.6);
  for (const yy of [0.3, 6, 16, 20.3, 27])
    block(m.trim, 19, yy, -7, 6.2, 0.5, 6.2);
  block(m.stone, 19, 23.5, -7, 4.7, 6, 4.7);
  for (const side of [-1, 1]) {
    block(m.dark, 19, 24, -7 + side * 2.38, 2.5, 4, 0.06);
    arch(19, 25.1, -7 + side * 2.43, 1.25);
  }
  const roof = mesh(
    new T.ConeGeometry(4.7, 7, 4),
    m.copper,
    w.static,
    19,
    30.9,
    -7,
  );
  roof.rotation.y = Math.PI / 4;
  cylinder(w.static, m.gold, 19, 35, -7, 0.08, 3, 0.03, 6);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d5c9a6";
  ctx.beginPath();
  ctx.arc(128, 128, 125, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2f4240";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#35413a";
  ctx.font = "24px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 1; i <= 12; i++) {
    const angle = (i * Math.PI) / 6;
    ctx.fillText(
      String(i),
      128 + Math.sin(angle) * 99,
      128 - Math.cos(angle) * 99,
    );
  }
  ctx.strokeStyle = "#28332e";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(128, 128);
  ctx.lineTo(119, 191);
  ctx.moveTo(128, 128);
  ctx.lineTo(214, 147);
  ctx.stroke();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshStandardMaterial({
    map: texture,
    roughness: 0.83,
  });
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const dial = mesh(
      new T.CircleGeometry(1.95, 40),
      material,
      w.static,
      19 + Math.sin(angle) * 2.84,
      18,
      -7 + Math.cos(angle) * 2.84,
    );
    dial.rotation.y = angle;
  }
  sign("LE DERNIER MATIN · 06:17", 19, 4, -4.1, 5.2);
}

export function dam(w, a) {
  const { m, block, sign } = a;
  // Twenty broad concrete slices describe an arch dam, with real thickness,
  // weathered buttresses, crest road and six monumental spillway mouths.
  for (let i = -10; i <= 10; i++) {
    const x = i * 10,
      z = -111 - (x * x) / 550;
    const slice = block(m.concrete, x, 38, z, 10.4, 88, 12);
    slice.rotation.y = -x / 275;
    block(m.stone, x, 82.5, z, 10.6, 1.7, 15);
    block(m.dark, x, 29, z + 6.1, 0.13, 100, 0.05);
    block(m.stone, x, -0.5, z + 8, 2.8, 10, 16);
    if (i % 3 === 0) {
      block(m.stone, x, 37, z + 7, 2.5, 77, 8);
      block(m.iron, x, 84, z + 6, 0.1, 2, 0.1);
    }
  }
  for (const x of [-35, -21, -7, 7, 21, 35]) {
    const z = -111 - (x * x) / 550;
    block(m.dark, x, 66, z + 6.3, 8, 17, 0.4);
    block(m.iron, x, 62.5, z + 7, 8, 0.5, 2.5);
    for (const dx of [-4.5, 4.5]) block(m.trim, x + dx, 68, z + 7, 0.6, 22, 2);
  }
  block(m.stone, 0, 87, -110, 24, 7, 12);
  for (const x of [-8, 0, 8]) block(m.glass, x, 87, -103.8, 5, 3, 0.1);
  sign("L A C U N A  ·  1 9 3 6", 0, 44, -103.5, 45, 0, "#e0d8c4");
  sign("RETENIR L’EAU. PRÉSERVER LA VIE.", 0, 36, -103.4, 30);
}
