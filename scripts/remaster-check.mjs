import { chromiumOptions } from "./browser.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs";
import { writeRemasterGallery } from "./remaster-gallery.mjs";
import assert from "node:assert/strict";
import { openGameAudit } from "./game-audit.mjs";

process.env.VESPER_URL ||= "http://localhost:4173";
const out = `artifacts/remaster-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { out, errors: [], scenes: [], checks: [] };
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  for (const mobile of process.argv.includes("--quick")
    ? [false]
    : [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      deviceScaleFactor: mobile ? 3 : 1.5,
      isMobile: mobile,
      hasTouch: mobile,
    });
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (e) => {
      if (e.type() === "error") report.errors.push(e.text());
    });
    await openGameAudit(page);
    await page.click("#play-button");
    await page.waitForFunction(
      () => window.__vesper?.state === "playing",
      null,
      { timeout: 60000 },
    );
    await page.addStyleTag({
      content:
        "#announcement,#toast-container,#wave-status{visibility:hidden!important}",
    });
    for (const map of process.argv.includes("--profile")
      ? ["abbey"]
      : ["abbey", "station", "abyss"]) {
      if (map !== "abbey")
        await page.evaluate(
          async ({ map, mobile }) =>
            window.__vesper.start(map, "normal", mobile),
          { map, mobile },
        );
      await page.evaluate(() => {
        const g = window.__vesper;
        g.phaseTimer = 1e6;
        g.player.invulnerable = 1e8;
        g.world.doors.forEach((d) => g.world.openDoor(d));
        g.updateNavigation(true);
        g.world.setPower();
        g.player.position.set(0, 1.7, g.map === "abyss" ? 32 : 18);
        g.yaw = -0.18;
        g.pitch = 0.07;
        g.weapons[0].id = "spectre";
        g.setGun();
      });
      await page.waitForTimeout(4200);
      await page.screenshot({
        path: `${out}/${map}-${mobile ? "mobile" : "desktop"}.png`,
      });
      const state = await page.evaluate(() => {
        const g = window.__vesper;
        return {
          probe: !!g.mapEnvironment?.texture,
          geometry: g.renderer.info.memory.geometries,
          textures: g.renderer.info.memory.textures,
          ao: g.ao.enabled,
          ratio: g.renderSize.ratio,
        };
      });
      assert(state.probe, "Map reflection probe exists");
      assert(!mobile || !state.ao, "No desktop GTAO on mobile");
      const renderingChecks = await page.evaluate(() => {
        const g = window.__vesper,
          sprites = [];
        g.scene.traverse((o) => {
          if (o.isSprite) sprites.push([o, o.visible]);
        });
        g.ao._overrideVisibility();
        const excluded = sprites.every(([o]) => !o.visible);
        g.ao._restoreVisibility();
        return {
          aoTransparency:
            excluded && sprites.every(([o, visible]) => o.visible === visible),
          probeBound: g.scene.environment === g.mapEnvironment.texture,
          batchedGate:
            g.map === "abyss" ||
            g.world.doors[0].bars.children.filter((o) => o.isMesh).length <= 3,
          sunShadowOnce: !g.renderer.shadowMap.autoUpdate,
        };
      });
      for (const [name, ok] of Object.entries(renderingChecks)) {
        assert(ok, `${map}/${mobile}: ${name}`);
        report.checks.push(`${map}/${mobile}: ${name}`);
      }
      if (!process.argv.includes("--captures")) {
        await page.evaluate(() => {
          const g = window.__vesper;
          g.yaw = 0;
          g.pitch = 0.025;
          while (g.enemies.length < 28) {
            const i = g.enemies.length;
            g.spawnEnemy(
              ["walker", "runner", "brute", "spitter", "wraith"][i % 5],
              g.player.position
                .clone()
                .set(
                  ((i % 7) - 3) * 1.6,
                  0,
                  g.player.position.z - 6 - Math.floor(i / 7) * 2.4,
                ),
            );
            const e = g.enemies.at(-1);
            e.model.position.y = 0;
            e.stagger = 1e6;
          }
        });
        await page.waitForTimeout(700);
        if (process.argv.includes("--profile"))
          console.log(
            await page.evaluate(async () => {
              const g = window.__vesper,
                r = g.renderer,
                original = r.render,
                passes = [];
              r.info.autoReset = false;
              r.render = function (scene, camera) {
                const before = r.info.render.calls,
                  t = r.info.render.triangles;
                const result = original.apply(this, arguments);
                passes.push({
                  world: scene === g.scene,
                  view: scene === g.viewScene,
                  override: scene.overrideMaterial?.type,
                  calls: r.info.render.calls - before,
                  triangles: r.info.render.triangles - t,
                });
                return result;
              };
              await new Promise(requestAnimationFrame);
              r.render = original;
              r.info.autoReset = true;
              return passes;
            }),
          );
        await page.screenshot({
          path: `${out}/${map}-${mobile ? "mobile" : "desktop"}-horde.png`,
        });
        for (const quality of process.argv.includes("--quick")
          ? ["high"]
          : ["high", "medium", "low"]) {
          await page.evaluate((q) => {
            const g = window.__vesper;
            g.applySettings({ ...g.settings, quality: q });
          }, quality);
          // Let the adaptive controller settle under the sustained horde load.
          // Short captures alone otherwise only measure the initial full scale.
          await page.waitForTimeout(quality === "high" ? 12000 : 1000);
          const stats = await page.evaluate(async () => {
            const g = window.__vesper,
              frames = [];
            let last = performance.now();
            g.renderer.info.autoReset = false;
            g.renderer.info.reset();
            for (let i = 0; i < 90; i++) {
              await new Promise(requestAnimationFrame);
              const t = performance.now();
              frames.push(t - last);
              last = t;
            }
            frames.sort((a, b) => a - b);
            const result = {
              fps: Math.round(1000 / frames[45]),
              p95: Math.round(frames[85] * 10) / 10,
              calls: Math.round(g.renderer.info.render.calls / 90),
              triangles: Math.round(g.renderer.info.render.triangles / 90),
              ratio: g.renderSize.ratio,
              ao: g.ao.enabled,
              geometry: g.renderer.info.memory.geometries,
              textures: g.renderer.info.memory.textures,
            };
            g.renderer.info.autoReset = true;
            return result;
          });
          report.scenes.push({ map, mobile, quality, ...stats });
          console.log(JSON.stringify(report.scenes.at(-1)));
          if (quality === "high")
            await page.screenshot({
              path: `${out}/${map}-${mobile ? "mobile" : "desktop"}-horde-settled.png`,
            });
        }
      } else {
        report.scenes.push({ map, mobile, ...state });
        console.log(JSON.stringify(report.scenes.at(-1)));
      }
      await page.evaluate(() => {
        const g = window.__vesper;
        g.applySettings({ ...g.settings, quality: "high" });
      });
    }
    if (!mobile && !process.argv.includes("--captures")) {
      const adaptive = await page.evaluate(async () => {
        const g = window.__vesper;
        g.applySettings({ ...g.settings, adaptiveQuality: true });
        g.mobileFrameMs = 50;
        g.resolutionTimer = 2.6;
        g.time = 100;
        const before = g.desktopResolutionScale;
        await new Promise(requestAnimationFrame);
        const responded = g.desktopResolutionScale < before;
        g.applySettings({ ...g.settings, adaptiveQuality: false });
        g.mobileFrameMs = 50;
        g.resolutionTimer = 2.6;
        await new Promise(requestAnimationFrame);
        const disabled = g.desktopResolutionScale === 1;
        g.applySettings({ ...g.settings, adaptiveQuality: true });
        const oldProbe = g.mapEnvironment;
        let disposed = false;
        oldProbe.addEventListener("dispose", () => {
          disposed = true;
        });
        g.menu();
        return {
          responded,
          disabled,
          probeReleased: disposed && !g.mapEnvironment,
          contactsReleased: !g.contactShadows,
        };
      });
      for (const [name, ok] of Object.entries(adaptive)) {
        assert(ok, name);
        report.checks.push(name);
      }
    }
    await page.close();
  }
  assert.deepEqual(
    report.errors,
    [],
    "No JavaScript, shader or resource errors",
  );
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  writeRemasterGallery(report);
  console.log(out);
  await browser.close();
}
