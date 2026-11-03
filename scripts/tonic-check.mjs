import { chromium, webkit } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { openGameAudit } from "./game-audit.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = process.env.TONIC_OUTPUT || `artifacts/tonics-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [], views: [] };
const check = (label, ok, detail) => {
  report.checks.push({ label, ok, detail });
  console.log(ok ? "PASS" : "FAIL", label, detail || "");
  assert(ok, label);
};
let browser;
try {
  for (const profile of process.env.TONIC_PROFILE
    ? [process.env.TONIC_PROFILE]
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
      hasTouch: profile !== "desktop",
      isMobile: profile !== "desktop",
    });
    page.on("pageerror", (e) => report.errors.push(e.stack));
    page.on("console", (m) => {
      if (m.type() === "error" || /Supply model unavailable/.test(m.text()))
        report.errors.push(m.text());
    });
    await openGameAudit(page);
    await page.click("#play-button");
    await page.waitForFunction(
      () => window.__vesper?.state === "playing",
      null,
      { timeout: 90000 },
    );
    await page.evaluate(async (touch) => {
      const g = window.__vesper;
      g.loop = () => {};
      await g.start("abbey", "normal", touch);
      g.phaseTimer = 1e5;
      g.player.invulnerable = 1e8;
      g.player.points = 1e5;
      g.world.setPower();
      g.world.powerTime = 4;
      g.world.update(0, 0);
      g.sound.setVolume(0);
      g.updatePlayer(0.016);
    }, profile !== "desktop");
    await page.addStyleTag({
      content: "#announcement,#toast-container{visibility:hidden!important}",
    });
    for (const kind of ["health", "speed", "rate", "focus"]) {
      const start = await page.evaluate((kind) => {
        const g = window.__vesper,
          i = g.world.interactions.find((i) => i.kind === kind);
        const front = i.position
          .clone()
          .set(0, 0, 1)
          .applyQuaternion(i.root.quaternion);
        g.player.position.copy(i.position).addScaledVector(front, 1.9);
        g.yaw = Math.atan2(front.x, front.z);
        g.pitch = 0;
        g.player.health = 50;
        g.interact();
        return {
          kind: g.run.tonic?.kind,
          perks: [...g.player.perks],
          points: g.player.points,
          weapon: g.weapon.id,
          near: g.nearInteraction()?.kind,
        };
      }, kind);
      check(
        `${profile}/${kind}: purchase reserves a real drink before effect`,
        start.kind === kind && !start.perks.includes(kind),
        start,
      );
      for (const t of [
        0.12, 0.55, 0.85, 1.05, 1.26, 1.52, 1.8, 2.2, 2.5, 2.8,
      ]) {
        const result = await page.evaluate(
          ({ t }) => {
            const g = window.__vesper,
              dt = Math.max(0, t - (g.run.tonic?.elapsed || 0));
            g.tonics.update(dt);
            g.updatePlayer(0.016);
            const vm = g.viewModel,
              view = vm.tonicView,
              model = view.current;
            g.renderer.autoClear = true;
            g.composer.render();
            g.renderer.autoClear = false;
            g.renderer.clearDepth();
            g.renderer.render(g.viewScene, g.viewCamera);
            g.renderer.autoClear = true;
            const V = g.camera.position.constructor;
            const grip = {};
            for (const [side, s] of [
              ["left", "L"],
              ["right", "R"],
            ]) {
              const actual = vm.arms.bones[
                `Bip01_${s}_Finger2`
              ].getWorldPosition(new V());
              const target = vm.root.localToWorld(view[side].knuckle.clone());
              grip[side] = actual.distanceTo(target);
            }
            const neck = vm.root.worldToLocal(
              model.root.localToWorld(new V(0, 0.235, 0)),
            );
            return {
              t,
              elapsed: g.run.tonic?.elapsed,
              consumed: !!g.run.tonic?.consumed,
              perks: g.player.perks.slice(),
              bottle: view.root.visible,
              weapon: vm.weapon?.visible,
              cap: model.cap?.visible,
              fill: model.liquid?.scale.y,
              capGrip: model.cap
                ?.getWorldPosition(new V())
                .distanceTo(vm.root.localToWorld(view.right.knuckle.clone())),
              neck: neck.toArray(),
              grip,
              finite: vm.arms.root.matrixWorld.elements.every(Number.isFinite),
            };
          },
          { t },
        );
        report.views.push({ profile, kind, ...result });
        if (kind === "health")
          await page.screenshot({ path: `${out}/${profile}-${kind}-${t}.png` });
        if (t >= 0.55 && t <= 2.2)
          check(
            `${profile}/${kind}/${t}: bottle owns articulated hands`,
            result.bottle &&
              !result.weapon &&
              result.finite &&
              result.grip.left < 0.03 &&
              result.grip.right < 0.03,
            result.grip,
          );
        if (t >= 0.85 && t <= 1.26)
          check(
            `${profile}/${kind}/${t}: cap stays inside the opening hand`,
            result.cap && result.capGrip < 0.05,
            result.capGrip,
          );
        if (t === 1.52)
          check(
            `${profile}/${kind}: first sip grants perk at the mouth`,
            result.perks.includes(kind) &&
              Math.hypot(
                result.neck[0] + 0.075,
                result.neck[1] + 0.13,
                result.neck[2] + 0.105,
              ) < 0.003,
            result.neck,
          );
        if (t === 2.8)
          check(
            `${profile}/${kind}: weapon returns after the drink`,
            !result.elapsed && !result.bottle && result.weapon,
            result,
          );
      }
    }
    for (const id of [
      "vigil",
      "spectre",
      "marauder",
      "requiem",
      "longinus",
      "eclipse",
    ]) {
      const result = await page.evaluate(async (id) => {
        const g = window.__vesper;
        await g.viewModel.load(id);
        g.weapons = [
          { id, level: 0, ammo: 2, reserve: 60 },
          { id: "vigil", level: 0, ammo: 12, reserve: 84 },
        ];
        g.slot = 0;
        g.setGun();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const machine = g.world.interactions.find((i) => i.kind === "health");
        const front = machine.position
          .clone()
          .set(0, 0, 1)
          .applyQuaternion(machine.root.quaternion);
        g.player.position.copy(machine.position).addScaledVector(front, 1.9);
        g.player.perks = [];
        const before = {
          points: g.player.points,
          grenades: g.player.grenades,
          ammo: g.weapon.ammo,
        };
        g.interact();
        g.switchWeapon(1);
        g.reload();
        g.shoot();
        g.grenade();
        g.melee();
        g.inspectWeapon();
        g.interact();
        g.mouse.aim = true;
        g.updatePlayer(0.016);
        const blocked =
          g.slot === 0 &&
          g.weapon.ammo === before.ammo &&
          g.player.grenades === before.grenades &&
          !g.reloadTime &&
          !g.meleeTimer &&
          !g.run.aiming &&
          g.player.points === before.points - 2000;
        const start = g.player.position.clone();
        g.keys.add("KeyW");
        g.keys.add("ShiftLeft");
        for (let i = 0; i < 35; i++) {
          g.tonics.update(1 / 60);
          g.updatePlayer(1 / 60);
        }
        g.keys.clear();
        const moving = start.distanceTo(g.player.position) > 0.1;
        const bottle =
          g.viewModel.tonicView.root.visible && !g.viewModel.weapon.visible;
        for (let i = 0; i < 140; i++) {
          g.tonics.update(1 / 60);
          g.updatePlayer(1 / 60);
        }
        const returned =
          !g.run.tonic && g.viewModel.weapon.visible && g.viewModel.id === id;
        g.shotTimer = 0;
        g.shoot();
        return {
          blocked,
          moving,
          bottle,
          returned,
          fired: g.weapon.ammo === before.ammo - 1,
        };
      }, id);
      check(
        `${profile}/${id}: drink owns combat, allows movement and restores the same weapon`,
        Object.values(result).every(Boolean),
        result,
      );
    }
    const switching = await page.evaluate(() => {
      const g = window.__vesper,
        i = g.world.interactions.find((i) => i.kind === "health");
      const front = i.position
        .clone()
        .set(0, 0, 1)
        .applyQuaternion(i.root.quaternion);
      g.player.position.copy(i.position).addScaledVector(front, 1.9);
      g.player.perks = [];
      g.switchWeapon(1);
      const wasPending = g.pendingDraw > 0;
      g.interact();
      for (let n = 0; n < 175; n++) {
        g.tonics.update(1 / 60);
        g.updatePlayer(1 / 60);
      }
      return {
        wasPending,
        pending: g.pendingDraw,
        slot: g.slot,
        actual: g.viewModel.id,
        expected: g.weapon.id,
      };
    });
    check(
      `${profile}: buying during a switch returns the selected weapon`,
      switching.wasPending &&
        !switching.pending &&
        switching.slot === 1 &&
        switching.actual === switching.expected,
      switching,
    );
    const interrupted = await page.evaluate(() => {
      const g = window.__vesper;
      g.player.perks = [];
      g.meleeTimer = 0;
      const i = g.world.interactions.find((i) => i.kind === "speed");
      const front = i.position
        .clone()
        .set(0, 0, 1)
        .applyQuaternion(i.root.quaternion);
      g.player.position.copy(i.position).addScaledVector(front, 1.9);
      const points = g.player.points;
      g.interact();
      g.tonics.update(0.8);
      const held = g.run.tonic;
      g.state = "paused";
      g.tonics.update(20);
      const paused = held.elapsed === 0.8 && !g.player.perks.includes("speed");
      g.state = "playing";
      g.player.invulnerable = 0;
      g.hurt(10000);
      return {
        paused,
        refunded: g.player.points === points,
        cleared: !g.run.tonic && !g.viewModel.tonicView.root.visible,
        granted: g.player.perks.includes("speed"),
        ended: g.state === "gameover",
      };
    });
    check(
      `${profile}: pause freezes a drink and lethal interruption refunds it once`,
      interrupted.paused &&
        interrupted.refunded &&
        interrupted.cleared &&
        !interrupted.granted &&
        interrupted.ended,
      interrupted,
    );
    await browser.close();
    browser = null;
  }
  check(
    "no browser, asset or shader errors",
    report.errors.length === 0,
    report.errors,
  );
} finally {
  await browser?.close();
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(out);
}
