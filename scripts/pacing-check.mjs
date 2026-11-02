import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { openGameAudit } from "./game-audit.mjs";
import { createStaticServer } from "./serve.mjs";

const server = process.env.VESPER_URL ? null : createStaticServer();
if (server)
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
process.env.VESPER_URL ||= `http://127.0.0.1:${server.address().port}`;
const out = `artifacts/pacing-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [], motion: null, layouts: [] };
const check = (name, condition) => {
  assert(condition, name);
  report.checks.push(name);
  console.log("PASS", name);
};
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  for (const mobile of [false, true]) {
    const profile = mobile ? "mobile" : "desktop";
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      hasTouch: mobile,
      isMobile: mobile,
    });
    page.on("pageerror", (error) => report.errors.push(error.message));
    await openGameAudit(page);
    await page.click("#play-button");
    await page.waitForFunction(
      () => window.__vesper?.state === "playing",
      null,
      {
        timeout: 90000,
      },
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      g.phaseTimer = 1e6;
      g.player.invulnerable = 1e6;
    });
    if (!mobile) {
      report.motion = await page.evaluate(() => {
        const g = window.__vesper;
        g.state = "audit";
        g.wave = 1;
        g.phase = "wave";
        g.remaining = 1;
        g.player.position.set(0, 1.7, 20);
        g.updateNavigation();
        for (const x of [-2, 2, 5]) {
          g.spawnEnemy("walker", g.player.position.clone().set(x, 0, 14));
          const e = g.enemies.at(-1);
          e.model.position.y = 0;
          e.speedFactor = 0.52;
        }
        const step = (seconds) => {
          for (let i = 0; i < seconds * 60; i++) {
            g.time += 1 / 60;
            g.updateEnemies(1 / 60);
          }
          const e = g.enemies[0];
          return {
            speed: Math.hypot(e.velocityX, e.velocityZ),
            clip: e.model.userData.horde.anim.move.getClip().name,
            hurrying: e.hurrying,
          };
        };
        const pending = step(0.2);
        g.remaining = 0;
        const three = step(0.2);
        g.damageEnemy(g.enemies[2], 1e9, false);
        const two = step(0.6);
        g.damageEnemy(g.enemies[1], 1e9, false);
        const one = step(0.2);
        // Trigger the reverse transition too, as when a test/next wave resets.
        g.phase = "rest";
        const rest = step(0.2);
        g.state = "playing";
        g.phaseTimer = 1e6;
        return { pending, three, two, one, rest };
      });
      const { pending, three, two, one, rest } = report.motion;
      check(
        "Queued spawns and three living zombies retain the early slow walk",
        pending.speed < 1 && three.speed < 1,
      );
      check(
        "Two remaining walkers run with an actual running clip",
        two.speed > 3 && two.clip.startsWith("run_") && two.hurrying,
      );
      check(
        "The last walker keeps running",
        one.speed > 3 && one.clip.startsWith("run_"),
      );
      check(
        "The next rest restores the original walking animation",
        rest.speed < 1 && rest.clip.startsWith("walk_") && !rest.hurrying,
      );
    }
    await page.evaluate(() => {
      const g = window.__vesper;
      g.phase = "rest";
      g.phaseTimer = 1e6;
      g.announce({
        title: "VAGUE 01",
        eyebrow: "LA HORDE APPROCHE",
        subtitle: "Restez en mouvement.",
        duration: 11000,
      });
    });
    check(
      `${profile}: wave announcement uses the shared notice`,
      (await page.locator("#toast-container strong").textContent()) ===
        "VAGUE 01",
    );
    check(
      `${profile}: no large announcement remains`,
      (await page.locator("#announcement").count()) === 0,
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      g.drop(g.player.position, "ammo");
      const pickup = g.pickups.at(-1);
      pickup.mesh.position.copy(g.player.position);
      g.updateEffects(0.01);
    });
    check(
      `${profile}: max ammo replaces the wave announcement immediately`,
      (await page.locator("#toast-container strong").textContent()) ===
        "Munitions maximales",
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      const door = g.world.interactions.find((i) => i.kind === "door");
      g.player.position.set(door.position.x, 1.7, door.position.z + 1);
      g.updateHUD();
    });
    const prompt = mobile ? "#mobile-interact" : "#interaction";
    await page.locator(prompt).waitFor({ state: "visible" });
    const layout = await page.evaluate((prompt) => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
          right: r.right,
        };
      };
      return {
        width: innerWidth,
        height: innerHeight,
        prompt: rect(prompt),
        notice: rect("#toast-container"),
        font: getComputedStyle(document.querySelector(".toast strong"))
          .fontSize,
      };
    }, prompt);
    report.layouts.push({ profile, ...layout });
    check(
      `${profile}: prompt and notice are compact in the upper right`,
      [layout.prompt, layout.notice].every(
        (r) =>
          r.x > layout.width / 2 &&
          r.right <= layout.width &&
          r.bottom <= layout.height * 0.5 &&
          r.width <= 310,
      ),
    );
    check(
      `${profile}: the notice flows below the prompt without overlap`,
      layout.notice.y >= layout.prompt.bottom,
    );
    await page.screenshot({ path: `${out}/${profile}-feedback.png` });
    await page.waitForTimeout(2750);
    check(
      `${profile}: notice disappears promptly`,
      !(await page.locator("#toast-container").isVisible()),
    );
    check(
      `${profile}: contextual action stays available while in range`,
      await page.locator(prompt).isVisible(),
    );
    if (mobile) {
      await page.evaluate(() => {
        window.__vesper.player.points = 5000;
      });
      await page.locator(prompt).tap();
      check(
        "Mobile: the relocated interaction button really opens the door",
        await page.evaluate(() => window.__vesper.world.doors[0].open),
      );
    }
    await page.close();
  }
  check("No browser runtime errors", report.errors.length === 0);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  console.log("Report:", out);
}
