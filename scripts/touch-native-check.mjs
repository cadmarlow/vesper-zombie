import { chromium, webkit, devices } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openGameAudit } from "./game-audit.mjs";
process.env.VESPER_URL ||= "http://localhost:4173";
const out = `artifacts/touch-native-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = {
  url: process.env.VESPER_URL,
  checks: [],
  errors: [],
  performance: [],
};
function check(name, ok) {
  assert(ok, name);
  report.checks.push(name);
  console.log("PASS", name);
}
let page, browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await openGameAudit(page);
  await page.locator("#play-button").tap();
  check(
    "Portrait explains landscape before starting any wave",
    (await page.locator("#mobile-orientation").isVisible()) &&
      (await page.evaluate(() => !window.__vesper)),
  );
  await page.screenshot({ path: `${out}/rotate.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__vesper?.state === "playing");
  const cdp = await context.newCDPSession(page);
  async function fingers(type, points) {
    await cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(([id, x, y]) => ({
        id,
        x,
        y,
        radiusX: 7,
        radiusY: 7,
        force: 1,
      })),
    });
  }
  for (const map of ["abbey", "station", "abyss"]) {
    if (map !== "abbey")
      await page.evaluate(async (map) => {
        await window.__vesper.start(map, "normal", true);
      }, map);
    await page.evaluate(() => {
      const g = window.__vesper;
      g.phaseTimer = 1000;
      g.player.invulnerable = 1e8;
    });
    await page.waitForTimeout(700);
    check(
      `${map}: desktop HUD removed, no keyboard-letter action buttons`,
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".hud-bottom-right"))
            .display === "none" &&
          ![...document.querySelectorAll("[data-action]")].some((e) =>
            ["R", "E", "G", "V"].includes(e.textContent.trim()),
          ),
      ),
    );
    const fire = await page.locator('[data-action="fire"]').boundingBox();
    const fx = fire.x + fire.width / 2,
      fy = fire.y + fire.height / 2;
    const baseline = await page.evaluate(() => ({
      x: window.__vesper.player.position.x,
      z: window.__vesper.player.position.z,
      yaw: window.__vesper.yaw,
      ammo: window.__vesper.weapon.ammo,
    }));
    await fingers("touchStart", [[1, 112, 254]]);
    await fingers("touchMove", [[1, 112, 208]]);
    await fingers("touchStart", [
      [1, 112, 208],
      [2, fx, fy],
    ]);
    for (let i = 1; i <= 12; i++) {
      await fingers("touchMove", [
        [1, 112, 208],
        [2, fx - i * 4, fy - i],
      ]);
      await page.waitForTimeout(45);
    }
    const simultaneous = await page.evaluate(() => ({
      x: window.__vesper.player.position.x,
      z: window.__vesper.player.position.z,
      yaw: window.__vesper.yaw,
      ammo: window.__vesper.weapon.ammo,
    }));
    check(
      `${map}: two real fingers move, turn and fire repeatedly together`,
      Math.hypot(simultaneous.x - baseline.x, simultaneous.z - baseline.z) >
        0.7 &&
        simultaneous.yaw > baseline.yaw + 0.12 &&
        simultaneous.ammo < baseline.ammo - 1,
    );
    await fingers("touchEnd", []);
    await page.waitForTimeout(100);
    check(
      `${map}: releasing fingers stops movement and fire`,
      await page.evaluate(() => {
        const g = window.__vesper;
        return !g.mouse.fire && g.touchMove.x === 0 && g.touchMove.y === 0;
      }),
    );
    await fingers("touchStart", [
      [1, 112, 254],
      [2, fx, fy],
    ]);
    await fingers("touchMove", [
      [1, 112, 208],
      [2, fx - 8, fy],
    ]);
    await fingers("touchCancel", []);
    check(
      `${map}: operating-system touch cancellation releases both thumbs`,
      await page.evaluate(() => {
        const g = window.__vesper;
        return !g.mouse.fire && g.touchMove.x === 0 && g.touchMove.y === 0;
      }),
    );
    await page.locator('[data-action="jump"]').tap();
    await page.waitForTimeout(100);
    check(
      `${map}: jump responds to its icon`,
      await page.evaluate(() => !window.__vesper.player.grounded),
    );
    await page.waitForTimeout(800);
    await fingers("touchStart", [[1, 12, 90]]);
    check(
      `${map}: touching a joystick edge has no initial drift`,
      await page.evaluate(() => {
        const g = window.__vesper;
        return g.touchMove.x === 0 && g.touchMove.y === 0 && !g.touchSprint;
      }),
    );
    await fingers("touchEnd", []);
    await fingers("touchStart", [[1, 100, 245]]);
    await fingers("touchMove", [[1, 100, 185]]);
    await page.waitForTimeout(200);
    check(
      `${map}: forward joystick edge sprints without a separate button`,
      await page.evaluate(() => window.__vesper.player.sprinting),
    );
    await fingers("touchEnd", []);
    await page.locator('[data-action="crouch"]').tap();
    await page.waitForTimeout(150);
    check(
      `${map}: stance icon crouches`,
      await page.evaluate(() => window.__vesper.player.crouched),
    );
    await page.locator('[data-action="crouch"]').tap();
    await page.locator('[data-action="reload"]').tap();
    await page.waitForFunction(() => window.__vesper.weapon.ammo === 12);
    check(`${map}: tapping weapon strip reloads`, true);
    await page.evaluate(() => {
      const g = window.__vesper;
      g.player.position.copy(g.world.spawn);
      g.yaw = g.pitch = 0;
      g.updatePlayer(0.016);
    });
    await page.waitForTimeout(300);
    const rendering = await page.evaluate(() => {
      const g = window.__vesper;
      const muzzle = g.gun.userData.flash
        .getWorldPosition(g.player.position.clone())
        .project(g.viewCamera);
      return {
        ratio: g.renderer.getPixelRatio(),
        buffer: g.composer.readBuffer.width,
        width: innerWidth,
        muzzle: muzzle.toArray(),
      };
    });
    check(
      `${map}: world postprocessing uses the Retina render resolution`,
      rendering.ratio > 1.5 &&
        Math.abs(rendering.buffer - rendering.width * rendering.ratio) < 2,
    );
    check(
      `${map}: muzzle remains in the visible game frame`,
      Math.abs(rendering.muzzle[0]) < 0.9 &&
        Math.abs(rendering.muzzle[1]) < 0.9,
    );
    check(
      `${map}: interaction button only appears near a usable object`,
      await page.locator("#mobile-interact").isHidden(),
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      g.player.position.set(0, 1.7, g.world.doors[0].obstacle.z + 4);
    });
    await page.waitForFunction(
      () =>
        !document
          .querySelector("#mobile-interact")
          .classList.contains("hidden"),
    );
    check(
      `${map}: contextual interaction explains the action`,
      (await page.locator("#mobile-interact").innerText()).length > 5,
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      g.player.position.copy(g.world.spawn);
      g.world.openDoor(g.world.doors[0]);
      g.world.setPower();
      g.world.update(4, g.time);
    });
    await page.waitForTimeout(600);
    await page.addStyleTag({
      content: "#announcement,#toast-container{visibility:hidden!important}",
    });
    await page.screenshot({ path: `${out}/${map}-landscape.png` });
    await fingers("touchStart", [
      [1, 112, 254],
      [2, fx, fy],
    ]);
    await fingers("touchMove", [
      [1, 112, 208],
      [2, fx - 10, fy],
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => window.__vesper.state === "paused");
    const paused = await page.evaluate(() => window.__vesper.time);
    await fingers("touchCancel", []);
    await page.waitForTimeout(200);
    check(
      `${map}: rotating to portrait pauses and clears every held action`,
      (await page.locator("#mobile-orientation").isVisible()) &&
        (await page.evaluate((t) => {
          const g = window.__vesper;
          return (
            g.time === t &&
            !g.mouse.fire &&
            !g.mouse.aim &&
            g.touchMove.x === 0 &&
            g.touchMove.y === 0
          );
        }, paused)),
    );
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator("#resume-button").tap();
    check(
      `${map}: landscape resumes explicitly`,
      await page.evaluate(() => window.__vesper.state === "playing"),
    );
  }
  for (const map of ["abbey", "station"]) {
    await page.evaluate(async (map) => {
      const g = window.__vesper;
      await g.start(map, "normal", true);
      g.world.openDoor(g.world.doors[0]);
      g.updateNavigation(true);
      g.world.setPower();
      g.world.update(4, g.time);
      g.wave = 10;
      g.phaseTimer = 1000;
      g.player.invulnerable = 100000;
      g.player.position.set(0, 1.7, 20);
      for (let i = 0; i < 28; i++) {
        g.spawnEnemy(
          ["walker", "runner", "brute", "spitter", "wraith"][i % 5],
          g.player.position
            .clone()
            .set(((i % 7) - 3) * 2, 0, 11 - Math.floor(i / 7) * 3),
        );
        g.enemies.at(-1).model.position.y = 0;
      }
    }, map);
    await page.waitForTimeout(2000);
    const performance = await page.evaluate(async () => {
      const g = window.__vesper,
        frames = [];
      let last = window.performance.now();
      for (let i = 0; i < 120; i++) {
        await new Promise(requestAnimationFrame);
        const now = window.performance.now();
        frames.push(now - last);
        last = now;
      }
      frames.sort((a, b) => a - b);
      return {
        medianFps: 1000 / frames[60],
        p95FrameMs: frames[114],
        ratio: g.renderer.getPixelRatio(),
        scale: g.mobileResolutionScale,
        enemies: g.enemies.filter((e) => !e.dead).length,
        geometry: g.renderer.info.memory.geometries,
      };
    });
    report.performance.push({
      map,
      environment:
        "Mac Chrome, emulated 844×390 Retina; not physical phone performance",
      ...performance,
    });
    check(
      `${map}: powered map renders with 28 enemies`,
      performance.enemies === 28 && Number.isFinite(performance.medianFps),
    );
    await page.screenshot({ path: `${out}/${map}-horde.png` });
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 8 });
  await page.waitForFunction(
    () => window.__vesper.mobileResolutionScale < 1,
    null,
    { timeout: 20000 },
  );
  check(
    "Adaptive rendering responds to sustained frame slowdown",
    await page.evaluate(() => window.__vesper.renderer.getPixelRatio() < 2),
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.locator("#hud-pause").tap();
  await page.locator("#pause-settings").tap();
  await page.locator('label[for="setting-touchAdaptiveQuality"]').tap();
  await page.locator("#setting-touchSensitivity").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  await page.locator('label[for="setting-touchAimAssist"]').tap();
  check(
    "Touch settings apply independently and persist",
    await page.evaluate(() => {
      const g = window.__vesper;
      const saved = JSON.parse(localStorage.getItem("vesper-settings"));
      return (
        !g.settings.touchAdaptiveQuality &&
        !g.settings.touchAimAssist &&
        g.settings.touchSensitivity === 1.6 &&
        g.renderer.getPixelRatio() === 2 &&
        saved.touchSensitivity === 1.6
      );
    }),
  );
  await page.locator("#close-panel").tap();
  await page.locator("#resume-button").tap();
  // Simulated display cutouts: verify controls remain outside the protected edges.
  await page.addStyleTag({
    content: ":root{--safe-left:47px;--safe-right:47px;--safe-bottom:21px}",
  });
  check(
    "Thumb controls avoid the landscape notch and home indicator",
    await page.evaluate(() =>
      [...document.querySelectorAll("[data-action]")]
        .filter((e) => !e.disabled && !e.classList.contains("hidden"))
        .every((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.left >= 47 &&
            r.right <= innerWidth - 47 &&
            r.bottom <= innerHeight - 21
          );
        }),
    ),
  );
  await page.screenshot({ path: `${out}/safe-area.png` });
  await page.addStyleTag({
    content: ":root{--safe-left:0px;--safe-right:0px;--safe-bottom:0px}",
  });
  // Comfortable targets and a clean firing area at actual landscape phone widths.
  for (const [width, height] of [
    [568, 320],
    [667, 375],
    [740, 360],
    [844, 390],
    [852, 393],
    [932, 430],
    [1080, 810],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(
      (h) =>
        parseFloat(
          document.documentElement.style.getPropertyValue("--app-height"),
        ) === h,
      height,
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const targets = await page.evaluate(() =>
      [...document.querySelectorAll("[data-action],#hud-pause")]
        .filter((e) => !e.disabled && !e.classList.contains("hidden"))
        .map((e) => {
          const r = e.getBoundingClientRect();
          const p = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return {
            id: e.dataset.action || e.id,
            valid:
              r.width >= 44 &&
              r.height >= 44 &&
              r.x >= 0 &&
              r.y >= 0 &&
              r.right <= innerWidth &&
              r.bottom <= (visualViewport?.height || innerHeight) &&
              (e === p || e.contains(p)),
          };
        }),
    );
    if (!targets.every((t) => t.valid))
      console.log("Unreachable targets", targets);
    check(
      `Thumb targets reachable at ${width}×${height}`,
      targets.every((t) => t.valid),
    );
    if (width === 568 || width === 932)
      await page.screenshot({ path: `${out}/landscape-${width}.png` });
    await page.locator("#hud-pause").tap();
    check(
      `Pause actions visible at ${width}×${height}`,
      await page.evaluate(() =>
        [...document.querySelectorAll(".pause-content button")].every((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.width >= 44 &&
            r.height >= 44 &&
            r.top >= 0 &&
            r.bottom <= innerHeight
          );
        }),
      ),
    );
    await page.locator("#resume-button").tap();
  }
  await browser.close();
  browser = null;
  browser = await webkit.launch({ headless: true });
  for (const profile of ["iPhone SE", "iPhone 13", "iPad (gen 7)"]) {
    const options = { ...devices[profile] };
    page = await browser.newPage(options);
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.goto(process.env.VESPER_URL);
    await page.locator('[data-map="abyss"]').tap();
    await page.locator("#play-button").tap();
    check(
      `${profile}: rotation screen on WebKit`,
      await page.locator("#mobile-orientation").isVisible(),
    );
    await page.setViewportSize({
      width: options.viewport.height,
      height: options.viewport.width,
    });
    await page.locator("#touch-controls:not(.hidden)").waitFor();
    await page.locator('[data-action="fire"]').tap();
    await page.waitForFunction(
      () => Number(document.querySelector("#ammo-value").textContent) < 12,
    );
    await page.locator('[data-action="reload"]').tap();
    await page.waitForFunction(
      () => document.querySelector("#ammo-value").textContent === "12",
    );
    await page.locator("#hud-pause").tap();
    await page.locator("#pause-help").tap();
    check(
      `${profile}: firing, reload, pause and guide work in WebKit`,
      await page.locator("#panel").isVisible(),
    );
    await page.screenshot({
      path: `${out}/${profile.replaceAll(" ", "-")}-guide.png`,
    });
    await page.close();
  }
  page = await browser.newPage();
  const manifest = await page.request.get(
    new URL("/manifest.webmanifest", process.env.VESPER_URL).href,
  );
  const app = await manifest.json();
  check(
    "Home-screen metadata declares standalone landscape and valid icons",
    manifest.ok() &&
      app.display === "standalone" &&
      app.orientation === "landscape",
  );
  for (const icon of app.icons) {
    const response = await page.request.get(
      new URL(icon.src, process.env.VESPER_URL).href,
    );
    check(
      `Home-screen icon ${icon.sizes} loads`,
      response.ok() &&
        response.headers()["content-type"].startsWith("image/png"),
    );
  }
  check("No browser errors", report.errors.length === 0);
} catch (e) {
  report.failure = e.stack;
  console.error(e);
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(out);
  await browser?.close();
}
