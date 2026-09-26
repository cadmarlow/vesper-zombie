import { webkit, devices } from "@playwright/test";
import { openGameAudit } from "./game-audit.mjs";

export async function reviewLacuna(browser, report, check) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") report.errors.push(e.text());
  });
  await openGameAudit(page);
  await page.click('[data-map="lacuna"]');
  await page.click("#play-button");
  await page.waitForFunction(() => window.__vesper?.state === "playing", null, {
    timeout: 90000,
  });
  await page.evaluate(() => {
    const g = window.__vesper;
    g.phaseTimer = 6000;
    g.player.invulnerable = 1e9;
    g.world.openDoor(g.world.doors[0]);
    g.world.setPower();
    g.updateNavigation(true);
  });
  await page.waitForTimeout(7000);
  const before = await page.evaluate(() => ({
    textures: window.__vesper.renderer.info.memory.textures,
    geometries: window.__vesper.renderer.info.memory.geometries,
  }));
  await page.evaluate(() => window.__vesper.pause());
  await page.waitForTimeout(100);
  await page.addStyleTag({
    content:
      "#hud,#pause,#mobile-orientation,#announcement,#toast-container,#screen-blood{display:none!important}",
  });
  for (const [name, position, target, purge] of [
    ["01-lacuna-vue-generale", [106, 104, 139], [0, 15, -21], false],
    ["02-lacuna-dernier-matin", [30, 3.1, 37], [0, 21, -77], false],
    ["03-lacuna-thermes", [-23, 2.5, 26], [-44, 10, -3], false],
    ["04-lacuna-grande-decrue", [15, 2.7, 26], [0, 20, -70], true],
  ]) {
    await page.evaluate(
      ({ position, target, purge }) => {
        const g = window.__vesper,
          s = g.run.mapGameplay.hydraulics;
        s.phase = purge ? 2 : 0;
        s.mode = purge ? 2 : 0;
        s.zone = 0;
        s.timer = 24;
        s.bridgeClosed = purge;
        g.run.mapGameplay.sync();
        for (let i = 0; i < 90; i++) g.world.update(1 / 30, g.time + i / 30);
        g.camera.position.set(...position);
        g.camera.lookAt(...target);
        g.camera.fov = 60;
        g.camera.updateProjectionMatrix();
        g.viewPass.enabled = false;
        g.film.uniforms.hurt.value = 0;
        g.renderer.shadowMap.needsUpdate = true;
        g.composer.render(0);
      },
      { position, target, purge },
    );
    await page.screenshot({ path: `${report.out}/${name}.png` });
  }
  const after = await page.evaluate(async () => {
    const g = window.__vesper,
      previous = g.run.mapGameplay;
    await g.start("lacuna", "normal", false);
    g.phaseTimer = 6000;
    g.player.invulnerable = 1e9;
    return { oldAudioDisposed: previous.audio.ctx === null };
  });
  await page.waitForTimeout(2500);
  const memory = await page.evaluate(() => ({
    textures: window.__vesper.renderer.info.memory.textures,
    geometries: window.__vesper.renderer.info.memory.geometries,
  }));
  report.memory = { before, after: memory };
  check(
    "Lacuna reload: audio released and GPU allocations remain bounded",
    after.oldAudioDisposed &&
      memory.textures <= before.textures + 8 &&
      memory.geometries <= before.geometries + 12,
    report.memory,
  );
  check(
    "Leaving Lacuna: old maps have no hydraulic controller",
    await page.evaluate(async () => {
      const g = window.__vesper;
      await g.start("abbey", "normal", false);
      return g.run.mapGameplay === null && g.camera.far === 160;
    }),
  );
  await page.close();

  // A separate WebKit engine checks Lacuna's custom shaders and native touch UI.
  const safari = await webkit.launch({ headless: true });
  try {
    const options = { ...devices["iPhone 13"] };
    const mobile = await safari.newPage(options);
    mobile.on("pageerror", (e) => report.errors.push(e.message));
    mobile.on("console", (e) => {
      if (e.type() === "error") report.errors.push(e.text());
    });
    await openGameAudit(mobile);
    await mobile.locator('[data-map="lacuna"]').tap();
    await mobile.screenshot({ path: `${report.out}/iphone-lacuna-menu.png` });
    await mobile.locator("#play-button").tap();
    check(
      "Lacuna WebKit: portrait waits for rotation",
      await mobile.locator("#mobile-orientation").isVisible(),
    );
    await mobile.setViewportSize({
      width: options.viewport.height,
      height: options.viewport.width,
    });
    await mobile.waitForFunction(
      () => window.__vesper?.state === "playing",
      null,
      { timeout: 90000 },
    );
    await mobile.evaluate(() => {
      const g = window.__vesper;
      g.phaseTimer = 6000;
      g.player.invulnerable = 1e9;
      g.world.setPower();
      g.world.openDoor(g.world.doors[0]);
      g.updateNavigation(true);
      g.player.position.set(15, 1.7, 26);
      g.yaw = 0;
      g.pitch = 0.2;
      const s = g.run.mapGameplay.hydraulics;
      s.phase = 1;
      s.mode = 0;
      s.zone = 0;
      s.timer = 0;
    });
    await mobile.waitForFunction(
      () => window.__vesper.run.mapGameplay.hydraulics.phase === 2,
    );
    await mobile.locator('[data-action="fire"]').tap();
    await mobile.waitForFunction(() => window.__vesper.weapons[0].ammo < 12);
    await mobile.waitForTimeout(2000);
    await mobile.addStyleTag({
      content: "#announcement,#toast-container{visibility:hidden!important}",
    });
    await mobile.screenshot({ path: `${report.out}/iphone-lacuna-purge.png` });
    check(
      "Lacuna WebKit: hydraulic purge renders and touch firing works",
      await mobile.locator(".lacuna-status").isVisible(),
    );
    await mobile.locator("#hud-pause").tap();
    check(
      "Lacuna WebKit: pause controls stop the map",
      await mobile.evaluate(() => window.__vesper.state === "paused"),
    );
  } finally {
    await safari.close();
  }
}
