import { chromiumOptions } from "./browser.mjs";
import { chromium, webkit, devices } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";

const url = process.env.VESPER_URL || "https://vesper-zombie.vercel.app/";
const origin = new URL(url).origin;
const out = `artifacts/online-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = {
  url,
  checks: [],
  errors: [],
  failedRequests: [],
  cancelledMedia: [],
  external: [],
  timings: [],
  audio: [],
  limitations: [],
};
function check(label, ok) {
  assert(ok, label);
  report.checks.push(label);
  console.log("PASS", label);
}
let page, browser;
async function press(selector, touch) {
  if (touch) await page.locator(selector).tap();
  else await page.locator(selector).click();
}
function observe(p, label) {
  p.on("pageerror", (e) => report.errors.push({ label, message: e.message }));
  p.on("console", (m) => {
    if (m.type() === "error") report.errors.push({ label, message: m.text() });
  });
  p.on("response", (r) => {
    if (r.status() >= 400)
      report.failedRequests.push({ label, url: r.url(), status: r.status() });
  });
  p.on("requestfailed", (r) => {
    const error = r.failure()?.errorText || "";
    // WebKit names a stopped streaming request "cancelled" when the next
    // run selects another song. Keep the evidence, but don't treat that
    // expected media cancellation as a missing asset or connection failure.
    if (
      error === "cancelled" &&
      new URL(r.url()).origin === origin &&
      /^\/music\/[^/]+\.mp3$/.test(new URL(r.url()).pathname)
    )
      report.cancelledMedia.push({ label, url: r.url(), failure: r.failure() });
    else if (!error.includes("ABORTED"))
      report.failedRequests.push({ label, url: r.url(), failure: r.failure() });
  });
  p.on("request", (r) => {
    if (r.url().startsWith("http") && new URL(r.url()).origin !== origin)
      report.external.push(r.url());
  });
}
// Observe the audio graph without changing its signal or game behavior.
async function observeAudio(context) {
  await context.addInitScript(() => {
    window.__auditAudio = [];
    const NativeContext = window.AudioContext || window.webkitAudioContext;
    if (!NativeContext) return;
    const Wrapped = new Proxy(NativeContext, {
      construct(target, args) {
        const ctx = new target(...args);
        window.__auditAudio.push(ctx);
        return ctx;
      },
    });
    window.AudioContext = Wrapped;
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      if (args[0] === this.context.destination) window.__auditMaster = this;
      return connect.apply(this, args);
    };
  });
}
async function audioSample(label) {
  const sample = await page.evaluate(async () => {
    const ctx = window.__auditAudio[0],
      master = window.__auditMaster;
    if (!ctx || !master) return { state: ctx?.state, rms: 0 };
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    let sum = 0,
      peak = 0;
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 70));
      analyser.getFloatTimeDomainData(data);
      for (const v of data) {
        sum += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
    }
    master.disconnect(analyser);
    return { state: ctx.state, rms: Math.sqrt(sum / (8 * data.length)), peak };
  });
  report.audio.push({ label, ...sample });
  check(
    `${label}: real audio context running with audible signal`,
    sample.state === "running" && sample.rms > 0.0001 && sample.peak < 1,
  );
}
try {
  browser = await chromium.launch({
    headless: true,
    ...chromiumOptions,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await observeAudio(context);
  page = await context.newPage();
  observe(page, "Chrome desktop");
  for (const [width, height] of [
    [2560, 1440],
    [1920, 1080],
    [1600, 900],
    [1489, 855],
    [1440, 851],
    [1440, 900],
    [1440, 768],
    [1280, 720],
    [1024, 768],
    [901, 781],
    [900, 780],
    [820, 1180],
    [390, 844],
    [375, 667],
    [320, 568],
    [844, 390],
    [568, 320],
  ]) {
    await page.setViewportSize({ width, height });
    const response = await page.goto(url);
    await page.locator("#play-button").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => {
      const a = document.querySelector(".hero-copy").getBoundingClientRect();
      const b = document.querySelector(".deployment").getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        overlap:
          a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y,
      };
    });
    const ok = response.status() === 200 && !layout.overflow && !layout.overlap;
    if (!ok)
      report.errors.push({ label: `Live menu ${width}×${height}`, layout });
    else check(`Live menu ${width}×${height}`, true);
    if ([1920, 1489, 390, 568].includes(width))
      await page.screenshot({ path: `${out}/menu-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await page.locator('[data-panel="arsenal"]').click();
  check(
    "Online arsenal has all six weapons",
    (await page.locator(".weapon-card").count()) === 6,
  );
  await page.locator("#close-panel").click();
  await page.locator('[data-panel="archives"]').click();
  check(
    "Online archives contain all four maps, five enemy types and the Archonte",
    (await page.locator(".archive-maps article").count()) === 4 &&
      (await page.locator(".bestiary-grid article").count()) === 6,
  );
  await page.locator("#close-panel").click();
  await page.locator("#settings-button").click();
  await page.locator("#setting-musicVolume").fill("0.6");
  await page.locator("#setting-layout").selectOption("qwerty");
  await page.reload();
  await page.locator("#settings-button").click();
  check(
    "Settings persist across a live-site reload",
    (await page.locator("#setting-musicVolume").inputValue()) === "0.6" &&
      (await page.locator("#setting-layout").inputValue()) === "qwerty",
  );
  await page.locator("#reset-settings").click();
  await page.locator("#close-panel").click();
  await context.close();
  await browser.close();

  for (const engine of ["chromium", "webkit"]) {
    browser =
      engine === "chromium"
        ? await chromium.launch({
            headless: true,
            ...chromiumOptions,
            args: ["--enable-webgl", "--ignore-gpu-blocklist"],
          })
        : await webkit.launch({ headless: true });
    const profiles =
      engine === "chromium"
        ? [
            ["desktop", { viewport: { width: 1440, height: 900 } }],
            ["android", { ...devices["Pixel 7"] }],
          ]
        : [
            ["desktop", { viewport: { width: 1440, height: 900 } }],
            ["iphone-se", { ...devices["iPhone SE"] }],
            ["iphone-13", { ...devices["iPhone 13"] }],
            ["iphone-landscape", { ...devices["iPhone 13 landscape"] }],
            ["ipad", { ...devices["iPad (gen 7)"] }],
          ];
    for (const [profile, options] of profiles) {
      const context = await browser.newContext(options);
      await observeAudio(context);
      page = await context.newPage();
      observe(page, `${engine}-${profile}`);
      const touch = !!options.hasTouch;
      for (const map of ["abbey", "station", "abyss", "lacuna"]) {
        const label = `${engine} ${profile} ${map}`;
        await page.goto(url);
        await press(`[data-map="${map}"]`, touch);
        const start = Date.now();
        await press("#play-button", touch);
        if (touch && page.viewportSize().width < page.viewportSize().height) {
          check(
            `${label}: portrait waits for landscape`,
            await page.locator("#mobile-orientation").isVisible(),
          );
          const portrait = page.viewportSize();
          await page.setViewportSize({
            width: portrait.height,
            height: portrait.width,
          });
        }
        await page.locator("#hud:not(.hidden)").waitFor();
        report.timings.push({ label, launchMs: Date.now() - start });
        check(
          `${label}: correct 3D map starts without debug API`,
          (await page.locator("#hud-map").innerText()).includes(
            {
              abbey: "ABBAYE",
              station: "BORÉAL",
              abyss: "NÉRÉIDE",
              lacuna: "LACUNA",
            }[map],
          ) && (await page.evaluate(() => window.__vesper === undefined)),
        );
        check(
          `${label}: controls match input device`,
          (await page.locator("#touch-controls").isVisible()) === touch,
        );
        await audioSample(label);
        if (touch) await press('[data-action="crouch"]', true);
        else await page.keyboard.press("KeyC");
        await page.waitForFunction(
          () =>
            document.querySelector("#movement-state").textContent ===
            "ACCROUPI",
        );
        check(`${label}: crouch works`, true);
        if (touch) await press('[data-action="crouch"]', true);
        else await page.keyboard.press("KeyC");
        const mouseAvailable =
          touch || (await page.evaluate(() => !!document.pointerLockElement));
        if (!mouseAvailable) {
          if (engine !== "webkit")
            throw new Error(`${label}: pointer lock unavailable`);
          report.limitations.push(
            `${label}: this automated WebKit browser refuses pointer lock; desktop mouse fire/aim not validated here`,
          );
        } else {
          if (touch) await press('[data-action="fire"]', true);
          else await page.mouse.click(720, 450);
          await page.waitForFunction(
            () =>
              Number(document.querySelector("#ammo-value").textContent) < 12,
          );
          if (touch) await press('[data-action="reload"]', true);
          else await page.keyboard.press("KeyR");
          await page.waitForFunction(
            () => document.querySelector("#ammo-value").textContent === "12",
          );
          check(`${label}: fire and reload work`, true);
        }
        if (touch) await press('[data-action="grenade"]', true);
        else await page.keyboard.press("KeyG");
        await page.waitForFunction(
          () => document.querySelector("#grenade-count").textContent === "2",
        );
        check(`${label}: grenade consumes inventory`, true);
        if (mouseAvailable) {
          if (touch) await press('[data-action="aim"]', true);
          else await page.mouse.down({ button: "right" });
          await page.waitForFunction(
            () =>
              getComputedStyle(document.querySelector("#crosshair")).display ===
              "none",
          );
          if (touch) await press('[data-action="aim"]', true);
          else await page.mouse.up({ button: "right" });
          check(`${label}: aim works`, true);
        }
        await page.screenshot({
          path: `${out}/${engine}-${profile}-${map}.png`,
        });
        if (touch) await press("#hud-pause", true);
        else await page.keyboard.press("Escape");
        await page.locator("#pause:not(.hidden)").waitFor();
        const time = await page.locator("#session-timer").innerText();
        await page.waitForTimeout(1200);
        check(
          `${label}: pause freezes timer`,
          (await page.locator("#session-timer").innerText()) === time,
        );
        await press("#pause-settings", touch);
        for (const quality of ["low", "medium", "high"])
          await page.locator("#setting-quality").selectOption(quality);
        check(
          `${label}: all three graphics settings apply`,
          (await page.locator("#setting-quality").inputValue()) === "high",
        );
        await press("#close-panel", touch);
        await press("#resume-button", touch);
        await page.locator("#pause.hidden").waitFor({ state: "attached" });
        if (touch) {
          const old = page.viewportSize();
          await page.setViewportSize({ width: old.height, height: old.width });
          await page.locator("#mobile-orientation:not(.hidden)").waitFor();
          check(
            `${label}: portrait automatically pauses`,
            await page.locator("#mobile-orientation").isVisible(),
          );
          await page.setViewportSize(old);
          await press("#pause-help", true);
          check(
            `${label}: help remains reachable after rotation`,
            await page.locator("#panel").isVisible(),
          );
          await press("#close-panel", true);
          await page.setViewportSize(old);
        } else {
          await page.keyboard.press("KeyN");
          await page.waitForFunction(
            () => document.querySelector("#wave-number").textContent === "01",
          );
          check(`${label}: first wave starts online`, true);
          await page.keyboard.press("Escape");
        }
        await press("#quit-button", touch);
        await press("#confirm-quit", touch);
        await page.locator("#menu:not(.hidden)").waitFor();
        check(
          `${label}: quit returns to menu and saves the run`,
          await page.evaluate(
            () => JSON.parse(localStorage.getItem("vesper-save")).runs > 0,
          ),
        );
      }
      await context.close();
    }
    await browser.close();
    browser = null;
  }
  check("No online JavaScript or WebGL errors", report.errors.length === 0);
  check("No failed asset requests", report.failedRequests.length === 0);
  check("No third-party runtime requests", report.external.length === 0);
} catch (e) {
  report.failure = e.stack;
  console.error(e);
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(`${report.checks.length} checks; artifacts: ${out}`);
  await browser?.close();
}
