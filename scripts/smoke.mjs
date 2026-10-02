import { chromiumOptions } from "./browser.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openGameAudit } from "./game-audit.mjs";
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const outputDir = `artifacts/verification-${Date.now()}`;
fs.mkdirSync(outputDir, { recursive: true });
console.log("Artifacts:", outputDir);
const check = (label, condition) => {
  assert(condition, label);
  results.push(label);
  console.log("PASS", label);
};
const evaluate = (fn, arg) => page.evaluate(fn, arg);
const active = () => evaluate(() => window.__vesper.inspect());
async function teleport(x, z) {
  await evaluate(
    ([x, z]) => {
      const g = window.__vesper;
      g.player.position.set(x, 1.7, z);
      g.player.invulnerable = g.time + 1000;
      g.keys.clear();
      g.mouse.fire = false;
      g.phaseTimer = 1000;
      g.yaw = 0;
      g.pitch = 0;
    },
    [x, z],
  );
  await page.waitForTimeout(60);
}
try {
  await openGameAudit(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outputDir}/menu.png` });
  check(
    "Main menu and all four maps visible",
    (await page.locator(".map-card").count()) === 4,
  );
  check(
    "Menu primary action has clear spacing",
    await evaluate(
      () =>
        document.querySelector(".play-meta").getBoundingClientRect().bottom <
        document.querySelector(".section-label").getBoundingClientRect().top,
    ),
  );
  await page.click('[data-panel="arsenal"]');
  check(
    "Six weapons in arsenal",
    (await page.locator(".weapon-card").count()) === 6,
  );
  await page.screenshot({ path: `${outputDir}/arsenal.png` });
  await page.click("#close-panel");
  await page.click("#settings-button");
  await page.selectOption("#setting-quality", "medium");
  await page.locator("#setting-volume").fill("0.4");
  check(
    "Settings persist",
    await evaluate(
      () => JSON.parse(localStorage.getItem("vesper-settings")).volume === 0.4,
    ),
  );
  await page.selectOption("#setting-quality", "high");
  await page.click("#close-panel");
  await page.click("#play-button");
  await page.waitForFunction(() => window.__vesper?.state === "playing");
  await page.waitForTimeout(800);
  // Slow shader compilation can outlive the initial click's browser activation.
  // The game exposes a click-to-capture fallback; exercise that real path.
  if (!(await evaluate(() => !!document.pointerLockElement)))
    await page.mouse.click(720, 450);
  await page.waitForFunction(() => !!document.pointerLockElement);
  check(
    "Pointer lock acquired",
    await evaluate(() => !!document.pointerLockElement),
  );
  await evaluate(() => (window.__vesper.phaseTimer = 1000));
  const initial = await active();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyW");
  check(
    "Keyboard moves the player",
    (await active()).position[2] < initial.position[2] - 1,
  );
  check(
    "Weapon transform remains finite",
    await evaluate(() =>
      window.__vesper.gun.rotation.toArray().slice(0, 3).every(Number.isFinite),
    ),
  );
  await teleport(0, 20);
  await evaluate(() => {
    const g = window.__vesper;
    g.spawnEnemy("walker", g.player.position.clone().set(0, 0, 15));
    g.enemies.at(-1).model.position.y = 0;
  });
  // Hunched bodies carry their head low: aim at the animated head itself.
  await page.waitForTimeout(120);
  await evaluate(() => {
    const g = window.__vesper;
    const e = g.enemies.at(-1);
    e.model.updateWorldMatrix(true, true);
    const head = e.model.userData.head.getWorldPosition(
      g.camera.position.clone(),
    );
    head.y += 0.06;
    const dx = head.x - g.camera.position.x,
      dz = head.z - g.camera.position.z;
    g.yaw = Math.atan2(-dx, -dz);
    g.pitch = Math.atan2(head.y - g.camera.position.y, Math.hypot(dx, dz));
    e.stagger = 1e6;
  });
  await page.waitForTimeout(50);
  await page.mouse.click(720, 450);
  await page.waitForTimeout(160);
  check(
    "Aimed headshot kills and awards points",
    await evaluate(
      () =>
        window.__vesper.player.kills === 1 &&
        window.__vesper.player.points >= 800,
    ),
  );
  check("Shooting consumes ammunition", (await active()).weapon.ammo === 11);
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(1500);
  check(
    "Reload restores magazine and consumes reserve",
    (await active()).weapon.ammo === 12 &&
      (await active()).weapon.reserve === 83,
  );
  await teleport(0, 8);
  await evaluate(() => {
    const g = window.__vesper;
    g.spawnEnemy("walker", g.player.position.clone().set(0, 0, 0));
    g.enemies.at(-1).model.position.y = 0;
    g.enemies.at(-1).health = 999;
    g.enemies.at(-1).testWall = true;
  });
  await page.mouse.click(720, 450);
  await page.waitForTimeout(200);
  check(
    "Closed gate blocks bullets",
    await evaluate(
      () => window.__vesper.enemies.find((e) => e.testWall).health === 999,
    ),
  );
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1600);
  await page.keyboard.up("KeyW");
  check(
    "Closed gate blocks player movement",
    (await active()).position[2] > 5.5,
  );
  await teleport(-14.5, 18);
  await evaluate(() => (window.__vesper.player.points = 100));
  await page.keyboard.press("KeyE");
  check(
    "Cannot purchase without sufficient points",
    await evaluate(
      () =>
        !window.__vesper.world.interactions.find((i) => i.kind === "box")
          .busy && window.__vesper.player.points === 100,
    ),
  );
  await evaluate(() => (window.__vesper.player.points = 10000));
  await page.keyboard.press("KeyE");
  check(
    "Mystery box charges exactly 950 essences",
    (await active()).points === 9050,
  );
  // The box takes 3.2 seconds of simulation. Cold weapon construction can
  // consume wall time, so observe completion with a bounded timeout.
  await page.waitForFunction(
    () =>
      !!window.__vesper.world.interactions.find((i) => i.kind === "box")
        .offered,
    null,
    { timeout: 8000 },
  );
  check(
    "Mystery box offers a weapon",
    await evaluate(
      () =>
        !!window.__vesper.world.interactions.find((i) => i.kind === "box")
          .offered,
    ),
  );
  await page.keyboard.press("KeyE");
  check(
    "Taking a weapon fills the second slot",
    await evaluate(
      () => window.__vesper.weapons.length === 2 && window.__vesper.slot === 1,
    ),
  );
  await teleport(0, 7);
  await page.keyboard.press("KeyE");
  check(
    "Purchasing gate unlocks path",
    await evaluate(
      () =>
        window.__vesper.world.doors[0].open &&
        !window.__vesper.world.doors[0].obstacle.active,
    ),
  );
  await teleport(14.6, -13);
  await page.keyboard.press("KeyE");
  check(
    "Upgrade requires generator",
    await evaluate(() => window.__vesper.weapon.level === 0),
  );
  await teleport(-15.6, -21);
  await page.keyboard.press("KeyE");
  check("Generator powers machines", (await active()).power);
  await teleport(14.6, -13);
  const beforeUpgrade = (await active()).points;
  await page.keyboard.press("KeyE");
  check(
    "Upgrade applies damage tier and price",
    await evaluate(
      (p) =>
        window.__vesper.weapon.level === 1 &&
        window.__vesper.player.points === p - 3000,
      beforeUpgrade,
    ),
  );
  await teleport(-14.6, -6);
  await page.keyboard.press("KeyE");
  check(
    "Health perk changes maximum health",
    await evaluate(() => window.__vesper.player.maxHealth === 180),
  );
  await teleport(14.6, -3);
  await page.keyboard.press("KeyE");
  check(
    "Speed perk is acquired",
    await evaluate(() => window.__vesper.player.perks.includes("speed")),
  );
  await teleport(14.6, 20);
  await evaluate(() => {
    const g = window.__vesper;
    g.weapon.reserve = 0;
    g.player.grenades = 0;
  });
  await page.keyboard.press("KeyE");
  check(
    "Resupply refills ammunition and grenades",
    await evaluate(
      () =>
        window.__vesper.weapon.reserve > 0 &&
        window.__vesper.player.grenades === 3,
    ),
  );
  await teleport(0, 17);
  await page.keyboard.press("KeyG");
  check(
    "Grenade launches with a finite fuse",
    await evaluate(() =>
      window.__vesper.projectiles.some((p) => p.type === "grenade"),
    ),
  );
  await page.waitForTimeout(1900);
  check(
    "Grenade explodes and is removed",
    await evaluate(
      () => !window.__vesper.projectiles.some((p) => p.type === "grenade"),
    ),
  );
  await evaluate(() => {
    const g = window.__vesper;
    g.spawnEnemy("walker", g.player.position.clone().set(0, 0, 15.7));
    g.enemies.at(-1).model.position.y = 0;
    g.enemies.at(-1).health = 100;
    g.enemies.at(-1).meleeTest = true;
  });
  await page.keyboard.press("KeyV");
  await page.waitForFunction(
    () => window.__vesper.enemies.find((e) => e.meleeTest)?.dead,
  );
  check(
    "Melee damages a nearby enemy",
    await evaluate(() => window.__vesper.enemies.find((e) => e.meleeTest).dead),
  );
  await evaluate(() => {
    const g = window.__vesper;
    for (const e of g.enemies) {
      g.scene.remove(e.model);
    }
    g.enemies = [];
    g.wave = 0;
    g.phase = "rest";
    g.phaseTimer = 0.01;
  });
  await page.waitForTimeout(650);
  check(
    "Wave starts and spawns enemies",
    (await active()).wave === 1 && (await active()).enemies > 0,
  );
  await evaluate(() => {
    const g = window.__vesper;
    g.remaining = 0;
    for (const e of g.enemies) g.damageEnemy(e, 1e8, false);
  });
  await page.waitForTimeout(150);
  check(
    "Eliminating a wave starts intermission",
    (await active()).phase === "rest",
  );
  await evaluate(() => {
    const g = window.__vesper;
    g.phaseTimer = 1000;
    g.player.position.set(0, 1.7, -9);
    g.yaw = 0;
    g.pitch = 0.07;
    for (const [i, type] of [
      "walker",
      "runner",
      "brute",
      "spitter",
      "wraith",
    ].entries()) {
      g.spawnEnemy(type, g.player.position.clone().set(-4 + i * 2, 0, -14));
      g.enemies.at(-1).model.position.y = 0;
    }
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outputDir}/abbey-combat.png` });
  check(
    "All five enemy types render",
    await evaluate(
      () =>
        new Set(
          window.__vesper.enemies.filter((e) => !e.dead).map((e) => e.type),
        ).size === 5,
    ),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  check(
    "Escape pauses and releases cursor",
    (await active()).state === "paused",
  );
  const pausedTime = await evaluate(() => window.__vesper.time);
  await page.waitForTimeout(300);
  check(
    "Pause freezes the simulation",
    await evaluate((t) => window.__vesper.time === t, pausedTime),
  );
  await page.click("#resume-button");
  await page.waitForTimeout(100);
  check("Resume restores playing state", (await active()).state === "playing");
  await teleport(0, 26);
  await evaluate(() => {
    const g = window.__vesper;
    for (const e of g.enemies) g.scene.remove(e.model);
    g.enemies = [];
    g.wave = 10;
    g.phase = "rest";
    g.phaseTimer = 1000;
    g.remaining = 0;
  });
  await page.keyboard.press("KeyE");
  check(
    "Extraction becomes available after wave ten",
    await evaluate(() => window.__vesper.extraction),
  );
  await evaluate(() => {
    const g = window.__vesper;
    for (let i = 0; i < 41; i++) if (g.state === "playing") g.update(0.5);
  });
  check(
    "Extraction ends in victory and records results",
    await evaluate(
      () =>
        window.__vesper.state === "gameover" &&
        JSON.parse(localStorage.getItem("vesper-save")).records.abbey.victory,
    ),
  );
  await page.screenshot({ path: `${outputDir}/victory.png` });
  await page.click("#end-menu");
  await page.click('[data-map="station"]');
  await page.screenshot({ path: `${outputDir}/menu-boreal.png` });
  await page.click("#play-button");
  await page.waitForFunction(
    () =>
      window.__vesper?.map === "station" &&
      window.__vesper?.state === "playing",
  );
  await evaluate(() => (window.__vesper.phaseTimer = 1000));
  await page.waitForTimeout(700);
  check(
    "Second map loads and reuses the renderer",
    (await active()).map === "station",
  );
  await evaluate(() => {
    const g = window.__vesper;
    g.world.openDoor(g.world.doors[0]);
    g.player.position.set(0, 1.7, -6);
    g.yaw = 0.04;
    g.pitch = 0.1;
  });
  await page.waitForTimeout(5500);
  await page.screenshot({ path: `${outputDir}/station.png` });
  await evaluate(() => {
    const g = window.__vesper;
    g.player.invulnerable = 0;
    g.player.health = 1;
    g.hurt(100);
  });
  check(
    "Death ends the run and persists stats",
    await evaluate(
      () =>
        window.__vesper.state === "gameover" &&
        JSON.parse(localStorage.getItem("vesper-save")).runs === 2,
    ),
  );
  await page.click("#end-menu");
  await page.click('[data-panel="archives"]');
  check(
    "Archives show both completed runs",
    await page
      .locator(".archive-summary")
      .innerText()
      .then((t) => t.includes("2")),
  );
  await page.screenshot({ path: `${outputDir}/archives.png` });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await openGameAudit(mobile);
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: `${outputDir}/menu-mobile.png` });
  check(
    "Mobile menu fits viewport",
    await mobile.evaluate(() => document.documentElement.scrollWidth === 390),
  );
  await mobile.locator("#play-button").tap();
  check(
    "Portrait launch waits for landscape",
    await mobile.locator("#mobile-orientation").isVisible(),
  );
  await mobile.setViewportSize({ width: 844, height: 390 });
  await mobile.waitForFunction(() => window.__vesper?.state === "playing");
  check(
    "Touch controls appear on mobile",
    await mobile.locator("#touch-controls").isVisible(),
  );
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: `${outputDir}/mobile-game.png` });
  await mobile.close();
  check("No JavaScript or browser console errors", errors.length === 0);
  fs.writeFileSync(
    `${outputDir}/test-results.json`,
    JSON.stringify(
      { passed: results.length, checks: results, errors },
      null,
      2,
    ),
  );
  console.log(`\n${results.length} integration checks passed.`);
} catch (error) {
  console.error(error);
  console.error("Browser errors:", errors);
  await page.screenshot({ path: `${outputDir}/failure.png` }).catch(() => {});
  fs.writeFileSync(
    `${outputDir}/test-results.json`,
    JSON.stringify(
      {
        passed: results.length,
        checks: results,
        errors,
        failure: error.message,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
