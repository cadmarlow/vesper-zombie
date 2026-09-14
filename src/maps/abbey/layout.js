import * as T from "three";
import { box, mesh, glow, glowSprite } from "../../assets.js";
export function buildAbbey(world) {
  const m = world.materials;
  for (const x of [-11, 11])
    for (const z of [-21, -11, -1, 9, 22])
      world.column(x, z, z === 22 ? 10 : 11.5);
  for (const z of [-21, -11, -1, 9, 22]) {
    world.arch(0, 11.8, z, 22, 6.4);
    for (const x of [-18, 18]) {
      world.column(x, z, 6.5);
      world.arch(x < 0 ? -14.5 : 14.5, 6.9, z, 7, 4);
    }
  }
  for (const x of [-11, 11])
    for (const z of [-16, -6, 4, 15.5])
      world.arch(x, 11.8, z, z === 15.5 ? 13 : 10, 4, Math.PI / 2);
  // Broken perimeter: buttresses, pointed windows and luminous stained glass.
  for (const x of [-23, 23]) {
    world.solid(m.stone, x, 2.1, 0, 1.1, 4.2, 58);
    for (let z = -25; z < 28; z += 8) {
      world.solid(m.stone, x, 6.4, z, 1.65, 8.5, 1.9);
      box(world.static, m.trim, x, 10.8, z, 2, 0.4, 2.1);
      world.arch(x, 6.2, z + 4, 5.7, 3.3, Math.PI / 2);
      const window = box(world.static, m.dark, x, 5.6, z + 4, 0.3, 3.1, 4.3);
      for (let i = -1; i <= 1; i++)
        box(
          world.static,
          m.copper,
          x + (x < 0 ? 0.17 : -0.17),
          5.5,
          z + 4 + i * 1.05,
          0.04,
          2.9,
          0.065,
        );
    }
  }
  world.solid(m.stone, -16, 7, -28, 16, 14, 1.5);
  world.solid(m.stone, 16, 7, -28, 16, 14, 1.5);
  world.arch(0, 7, -28, 16, 8);
  box(world.static, m.stone, 0, 16.5, -28, 17, 3, 1.5);
  const rose = new T.Group();
  rose.position.set(0, 13.4, -27.15);
  world.static.add(rose);
  mesh(new T.TorusGeometry(2.8, 0.22, 8, 48), m.trim, rose);
  mesh(new T.TorusGeometry(2.48, 0.085, 6, 40), m.gold, rose);
  mesh(new T.CircleGeometry(2.42, 40), glow(0x8b3c32, 0.35), rose, 0, 0, -0.05);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    box(
      rose,
      m.trim,
      Math.sin(a) * 1.22,
      Math.cos(a) * 1.22,
      0,
      0.09,
      2.48,
      0.15,
    ).rotation.z = -a;
    const petal = mesh(
      new T.TorusGeometry(0.64, 0.065, 5, 20),
      m.gold,
      rose,
      Math.sin(a) * 1.7,
      Math.cos(a) * 1.7,
      0.1,
    );
    petal.scale.y = 1.3;
  }
  mesh(new T.TorusGeometry(0.65, 0.13, 6, 24), m.trim, rose);
  // Side aisles are navigable; seats form readable cover islands.
  for (let z of [15, 10, 1, -4, -14])
    for (let x of [-4.9, 4.9]) {
      if (z === -4) continue;
      world.solid(m.wood, x, 0.55, z, 3.2, 1.1, 0.8);
      box(world.static, m.wood, x, 0.44, z + 0.4, 3.25, 0.15, 0.7);
      box(world.static, m.trim, x - 1.6, 0.6, z, 0.14, 1.2, 0.85);
      box(world.static, m.trim, x + 1.6, 0.6, z, 0.14, 1.2, 0.85);
    }
  // Ritual altar with orbiting copper rings, luminous fissure and engraved plinth.
  world.solid(m.stone, 0, 0.6, -19, 5, 1.2, 3);
  box(world.static, m.trim, 0, 1.3, -19, 5.5, 0.25, 3.4);
  const rings = new T.Group();
  rings.position.set(0, 4, -19);
  world.root.add(rings);
  for (let i = 0; i < 3; i++) {
    const ring = mesh(
      new T.TorusGeometry(1.45 + i * 0.3, 0.038, 6, 72),
      i === 1 ? m.red : m.gold,
      rings,
    );
    ring.rotation.x = i * 0.8;
    ring.rotation.y = i * 0.6;
  }
  const core = mesh(new T.IcosahedronGeometry(0.65, 1), m.black, rings);
  core.rotation.z = 0.5;
  const inner = glowSprite(0xff7539, 4.5);
  rings.add(inner);
  inner.material.opacity = 0.35;
  world.coreHalo = inner;
  world.animated.push({ object: rings, kind: "relic" });
  world.lantern(0, 2.3, -18, 0xff6438, 23, true);
  for (const z of [-21, -1, 19])
    for (const x of [-10, 10]) world.lantern(x, 2.5, z);
  for (let x of [-3.4, 3.4]) {
    world.candles(x, -18, 10);
    world.candles(x, -20, 7);
  }
  for (let z of [-13, 6, 23]) world.candles(-12, z, 6);
  // Distant silhouette, mausoleums and fallen masonry.
  for (let i = 0; i < 14; i++) {
    const x = (i % 2 ? -1 : 1) * (28 + world.random() * 14),
      z = -35 + world.random() * 70,
      h = 12 + world.random() * 20;
    box(world.static, m.stone, x, h / 2, z, 4, h, 5);
    mesh(new T.ConeGeometry(3, 8, 4), m.dark, world.static, x, h + 4, z);
  }
  for (let i = 0; i < 70; i++) {
    const side = world.random() < 0.5 ? -1 : 1,
      x = side * (19.3 + world.random() * 2),
      z = -25 + world.random() * 51;
    const rock = mesh(
      new T.DodecahedronGeometry(0.12 + world.random() * 0.4, 0),
      m.stone,
      world.static,
      x,
      0.15,
      z,
    );
    rock.rotation.set(world.random() * 4, world.random() * 4, 0);
    rock.scale.y = 0.55;
  }
  world.gate(5, "La nef interdite");
}
