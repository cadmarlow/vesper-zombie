import { chromiumOptions } from "./browser.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { openGameAudit } from "./game-audit.mjs";

process.env.VESPER_URL ||= "http://localhost:4173";
const out = `artifacts/zombies-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = { out, errors: [], models: [], checks: [] };
async function capture(page, options) {
  // Inspection poses are frozen deliberately. The production loop does not
  // redraw an idle frame unless asked, so render the pose before photographing.
  await page.evaluate(() => window.__vesper.composer.render());
  await page.screenshot(options);
}
try {
  for (const mobile of [false, true]) {
    const profile = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1200, height: 900 },
      deviceScaleFactor: mobile ? 2 : 1,
      hasTouch: mobile,
      isMobile: mobile,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (e) => {
      if (e.type() === "error") report.errors.push(e.text());
    });
    await openGameAudit(page);
    await page.click("#play-button");
    await page.waitForFunction(
      () => window.__vesper?.state === "playing",
      null,
      { timeout: 30000 },
    );
    await page.addStyleTag({
      content:
        "body>*:not(canvas):not(script):not(link):not(style){visibility:hidden!important} canvas{visibility:visible!important} #minimap{visibility:hidden!important}",
    });
    await page.evaluate(() => {
      const g = window.__vesper;
      g.phaseTimer = 1e6;
      g.player.invulnerable = 1e6;
      for (const type of ["walker", "runner", "brute", "spitter", "wraith"]) {
        g.spawnEnemy(type, g.player.position.clone().set(0, 0, 15));
        g.enemies.at(-1).model.position.y = 0;
        g.enemies.at(-1).stagger = 1e6;
      }
    });
    await page.waitForTimeout(150);
    const animation = await page.evaluate(async () => {
      const g = window.__vesper;
      const first = g.enemies.map((e) => e.model.userData.jaw?.rotation.x);
      await new Promise((r) => setTimeout(r, 350));
      const second = g.enemies.map((e) => e.model.userData.jaw?.rotation.x);
      return { first, second };
    });
    assert(
      animation.first.every(Number.isFinite),
      `${profile}: all five jaws exist`,
    );
    assert(
      animation.second.every((x, i) => x !== animation.first[i]),
      `${profile}: all five jaws animate`,
    );
    report.checks.push(`${profile}: five independent animated jaws`);
    // Studio inspection uses the actual compiled game models and render chain.
    // It supplements, rather than replaces, the in-map combat captures below.
    await page.evaluate(() => {
      const g = window.__vesper;
      g.state = "audit";
      g.scene.children.forEach((o) => {
        o.visible = false;
      });
      g.scene.fog = null;
      g.scene.background.set(0x151b20);
      const hemi = g.world.hemi.clone();
      hemi.color.set(0xc4d6e5);
      hemi.groundColor.set(0x5a4a41);
      hemi.intensity = 1.4;
      const key = g.world.sun.clone();
      key.castShadow = false;
      key.position.set(-2, 3.5, 4);
      key.color.set(0xffead5);
      key.intensity = 3.2;
      const rim = key.clone();
      rim.position.set(2, 2, -3);
      rim.color.set(0x8dacbe);
      rim.intensity = 4;
      g.scene.add(hemi, key, rim);
      g.ao.enabled = false;
      g.viewPass.enabled = false;
      g.camera.fov = 38;
      g.camera.updateProjectionMatrix();
      g.enemies.forEach(({ model }) => {
        model.position.set(0, 0, 0);
        model.rotation.set(0, 0, 0);
        model.traverse((o) => {
          if (o.isBone) o.rotation.set(0, 0, 0);
        });
        model.userData.jaw.rotation.x = 0.14;
      });
    });
    for (const type of ["walker", "runner", "brute", "spitter", "wraith"]) {
      const model = await page.evaluate((type) => {
        const g = window.__vesper;
        const e = g.enemies.find((e) => e.type === type);
        g.enemies.forEach((e) => {
          e.model.visible = e.type === type;
        });
        const scale = e.model.scale.x;
        g.camera.position.set(0, 1.78 * scale, 0.82 * scale);
        g.camera.lookAt(0, 1.78 * scale, 0);
        let meshes = 0,
          vertices = 0,
          triangles = 0;
        e.model.traverse((o) => {
          if (o.isSkinnedMesh) {
            meshes++;
            vertices += o.geometry.attributes.position.count;
            triangles +=
              (o.geometry.index?.count ||
                o.geometry.attributes.position.count) / 3;
            if (
              o.skeleton.bones.some(
                (b) => !b.matrixWorld.elements.every(Number.isFinite),
              )
            )
              throw new Error("Invalid bone transform");
          }
        });
        return { type, meshes, vertices, triangles };
      }, type);
      report.models.push({ profile, ...model });
      await page.waitForTimeout(180);
      await capture(page, { path: `${out}/${profile}-${type}-face.png` });
      await page.evaluate((type) => {
        const g = window.__vesper;
        const e = g.enemies.find((e) => e.type === type);
        e.model.rotation.y = -0.65;
        e.model.userData.jaw.rotation.x = 0.38;
      }, type);
      await page.waitForTimeout(180);
      await capture(page, { path: `${out}/${profile}-${type}-jaw.png` });
      await page.evaluate((type) => {
        const g = window.__vesper,
          e = g.enemies.find((e) => e.type === type),
          s = e.model.scale.x;
        g.camera.fov = 45;
        g.camera.updateProjectionMatrix();
        g.camera.position.set(0, 1.05 * s, 2.8 * s);
        g.camera.lookAt(0, 1.05 * s, 0);
      }, type);
      await page.waitForTimeout(100);
      await capture(page, { path: `${out}/${profile}-${type}-body.png` });
      await page.evaluate(() => {
        const g = window.__vesper;
        g.camera.fov = 38;
        g.camera.updateProjectionMatrix();
      });
    }
    // Actual wave-one lighting and player camera, with every enemy type nearby.
    for (const map of ["abbey", "station"]) {
      await page.evaluate(
        async ({ map, mobile }) => {
          const g = window.__vesper;
          await g.start(map, "normal", mobile);
          g.phaseTimer = 1e6;
          g.player.invulnerable = 1e6;
          g.player.position.set(0, 1.7, 20);
          g.yaw = 0;
          g.pitch = 0;
        },
        { map, mobile },
      );
      for (const type of ["walker", "runner", "brute", "spitter", "wraith"]) {
        await page.evaluate((type) => {
          const g = window.__vesper;
          g.enemies.forEach((e) => {
            e.model.visible = false;
          });
          g.spawnEnemy(type, g.player.position.clone().set(0, 0, 17.5));
          const e = g.enemies.at(-1);
          e.model.position.y = 0;
          e.stagger = 1e6;
        }, type);
        await page.waitForTimeout(250);
        await capture(page, {
          path: `${out}/${profile}-${map}-${type}-combat.png`,
        });
      }
    }
    for (const quality of ["high", "low"]) {
      const checks = await page.evaluate(
        ({ quality, mobile }) => {
          const g = window.__vesper,
            results = [];
          g.applySettings({ ...g.settings, quality });
          for (const type of [
            "walker",
            "runner",
            "brute",
            "spitter",
            "wraith",
          ]) {
            g.enemies.forEach((e) => {
              e.dead = true;
              e.deathTime = 0;
            });
            g.updateEnemies(0.001);
            g.player.position.set(0, 1.7, 20);
            g.spawnEnemy(type, g.player.position.clone().set(0, 0, 17.5));
            const e = g.enemies.at(-1);
            e.model.position.y = 0;
            e.stagger = 1e6;
            g.time += 0.016;
            g.updateEnemies(0.016);
            const idleJaw = e.model.userData.jaw.rotation.x;
            e.model.position.z = 18.8;
            e.attack = 0;
            let attackJaw = idleJaw;
            for (let frame = 0; frame < 40; frame++) {
              g.time += 1 / 60;
              g.updateEnemies(1 / 60);
              attackJaw = Math.max(attackJaw, e.model.userData.jaw.rotation.x);
            }
            const textures = [];
            e.model.traverse((o) => {
              const image = o.material?.map?.image;
              if (image?.src?.includes("/creatures/"))
                textures.push({ src: image.src, width: image.width });
            });
            e.model.position.z = 17.5;
            e.model.updateMatrixWorld(true);
            e.health = 1;
            const target = e.model.userData.head.getWorldPosition(
              e.model.position.clone(),
            );
            g.camera.position.copy(g.player.position);
            g.camera.lookAt(target);
            g.camera.updateMatrixWorld(true);
            g.state = "playing";
            g.shotTimer = g.reloadTime = g.meleeTimer = 0;
            g.weapon.ammo = 12;
            g.mouse.aim = true;
            const headshots = g.player.headshots;
            g.shoot();
            results.push({
              type,
              quality,
              attacking: attackJaw > idleJaw + 0.1,
              headshot: e.dead && g.player.headshots === headshots + 1,
              textures:
                textures.some((t) => t.src.includes("face-")) &&
                textures.some((t) => t.src.includes("skin-")) &&
                textures.every((t) => t.width === (mobile ? 512 : 1024)),
            });
          }
          g.mouse.aim = false;
          return results;
        },
        { quality, mobile },
      );
      for (const check of checks) {
        assert(
          check.attacking,
          `${profile} ${quality} ${check.type}: attack opens the jaw`,
        );
        assert(
          check.headshot,
          `${profile} ${quality} ${check.type}: aimed shot hits visible head`,
        );
        assert(
          check.textures,
          `${profile} ${quality} ${check.type}: face and skin maps have correct resolution`,
        );
        report.checks.push({ profile, ...check });
      }
    }
    await context.close();
    console.log(
      `${profile}: all five types captured in studio, attack pose and both maps`,
    );
  }
  assert.deepEqual(report.errors, [], "No JavaScript, shader or asset errors");
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  const names = {
    walker: "Égaré",
    runner: "Affamé",
    brute: "Pénitent",
    spitter: "Porte-peste",
    wraith: "Rémanent",
  };
  const sections = [
    ["Visages · ordinateur", "desktop", "face"],
    ["Mâchoires ouvertes · ordinateur", "desktop", "jaw"],
    ["Silhouettes · ordinateur", "desktop", "body"],
    ["Visages · mobile émulé", "mobile", "face"],
    ["Combat · Abbaye des Cendres", "desktop-abbey", "combat"],
    ["Combat · Complexe Boréal · mobile émulé", "mobile-station", "combat"],
  ];
  fs.writeFileSync(
    `${out}/gallery.html`,
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VESPER 2.1 · Les cinq zombies</title><style>body{background:#11171a;color:#dbe1dc;font:16px/1.5 system-ui;margin:32px auto;max-width:1600px;padding:0 20px}h1{font-weight:600}p{color:#a9b3b2}section{margin:44px 0}h2{font-size:20px}div{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}figure{margin:0;background:#1b2428}img{display:block;width:100%;height:auto}figcaption{padding:12px}a{color:inherit}small{color:#a9b3b2}</style><h1>VESPER 2.1 · Les cinq zombies</h1><p>Captures des modèles réellement rendus dans le build local. Les portraits utilisent un éclairage de contrôle ; les captures de combat utilisent les cartes et la caméra du joueur. Mobile émulé sur Mac.</p>${sections
      .map(
        ([title, prefix, suffix]) =>
          `<section><h2>${title}</h2><div>${Object.entries(names)
            .map(
              ([type, name]) =>
                `<figure><a href="${prefix}-${type}-${suffix}.png"><img loading="lazy" src="${prefix}-${type}-${suffix}.png" alt="${name}"></a><figcaption>${name}</figcaption></figure>`,
            )
            .join("")}</div></section>`,
      )
      .join(
        "",
      )}<small>Les images sont des captures de validation, pas des illustrations générées.</small></html>`,
  );
  console.log(out);
  await browser.close();
}
