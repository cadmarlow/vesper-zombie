import { chromiumOptions } from "./browser.mjs";
import { openGameAudit } from "./game-audit.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  external = [],
  checks = [];
const BUILD_URL = process.env.VESPER_URL || "http://localhost:4173";

const out = `artifacts/release-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("request", (r) => {
  const u = new URL(r.url());
  if (!["localhost", "127.0.0.1", ""].includes(u.hostname))
    external.push(r.url());
});
const check = (name, condition) => {
  assert(condition, name);
  checks.push(name);
  console.log("PASS", name);
};
try {
  for (const [width, height] of [
    [1489, 855],
    [1440, 851],
    [1600, 900],
    [1920, 1080],
    [1440, 900],
    [1440, 768],
    [1280, 720],
    [1024, 768],
    [820, 1180],
    [390, 844],
    [375, 667],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(BUILD_URL);
    const layout = await page.evaluate(() => {
      const ids = [".hero-copy", "#play-button", ".deployment", ".menu-footer"];
      const b = Object.fromEntries(
        ids.map((id) => {
          const r = document.querySelector(id).getBoundingClientRect();
          return [id, { x: r.x, y: r.y, right: r.right, bottom: r.bottom }];
        }),
      );
      const a = b[".hero-copy"],
        d = b[".deployment"];
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        overlap:
          a.x < d.right && a.right > d.x && a.y < d.bottom && a.bottom > d.y,
      };
    });
    check(
      `Menu layout ${width}×${height}`,
      !layout.overflow && !layout.overlap,
    );
    if (width === 844 || width === 375 || width === 1489 || width === 1600)
      await page.screenshot({ path: `${out}/menu-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BUILD_URL);
  check(
    "Production build has no debug API",
    await page.evaluate(() => window.__vesper === undefined),
  );
  await page.click("#play-button");
  await page.waitForSelector("#hud:not(.hidden)");
  await page.waitForTimeout(600);
  check(
    "Production gameplay starts",
    (await page.locator("#ammo-value").innerText()) === "12",
  );
  await page.mouse.click(720, 450);
  await page.waitForTimeout(120);
  check(
    "Production gun fires",
    (await page.locator("#ammo-value").innerText()) === "11",
  );
  await page.keyboard.press("KeyN");
  await page.waitForTimeout(1800);
  check(
    "Production wave starts",
    (await page.locator("#wave-number").innerText()) === "01",
  );
  await page.screenshot({ path: `${out}/production-abbey.png` });
  await page.keyboard.press("Escape");
  check("Production pause works", await page.locator("#pause").isVisible());
  check("All production assets are local", external.length === 0);
  process.env.VESPER_URL ||= BUILD_URL;
  await openGameAudit(page);
  await page.click("#play-button");
  await page.waitForFunction(() => window.__vesper?.state === "playing");
  await page.evaluate(() => {
    const g = window.__vesper;
    g.weapons = [{ id: "longinus", ammo: 6, reserve: 48, level: 0 }];
    g.slot = 0;
    g.setGun();
    g.phaseTimer = 1000;
  });
  await page.mouse.down({ button: "right" });
  // The final pass draws the scope once the rifle reaches the eye (the
  // real model is raised first; the stand-in snaps on at once).
  const scoped = await page
    .waitForFunction(
      () =>
        window.__vesper.film.uniforms.scope.value === 1 &&
        !window.__vesper.gun.visible,
      null,
      { timeout: 2500 },
    )
    .then(() => true)
    .catch(() => false);
  check("Sniper scope is clear and the obstructing weapon is hidden", scoped);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/sniper.png` });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(120);
  check(
    "Leaving the scope restores weapon view",
    await page.evaluate(
      () =>
        window.__vesper.film.uniforms.scope.value === 0 &&
        window.__vesper.gun.visible,
    ),
  );
  check("No release errors", errors.length === 0);
  fs.writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ checks, errors, external }, null, 2),
  );
  console.log("Artifacts:", out);
} catch (e) {
  console.error(e);
  console.error(errors);
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
