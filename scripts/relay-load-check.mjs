// Bounded loopback capacity check. Synthetic clients and relay share this Node
// process; this measures local message handling, not internet or hosting capacity.
import assert from "node:assert/strict";
import fs from "node:fs";
import { WebSocket } from "ws";
import { createRelay } from "../server/index.js";
import { Net } from "../src/net.js";

const PLAYERS = 1000,
  FRAMES = 100,
  INTERVAL = 50;
const relay = createRelay({ port: 0, host: "127.0.0.1" });
const clients = [],
  rooms = [],
  latencies = [];
let received = 0,
  inputs = 0,
  unexpectedCloses = 0,
  measuring = false;
const waitFor = (net, type) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      off();
      reject(new Error("Timeout: " + type));
    }, 10000);
    const off = net.on(type, (message) => {
      clearTimeout(timeout);
      off();
      resolve(message);
    });
  });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pose = {
  x: 0,
  y: 1.7,
  z: 20,
  yaw: 0,
  pitch: 0,
  w: "vigil",
  l: 0,
  hp: 100,
  mhp: 100,
  f: 0,
  points: 650,
  grenades: 3,
};
try {
  const address = await relay.ready;
  for (let i = 0; i < PLAYERS; i += 100) {
    const batch = Array.from(
      { length: 100 },
      () =>
        new Net(`ws://127.0.0.1:${address.port}`, { WebSocketImpl: WebSocket }),
    );
    clients.push(...batch);
    await Promise.all(batch.map((client) => client.connect()));
  }
  for (let i = 0; i < clients.length; i += 4)
    rooms.push(clients.slice(i, i + 4));
  await Promise.all(
    rooms.map(async ([host, ...peers]) => {
      const created = waitFor(host, "room");
      host.create("Load host");
      const room = await created;
      for (const peer of peers) {
        const joined = waitFor(peer, "room");
        peer.join(room.code, "Load peer");
        await joined;
      }
      const group = [host, ...peers];
      const started = group.map((client) => waitFor(client, "start"));
      host.start();
      const runs = await Promise.all(started);
      const ready = group.map((client) => waitFor(client, "go"));
      for (const client of group) client.ready(runs[0].run);
      await Promise.all(ready);
      host.on("ev", (m) => {
        if (m.k === "input") inputs++;
      });
      for (const peer of peers)
        peer.on("state", (m) => {
          received++;
          latencies.push(Math.max(0, performance.now() - m.n));
        });
    }),
  );
  for (const client of clients)
    client.on("close", () => {
      if (measuring) unexpectedCloses++;
    });
  measuring = true;
  const started = performance.now();
  for (let frame = 0; frame < FRAMES; frame++) {
    for (const [host, ...peers] of rooms) {
      host.relay("all", {
        t: "state",
        n: Math.floor(performance.now()),
        wave: 10,
        phase: "wave",
        timer: 17,
        remaining: 30,
        power: 1,
        paused: false,
        extraction: -1,
        box: [0, null, null],
        doors: [["door:0:5", 1]],
        e: Array.from({ length: 28 }, (_, i) => [
          i + 1,
          "walker",
          i % 7,
          Math.floor(i / 7),
          0,
          211,
          0,
          0,
          0,
          0,
          211,
        ]),
        p: [host, ...peers].map((client) => [
          client.id,
          0,
          1.7,
          20,
          0,
          0,
          "vigil",
          0,
          100,
          100,
          0,
          650,
          3,
        ]),
        k: [],
        j: [],
      });
      for (const peer of peers)
        peer.relay("host", { t: "ev", k: "input", ...pose });
    }
    await delay(INTERVAL);
  }
  const expected = rooms.length * 3 * FRAMES;
  const deadline = performance.now() + 3000;
  while (
    (received < expected || inputs < expected) &&
    performance.now() < deadline
  )
    await delay(20);
  const elapsed = performance.now() - started;
  latencies.sort((a, b) => a - b);
  const report = {
    date: new Date().toISOString(),
    node: process.version,
    players: clients.length,
    rooms: rooms.length,
    snapshotsPerRoom: FRAMES,
    enemiesPerSnapshot: 28,
    receivedSnapshots: received,
    receivedInputs: inputs,
    expectedEach: expected,
    unexpectedCloses,
    elapsedMs: Math.round(elapsed),
    deliveredPerSecond: Math.round(((received + inputs) * 1000) / elapsed),
    latencyMs: {
      median: latencies[Math.floor(latencies.length * 0.5)],
      p95: latencies[Math.floor(latencies.length * 0.95)],
    },
    processRssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    scope:
      "Synthetic clients and relay in one process, local loopback only, no rendering or internet latency.",
  };
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync(
    "artifacts/relay-load.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  assert.equal(unexpectedCloses, 0);
  assert.equal(received, expected);
  assert.equal(inputs, expected);
  console.log(
    "PASS 1000 clients in 250 rooms, all snapshots and inputs delivered.",
  );
} finally {
  measuring = false;
  for (const client of clients) client.close();
  await relay.close();
}
