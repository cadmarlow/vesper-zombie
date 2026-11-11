import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { createStaticServer } from "./serve.mjs";
import { openGameAudit } from "./game-audit.mjs";

const out = process.env.RELIC_OUTPUT || "artifacts/reliquary";
fs.mkdirSync(out, { recursive: true });
const report = { views: [], errors: [] };
const server = createStaticServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.VESPER_URL = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  for (const touch of process.env.RELIC_DESKTOP_ONLY
    ? [false]
    : [false, true]) {
    const page = await browser.newPage({
      viewport: touch
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      isMobile: touch,
      hasTouch: touch,
    });
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
    });
    await openGameAudit(page);
    await page.click("#play-button");
    await page.waitForFunction(
      () => window.__vesper?.state === "playing",
      null,
      { timeout: 90000 },
    );
    for (const map of process.env.RELIC_FIRST_MAP
      ? ["abbey"]
      : ["abbey", "station", "abyss", "lacuna"]) {
      await page.evaluate(
        async ({ map, touch }) => {
          const g = window.__vesper;
          await g.start(map, "normal", touch);
          g.state = "audit";
          g.phaseTimer = 3600;
          g.player.invulnerable = 1e9;
          g.player.points = 50000;
          g.sound.setVolume(0);
          g.viewModel.hide();
          const b = g.world.interactions.find((i) => i.kind === "box");
          const front = b.position
            .clone()
            .set(0.48, 0, 1)
            .applyQuaternion(b.root.quaternion)
            .normalize();
          g.camera.position.copy(b.position).addScaledVector(front, 2.85);
          g.camera.position.y = 1.9;
          const target = b.position.clone();
          target.y = 1.12;
          g.camera.lookAt(target);
          g.camera.updateMatrixWorld(true);
          g.player.position.copy(g.camera.position);
          g.world.viewer = g.camera;
          g.time = 12;
          g.world.update(0.1, g.time);
          g.updateHUD();
          g.renderer.shadowMap.needsUpdate = true;
          g.composer.render();
        },
        { map, touch },
      );
      const capture = async (state) => {
        const info = await page.evaluate(() => {
          const g = window.__vesper,
            b = g.world.interactions.find((i) => i.kind === "box");
          g.updateHUD();
          g.renderer.info.autoReset = false;
          g.renderer.info.reset();
          g.renderer.shadowMap.needsUpdate = true;
          g.composer.render();
          let meshes = 0,
            triangles = 0;
          b.root.traverse((o) => {
            if (o.isMesh) {
              meshes++;
              triangles +=
                (o.geometry.index?.count ||
                  o.geometry.attributes.position.count) / 3;
            }
          });
          const card = document.querySelector("#reliquary-card");
          const rect = card.getBoundingClientRect();
          return {
            meshes,
            triangles,
            calls: g.renderer.info.render.calls,
            phase: card.dataset.phase,
            visible: !card.classList.contains("hidden"),
            bounds: {
              x: rect.x,
              y: rect.y,
              right: rect.right,
              bottom: rect.bottom,
            },
            lid: b.lid.rotation.x,
            cache: g.world.boxDisplays?.size || 0,
          };
        });
        assert(info.visible, "contextual card visible");
        assert(
          info.bounds.y >= 0 && info.bounds.bottom <= (touch ? 390 : 900),
          "card fits viewport",
        );
        assert(
          info.meshes < 80,
          "batched chest and weapon stay within draw budget",
        );
        const file = `${out}/${touch ? "mobile" : "desktop"}-${map}-${state}.png`;
        await page.waitForTimeout(300);
        await page.screenshot({ path: file });
        report.views.push({ map, touch, state, file, ...info });
        console.log(
          "PASS",
          map,
          touch ? "mobile" : "desktop",
          state,
          info.meshes,
          "meshes",
        );
      };
      await capture("idle");
      const spend = await page.evaluate(() => {
        const g = window.__vesper;
        g.state = "playing";
        g.interact();
        g.interact();
        g.state = "audit";
        return g.player.points;
      });
      assert.equal(spend, 49050, "double interaction spends exactly once");
      const step = (seconds) =>
        page.evaluate((seconds) => {
          const g = window.__vesper;
          for (let i = 0; i < Math.ceil(seconds * 30); i++) {
            g.time += 1 / 30;
            g.interactions.update(1 / 30);
            g.world.update(1 / 30, g.time);
          }
        }, seconds);
      await step(2);
      await capture("cycling");
      await step(3.2);
      await capture("offered");
      const taken = await page.evaluate(() => {
        const g = window.__vesper,
          b = g.world.interactions.find((i) => i.kind === "box");
        const id = b.offered;
        g.state = "playing";
        g.interact();
        g.state = "audit";
        return {
          id,
          weapon: g.weapons[g.slot].id,
          busy: b.busy,
          points: g.player.points,
          full: g.weapons[g.slot].ammo > 0,
        };
      });
      assert.equal(taken.id, taken.weapon);
      assert.equal(taken.busy, false);
      assert.equal(taken.points, 49050);
      assert(taken.full);
      await step(1);
      const closed = await page.evaluate(
        () =>
          window.__vesper.world.interactions.find((i) => i.kind === "box").lid
            .rotation.x,
      );
      assert(Math.abs(closed) < 0.03, "lid closes after collection");
      // Capture the authored legendary presentation without changing the live loot table.
      await page.evaluate(() => {
        const g = window.__vesper,
          b = g.world.interactions.find((i) => i.kind === "box");
        b.busy = true;
        b.timer = 0;
        b.offered = "eclipse";
        b.offerTimer = 18;
        g.world.showBoxWeapon("eclipse");
        g.viewModel.hide();
      });
      await step(0.6);
      await capture("legendary");
      await step(14.4);
      await capture("expiring");
      await step(4);
      const expired = await page.evaluate(() => {
        const g = window.__vesper,
          b = g.world.interactions.find((i) => i.kind === "box");
        return {
          busy: b.busy,
          display: !!b.display,
          outcome: b.outcome,
          points: g.player.points,
        };
      });
      assert.deepEqual(expired, {
        busy: false,
        display: false,
        outcome: 2,
        points: 49050,
      });
    }
    await page.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
