import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openGameAudit } from "./game-audit.mjs";
const out = `artifacts/feel-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  checks = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (label, ok) => {
  assert(ok, label);
  checks.push(label);
  console.log("PASS", label);
};
async function step(seconds) {
  await page.evaluate((s) => {
    const g = window.__vesper;
    for (let i = 0; i < Math.round(s * 120); i++) g.update(1 / 120);
  }, seconds);
}
async function render(name) {
  await page.evaluate(() => {
    const g = window.__vesper;
    g.updateHUD();
    g.renderer.autoClear = true;
    g.composer.render();
    g.renderer.autoClear = false;
    g.renderer.clearDepth();
    g.renderer.render(g.viewScene, g.viewCamera);
    g.renderer.autoClear = true;
  });
  await page.screenshot({ path: `${out}/${name}.png` });
}
try {
  await openGameAudit(page);
  await page.locator("#play-button").click();
  await page.waitForFunction(() => window.__vesper?.state === "playing");
  await page.evaluate(() => {
    window.__vesper.loop = () => {};
    document.exitPointerLock();
  });
  await page.addStyleTag({
    content: "#announcement,#toast-container { visibility:hidden!important; }",
  });
  for (const map of ["abbey", "station"]) {
    await page.evaluate(async (map) => {
      const g = window.__vesper;
      await g.start(map, "normal", true);
      g.phaseTimer = 1000;
      g.player.invulnerable = 1e8;
      g.world.openDoor(g.world.doors[0]);
      g.updateNavigation(true);
      g.world.update(0, 0);
      g.updatePlayer(0.016);
    }, map);
    await step(3);
    await render(`${map}-power-off`);
    check(
      `${map}: powered lamps and machines dark before activation`,
      await page.evaluate(() => {
        const w = window.__vesper.world;
        return (
          w.circuits.every((c) => c.light.intensity === 0) &&
          w.interactions
            .filter((i) => i.powered)
            .every((i) => i.screen.material.emissiveIntensity < 0.05)
        );
      }),
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      g.player.position.set(-18, 1.7, -18.8);
      g.interact();
    });
    check(
      `${map}: generator interaction restores power`,
      await page.evaluate(() => window.__vesper.world.power),
    );
    await step(0.7);
    check(
      `${map}: circuits light progressively`,
      await page.evaluate(() => {
        const c = window.__vesper.world.circuits;
        return c[0].level > 0.5 && c[3].level === 0;
      }),
    );
    await step(3);
    check(
      `${map}: all circuits and perk screens powered`,
      await page.evaluate(() => {
        const w = window.__vesper.world;
        return (
          w.circuits.every((c) => c.level === 1 && c.light.intensity >= 35) &&
          w.interactions
            .filter((i) => i.powered)
            .every((i) => i.screen.material.emissiveIntensity > 2.9)
        );
      }),
    );
    check(
      `${map}: activating twice does not reset the sequence`,
      await page.evaluate(() => {
        const w = window.__vesper.world,
          t = w.powerTime;
        return w.setPower() === false && w.powerTime === t;
      }),
    );
    await page.evaluate(() => {
      const g = window.__vesper;
      g.player.position.set(0, 1.7, 20);
      g.yaw = 0;
      g.pitch = 0;
      g.updatePlayer(0.016);
    });
    await render(`${map}-power-on`);
  }
  const movement = await page.evaluate(() => {
    const g = window.__vesper,
      p = g.player,
      results = {};
    const reset = () => {
      p.position.set(0, 1.7, 20);
      p.grounded = true;
      p.crouched = false;
      p.crouchAmount = 0;
      p.stamina = 100;
      p.exhausted = false;
      g.keys.clear();
      g.mouse.fire = g.mouse.aim = false;
      g.touchMove = { x: 0, y: 0 };
      g.touchSprint = g.touchRun = false;
      g.meleeTimer = 0;
      g.reloadTime = 0;
    };
    for (const mode of ["walk", "run", "crouch"]) {
      reset();
      g.keys.add("KeyW");
      if (mode === "run") g.keys.add("ShiftLeft");
      if (mode === "crouch") g.toggleCrouch();
      for (let i = 0; i < 120; i++) {
        g.time += 1 / 120;
        g.updatePlayer(1 / 120);
      }
      results[mode] = {
        distance: 20 - p.position.z,
        stamina: p.stamina,
        height: g.camera.position.y,
        sprinting: p.sprinting,
      };
    }
    reset();
    g.keys.add("KeyW");
    g.keys.add("ShiftLeft");
    g.mouse.aim = true;
    g.updatePlayer(0.1);
    results.aimBlocksSprint = !p.sprinting;
    g.mouse.aim = false;
    p.stamina = 1;
    for (let i = 0; i < 24; i++) g.updatePlayer(1 / 120);
    results.exhausted = p.exhausted && !p.sprinting;
    reset();
    g.toggleCrouch();
    g.jump();
    results.jumpStands = !p.crouched && !p.grounded;
    reset();
    return results;
  });
  check(
    "Run is distinctly faster than walking",
    movement.run.distance > movement.walk.distance * 1.8,
  );
  check(
    "Running drains endurance; crouching is slower and lowers the camera",
    movement.run.stamina < 85 &&
      movement.crouch.distance < movement.walk.distance * 0.6 &&
      movement.crouch.height < 1.1,
  );
  check(
    "Aim blocks sprint, exhaustion latches, jumping stands up",
    movement.aimBlocksSprint && movement.exhausted && movement.jumpStands,
  );
  await page.keyboard.press("KeyC");
  check(
    "C toggles crouching through the keyboard",
    await page.evaluate(() => window.__vesper.player.crouched),
  );
  await step(0.35);
  await render("crouched");
  await page.keyboard.press("KeyC");
  await step(0.35);
  // A nearby zombie survives the wind-up, then takes exactly one strike at contact.
  await page.evaluate(() => {
    const g = window.__vesper;
    g.world.id = "station";
    g.spawnEnemy("brute", g.player.position.clone().set(0, 0, 18));
    g.enemies.at(-1).model.position.y = 0;
    g.enemies.at(-1).health = 1000;
    g.enemies.at(-1).stagger = 1000;
    g.enemies.at(-1).attack = 1000;
    g.melee();
  });
  await step(0.22);
  await render("knife-windup");
  check(
    "Knife is visible, firearm hidden; no damage before contact",
    await page.evaluate(() => {
      const g = window.__vesper;
      return (
        g.knife.visible && !g.gun.visible && g.enemies.at(-1).health === 1000
      );
    }),
  );
  const ammo = await page.evaluate(() => window.__vesper.weapon.ammo);
  await step(0.11);
  await render("knife-strike");
  check(
    "Blade contact damages once without consuming ammunition",
    await page.evaluate((ammo) => {
      const g = window.__vesper;
      return g.enemies.at(-1).health === 855 && g.weapon.ammo === ammo;
    }, ammo),
  );
  await page.evaluate(() => window.__vesper.melee());
  await step(0.12);
  check(
    "Repeated input cannot stack strikes during the animation",
    await page.evaluate(() => window.__vesper.enemies.at(-1).health === 855),
  );
  await step(0.4);
  check(
    "Recovery restores the gun and clears the knife",
    await page.evaluate(() => {
      const g = window.__vesper;
      return g.gun.visible && !g.knife.visible && !g.knifeTrail.visible;
    }),
  );
  await page.evaluate(() => {
    const g = window.__vesper;
    const door = g.world.doors[0];
    door.open = false;
    door.obstacle.active = true;
    g.player.position.set(0, 1.7, door.position.z + 0.6);
    const e = g.enemies.at(-1);
    e.model.position.set(0, 0, door.position.z - 1.4);
    e.health = 1000;
    g.updatePlayer(0.016);
    g.melee();
  });
  await step(0.4);
  check(
    "Knife cannot damage an enemy through a closed gate",
    await page.evaluate(() => window.__vesper.enemies.at(-1).health === 1000),
  );
  await step(0.5);
  // Render all three scores offline, including their tail; no remote media is involved.
  const audioReports = [];
  for (const map of ["abbey", "station", "abyss"]) {
    const audio = await page.evaluate(async (map) => {
      const Score = window.__vesper.sound.score.constructor;
      const rate = 22050,
        ctx = new OfflineAudioContext(2, rate * 20, rate);
      const score = new Score(ctx, ctx.destination);
      for (let i = 0; i < 32; i++)
        score.scheduleBeat(i * 0.48, i, {
          map,
          phase: "wave",
          wave: 8,
          power: true,
        });
      const buffer = await ctx.startRendering();
      let sum = 0,
        peak = 0;
      const bytes = new Uint8Array(buffer.length * 4);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < buffer.length; i++)
        for (let c = 0; c < 2; c++) {
          const v = buffer.getChannelData(c)[i];
          sum += v * v;
          peak = Math.max(peak, Math.abs(v));
          view.setInt16(
            (i * 2 + c) * 2,
            Math.max(-1, Math.min(1, v)) * 32767,
            true,
          );
        }
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return {
        data: btoa(binary),
        rms: Math.sqrt(sum / (buffer.length * 2)),
        peak,
        rate,
      };
    }, map);
    check(
      `${map}: score renders audible signal without clipping`,
      audio.rms > 0.008 && audio.peak < 0.98,
    );
    const pcm = Buffer.from(audio.data, "base64"),
      header = Buffer.alloc(44);
    header.write("RIFF");
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(2, 22);
    header.writeUInt32LE(audio.rate, 24);
    header.writeUInt32LE(audio.rate * 4, 28);
    header.writeUInt16LE(4, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(`${out}/music-${map}.wav`, Buffer.concat([header, pcm]));
    audioReports.push({ map, rms: audio.rms, peak: audio.peak });
  }
  fs.writeFileSync(`${out}/audio.json`, JSON.stringify(audioReports, null, 2));
  check(
    "The three maps have distinct compositions",
    !fs
      .readFileSync(`${out}/music-abbey.wav`)
      .equals(fs.readFileSync(`${out}/music-station.wav`)) &&
      ["abbey", "station"].every(
        (map) =>
          !fs
            .readFileSync(`${out}/music-${map}.wav`)
            .equals(fs.readFileSync(`${out}/music-abyss.wav`)),
      ),
  );
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  for (const [map, width, height] of [
    ["abbey", 844, 390],
    ["station", 844, 390],
  ]) {
    await mobile.setViewportSize({ width, height });
    await openGameAudit(mobile);
    await mobile.locator(`[data-map="${map}"]`).tap();
    await mobile.locator("#play-button").tap();
    await mobile.waitForFunction(() => window.__vesper?.state === "playing");
    await mobile.evaluate(() => {
      const g = window.__vesper;
      g.phaseTimer = 1000;
      g.player.invulnerable = 1e8;
    });
    await mobile.locator('[data-action="crouch"]').tap();
    await mobile.waitForTimeout(300);
    check(
      `${map}: touch crouch lowers the viewpoint`,
      await mobile.evaluate(() => window.__vesper.camera.position.y < 1.1),
    );
    await mobile.locator('[data-action="crouch"]').tap();
    const rect = await mobile.locator("#touch-move").boundingBox();
    const cdp = await mobile.context().newCDPSession(mobile);
    const point = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      id: 1,
      radiusX: 5,
      radiusY: 5,
      force: 1,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...point, y: point.y - 60 }],
    });
    await mobile.waitForTimeout(300);
    check(
      `${map}: forward joystick edge sprints and consumes stamina`,
      await mobile.evaluate(() => {
        const g = window.__vesper;
        return (
          g.player.sprinting && !g.player.crouched && g.player.stamina < 99
        );
      }),
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await mobile.locator('[data-action="melee"]').tap();
    await mobile.waitForTimeout(180);
    check(
      `${map}: touch knife draws the blade`,
      await mobile.evaluate(
        () => window.__vesper.knife.visible && !window.__vesper.gun.visible,
      ),
    );
    await mobile.screenshot({ path: `${out}/${map}-touch-knife.png` });
    await mobile.waitForTimeout(800);
    await mobile.locator("#hud-pause").tap();
    check(
      `${map}: pausing clears joystick sprint`,
      await mobile.evaluate(() => !window.__vesper.touchSprint),
    );
  }
  await mobile.locator("#pause-settings").tap();
  await mobile.locator("#setting-musicVolume").focus();
  await mobile.keyboard.press("Home");
  await mobile.waitForTimeout(100);
  check(
    "Music volume is independent of master volume and persists",
    await mobile.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("vesper-settings"));
      return (
        saved.musicVolume === 0 &&
        saved.volume > 0 &&
        window.__vesper.sound.score.volume === 0
      );
    }),
  );
  await mobile.reload();
  await mobile.locator("#settings-button").tap();
  check(
    "Saved music level restored after reload",
    (await mobile.locator("#setting-musicVolume").inputValue()) === "0",
  );
  await mobile.close();
  check("No browser errors", errors.length === 0);
} catch (e) {
  console.error(e);
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(out);
  await browser.close();
}
