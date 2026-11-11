import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { InteractionSystem } from "../src/game/interactions.js";
import { WorldReplica } from "../src/network/replica.js";
import { RELIQUARY } from "../src/content/reliquary.js";
import { WEAPONS } from "../src/content/weapons.js";
import { newWeapon } from "../src/logic.js";
import { validSnapshot } from "../server/protocol.js";

function fixture() {
  const box = {
    kind: "box",
    name: "Le Reliquaire",
    cost: 950,
    position: new T.Vector3(),
    root: new T.Group(),
  };
  const cues = [];
  const run = {
    state: "playing",
    time: 0,
    weapons: [newWeapon("vigil")],
    slot: 0,
    player: { position: new T.Vector3(0, 1.7, 2), points: 2000, perks: [] },
    world: {
      interactions: [box],
      doors: [],
      showBoxWeapon(id) {
        box.display?.removeFromParent();
        box.display = new T.Group();
        box.display.userData.weaponId = id;
        box.root.add(box.display);
      },
    },
  };
  const sound = {
    reliquary: (...args) => cues.push(args),
    purchase() {},
    click() {},
  };
  const context = { run, sound, emit() {} };
  const system = new InteractionSystem(context, {
    updateHUD() {},
    setGun() {},
  });
  return { box, run, system, cues, context };
}
function advance(system, time, step = 1 / 60) {
  for (let elapsed = 0; elapsed < time;) {
    const dt = Math.min(step, time - elapsed);
    system.update(dt);
    elapsed += dt;
  }
}

test("a paid draw cannot be purchased or claimed twice and awards a full weapon", () => {
  const { box, run, system, cues } = fixture();
  system.interact();
  system.interact();
  assert.equal(run.player.points, 1050);
  assert.equal(box.offered, null);
  assert.equal(cues.filter(([cue]) => cue === "open").length, 1);
  advance(system, RELIQUARY.drawDuration - 0.01);
  assert.equal(box.offered, null);
  advance(system, 0.02);
  const reward = box.offered;
  assert(WEAPONS[reward]?.boxBelow);
  assert.equal(cues.filter(([cue]) => cue === "reveal").length, 1);
  system.interact();
  assert.equal(run.weapons[run.slot].id, reward);
  assert.equal(run.weapons[run.slot].ammo, WEAPONS[reward].mag);
  assert.equal(run.weapons[run.slot].reserve, WEAPONS[reward].reserve);
  assert.equal(run.player.points, 1050);
  assert.equal(
    system.applySharedInteraction(
      box,
      { alive: true, position: run.player.position, points: 1050 },
      true,
    ),
    null,
  );
  assert.equal(box.display, null);
});

test("low and high frame rates finish one draw, with the same complete claim window", () => {
  for (const dt of [1 / 30, 1 / 144, 0.23, 6]) {
    const { box, system, cues } = fixture();
    system.interact();
    // An overshoot must not consume the freshly announced reward window.
    system.update(6);
    assert.equal(box.offerTimer, RELIQUARY.offerDuration);
    advance(system, 17.9, dt);
    assert(box.offered);
    advance(system, 0.11, dt);
    assert.equal(box.busy, false);
    assert.equal(box.offered, null);
    assert.equal(box.display, null);
    assert.equal(box.outcome, 2);
    system.update(10);
    assert.equal(cues.filter(([cue]) => cue === "expire").length, 1);
  }
});

test("expired draws can restart, but distance, downed state and funds still guard purchases", () => {
  const { box, run, system } = fixture();
  run.player.points = 949;
  system.interact();
  assert(!box.busy);
  run.player.points = 2000;
  run.downed = true;
  system.interact();
  assert(!box.busy);
  run.downed = false;
  run.player.position.z = 4;
  system.interact();
  assert(!box.busy);
  run.player.position.z = 2;
  system.interact();
  system.update(5);
  system.update(18);
  assert.equal(box.outcome, 2);
  system.interact();
  assert.equal(box.sequence, 2);
  assert.equal(box.outcome, 0);
  assert.equal(box.cycle, -1);
  assert.equal(run.player.points, 100);
});

const base = {
  n: 1,
  time: 10,
  wave: 2,
  phase: "wave",
  timer: 0,
  remaining: 0,
  power: 0,
  extraction: -1,
  paused: false,
  doors: [],
  box: [0, null, null],
  e: [],
  p: [],
  k: [],
  j: [],
};
test("reliquary timing is an optional, bounded network extension", () => {
  assert(validSnapshot(base));
  assert(validSnapshot({ ...base, relic: [4.8, 18, 1, 0] }));
  for (const relic of [
    [-1, 18, 1, 0],
    [0, 100, 1, 0],
    [0, 18, 1.5, 0],
    [0, 18, 1, 3],
    [0, NaN, 1, 0],
    [0, 18, 1],
  ])
    assert.equal(validSnapshot({ ...base, relic }), false);
});

test("peers consume reveal and claim cues once and preserve the displayed model across snapshots", () => {
  const { box, run, context, cues } = fixture();
  const replica = new WorldReplica(
    context,
    {
      id: 2,
      remoteEnemies: new Map(),
      remotePickups: new Map(),
      remoteProjectiles: new Map(),
    },
    { updateHUD() {} },
  );
  const apply = (boxState, relic) =>
    replica.apply({ ...base, box: boxState, relic });
  apply([1, null, "spectre"], [3, 0, 1, 0]);
  const display = box.display;
  apply([1, null, "spectre"], [2.9, 0, 1, 0]);
  assert.equal(box.display, display);
  apply([1, "eclipse", "eclipse"], [0, 18, 1, 0]);
  apply([1, "eclipse", "eclipse"], [0, 17.9, 1, 0]);
  assert.equal(cues.filter(([cue]) => cue === "reveal").length, 1);
  assert.equal(box.offerTimer, 17.9);
  apply([0, null, null], [0, 0, 1, 1]);
  apply([0, null, null], [0, 0, 1, 1]);
  assert.equal(cues.filter(([cue]) => cue === "take").length, 1);
  assert.equal(box.display, null);
  assert.equal(
    run.player.points,
    2000,
    "snapshot presentation never charges a peer",
  );
});
