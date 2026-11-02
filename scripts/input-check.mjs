import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { openGameAudit } from "./game-audit.mjs";
import { createStaticServer } from "./serve.mjs";

const out = `artifacts/input-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [] };
const server = process.env.VESPER_URL ? null : createStaticServer();
if (server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  process.env.VESPER_URL = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => report.errors.push(e.message));
const check = (name, ok, detail) => {
  report.checks.push({ name, passed: !!ok, detail });
  console.log(ok ? "PASS" : "FAIL", name, JSON.stringify(detail ?? ""));
};
const clear = async () => {
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__weaponSwitches.length = window.__wheelEvents.length = 0;
  });
};
const observed = () =>
  page.evaluate(() => ({
    slot: window.__vesper.slot,
    changes: window.__weaponSwitches,
    wheels: window.__wheelEvents,
  }));
const synthetic = (events) =>
  page.evaluate((events) => {
    for (const init of events)
      window.__vesper.canvas.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }),
      );
  }, events);
try {
  await openGameAudit(page);
  await page.click("#play-button");
  await page.waitForFunction(() => window.__vesper?.state === "playing", null, {
    timeout: 90000,
  });
  if (!(await page.evaluate(() => !!document.pointerLockElement)))
    await page.mouse.click(640, 360);
  await page.waitForFunction(() => !!document.pointerLockElement);
  await page.evaluate(async () => {
    const g = window.__vesper;
    g.phaseTimer = 3600;
    g.player.invulnerable = 1e9;
    await g.viewModel.load("spectre", 0);
    g.interactions.receiveWeapon("spectre");
    window.__weaponSwitches = [];
    window.__wheelEvents = [];
    const original = g.combat.switchWeapon.bind(g.combat);
    g.combat.switchWeapon = (slot) => {
      const before = g.slot;
      original(slot);
      if (g.slot !== before)
        window.__weaponSwitches.push({ from: before, to: g.slot });
    };
    g.canvas.addEventListener("wheel", (e) => {
      window.__wheelEvents.push({
        x: e.deltaX,
        y: e.deltaY,
        mode: e.deltaMode,
        trusted: e.isTrusted,
      });
    });
  });
  await page.keyboard.down("KeyW");
  await clear();
  await page.waitForTimeout(250);
  check(
    "Walking alone does not switch weapons",
    (await observed()).changes.length === 0,
  );
  await page.mouse.wheel(0, 1);
  await page.waitForTimeout(100);
  let result = await observed();
  check(
    "A native one-pixel wheel impulse cannot change weapons while walking",
    result.changes.length === 0 && result.wheels.some((e) => e.trusted),
    result,
  );
  await clear();
  await page.mouse.wheel(80, 0);
  await page.waitForTimeout(100);
  result = await observed();
  check(
    "Native horizontal scrolling cannot change weapons",
    result.changes.length === 0,
    result,
  );
  await clear();
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(100);
  result = await observed();
  check(
    "An intentional native vertical scroll switches once while walking",
    result.changes.length === 1,
    result,
  );
  await clear();
  await page.mouse.wheel(0, 100);
  for (const delta of [40, 20, 8, 3, 1]) {
    await page.waitForTimeout(35);
    await page.mouse.wheel(0, delta);
  }
  await page.waitForTimeout(100);
  result = await observed();
  check(
    "A scroll and its inertia tail produce one weapon switch",
    result.changes.length === 1,
    result,
  );
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyW");
  await page.keyboard.down("Space");
  await clear();
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(100);
  result = await observed();
  check(
    "Deliberate scrolling also works while sprinting",
    result.changes.length === 1,
    result,
  );
  await page.keyboard.up("Space");
  await page.keyboard.up("KeyW");
  for (const [label, events, count] of [
    [
      "Zero and tiny alternating deltas are ignored",
      [{ deltaY: 0 }, { deltaY: 1 }, { deltaY: -1 }, { deltaY: 0.1 }],
      0,
    ],
    [
      "A diagonal horizontal gesture is ignored",
      [{ deltaX: 80, deltaY: 2 }],
      0,
    ],
    ["Pinch zoom is ignored", [{ deltaY: 100, ctrlKey: true }], 0],
    ["A line-mode wheel notch works", [{ deltaY: 1, deltaMode: 1 }], 1],
    ["A page-mode wheel notch works", [{ deltaY: -1, deltaMode: 2 }], 1],
    [
      "A high-resolution vertical gesture accumulates",
      Array(8).fill({ deltaY: 2 }),
      1,
    ],
  ]) {
    await clear();
    await synthetic(events);
    result = await observed();
    check(label, result.changes.length === count, result);
  }
  await clear();
  await page.keyboard.press("Digit1");
  await page.keyboard.press("Digit2");
  check(
    "Keyboard slots remain directly selectable",
    (await observed()).slot === 1,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__vesper.state === "paused");
  await clear();
  await synthetic([{ deltaY: 100 }]);
  check(
    "Paused gameplay ignores the wheel",
    (await observed()).changes.length === 0,
  );
  check("No browser errors", report.errors.length === 0, report.errors);
  assert(
    report.checks.every((c) => c.passed),
    "Input regression checks failed",
  );
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  console.log("Report:", out);
}
