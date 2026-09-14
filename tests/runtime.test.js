import test from "node:test";
import assert from "node:assert/strict";
import { LaunchGate } from "../src/app/launch.js";
import { resolutionForFrameTime } from "../src/game/adaptive-quality.js";
import { sharedInteractionCost } from "../src/game/interaction-rules.js";
import { escapeHtml } from "../src/ui/dom.js";
import { readSettings } from "../src/app/storage.js";
import { enemyType, mysteryWeapon, newWeapon } from "../src/logic.js";
import { InteractionSystem } from "../src/game/interactions.js";
import { ENEMIES, WEAPONS } from "../src/config.js";

test("portrait rotation keeps the complete co-op launch request", async () => {
  const gate = new LaunchGate();
  const request = {
    map: "station",
    difficulty: "nightmare",
    touch: true,
    coop: { run: 3, host: 7, players: [7, 9] },
  };
  gate.defer(request);
  const result = await gate.run(gate.takeDeferred(), async (value) => value);
  assert.equal(result, request);
  assert.equal(gate.deferred, null);
});
test("concurrent launch clicks share work and a failed launch can retry", async () => {
  const gate = new LaunchGate();
  let count = 0;
  const launch = async () => {
    count++;
    throw new Error("load failed");
  };
  const one = gate.run({}, launch),
    two = gate.run({}, launch);
  assert.equal(one, two);
  await assert.rejects(one, /load failed/);
  assert.equal(count, 1);
  assert.equal(await gate.run({}, async () => "playing"), "playing");
});
test("stable 30 FPS does not lower quality; genuine slowdown still does", () => {
  assert.equal(resolutionForFrameTime(1, 1000 / 30, 20, 30), 1);
  assert.equal(resolutionForFrameTime(1, 1000 / 60, 20, 60), 1);
  assert.equal(resolutionForFrameTime(1, 45, 20, 30), 0.9);
  assert.ok(
    Math.abs(resolutionForFrameTime(0.8, 1000 / 30, 20, 30) - 0.84) < 1e-12,
  );
});
test("world purchases check distance, funds and extraction rules before mutation", () => {
  const run = {
    world: { power: false },
    wave: 9,
    phase: "rest",
    extraction: false,
  };
  const actor = { position: { x: 0, z: 0 }, alive: true, points: 950 };
  const box = { kind: "box", cost: 950, position: { x: 0, z: 0 } };
  assert.equal(sharedInteractionCost(box, run, actor), 950);
  assert.equal(
    sharedInteractionCost(box, run, { ...actor, points: 949 }),
    null,
  );
  assert.equal(
    sharedInteractionCost(box, run, { ...actor, position: { x: 4, z: 0 } }),
    null,
  );
  assert.equal(sharedInteractionCost({ ...box, busy: true }, run, actor), null);
  assert.equal(
    sharedInteractionCost(
      { ...box, busy: true, offered: "spectre" },
      run,
      actor,
      true,
    ),
    0,
  );
  const beacon = { kind: "extract", position: { x: 0, z: 0 } };
  assert.equal(sharedInteractionCost(beacon, run, actor), null);
  run.world.power = true;
  run.wave = 10;
  run.phase = "wave";
  assert.equal(sharedInteractionCost(beacon, run, actor), null);
  run.phase = "rest";
  assert.equal(sharedInteractionCost(beacon, run, actor), 0);
});
test("player names render as text in HTML templates", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="x">'),
    "&lt;img src=x onerror=&quot;x&quot;&gt;",
  );
});
test("saved settings keep valid preferences and discard corrupt values", () => {
  const settings = readSettings({
    getItem: () =>
      JSON.stringify({
        fov: 999,
        quality: "invalid",
        volume: 0.4,
        touchSensitivity: "broken",
        shake: false,
      }),
  });
  assert.equal(settings.fov, 105);
  assert.equal(settings.quality, "high");
  assert.equal(settings.volume, 0.4);
  assert.equal(settings.touchSensitivity, 1);
  assert.equal(settings.shake, false);
});
test("new enemy and weapon variants enter content selection without editing the systems", () => {
  const enemies = {
    ...ENEMIES,
    scout: {
      ...ENEMIES.walker,
      look: "walker",
      spawn: { wave: 2, below: 0.01 },
    },
  };
  assert.equal(
    enemyType(2, () => 0.005, enemies),
    "scout",
  );
  assert.equal(
    enemyType(1, () => 0.005, enemies),
    "walker",
  );
  const weapons = {
    ...WEAPONS,
    carbine: { ...WEAPONS.marauder, look: "marauder", boxBelow: 0.01 },
  };
  assert.equal(
    mysteryWeapon(() => 0.005, weapons),
    "carbine",
  );
});

test("a pending shared purchase cannot spend the same balance at a local machine", () => {
  const weapon = newWeapon("vigil");
  weapon.reserve = 0;
  const run = {
    state: "playing",
    downed: false,
    slot: 0,
    weapons: [weapon],
    session: { peer: true, pendingPurchase: { request: 1 } },
    player: { position: { x: 0, z: 0 }, points: 1000, grenades: 0, perks: [] },
    world: {
      power: true,
      interactions: [{ kind: "ammo", cost: 500, position: { x: 0, z: 0 } }],
    },
  };
  const system = new InteractionSystem(
    { run, sound: { purchase() {} }, emit() {} },
    { updateHUD() {} },
  );
  system.interact();
  assert.equal(run.player.points, 1000);
  assert.equal(weapon.reserve, 0);
  run.session.pendingPurchase = null;
  system.interact();
  assert.equal(run.player.points, 500);
  assert.equal(weapon.reserve, 84);
});
