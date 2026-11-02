import { chromiumOptions } from "./browser.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
});
const page = await browser.newPage();
const url = process.env.VESPER_URL || "http://localhost:5180/";
const out = `artifacts/menu-audit-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const failures = [];
let count = 0;
try {
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  for (const width of [
    320, 375, 390, 430, 568, 600, 601, 667, 768, 820, 844, 899, 900, 901, 1024,
    1100, 1101, 1280, 1440, 1489, 1600, 1920, 2560,
  ])
    for (const height of [
      320, 375, 390, 560, 561, 650, 700, 768, 780, 781, 809, 810, 850, 851, 900,
      1080, 1180,
    ]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const a = document.querySelector(".hero-copy").getBoundingClientRect(),
          b = document.querySelector(".deployment").getBoundingClientRect(),
          c = document.querySelector(".menu-footer").getBoundingClientRect();
        const overlaps = (a, b) =>
          a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          launchCards: overlaps(a, b),
          cardsFooter: overlaps(b, c),
          launchFooter: overlaps(a, c),
          cardContent: [...document.querySelectorAll(".map-card")].some(
            (card) => {
              const frame = card.getBoundingClientRect();
              const number = card
                .querySelector(".map-number")
                .getBoundingClientRect();
              const copy = card
                .querySelector(".map-card-copy")
                .getBoundingClientRect();
              const title = card.querySelector("h2").getBoundingClientRect();
              return (
                overlaps(number, copy) ||
                title.top < frame.top ||
                title.bottom > frame.bottom ||
                title.right > frame.right
              );
            },
          ),
        };
      });
      count++;
      if (Object.values(layout).some(Boolean))
        failures.push({ width, height, ...layout });
    }
  for (const [width, height] of [
    [844, 390],
    [900, 780],
    [1024, 650],
    [568, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `${out}/menu-${width}x${height}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(
    failures,
    [],
    "Menu content must not overlap at responsive breakpoints",
  );
  console.log(`PASS ${count} viewport combinations`);
} finally {
  fs.writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ url, count, failures }, null, 2),
  );
  console.log("Artifacts:", out);
  await browser.close();
}
