import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { openGameAudit } from "./game-audit.mjs";

process.env.VESPER_URL ||= "http://localhost:4173";
const out = `artifacts/thermal-check-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], pixels: [], cadence: [], errors: [] };
const check = (name, ok) => {
  assert(ok, name);
  report.checks.push(name);
  console.log("PASS", name);
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") report.errors.push(m.text());
  });
  await openGameAudit(page);
  await page.click("#play-button");
  await page.waitForFunction(() => window.__vesper?.state === "playing");
  await page.evaluate(() => {
    const g = window.__vesper;
    g.phaseTimer = 3600;
    g.player.invulnerable = 1e9;
    g.applySettings({ ...g.settings, quality: "high", adaptiveQuality: false });
    window.thermal = { renders: 0, updates: 0, music: 0 };
    for (const [owner, key, count] of [
      [g.composer, "render", "renders"],
      [g, "update", "updates"],
      [g.sound, "music", "music"],
    ]) {
      const original = owner[key];
      owner[key] = function (...args) {
        window.thermal[count]++;
        return original.apply(this, args);
      };
    }
  });
  async function sample(ms = 650) {
    return page.evaluate(async (ms) => {
      const before = { ...window.thermal },
        time = window.__vesper.time,
        start = performance.now();
      await new Promise((resolve) => setTimeout(resolve, ms));
      const result = {
        elapsed: performance.now() - start,
        time: window.__vesper.time - time,
      };
      for (const key in before) result[key] = window.thermal[key] - before[key];
      return result;
    }, ms);
  }
  for (const frameRate of [30, 60]) {
    await page.evaluate((frameRate) => {
      const g = window.__vesper;
      g.applySettings({ ...g.settings, frameRate });
    }, frameRate);
    await page.waitForTimeout(200);
    const result = await sample(1100);
    report.cadence.push({ frameRate, ...result });
    check(
      `${frameRate} FPS setting caps actual game renders`,
      result.renders > 5 &&
        result.renders <= (result.elapsed * frameRate) / 1000 + 2,
    );
    check(
      `${frameRate} FPS keeps simulation and presentation together`,
      result.renders === result.updates,
    );
  }
  await page.evaluate(() => window.__vesper.pause());
  await page.waitForTimeout(180);
  const paused = await sample();
  check(
    "Pause stops 3D rendering and simulation",
    paused.renders === 0 && paused.updates === 0 && paused.time === 0,
  );
  check(
    "Pause keeps the music scheduler alive at a reduced rate",
    paused.music > 0 && paused.music <= 8,
  );
  const previous = await page.evaluate(() => window.thermal.renders);
  await page.setViewportSize({ width: 980, height: 620 });
  await page.waitForFunction(
    (previous) => window.thermal.renders > previous,
    previous,
  );
  check(
    "Resize redraws the paused view once then settles",
    (await sample()).renders === 0,
  );
  await page.evaluate(() => {
    const g = window.__vesper;
    g.applySettings({ ...g.settings, quality: "medium" });
  });
  await page.waitForTimeout(180);
  check(
    "Paused quality change redraws and settles",
    (await sample()).renders === 0 &&
      (await page.evaluate(() => !window.__vesper.ao.enabled)),
  );
  await page.evaluate(() => window.__vesper.resume());
  check(
    "Resume restarts rendering and simulation",
    (await sample()).updates > 5,
  );

  // Model the visibility event explicitly: headless tabs are otherwise visible
  // even when another page is foregrounded. Exercise the production listener.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = await sample();
  check(
    "Hidden tab pauses immediately without submitting a frame",
    hidden.renders === 0 &&
      hidden.updates === 0 &&
      (await page.evaluate(() => window.__vesper.state === "paused")),
  );
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(180);
  check(
    "Returning to the tab restores a settled paused image",
    (await sample()).renders === 0,
  );

  for (const map of ["abbey", "station", "abyss"]) {
    await page.evaluate(async (map) => {
      const g = window.__vesper;
      await g.start(map, "normal", false);
      g.phaseTimer = 3600;
      g.player.invulnerable = 1e9;
      g.applySettings({
        ...g.settings,
        quality: "high",
        adaptiveQuality: false,
      });
      for (let i = 0; i < 5; i++) {
        g.spawnEnemy(
          ["walker", "runner", "brute", "spitter", "wraith"][i],
          g.player.position
            .clone()
            .set((i - 2) * 2, 0, g.player.position.z - 7),
        );
        g.enemies.at(-1).model.position.y = 0;
      }
      g.world.setPower();
    }, map);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__vesper.pause());
    await page.waitForTimeout(180);
    const pixels = await page.evaluate(() => {
      const g = window.__vesper,
        ao = g.ao,
        gl = g.renderer.getContext();
      const optimized = ao._renderOverride;
      const original = Object.getPrototypeOf(
        Object.getPrototypeOf(ao),
      )._renderOverride;
      const draw = (method) => {
        ao._renderOverride = method;
        g.composer.render();
        const pixels = new Uint8Array(
          gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
        );
        gl.readPixels(
          0,
          0,
          gl.drawingBufferWidth,
          gl.drawingBufferHeight,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        return pixels;
      };
      try {
        draw(original); // Warm identical render targets/shaders.
        const reference = draw(original),
          candidate = draw(optimized);
        let changed = 0,
          maximum = 0,
          nonBlack = 0;
        for (let i = 0; i < reference.length; i++) {
          const delta = Math.abs(reference[i] - candidate[i]);
          if (delta) changed++;
          maximum = Math.max(maximum, delta);
          if (i % 4 !== 3 && reference[i] > 5) nonBlack++;
        }
        return {
          changed,
          maximum,
          nonBlack,
          channels: reference.length,
          autoUpdate: g.scene.matrixWorldAutoUpdate,
          enabled: ao.enabled,
          glError: gl.getError(),
        };
      } finally {
        ao._renderOverride = optimized;
      }
    });
    report.pixels.push({ map, ...pixels });
    check(
      `${map}: reused transforms produce exactly the same image`,
      pixels.enabled &&
        pixels.nonBlack > 1000 &&
        pixels.changed === 0 &&
        pixels.glError === 0,
    );
    check(
      `${map}: scene transform updates are restored after AO`,
      pixels.autoUpdate,
    );
    await page.screenshot({ path: `${out}/${map}-paused.png` });
  }
  await page.evaluate(() => window.__vesper.end(false));
  await page.waitForTimeout(180);
  check(
    "Game over settles without repeated 3D rendering",
    (await sample()).renders === 0,
  );
  await page.evaluate(() => window.__vesper.menu());
  const menu = await sample();
  check(
    "Menu releases the world and uses only a light audio tick",
    menu.renders === 0 &&
      menu.updates === 0 &&
      menu.music > 0 &&
      menu.music <= 8 &&
      (await page.evaluate(() => !window.__vesper.world)),
  );
  await page.evaluate(async () => {
    await window.__vesper.start("abbey", "normal", false);
    window.__vesper.phaseTimer = 3600;
  });
  check("A new run wakes the idle loop", (await sample()).updates > 5);
  await page.evaluate(() => window.__vesper.destroy());
  const destroyed = await sample();
  check(
    "Destroy cancels both animation and idle callbacks",
    destroyed.renders === 0 && destroyed.updates === 0 && destroyed.music === 0,
  );
  check("No browser or shader errors", report.errors.length === 0);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(out);
  await browser.close();
}
