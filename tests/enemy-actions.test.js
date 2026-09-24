import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { ENEMIES } from "../src/content/enemies.js";
import {
  ENEMY_ACTIONS,
  enemyActionDuration,
  enemyActionPresentation,
  enemyVariation,
  turnEnemyYaw,
  updateEnemyAction,
} from "../src/game/enemy-actions.js";
import { EnemySystem } from "../src/game/enemies.js";
import { ENEMY_BEHAVIORS } from "../src/game/enemy-behaviors.js";
import { WorldReplica } from "../src/network/replica.js";
import { snapshot } from "../src/network/snapshot.js";
import { PROTOCOL_VERSION, validSnapshot } from "../server/protocol.js";

function modelFixture() {
  const model = new T.Group();
  model.userData = {
    hips: new T.Bone(),
    torso: new T.Bone(),
    head: new T.Bone(),
    jaw: new T.Bone(),
    arms: [new T.Bone(), new T.Bone()],
    elbows: [new T.Bone(), new T.Bone()],
    wrists: [new T.Bone(), new T.Bone()],
    legs: [0, 1].map(() => ({
      root: new T.Bone(),
      shin: new T.Bone(),
      foot: new T.Bone(),
    })),
    type: "walker",
    variation: enemyVariation(1),
  };
  return model;
}

test("every melee variant anticipates, contacts once and finishes recovery", () => {
  for (const type of Object.keys(ENEMIES)) {
    const enemy = { id: 1, type, attack: 0, spit: 5 };
    const start = 10;
    assert.equal(updateEnemyAction(enemy, start, { melee: true }), null);
    const duration = enemyActionDuration("melee", type);
    const contact = start + duration * ENEMY_ACTIONS.melee.contact;
    assert.equal(
      updateEnemyAction(enemy, contact - 0.0001, { melee: true }),
      null,
    );
    assert.equal(updateEnemyAction(enemy, contact, { melee: true }), "melee");
    enemy.attack = ENEMIES[type].attackInterval;
    assert.equal(
      updateEnemyAction(enemy, contact + 0.001, { melee: true }),
      null,
    );
    assert.equal(
      enemyActionPresentation(enemy.action, contact, type, enemy.id)
        .actionPhase,
      (contact - start) / duration,
    );
    assert.equal(
      enemyActionPresentation(enemy.action, start + duration + 0.001, type)
        .action,
      "none",
    );
  }
});

test("a long frame cannot skip or repeat the contact marker", () => {
  const enemy = { type: "spitter", attack: 2, spit: 0 };
  updateEnemyAction(enemy, 1, { spit: true });
  assert.equal(updateEnemyAction(enemy, 3, { spit: true }), "spit");
  enemy.spit = 3.6;
  assert.equal(updateEnemyAction(enemy, 3.01, { spit: true }), null);
});

test("continuous attacks retain each variant's cadence at 30 and 60 FPS", () => {
  for (const fps of [30, 60]) {
    for (const type of ["walker", "runner"]) {
      const enemy = { type, attack: 0, spit: 3 };
      const contacts = [];
      for (let frame = 0; frame < 6 * fps; frame++) {
        enemy.attack -= 1 / fps;
        const event = updateEnemyAction(enemy, frame / fps, { melee: true });
        if (event === "melee") {
          contacts.push(frame / fps);
          enemy.attack = ENEMIES[type].attackInterval;
        }
      }
      assert.ok(contacts.length >= 4);
      for (let i = 1; i < contacts.length; i++) {
        const interval = contacts[i] - contacts[i - 1];
        assert.ok(interval >= ENEMIES[type].attackInterval - 1 / fps);
        assert.ok(interval <= ENEMIES[type].attackInterval + 2 / fps + 1e-9);
      }
    }
  }
});

test("a swing hits at contact but misses cover and a target moving behind its arms", () => {
  for (const obstruction of ["none", "cover", "behind"]) {
    const model = modelFixture();
    const enemy = {
      id: 1,
      model,
      type: "walker",
      attack: 0,
      spit: 5,
      stagger: 0,
      seed: 0,
      age: 1,
      nextDetailCheck: Infinity,
    };
    const run = {
      time: 0,
      wave: 1,
      enemies: [enemy],
      player: { position: new T.Vector3(0, 0, 1) },
      navigation: { direction: (_x, _z, target) => target },
      world: { obstacles: [] },
    };
    let blocked = false;
    const damage = [];
    const system = new EnemySystem(
      { run },
      {
        obstacleDistance: (_origin, _direction, distance) =>
          blocked ? 0 : distance,
        hurt: (amount) => damage.push({ amount, time: run.time }),
      },
    );
    system.updateEnemies(1 / 60);
    assert.equal(
      damage.length,
      0,
      "entering range must not cause instant damage",
    );
    const expectedContact =
      ENEMIES.walker.attackInterval * ENEMY_ACTIONS.melee.contact;
    for (let frame = 1; frame < 60; frame++) {
      run.time = frame / 60;
      blocked = obstruction === "cover" && run.time >= expectedContact - 0.05;
      if (obstruction === "behind" && run.time >= expectedContact - 0.05)
        run.player.position.z = -1;
      system.updateEnemies(1 / 60);
    }
    if (obstruction !== "none") assert.equal(damage.length, 0);
    else {
      assert.equal(damage.length, 1);
      assert.equal(damage[0].amount, ENEMIES.walker.damage);
      assert.ok(damage[0].time >= expectedContact);
      assert.ok(damage[0].time < expectedContact + 1 / 60);
    }
  }
});

function presentationFixture() {
  const model = modelFixture();
  const neck = new T.Bone();
  neck.name = "neck";
  model.userData.neck = neck;
  model.userData.head.name = "head";
  model.add(neck);
  neck.add(model.userData.head);
  model.userData.head.add(model.userData.jaw);
  const enemy = {
    id: 1,
    model,
    type: "walker",
    age: 1,
    seed: 0,
    stagger: 0,
    speed: 0,
    nextDetailCheck: Infinity,
    samples: [],
  };
  const blood = [];
  const context = {
    run: {
      time: 10,
      wave: 1,
      enemies: [enemy],
      player: { position: new T.Vector3() },
      world: { interactions: [], doors: [], power: false },
    },
    view: {
      scene: new T.Scene(),
      combatEffects: { blood: { hit: (...args) => blood.push(args) } },
    },
    commands: { applyDetail() {} },
  };
  context.view.scene.add(model);
  const remoteEnemies = new Map([[1, enemy]]);
  const remoteProjectiles = new Map();
  const replica = new WorldReplica(
    context,
    {
      id: 2,
      remoteEnemies,
      remoteProjectiles,
      remotePickups: new Map(),
    },
    {},
  );
  const packet = (time, e = [], j = []) => ({
    time,
    wave: 1,
    phase: "wave",
    timer: 0,
    remaining: 1,
    power: 0,
    doors: [],
    box: null,
    extraction: -1,
    e,
    j,
    p: [],
    k: [],
  });
  const at = (clock) => {
    replica.renderTime = clock;
    replica.latestTime = clock + 0.1;
    replica.updateRemoteEnemies(0);
  };
  return {
    enemy,
    blood,
    context,
    remoteEnemies,
    remoteProjectiles,
    replica,
    packet,
    at,
  };
}

test("a peer presents the swing contact before a later death and head destruction", () => {
  const { enemy, blood, replica, packet, at, remoteEnemies, context } =
    presentationFixture();
  const alive = [1, "walker", 0, 0, 0, 90, 0, 1, 0, 0, 90, 1, 10, 1, 0, 0];
  const dead = [...alive];
  dead[5] = 0;
  dead[6] = dead[8] = 1;
  replica.apply(packet(10.4, [alive]));
  replica.apply(packet(10.45, [dead]));
  assert.equal(
    !!enemy.dead,
    false,
    "receipt must not bypass the presentation clock",
  );
  assert.equal(!!enemy.model.userData.headDestroyed, false);
  at(10.44);
  assert.equal(!!enemy.dead, false);
  assert.equal(enemy.attacking, true);
  assert.ok(enemy.motion.actionPhase >= ENEMY_ACTIONS.melee.contact);
  at(10.45);
  assert.equal(enemy.dead, true);
  assert.equal(enemy.model.userData.headDestroyed, true);
  assert.equal(blood.length, 1);
  assert.equal(enemy.deathTime, 2.4);
  replica.apply(packet(12.8));
  at(12.8);
  assert.equal(
    remoteEnemies.has(1),
    true,
    "host removal cannot shorten the local collapse",
  );
  replica.updateRemoteEnemies(1);
  replica.updateRemoteEnemies(1);
  replica.updateRemoteEnemies(0.39);
  assert.equal(remoteEnemies.has(1), true);
  replica.updateRemoteEnemies(0.02);
  assert.equal(remoteEnemies.has(1), false);
  assert.equal(context.run.enemies.length, 0);
  assert.equal(enemy.model.parent, null);
  assert.equal(blood.length, 1);
});

test("acid uses the enemy timeline while grenade presentation remains immediate", () => {
  const { replica, packet, at, remoteProjectiles } = presentationFixture();
  replica.apply(
    packet(
      10,
      [],
      [
        [1, 1, 0, 1.6, 0],
        [2, 0, 0, 0.5, 0],
      ],
    ),
  );
  const acid = remoteProjectiles.get(1).mesh;
  const grenade = remoteProjectiles.get(2).mesh;
  let disposals = 0;
  acid.geometry.addEventListener("dispose", () => disposals++);
  assert.equal(acid.visible, false);
  assert.equal(grenade.visible, true, "grenades retain immediate birth");
  at(9.99);
  assert.equal(
    acid.visible,
    false,
    "the orb cannot precede its observed release",
  );
  at(10);
  assert.equal(acid.visible, true);
  assert.equal(grenade.visible, true);
  replica.apply(
    packet(
      10.1,
      [],
      [
        [1, 1, 0.7, 1.8, 0.2],
        [2, 0, 0, 0.7, 0.4],
      ],
    ),
  );
  at(10.05);
  assert.ok(Math.abs(acid.position.x - 0.35) < 1e-9);
  assert.ok(Math.abs(acid.position.y - 1.7) < 1e-9);
  assert.equal(grenade.position.z, 0, "replica does not replace grenade lerp");
  assert.equal(remoteProjectiles.get(2).target.z, 0.4);
  replica.apply(packet(10.2));
  assert.equal(grenade.parent, null, "grenades retain immediate disposal");
  at(10.19);
  assert.equal(remoteProjectiles.size, 1);
  assert.equal(disposals, 0);
  at(10.2);
  assert.equal(remoteProjectiles.size, 0);
  assert.equal(acid.parent, null);
  assert.equal(grenade.parent, null);
  assert.equal(disposals, 1);
});

test("turns follow the shortest arc without an instantaneous root rotation", () => {
  const start = Math.PI - 0.02;
  const desired = -Math.PI + 0.08;
  const turned = turnEnemyYaw(start, desired, 1 / 60, "walker");
  assert.ok(turned > start);
  assert.ok(turned - start < 0.1);
  for (const type of Object.keys(ENEMIES)) {
    const turn = turnEnemyYaw(0, Math.PI, 1 / 60, type);
    assert.ok(turn > 0 && turn <= 6 / 60);
  }
  assert.equal(turnEnemyYaw(1, 2, 0, "walker"), 1);
});

test("a spitter releases from its animated mouth only at the action marker", () => {
  const model = modelFixture();
  model.position.set(2, 0, 4);
  model.scale.setScalar(1.05);
  model.userData.jaw.position.set(0.1, 1.7, 0.2);
  model.add(model.userData.jaw);
  const run = { projectiles: [], nextProjectileId: 1 };
  const context = {
    enemy: { model, spit: 0 },
    distance: 10,
    blocked: false,
    target: new T.Vector3(2, 0, 14),
    local: false,
    run,
    view: { scene: new T.Scene() },
  };
  ENEMY_BEHAVIORS.spitter(context);
  assert.equal(run.projectiles.length, 0);
  ENEMY_BEHAVIORS.spitter({ ...context, contact: "spit" });
  assert.equal(run.projectiles.length, 1);
  assert.equal(context.enemy.spit, 3.6);
  const projectile = run.projectiles[0];
  const mouth = model.userData.jaw.getWorldPosition(new T.Vector3());
  assert.ok(projectile.mesh.position.distanceTo(mouth) < 1e-10);
  assert.ok(Math.abs(projectile.velocity.length() - 7) < 1e-10);
  ENEMY_BEHAVIORS.spitter({ ...context, contact: "spit", blocked: true });
  assert.equal(run.projectiles.length, 1);
  projectile.mesh.geometry.dispose();
  projectile.mesh.material.dispose();
});

test("horde identities are stable on every client without sharing bone poses", () => {
  const values = Array.from({ length: 28 }, (_, i) => enemyVariation(i + 1));
  assert.equal(new Set(values).size, values.length);
  values.forEach((value, index) => {
    assert.ok(value >= 0 && value < 1);
    assert.equal(value, enemyVariation(index + 1));
  });
});

test("snapshot action markers are validated and old enemy rows are rejected", () => {
  const model = modelFixture();
  const enemy = {
    id: 1,
    model,
    type: "walker",
    health: 90,
    maxHealth: 90,
    stagger: 0.1,
    staggerUntil: 12.15,
    targetYaw: 0.8,
    action: { kind: "melee", startTime: 12, sequence: 2 },
  };
  const state = snapshot(
    {
      run: {
        state: "playing",
        time: 12.05,
        wave: 1,
        phase: "wave",
        phaseTimer: 0,
        remaining: 2,
        world: { interactions: [], doors: [], power: false },
        enemies: [enemy],
        pickups: [],
        projectiles: [],
      },
    },
    new Map(),
    1,
    20,
    {
      x: 0,
      y: 1.7,
      z: 0,
      yaw: 0,
      pitch: 0,
      w: "vigil",
      l: 0,
      hp: 100,
      mhp: 100,
      f: 0,
      points: 0,
      grenades: 3,
    },
  );
  assert.equal(PROTOCOL_VERSION, 4);
  assert.equal(validSnapshot(state), true);
  assert.deepEqual(state.e[0].slice(11), [1, 12, 2, 0.8, 12.15]);
  const withRow = (row) => ({ ...state, e: [row] });
  assert.equal(validSnapshot(withRow(state.e[0].slice(0, 11))), false);
  for (const [column, invalid] of [
    [11, 3],
    [12, -1],
    [13, 1.5],
    [14, NaN],
    [15, -1],
  ]) {
    const row = [...state.e[0]];
    row[column] = invalid;
    assert.equal(validSnapshot(withRow(row)), false);
  }
});

test("peers show attack and hit reactions on the delayed position timeline", () => {
  const enemy = {
    id: 1,
    model: modelFixture(),
    type: "walker",
    age: 1,
    seed: 0,
    stagger: 0,
    speed: 0,
    nextDetailCheck: Infinity,
    samples: [
      {
        time: 0.95,
        x: 0,
        z: 0,
        yaw: 0,
        targetYaw: 0.4,
        action: { kind: "none", startTime: 0, sequence: 0 },
        staggerUntil: 0,
      },
      {
        time: 1.05,
        x: 0,
        z: 0.1,
        yaw: 0.1,
        targetYaw: 0.5,
        action: { kind: "melee", startTime: 1, sequence: 1 },
        staggerUntil: 1.16,
      },
    ],
  };
  const context = {
    run: { time: 1.2, enemies: [enemy], player: { position: new T.Vector3() } },
    commands: { applyDetail() {} },
  };
  const replica = new WorldReplica(context, {}, {});
  replica.renderTime = 0.94;
  replica.latestTime = 1.04;
  replica.updateRemoteEnemies(1 / 60);
  assert.equal(enemy.attacking, false);
  assert.ok(enemy.stagger <= 0);
  replica.latestTime = 1.2;
  for (let i = 0; i < 4; i++) replica.updateRemoteEnemies(1 / 60);
  assert.equal(enemy.attacking, true);
  assert.ok(enemy.stagger > 0);
  assert.ok(enemy.targetYaw >= 0.4 && enemy.targetYaw <= 0.5);
  replica.latestTime = 3;
  replica.updateRemoteEnemies(1 / 60);
  assert.equal(
    enemy.attacking,
    false,
    "an old packet cannot loop a finished swing",
  );
});

test("sprinters pounce from a few metres in later waves and land their claws", async () => {
  const { hordeRandom, LEAP } = await import("../src/content/horde.js");
  // An id whose first attack is a pounce.
  let id = 1;
  while (hordeRandom(id, 900) >= LEAP.chance) id++;
  for (const wave of [1, LEAP.wave + 2]) {
    const model = modelFixture();
    model.userData.type = "runner";
    const enemy = {
      id,
      model,
      type: "runner",
      attack: 0,
      spit: 5,
      stagger: 0,
      seed: 0,
      age: 1,
      speedFactor: 0.0001,
      nextDetailCheck: Infinity,
    };
    const run = {
      time: 0,
      wave,
      enemies: [enemy],
      player: { position: new T.Vector3(0, 0, 3.1) },
      navigation: { direction: (_x, _z, target) => target },
      world: { obstacles: [] },
    };
    const damage = [];
    const system = new EnemySystem(
      { run },
      {
        obstacleDistance: (_o, _d, distance) => distance,
        hurt: (amount) => damage.push(amount),
      },
    );
    let leapt = false,
      closest = Infinity;
    // One attack cycle: the pounce and its contact, before a follow-up swing.
    for (let frame = 0; frame < 50; frame++) {
      run.time = frame / 60;
      system.updateEnemies(1 / 60);
      leapt ||= !!enemy.action?.leap;
      closest = Math.min(closest, 3.1 - model.position.z);
    }
    if (wave < LEAP.wave) {
      assert.equal(leapt, false, "no pounce in early waves");
      assert.equal(damage.length, 0, "out of reach");
    } else {
      assert.ok(leapt, "pounce");
      assert.ok(
        closest < LEAP.reach + 0.15,
        `landed ${closest.toFixed(2)} m away`,
      );
      assert.equal(damage.length, 1, "the claws land once");
    }
  }
});

test("zombies near their prey climb over a pew instead of walking around", async () => {
  const { vaultCrossing, vaultHeight, vaultPhase, markVaultable } =
    await import("../src/game/vaulting.js");
  const pew = { x: 0, z: 1.5, w: 3.2, d: 0.8, h: 1.1, active: true };
  const wall = { x: 5, z: 0, w: 0.5, d: 6, h: 3, active: true };
  markVaultable([pew, wall]);
  assert.ok(pew.vaultable && !wall.vaultable);
  const middle = vaultCrossing(0, 1.5, [pew, wall]);
  assert.ok(Math.abs(middle.t - 0.5) < 1e-9);
  assert.ok(vaultHeight(middle) > 0.95 && vaultHeight(middle) < 1.1);
  const entering = vaultCrossing(0, 1.5 - 0.7, [pew]);
  assert.ok(vaultPhase(entering, 0, 1) < 0.2, "entered from the -z side");
  assert.ok(vaultPhase(entering, 0, -1) > 0.8, "the other way round");
  assert.equal(vaultCrossing(3, -2, [pew]), null);

  const model = modelFixture();
  const enemy = {
    id: 7,
    model,
    type: "walker",
    attack: 0,
    spit: 5,
    stagger: 0,
    seed: 0,
    age: 1,
    speedFactor: 1,
    nextDetailCheck: Infinity,
  };
  const run = {
    time: 0,
    wave: 3,
    enemies: [enemy],
    player: { position: new T.Vector3(0, 0, 4) },
    navigation: { direction: (_x, _z, target) => target },
    world: { obstacles: [pew] },
  };
  // Rays at waist height stop at the pew's faces.
  const obstacleDistance = (origin, direction, max) => {
    const ray = new T.Ray(origin, direction);
    const box = new T.Box3(
      new T.Vector3(pew.x - pew.w / 2, 0, pew.z - pew.d / 2),
      new T.Vector3(pew.x + pew.w / 2, pew.h, pew.z + pew.d / 2),
    );
    const hit = ray.intersectBox(box, new T.Vector3());
    return hit ? Math.min(max, origin.distanceTo(hit)) : max;
  };
  const damage = [];
  const system = new EnemySystem(
    { run },
    { obstacleDistance, hurt: (amount) => damage.push(amount) },
  );
  let highest = 0;
  for (let frame = 0; frame < 60 * 8 && !damage.length; frame++) {
    run.time = frame / 60;
    system.updateEnemies(1 / 60);
    highest = Math.max(highest, model.position.y);
  }
  assert.ok(highest > 0.9, `climbed over (${highest.toFixed(2)} m)`);
  assert.ok(model.position.z > pew.z + pew.d / 2, "crossed to the far side");
  assert.equal(model.position.y, 0, "back on the floor");
  assert.equal(damage.length, 1, "then attacked");
});
