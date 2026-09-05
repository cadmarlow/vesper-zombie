import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openGameAudit } from "./game-audit.mjs";
import { rng, inside, canStand } from "../src/logic.js";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
  else if (message.text().startsWith("WAVES ")) console.log(message.text());
});
try {
  await openGameAudit(page);
  // Keep the test oracle independent of the bundled navigation under test.
  await page.addScriptTag({
    content: `window.__waveOracle = (() => { ${rng.toString()} ${inside.toString()} ${canStand.toString()} return { rng, canStand }; })();`,
  });
  await page.click("#play-button");
  await page.waitForFunction(() => window.__vesper?.state === "playing");
  const reports = await page.evaluate(async () => {
    const g = window.__vesper;
    g.emit = () => {};
    g.sound.setVolume(0);
    const { rng, canStand } = window.__waveOracle;
    const reports = [],
      originalRandom = Math.random;
    try {
      for (const map of ["abbey", "station"])
        for (const [x, z, open] of [
          [0, 20, false],
          [-14.5, 18, false],
          [14.5, 20, false],
          [0, 8, false],
          [0, 0, true],
          [-14.5, -20, true],
        ]) {
          Math.random = rng(2026 + reports.length);
          await g.start(map, "normal", true);
          if (open) {
            g.world.openDoor(g.world.doors[0]);
            g.updateNavigation(true);
          }
          g.player.position.set(x, 1.7, z);
          g.updateNavigation();
          g.player.invulnerable = 1e9;
          g.phaseTimer = 0;
          let completed = 0,
            lastKill = 0,
            invalidSpawns = 0,
            slowestWave = 0,
            waveStart = 0;
          const types = new Set();
          for (let frame = 0; frame < 27000; frame++) {
            g.update(1 / 30);
            for (const e of g.enemies) {
              if (e.dead) continue;
              types.add(e.type);
              if (
                e.age < 0.05 &&
                !canStand(
                  e.model.position.x,
                  e.model.position.z,
                  g.world.obstacles,
                  e.type === "brute" ? 0.6 : 0.36,
                )
              )
                invalidSpawns++;
              if (e.model.position.y < -0.1) continue;
              const v = e.model.position
                  .clone()
                  .add({ x: 0, y: 1.3, z: 0 })
                  .sub(g.player.position),
                d = v.length();
              // A stationary test defender can only eliminate an enemy that actually
              // reaches it with an unobstructed shot. Never kill remote/stuck actors.
              if (
                d < 3.2 &&
                g.obstacleDistance(g.player.position, v.normalize(), d) >=
                  d - 0.15
              ) {
                g.damageEnemy(e, 1e9, false);
                lastKill = g.time;
              }
            }
            if (g.phase === "rest" && g.wave > completed) {
              completed = g.wave;
              slowestWave = Math.max(slowestWave, g.time - waveStart);
              waveStart = g.time;
              g.phaseTimer = 0;
              if (completed >= 10) break;
            }
            if (g.time - lastKill > 100) break;
          }
          const stuck = g.enemies
            .filter((e) => !e.dead)
            .map((e) => ({
              type: e.type,
              position: e.model.position.toArray(),
            }));
          const report = {
            map,
            player: [x, z],
            open,
            completed,
            invalidSpawns,
            types: [...types],
            slowestWave,
            remaining: g.remaining,
            stuck,
          };
          reports.push(report);
          console.log(
            `WAVES ${map} ${x},${z} ${open ? "open" : "closed"}: ${completed}/10, invalid spawns: ${invalidSpawns}`,
          );
        }
    } finally {
      Math.random = originalRandom;
    }
    return reports;
  });
  fs.mkdirSync("artifacts", { recursive: true });
  const file = `artifacts/waves-regression-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify({ reports, errors }, null, 2));
  console.log("Report:", file);
  for (const r of reports) {
    assert.equal(
      r.completed,
      10,
      `${r.map} ${r.player}: ${JSON.stringify(r.stuck)}`,
    );
    assert.equal(r.invalidSpawns, 0);
    assert.equal(r.remaining, 0);
    assert.equal(r.types.length, 5);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 120 completed waves across both maps, all five enemy types, no invalid spawns or stalled waves.",
  );
} finally {
  await browser.close();
}
