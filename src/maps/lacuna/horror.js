import * as T from "three";
import { mesh, glowSprite } from "../../assets.js";
import { rng } from "../../logic.js";
import { worldSurface } from "../../surfaces.js";
import { quarantineDecals } from "./decals.js";

export function quarantine(w, a) {
  const { m, block } = a,
    stage = w.static,
    random = rng(3171936),
    decal = quarantineDecals(stage);
  const shroud = worldSurface("cloth", 0x3b4540, 1.2, { roughness: 0.82 });
  const linen = worldSurface("cloth", 0x9b9b80, 1.5, {
    roughness: 0.94,
    side: T.DoubleSide,
  });
  const bagGeometry = new T.LatheGeometry(
    [
      [0, 0],
      [0.14, 0.08],
      [0.2, 0.22],
      [0.17, 0.43],
      [0.34, 0.65],
      [0.32, 1.1],
      [0.22, 1.65],
      [0.16, 1.96],
      [0, 2.1],
    ].map(([x, y]) => new T.Vector2(x, y)),
    14,
  );
  bagGeometry
    .translate(0, -1.05, 0)
    .rotateX(Math.PI / 2)
    .scale(1, 0.66, 1);
  const bodyBag = (x, z, angle, y = 0.24) => {
    const group = new T.Group();
    group.position.set(x, y, z);
    group.rotation.y = angle;
    stage.add(group);
    mesh(bagGeometry, shroud, group);
    const seam = new T.CatmullRomCurve3([
      new T.Vector3(0, 0.11, -0.91),
      new T.Vector3(0.015, 0.22, -0.2),
      new T.Vector3(-0.018, 0.15, 0.54),
      new T.Vector3(0, 0.09, 0.93),
    ]);
    mesh(new T.TubeGeometry(seam, 10, 0.009, 4, false), m.iron, group);
    block(m.trim, 0.12, 0.12, 0.82, 0.14, 0.012, 0.22, group);
    for (const dz of [-0.48, 0.52])
      for (const side of [-1, 1])
        block(m.iron, side * 0.33, -0.12, dz, 0.12, 0.025, 0.08, group);
  };
  // The evacuation square became a collection point. Props hug the walls;
  // neither the starting gate nor the broad horde routes acquire new blockers.
  for (const side of [-1, 1])
    for (const [i, z] of [57, 60, 69, 72].entries())
      bodyBag(side * (19.6 + (i % 2) * 1.2), z, side * 0.12);
  for (const [x, z, angle] of [
    [-56.5, -12, 0.3],
    [-56.5, 6, -0.1],
    [-34, -14, 0.6],
    [-32, -10, 0.3],
    [50.6, -39, 0.1],
    [59, 28, 0.2],
  ])
    bodyBag(x, z, angle);
  // A mortuary trolley stands inside the already solid basin footprint.
  for (const x of [-46, -42]) {
    block(m.iron, x, 1.12, -4, 0.95, 0.09, 2.45);
    for (const dx of [-0.38, 0.38]) {
      block(m.iron, x + dx, 0.92, -4, 0.045, 0.4, 2.3);
      block(m.iron, x + dx, 1.27, -4, 0.04, 0.07, 2.4);
    }
    bodyBag(x, -4, 0, 1.4);
  }
  // A torn isolation curtain, pulled back against the baths' solid rear wall.
  for (const [i, z] of [-12, -2, 8].entries()) {
    const geo = new T.PlaneGeometry(3.7, 4.8, 12, 15);
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) {
      p.setZ(j, Math.sin(p.getX(j) * 7) * 0.1);
      if (p.getY(j) < -2.1) p.setY(j, p.getY(j) + random() * 0.6);
    }
    geo.computeVertexNormals();
    const sheet = mesh(geo, linen, stage, -60.72, 3.1, z);
    sheet.rotation.y = Math.PI / 2;
    block(m.iron, -60.65, 5.7, z, 0.08, 0.06, 4.1);
    decal(i === 1 ? 6 : 1, -60.5, 2.8, z, 2.7, 3.5, Math.PI / 2);
  }
  for (const [x, z, width, depth, angle] of [
    [-15, 61, 5, 3, 0.6],
    [19, 71, 3, 4, 0],
    [-19.5, 56.8, 3.6, 3, 0],
    [-55, -11, 4.5, 3, 0.2],
    [-54, 4, 3.8, 5, -0.4],
    [-33, -12, 3, 5, 0],
    [-44, -4, 9.2, 10.6, 0],
    [49.5, -39, 3, 6, 0.2],
    [58, 27, 4.2, 3.5, 0],
    [20.7, -9, 2.3, 4, 0.4],
    [-20, 36, 3, 2, 0.3],
    [16, 20, 2, 3.5, 0.3],
  ])
    decal(0, x, x === -44 ? 0.839 : 0.066, z, width, depth, angle, true);
  for (const [x, z, angle] of [
    [-14, 57, 0.3],
    [-56, 0, 0],
    [50, -34, 0.4],
    [55, 24, 0.8],
    [18, 16, 0],
  ])
    decal(7, x, 0.068, z, 1.5, 9, angle, true);
  for (const [x, y, z, width, angle, tile] of [
    [-23.78, 2.7, 61, 4, Math.PI / 2, 1],
    [23.77, 3.1, 69, 4.5, -Math.PI / 2, 5],
    [-23.78, 3.1, 72, 2.4, Math.PI / 2, 3],
    [23.77, 3.1, 59, 2.4, -Math.PI / 2, 3],
    [-17, 2.6, 48.64, 3, 0, 3],
    [17, 2.8, 48.64, 6, 0, 2],
    [52.35, 2.3, -43, 3.5, -Math.PI / 2, 1],
    [52.35, 3, -54, 3.3, -Math.PI / 2, 6],
    [-44, 8.9, 14.53, 7.5, 0, 2],
    [61.46, 2.7, 18, 2.5, -Math.PI / 2, 3],
  ])
    decal(tile, x, y, z, width, tile === 3 ? width * 1.2 : width * 0.72, angle);
  // Tall water damage breaks up formerly spotless façades and dam buttresses.
  for (const [x, y, z, width, height, angle] of [
    [-42, 3, 48.65, 47, 5.8, 0],
    [42, 3, 48.65, 47, 5.8, 0],
    [52.38, 3.5, -43, 34, 6, -Math.PI / 2],
    [-61, 3, -3, 29, 5.8, Math.PI / 2],
    [40, 16, -23.42, 25, 10, 0],
    [-44, 9.3, 14.54, 32, 3.7, 0],
  ])
    decal(4, x, y, z, width, height, angle);
  for (const x of [-65, -45, -25, 25, 45, 65])
    decal(4, x, 33, -104.2 - (x * x) / 550, 7, 67);
  // Sagging cables frame the approach; there are no new colliders at head level.
  for (const [x1, x2, z, y] of [
    [-24, 24, 58, 9],
    [-24, 24, 75, 10],
    [-60, -27, 20, 8],
    [27, 61, -21, 8],
    [-24, 23, -57, 12],
  ]) {
    const cable = new T.CatmullRomCurve3([
      new T.Vector3(x1, y, z),
      new T.Vector3((x1 + x2) / 2, y - 2.1, z + 0.7),
      new T.Vector3(x2, y + 0.3, z),
    ]);
    mesh(new T.TubeGeometry(cable, 18, 0.035, 4, false), m.iron, stage);
  }
  const emergency = new T.MeshStandardMaterial({
    color: 0x922e1e,
    emissive: 0xff2813,
    emissiveIntensity: 2,
    roughness: 0.5,
  });
  const surgical = new T.MeshStandardMaterial({
    color: 0x819d90,
    emissive: 0xa7c8ae,
    emissiveIntensity: 1.8,
    roughness: 0.7,
  });
  // These real lights enter the engine's existing nearest-light budget (six on
  // mobile). Local pools of light replace a globally brightened powered town.
  const fixtures = [
    [-18, 4.4, 52, true],
    [18, 4.4, 52, true],
    [-22.6, 4.1, 68, false],
    [22.6, 4.1, 63, true],
    [-52, 5.4, 10, true],
    [-54, 5.1, -12, false],
    [-33, 5.2, -15, true],
    [-44, 7, -45, false],
    [49, 5, -28, true],
    [49, 5, -54, false],
    [57, 5.5, 23, true],
    [-46, 4.9, 32, true],
    [0, 8.7, -68, true],
    [-12, 3.5, -42, false],
    [12, 3.5, 38, false],
    [19, 5.6, -3, true],
    [12, 4.2, 15, false],
    [-12, 4.2, -18, false],
    [29, 4.2, 12, true],
    [24, 4.2, 28, true],
  ];
  fixtures.forEach(([x, y, z, red], i) => {
    block(m.iron, x, y / 2, z - 0.15, 0.07, y, 0.07);
    block(m.iron, x, 0.04, z - 0.15, 0.42, 0.08, 0.42);
    block(m.iron, x, y, z, red ? 0.6 : 1.8, 0.3, 0.45);
    const bulb = block(
      red ? emergency : surgical,
      x,
      y - 0.2,
      z + 0.04,
      red ? 0.38 : 1.5,
      0.15,
      0.2,
    );
    bulb.castShadow = false;
    const light = new T.PointLight(
      red ? 0xff3c20 : 0xa6cdbb,
      red ? 47 : 54,
      red ? 19 : 18,
      1.8,
    );
    light.position.set(x, y - 0.45, z);
    w.root.add(light);
    const halo = glowSprite(red ? 0xf04725 : 0xabc8b0, red ? 1.6 : 1.2);
    halo.position.copy(light.position);
    halo.material.opacity = red ? 0.23 : 0.14;
    w.root.add(halo);
    w.lights.push({
      light,
      bulb: bulb.material,
      halo,
      powered: false,
      base: red ? 47 : 54,
      phase: i * 1.73,
    });
  });
  const beacons = [];
  for (const x of [-75, -35, 0, 35, 75]) {
    const z = -103 - (x * x) / 550;
    block(m.iron, x, 84.2, z, 0.16, 3.5, 0.16);
    const bulb = mesh(
      new T.SphereGeometry(0.32, 8, 6),
      emergency,
      stage,
      x,
      86,
      z,
    );
    bulb.castShadow = false;
    const halo = glowSprite(0xff351c, 7);
    halo.position.set(x, 86, z);
    halo.material.opacity = 0.2;
    w.root.add(halo);
    beacons.push(halo);
  }
  const fogMaterial = new T.MeshBasicMaterial({
    map: fogTexture(),
    color: 0x54737b,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const fog = [];
  for (let i = 0; i < 18; i++) {
    const x = (i % 2 ? -1 : 1) * (11 + random() * 18),
      z = -61 + random() * 129;
    const layer = mesh(
      new T.PlaneGeometry(17 + random() * 8, 2.5),
      fogMaterial,
      w.root,
      x,
      0.65,
      z,
    );
    layer.rotation.y = i * 1.37;
    layer.castShadow = layer.receiveShadow = false;
    fog.push({ layer, x, z, phase: random() * 6 });
  }
  return {
    update(dt, time) {
      beacons.forEach((b, i) => {
        b.material.opacity = 0.08 + Math.sin(time * 0.9 + i * 0.4) ** 6 * 0.19;
      });
      for (const { layer, x, z, phase } of fog) {
        layer.position.x = x + Math.sin(time * 0.035 + phase) * 3;
        layer.position.z = z + Math.cos(time * 0.04 + phase) * 2;
      }
    },
    setQuality(quality, mobile) {
      fog.forEach(({ layer }, i) => {
        layer.visible = i < (quality === "low" ? 6 : mobile ? 10 : 18);
      });
    },
  };
}

function fogTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const c = canvas.getContext("2d"),
    random = rng(413);
  for (let i = 0; i < 35; i++) {
    const x = 20 + random() * 216,
      y = 25 + random() * 16,
      gradient = c.createRadialGradient(x, y, 1, x, y, 16 + random() * 14);
    gradient.addColorStop(0, "rgba(255,255,255,.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 256, 64);
  }
  return new T.CanvasTexture(canvas);
}
