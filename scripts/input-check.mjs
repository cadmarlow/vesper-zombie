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
const controller = (down = [], axes = [0, 0, 0, 0]) =>
  page.evaluate(
    ({ down, axes }) => {
      const pad = {
        connected: true,
        index: 2,
        mapping: "standard",
        axes,
        buttons: Array.from({ length: 17 }, (_, i) => ({
          pressed: down.includes(i) && i !== 6 && i !== 7,
          value: down.includes(i) ? 0.8 : 0,
        })),
      };
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => [null, null, pad],
      });
    },
    { down, axes },
  );
const advance = async (seconds) => {
  const time = await page.evaluate(() => window.__vesper.time);
  await page.waitForFunction(
    (target) => window.__vesper.time >= target,
    time + seconds,
  );
};
const shots = () => page.evaluate(() => window.__vesper.player.shots);
try {
  await openGameAudit(page);
  await page.click("#fullscreen-button");
  await page.waitForFunction(
    () => document.fullscreenElement === document.documentElement,
  );
  await page.click("#fullscreen-button");
  await page.waitForFunction(() => !document.fullscreenElement);
  check("The main menu can enter and exit fullscreen", true);
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
  const pausedTime = await page.evaluate(() => window.__vesper.time);
  await page.getByRole("button", { name: "PLEIN ÉCRAN", exact: true }).click();
  await page.waitForFunction(
    () => document.fullscreenElement === document.documentElement,
  );
  await page
    .getByRole("button", { name: "MODE FENÊTRÉ", exact: true })
    .waitFor();
  await page.evaluate(() => document.exitFullscreen());
  await page
    .getByRole("button", { name: "PLEIN ÉCRAN", exact: true })
    .waitFor();
  check(
    "Pause restores fullscreen and updates after the browser exits it",
    await page.evaluate(
      (time) =>
        window.__vesper.state === "paused" && window.__vesper.time === time,
      pausedTime,
    ),
  );
  await clear();
  await synthetic([{ deltaY: 100 }]);
  check(
    "Paused gameplay ignores the wheel",
    (await observed()).changes.length === 0,
  );
  const beforeResume = await shots();
  await controller([7, 9], [0.04, -0.05, 0.06, -0.03]);
  await page.waitForFunction(() => window.__vesper.state === "playing");
  const atRest = () =>
    page.evaluate(() => {
      const g = window.__vesper;
      return [g.player.position.x, g.player.position.z, g.yaw, g.pitch];
    });
  const resting = await atRest();
  await controller([7], [0.04, -0.05, 0.06, -0.03]);
  await advance(0.3);
  check(
    "Menu resumes without pointer lock, stick drift or a held trigger firing",
    (await shots()) === beforeResume &&
      JSON.stringify(await atRest()) === JSON.stringify(resting) &&
      !(await page.evaluate(() => !!document.pointerLockElement)),
  );
  await controller([10], [0, -0.8, 0.6, -0.35]);
  await page.waitForFunction(() => window.__vesper.player.sprinting);
  await controller([], [0, -0.8, 0.6, -0.35]);
  await advance(0.15);
  const moved = await atRest();
  check(
    "Both sticks move the player and camera, and LS starts sprinting with a click",
    Math.hypot(moved[0] - resting[0], moved[1] - resting[1]) > 0.1 &&
      moved[2] < resting[2] &&
      moved[3] > resting[3] &&
      (await page.evaluate(() => window.__vesper.player.sprinting)),
  );
  await controller([3]);
  await page.waitForFunction(() => window.__vesper.slot === 0);
  await advance(0.65);
  check("Holding Y switches once", (await observed()).slot === 0);
  await controller([6]);
  await page.waitForFunction(() => window.__vesper.run.aiming);
  await controller([6, 7]);
  await advance(0.5);
  check(
    "LT aims and held RT shoots the pistol once",
    (await shots()) === beforeResume + 1,
  );
  await controller();
  await page.waitForFunction(() => !window.__vesper.run.aiming);
  await page.evaluate(() => {
    const g = window.__vesper;
    g.player.position.copy(g.world.spawn);
  });
  await controller([2]);
  await page.waitForFunction(() => window.__vesper.reloadTime > 0);
  check("X reloads away from an interaction", true);
  await controller();
  await page.evaluate(() => {
    const g = window.__vesper;
    const gate = g.world.interactions.find((i) => i.kind === "door");
    g.player.points = 2000;
    g.player.position.copy(gate.position).setY(g.world.spawn.y);
  });
  await advance(0.07);
  await controller([2]);
  await page.waitForFunction(() =>
    window.__vesper.world.doors.some((d) => d.open),
  );
  check("X uses a nearby interaction", true);
  await controller([3]);
  await page.waitForFunction(() => window.__vesper.slot === 1);
  await advance(0.65);
  const beforeAuto = await shots();
  await controller([7]);
  await page.waitForFunction(
    (before) => window.__vesper.player.shots >= before + 3,
    beforeAuto,
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "getGamepads", { value: () => [] });
  });
  await page.waitForFunction(() => !window.__vesper.input.gamepad.fire);
  const disconnected = await shots();
  await advance(0.3);
  check(
    "RT sustains automatic fire and disconnect stops it",
    (await shots()) === disconnected,
  );
  await controller([1]);
  await page.waitForFunction(() => window.__vesper.player.crouched);
  await controller([0]);
  await page.waitForFunction(
    () => !window.__vesper.player.grounded && !window.__vesper.player.crouched,
  );
  check("B crouches and A jumps", true);
  const grenades = await page.evaluate(() => window.__vesper.player.grenades);
  await controller([5]);
  await page.waitForFunction(
    (before) => window.__vesper.player.grenades === before - 1,
    grenades,
  );
  await controller([11]);
  await page.waitForFunction(() => window.__vesper.meleeTimer > 0);
  check("RB throws a grenade and RS uses the knife", true);
  await controller([9]);
  await page.waitForFunction(() => window.__vesper.state === "paused");
  check("Menu pauses the game without a mouse", true);
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
