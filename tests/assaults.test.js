import test from "node:test";
import assert from "node:assert/strict";
import { Navigation, canStand, clearPath, waveCount } from "../src/logic.js";
import { ENEMIES } from "../src/content/enemies.js";
import { INTENT, TACTICS } from "../src/content/assaults.js";
import { hordeRandom } from "../src/content/horde.js";
import {
  beginAssaultWave,
  nextAssaultSpawn,
  commitAssaultSpawn,
  assaultSpawnInterval,
  assaultSpawnScore,
} from "../src/game/assault-director.js";
import {
  prepareEnemyIntentions,
  enemyFocus,
  enemyTacticalGoal,
  enemySpecialAllowed,
} from "../src/game/enemy-intentions.js";
import { validSnapshot, PROTOCOL_VERSION } from "../server/protocol.js";

function fixture(wave = 8, obstacles = []) {
  const navigation = new Navigation(obstacles, 48, 1, 0.36);
  navigation.update(0, 0);
  return {
    time: 10,
    wave,
    phase: "wave",
    remaining: 10,
    difficultyId: "normal",
    difficulty: { count: 1 },
    enemies: [],
    player: { position: { x: 0, y: 1.7, z: 0 }, health: 100 },
    world: { obstacles },
    navigation,
    largeNavigation: navigation,
  };
}
function zombie(run, type = "runner", id = 1, x = 0, z = 10) {
  const e = {
    id,
    type,
    age: 3,
    stagger: 0,
    model: { position: { x, y: 0, z } },
    huntTarget: "local",
    huntUntil: 0,
  };
  run.enemies.push(e);
  return e;
}
function prepare(run) {
  prepareEnemyIntentions(run, false);
}
const runnerId = Array.from({ length: 100 }, (_, i) => i + 1).find(
  (id) => hordeRandom(id, 601) < 0.6,
);
const wraithId = Array.from({ length: 100 }, (_, i) => i + 1).find(
  (id) => hordeRandom(id, 602) < 0.75,
);

test("composed waves conserve quotas, unlocks and reproducible non-repeating packets", () => {
  for (let wave = 1; wave <= 30; wave++) {
    const runs = [fixture(wave), fixture(wave)];
    const plans = runs.map((run) => {
      beginAssaultWave(run, () => 0.327);
      const output = [];
      for (let i = 0; i < waveCount(wave); i++) {
        const p = nextAssaultSpawn(run);
        assert.ok(ENEMIES[p.type].spawn.wave <= wave);
        output.push(p);
        commitAssaultSpawn(run);
      }
      assert.equal(run.assault.spawned, waveCount(wave));
      if (wave >= 4)
        for (let i = 1; i < run.assault.history.length; i++)
          assert.notEqual(run.assault.history[i - 1], run.assault.history[i]);
      return output;
    });
    assert.deepEqual(plans[0], plans[1]);
    if (wave === 1) assert.ok(plans[0].every((p) => p.type === "walker"));
  }
});
test("failed spawn attempts spend no packet members and ordinary reinforcements still advance", () => {
  const run = fixture();
  beginAssaultWave(run, () => 0.2);
  const a = nextAssaultSpawn(run);
  assert.deepEqual(nextAssaultSpawn(run), a);
  assert.equal(run.assault.spawned, 0);
  commitAssaultSpawn(run);
  assert.equal(run.assault.spawned, 1);
  assert.notEqual(nextAssaultSpawn(run).member, a.member);
});
test("special populations and relief stay bounded without changing damage or health", () => {
  const run = fixture();
  beginAssaultWave(run, () => 0.1);
  for (const type of ["brute", "spitter", "wraith"])
    for (let i = 0; i < 3; i++) zombie(run, type, run.enemies.length + 1);
  for (let i = 0; i < 80; i++) {
    assert.ok(
      !["brute", "spitter", "wraith"].includes(nextAssaultSpawn(run).type),
    );
    commitAssaultSpawn(run);
  }
  run.assault.reliefUntil = 20;
  for (let i = 0; i < 20; i++) {
    assert.equal(nextAssaultSpawn(run).type, "walker");
    commitAssaultSpawn(run);
  }
  assert.equal(run.player.health, 100);
});
test("packets breathe briefly but empty arenas and final queued zombies never wait for a long gap", () => {
  const run = fixture();
  beginAssaultWave(run, () => 0.2);
  zombie(run, "walker");
  commitAssaultSpawn(run);
  const burst = assaultSpawnInterval(run);
  while (!run.assault.breakAfterSpawn) commitAssaultSpawn(run);
  assert.ok(assaultSpawnInterval(run) > burst);
  assert.ok(assaultSpawnInterval(run) <= 2.2);
  run.enemies = [];
  assert.ok(assaultSpawnInterval(run) <= 0.55);
  zombie(run);
  run.remaining = 2;
  assert.ok(assaultSpawnInterval(run) <= 0.55);
});
test("spawn clearance covers every survivor, with a reachable fallback and visible-arena score", () => {
  const nav = new Navigation([], 48, 1, 0.36);
  nav.update(0, 0);
  const peer = { x: 12, z: 0 };
  for (let i = 0; i < 40; i++) {
    const p = nav.spawnPosition(
      [
        [12, 0],
        [-14, 0],
      ],
      { x: 0, z: 0 },
      () => i / 40,
      [],
      { avoid: [peer] },
    );
    assert.ok(p);
    assert.ok(Math.hypot(p.x - peer.x, p.z - peer.z) > 10);
    assert.ok(Math.hypot(p.x, p.z) > 10);
  }
  const person = { position: { x: 0, z: 0 }, yaw: 0 };
  assert.ok(
    assaultSpawnScore(null, { x: 0, z: 14 }, person, [person], nav) >
      assaultSpawnScore(null, { x: 0, z: -14 }, person, [person], nav),
  );
});
test("bounded detours follow real door links and invalidate on rebuilding the collision graph", () => {
  const wall = { x: 0, z: 0, w: 1, d: 48 };
  const nav = new Navigation([wall], 48, 1, 0.36);
  assert.equal(nav.route({ x: -5, z: 0 }, { x: 5, z: 0 }), null);
  const version = nav.revision;
  wall.active = false;
  nav.rebuild();
  assert.equal(nav.revision, version + 1);
  const path = nav.route({ x: -5, z: 0 }, { x: 5, z: 0 });
  assert.ok(path);
  let from = { x: -5, z: 0 };
  for (const p of path) {
    assert.ok(clearPath(from, p, [wall], 0.36));
    from = p;
  }
});

test("crowded co-op rooms retain a safe entrance when four survivors cover the preferred distance", () => {
  const nav = new Navigation([], 24, 1, 0.36);
  const people = [
    { x: -6, z: -6 },
    { x: 6, z: -6 },
    { x: -6, z: 6 },
    { x: 6, z: 6 },
  ];
  nav.update(-6, -6);
  assert.equal(
    nav.spawnPosition([[11, 11]], people[0], () => 0.2, [], { avoid: people }),
    null,
  );
  const p = nav.spawnPosition([[11, 11]], people[0], () => 0.2, [], {
    avoid: people,
    minDistance: 7,
  });
  assert.ok(p);
  assert.ok(
    people.every((person) => Math.hypot(p.x - person.x, p.z - person.z) > 7),
  );
});
test("aggro stays stable at small distance changes, splits comparable prey and drops a downed target", () => {
  const run = fixture();
  const targets = [
    { id: 1, local: true, alive: true, position: run.player.position },
    { id: 2, local: false, alive: true, position: { x: 1, y: 1.7, z: 0 } },
  ];
  run.session = {
    id: 1,
    everyone: () => targets,
    players: new Map([[2, { health: 100 }]]),
  };
  prepare(run);
  const e = zombie(run, "walker");
  const first = enemyFocus(run, e);
  const original = e.huntTarget;
  targets[1].position.x = 0.1;
  prepare(run);
  assert.equal(enemyFocus(run, e).key, original);
  first.alive = false;
  targets.find((t) => t.id === first.id).alive = false;
  prepare(run);
  assert.notEqual(enemyFocus(run, e).id, first.id);
  targets.forEach((t) => (t.alive = true));
  prepare(run);
  const selected = [];
  for (let i = 2; i <= 10; i++)
    selected.push(enemyFocus(run, zombie(run, "walker", i, 0, 10)).id);
  assert.equal(new Set(selected).size, 2);
});
test("an interception uses observed velocity, commits briefly and is cancelled by cleanup or lures", () => {
  const run = fixture();
  const e = zombie(run, "runner", runnerId);
  prepare(run);
  run.time += 0.4;
  run.player.position.x = 1;
  run.navigation.update(1, 0);
  prepare(run);
  const focus = enemyFocus(run, e);
  e.nextTactic = 0;
  const goal = enemyTacticalGoal(
    run,
    e,
    focus,
    run.navigation,
    10.05,
    false,
    false,
  );
  assert.ok(goal);
  assert.equal(e.intent.role, INTENT.intercept);
  assert.ok(e.tactical.path.at(-1).x > run.player.position.x);
  assert.ok(e.tactical.until - run.time <= TACTICS.interceptTime);
  assert.equal(
    enemyTacticalGoal(
      run,
      e,
      { ...focus, bait: true },
      run.navigation,
      10,
      false,
      false,
    ),
    null,
  );
  assert.equal(e.intent.role, INTENT.pursue);
  e.nextTactic = 0;
  enemyTacticalGoal(run, e, focus, run.navigation, 10, false, false);
  assert.equal(
    enemyTacticalGoal(run, e, focus, run.navigation, 10, false, true),
    null,
  );
  assert.equal(e.tactical, null);
});
test("flanks have clear paths, finite lifetime and an early stalled-route escape", () => {
  const run = fixture();
  const e = zombie(run, "wraith", wraithId);
  prepare(run);
  const focus = enemyFocus(run, e);
  e.nextTactic = 0;
  assert.ok(enemyTacticalGoal(run, e, focus, run.navigation, 10, false, false));
  assert.equal(e.intent.role, INTENT.flank);
  let from = e.model.position;
  for (const p of e.tactical.path) {
    assert.ok(run.navigation.clear(from, p));
    assert.ok(canStand(p.x, p.z, run.world.obstacles, 0.36));
    from = p;
  }
  run.time += 0.9;
  prepare(run);
  assert.equal(
    enemyTacticalGoal(run, e, focus, run.navigation, 10, false, false),
    null,
  );
  assert.equal(e.tactical, null);
});
test("topology changes, stagger and lost standing targets cancel committed detours", () => {
  for (const cause of ["door", "stagger", "target"]) {
    const run = fixture();
    const e = zombie(run, "wraith", wraithId);
    prepare(run);
    const focus = enemyFocus(run, e);
    e.nextTactic = 0;
    enemyTacticalGoal(run, e, focus, run.navigation, 10, false, false);
    assert.ok(e.tactical);
    if (cause === "door") run.navigation.rebuild();
    if (cause === "stagger") e.stagger = 0.15;
    if (cause === "target") e.huntTarget = 99;
    assert.equal(
      enemyTacticalGoal(run, e, focus, run.navigation, 10, false, false),
      null,
    );
  }
});
test("spitter firing positions are temporary and cannot hold a stationary wave hostage", () => {
  const run = fixture();
  const e = zombie(run, "spitter", 1, 0, 8);
  prepare(run);
  const focus = enemyFocus(run, e);
  e.nextTactic = 0;
  const goal = enemyTacticalGoal(
    run,
    e,
    focus,
    run.navigation,
    8,
    false,
    false,
  );
  assert.deepEqual(goal, { x: 0, z: 8 });
  assert.equal(e.intent.role, INTENT.support);
  run.time += 2;
  prepare(run);
  assert.equal(
    enemyTacticalGoal(run, e, focus, run.navigation, 8, false, false),
    null,
  );
  run.time += 10;
  prepare(run);
  assert.equal(
    enemyTacticalGoal(run, e, focus, run.navigation, 8, false, false),
    null,
  );
});
test("special windups are limited per target, while existing actions and recovery remain observable", () => {
  const run = fixture();
  prepare(run);
  const a = zombie(run, "runner", 1),
    b = zombie(run, "spitter", 2);
  a.action = { kind: "melee", leap: true, startTime: run.time };
  assert.equal(enemySpecialAllowed(run, b), false);
  run.enemyTactics.cleanup = true;
  assert.equal(enemySpecialAllowed(run, b), false); // final pair still takes turns
  run.enemyTactics.cleanup = false;
  b.huntTarget = 2;
  assert.equal(enemySpecialAllowed(run, b), false); // solo global cap
  run.time += 2;
  assert.equal(enemySpecialAllowed(run, b), true);
  a.dead = true;
  a.action.startTime = run.time;
  assert.equal(enemySpecialAllowed(run, b), true);
});
test("recent team damage opens a bounded relief window and a new world drops all old tactical memory", () => {
  const run = fixture();
  prepare(run);
  const first = run.enemyTactics;
  run.time += 0.4;
  run.player.health = 70;
  prepare(run);
  assert.equal(run.enemyTactics.reliefUntil, run.time + TACTICS.reliefTime);
  run.time += 4;
  prepare(run);
  assert.ok(run.enemyTactics.reliefUntil < run.time);
  run.world = { obstacles: [] };
  prepare(run);
  assert.notEqual(run.enemyTactics, first);
});
test("intent metadata remains optional in protocol 4 and rejects malformed rows", () => {
  const s = {
    n: 1,
    time: 10,
    wave: 2,
    phase: "wave",
    timer: 0,
    remaining: 2,
    power: 0,
    extraction: -1,
    paused: false,
    doors: [],
    box: null,
    e: [],
    p: [],
    k: [],
    j: [],
  };
  assert.equal(PROTOCOL_VERSION, 4);
  assert.ok(validSnapshot(s));
  assert.ok(validSnapshot({ ...s, ai: [[1, INTENT.flank, 1, 9.8]] }));
  for (const row of [
    [1, 4, 1, 9],
    [1, 1, -1, 9],
    [1, 1, 1, -1],
    [1, 1, 1, NaN],
    [1, 1, 1],
  ])
    assert.equal(validSnapshot({ ...s, ai: [row] }), false);
});
