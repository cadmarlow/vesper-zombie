import { chromium, webkit } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { openGameAudit } from "./game-audit.mjs";

process.env.VESPER_URL ||= "http://localhost:4173";
const out = `artifacts/blood-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { out, checks: [], errors: [], performance: [] };
const profiles = process.env.VESPER_BLOOD_PROFILE
  ? [process.env.VESPER_BLOOD_PROFILE]
  : process.argv.includes("--quick")
    ? ["desktop"]
    : ["desktop", "mobile", "webkit-mobile"];
const check = (name, ok) => {
  assert(ok, name);
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
try {
  for (const profile of profiles) {
    let stage = "loading abbey";
    const mobile = profile !== "desktop",
      safari = profile === "webkit-mobile";
    const browser = await (safari ? webkit : chromium).launch(
      safari
        ? { headless: true }
        : {
            headless: true,
            executablePath:
              process.env.CHROME_PATH ||
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            args: ["--enable-webgl", "--ignore-gpu-blocklist"],
          },
    );
    try {
      const page = await browser.newPage({
        viewport: mobile
          ? { width: 844, height: 390 }
          : { width: 1280, height: 800 },
        deviceScaleFactor: mobile ? 2 : 1.5,
        isMobile: mobile,
        hasTouch: mobile,
      });
      const capture = async (name) => {
        // WebKit screenshots can otherwise retain the previous composited
        // frame after a synchronous diagnostic change to the paused scene.
        await page.evaluate(async () => {
          for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
        });
        await page.screenshot({ path: `${out}/${profile}-${name}.png` });
      };
      page.on("pageerror", (e) =>
        report.errors.push(`${profile} (${stage}): ${e.message}`),
      );
      page.on("console", (e) => {
        if (e.type() === "error") {
          const message = `${profile} (${stage}): ${e.text()}`;
          report.errors.push(message);
          console.error(message);
        }
      });
      await openGameAudit(page);
      await page.click("#play-button");
      await page.waitForFunction(
        () => window.__vesper?.state === "playing",
        null,
        { timeout: 60000 },
      );
      await page.addStyleTag({
        content:
          "#announcement,#toast-container,#wave-status{visibility:hidden!important}",
      });
      stage = "body and headshots";
      await page.evaluate(() => {
        const g = window.__vesper;
        let target, friend;
        const advance = (seconds, fall = false) => {
          for (let t = 0; t < seconds; t += 1 / 60) {
            g.updateEffects(1 / 60);
            if (fall) g.updateEnemies(1 / 60);
          }
          g.flash.intensity = 0;
          g.gun.userData.flash.visible = false;
          g.renderer.shadowMap.needsUpdate = true;
        };
        const clear = () => {
          for (const e of g.enemies) {
            e.dead = true;
            e.deathTime = 0;
          }
          g.updateEnemies(0.001);
          advance(30);
        };
        const setup = (type = "walker") => {
          clear();
          g.state = "paused";
          g.phaseTimer = 1e6;
          g.player.invulnerable = 1e6;
          g.player.position.set(0, 1.7, g.map === "abyss" ? 32 : 20);
          g.camera.position.copy(g.player.position);
          g.world.doors.forEach((d) => g.world.openDoor(d));
          g.world.setPower();
          g.world.update(5, g.time);
          g.spawnEnemy(
            type,
            g.player.position.clone().set(0, 0, g.player.position.z - 2.8),
          );
          target = g.enemies.at(-1);
          target.model.position.y = 0;
          target.health = 1000;
          g.spawnEnemy(
            type,
            g.player.position.clone().set(2.1, 0, g.player.position.z - 3.8),
          );
          friend = g.enemies.at(-1);
          friend.model.position.y = 0;
          g.updateEnemies(0.016);
          g.camera.lookAt(
            target.model.position
              .clone()
              .add(g.player.position.clone().set(0, 1.45, 0)),
          );
          g.camera.updateMatrixWorld(true);
        };
        const shot = (head, lethal = false) => {
          if (lethal) target.health = 1;
          target.model.updateWorldMatrix(true, true);
          const aim = target.model.position.clone();
          if (head) target.model.userData.head.getWorldPosition(aim);
          else aim.y += 1.27 * target.model.scale.y;
          g.camera.lookAt(aim);
          g.camera.updateMatrixWorld(true);
          g.state = "playing";
          g.time += 0.1;
          g.shotTimer = g.reloadTime = g.meleeTimer = 0;
          g.weapon.ammo = 12;
          g.mouse.aim = true;
          g.shoot();
          g.state = "paused";
          advance(0.06);
        };
        const span = (e) => {
          let face;
          e.model.traverse((o) => {
            if (
              o.isSkinnedMesh &&
              o.material.map?.image?.src?.includes("/face-")
            )
              face = o;
          });
          if (!face) throw new Error("No facial mesh found");
          e.model.updateWorldMatrix(true, true);
          let lo = Infinity,
            hi = -Infinity;
          const p = e.model.position.clone();
          for (let i = 0; i < face.geometry.attributes.position.count; i += 7) {
            face.getVertexPosition(i, p).applyMatrix4(face.matrixWorld);
            lo = Math.min(lo, p.y);
            hi = Math.max(hi, p.y);
          }
          return hi - lo;
        };
        const state = () => ({
          health: target.health,
          dead: target.dead,
          headGone: target.model.userData.headDestroyed,
          headSpan: span(target),
          friendSpan: span(friend),
          friendAlive: !friend.dead && !friend.model.userData.headDestroyed,
          stump: !!target.model.getObjectByName("neck-wound"),
          bursts: g.combatEffects.blood.bursts,
          headBursts: g.combatEffects.blood.headBursts,
          stains: g.combatEffects.blood.stainCursor,
          particles: g.combatEffects.blood.drops.count,
          kills: g.player.kills,
          headshots: g.player.headshots,
          points: g.player.points,
        });
        window.__bloodAudit = {
          setup,
          shot,
          advance,
          clear,
          state,
          get target() {
            return target;
          },
        };
        setup();
      });
      const before = await page.evaluate(() => window.__bloodAudit.state());
      await page.evaluate(() => window.__bloodAudit.shot(false));
      const body = await page.evaluate(() => window.__bloodAudit.state());
      check(
        `${profile}: actual body shot damages and sprays blood without removing the head`,
        body.health < before.health &&
          !body.dead &&
          !body.headGone &&
          body.bursts > before.bursts &&
          body.particles > 0 &&
          body.headSpan > 0.15,
      );
      await capture("body-impact");
      await page.evaluate(() => window.__bloodAudit.advance(1.8));
      check(
        `${profile}: falling blood leaves ground splatters`,
        await page.evaluate(
          (previous) => window.__bloodAudit.state().stains > previous,
          body.stains,
        ),
      );
      await page.evaluate(() => window.__bloodAudit.shot(true));
      const nonlethal = await page.evaluate(() => window.__bloodAudit.state());
      check(
        `${profile}: surviving headshot keeps the head and awards no kill`,
        !nonlethal.dead &&
          !nonlethal.headGone &&
          nonlethal.headshots === before.headshots,
      );
      await page.evaluate(() => window.__bloodAudit.shot(true, true));
      const killed = await page.evaluate(() => window.__bloodAudit.state());
      check(
        `${profile}: lethal headshot removes facial geometry, leaves neck wound and rewards once`,
        killed.dead &&
          killed.headGone &&
          killed.headSpan < 0.003 &&
          killed.stump &&
          killed.headshots === before.headshots + 1 &&
          killed.kills === before.kills + 1 &&
          killed.points > before.points &&
          killed.headBursts === before.headBursts + 1,
      );
      check(
        `${profile}: same-type neighbor keeps its own head`,
        killed.friendAlive && killed.friendSpan > 0.15,
      );
      await capture("head-burst");
      await page.evaluate(() => window.__bloodAudit.advance(0.17));
      await capture("head-fragments");
      await page.evaluate(() => window.__bloodAudit.advance(0.45, true));
      await capture("headless-body");
      await page.evaluate(() =>
        window.__vesper.damageEnemy(window.__bloodAudit.target, 999, true),
      );
      const repeated = await page.evaluate(() => window.__bloodAudit.state());
      check(
        `${profile}: corpse cannot produce duplicate explosion or rewards`,
        repeated.headBursts === killed.headBursts &&
          repeated.headshots === killed.headshots &&
          repeated.kills === killed.kills,
      );
      for (const type of ["runner", "brute", "spitter", "wraith"]) {
        const result = await page.evaluate((type) => {
          const a = window.__bloodAudit;
          a.setup(type);
          a.shot(true, true);
          return a.state();
        }, type);
        check(
          `${profile}: ${type} decapitation preserves neighboring rig`,
          result.headGone &&
            result.headSpan < 0.003 &&
            result.friendAlive &&
            result.friendSpan > 0.15,
        );
        await capture(`${type}-headshot`);
      }
      const controls = await page.evaluate(() => {
        const a = window.__bloodAudit,
          g = window.__vesper;
        a.setup();
        a.shot(false, true);
        const bodyDeath = a.state();
        a.setup();
        const before = a.state();
        g.world.obstacles.push({
          x: 0,
          z: g.player.position.z - 1.3,
          w: 3,
          d: 0.4,
          h: 3,
        });
        a.shot(true, true);
        g.world.obstacles.pop();
        const blocked = a.state();
        return {
          bodyDeath:
            bodyDeath.dead && !bodyDeath.headGone && bodyDeath.headSpan > 0.15,
          blocked:
            !blocked.dead &&
            !blocked.headGone &&
            blocked.bursts === before.bursts,
        };
      });
      for (const [name, ok] of Object.entries(controls))
        check(`${profile}: ${name}`, ok);
      const projection = await page.evaluate(() => {
        const g = window.__vesper,
          blood = g.combatEffects.blood;
        const wall = g.world.obstacles.find(
          (o) => o.active !== false && o.bloodSurface && o.d > 20 && o.x > 0,
        );
        const position = g.player.position
          .clone()
          .set(wall.x - wall.w / 2 - 0.7, 1.5, 18);
        const before = blood.stainCursor;
        g.projectBlood(position, position.clone().set(1, 0, 0), true);
        blood.update(0.016);
        g.camera.position
          .copy(position)
          .add(position.clone().set(-1.8, 0.1, 0));
        g.camera.lookAt(position.clone().add(position.clone().set(0.7, 0, 0)));
        g.camera.updateMatrixWorld(true);
        return blood.stainCursor === before + 1;
      });
      check(`${profile}: nearby wall receives a blood decal`, projection);
      await capture("wall-splatter");
      check(
        `${profile}: invisible boundary cannot receive a floating decal`,
        await page.evaluate(() => {
          const g = window.__vesper,
            b = g.combatEffects.blood;
          const before = b.stainCursor;
          g.projectBlood(
            g.player.position.clone().set(0, 1.5, 28),
            g.player.position.clone().set(0, 0, 1),
            true,
          );
          return b.stainCursor === before;
        }),
      );
      if (!process.argv.includes("--quick")) {
        for (const map of ["station", "abyss"]) {
          stage = `loading and headshot ${map}`;
          const result = await page.evaluate(
            async ({ map, mobile }) => {
              await window.__vesper.start(map, "normal", mobile);
              window.__bloodAudit.setup();
              window.__bloodAudit.shot(true, true);
              return window.__bloodAudit.state();
            },
            { map, mobile },
          );
          check(
            `${profile}: headshot works in ${map}`,
            result.dead && result.headGone && result.particles > 0,
          );
          await capture(`${map}-headshot`);
        }
      }
      stage = "pooled effects";
      const baseline = await page.evaluate(() => {
        window.__bloodAudit.setup();
        window.__bloodAudit.shot(true, true);
        return { ...window.__vesper.renderer.info.memory };
      });
      await page.waitForTimeout(150);
      const bounded = await page.evaluate(() => {
        const g = window.__vesper,
          b = g.combatEffects.blood;
        const before = { ...g.renderer.info.memory };
        for (let i = 0; i < 600; i++)
          b.hit(
            g.player.position.clone().set(0, 1.8, g.player.position.z - 2),
            g.player.position.clone().set(0, 0, -1),
            i % 3 === 0,
          );
        window.__bloodAudit.advance(1.5);
        return {
          before,
          max: b.particles.length,
          actual: b.drops.count,
          splats: b.splats.count,
          maxSplats: b.stains.length,
        };
      });
      await page.waitForTimeout(100);
      const memory = await page.evaluate(() => ({
        ...window.__vesper.renderer.info.memory,
      }));
      check(
        `${profile}: 600 bursts keep GPU allocations bounded`,
        memory.geometries <= bounded.before.geometries + 1 &&
          memory.textures <= bounded.before.textures + 1 &&
          bounded.actual <= bounded.max &&
          bounded.splats <= bounded.maxSplats &&
          baseline.textures <= memory.textures + 1,
      );
      const expired = await page.evaluate(() => {
        window.__bloodAudit.advance(30);
        const b = window.__vesper.combatEffects.blood;
        return (
          b.drops.count === 0 && b.spray.count === 0 && b.splats.count === 0
        );
      });
      check(`${profile}: particles and stains expire completely`, expired);
      if (!safari && !process.argv.includes("--quick")) {
        stage = "horde stress";
        await page.evaluate(() => {
          const g = window.__vesper;
          window.__bloodAudit.setup();
          while (g.enemies.length < 28) {
            const i = g.enemies.length;
            g.spawnEnemy(
              ["walker", "runner", "brute", "spitter", "wraith"][i % 5],
              g.player.position
                .clone()
                .set(
                  ((i % 7) - 3) * 1.7,
                  0,
                  g.player.position.z - 6 - Math.floor(i / 7) * 2,
                ),
            );
            g.enemies.at(-1).model.position.y = 0;
          }
          g.enemies.forEach((e) => {
            e.health = 1e8;
            e.attack = 1e6;
          });
          g.yaw = 0;
          g.pitch = 0;
          g.state = "playing";
          let i = 0;
          window.__bloodStress = setInterval(() => {
            const e = g.enemies[i++ % g.enemies.length];
            const p = e.model.position.clone();
            p.y += 1.5;
            g.combatEffects.blood.hit(p, p.clone().set(0, 0, -1), i % 4 === 0);
          }, 80);
        });
        await page.waitForTimeout(12000);
        const performance = await page.evaluate(async () => {
          const g = window.__vesper,
            frames = [];
          let last = window.performance.now();
          for (let i = 0; i < 120; i++) {
            await new Promise(requestAnimationFrame);
            const t = window.performance.now();
            frames.push(t - last);
            last = t;
          }
          frames.sort((a, b) => a - b);
          clearInterval(window.__bloodStress);
          return {
            fps: Math.round(1000 / frames[60]),
            p95: frames[114],
            ratio: g.renderSize.ratio,
            enemies: g.enemies.length,
            particles: g.combatEffects.blood.drops.count,
            maxParticles: g.combatEffects.blood.particles.length,
          };
        });
        report.performance.push({ profile, map: "abyss", ...performance });
        check(
          `${profile}: blood stress stays within its particle pool`,
          performance.enemies === 28 &&
            performance.particles <= performance.maxParticles,
        );
      }
      stage = "disposal";
      const disposal = await page.evaluate(() => {
        const g = window.__vesper,
          root = g.combatEffects.blood.root;
        let geometries = 0,
          materials = 0,
          textures = 0;
        root.traverse((o) => {
          o.geometry?.addEventListener("dispose", () => geometries++);
          o.material?.addEventListener("dispose", () => materials++);
          o.material?.map?.addEventListener("dispose", () => textures++);
        });
        g.menu();
        return (
          geometries === 3 &&
          materials === 3 &&
          textures === 2 &&
          !g.combatEffects
        );
      });
      check(`${profile}: menu releases all blood GPU resources`, disposal);
    } finally {
      await browser.close();
    }
  }
  check("No JavaScript, shader or resource errors", report.errors.length === 0);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(out);
}
