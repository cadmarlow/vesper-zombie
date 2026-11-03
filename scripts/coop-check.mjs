import { chromiumOptions } from "./browser.mjs";
import fs from "node:fs";
import { openGameAudit } from "./game-audit.mjs";
import { validSnapshot } from "../server/protocol.js";
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
await peer
  .waitForFunction(() => window.__vesper.enemies.length === 4, null, {
    timeout: 15000,
  })
  .catch(async (error) => {
    const diagnostic = await Promise.all(
      [host, peer].map((page) =>
        page.evaluate(() => ({
          state: window.__vesper.state,
          time: window.__vesper.time,
          enemies: window.__vesper.enemies.length,
          socketState: window.__vesper.session.net.socket?.readyState,
        })),
      ),
    );
    const packet = await host.evaluate(() =>
      window.__vesper.session.snapshot(),
    );
    console.log(
      "Replica diagnostic",
      JSON.stringify({ diagnostic, valid: validSnapshot(packet), packet }),
    );
    throw error;
  });
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
const tonicBefore = await peer.evaluate(() => {
  const g = window.__vesper,
    i = g.world.interactions.find((i) => i.kind === "speed");
  const saved = {
    position: g.player.position.toArray(),
    points: g.player.points,
  };
  const front = i.position
    .clone()
    .set(0, 0, 1)
    .applyQuaternion(i.root.quaternion);
  g.player.points = 5000;
  g.player.position.copy(i.position).addScaledVector(front, 1.8);
  g.interact();
  return {
    ...saved,
    started: g.run.tonic?.kind === "speed",
    paid: g.player.points === 3500,
    beforeSip: !g.player.perks.includes("speed"),
  };
});
check(
  "Guest buys a personal tonic and waits for its first sip",
  tonicBefore.started && tonicBefore.paid && tonicBefore.beforeSip,
);
await peer.waitForFunction(
  () =>
    window.__vesper.run.tonic?.elapsed > 0.6 &&
    window.__vesper.viewModel.tonicView.root.visible,
);
check(
  "Guest holds the physical bottle with both articulated hands",
  await peer.evaluate(() => {
    const vm = window.__vesper.viewModel;
    return (
      vm.arms.root.visible &&
      vm.tonicView.current.cap.visible &&
      !vm.weapon.visible
    );
  }),
);
await peer.waitForFunction(
  () =>
    !window.__vesper.run.tonic &&
    window.__vesper.player.perks.includes("speed"),
);
check(
  "Guest consumes once and returns to their weapon",
  await peer.evaluate(() => {
    const g = window.__vesper;
    return (
      g.player.points === 3500 &&
      g.player.perks.filter((p) => p === "speed").length === 1 &&
      g.viewModel.weapon.visible &&
      !g.viewModel.tonicView.root.visible
    );
  }),
);
await peer.evaluate((before) => {
  const g = window.__vesper;
  g.player.position.fromArray(before.position);
  g.player.points = before.points;
  g.player.perks = g.player.perks.filter((p) => p !== "speed");
}, tonicBefore);
// Every relic is instantiated by the guest and collected through the host.
await host.evaluate(() => {
  const g = window.__vesper;
  for (const p of g.pickups) p.life = 0;
  g.updateEffects(0);
  for (const [index, type] of ["health", "ammo", "double", "insta"].entries())
    g.drop(g.player.position.clone().set(-10 + index * 3, 0, 26), type);
});
await peer.waitForFunction(
  () => window.__vesper.session.remotePickups.size === 4,
);
const relics = await peer.evaluate(() =>
  [...window.__vesper.session.remotePickups.values()].map((p) => [
    p.type,
    p.mesh.userData.pickup?.type,
  ]),
);
check(
  "All four physical pickup models are replicated",
  relics.length === 4 && relics.every(([type, model]) => type === model),
  JSON.stringify(relics),
);
await peer.evaluate(() => {
  const g = window.__vesper;
  window.__beforePickup = {
    position: g.player.position.clone(),
    health: g.player.health,
    invulnerable: g.player.invulnerable,
    lastHurt: g.player.lastHurt,
  };
  g.player.health = 25;
  g.player.lastHurt = g.time;
  g.player.invulnerable = 1e9;
  g.player.position.set(-10, 1.7, 26);
});
await peer.waitForFunction(() => window.__vesper.player.health >= 75);
await peer.waitForFunction(
  () =>
    ![...window.__vesper.session.remotePickups.values()].some(
      (p) => p.type === "health",
    ),
);
check(
  "A guest collects the host's relic once, with its real effect",
  await peer.evaluate(() => window.__vesper.player.health === 75),
);
await peer.evaluate(() => {
  const g = window.__vesper,
    before = window.__beforePickup;
  g.player.position.copy(before.position);
  g.player.health = before.health;
  g.player.invulnerable = before.invulnerable;
  g.player.lastHurt = before.lastHurt;
});
await host.evaluate(() => {
  for (const p of window.__vesper.pickups) p.life = 0.01;
});
await peer.waitForFunction(
  () => window.__vesper.session.remotePickups.size === 0,
);
// Zombie attacks the peer: host sends damage
const restoredPeer = await peer.evaluate(() =>
  window.__vesper.player.position.toArray(),
);
await host.waitForFunction(([x, , z]) => {
  const p = [...window.__vesper.session.players.values()][0];
  return Math.hypot(p.model.position.x - x, p.model.position.z - z) < 0.1;
}, restoredPeer);
await host.evaluate(() => {
  const g = window.__vesper;
  const e = g.enemies.find((x) => x.type === "runner");
  const [id, p] = [...g.session.players.entries()][0];
  e.model.position.set(p.model.position.x + 0.8, 0, p.model.position.z);
  e.model.rotation.y = -Math.PI / 2;
  e.huntTarget = id;
  e.huntUntil = g.time + 3;
  e.action = null;
  e.tactical = null;
  e.nextTactic = g.time + 3;
  e.attack = 0;
});
await peer.waitForFunction(() => window.__vesper.player.health < 100, null, {
  timeout: 3000,
});
const peerHealth = await peer.evaluate(() => window.__vesper.player.health);
check(
  "Host-simulated attack damages the peer",
  peerHealth < 100,
  String(peerHealth),
);
// A grenade tears the legs off tough walkers: the peer sees crawlers too.
// Away from the four mirrored enemies (z = 8): the blast reaches 6 m.
const crawlerIds = await host.evaluate(() => {
  const g = window.__vesper;
  const ids = [];
  for (const x of [-1, 1]) {
    g.spawnEnemy("walker", g.player.position.clone().set(x, 0, 17));
    const e = g.enemies.at(-1);
    e.model.position.y = 0;
    e.health = e.maxHealth = 5000;
    ids.push(e.id);
  }
  const random = Math.random;
  Math.random = () => 0.2;
  try {
    g.explode(g.player.position.clone().set(0, 0.3, 17), null);
  } finally {
    Math.random = random;
  }
  return ids;
});
await peer.waitForTimeout(1500);
const crawlers = await peer.evaluate(
  (ids) =>
    ids.map((id) => {
      const e = window.__vesper.enemies.find((e) => e.id === id);
      return {
        crawler: !!e?.crawler,
        legs: !!e?.model.userData.legsLost,
        crawling: !!e?.model.userData.horde?.anim?.crawling,
      };
    }),
  crawlerIds,
);
console.log(JSON.stringify(crawlers));
check(
  "Crawlers made by the host crawl on the peer",
  crawlers.length === 2 &&
    crawlers.every((c) => c.crawler && c.legs && c.crawling),
);
await host.evaluate((ids) => {
  const g = window.__vesper;
  for (const e of g.enemies)
    if (ids.includes(e.id)) g.damageEnemy(e, 1e6, false);
}, crawlerIds);
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
// Cleanup speed and its run animation reach guests through normal snapshots.
await host.evaluate(() => {
  const g = window.__vesper;
  g.remaining = 0;
  g.spawnTimer = 1e6;
  for (const e of g.enemies) if (!e.dead) g.damageEnemy(e, 1e9, false);
  g.player.position.set(0, 1.7, 20);
  g.updateNavigation();
  for (const x of [-2, 2]) {
    g.spawnEnemy("walker", g.player.position.clone().set(x, 0, 12));
    g.enemies.at(-1).model.position.y = 0;
  }
});
await peer.waitForTimeout(900);
const cleanup = await Promise.all(
  [host, peer].map((page) =>
    page.evaluate(() =>
      window.__vesper.enemies
        .filter((e) => !e.dead)
        .map((e) => ({
          hurrying: e.motion?.hurrying,
          clip: e.model.userData.horde?.anim?.move?.getClip().name,
        })),
    ),
  ),
);
check(
  "The final two walkers run on both host and peer",
  cleanup.every(
    (enemies) =>
      enemies.length === 2 &&
      enemies.every((e) => e.hurrying && e.clip?.startsWith("run_")),
  ),
  JSON.stringify(cleanup),
);
// Real host decisions, delivered by the relay, are presented by the guest.
await host.evaluate(() => {
  const g = window.__vesper;
  for (const e of g.enemies) if (!e.dead) g.damageEnemy(e, 1e9, false);
  g.wave = 8;
  g.phase = "wave";
  g.remaining = 0;
  g.player.invulnerable = 1e9;
  g.player.position.set(0, 1.7, 20);
  for (const [type, x] of [
    ["wraith", -7],
    ["wraith", 7],
    ["runner", -3],
    ["runner", 3],
    ["walker", 0],
  ]) {
    g.spawnEnemy(type, g.player.position.clone().set(x, 0, 6));
    const e = g.enemies.at(-1);
    e.model.position.y = 0;
    e.age = 3;
  }
  g.updateNavigation();
});
await host
  .waitForFunction(
    () => window.__vesper.enemies.some((e) => !e.dead && e.intent?.role),
    null,
    { timeout: 9000 },
  )
  .catch(async (error) => {
    console.log(
      "Tactical diagnostic",
      await host.evaluate(() => {
        const g = window.__vesper;
        return {
          state: g.state,
          time: g.time,
          phase: g.phase,
          remaining: g.remaining,
          relief: g.run.enemyTactics?.reliefUntil,
          people: g.run.enemyTactics?.people,
          enemies: g.enemies
            .filter((e) => !e.dead)
            .map((e) => ({
              id: e.id,
              type: e.type,
              age: e.age,
              at: e.model.position.toArray(),
              intent: e.intent,
              target: e.huntTarget,
              next: e.nextTactic,
            })),
        };
      }),
    );
    throw error;
  });
const intentHost = await host.evaluate(() =>
  window.__vesper.enemies
    .filter((e) => !e.dead && e.intent?.role)
    .map((e) => [e.id, e.intent.role, e.intent.sequence]),
);
await peer.waitForFunction(
  (intents) =>
    window.__vesper.enemies.some(
      (e) =>
        !e.dead &&
        intents.some(
          ([id, role, sequence]) =>
            e.id === id &&
            e.intent?.role === role &&
            e.intent?.sequence === sequence,
        ),
    ),
  intentHost,
  { timeout: 9000 },
);
const intentPeer = await peer.evaluate(() =>
  window.__vesper.enemies
    .filter((e) => !e.dead && e.intent?.role)
    .map((e) => [e.id, e.intent.role, e.intent.sequence]),
);
check(
  "Host tactical intentions are replayed by the guest",
  intentHost.length > 0 &&
    intentHost.some((a) =>
      intentPeer.some((b) => a.every((v, i) => v === b[i])),
    ),
  JSON.stringify({ intentHost, intentPeer }),
);
check(
  "The guest never creates its own tactical director",
  await peer.evaluate(
    () => !window.__vesper.run.enemyTactics && !window.__vesper.run.assault,
  ),
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
