import * as T from "three";
import { mesh, cylinder } from "../../assets.js";
import { rng } from "../../logic.js";
import { worldSurface } from "../../surfaces.js";

export function dressLacuna(w, a) {
  const { m, block, sign, window } = a,
    random = rng(6172001);
  const stage = w.static;
  // Streets continue visually beyond the retaining wall: shuttered villas and
  // mansard roofs anchor the town in the valley without changing its collision.
  for (const side of [-1, 1])
    for (const [index, z] of [-59, -22, 18, 59].entries()) {
      const x = side * 82,
        height = 10 + (index % 2) * 3;
      block(index % 2 ? m.wall : m.stone, x, height / 2, z, 17, height, 23);
      for (const y of [3.1, 6.9, 10.2])
        if (y < height)
          for (const dz of [-7, 0, 7])
            window(
              side * 73.4,
              y,
              z + dz,
              1.8,
              2.5,
              side < 0 ? Math.PI / 2 : -Math.PI / 2,
              true,
            );
      block(m.trim, x, height, z, 18, 0.4, 24);
      const roof = mesh(
        new T.CylinderGeometry(0.68, 1, 1, 4),
        index % 2 ? m.slate : m.copper,
        stage,
        x,
        height + 1.9,
        z,
        13,
        4,
        17,
      );
      roof.rotation.y = Math.PI / 4;
      for (const dz of [-6, 6])
        block(m.stone, x, height + 4, z + dz, 1.2, 3, 1.4);
    }
  // Broad steps are decorative cornices below the walking datum. The actual
  // movement plane stays level so touch users never need precision jumps.
  for (const [x, z, width, depth] of [
    [-44, -3, 35, 35],
    [44, -43, 33, 40],
    [46, 18, 31, 34],
  ]) {
    for (const s of [-1, 1]) {
      block(m.trim, x + (s * width) / 2, 0.025, z, 0.65, 0.05, depth);
      block(m.trim, x, 0.025, z + (s * depth) / 2, width, 0.05, 0.65);
    }
  }
  // Mineral-blue bath mosaic and concentric rings, reflected by the pool.
  const tile = worldSurface("floor", 0x76a39a, 1.9, {
    roughness: 0.73,
    metalness: 0.04,
  });
  block(tile, -44, 0.022, -3, 32, 0.035, 29);
  for (let x = -59; x < -28; x += 2)
    for (let z = -17; z < 12; z += 2)
      block(m.trim, x, 0.044, z, 0.1, 0.014, 1.8);
  for (const r of [7.2, 8, 8.35]) {
    const ring = mesh(
      new T.RingGeometry(r, r + 0.12, 64),
      m.gold,
      stage,
      -44,
      0.06,
      -4,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = false;
  }
  // Roof gutters, downpipes, dentils, shutters and balcony consoles give the
  // streets a human scale beneath the much larger dam silhouette.
  for (const z of [-62, -24]) {
    block(m.copper, 44, 22.65, z, 34, 0.17, 0.22);
    for (let x = 29; x <= 60; x += 1.3)
      block(m.trim, x, 21.65, z, 0.35, 0.48, 0.45);
    for (const x of [28, 60]) {
      cylinder(stage, m.copper, x, 10.5, z, 0.12, 21, 0.12, 8);
      block(m.rust, x, 0.55, z, 0.34, 1.1, 0.3);
    }
  }
  for (const z of [-51, -35]) {
    block(m.trim, 26, 11.4, z, 2.4, 0.25, 4.5);
    for (const dz of [-2.1, 2.1]) block(m.iron, 25.1, 12, z + dz, 2, 0.08, 0.1);
    block(m.iron, 24.15, 12, z, 0.08, 0.09, 4.3);
    for (let dz = -2; dz <= 2; dz += 0.35)
      block(m.iron, 24.15, 11.75, z + dz, 0.035, 0.56, 0.035);
  }
  // Ground-level galleries have glazed, boarded and broken room fronts.
  for (const z of [-56, -42, -29]) {
    window(52.42, 3, z, 2.8, 3.8, -Math.PI / 2);
    const plank = block(m.wood, 52.29, 3, z, 0.12, 0.32, 3.5);
    plank.rotation.x = 0.26;
  }
  for (const z of [-15, -1, 9]) window(-60.93, 3.6, z, 2.2, 3.4, Math.PI / 2);
  for (const z of [56, 65, 74]) {
    for (const side of [-1, 1]) {
      window(
        side * 23.84,
        3,
        z,
        2.8,
        3.8,
        side < 0 ? Math.PI / 2 : -Math.PI / 2,
      );
      block(m.iron, side * 23.5, 5.25, z, 0.6, 0.12, 4);
    }
  }
  sign("BILLETS · DERNIER DÉPART 06:17", -23.35, 5.6, 66, 7, Math.PI / 2);
  sign("BAGAGES ABANDONNÉS", 23.35, 5.6, 66, 6, -Math.PI / 2);
  // Copper drainage channels, metal grates and safe puddles interrupt the scan
  // repetition without hidden collisions or a costly reflection render pass.
  for (const x of [-15, 15])
    for (let z = -57; z < 45; z += 13) {
      block(m.dark, x, 0.025, z, 1.2, 0.03, 2);
      for (let dz = -0.9; dz <= 0.9; dz += 0.2)
        block(m.iron, x, 0.048, z + dz, 1.18, 0.025, 0.045);
    }
  const puddle = new T.MeshStandardMaterial({
    color: 0x829fa0,
    roughness: 0.16,
    metalness: 0.72,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  for (const [x, z, sx, sz] of [
    [-14, 31, 1.8, 3.7],
    [15, -32, 2, 4],
    [-62, 19, 3, 2],
    [-33, 43, 4, 1.8],
    [54, 39, 3, 2],
    [8, 60, 3, 1.8],
    [36, -17, 2, 4],
  ]) {
    const p = mesh(
      new T.CircleGeometry(1, 19),
      puddle,
      w.root,
      x,
      0.055,
      z,
      sx,
      sz,
      1,
    );
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = random() * 3;
    p.castShadow = false;
  }
  // Abandoned café tables, laundry and a wrecked delivery handcart.
  for (const [x, z] of [
    [37, -26],
    [47, -26],
    [-56, 26],
    [-37, 37],
  ]) {
    cylinder(stage, m.iron, x, 0.46, z, 0.07, 0.9, 0.06, 8);
    cylinder(stage, m.wood, x, 0.94, z, 0.75, 0.1, 0.75, 18);
    w.obstacle(x, z, 1.5, 1.5, 1.05);
    for (const side of [-1, 1]) {
      block(m.wood, x + side * 1.1, 0.48, z, 0.6, 0.09, 0.6);
      block(m.wood, x + side * 1.4, 0.86, z, 0.08, 0.68, 0.62);
      for (const dz of [-0.23, 0.23])
        block(m.iron, x + side * 1.1, 0.23, z + dz, 0.04, 0.46, 0.04);
    }
  }
  const cart = new T.Group();
  cart.position.set(-62, 0.1, 43);
  cart.rotation.y = 0.45;
  stage.add(cart);
  block(m.wood, 0, 0.65, 0, 2.5, 0.14, 1.3, cart);
  for (const side of [-1, 1]) {
    const wheel = mesh(
      new T.TorusGeometry(0.5, 0.09, 7, 18),
      m.iron,
      cart,
      side * 1,
      0.48,
      0,
    );
    wheel.rotation.y = Math.PI / 2;
    block(m.wood, 0, 1.05, side * 0.68, 2.5, 0.8, 0.07, cart);
    block(m.wood, 1.8, 0.6, side * 0.55, 1.2, 0.1, 0.1, cart);
  }
  w.obstacle(-62, 43, 3.2, 2, 1.5);
  const cloth = new T.MeshStandardMaterial({
    color: 0xab9c75,
    roughness: 1,
    side: T.DoubleSide,
  });
  for (const [x, z, angle] of [
    [-58, 39, 0.2],
    [-33, 25, -0.1],
    [33, 1, 0.08],
  ]) {
    const banner = mesh(
      new T.PlaneGeometry(2.4, 2.8, 6, 8),
      cloth,
      w.root,
      x,
      4.8,
      z,
    );
    banner.rotation.y = angle;
    w.animated.push({
      kind: "banner",
      object: banner,
      base: banner.geometry.attributes.position.array.slice(),
      phase: x,
    });
    block(m.iron, x, 6.3, z, 2.6, 0.09, 0.09);
  }
  // Creeping ivy, reeds and tufts use a single instanced leaf mesh. Clusters
  // stay at architectural edges and cannot obstruct the combat sightline.
  const leafGeo = new T.CircleGeometry(1, 5);
  const leafMat = new T.MeshStandardMaterial({
    color: 0x607754,
    roughness: 0.9,
    side: T.DoubleSide,
  });
  const leaves = new T.InstancedMesh(leafGeo, leafMat, 1400);
  const transform = new T.Object3D();
  const gardens = [
    [-61, -19],
    [-61, 13],
    [59, -60],
    [58, -24],
    [-60, -32],
    [62, 2],
    [-70, 47],
    [69, -50],
    [-20, 25],
    [20, -30],
    [49, 42],
  ];
  for (let i = 0; i < 1400; i++) {
    const [x, z] = gardens[i % gardens.length],
      vertical = i % 11 < 6;
    transform.position.set(
      x + (random() - 0.5) * 2.7,
      vertical ? random() * 5.7 : random() * 0.6 + 0.12,
      z + (random() - 0.5) * 2.1,
    );
    transform.rotation.set(
      random() * 2,
      random() * Math.PI * 2,
      random() * Math.PI,
    );
    const size = 0.12 + random() * 0.3;
    transform.scale.set(size, size * 0.65, 1);
    transform.updateMatrix();
    leaves.setMatrixAt(i, transform.matrix);
    leaves.setColorAt(
      i,
      new T.Color().setHSL(
        0.21 + random() * 0.09,
        0.16 + random() * 0.14,
        0.18 + random() * 0.14,
      ),
    );
  }
  leaves.castShadow = false;
  leaves.receiveShadow = true;
  w.root.add(leaves);
  // Fallen slate, gravel and leaf litter are tiny enough to remain non-solid.
  const rubble = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 0),
    m.stone,
    500,
  );
  for (let i = 0; i < 500; i++) {
    const [x, z] = gardens[i % gardens.length];
    transform.position.set(
      x + (random() - 0.5) * 6,
      0.04,
      z + (random() - 0.5) * 5,
    );
    transform.rotation.set(random(), random() * 6, random());
    transform.scale.set(
      0.035 + random() * 0.14,
      0.025 + random() * 0.05,
      0.05 + random() * 0.18,
    );
    transform.updateMatrix();
    rubble.setMatrixAt(i, transform.matrix);
  }
  rubble.receiveShadow = true;
  w.root.add(rubble);
  // Flood-height witnesses make the waterline and past catastrophe legible.
  for (const [x, z, rotation] of [
    [-59.5, -30, 0],
    [61.3, 29, -Math.PI / 2],
    [20, -4, 0],
  ]) {
    const mark = sign(
      "CRUE DU 17 JUIN · +4,80 M",
      x,
      4.8,
      z,
      3.2,
      rotation,
      "#cab5a0",
    );
    mark.name = "flood-witness";
  }
  return {
    setQuality(quality, mobile) {
      leaves.count = quality === "low" ? 500 : mobile ? 850 : 1400;
      rubble.count = quality === "low" ? 180 : mobile ? 280 : 500;
    },
  };
}
