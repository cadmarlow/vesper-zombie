// Armory check: every first-person weapon in a real run. Models and arms
// load, every weapon fires, aims and reloads through its own animation
// (magazines, slide lock, pump, bolt, shell-by-shell), rounds pierce bodies
// as specified, the scope and recoil respond, and nothing throws. Writes a
// report and screenshots to artifacts/armory-*/.
//
//   node scripts/armory-check.mjs          (dev server on 5173)
//   VESPER_URL=http://localhost:4173 node scripts/armory-check.mjs
import { chromiumOptions } from "./browser.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openGameAudit } from "./game-audit.mjs";

const out = `artifacts/armory-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const mobile = process.argv.includes("--mobile");
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  viewport: mobile ? { width: 844, height: 390 } : { width: 1440, height: 900 },
  deviceScaleFactor: mobile ? 2 : 1,
  hasTouch: mobile,
  isMobile: mobile,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) =>
  errors.push(
    e.message + " @ " + (e.stack || "").split("\n").slice(1, 4).join(" | "),
  ),
);
page.on("console", (e) => {
  if (e.type() === "error" || /unavailable/i.test(e.text()))
    errors.push(e.text());
});
const report = { out, mobile, checks: [], weapons: {} };
const check = (label, ok, detail) => {
  report.checks.push({ label, ok: !!ok, detail });
  console.log(
    ok ? "PASS" : "FAIL",
    label,
    detail ? JSON.stringify(detail) : "",
  );
  assert(ok, label);
};
const IDS = ["vigil", "spectre", "marauder", "requiem", "longinus", "eclipse"];
try {
  await openGameAudit(page);
  if (mobile) await page.evaluate(() => (window.__vesperTouch = true));
  await page.click("#play-button");
  await page.waitForFunction(() => window.__vesper?.state === "playing", null, {
    timeout: 90000,
  });
  await page.addStyleTag({
    content: "#announcement,#toast-container{visibility:hidden!important}",
  });
  // The armory streams in behind the first rest.
  await page.waitForFunction(
    (ids) => ids.every((id) => window.__vesper.viewModel?.has(id, 0)),
    IDS,
    { timeout: 60000 },
  );
  check("arms and six weapon models loaded", true);
  await page.evaluate(() => {
    const g = window.__vesper;
    g.phaseTimer = 10000;
    g.player.invulnerable = 1e8;
    g.world.setPower();
  });
  for (const id of IDS) {
    const r = await page.evaluate(async (id) => {
      const g = window.__vesper;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      g.weapons[0].id = id;
      g.weapons[0].level = 0;
      g.weapons[0].ammo = 6;
      g.weapons[0].reserve = 60;
      g.setGun({ draw: "quick" });
      await wait(700);
      const vm = g.viewModel;
      const armory = !!g.gun?.userData.armory;
      // Each hand lands on its grip (the IK never stops short) and its
      // fingers close toward the palm, not toward the back of the hand.
      const grip = {};
      for (const [side, s] of [
        ["right", "R"],
        ["left", "L"],
      ]) {
        const bones = vm.arms?.bones || {};
        const V = g.camera.position.constructor;
        const at = (n) => bones[`Bip01_${s}_${n}`]?.getWorldPosition(new V());
        const target = new V().setFromMatrixPosition(
          vm.handTargets?.[side]?.matrix || new g.camera.matrix.constructor(),
        );
        vm.root.localToWorld(target);
        const knuckle = at("Finger2");
        if (!knuckle) continue;
        const f = knuckle.clone().sub(at("Hand")).normalize();
        const l = at("Finger1").sub(at("Finger4"));
        const n = side === "right" ? l.clone().cross(f) : f.clone().cross(l);
        const fore = at("Hand").sub(at("Forearm")).normalize();
        grip[side] = {
          reach: +(knuckle.distanceTo(target) * 1000).toFixed(1),
          // Angle between forearm and hand: a gripping wrist stays straight.
          wrist: +(
            (Math.acos(Math.min(1, fore.dot(f))) * 180) /
            Math.PI
          ).toFixed(1),
          palmward: at("Finger22").sub(knuckle).dot(n) > 0,
        };
      }
      // Three zombies in a file straight ahead, the first at 6 m.
      for (const e of g.enemies) if (!e.dead) g.damageEnemy(e, 1e6, false);
      g.player.position.set(0, 1.7, 18);
      g.yaw = 0;
      g.pitch = 0;
      await wait(100);
      const line = [];
      for (let i = 0; i < 3; i++) {
        g.spawnEnemy(
          "walker",
          g.player.position.clone().set(0, 0, 18 - 6 - i * 1.6),
        );
        const e = g.enemies.at(-1);
        e.model.position.y = 0;
        e.health = e.maxHealth = 5000;
        e.speedFactor = 0.0001;
        line.push(e);
      }
      await wait(250);
      const hp = () => line.map((e) => e.health);
      const before = hp();
      // Aim at the torso of the first body, exactly (no random spread).
      const random = Math.random;
      Math.random = () => 0.5;
      const torso = line[0].model.userData.torso;
      const aim = torso
        ? torso.getWorldPosition(new g.camera.position.constructor())
        : line[0].model.position.clone().setY(1.3);
      g.camera.position.copy(g.player.position);
      g.camera.lookAt(aim);
      g.camera.updateMatrixWorld(true);
      g.shotTimer = g.reloadTime = g.meleeTimer = 0;
      const marker = document.getElementById("hitmarker");
      g.shoot();
      Math.random = random;
      const hit = marker.classList.contains("visible");
      const after = hp();
      const damaged = after.map((v, i) => v < before[i]);
      await wait(80);
      const recoil = {
        pitch: +(g.player.recoilPitch || 0).toFixed(4),
        bloom: +(g.player.bloom || 0).toFixed(2),
      };
      await wait(900);
      // Aim: the sight line lands on the view axis.
      g.mouse.aim = true;
      await wait(1100);
      const scoped = !!g.run?.scoped || !!window.__vesper.scoped;
      const aimT = vm.aimT;
      g.mouse.aim = false;
      await wait(500);
      // Empty reload through the weapon's own action.
      g.weapons[0].ammo = 0;
      g.reload();
      const action = vm.busy;
      const shellReload = !!g.shellReload;
      await wait(250);
      const midReload = {
        magazine: g.gun.userData.magazine
          ? +g.gun.userData.magazine.position.y.toFixed(3)
          : null,
      };
      // Long enough for the slowest (shell by shell) reload.
      for (let t = 0; t < 80 && (g.reloadTime > 0 || g.shellReload); t++)
        await wait(100);
      const ammo = g.weapons[0].ammo;
      for (const e of line) if (!e.dead) g.damageEnemy(e, 1e6, false);
      return {
        armory,
        grip,
        before,
        after,
        damaged,
        hit,
        recoil,
        aimT: +aimT.toFixed(2),
        scoped,
        action,
        shellReload,
        midReload,
        ammo,
      };
    }, id);
    report.weapons[id] = r;
    await page.screenshot({ path: `${out}/${id}.png` });
    check(`${id}: real model and arms`, r.armory, r);
    check(
      `${id}: hands reach their grips, wrists straight, fingers close to the palm`,
      ["right", "left"].every(
        (h) =>
          r.grip[h] &&
          r.grip[h].reach < 1 &&
          r.grip[h].wrist < 16 &&
          r.grip[h].palmward,
      ),
      r.grip,
    );
    check(`${id}: first round hits and marks`, r.damaged[0] && r.hit, {
      damaged: r.damaged,
    });
    const pierce = { marauder: 1, longinus: 2 }[id] || 0;
    // The anomalous weapon's blast reaches the bodies behind on purpose.
    if (id !== "eclipse")
      check(
        `${id}: penetration ${pierce ? `through ${pierce + 1} bodies` : "stops in the first body"}`,
        pierce ? r.damaged.slice(0, pierce + 1).every(Boolean) : !r.damaged[1],
        { damaged: r.damaged },
      );
    check(`${id}: recoil climbs`, r.recoil.pitch > 0, r.recoil);
    check(`${id}: aims down the sights`, r.aimT > 0.9, {
      aimT: r.aimT,
      scoped: r.scoped,
    });
    check(`${id}: reload plays its animation`, !!r.action || r.shellReload, {
      action: r.action,
      shell: r.shellReload,
    });
    check(`${id}: reload refills`, r.ammo > 0, { ammo: r.ammo });
  }
  // Switching lowers one weapon and raises the other.
  const sw = await page.evaluate(async () => {
    const g = window.__vesper;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    g.weapons.length = 1;
    g.weapons[0] = { id: "vigil", ammo: 12, reserve: 84, level: 0 };
    g.weapons.push({ id: "marauder", ammo: 30, reserve: 180, level: 0 });
    g.slot = 0;
    g.setGun();
    await wait(300);
    g.switchWeapon(1);
    const blocked = g.shotTimer > 0.3;
    await wait(700);
    return { blocked, shown: g.gun?.userData.armory?.id, slot: g.slot };
  });
  check(
    "weapon switch holsters then draws",
    sw.blocked && sw.shown === "marauder",
    sw,
  );
  // Transfiguration: animated camouflage on the upgraded model.
  const camo = await page.evaluate(async () => {
    const g = window.__vesper;
    g.weapons[g.slot].level = 2;
    g.setGun({ draw: "first" });
    await new Promise((r) => setTimeout(r, 1500));
    const m = g.gun.userData.armory.meshes.find(
      (o) => o.material.defines?.USE_CAMO !== undefined,
    );
    return { camo: g.gun.userData.armory.camo, animated: !!m };
  });
  await page.screenshot({ path: `${out}/transfigured.png` });
  check(
    "transfigured weapon wears its camouflage",
    camo.camo === 2 && camo.animated,
    camo,
  );
  check("no runtime errors", errors.length === 0, errors.slice(0, 5));
} finally {
  report.errors = errors;
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`Armory check passed: ${report.checks.length} checks, ${out}`);
