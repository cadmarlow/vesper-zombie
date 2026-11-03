import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, webkit } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { createStaticServer } from "./serve.mjs";
import { openGameAudit } from "./game-audit.mjs";

const out = process.env.SUPPLY_OUTPUT || `artifacts/supplies-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const captureOnly = !!process.env.SUPPLY_CAPTURE_ONLY;
const report = { checks: [], views: [], errors: [], warnings: [] };
const factory = process.env.SUPPLY_BASELINE
  ? (
      await import(
        pathToFileURL(
          path.resolve(process.env.SUPPLY_BASELINE, "scripts/serve.mjs"),
        )
      )
    ).createStaticServer
  : createStaticServer;
const server = process.env.VESPER_URL ? null : factory();
if (server) {
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  process.env.VESPER_URL = `http://127.0.0.1:${server.address().port}`;
}
const check = (name, ok, detail) => {
  report.checks.push({ name, passed: !!ok, detail });
  assert(ok, `${name}: ${JSON.stringify(detail)}`);
  console.log("PASS", name);
};
let browser;
try {
  for (const profile of process.env.SUPPLY_PROFILE
    ? [process.env.SUPPLY_PROFILE]
    : ["desktop", "mobile", "webkit"]) {
    browser = await (profile === "webkit" ? webkit : chromium).launch({
      headless: true,
      ...(profile === "webkit"
        ? {}
        : {
            ...chromiumOptions,
            args: ["--enable-webgl", "--ignore-gpu-blocklist"],
          }),
    });
    const page = await browser.newPage({
      viewport:
        profile === "desktop"
          ? { width: 1440, height: 900 }
          : { width: 844, height: 390 },
      isMobile: profile !== "desktop",
      hasTouch: profile !== "desktop",
    });
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") report.errors.push(m.text());
      if (m.type() === "warning" && m.text().includes("Supply model"))
        report.warnings.push(m.text());
    });
    await openGameAudit(page);
    await page.click("#play-button");
    await page.waitForFunction(
      () => window.__vesper?.state === "playing",
      null,
      { timeout: 90000 },
    );
    for (const map of profile === "webkit"
      ? ["abbey", "lacuna"]
      : ["abbey", "station", "abyss", "lacuna"]) {
      await page.evaluate(
        async ({ map, touch }) => {
          const g = window.__vesper;
          await g.start(map, "normal", touch);
          g.state = "audit";
          g.phaseTimer = 3600;
          g.player.invulnerable = 1e9;
          g.sound.setVolume(0);
          for (const d of g.world.doors) {
            g.world.openDoor(d);
            d.bars.position.y = 6.3;
          }
          g.world.update(0, 12);
          g.viewModel.hide();
          g.hudTimer = 0;
          g.updateHUD();
        },
        { map, touch: profile !== "desktop" },
      );
      const services = await page.evaluate(() => {
        const g = window.__vesper;
        const find = (kind) =>
          g.world.interactions.find((i) => i.kind === kind);
        const standby = [
          "health",
          "speed",
          "rate",
          "focus",
          "power",
          "upgrade",
        ].every((kind) => find(kind).screen.material.emissiveIntensity < 0.05);
        const ammoReady = find("ammo").screen.material.emissiveIntensity > 1;
        const use = (kind) => {
          const i = find(kind),
            front = i.position
              .clone()
              .set(0, 0, 1)
              .applyQuaternion(i.root.quaternion);
          g.player.position.copy(i.position).addScaledVector(front, 1.8);
          g.interact();
          g.world.update(0.1, 12);
          return i;
        };
        g.state = "playing";
        g.player.points = 100000;
        const initial = find("power").lever.rotation.x;
        const generator = use("power");
        const lever =
          generator.lever.rotation.x !== initial &&
          generator.lever.rotation.x === 0.6;
        g.world.powerTime = 4;
        g.world.update(0.1, 12);
        g.weapon.reserve = 0;
        g.player.grenades = 0;
        const beforeAmmo = g.player.points,
          ammo = use("ammo");
        const refilled =
          g.weapon.reserve > 0 &&
          g.player.grenades === 3 &&
          g.player.points === beforeAmmo - 350;
        const tray =
          ammo.machine.parts.tray.position.z > ammo.machine.rest.tray.z;
        const beforeUpgrade = g.player.points,
          upgrade = use("upgrade");
        const upgraded =
          g.weapon.level === 1 &&
          g.player.points === beforeUpgrade - 3000 &&
          upgrade.machine.parts.tray.position.z > upgrade.machine.rest.tray.z;
        const rotor =
          Math.abs(upgrade.machine.parts.rotor.rotation.z) > 0.01 &&
          Math.abs(generator.machine.parts.rotor.rotation.z) > 0.01;
        g.state = "audit";
        g.viewModel.hide();
        return { standby, ammoReady, lever, refilled, tray, upgraded, rotor };
      });
      if (!captureOnly)
        check(
          `${profile}/${map}: service mechanisms follow actual purchases and power`,
          Object.values(services).every(Boolean),
          services,
        );
      for (const kind of [
        "health",
        "speed",
        "rate",
        "focus",
        "power",
        "ammo",
        "upgrade",
      ]) {
        const view = await page.evaluate(
          ({ kind }) => {
            const g = window.__vesper,
              i = g.world.interactions.find((i) => i.kind === kind);
            const front = g.player.position
              .clone()
              .set(0, 0, 1)
              .applyQuaternion(i.root.quaternion);
            const right = g.player.position
              .clone()
              .set(1, 0, 0)
              .applyQuaternion(i.root.quaternion);
            g.camera.position
              .copy(i.position)
              .addScaledVector(front, 3.2)
              .addScaledVector(right, 1.05);
            g.camera.position.y = 1.75;
            const target = i.position.clone();
            target.y = 1.36;
            g.camera.lookAt(target);
            g.camera.updateMatrixWorld(true);
            g.player.position.copy(g.camera.position);
            g.renderer.info.autoReset = false;
            g.renderer.info.reset();
            g.renderer.shadowMap.needsUpdate = true;
            g.composer.render();
            const meshes = [];
            i.root.traverse((o) => {
              if (o.isMesh) meshes.push(o);
            });
            return {
              name: i.name,
              power: i.screen.material.emissiveIntensity,
              meshes: meshes.length,
              triangles: meshes.reduce(
                (n, o) =>
                  n +
                  (o.geometry.index?.count ||
                    o.geometry.attributes.position.count) /
                    3,
                0,
              ),
              calls: g.renderer.info.render.calls,
              sceneTriangles: g.renderer.info.render.triangles,
            };
          },
          { kind },
        );
        const file = `${out}/${profile}-${map}-${kind}.png`;
        await page.screenshot({ path: file });
        report.views.push({ profile, map, kind, file, ...view });
        if (!captureOnly)
          check(
            `${profile}/${map}/${kind}: physical machine is powered`,
            view.power > (kind === "ammo" ? 1 : 2.9) &&
              view.triangles > 2000 &&
              view.meshes < 14,
            view,
          );
      }
      const drops = await page.evaluate(() => {
        const g = window.__vesper;
        g.camera.position.copy(g.world.spawn);
        g.camera.position.y = 1.8;
        g.player.position.copy(g.camera.position);
        const point = g.world.spawn.clone();
        point.z -= 4;
        point.y = 0.8;
        g.camera.lookAt(point);
        g.camera.updateMatrixWorld(true);
        for (const [index, type] of [
          "health",
          "ammo",
          "double",
          "insta",
        ].entries()) {
          const p = point.clone();
          p.x += (index - 1.5) * 0.95;
          g.drop(p, type);
          const pickup = g.pickups.at(-1);
          if (pickup.mesh.userData.pickup)
            pickup.mesh.userData.pickup.body.rotation.y = 0.25;
        }
        g.renderer.shadowMap.needsUpdate = true;
        g.composer.render();
        return g.pickups.map((p) => ({
          type: p.type,
          newModel: !!p.mesh.userData.pickup,
          life: p.life,
        }));
      });
      await page.screenshot({ path: `${out}/${profile}-${map}-pickups.png` });
      if (!captureOnly)
        check(
          `${profile}/${map}: four distinct physical pickups`,
          drops.length === 4 && drops.every((p) => p.newModel),
          drops,
        );
      if (!captureOnly) {
        const result = await page.evaluate(() => {
          const g = window.__vesper;
          for (const p of g.pickups) p.life = 0;
          g.updateEffects(0);
          const at = g.player.position.clone();
          g.player.health = 20;
          g.drop(at, "health");
          g.updateEffects(0);
          const health = g.player.health;
          g.weapons.forEach((w) => (w.reserve = 0));
          g.drop(at, "ammo");
          g.updateEffects(0);
          const ammo = g.weapons.every((w) => w.reserve > 0);
          g.drop(at, "double");
          g.updateEffects(0);
          const double = g.powerups.double - g.time;
          g.drop(at, "insta");
          g.updateEffects(0);
          const insta = g.powerups.insta - g.time;
          const distant = at.clone();
          distant.x += 10;
          g.drop(distant, "ammo");
          g.drop(distant, "ammo");
          const geometries = (p) => {
            const a = [];
            p.mesh.traverse((o) => {
              if (o.isMesh) a.push(o.geometry);
            });
            return a;
          };
          const a = geometries(g.pickups[0]),
            b = geometries(g.pickups[1]);
          const shared = a.length > 2 && a.every((geo, i) => geo === b[i]);
          let disposed = 0;
          for (const geo of a)
            geo.addEventListener("dispose", () => disposed++);
          g.pickups[0].life = 0.01;
          g.updateEffects(0.02);
          const survives = g.pickups.length === 1 && disposed === 0;
          g.pickups[0].life = 0;
          g.updateEffects(0);
          return {
            health,
            ammo,
            double,
            insta,
            shared,
            survives,
            remaining: g.pickups.length,
          };
        });
        check(
          `${profile}/${map}: collection preserves all four effects`,
          result.health === 70 &&
            result.ammo &&
            result.double === 25 &&
            result.insta === 18,
          result,
        );
        check(
          `${profile}/${map}: expiry protects shared models and removes the instance`,
          result.shared && result.survives && result.remaining === 0,
          result,
        );
      }
      if (map === "abbey") {
        const stress = await page.evaluate(() => {
          const g = window.__vesper,
            renderer = g.renderer;
          for (const p of g.pickups) p.life = 0;
          g.updateEffects(0);
          g.camera.position.copy(g.world.spawn);
          g.player.position.copy(g.camera.position);
          const look = g.world.spawn.clone();
          look.z -= 7;
          look.y = 0.8;
          g.camera.lookAt(look);
          g.camera.updateMatrixWorld(true);
          const render = () => {
            renderer.info.autoReset = false;
            renderer.info.reset();
            g.composer.render();
            return {
              calls: renderer.info.render.calls,
              triangles: renderer.info.render.triangles,
              ...renderer.info.memory,
            };
          };
          const before = render();
          for (let i = 0; i < 24; i++) {
            const p = look.clone();
            p.x += ((i % 6) - 2.5) * 0.9;
            p.z += Math.floor(i / 6) * 0.65;
            g.drop(p, ["health", "ammo", "double", "insta"][i % 4]);
          }
          const loaded = render(),
            times = [];
          for (let f = 0; f < 180; f++) {
            g.time += 1 / 60;
            const start = performance.now();
            g.updateEffects(1 / 60);
            times.push(performance.now() - start);
          }
          const finite =
            g.pickups.length === 24 &&
            g.pickups.every((p) =>
              p.mesh.position.toArray().every(Number.isFinite),
            );
          for (const p of g.pickups) p.life = 0;
          g.updateEffects(0);
          const warm = render();
          for (let round = 0; round < 40; round++) {
            for (const type of ["health", "ammo", "double", "insta"])
              g.drop(look, type);
            for (const p of g.pickups) p.life = 0.001;
            g.updateEffects(0.002);
          }
          const after = render();
          renderer.info.autoReset = true;
          times.sort((a, b) => a - b);
          return {
            before,
            loaded,
            warm,
            after,
            finite,
            median: times[90],
            p95: times[171],
          };
        });
        report.views.push({ profile, map, stress });
        check(
          `${profile}: 24 simultaneous pickups remain finite`,
          stress.finite,
          stress,
        );
        check(
          `${profile}: repeated pickup expiry keeps GPU resources bounded`,
          stress.after.geometries <= stress.warm.geometries + 1 &&
            stress.after.textures <= stress.warm.textures + 1,
          stress,
        );
      }
    }
    await browser.close();
    browser = null;
  }
  check(
    "No browser, shader or missing-model errors",
    !report.errors.length && !report.warnings.length,
    { errors: report.errors, warnings: report.warnings },
  );
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  console.log("Report:", out);
}
