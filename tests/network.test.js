import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createRelay } from "../server/index.js";
import { Net } from "../src/net.js";
import { Session } from "../src/multiplayer.js";
import {
  canRelay,
  PLAYER_FLAGS,
  validSnapshot,
  validEvent,
  MAX_MESSAGE_BYTES,
} from "../server/protocol.js";

function damageSession() {
  const damage = [];
  const session = new Session(
    { id: 2, room: { run: 4 } },
    { hostId: 1, runId: 4, players: [{ id: 1 }, { id: 2 }] },
  );
  session.context = {
    run: { state: "playing" },
    emit() {},
    commands: {
      hurt: (amount) => damage.push(amount),
      sessionLost() {},
      end() {},
    },
  };
  session.replica = { renderTime: 9.9 };
  return {
    session,
    damage,
    hit: { k: "damage", from: 1, run: 4, amount: 18, time: 10 },
  };
}

test("peer melee damage is presented exactly once alongside the delayed swing", () => {
  const { session, damage, hit } = damageSession();
  session.onEvent(hit);
  assert.equal(session.pendingDamage.length, 1);
  assert.deepEqual(damage, []);
  session.replica.renderTime = 9.98;
  session.updatePendingDamage(0.05);
  assert.deepEqual(damage, []);
  session.replica.renderTime = 10;
  session.updatePendingDamage(1 / 60);
  session.updatePendingDamage(1 / 60);
  assert.deepEqual(damage, [18]);
  session.onEvent({ ...hit, amount: 13, time: undefined });
  assert.deepEqual(
    damage,
    [18, 13],
    "untimed projectile damage remains immediate",
  );
});

test("a pause freezes pending damage without consuming its fallback delay", () => {
  const { session, damage, hit } = damageSession();
  session.context.run.state = "paused";
  session.onEvent(hit);
  session.replica.renderTime = 10;
  session.updatePendingDamage(30);
  assert.deepEqual(damage, []);
  assert.equal(session.pendingDamage[0].waited, 0);
  session.context.run.state = "playing";
  session.updatePendingDamage(1 / 60);
  assert.deepEqual(damage, [18]);
});

test("lost snapshots cannot defer confirmed damage indefinitely", () => {
  const { session, damage, hit } = damageSession();
  session.replica.renderTime = 7;
  session.onEvent(hit);
  session.updatePendingDamage(0.39);
  assert.deepEqual(damage, []);
  session.updatePendingDamage(0.02);
  assert.deepEqual(damage, [18]);
  assert.equal(session.pendingDamage.length, 0);
});

test("damage queues are cleared on disconnect, teardown and an ended run", () => {
  for (const finish of [
    (session) => session.detach(),
    (session) => session.onClose(),
    (session) => session.onLeft({ id: 1 }),
    (session) => session.onEvent({ k: "end", from: 1, run: 4, victory: false }),
  ]) {
    const { session, damage, hit } = damageSession();
    session.onEvent(hit);
    finish(session);
    assert.equal(session.pendingDamage.length, 0);
    session.updatePendingDamage(1);
    assert.deepEqual(damage, []);
  }
  const { session, damage, hit } = damageSession();
  session.onEvent(hit);
  session.runId = 5;
  session.updatePendingDamage(1);
  session.onEvent(hit);
  assert.equal(session.pendingDamage.length, 0);
  assert.deepEqual(damage, []);
});

test("optional damage timestamps reject malformed or negative times", () => {
  assert.equal(validEvent({ k: "damage", amount: 18, time: 10 }), true);
  assert.equal(validEvent({ k: "damage", amount: 18 }), true);
  for (const time of [-1, NaN, Infinity, "10"])
    assert.equal(validEvent({ k: "damage", amount: 18, time }), false);
});

const waitFor = (net, type, predicate = () => true) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      off();
      reject(new Error("Timeout: " + type));
    }, 3000);
    const off = net.on(type, (m) => {
      if (predicate(m)) {
        clearTimeout(timeout);
        off();
        resolve(m);
      }
    });
  });
test("late downed inputs preserve elimination until the player respawns", () => {
  const session = new Session(
    { id: 1 },
    {
      hostId: 1,
      players: [{ id: 1 }, { id: 2 }],
    },
  );
  session.context = { run: { time: 100 } };
  const state = { dead: false };
  session.rescue = { status: () => state };
  const player = { id: 2, seen: 0 };
  const input = {
    x: 1,
    y: 1.7,
    z: 0,
    yaw: 0,
    pitch: 0,
    w: "vigil",
    points: 500,
    grenades: 3,
    hp: 0,
    mhp: 100,
    f: PLAYER_FLAGS.DOWN,
  };
  session.applyPlayerState(player, input);
  assert.equal(player.flags, PLAYER_FLAGS.DOWN);
  state.dead = true;
  session.applyPlayerState(player, input);
  assert.equal(player.flags, PLAYER_FLAGS.DOWN | PLAYER_FLAGS.DEAD);
  session.applyPlayerState(player, { ...input, f: 0, hp: 100 });
  assert.equal(player.flags, 0);
  assert.equal(player.health, 100);
});
test("relay requires all players ready and blocks forged host events", async (t) => {
  const relay = createRelay({ port: 0, host: "127.0.0.1" });
  const address = await relay.ready;
  const clients = Array.from(
    { length: 3 },
    () =>
      new Net(`ws://127.0.0.1:${address.port}`, { WebSocketImpl: WebSocket }),
  );
  t.after(async () => {
    for (const client of clients) client.close();
    await relay.close();
  });
  const [host, peer, third] = clients;
  const first = host.connect();
  assert.equal(first, host.connect());
  await first;
  await Promise.all([peer.connect(), third.connect()]);
  let waiting = waitFor(host, "room");
  host.create("Alpha");
  const room = await waiting;
  waiting = waitFor(peer, "room");
  peer.join(room.code, "Bravo");
  await waiting;
  waiting = waitFor(third, "room");
  third.join(room.code, "Charlie");
  await waiting;
  const started = clients.map((client) => waitFor(client, "start"));
  host.start();
  const runs = await Promise.all(started);
  const run = runs[0].run;
  let launches = 0;
  for (const client of clients) client.on("go", () => launches++);
  host.ready(run);
  peer.ready(run);
  // A round-trip after two readiness messages proves the third has not been skipped.
  waiting = waitFor(host, "room");
  host.settings("station", "normal");
  await waiting;
  assert.equal(launches, 0);
  const go = clients.map((client) => waitFor(client, "go"));
  third.ready(run);
  await Promise.all(go);
  assert.equal(launches, 3);
  const received = [];
  peer.on("ev", (m) => received.push(m));
  third.relay(peer.id, {
    t: "ev",
    k: "score",
    points: 999,
    head: false,
    type: "walker",
  });
  third.relay(peer.id, { t: "start", host: third.id });
  const valid = waitFor(peer, "ev");
  host.relay(peer.id, {
    t: "ev",
    k: "score",
    points: 100,
    head: false,
    type: "walker",
  });
  assert.equal((await valid).from, host.id);
  assert.equal(received.length, 1);
  assert.equal(received[0].run, run);
  const left = waitFor(peer, "left", (m) => m.id === host.id);
  host.leave();
  await left;
  assert.equal(peer.room.started, false);
});
test("session rejects wrong sender, old run and invalid damage without changing state", () => {
  let credited = 0;
  const net = { id: 2, room: { run: 4 } };
  const session = new Session(net, {
    hostId: 1,
    runId: 4,
    players: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });
  session.context = {
    run: { state: "playing" },
    commands: { creditKill: () => credited++ },
  };
  const message = {
    k: "score",
    from: 1,
    run: 4,
    points: 100,
    head: false,
    type: "walker",
  };
  session.onEvent({ ...message, from: 3 });
  session.onEvent({ ...message, run: 3 });
  session.onEvent({ ...message, points: NaN });
  assert.equal(credited, 0);
  session.onEvent(message);
  assert.equal(credited, 1);
  assert.equal(canRelay({ t: "ev", k: "damage", amount: 10 }, false), false);
  assert.equal(canRelay({ t: "hello", id: 1 }, false), false);
  assert.equal(validSnapshot({ n: 1, e: null }), false);
});

test(
  "an oversized WebSocket frame disconnects only its sender",
  { timeout: 5000 },
  async (t) => {
    const relay = createRelay({ port: 0, host: "127.0.0.1" });
    const address = await relay.ready;
    const url = `ws://127.0.0.1:${address.port}`;
    const host = new Net(url, { WebSocketImpl: WebSocket });
    const invalid = new Net(url, { WebSocketImpl: WebSocket });
    t.after(async () => {
      host.close();
      invalid.close();
      await relay.close();
    });
    await Promise.all([host.connect(), invalid.connect()]);
    let room = waitFor(host, "room");
    host.create("Still playing");
    await room;
    const closed = waitFor(invalid, "close");
    invalid.socket.send(" ".repeat(MAX_MESSAGE_BYTES + 1));
    await closed;
    room = waitFor(host, "room");
    host.settings("station", "normal");
    assert.equal((await room).map, "station");
    assert.equal(relay.rooms.size, 1);
  },
);
