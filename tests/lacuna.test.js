import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASE,
  MODE,
  createHydraulics,
  advance,
  activate,
  canActivate,
  packHydraulics,
  unpackHydraulics,
} from "../src/maps/lacuna/state.js";
import { sharedInteractionCost } from "../src/game/interaction-rules.js";
import { validSnapshot } from "../server/protocol.js";
import { PURGE_ZONES, BRIDGE, inZone } from "../src/maps/lacuna/data.js";

function tick(state, seconds, overrides = {}) {
  for (let i = 0; i < seconds * 10; i++)
    advance(state, 0.1, { enabled: true, bridgeClear: true, ...overrides });
}

test("Lacuna: automatic cycle waits for power/wave permission and provides a full warning", () => {
  const s = createHydraulics();
  tick(s, 120, { enabled: false });
  assert.equal(s.phase, PHASE.IDLE);
  assert.equal(s.timer, 65);
  tick(s, 65.2);
  assert.equal(s.phase, PHASE.WARNING);
  assert(s.timer > 11.7);
  tick(s, 11);
  assert.equal(s.phase, PHASE.WARNING);
  tick(s, 2);
  assert.equal(s.phase, PHASE.FLOOD);
  assert.equal(s.bridgeClosed, true);
});

test("Lacuna: occupied bridge keeps its floor, countdown stops at zero", () => {
  const s = createHydraulics();
  s.phase = PHASE.WARNING;
  s.timer = 1;
  tick(s, 10, { bridgeClear: false });
  assert.equal(s.phase, PHASE.WARNING);
  assert.equal(s.timer, 0);
  assert.equal(s.bridgeClosed, false);
  tick(s, 0.2);
  assert.equal(s.phase, PHASE.FLOOD);
  assert.equal(s.bridgeClosed, true);
  tick(s, 30);
  assert.equal(s.phase, PHASE.IDLE);
  assert.equal(s.bridgeClosed, false);
});

test("Lacuna: manual valves reject invalid actions, power loss, overlapping cycles and cooldown", () => {
  const s = createHydraulics();
  for (const action of [-1, 3, NaN, "0", "release"])
    assert.equal(canActivate(s, action, true), false);
  assert.equal(activate(s, 0, false), false);
  assert.equal(activate(s, 0, true), true);
  assert.equal(s.mode, MODE.VALVE);
  assert.equal(s.used, 1);
  assert.equal(activate(s, 1, true), false);
  tick(s, 4.2, { bridgeClear: false, enabled: false });
  assert.equal(s.phase, PHASE.FLOOD);
  assert.equal(s.bridgeClosed, false);
  tick(s, 14, { enabled: false });
  assert.equal(s.phase, PHASE.IDLE);
  assert.equal(canActivate(s, 0, true), false);
  assert.equal(canActivate(s, 1, true), true);
  tick(s, 45, { enabled: false });
  assert.equal(canActivate(s, 0, true), true);
});

test("Lacuna: the three valves unlock a one-off sequential Grand Release", () => {
  const s = createHydraulics();
  for (let i = 0; i < 3; i++) {
    assert(activate(s, i, true));
    tick(s, 18, { enabled: false });
  }
  assert.equal(s.used, 7);
  assert(activate(s, "release", true));
  const zones = new Set();
  for (let i = 0; i < 65 * 10; i++) {
    advance(s, 0.1, { enabled: false, bridgeClear: true });
    if (s.phase === PHASE.FLOOD) zones.add(s.zone);
  }
  assert.deepEqual([...zones], [0, 1, 2]);
  assert.equal(s.mastered, true);
  assert.equal(s.bridgeClosed, false);
  assert.equal(canActivate(s, "release", true), false);
});

test("Lacuna: snapshots round-trip and reject corrupt or unrelated map data", () => {
  const s = createHydraulics();
  activate(s, 2, true);
  tick(s, 5);
  assert.deepEqual(unpackHydraulics(packHydraulics(s)), s);
  for (const packet of [
    null,
    {},
    { ...packHydraulics(s), id: "abyss" },
    { ...packHydraulics(s), revision: 2 },
    { ...packHydraulics(s), data: [0] },
    { ...packHydraulics(s), data: Array(12).fill(NaN) },
    { ...packHydraulics(s), data: Array(12).fill(99) },
  ])
    assert.equal(unpackHydraulics(packet), null);
});

test("Lacuna: host rejects remote map actions outside reach or by downed actors", () => {
  const i = { kind: "map", cost: 350, position: { x: 20, z: 20 } };
  const run = {
    mapGameplay: {
      interactionCost: (_, actor) => (actor.points >= 350 ? 350 : null),
    },
  };
  assert.equal(
    sharedInteractionCost(i, run, {
      alive: false,
      points: 900,
      position: i.position,
    }),
    null,
  );
  assert.equal(
    sharedInteractionCost(i, run, {
      alive: true,
      points: 900,
      position: { x: 0, z: 0 },
    }),
    null,
  );
  assert.equal(
    sharedInteractionCost(i, run, {
      alive: true,
      points: 349,
      position: i.position,
    }),
    null,
  );
  assert.equal(
    sharedInteractionCost(i, run, {
      alive: true,
      points: 350,
      position: i.position,
    }),
    350,
  );
});

test("Lacuna: permanent bridges and perimeter streets are outside every purge strip", () => {
  for (const p of [
    { x: 0, z: -44 },
    { x: 0, z: 40 },
    { x: -66, z: 6 },
    { x: 66, z: 20 },
  ])
    assert(PURGE_ZONES.every((zone) => !inZone(p, zone, 0.5)));
  assert(inZone({ x: 0, z: 0 }, BRIDGE));
  assert(!inZone({ x: 30, z: 0 }, BRIDGE));
});

test("Lacuna: relay preserves bounded map state and accepts older snapshots", () => {
  const snapshot = {
    n: 1,
    wave: 3,
    phase: "wave",
    timer: 0,
    remaining: 4,
    power: 1,
    extraction: -1,
    paused: false,
    doors: [],
    box: null,
    e: [],
    p: [],
    k: [],
    j: [],
  };
  assert.equal(validSnapshot(snapshot), true);
  assert.equal(
    validSnapshot({
      ...snapshot,
      mapState: packHydraulics(createHydraulics()),
    }),
    true,
  );
  for (const mapState of [
    null,
    [],
    { id: "lacuna", revision: 1, data: Array(33).fill(0) },
    { id: "lacuna", revision: 1, data: [Infinity] },
    { id: "lacuna", revision: 0, data: [0] },
    { id: "lacuna", revision: 1, data: ["flood"] },
  ])
    assert.equal(validSnapshot({ ...snapshot, mapState }), false);
});

test("Lacuna: the carillon can combine with a purge, but cannot be spammed", () => {
  const state = createHydraulics();
  activate(state, 0, true);
  assert.equal(activate(state, "bell", false), false);
  assert.equal(activate(state, "bell", true), true);
  assert.equal(state.phase, PHASE.WARNING);
  assert.equal(state.bell, 16);
  assert.equal(activate(state, "bell", true), false);
  tick(state, 17, { enabled: false });
  assert.equal(state.bell, 0);
  assert(state.bellCooldown > 0);
  tick(state, 55, { enabled: false });
  assert.equal(canActivate(state, "bell", true), true);
  assert.deepEqual(unpackHydraulics(packHydraulics(state)), state);
});
