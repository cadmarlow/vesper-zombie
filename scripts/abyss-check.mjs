import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openGameAudit } from "./game-audit.mjs";
import { canStand, Navigation } from "../src/logic.js";

process.env.VESPER_URL ||= "http://localhost:4173";
const out = `artifacts/abyss-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = {
  out,
  errors: [],
  checks: [],
  performance: [],
  navigation: [],
  memory: [],
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const check = (name, value) => {
  assert(value, name);
  report.checks.push(name);
  console.log("PASS", name);
};
try {
  for (const mobile of [false, true]) {
    const profile = mobile ? "mobile" : "desktop";
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      deviceScaleFactor: mobile ? 3 : 2,
      isMobile: mobile,
      hasTouch: mobile,
    });
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (e) => {
      if (e.type() === "error") report.errors.push(e.text());
    });
    await openGameAudit(page);
    await page.click('[data-map="abyss"]');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${out}/${profile}-menu.png` });
    check(
      `${profile}: third destination and art selectable`,
      (await page
        .locator('[data-map="abyss"]')
        .getAttribute("aria-pressed")) === "true" &&
        (await page
          .locator('[data-map="abyss"] img')
          .evaluate((i) => i.complete && i.naturalWidth > 0)),
    );
    await page.click("#play-button");
    await page
      .waitForFunction(() => window.__vesper?.state === "playing", null, {
        timeout: 45000,
      })
      .catch(async (e) => {
        console.log(report.errors);
        await page.screenshot({ path: `${out}/failure.png` });
        throw e;
      });
    await page.evaluate(() => {
      const g = window.__vesper;
      g.phaseTimer = 1e6;
      g.player.invulnerable = 1e9;
    });
    await page.waitForTimeout(5500);
    check(
      `${profile}: new map starts beyond the former navigation extent`,
      await page.evaluate(() => {
        const g = window.__vesper;
        return (
          g.map === "abyss" &&
          g.player.position.z > 32 &&
          g.navigation.size === 96 &&
          g.world.doors.length === 3
        );
      }),
    );
    await page.screenshot({ path: `${out}/${profile}-arrival-dark.png` });
    const firstRoutes = await page.evaluate(() => {
      const g = window.__vesper;
      g.updateNavigation();
      return [
        [0, 14],
        [-28, -10],
        [0, -30],
      ].map(([x, z]) => g.navigation.distance[g.navigation.index(x, z)]);
    });
    check(
      `${profile}: all three restricted sectors start sealed`,
      firstRoutes.every((v) => v < 0),
    );
    for (const [index, x, z, target] of [
      [0, 0, 26, [0, 14]],
      [1, -18, 3, [-28, -10]],
      [2, 0, -20.8, [0, -30]],
    ]) {
      const result = await page.evaluate(
        ({ index, x, z, target }) => {
          const g = window.__vesper,
            d = g.world.doors[index];
          g.player.position.set(x, 1.7, z);
          g.player.points = d.cost - 1;
          g.interact();
          const denied = !d.open && g.player.points === d.cost - 1;
          g.player.points = 9000;
          g.interact();
          g.updateNavigation();
          return {
            denied,
            open: d.open,
            cost: 9000 - g.player.points,
            expected: d.cost,
            reachable:
              g.navigation.distance[g.navigation.index(...target)] >= 0,
          };
        },
        { index, x, z, target },
      );
      check(
        `${profile}: sas ${index + 1} purchase, collision and navigation`,
        result.denied &&
          result.open &&
          result.cost === result.expected &&
          result.reachable,
      );
    }
    const layout = await page.evaluate(() => {
      const g = window.__vesper;
      return {
        obstacles: g.world.obstacles,
        bounds: g.world.bounds,
        spawns: g.world.spawnPoints,
        interactions: g.world.interactions.map((i) => ({
          kind: i.kind,
          x: i.position.x,
          z: i.position.z,
        })),
      };
    });
    for (const clearance of [0.36, 0.6]) {
      const nav = new Navigation(layout.obstacles, 96, 1, clearance);
      nav.update(0, 36);
      check(
        `${profile}: all authored spawn anchors clear at radius ${clearance}`,
        layout.spawns.every(
          ([x, z]) =>
            canStand(x, z, layout.obstacles, clearance) &&
            nav.distance[nav.index(x, z)] >= 0,
        ),
      );
      check(
        `${profile}: every machine and archive approachable at radius ${clearance}`,
        layout.interactions
          .filter((i) => i.kind !== "door")
          .every((i) =>
            nav.nearby(i.x, i.z, 2.8).some((j) => nav.distance[j] >= 0),
          ),
      );
      report.navigation.push({
        profile,
        clearance,
        reachableCells: [...nav.distance].filter((d) => d >= 0).length,
      });
    }
    check(
      `${profile}: footprint exceeds twice the original maps`,
      layout.bounds.x * layout.bounds.z > 2 * 24 * 29,
    );
    check(
      `${profile}: all three archives read through normal interaction`,
      await page.evaluate(() => {
        const g = window.__vesper;
        for (const i of g.world.interactions.filter(
          (i) => i.kind === "recording",
        )) {
          g.player.position.set(i.position.x, 1.7, i.position.z + 1.8);
          g.interact();
          if (!i.read) return false;
        }
        return true;
      }),
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      const p = g.world.interactions.find((i) => i.kind === "power");
      g.player.position.set(p.position.x + 2, 1.7, p.position.z);
      g.interact();
      g.player.position.set(0, 1.7, 19);
      g.yaw = 0;
      g.pitch = 0.22;
    });
    await page.waitForTimeout(5000);
    check(
      `${profile}: generator lights all circuits and canopy`,
      await page.evaluate(() => {
        const w = window.__vesper.world;
        return (
          w.power &&
          w.powerLevel === 1 &&
          w.circuits.every((c) => c.level === 1)
        );
      }),
    );
    await page.addStyleTag({
      content: "#announcement,#toast-container{visibility:hidden!important}",
    });
    for (const [name, x, z, yaw, pitch] of [
      ["canopy", 0, 19, 0, 0.22],
      ["roots", -10, 7, -0.6, 0.32],
      ["engine", -28, 12, 0, 0.08],
      ["herbarium", 27, 19, 0, 0.08],
      ["observatory", 0, -26, 0, 0.19],
      ["ocean", 12, -16, 0, 0.7],
      ["return", 0, -38, Math.PI, 0.1],
    ]) {
      await page.evaluate(
        ({ x, z, yaw, pitch }) => {
          const g = window.__vesper;
          g.player.position.set(x, 1.7, z);
          g.yaw = yaw;
          g.pitch = pitch;
        },
        { x, z, yaw, pitch },
      );
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${profile}-${name}.png` });
    }
    // Extraction follows this map's actual beacon at z=40, not the old z=26.
    check(
      `${profile}: extraction only advances at the authored beacon`,
      await page.evaluate(() => {
        const g = window.__vesper;
        g.wave = 10;
        g.phase = "rest";
        const beacon = g.world.interactions.find((i) => i.kind === "extract");
        g.player.position.set(beacon.position.x, 1.7, beacon.position.z - 2);
        g.interact();
        const initial = g.extractionTimer;
        g.player.position.set(0, 1.7, 26);
        g.update(0.05);
        const away = g.extractionTimer;
        g.player.position.set(0, 1.7, 38);
        g.update(0.05);
        const near = g.extractionTimer;
        g.extraction = false;
        return initial === 20 && away === 20 && near < away;
      }),
    );
    if (!process.argv.includes("--captures"))
      for (const quality of ["high", "medium", "low"]) {
        await page.evaluate((quality) => {
          const g = window.__vesper;
          g.wave = 4;
          g.phase = "wave";
          g.remaining = 0;
          g.phaseTimer = 1e6;
          g.applySettings({ ...g.settings, quality });
          g.player.position.set(0, 1.7, 18);
          g.yaw = 0;
          g.pitch = 0.08;
          while (g.enemies.length < 28) {
            g.spawnEnemy(
              ["walker", "runner", "brute", "spitter", "wraith"][
                g.enemies.length % 5
              ],
              g.player.position
                .clone()
                .set(
                  ((g.enemies.length % 7) - 3) * 1.8,
                  0,
                  14 - Math.floor(g.enemies.length / 7) * 2.4,
                ),
            );
            g.enemies.at(-1).model.position.y = 0;
            g.enemies.at(-1).stagger = 1e6;
          }
        }, quality);
        await page.waitForTimeout(1600);
        const stats = await page.evaluate(async () => {
          const g = window.__vesper,
            frames = [];
          g.renderer.info.autoReset = false;
          g.renderer.info.reset();
          let last = performance.now();
          for (let i = 0; i < 100; i++) {
            await new Promise(requestAnimationFrame);
            const now = performance.now();
            frames.push(now - last);
            last = now;
          }
          frames.sort((a, b) => a - b);
          const result = {
            fps: Math.round(1000 / frames[50]),
            p95: Math.round(frames[95] * 10) / 10,
            calls: Math.round(g.renderer.info.render.calls / 100),
            triangles: Math.round(g.renderer.info.render.triangles / 100),
            memory: { ...g.renderer.info.memory },
            ratio: g.renderSize.composerRatio,
            lights:
              g.world.lights.filter((l) => l.light.visible).length +
              g.world.circuits.filter((c) => c.light.visible).length,
          };
          g.renderer.info.autoReset = true;
          return result;
        });
        report.performance.push({ profile, quality, ...stats });
        console.log(JSON.stringify(report.performance.at(-1)));
        check(
          `${profile} ${quality}: bounded light count and active horde`,
          stats.lights <= (mobile || quality === "low" ? 6 : 8) &&
            (await page.evaluate(() => window.__vesper.enemies.length === 28)),
        );
        await page.screenshot({
          path: `${out}/${profile}-horde-${quality}.png`,
        });
      }
    check(
      `${profile}: successful extraction persists a third-map record`,
      await page.evaluate(() => {
        const g = window.__vesper;
        g.wave = 10;
        g.phase = "rest";
        g.phaseTimer = 1e6;
        g.player.position.set(0, 1.7, 38);
        g.extraction = false;
        g.interact();
        g.extractionTimer = 0.01;
        g.update(0.05);
        const save = JSON.parse(localStorage.getItem("vesper-save"));
        return (
          g.state === "gameover" &&
          save.records.abyss.victory &&
          save.records.abyss.wave === 10
        );
      }),
    );
    await page.click("#end-menu");
    await page.click('[data-panel="archives"]');
    check(
      `${profile}: archives include the new destination`,
      (await page.locator(".archive-maps").innerText()).includes(
        "Les Jardins Abyssaux",
      ),
    );
    await page.click("#close-panel");
    for (const map of ["abyss", "station", "abyss", "station", "abyss"]) {
      await page.evaluate(
        async ({ map, mobile }) => {
          const g = window.__vesper;
          g.applySettings({ ...g.settings, quality: "high" });
          await g.start(map, "normal", mobile);
          g.phaseTimer = 1e6;
          g.player.invulnerable = 1e9;
        },
        { map, mobile },
      );
      await page.waitForTimeout(750);
      if (map === "abyss")
        report.memory.push({
          profile,
          ...(await page.evaluate(() => ({
            ...window.__vesper.renderer.info.memory,
          }))),
        });
    }
    const cycles = report.memory.filter((m) => m.profile === profile);
    check(
      `${profile}: repeated map changes release GPU resources`,
      cycles.at(-1).textures <= cycles[0].textures + 1 &&
        cycles.at(-1).geometries <= cycles[0].geometries + 1,
    );
    await page.close();
  }
  check("No browser, shader or resource errors", report.errors.length === 0);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(out);
  await browser.close();
}
