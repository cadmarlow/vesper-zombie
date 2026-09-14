import * as T from "three";
import {
  box,
  cylinder,
  sphere,
  mesh,
  mat,
  label,
  glowSprite,
} from "../../assets.js";
export function buildStation(world) {
  const m = world.materials;
  const floorStripe = mat(0xd0a652, 0.7, 0.3);
  for (const x of [-23, 23]) {
    world.solid(m.metal, x, 3, 0, 1, 6, 58);
    for (let z = -26; z <= 26; z += 6) {
      world.solid(m.dark, x, 6, z, 1.5, 12, 0.75);
      box(world.static, m.metal, x, 10, z, 2, 0.5, 1.2);
      box(
        world.static,
        m.cyan,
        x + (x < 0 ? 0.65 : -0.65),
        4,
        z,
        0.06,
        3,
        0.12,
      );
    }
  }
  for (let z = -25; z < 29; z += 10) {
    for (let x of [-13, 13]) {
      world.solid(m.metal, x, 4.5, z, 0.75, 9, 0.75);
      box(world.static, m.rust, x, 1, z, 1.25, 0.25, 1.25);
      for (let h of [2, 6]) box(world.static, m.gold, x, h, z, 0.85, 0.2, 0.85);
    }
    box(world.static, m.dark, 0, 9, z, 28, 0.75, 0.7);
    for (let x = -12; x <= 12; x += 4) {
      const brace = box(world.static, m.rust, x, 9.9, z, 0.18, 2.8, 0.18);
      brace.rotation.z = x % 8 === 0 ? 0.8 : -0.8;
    }
    box(world.static, m.metal, 0, 11, z, 28, 0.25, 0.45);
  }
  // Ribbed industrial blocks frame wide looping routes around cargo islands.
  for (const [x, z, w, d] of [
    [-17, 12, 6, 7],
    [17, 7, 6, 9],
    [-17, -15, 6, 7],
    [17, -21, 6, 7],
  ]) {
    world.solid(m.metal, x, 2, z, w, 4, d);
    for (let i = 0; i < w * 3; i++)
      box(
        world.static,
        m.dark,
        x - w / 2 + i / 3,
        2,
        z + d / 2 + 0.02,
        0.065,
        3.8,
        0.04,
      );
    box(world.static, m.snow, x, 4.05, z, w + 0.15, 0.1, d + 0.15);
    const l = label("B Ø R E A L", "#8db4b8", w * 0.75, 0.6);
    l.position.set(x, 2.7, z + d / 2 + 0.06);
    world.static.add(l);
  }
  for (const [x, z] of [
    [-5, 12],
    [5, -1],
    [-5, -11],
  ]) {
    world.solid(m.metal, x, 0.8, z, 3, 1.6, 2.5);
    box(world.static, m.rust, x, 0.85, z, 3.05, 0.12, 2.55);
    for (const dx of [-1.1, 1.1])
      box(world.static, m.dark, x + dx, 0.8, z + 0.03, 0.13, 1.7, 2.6);
  }
  // Overhead conduits and cages.
  for (const x of [-20, 20]) {
    const p = cylinder(world.static, m.rust, x, 6, 0, 0.3, 54, 0.3, 12);
    p.rotation.x = Math.PI / 2;
    for (let z = -24; z < 26; z += 4) {
      const ring = mesh(
        new T.TorusGeometry(0.36, 0.055, 6, 14),
        m.dark,
        world.static,
        x,
        6,
        z,
      );
    }
    const p2 = cylinder(
      world.static,
      m.metal,
      x + 0.8,
      5.7,
      0,
      0.17,
      54,
      0.17,
      8,
    );
    p2.rotation.x = Math.PI / 2;
  }
  for (let x of [-8, 8]) {
    for (let z = -28; z < 28; z += 2) {
      const stripe = box(
        world.static,
        floorStripe,
        x,
        0.02,
        z,
        0.45,
        0.015,
        0.8,
      );
      stripe.rotation.y = -0.5;
    }
  }
  // Central reactor visible from the spawn, surrounded by orbiting induction rings.
  world.solid(m.dark, 0, 0.45, -20, 7, 0.9, 7);
  cylinder(world.static, m.metal, 0, 1, -20, 2.7, 0.7, 2.4, 32);
  const reactor = new T.Group();
  reactor.position.set(0, 4.5, -20);
  world.root.add(reactor);
  const glass = cylinder(reactor, m.glass, 0, 0, 0, 1.5, 6.5, 1.5, 32);
  cylinder(reactor, m.cyan, 0, 0, 0, 0.23, 6, 0.23, 12);
  for (let i = 0; i < 5; i++) {
    const ring = mesh(
      new T.TorusGeometry(2.05, 0.1, 8, 48),
      i % 2 ? m.cyan : m.metal,
      reactor,
      0,
      -2.8 + i * 1.4,
      0,
    );
    ring.rotation.x = Math.PI / 2;
  }
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
    cylinder(reactor, m.dark, Math.sin(a) * 2.6, 0, Math.cos(a) * 2.6, 0.13, 7);
    const tube = cylinder(
      reactor,
      m.cyan,
      Math.sin(a) * 2.65,
      0,
      Math.cos(a) * 2.65,
      0.035,
      6,
    );
  }
  cylinder(world.static, m.metal, 0, 8.2, -20, 3, 0.8, 2.7, 32);
  const orb = glowSprite(0x4bfce3, 9);
  orb.position.set(0, 4, -20);
  orb.material.opacity = 0.3;
  world.coreHalo = orb;
  world.root.add(orb);
  world.animated.push({ object: reactor, kind: "reactor" });
  world.lantern(0, 4, -18, 0x50f5de, 60, true);
  box(world.static, m.metal, 0, 6, -28, 48, 12, 1.4);
  const sign = label("SECTEUR 07 / ANOMALIE ACTIVE", "#79e0d8", 10, 1);
  sign.position.set(0, 9.5, -27.2);
  world.static.add(sign);
  // Antenna, perimeter snow drifts, mountains.
  cylinder(world.static, m.metal, -20, 15, -32, 0.7, 18, 0.5, 12);
  sphere(world.static, m.snow, -20, 25, -32, 5);
  const wire = mesh(
    new T.IcosahedronGeometry(5.05, 2),
    new T.MeshBasicMaterial({ color: 0x263e48, wireframe: true }),
    world.static,
    -20,
    25,
    -32,
  );
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2,
      h = 14 + world.random() * 22;
    const mount = mesh(
      new T.ConeGeometry(12 + world.random() * 15, h, 5),
      i % 2 ? m.snow : m.stone,
      world.static,
      Math.sin(a) * 75,
      h / 2 - 6,
      Math.cos(a) * 75,
    );
    mount.rotation.y = world.random() * 4;
  }
  for (const z of [-22, -5, 17])
    for (const x of [-12, 12])
      world.lantern(x, 4, z, z === -5 ? 0x62f7e7 : 0xffb260, 14, true);
  for (let i = 0; i < 45; i++) {
    const x = (world.random() < 0.5 ? -1 : 1) * (21 + world.random()),
      z = (world.random() - 0.5) * 56;
    const rock = sphere(
      world.static,
      m.snow,
      x,
      0.07,
      z,
      0.3 + world.random() * 0.8,
      1,
      0.23,
      1.5,
    );
  }
  world.gate(3, "Secteur de confinement");
}
