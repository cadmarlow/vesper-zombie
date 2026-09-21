import { chromium, webkit } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { openGameAudit } from "./game-audit.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";

process.env.VESPER_URL ||= "http://localhost:4173";
const out = `artifacts/locomotion-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const safari = process.argv.includes("--webkit");
const browser = await (safari ? webkit : chromium).launch({
  headless: true,
  ...(safari ? {} : chromiumOptions),
});
const report = {
  out,
  browser: safari ? "webkit" : "chrome",
  errors: [],
  models: [],
};
const types = ["walker", "runner", "brute", "spitter", "wraith", "archon"];
try {
  for (const mobile of safari ? [true] : [false, true]) {
    const profile = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1100, height: 820 },
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await openGameAudit(page);
    await page.click("#play-button");
    await page.waitForFunction(
      () => window.__vesper?.state === "playing",
      null,
      { timeout: 60000 },
    );
    await page.addStyleTag({
      content:
        "body>*:not(canvas):not(script):not(link):not(style){visibility:hidden!important}canvas{visibility:visible!important}#minimap{visibility:hidden!important}",
    });
    await page.evaluate(() => {
      const g = window.__vesper;
      g.state = "audit";
      g.phaseTimer = 1e6;
      g.player.invulnerable = 1e9;
      g.world.doors.forEach((door) => g.world.openDoor(door));
      g.player.position.set(0, 1.7, 20);
      g.updateNavigation(true);
      g.viewPass.enabled = false;
      g.camera.fov = 42;
      g.camera.updateProjectionMatrix();
      const fill = g.world.hemi.clone();
      fill.intensity = 1.5;
      g.scene.add(fill);
      g.ao.enabled = false;
    });
    for (const type of types) {
      await page.evaluate((type) => {
        const g = window.__vesper;
        for (const e of g.enemies) {
          e.dead = true;
          e.deathTime = 0;
        }
        g.updateEnemies(0.001);
        g.spawnEnemy(type, g.player.position.clone().set(0, 0, 12));
        const e = g.enemies.at(-1);
        e.model.position.y = 0;
        e.model.rotation.y = 0;
        e.attack = e.spit = 100;
        g.__motionAudit = {
          sole: [],
          minSole: Infinity,
          maxSole: -Infinity,
          maxPlantError: 0,
          poses: [],
        };
        // Actual skinned outsole samples, not IK targets or unskinned bounds.
        e.model.traverse((mesh) => {
          if (!mesh.isSkinnedMesh) return;
          const p = mesh.geometry.attributes.position;
          const candidates = [];
          for (let i = 0; i < p.count; i++)
            if (p.getY(i) < 0.031 && p.getY(i) > 0.02) candidates.push(i);
          const stride = Math.max(1, Math.floor(candidates.length / 20));
          for (let i = 0; i < candidates.length; i += stride)
            g.__motionAudit.sole.push({ mesh, index: candidates[i] });
        });
      }, type);
      for (let frame = 0; frame < 4; frame++) {
        await page.evaluate(() => {
          const g = window.__vesper,
            e = g.enemies.at(-1),
            audit = g.__motionAudit;
          const p = g.player.position.clone();
          for (let i = 0; i < 15; i++) {
            g.time += 1 / 60;
            g.updateEnemies(1 / 60);
            e.model.updateMatrixWorld(true);
            for (let footIndex = 0; footIndex < 2; footIndex++) {
              const foot = e.model.userData.motionState.feet[footIndex];
              if (foot.planted) {
                e.model.userData.legs[footIndex].foot.getWorldPosition(p);
                audit.maxPlantError = Math.max(
                  audit.maxPlantError,
                  p.distanceTo(foot.anchor),
                );
              }
            }
            let low = Infinity;
            for (const { mesh, index } of audit.sole) {
              mesh.getVertexPosition(index, p).applyMatrix4(mesh.matrixWorld);
              low = Math.min(low, p.y);
            }
            if (i > 5) {
              audit.minSole = Math.min(audit.minSole, low);
              audit.maxSole = Math.max(audit.maxSole, low);
            }
          }
          const s = e.model.scale.y,
            pos = e.model.position;
          g.camera.position.set(pos.x + 2.5 * s, 1.35 * s, pos.z + 3.6 * s);
          g.camera.lookAt(pos.x, 0.95 * s, pos.z);
          g.view.contactShadows?.update(g.enemies);
          g.composer.render();
          audit.poses.push({
            hips: e.model.userData.hips.position.toArray(),
            head: e.model.userData.head.rotation.toArray().slice(0, 3),
          });
        });
        await page.screenshot({
          path: `${out}/${profile}-${type}-walk-${frame}.png`,
        });
      }
      const check = await page.evaluate(() => {
        const g = window.__vesper,
          e = g.enemies.at(-1),
          audit = g.__motionAudit;
        let finite = true,
          bones = 0;
        e.model.traverse((bone) => {
          if (bone.isBone) {
            bones++;
            finite &&= bone.matrixWorld.elements.every(Number.isFinite);
          }
        });
        return {
          type: e.type,
          bones,
          finite,
          samples: audit.sole.length,
          minSole: audit.minSole,
          maxSole: audit.maxSole,
          maxPlantError: audit.maxPlantError,
          scale: e.model.scale.y,
          poses: audit.poses,
        };
      });
      assert(
        check.finite && check.bones >= 40,
        `${profile}/${type}: articulated finite rig`,
      );
      assert(
        check.samples > 0,
        `${profile}/${type}: outsole measurement exists`,
      );
      assert(
        check.minSole > -0.06 * check.scale,
        `${profile}/${type}: sole penetrates floor (${check.minSole})`,
      );
      assert(
        check.maxPlantError < 0.012 * check.scale,
        `${profile}/${type}: planted ankle misses its anchor (${check.maxPlantError})`,
      );
      // Capture the complete attack arc through the real gameplay controller.
      await page.evaluate(() => {
        const g = window.__vesper,
          e = g.enemies.at(-1);
        e.model.position.set(0, 0, 18.7);
        e.attack = 0;
        e.action = null;
      });
      for (let pose = 0; pose < 3; pose++) {
        await page.evaluate(() => {
          const g = window.__vesper,
            e = g.enemies.at(-1);
          for (let i = 0; i < 13; i++) {
            g.time += 1 / 60;
            g.updateEnemies(1 / 60);
          }
          const s = e.model.scale.y,
            pos = e.model.position;
          g.camera.position.set(pos.x + 2.2 * s, 1.35 * s, pos.z + 3.2 * s);
          g.camera.lookAt(pos.x, 1.0 * s, pos.z);
          e.model.visible = true;
          g.composer.render();
        });
        await page.screenshot({
          path: `${out}/${profile}-${type}-attack-${pose}.png`,
        });
      }
      // Exercise real ranged damage against the currently animated visible head.
      const headshot = await page.evaluate(() => {
        const g = window.__vesper,
          e = g.enemies.at(-1);
        e.model.position.set(0, 0, 17.5);
        e.model.updateMatrixWorld(true);
        g.camera.position.copy(g.player.position);
        g.camera.lookAt(
          e.model.userData.head.getWorldPosition(g.player.position.clone()),
        );
        g.camera.updateMatrixWorld(true);
        g.state = "playing";
        g.shotTimer = g.reloadTime = g.meleeTimer = 0;
        g.weapon.ammo = 12;
        g.mouse.aim = true;
        e.health = 1;
        const before = g.player.headshots;
        g.shoot();
        g.state = "audit";
        g.mouse.aim = false;
        return e.dead && g.player.headshots === before + 1;
      });
      assert(headshot, `${profile}/${type}: real shot hits the animated head`);
      report.models.push({ profile, ...check, headshot });
      await page.evaluate(() => {
        const g = window.__vesper,
          e = g.enemies.at(-1);
        for (let i = 0; i < 60; i++) {
          g.time += 1 / 60;
          g.updateEnemies(1 / 60);
          g.updateEffects(1 / 60);
        }
        g.view.contactShadows?.update(g.enemies);
        const s = e.model.scale.y,
          pos = e.model.position;
        g.camera.position.set(pos.x + 2.2 * s, 1.6 * s, pos.z + 2.2 * s);
        g.camera.lookAt(pos.x, 0.35 * s, pos.z);
        g.composer.render();
      });
      await page.screenshot({ path: `${out}/${profile}-${type}-death.png` });
      console.log(
        `${profile}/${type}: ${check.bones} bones, sole min ${check.minSole.toFixed(3)}, headshot OK`,
      );
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  const groups = report.models
    .map(
      ({ profile, type }) =>
        `<h2>${profile} · ${type}</h2><div>${[0, 1, 2, 3].map((i) => `<img src="${profile}-${type}-walk-${i}.png">`).join("")}${[0, 1, 2].map((i) => `<img src="${profile}-${type}-attack-${i}.png">`).join("")}<img src="${profile}-${type}-death.png"></div>`,
    )
    .join("");
  fs.writeFileSync(
    `${out}/gallery.html`,
    `<!doctype html><meta charset="utf-8"><title>VESPER · Locomotion</title><style>body{background:#12191f;color:#eee;font:16px system-ui;margin:30px}div{display:flex;flex-wrap:wrap;gap:10px}img{width:calc(33% - 10px)}h2{margin-top:40px}</style><h1>VESPER · Démarches et appuis</h1><p>Captures du jeu compilé. Mobile émulé, pas une mesure de téléphone physique.</p>${groups}`,
  );
  console.log(out);
  await browser.close();
}
