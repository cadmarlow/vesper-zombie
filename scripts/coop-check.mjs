import { chromiumOptions } from "./browser.mjs";
import fs from "node:fs";
import { openGameAudit } from "./game-audit.mjs";
// Two browsers, one relay: create/join, start, sync, hits, doors, death/respawn.
import { chromium } from "@playwright/test";
fs.mkdirSync("artifacts", { recursive: true });
const errors = [];
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const results = [];
const check = (name, ok, extra = "") => {
  results.push([name, ok]);
  console.log(ok ? "PASS" : "FAIL", name, extra);
};
const open = async (label) => {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log(label, "PAGEERROR", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error")
      console.log(label, "CONSOLE", m.text().slice(0, 200));
  });
  await openGameAudit(page);
  return page;
};
const host = await open("host"),
  peer = await open("peer");
// Host creates a room
await host.click("#coop-button");
await host.fill("#coop-name", "Alpha");
await host.click("#coop-create");
await host.waitForSelector(".lobby-code", { timeout: 15000 });
const code = await host.locator(".lobby-code").innerText();
check("Host gets a four-letter room code", /^[A-Z]{4}$/.test(code), code);
// Peer joins
await peer.click("#coop-button");
await peer.fill("#coop-name", "Bravo");
await peer.fill("#coop-code", code);
await peer.click("#coop-join");
await peer.waitForSelector(".lobby-players", { timeout: 15000 });
await host.waitForFunction(
  () => document.querySelectorAll(".lobby-players li:not(.empty)").length === 2,
  null,
  { timeout: 10000 },
);
check("Both see two players in the lobby", true);
// Host picks map and starts
await host.selectOption("#coop-map", "station");
await host.waitForTimeout(300);
await host.click("#coop-start");
await host.waitForFunction(() => window.__vesper?.state === "playing", null, {
  timeout: 90000,
});
await peer.waitForFunction(() => window.__vesper?.state === "playing", null, {
  timeout: 90000,
});
const roles = await Promise.all(
  [host, peer].map((p) =>
    p.evaluate(() => ({
      map: window.__vesper.map,
      host: window.__vesper.session?.host,
      players: window.__vesper.session?.players.size,
    })),
  ),
);
console.log(JSON.stringify(roles));
check(
  "Both start on the station, roles assigned",
  roles[0].map === "station" &&
    roles[1].map === "station" &&
    roles[0].host === true &&
    roles[1].host === false &&
    roles[0].players === 1 &&
    roles[1].players === 1,
);
// Movement sync: move peer, host should see model follow
await peer.evaluate(() => {
  const g = window.__vesper;
  g.player.position.set(5, 1.7, 12);
  g.yaw = 1;
});
await host.waitForTimeout(700);
const seen = await host.evaluate(() => {
  const p = [...window.__vesper.session.players.values()][0];
  return {
    x: p.model?.position.x,
    z: p.model?.position.z,
    name: p.name,
    hasGun: !!p.gun,
    label: !!p.label,
  };
});
console.log(JSON.stringify(seen));
check(
  "Host sees the peer's survivor at its position with name and weapon",
  Math.abs(seen.x - 5) < 0.4 &&
    Math.abs(seen.z - 12) < 0.4 &&
    seen.name === "Bravo" &&
    seen.hasGun &&
    seen.label,
);
// Host spawns enemies; peer should mirror them
await host.evaluate(() => {
  const g = window.__vesper;
  g.phaseTimer = 3600;
  g.player.invulnerable = 1e9;
  for (let i = 0; i < 4; i++)
    g.spawnEnemy(
      ["walker", "brute", "runner", "spitter"][i],
      g.player.position.clone().set(i * 2 - 3, 0, 8),
    );
});
await peer.waitForTimeout(600);
const mirrored = await peer.evaluate(() =>
  window.__vesper.enemies.map((e) => [
    e.type,
    +e.model.position.x.toFixed(1),
    +e.model.position.z.toFixed(1),
    e.id,
  ]),
);
console.log(JSON.stringify(mirrored));
check(
  "Peer mirrors the four enemies",
  mirrored.length === 4 && mirrored.some((e) => e[0] === "brute"),
);
// Peer shoots enemy 1 (walker) via the real damage path
const hostHpBefore = await host.evaluate(
  () => window.__vesper.enemies[0].health,
);
await peer.evaluate(() => {
  const g = window.__vesper;
  g.damageEnemy(
    g.enemies.find((e) => e.id === 1),
    50,
    false,
    null,
  );
});
await host.waitForTimeout(400);
const hostHpAfter = await host.evaluate(
  () => window.__vesper.enemies[0].health,
);
check(
  "Peer hit reaches the host and lowers enemy health",
  hostHpAfter === hostHpBefore - 50,
  `${hostHpBefore} -> ${hostHpAfter}`,
);
// Peer kills it: points credited to the peer
const peerPointsBefore = await peer.evaluate(
  () => window.__vesper.player.points,
);
await peer.evaluate(() => {
  const g = window.__vesper;
  g.damageEnemy(
    g.enemies.find((e) => e.id === 1),
    1e5,
    true,
    null,
  );
});
await peer.waitForTimeout(600);
const after = await Promise.all(
  [host, peer].map((p) =>
    p.evaluate(() => ({
      dead: window.__vesper.enemies.find((e) => e.id === 1)?.dead,
      points: window.__vesper.player.points,
      kills: window.__vesper.player.kills,
    })),
  ),
);
console.log(JSON.stringify(after));
check(
  "Kill by the peer is credited to the peer, mirrored dead on both",
  after[0].dead &&
    after[1].dead &&
    after[1].points === peerPointsBefore + 150 &&
    after[1].kills === 1 &&
    after[0].kills === 0,
);
// Peer buys the door: host opens it and both agree
await peer.evaluate(() => {
  const g = window.__vesper;
  g.player.points = 5000;
  const door = g.world.interactions.find((i) => i.kind === "door");
  g.player.position.set(door.position.x, 1.7, door.position.z + 1.5);
  g.interact();
});
await host.waitForTimeout(600);
const doors = await Promise.all(
  [host, peer].map((p) =>
    p.evaluate(() => window.__vesper.world.doors[0].open),
  ),
);
check("Door bought by the peer opens for both", doors[0] && doors[1]);
// Host turns the power on; peer follows
await host.evaluate(() => {
  const g = window.__vesper;
  g.world.setPower();
});
await peer.waitForTimeout(400);
check(
  "Power state reaches the peer",
  await peer.evaluate(() => window.__vesper.world.power),
);
// Zombie attacks the peer: host sends damage
await host.evaluate(() => {
  const g = window.__vesper;
  const e = g.enemies.find((x) => x.type === "runner");
  const p = [...g.session.players.values()][0];
  e.model.position.set(p.model.position.x + 0.8, 0, p.model.position.z);
  e.attack = 0;
});
await peer.waitForTimeout(900);
const peerHealth = await peer.evaluate(() => window.__vesper.player.health);
check(
  "Host-simulated attack damages the peer",
  peerHealth < 100,
  String(peerHealth),
);
// Peer goes down, then respawns when the host calls a wave
await peer.evaluate(() => {
  const g = window.__vesper;
  g.player.invulnerable = 0;
  g.hurt(1000);
});
await peer.waitForTimeout(300);
check(
  "Peer is down instead of game over",
  await peer.evaluate(
    () => window.__vesper.downed && window.__vesper.state === "playing",
  ),
);
await host.evaluate(() => {
  const g = window.__vesper;
  g.phase = "rest";
  g.phaseTimer = 0.01;
});
await peer.waitForTimeout(900);
check(
  "Peer respawns on the next wave",
  await peer.evaluate(
    () => !window.__vesper.downed && window.__vesper.player.health > 0,
  ),
);
check(
  "Peer sees the new wave number",
  await peer.evaluate(() => window.__vesper.wave === 1),
);
// Everyone down ends the game for both
await host.evaluate(() => {
  const g = window.__vesper;
  g.player.invulnerable = 0;
  g.hurt(1000);
});
await peer.evaluate(() => {
  const g = window.__vesper;
  g.player.invulnerable = 0;
  g.hurt(1000);
});
await host.waitForTimeout(1200);
const states = await Promise.all(
  [host, peer].map((p) => p.evaluate(() => window.__vesper.state)),
);
check(
  "All down ends the run on both sides",
  states[0] === "gameover" && states[1] === "gameover",
  JSON.stringify(states),
);
check("No browser errors", errors.length === 0, JSON.stringify(errors));
await host.screenshot({ path: `artifacts/coop-${Date.now()}.png` });
await browser.close();
if (results.some(([, ok]) => !ok)) process.exit(1);
