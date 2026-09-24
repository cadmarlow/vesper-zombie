import { chromiumOptions } from "./browser.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { openGameAudit } from "./game-audit.mjs";
process.env.VESPER_URL ||= "http://localhost:4173";
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const out = `artifacts/graphics-lifecycle-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [], memory: [] };
const check = (name, ok) => {
  assert(ok, name);
  report.checks.push(name);
  console.log("PASS", name);
};
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1280, height: 800 },
      hasTouch: mobile,
      isMobile: mobile,
    });
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
    });
    await openGameAudit(page);
    await page.click("#play-button");
    await page.waitForFunction(() => window.__vesper?.state === "playing");
    await page.evaluate(() => {
      const g = window.__vesper;
      g.phaseTimer = 10000;
      g.player.invulnerable = 1e8;
    });
    check(
      `${mobile}: correct texture resolution loaded`,
      await page.evaluate((mobile) => {
        const wanted = mobile ? 512 : 1024,
          urls = performance
            .getEntriesByType("resource")
            .filter((r) => r.name.includes("/textures/"))
            .map((r) => r.name);
        return (
          urls.length === 24 &&
          urls.every((url) => url.endsWith(`-${wanted}.webp`))
        );
      }, mobile),
    );
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(() => {
        const g = window.__vesper;
        for (let i = 0; i < 10; i++) {
          g.spawnEnemy(
            ["walker", "runner", "brute", "spitter", "wraith"][i % 5],
            g.player.position
              .clone()
              .set(((i % 5) - 2) * 1.5, 0, 13 - Math.floor(i / 5) * 2),
          );
          g.enemies.at(-1).model.position.y = 0;
        }
      });
      await page.waitForTimeout(300);
      check(
        `${mobile}: independent finite skinned characters, cycle ${cycle}`,
        await page.evaluate(() => {
          const e = window.__vesper.enemies,
            a = e[0].model.userData.arms[0],
            b = e[5].model.userData.arms[0];
          let ok = a !== b;
          a.rotation.x = 0.4;
          ok &&= b.rotation.x !== a.rotation.x;
          for (const enemy of e)
            enemy.model.traverse((o) => {
              if (o.isSkinnedMesh)
                ok &&= o.skeleton.bones.every((b) =>
                  b.matrixWorld.elements.every(Number.isFinite),
                );
            });
          return ok;
        }),
      );
      await page.evaluate(() => {
        const g = window.__vesper;
        for (const e of g.enemies) g.damageEnemy(e, 1e8, true);
      });
      // Corpses stay a few seconds (longer for motion-captured bodies).
      await page.waitForFunction(
        () => window.__vesper.enemies.length === 0,
        null,
        {
          timeout: 12000,
        },
      );
      await page.evaluate(() => {
        const g = window.__vesper;
        for (const p of g.pickups) p.life = 0;
        g.updateEffects(0.01);
      });
      await page.waitForTimeout(120);
      const memory = await page.evaluate(() => ({
        enemies: window.__vesper.enemies.length,
        ...window.__vesper.renderer.info.memory,
      }));
      report.memory.push({ mobile, cycle, ...memory });
      check(
        `${mobile}: dead bodies removed, cycle ${cycle}`,
        memory.enemies === 0,
      );
    }
    const cycles = report.memory.filter((m) => m.mobile === mobile);
    check(
      `${mobile}: repeated hordes do not leak GPU textures`,
      cycles[2].textures <= cycles[0].textures + 1,
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      g.burst(g.player.position.clone().set(0, 1, 16), 0xa47755, 16, 0.5);
    });
    await page.waitForTimeout(100);
    const before = await page.evaluate(
      () => window.__vesper.renderer.info.memory.geometries,
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      for (let i = 0; i < 500; i++)
        g.burst(g.player.position.clone().set(0, 1, 16), 0xa47755, 16, 0.5);
    });
    await page.waitForTimeout(100);
    check(
      `${mobile}: 8,000 impact particles reuse fixed geometry`,
      await page.evaluate(
        (before) => window.__vesper.renderer.info.memory.geometries === before,
        before,
      ),
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      g.pitch = -0.65;
      g.yaw = 0;
      g.mouse.fire = false;
      g.shotTimer = 0;
      g.weapon.ammo = 12;
    });
    await page.waitForTimeout(80);
    await page.evaluate(() => window.__vesper.shoot());
    check(
      `${mobile}: real shot ejects a casing and marks the ground`,
      await page.evaluate(() => {
        const fx = window.__vesper.combatEffects;
        return fx.casingCursor > 0 && fx.markCursor > 0;
      }),
    );
    await page.screenshot({
      path: `${out}/impact-${mobile ? "mobile" : "desktop"}.png`,
    });
    for (const quality of ["low", "high", "medium", "high"]) {
      await page.evaluate(
        (q) =>
          window.__vesper.applySettings({
            ...window.__vesper.settings,
            quality: q,
          }),
        quality,
      );
      await page.waitForTimeout(80);
      check(
        `${mobile}: ${quality} quality changes safely`,
        await page.evaluate(() => {
          const g = window.__vesper;
          return (
            g.renderer.info.render.calls > 0 && Number.isFinite(g.camera.aspect)
          );
        }),
      );
    }
    await page.close();
  }
  check("No browser, shader or texture errors", report.errors.length === 0);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(out);
  await browser.close();
}
