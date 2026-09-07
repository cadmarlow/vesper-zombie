import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { openGameAudit } from "./game-audit.mjs";
process.env.VESPER_URL ||= "http://localhost:4173";

const out = `artifacts/visual-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = { errors: [], scenes: [], checks: [], out };
try {
  for (const mobile of process.argv.includes("--quick")
    ? [false]
    : [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      deviceScaleFactor: mobile ? 3 : 2,
      hasTouch: mobile,
      isMobile: mobile,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (e) => {
      if (e.type() === "error") report.errors.push(e.text());
    });
    await openGameAudit(page);
    await page.click("#play-button");
    await page
      .waitForFunction(() => window.__vesper?.state === "playing", null, {
        timeout: 30000,
      })
      .catch(async (e) => {
        console.log(
          await page.evaluate(() => ({
            state: window.__vesper?.state,
            body: document.body.innerText.slice(-2500),
            resources: performance
              .getEntriesByType("resource")
              .slice(-5)
              .map((x) => x.name),
          })),
        );
        await page.screenshot({ path: `${out}/failure.png` });
        throw e;
      });
    await page.addStyleTag({
      content: "#announcement,#toast-container{visibility:hidden!important}",
    });
    for (const map of ["abbey", "station"]) {
      if (map === "station")
        await page.evaluate(
          async (mobile) => window.__vesper.start("station", "normal", mobile),
          mobile,
        );
      await page.evaluate(() => {
        const g = window.__vesper;
        g.applySettings({ ...g.settings, quality: "high" });
        g.phaseTimer = 10000;
        g.player.invulnerable = 1e8;
        g.world.openDoor(g.world.doors[0]);
        g.updateNavigation(true);
        g.world.setPower();
        g.player.position.set(0, 1.7, 18);
        g.yaw = -0.22;
        g.pitch = 0.04;
      });
      await page.waitForTimeout(4200);
      await page.screenshot({
        path: `${out}/${map}-${mobile ? "mobile" : "desktop"}.png`,
      });
      if (map === "abbey") {
        for (const id of [
          "vigil",
          "spectre",
          "marauder",
          "requiem",
          "longinus",
          "eclipse",
        ]) {
          await page.evaluate((id) => {
            const g = window.__vesper;
            g.weapons[0].id = id;
            g.weapons[0].ammo = 6;
            g.weapons[0].reserve = 80;
            g.setGun();
          }, id);
          await page.waitForTimeout(180);
          await page.screenshot({
            path: `${out}/weapon-${id}-${mobile ? "mobile" : "desktop"}.png`,
          });
          assert(
            await page.evaluate(() =>
              window.__vesper.gun.position.toArray().every(Number.isFinite),
            ),
            `${id} finite view model`,
          );
        }
        await page.evaluate(() => {
          const g = window.__vesper;
          g.weapons[0].id = "spectre";
          g.setGun();
          g.reload();
        });
        await page.waitForTimeout(620);
        await page.screenshot({
          path: `${out}/reload-${mobile ? "mobile" : "desktop"}.png`,
        });
        assert(
          await page.evaluate(
            () => window.__vesper.gun.userData.magazine.position.y < -0.08,
          ),
          "Magazine leaves the weapon during reload",
        );
        report.checks.push(
          `Six weapon models and mechanical reload: ${mobile ? "mobile" : "desktop"}`,
        );
        await page.waitForTimeout(1400);
        await page.evaluate(() => {
          const g = window.__vesper;
          g.weapons[0].id = "vigil";
          g.weapons[0].ammo = 12;
          g.weapons[0].reserve = 84;
          g.setGun();
        });
      }
      await page.evaluate(() => {
        const g = window.__vesper;
        g.yaw = 0;
        g.pitch = 0.03;
        for (let i = 0; i < 5; i++) {
          g.spawnEnemy(
            ["walker", "runner", "brute", "spitter", "wraith"][i],
            g.player.position.clone().set((i - 2) * 1.5, 0, 11),
          );
          const e = g.enemies.at(-1);
          e.model.position.y = 0;
          e.stagger = 1e6;
        }
      });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `${out}/${map}-${mobile ? "mobile" : "desktop"}-enemies.png`,
      });
      for (const quality of process.argv.includes("--captures")
        ? []
        : process.argv.includes("--quick")
          ? ["high"]
          : ["high", "medium", "low"]) {
        await page.evaluate((quality) => {
          const g = window.__vesper;
          g.applySettings({ ...g.settings, quality });
          while (g.enemies.length < 28) {
            g.spawnEnemy(
              ["walker", "runner", "brute", "spitter", "wraith"][
                g.enemies.length % 5
              ],
              g.player.position
                .clone()
                .set(
                  ((g.enemies.length % 7) - 3) * 2,
                  0,
                  -5 - Math.floor(g.enemies.length / 7) * 2,
                ),
            );
            g.enemies.at(-1).model.position.y = 0;
          }
        }, quality);
        await page.waitForTimeout(1000);
        const stats = await page.evaluate(async () => {
          const g = window.__vesper,
            frames = [];
          g.renderer.info.autoReset = false;
          g.renderer.info.reset();
          let previous = performance.now();
          for (let i = 0; i < 90; i++) {
            await new Promise(requestAnimationFrame);
            const t = performance.now();
            frames.push(t - previous);
            previous = t;
          }
          frames.sort((a, b) => a - b);
          const result = {
            fps: Math.round(1000 / frames[45]),
            p95: Math.round(frames[85] * 10) / 10,
            calls: Math.round(g.renderer.info.render.calls / 90),
            triangles: Math.round(g.renderer.info.render.triangles / 90),
            memory: { ...g.renderer.info.memory },
            pixelRatio: g.renderSize.composerRatio,
            ao: g.ao.enabled,
            enemies: g.enemies.length,
          };
          g.renderer.info.autoReset = true;
          return result;
        });
        report.scenes.push({ map, mobile, quality, ...stats });
        console.log(JSON.stringify(report.scenes.at(-1)));
        assert(stats.enemies === 28, "28-enemy stress scene");
        assert(
          !mobile || !stats.ao,
          "Mobile excludes desktop ambient occlusion pass",
        );
      }
    }
    await context.close();
  }
  assert.deepEqual(
    report.errors,
    [],
    "No JavaScript, shader or resource errors",
  );
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(out);
  await browser.close();
}
