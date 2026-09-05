import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Navigation,
  canStand,
  moveSlide,
  waveCount,
  enemyType,
  mysteryWeapon,
  newWeapon,
  magazine,
  reloadWeapon,
  rng,
} from "../src/logic.js";
test("flow field routes around a sealed wall and rebuilds after a gate opens", () => {
  const wall = { x: 0, z: 0, w: 10, d: 1, active: true },
    nav = new Navigation([wall], 24, 1);
  nav.update(0, -5);
  assert(nav.distance[nav.index(0, 5)] > 10);
  const p = { x: 0, z: 5 };
  for (let i = 0; i < 300; i++) {
    const target = nav.direction(p.x, p.z, { x: 0, z: -5 }),
      dx = target.x - p.x,
      dz = target.z - p.z,
      length = Math.hypot(dx, dz);
    if (length < 0.05) break;
    moveSlide(p, (dx / length) * 0.16, (dz / length) * 0.16, [wall], 0.36);
  }
  assert(p.z < -4);
  wall.active = false;
  nav.rebuild();
  nav.update(0, -5);
  assert(nav.distance[nav.index(0, 5)] <= 10);
});
test("movement cannot tunnel through obstacles at high speed and slides along them", () => {
  const obstacles = [{ x: 0, z: 0, w: 1, d: 8 }];
  const p = { x: -2, z: 0 };
  moveSlide(p, 7, 1.5, obstacles);
  assert(p.x < -0.85);
  assert(p.z > 1.4);
  assert(canStand(p.x, p.z, obstacles));
});
test("reloading conserves rounds and respects extended magazines", () => {
  const w = newWeapon("vigil");
  w.ammo = 3;
  w.reserve = 4;
  assert.equal(reloadWeapon(w), 4);
  assert.equal(w.ammo, 7);
  assert.equal(w.reserve, 0);
  w.level = 1;
  w.reserve = 99;
  reloadWeapon(w);
  assert.equal(w.ammo, 18);
  assert.equal(w.reserve, 88);
  assert.equal(magazine(w), 18);
});
test("wave sizes rise and enemies unlock at intended rounds", () => {
  assert(waveCount(10) > waveCount(1));
  assert(waveCount(3, 0.8) < waveCount(3, 1.25));
  for (let i = 0; i < 100; i++)
    assert.equal(
      enemyType(1, () => i / 100),
      "walker",
    );
  assert.equal(
    enemyType(5, () => 0.05),
    "brute",
  );
  assert.equal(
    enemyType(6, () => 0.15),
    "wraith",
  );
  assert.equal(
    enemyType(4, () => 0.3),
    "spitter",
  );
  assert.equal(
    enemyType(2, () => 0.5),
    "runner",
  );
});
test("mystery box distribution includes all rewards and no invalid weapon", () => {
  const outcomes = new Set();
  for (let i = 0; i < 100; i++) outcomes.add(mysteryWeapon(() => i / 100));
  assert.deepEqual(
    [...outcomes],
    ["eclipse", "longinus", "requiem", "marauder", "spectre"],
  );
});
test("map generation uses reproducible random streams", () => {
  const a = rng(37),
    b = rng(37);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test("a point ray clearing a pillar is not enough clearance for a zombie body", async () => {
  const { clearPath } = await import("../src/logic.js");
  const pillar = [{ x: 0, z: 0, w: 2, d: 2 }];
  const a = { x: -3, z: 1.2 },
    b = { x: 3, z: 1.2 };
  assert(clearPath(a, b, pillar, 0));
  assert(!clearPath(a, b, pillar, 0.36));
  assert(clearPath({ x: -3, z: 1.7 }, { x: 3, z: 1.7 }, pillar, 0.6));
});

test("spawning near the abbey columns never uses an obstructed authored anchor", () => {
  const pillars = [-18, 18].map((x) => ({ x, z: 22, w: 1.6, d: 1.6 }));
  const anchors = [
      [-19, 23],
      [19, 23],
    ],
    player = { x: 0, z: 20 };
  for (const radius of [0.36, 0.6]) {
    const nav = new Navigation(pillars, 64, 1, radius);
    nav.update(player.x, player.z);
    assert(!canStand(...anchors[0], pillars, radius));
    for (let i = 0; i < 50; i++) {
      const p = nav.spawnPosition(anchors, player, () => i / 50);
      assert(p && canStand(p.x, p.z, pillars, radius));
      assert(nav.distance[nav.index(p.x, p.z)] >= 0);
      assert(Math.hypot(p.x - player.x, p.z - player.z) > 10);
    }
  }
});

test("spawn fallback stays in the accessible zone when every anchor is sealed off", () => {
  const wall = { x: 0, z: 0, w: 64, d: 2 };
  const nav = new Navigation([wall]);
  nav.update(0, 10);
  const p = nav.spawnPosition([[0, -10]], { x: 0, z: 10 }, () => 0.4);
  assert(p && p.z > 0 && canStand(p.x, p.z, [wall]));
});

test("wall-hugging player positions still seed a reachable navigation goal", () => {
  const wall = { x: 0, z: 0, w: 1, d: 5 },
    nav = new Navigation([wall]);
  assert(canStand(0.9, 0, [wall]));
  assert(nav.blocked[nav.index(0.9, 0)]);
  nav.update(0.9, 0);
  assert(nav.distance[nav.index(4, 4)] >= 0);
});

test("steering progresses from a grid center instead of tying with staying still", () => {
  const obstacle = { x: 0, z: 0, w: 4, d: 2 },
    nav = new Navigation([obstacle]);
  nav.update(0, -5);
  const p = { x: -1.5, z: 2.5 };
  const next = nav.direction(p.x, p.z, { x: 0, z: -5 });
  assert(Math.hypot(next.x - p.x, next.z - p.z) > 0.1);
});

test("an actor pushed around a barrel corner can step back to a valid route", async () => {
  const { clearPath } = await import("../src/logic.js");
  const obstacles = [
    { x: 20.1, z: 13.3, w: 1.5, d: 1.5 },
    { x: 17, z: 7, w: 6, d: 9 },
    { x: 23, z: 0, w: 1, d: 58 },
  ];
  const nav = new Navigation(obstacles, 64, 1, 0.36),
    p = { x: 21.155564384818174, z: 12.187985445852515 },
    target = { x: -14.5, z: 18 };
  nav.update(target.x, target.z);
  const next = nav.direction(p.x, p.z, target);
  assert(Math.hypot(next.x - p.x, next.z - p.z) > 0.1);
  assert(clearPath(p, next, obstacles, 0.36));
  for (let frame = 0; frame < 1500; frame++) {
    const to = nav.direction(p.x, p.z, target),
      dx = to.x - p.x,
      dz = to.z - p.z,
      d = Math.hypot(dx, dz);
    if (d < 0.01) break;
    const step = Math.min(0.08, d);
    moveSlide(p, (dx / d) * step, (dz / d) * step, obstacles, 0.36);
  }
  assert(Math.hypot(p.x - target.x, p.z - target.z) < 1);
});
