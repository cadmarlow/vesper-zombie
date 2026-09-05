import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const url = process.env.VESPER_URL || "http://localhost:4173";
const out = `artifacts/mobile-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
const check = (label, ok) => {
  assert(ok, label);
  checks.push(label);
};
let page;
try {
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
    [568, 320],
    [667, 375],
    [844, 390],
    [932, 430],
    [820, 1180],
  ]) {
    page = await browser.newPage({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    page.on("pageerror", (e) => errors.push(e.message));
    for (const map of ["abbey", "station"]) {
      const label = `${map} ${width}×${height}`;
      await page.goto(url);
      await page.locator("#controls-button").scrollIntoViewIfNeeded();
      await page.locator("#controls-button").tap();
      check(
        `${label}: menu guide accessible`,
        await page.locator("#panel").isVisible(),
      );
      await page.locator("#close-panel").tap();
      await page.locator(`[data-map="${map}"]`).tap();
      check(
        `${label}: no horizontal overflow`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.locator("#play-button").tap();
      await page.locator("#touch-controls:not(.hidden)").waitFor();
      const targets = await page.evaluate(() => {
        return [
          document.querySelector("#touch-move"),
          ...document.querySelectorAll(".hud-tools button, [data-action]"),
        ].map((e) => {
          const r = e.getBoundingClientRect();
          const hit = (x, y) => {
            const at = document.elementFromPoint(x, y);
            return e === at || e.contains(at);
          };
          return {
            id: e.id || e.dataset.action,
            inside:
              r.x >= 0 &&
              r.y >= 0 &&
              r.right <= innerWidth &&
              r.bottom <= innerHeight,
            large: r.width >= 44 && r.height >= 44,
            reachable: [
              [0.5, 0.5],
              [0.25, 0.25],
              [0.75, 0.25],
              [0.25, 0.75],
              [0.75, 0.75],
            ].every(([x, y]) => hit(r.x + r.width * x, r.y + r.height * y)),
          };
        });
      });
      for (const t of targets)
        check(
          `${label}: ${t.id} on screen, touchable, at least 44px`,
          t.inside && t.large && t.reachable,
        );
      await page.locator('[data-action="fire"]').tap();
      await page.waitForFunction(
        () => Number(document.querySelector("#ammo-value").textContent) < 12,
      );
      check(`${label}: touch fire consumes ammo`, true);
      await page.locator('[data-action="reload"]').tap();
      await page.waitForFunction(
        () => document.querySelector("#ammo-value").textContent === "12",
      );
      check(`${label}: touch reload refills magazine`, true);
      await page.screenshot({ path: `${out}/${map}-${width}x${height}.png` });
      await page.locator("#hud-pause").tap();
      check(
        `${label}: touch pause opens`,
        await page.locator("#pause").isVisible(),
      );
      await page.locator("#resume-button").tap();
      await page.locator("#hud-help").tap();
      check(
        `${label}: in-game guide opens`,
        await page.locator("#panel").isVisible(),
      );
      await page.locator("#close-panel").tap();
      if (await page.locator("#pause").isVisible())
        await page.locator("#resume-button").tap();
      await page.setViewportSize({ width: height, height: width });
      await page.locator("#hud-pause").tap();
      check(
        `${label}: pause still works after rotation`,
        await page.locator("#pause").isVisible(),
      );
      await page.setViewportSize({ width, height });
      console.log("PASS", label);
    }
    await page.close();
  }
  check("No JavaScript errors", errors.length === 0);
} catch (e) {
  console.error(e);
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(`${checks.length} checks; artifacts: ${out}`);
  await browser.close();
}
