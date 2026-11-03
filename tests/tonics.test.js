import test from "node:test";
import assert from "node:assert/strict";
import { TonicSystem } from "../src/game/tonics.js";
import { TONIC } from "../src/content/services.js";

function fixture() {
  const run = {
    state: "playing",
    player: { points: 1000, perks: [], health: 50, maxHealth: 100 },
    reloadTime: 2,
    shellReload: {},
    pendingDraw: 0,
  };
  const events = [],
    cues = [],
    actions = [];
  const context = {
    run,
    input: { mouse: { fire: true, aim: true } },
    view: {
      viewModel: {
        startTonic: () => actions.push("start"),
        finishTonic: () => actions.push("finish"),
      },
    },
    sound: { tonicCue: (cue) => cues.push(cue) },
    emit: (...args) => events.push(args),
  };
  const system = new TonicSystem(context, {
    updateHUD() {},
    setGun: () => actions.push("select"),
  });
  return { ...context, system, events, cues, actions };
}

test("a paid tonic grants its effect exactly at the first sip, then restores combat", () => {
  const f = fixture();
  assert.equal(f.system.start("health", 2000), true);
  assert.equal(f.system.start("speed", 2500), false);
  assert.equal(f.run.reloadTime, 0);
  assert.equal(f.run.shellReload, null);
  assert.equal(f.run.pendingDraw, 0);
  assert.deepEqual(f.input.mouse, { fire: false, aim: false });
  f.system.update(TONIC.consume - 0.01);
  assert.equal(f.run.player.maxHealth, 100);
  assert.deepEqual(f.run.player.perks, []);
  f.system.update(0.01);
  assert.equal(f.run.player.maxHealth, 180);
  assert.equal(f.run.player.health, 180);
  assert.deepEqual(f.run.player.perks, ["health"]);
  assert.equal(f.events.length, 1);
  f.system.update(10);
  f.system.update(10);
  assert.deepEqual(f.run.player.perks, ["health"]);
  assert.equal(f.events.length, 1);
  assert.deepEqual(f.cues, ["take", "open", "sip", "sip"]);
  assert.deepEqual(f.actions, ["start", "finish"]);
  assert.equal(f.run.tonic, null);
  assert.ok(f.run.shotTimer > 0);
});

test("pausing freezes the consumption clock and cannot grant an early effect", () => {
  const f = fixture();
  f.system.start("rate", 1500);
  f.system.update(0.8);
  f.run.state = "paused";
  f.system.update(100);
  assert.equal(f.run.tonic.elapsed, 0.8);
  assert.deepEqual(f.run.player.perks, []);
  f.run.state = "playing";
  f.system.update(1);
  assert.deepEqual(f.run.player.perks, ["rate"]);
});

test("buying during a weapon switch settles the selected weapon before taking the bottle", () => {
  const f = fixture();
  f.run.pendingDraw = 0.17;
  f.system.start("focus", 2500);
  assert.equal(f.run.pendingDraw, 0);
  assert.deepEqual(f.actions, ["select", "start"]);
});

test("interruption before the sip refunds once; a consumed tonic remains purchased", () => {
  for (const consumed of [false, true]) {
    const f = fixture();
    f.system.start("speed", 2500);
    f.system.update(consumed ? TONIC.consume : 0.7);
    f.run.downed = true;
    f.system.update(0.01);
    f.system.cancel();
    assert.equal(f.run.player.points, consumed ? 1000 : 3500);
    assert.deepEqual(f.run.player.perks, consumed ? ["speed"] : []);
    assert.equal(f.run.tonic, null);
    assert.deepEqual(f.actions, ["start", "finish"]);
  }
});

test("changing runs never applies the previous player's tonic or refund to a new player", () => {
  const f = fixture();
  f.system.start("focus", 1500);
  const previous = f.run.player;
  f.run.player = { points: 650, perks: [], health: 100, maxHealth: 100 };
  f.system.update(2);
  assert.equal(f.run.tonic, null);
  assert.equal(f.run.player.points, 650);
  assert.deepEqual(f.run.player.perks, []);
  assert.deepEqual(previous.perks, []);
});

test("invalid, downed and non-playing purchases cannot start a drink", () => {
  const f = fixture();
  assert.equal(f.system.start("unknown", 1), false);
  f.run.downed = true;
  assert.equal(f.system.start("health", 1), false);
  f.run.downed = false;
  f.run.state = "menu";
  assert.equal(f.system.start("health", 1), false);
  assert.equal(f.actions.length, 0);
});
