// Maiming in the running game: a grenade tears the legs off tough walkers,
// they fall, crawl to the player, claw at the legs and die on the floor; the
// lower legs fly off as gibs. Leg shots accumulate into the same crippling;
// shots at an arm tear it off at the elbow. A close headshot splashes the
// view. Desktop and touch profiles.
import { chromiumOptions } from "./browser.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { openGameAudit } from "./game-audit.mjs";

process.env.VESPER_URL ||= "http://localhost:4173";
const out = `artifacts/crawlers-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = { out, errors: [], checks: [] };
const wait = (page, ms) => page.waitForTimeout(ms);
try {
  for (const mobile of [false, true]) {
    const profile = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1200, height: 800 },
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
    // Four tough walkers in front of the player, a grenade among them.
    const blast = await page.evaluate(() => {
      const g = window.__vesper;
      g.phaseTimer = 1e6;
      g.player.invulnerable = 1e6;
      for (const e of g.enemies) e.health = 0;
      g.player.position.set(0, 1.7, 20);
      g.yaw = 0;
      g.pitch = -0.32;
      const ids = [];
      for (const [x, z] of [
        [-0.8, 15.2],
        [0.7, 15.0],
        [-0.2, 14.4],
        [1.2, 14.2],
      ]) {
        g.spawnEnemy("walker", g.player.position.clone().set(x, 0, z));
        const e = g.enemies.at(-1);
        e.model.position.y = 0;
        e.health = e.maxHealth = 5000;
        ids.push(e.id);
      }
      const random = Math.random;
      Math.random = () => 0.2;
      try {
        g.explode(g.player.position.clone().set(0.2, 0.3, 14.8), null);
      } finally {
        Math.random = random;
      }
      const crawlers = g.enemies.filter((e) => ids.includes(e.id));
      return {
        ids,
        crawlers: crawlers.map((e) => !!e.crawler),
        legs: crawlers.map((e) => !!e.model.userData.legsLost),
      };
    });
    assert(blast.crawlers.every(Boolean), `${profile}: the blast cripples`);
    const gibs = await page.evaluate(
      () => window.__vesper.view.hordeGibs.thrown,
    );
    assert(gibs >= 4, `${profile}: torn lower legs fly as gibs (${gibs})`);
    report.checks.push(`${profile}: ${gibs} gibs thrown`);
    assert(blast.legs.every(Boolean), `${profile}: lower legs removed`);
    await wait(page, 300);
    await page.screenshot({ path: `${out}/${profile}-fall.png` });
    await wait(page, 1100);
    const settled = await page.evaluate((ids) => {
      const g = window.__vesper;
      return g.enemies
        .filter((e) => ids.includes(e.id))
        .map((e) => {
          const anim = e.model.userData.horde.anim;
          e.model.updateMatrixWorld(true);
          const head = e.model.userData.head.getWorldPosition(
            e.model.position.clone(),
          );
          return {
            crawling: !!anim.crawling,
            overlay: anim.overlay?.kind || null,
            move: anim.move?.getClip().name,
            idle: anim.idle?.getClip().name,
            head: head.y,
            distance: Math.hypot(
              e.model.position.x - g.player.position.x,
              e.model.position.z - g.player.position.z,
            ),
          };
        });
    }, blast.ids);
    for (const s of settled) {
      assert(s.crawling, `${profile}: animator in crawl mode`);
      assert.equal(s.move, "crawl");
      assert.equal(s.idle, "crawl_idle");
      assert(s.overlay !== "fall", `${profile}: the fall is over`);
      assert(s.head < 0.95, `${profile}: head low (${s.head.toFixed(2)} m)`);
    }
    report.checks.push(`${profile}: grenade -> four crawlers, fall done`);
    await wait(page, 2500);
    const moved = await page.evaluate((ids) => {
      const g = window.__vesper;
      return g.enemies
        .filter((e) => ids.includes(e.id))
        .map((e) => ({
          distance: Math.hypot(
            e.model.position.x - g.player.position.x,
            e.model.position.z - g.player.position.z,
          ),
          speed: e.speed,
        }));
    }, blast.ids);
    moved.forEach((m, i) => {
      const covered = settled[i].distance - m.distance;
      assert(
        covered > 0.6 && covered < 2.4,
        `${profile}: crawler ${i} covered ${covered.toFixed(2)} m in 2.5 s`,
      );
    });
    await page.screenshot({ path: `${out}/${profile}-crawl.png` });
    report.checks.push(
      `${profile}: crawl ${moved.map((m) => m.speed.toFixed(2)).join("/")} m/s`,
    );
    // At the player's feet: ground attacks.
    await page.evaluate((ids) => {
      const g = window.__vesper;
      const e = g.enemies.find((e) => e.id === ids[0]);
      e.model.position.set(0.1, 0, 19.0);
      e.attack = 0;
    }, blast.ids);
    const attack = await page.evaluate(async (ids) => {
      const g = window.__vesper;
      const e = g.enemies.find((e) => e.id === ids[0]);
      const names = new Set();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const o = e.model.userData.horde.anim.overlay;
        if (o?.kind === "melee") names.add(o.name);
      }
      return [...names];
    }, blast.ids);
    assert(
      attack.length && attack.every((n) => n.startsWith("attack_crawl")),
      `${profile}: crawler attacks on the ground (${attack.join(", ")})`,
    );
    report.checks.push(`${profile}: ground attack ${attack.join(", ")}`);
    // Dying crawlers die flat.
    const deaths = await page.evaluate(async (ids) => {
      const g = window.__vesper;
      const targets = g.enemies.filter((e) => ids.includes(e.id));
      for (const e of targets) g.damageEnemy(e, 1e6, false);
      await new Promise((r) => setTimeout(r, 400));
      return targets.map((e) => e.model.userData.horde.anim.death?.name);
    }, blast.ids);
    assert(
      deaths.every((n) => n === "death_crawl"),
      `${profile}: crawler deaths ${deaths.join(", ")}`,
    );
    await wait(page, 900);
    await page.screenshot({ path: `${out}/${profile}-death.png` });
    // Leg shots add up to crippling; the lower-leg volumes vanish.
    const legs = await page.evaluate(async () => {
      const g = window.__vesper;
      g.spawnEnemy("walker", g.player.position.clone().set(0, 0, 16));
      const e = g.enemies.at(-1);
      e.model.position.y = 0;
      e.health = e.maxHealth = 400;
      await new Promise((r) => setTimeout(r, 200));
      e.model.updateMatrixWorld(true);
      const thigh = e.model.userData.legs[0].root.getWorldPosition(
        e.model.position.clone(),
      );
      const direction = thigh.clone().sub(g.camera.position).normalize();
      const parts = e.model.userData.hitParts.length;
      g.damageEnemy(e, 120, false, { position: thigh, direction, leg: true });
      const first = !!e.crawler;
      g.damageEnemy(e, 120, false, { position: thigh, direction, leg: true });
      return { first, second: !!e.crawler, parts };
    });
    assert(!legs.first && legs.second, `${profile}: leg damage cripples`);
    // Real rounds at a forearm: the arm tears off at the elbow.
    const arm = await page.evaluate(async () => {
      const g = window.__vesper;
      g.spawnEnemy("walker", g.player.position.clone().set(0.3, 0, 16.8));
      const e = g.enemies.at(-1);
      e.model.position.y = 0;
      e.health = e.maxHealth = 150;
      e.speedFactor = 0.001;
      await new Promise((r) => setTimeout(r, 300));
      const before = g.view.hordeGibs.thrown;
      // Exact aim: no random spread on these rounds.
      const random = Math.random;
      Math.random = () => 0.5;
      for (let i = 0; i < 2; i++) {
        e.model.updateMatrixWorld(true);
        const part = e.model.userData.hitParts.find(
          (p) => p.arm === "L" && p.lower,
        );
        const aim = part.offset
          .clone()
          .applyMatrix4(e.model.getObjectByName(part.bone).matrixWorld);
        g.camera.position.copy(g.player.position);
        g.camera.lookAt(aim);
        g.camera.updateMatrixWorld(true);
        g.state = "playing";
        g.shotTimer = g.reloadTime = g.meleeTimer = 0;
        g.weapon.ammo = 12;
        g.mouse.aim = true;
        g.shoot();
        g.mouse.aim = false;
      }
      Math.random = random;
      // Volumes are measured once per shot: a harmless touch refreshes them.
      g.damageEnemy(e, 0, false, { position: e.model.position.clone() });
      return {
        cuts: e.model.userData.cuts,
        gibs: g.view.hordeGibs.thrown - before,
        volumes: e.model.userData.hitVolumes.filter(
          (v) => v.part.arm === "L" && v.part.lower && v.sphere.radius > 0,
        ).length,
      };
    });
    assert.equal(arm.cuts, 2, `${profile}: forearm torn off at the elbow`);
    assert(arm.gibs >= 1, `${profile}: the forearm falls as a gib`);
    assert.equal(arm.volumes, 0, `${profile}: the lost forearm cannot be hit`);
    report.checks.push(`${profile}: forearm shot off`);
    // A close headshot throws blood onto the view.
    const splash = await page.evaluate(async () => {
      const g = window.__vesper;
      g.spawnEnemy("walker", g.player.position.clone().set(0, 0, 18.3));
      const e = g.enemies.at(-1);
      e.model.position.y = 0;
      e.health = 1;
      e.speedFactor = 0.001;
      await new Promise((r) => setTimeout(r, 300));
      e.model.updateMatrixWorld(true);
      const part = e.model.userData.hitParts.find((p) => p.head);
      const aim = part.offset
        .clone()
        .applyMatrix4(e.model.getObjectByName(part.bone).matrixWorld);
      g.camera.position.copy(g.player.position);
      g.camera.lookAt(aim);
      g.camera.updateMatrixWorld(true);
      g.state = "playing";
      g.shotTimer = g.reloadTime = g.meleeTimer = 0;
      g.weapon.ammo = 12;
      g.shoot();
      await new Promise((r) => setTimeout(r, 100));
      return document.querySelectorAll(".screen-blood").length;
    });
    assert(splash > 0, `${profile}: close headshot splashes the view`);
    report.checks.push(`${profile}: screen blood on a close kill`);
    assert(legs.parts >= 7, `${profile}: leg hit volumes present`);
    report.checks.push(`${profile}: leg shots cripple`);
    await context.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
}
assert.deepEqual(report.errors, [], "no page errors");
console.log(JSON.stringify(report, null, 2));
