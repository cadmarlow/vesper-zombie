import { chromium } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { openGameAudit } from "./game-audit.mjs";
import { checkLacunaCoop } from "./lacuna-coop.mjs";
import { reviewLacuna } from "./lacuna-review.mjs";
import { Navigation, canStand } from "../src/logic.js";
import fs from "node:fs";
import assert from "node:assert/strict";

process.env.VESPER_URL ||= "http://127.0.0.1:4195";
const out = process.env.LACUNA_OUTPUT || `artifacts/lacuna-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { out, errors: [], checks: [], profiles: [] };
function check(label, value, detail) {
  report.checks.push({ label, passed: !!value, detail });
  if (!value) console.log("DETAIL", detail);
  assert(value, label);
  console.log("PASS", label);
}
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  for (const mobile of process.env.LACUNA_COOP_ONLY ||
  process.env.LACUNA_REVIEW_ONLY
    ? []
    : process.env.LACUNA_QUICK
      ? [false]
      : [false, true]) {
    const name = mobile ? "mobile" : "desktop";
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    page.on("pageerror", (e) => {
      report.errors.push(e.message);
      console.log("PAGE ERROR", e.message);
    });
    page.on("console", (e) => {
      if (e.type() === "error") {
        report.errors.push(e.text());
        console.log("CONSOLE ERROR", e.text().slice(0, 1200));
      }
    });
    await openGameAudit(page);
    await page.click('[data-map="lacuna"]');
    await page.waitForTimeout(1000);
    check(
      `${name}: four destination cards stay on one row in landscape`,
      await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".map-card")].map((card) =>
          card.getBoundingClientRect(),
        );
        return (
          cards.length === 4 &&
          cards.every(
            (rect) =>
              Math.abs(rect.top - cards[0].top) < 2 &&
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight,
          )
        );
      }),
    );
    await page.screenshot({ path: `${out}/${name}-menu.png` });
    await page.click("#play-button");
    await page.waitForFunction(
      () => window.__vesper?.state === "playing",
      null,
      { timeout: 90000 },
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      g.phaseTimer = 1e6;
      g.player.invulnerable = 1e9;
    });
    await page.waitForTimeout(5000);
    await page.addStyleTag({
      content: "#announcement,#toast-container{visibility:hidden!important}",
    });
    await page.screenshot({ path: `${out}/${name}-arrival.png` });
    const data = await page.evaluate(() => {
      const g = window.__vesper;
      const initial = g.navigation.distance[g.navigation.index(0, 40)];
      g.player.position.set(0, 1.7, 50);
      g.player.points = 10000;
      g.interact();
      g.updateNavigation(true);
      return {
        initial,
        opened: g.world.doors[0].open,
        points: g.player.points,
        size: g.navigation.size,
        bounds: g.world.bounds,
        obstacles: g.world.obstacles,
        spawns: g.world.spawnPoints,
        machines: g.world.interactions.map((i) => ({
          kind: i.kind,
          x: i.position.x,
          z: i.position.z,
        })),
        triangles: g.renderer.info.render.triangles,
        calls: g.renderer.info.render.calls,
        textures: g.renderer.info.memory.textures,
        fps: g.fps,
      };
    });
    report.profiles.push({ name, ...data });
    check(
      `${name}: arrival isolated until gate purchase`,
      data.initial < 0 && data.opened && data.points === 9250,
      data,
    );
    for (const radius of [0.36, 0.6]) {
      const nav = new Navigation(data.obstacles, data.size, 1, radius);
      nav.update(0, 50);
      const failedSpawns = data.spawns.filter(
        ([x, z]) =>
          !canStand(x, z, data.obstacles, radius) ||
          nav.distance[nav.index(x, z)] < 0,
      );
      check(
        `${name}: all spawn anchors reachable (${radius})`,
        !failedSpawns.length,
        failedSpawns,
      );
      const failedMachines = data.machines.filter(
        (m) =>
          m.kind !== "door" &&
          !Array.from({ length: 32 }, (_, i) => {
            const angle = (i * Math.PI) / 16,
              x = m.x + Math.cos(angle) * 2.2,
              z = m.z + Math.sin(angle) * 2.2;
            return (
              canStand(x, z, data.obstacles, radius) &&
              nav.distance[nav.index(x, z)] >= 0
            );
          }).some(Boolean),
      );
      check(
        `${name}: all interactions approachable (${radius})`,
        !failedMachines.length,
        failedMachines,
      );
    }
    for (const [view, position, yaw, pitch] of [
      ["dam", [0, 1.7, 39], 0, 0.15],
      ["thermes", [-36, 1.7, 26], 0.22, 0.3],
      ["hotel", [15, 1.7, -19], -0.78, 0.16],
      ["quai", [15, 1.7, 24], 0, 0.1],
    ]) {
      await page.evaluate(
        ({ position, yaw, pitch }) => {
          const g = window.__vesper;
          g.player.position.set(...position);
          g.yaw = yaw;
          g.pitch = pitch;
        },
        { position, yaw, pitch },
      );
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${name}-${view}.png` });
    }
    const hydraulics = await page.evaluate(() => {
      const g = window.__vesper,
        runtime = g.run.mapGameplay;
      const power = g.world.interactions.find((i) => i.kind === "power");
      g.player.position.set(power.position.x + 2, 1.7, power.position.z);
      g.interact();
      const powered = g.world.power;
      const valve = g.world.interactions.find((i) => i.id === "lacuna:valve:0");
      g.player.position.set(valve.position.x, 1.7, valve.position.z + 2);
      const points = g.player.points;
      g.interact();
      const purchased =
        runtime.hydraulics.phase === 1 && g.player.points === points - 350;
      g.interact();
      const noDuplicate = g.player.points === points - 350;
      for (let i = 0; i < 5; i++) runtime.update(1);
      g.player.position.set(18, 1.7, 10);
      g.player.health = 100;
      g.player.invulnerable = 0;
      g.spawnEnemy("walker", g.player.position.clone());
      const victim = g.enemies.at(-1);
      victim.model.position.y = 0;
      victim.health = 1;
      runtime.damageTimer = 0;
      runtime.update(0.4);
      const playerDamaged = g.player.health < 100,
        enemyKilled = victim.dead;
      g.player.position.set(15, 1.7, 27);
      g.player.health = 100;
      g.player.invulnerable = 1e9;
      for (let i = 0; i < 20; i++) runtime.update(1);
      for (const index of [1, 2]) {
        const control = g.world.interactions.find(
          (i) => i.id === `lacuna:valve:${index}`,
        );
        g.player.position.set(control.position.x, 1.7, control.position.z + 2);
        g.interact();
        for (let i = 0; i < 18; i++) runtime.update(1);
      }
      const threeValves = runtime.hydraulics.used === 7;
      const bell = g.world.interactions.find((i) => i.id === "lacuna:bell");
      g.player.position.set(23, 1.7, -5.6);
      g.interact();
      const bellActivated = runtime.hydraulics.bell > 0;
      const victimPosition = g.player.position.clone().set(17, 0, 18);
      g.spawnEnemy("walker", victimPosition);
      const lured = g.enemies.at(-1);
      lured.model.position.y = 0;
      const bait = runtime.enemyFocus(lured, null);
      const bellLures =
        !!bait?.bait &&
        bait.navigation.distance[bait.navigation.index(17, 18)] >= 0;
      g.player.position.set(18, 1.7, 18);
      const closeEnemyFights = runtime.enemyFocus(lured, null) === null;
      lured.dead = true;
      lured.deathTime = 0;
      const release = g.world.interactions.find(
        (i) => i.id === "lacuna:release",
      );
      g.player.position.set(19, 1.7, -0.5);
      g.interact();
      const releaseStarted =
        runtime.hydraulics.mode === 2 && runtime.hydraulics.phase === 1;
      // A player on the bridge must hold the global release, even after the siren ends.
      g.player.position.set(0, 1.7, 0);
      for (let i = 0; i < 14; i++) runtime.update(1);
      const occupiedSafe =
        runtime.hydraulics.phase === 1 && !g.world.lacunaBridgeObstacle.active;
      g.player.position.set(15, 1.7, 26);
      runtime.update(0.1);
      const bridgeClosed =
        runtime.hydraulics.phase === 2 && g.world.lacunaBridgeObstacle.active;
      const safeRoutes = [
        [0, 40],
        [0, -44],
        [-54, -44],
        [-56, -6],
        [57, 18],
        [0, 74],
      ].every(([x, z]) =>
        g.navigation
          .nearby(x, z, 2.5)
          .some((index) => g.navigation.distance[index] >= 0),
      );
      const beforeReward = g.player.points;
      for (let i = 0; i < 60; i++) {
        runtime.update(1);
        g.world.update(1, g.time);
      }
      const completed =
        runtime.hydraulics.mastered && g.player.points === beforeReward + 1000;
      for (let i = 0; i < 5; i++) {
        runtime.update(1);
        g.world.update(1, g.time);
      }
      const reopened = !g.world.lacunaBridgeObstacle.active;
      const rewardOnce = g.player.points === beforeReward + 1000;
      runtime.hydraulics.phase = 1;
      runtime.hydraulics.mode = 0;
      runtime.hydraulics.zone = 0;
      runtime.hydraulics.timer = 0;
      runtime.update(0.1);
      g.yaw = 0;
      g.pitch = 0.2;
      return {
        powered,
        purchased,
        noDuplicate,
        playerDamaged,
        enemyKilled,
        threeValves,
        bellActivated,
        bellLures,
        closeEnemyFights,
        releaseStarted,
        occupiedSafe,
        bridgeClosed,
        safeRoutes,
        completed,
        reopened,
        rewardOnce,
      };
    });
    for (const [label, passed] of Object.entries(hydraulics))
      check(`${name}: ${label}`, passed, hydraulics);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${out}/${name}-purge.png` });
    const metrics = await page.evaluate(async () => {
      const g = window.__vesper;
      g.renderer.info.autoReset = false;
      g.renderer.info.reset();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const render = { ...g.renderer.info.render };
      g.renderer.info.autoReset = true;
      return {
        fps: g.fps,
        renderSize: g.renderSize,
        render,
        textures: g.renderer.info.memory.textures,
        geometries: g.renderer.info.memory.geometries,
      };
    });
    report.profiles.at(-1).metrics = metrics;
    console.log("METRICS", name, metrics);
    await page.close();
  }
  if (!process.env.LACUNA_QUICK && !process.env.LACUNA_REVIEW_ONLY)
    await checkLacunaCoop(browser, report, check);
  if (process.env.LACUNA_REVIEW_ONLY || process.env.LACUNA_REVIEW)
    await reviewLacuna(browser, report, check);
  check("no browser or WebGL errors", !report.errors.length, report.errors);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log("REPORT", out);
}
