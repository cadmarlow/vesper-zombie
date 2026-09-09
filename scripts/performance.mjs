import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(process.env.VESPER_URL || "http://localhost:5173");
await page.click("#play-button");
await page.waitForFunction(() => window.__vesper?.state === "playing");
await page.evaluate(() => {
  const g = window.__vesper;
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
  g.renderer.info.autoReset = false;
});
await page.waitForTimeout(1000);
const result = await page.evaluate(async () => {
  const g = window.__vesper,
    frames = [];
  let last = performance.now();
  g.renderer.info.reset();
  const rendersBefore = g.renderer.info.render.calls;
  for (let i = 0; i < 100; i++) {
    await new Promise(requestAnimationFrame);
    const now = performance.now();
    frames.push(now - last);
    last = now;
  }
  frames.sort((a, b) => a - b);
  return {
    medianFps: 1000 / frames[50],
    p95FrameMs: frames[95],
    callsPerFrame: g.renderer.info.render.calls / 100,
    memory: g.renderer.info.memory,
    enemies: g.enemies.length,
  };
});
console.log(result);
await page.screenshot({ path: `artifacts/stress-${Date.now()}.png` });
await browser.close();
