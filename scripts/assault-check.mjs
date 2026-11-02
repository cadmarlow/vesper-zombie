import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, webkit } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { openGameAudit } from "./game-audit.mjs";
import { createStaticServer } from "./serve.mjs";

const out = `artifacts/assaults-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], runs: [], baseline: [], errors: [] };
const servers = [];
async function serve(factory) {
  const server = factory();
  servers.push(server);
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  return `http://127.0.0.1:${server.address().port}`;
}
const url = process.env.VESPER_URL || (await serve(createStaticServer));
let baseline;
if (process.env.VESPER_BASELINE_DIR) {
  const module = await import(
    pathToFileURL(
      path.resolve(process.env.VESPER_BASELINE_DIR, "scripts/serve.mjs"),
    )
  );
  baseline = await serve(module.createStaticServer);
}
const check = (name, ok) => {
  assert(ok, name);
  report.checks.push(name);
  console.log("PASS", name);
};
let browser;
try {
  for (const profile of ["desktop", "mobile", "webkit"]) {
    browser = await (profile === "webkit" ? webkit : chromium).launch({
      headless: true,
      ...(profile === "webkit"
        ? {}
        : {
            ...chromiumOptions,
            args: ["--enable-webgl", "--ignore-gpu-blocklist"],
          }),
    });
    for (const version of baseline && profile === "desktop"
      ? ["baseline", "current"]
      : ["current"]) {
      const context = await browser.newContext({
        viewport:
          profile === "desktop"
            ? { width: 1280, height: 720 }
            : { width: 844, height: 390 },
        hasTouch: profile !== "desktop",
        isMobile: profile !== "desktop",
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => report.errors.push(e.message));
      process.env.VESPER_URL = version === "baseline" ? baseline : url;
      await openGameAudit(page);
      await page.click("#play-button");
      await page.waitForFunction(
        () => window.__vesper?.state === "playing",
        null,
        { timeout: 90000 },
      );
      for (const map of profile === "webkit"
        ? ["abbey", "lacuna"]
        : ["abbey", "station", "abyss", "lacuna"]) {
        const result = await page.evaluate(
          async ({ map, version }) => {
            const g = window.__vesper;
            await g.start(map, "normal", true);
            g.state = "audit";
            g.sound.setVolume(0);
            g.emit = () => {};
            for (const door of g.world.doors) g.world.openDoor(door);
            const routes = {
              abbey: [
                [-8, 26],
                [8, 26],
                [8, 9],
                [-8, 9],
              ],
              station: [
                [-8, 26],
                [8, 26],
                [8, 8],
                [-8, 8],
              ],
              abyss: [
                [0, 36],
                [-25, 34],
                [-28, -11],
                [27, 8],
              ],
              lacuna: [
                [0, 69],
                [-40, 33],
                [-52, -6],
                [0, -68],
                [46, 27],
              ],
            };
            const route = routes[map];
            g.player.position.set(route[0][0], 1.7, route[0][1]);
            g.wave = 8;
            g.phase = "wave";
            g.remaining = 0;
            g.updateNavigation(true);
            let seed = 20689;
            const random = () => {
              seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
              return seed / 4294967296;
            };
            const oldRandom = Math.random;
            Math.random = random;
            const types = [
              ...Array(16).fill("walker"),
              ...Array(6).fill("runner"),
              "wraith",
              "wraith",
              "spitter",
              "spitter",
              "brute",
              "brute",
            ];
            for (const type of types) {
              const nav = type === "brute" ? g.largeNavigation : g.navigation;
              const pos = nav.spawnPosition(
                g.world.spawnPoints,
                g.player.position,
                random,
                g.enemies.map((e) => e.model.position),
              );
              if (!pos) throw new Error(`No audit spawn ${map}/${type}`);
              g.spawnEnemy(
                type,
                g.player.position.clone().set(pos.x, 0, pos.z),
              );
              const e = g.enemies.at(-1);
              e.model.position.y = 0;
              e.age = 3;
            }
            const sampleHealth = g.enemies.map((e) => [e.id, e.maxHealth]);
            const pathing = new g.navigation.constructor(
              g.world.obstacles,
              g.navigation.size,
              1,
              0.38,
            );
            let goal = 1;
            pathing.update(...route[goal]);
            const kinds = new Set(),
              sequences = new Set(),
              duration = [],
              contacts = [];
            let playerTravel = 0,
              invalid = 0,
              specialPeak = 0;
            const originalHurt = g.hurt;
            g.hurt = (amount, source) => {
              const before = g.player.health;
              originalHurt(amount, source);
              if (g.player.health < before)
                contacts.push({
                  time: g.time,
                  damage: before - g.player.health,
                });
            };
            g.state = "playing";
            for (let frame = 0; frame < 45 * 30; frame++) {
              g.time += 1 / 30;
              g.player.health = 100;
              const before = g.player.position.clone();
              let [x, z] = route[goal];
              if (Math.hypot(before.x - x, before.z - z) < 0.5) {
                goal = (goal + 1) % route.length;
                [x, z] = route[goal];
                pathing.update(x, z);
              }
              const to = pathing.direction(before.x, before.z, { x, z });
              const dx = to.x - before.x,
                dz = to.z - before.z,
                dist = Math.hypot(dx, dz),
                scale = Math.min(1, dist / (3.65 / 30));
              g.touchMove = {
                x: (dx / (dist || 1)) * scale,
                y: (-dz / (dist || 1)) * scale,
              };
              g.touchSprint = false;
              g.yaw = 0;
              g.keys.clear();
              g.mouse.fire = g.mouse.aim = false;
              g.updatePlayer(1 / 30);
              if (frame % 15 === 0) g.updateNavigation();
              const start = performance.now();
              g.updateEnemies(1 / 30);
              if (frame > 60) duration.push(performance.now() - start);
              g.updateEffects(1 / 30);
              playerTravel += g.player.position.distanceTo(before);
              let specials = 0;
              for (const e of g.enemies) {
                if (!e.model.position.toArray().every(Number.isFinite))
                  invalid++;
                if (e.intent?.role) {
                  kinds.add(e.intent.role);
                  sequences.add(`${e.id}:${e.intent.sequence}`);
                }
                if (
                  e.action &&
                  (e.action.kind === "spit" || e.action.leap) &&
                  g.time <
                    e.action.startTime + (e.action.kind === "spit" ? 1.1 : 0.85)
                )
                  specials++;
              }
              specialPeak = Math.max(specialPeak, specials);
            }
            g.hurt = originalHurt;
            g.state = "audit";
            Math.random = oldRandom;
            duration.sort((a, b) => a - b);
            g.updateHUD();
            g.composer.render();
            return {
              map,
              version,
              seconds: 45,
              actors: g.enemies.filter((e) => !e.dead).length,
              roles: [...kinds],
              intentStarts: sequences.size,
              playerTravel: +playerTravel.toFixed(2),
              contacts: contacts.length,
              damage: contacts.reduce((a, c) => a + c.damage, 0),
              specialPeak,
              invalid,
              enemyCpuMedian: duration[Math.floor(duration.length * 0.5)],
              enemyCpuP95: duration[Math.floor(duration.length * 0.95)],
              healthUnchanged: sampleHealth.every(
                ([id, h]) =>
                  g.enemies.find((e) => e.id === id)?.maxHealth === h,
              ),
            };
          },
          { map, version },
        );
        console.log("AI", profile, version, map, JSON.stringify(result));
        (version === "baseline" ? report.baseline : report.runs).push({
          profile,
          ...result,
        });
        check(
          `${profile}/${version}/${map}: finite actors, unchanged health, bounded population`,
          result.invalid === 0 &&
            result.healthUnchanged &&
            result.actors === 28,
        );
        if (version === "current") {
          check(
            `${profile}/${map}: real tactical decisions appear during pursuit`,
            result.intentStarts > 0 && result.roles.includes(2),
          );
          check(
            `${profile}/${map}: no stacked leap/spit wind-ups in solo`,
            result.specialPeak <= 1,
          );
          await page.screenshot({ path: `${out}/${profile}-${map}.png` });
        }
      }
      if (version === "current") {
        const packets = await page.evaluate(async () => {
          const g = window.__vesper;
          await g.start("abbey", "normal", true);
          g.state = "audit";
          g.sound.setVolume(0);
          g.player.invulnerable = 1e9;
          g.wave = 7;
          g.beginWave();
          const expected = g.remaining;
          const seen = new Set();
          const history = new Set();
          let peak = 0;
          for (let f = 0; f < 60 * 30 && g.remaining; f++) {
            g.time += 1 / 30;
            g.updateEnemies(1 / 30);
            g.survival.update(1 / 30);
            for (const e of g.enemies) {
              seen.add(e.id);
              if (e.assault) history.add(e.assault.pattern);
            }
            peak = Math.max(peak, g.enemies.filter((e) => !e.dead).length);
          }
          g.state = "audit";
          return {
            expected,
            spawned: seen.size,
            remaining: g.remaining,
            patterns: [...history],
            peak,
          };
        });
        check(
          `${profile}: authored packets finish their exact wave quota`,
          packets.spawned === packets.expected &&
            packets.remaining === 0 &&
            packets.peak <= 28,
        );
        check(
          `${profile}: multiple composed assault patterns are used`,
          packets.patterns.length >= 2,
        );
      }
      await context.close();
    }
    await browser.close();
    browser = null;
  }
  check("No browser errors", report.errors.length === 0);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  for (const s of servers) await new Promise((r) => s.close(r));
  console.log("Report:", out);
}
