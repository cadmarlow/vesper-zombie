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
const errors = [],
  results = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  results.push(name);
  console.log("PASS", name);
};
const open = async (mobile = false, portrait = false) => {
  const context = await browser.newContext({
    viewport: portrait
      ? { width: 390, height: 844 }
      : { width: mobile ? 844 : 1280, height: mobile ? 390 : 720 },
    hasTouch: mobile,
    isMobile: mobile,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("injected-load-failure")
    )
      errors.push(message.text());
  });
  await openGameAudit(page);
  return page;
};
const playing = (page) =>
  page.waitForFunction(() => window.__vesper?.state === "playing", null, {
    timeout: 90000,
  });
const state = (page) => page.evaluate(() => window.__vesper.state);
try {
  // A failed shader compilation used to leave partial run resources alive.
  const solo = await open();
  await solo.evaluate(async () => {
    const manifest = await fetch("/.vite/manifest.json").then((r) => r.json());
    const { Game } = await import("/" + manifest["src/game.js"].file);
    const original = Game.prototype.start;
    let once = true;
    Game.prototype.start = function (...args) {
      if (once) {
        once = false;
        const compile = this.view.renderer.compileAsync;
        this.view.renderer.compileAsync = async () => {
          this.view.renderer.compileAsync = compile;
          throw new Error("injected-load-failure");
        };
      }
      return original.apply(this, args);
    };
  });
  await solo.click("#play-button");
  await solo.waitForFunction(() => window.__vesper?.state === "menu");
  check(
    "failed loading returns to a clean menu",
    await solo.evaluate(
      () => !window.__vesper.world && !window.__vesper.enemies.length,
    ),
  );
  await solo.click("#play-button");
  await playing(solo);
  check(
    "the same renderer starts a new run after loading failure",
    await solo.evaluate(() => !!window.__vesper.gun),
  );
  await solo.evaluate(() => window.__vesper.menu());
  await solo.evaluate(async () => {
    const g = window.__vesper;
    const compile = g.renderer.compileAsync;
    let release;
    g.renderer.compileAsync = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const starting = g.start("station", "normal", true);
    while (!release) await new Promise((resolve) => setTimeout(resolve, 10));
    g.menu();
    g.renderer.compileAsync = compile;
    release();
    try {
      await starting;
    } catch (error) {
      if (error.name !== "AbortError") throw error;
    }
  });
  check(
    "cancelled loading cannot resurrect a discarded run",
    await solo.evaluate(
      () => window.__vesper.state === "menu" && !window.__vesper.world,
    ),
  );
  await solo.click("#play-button");
  await playing(solo);
  check("relaunch succeeds after cancelling loading", true);
  await solo.context().close();

  for (const map of ["abbey", "station", "abyss"]) {
    const host = await open(),
      peer = await open(true, map === "abbey");
    await host.click("#coop-button");
    await host.fill("#coop-name", "Alpha");
    await host.click("#coop-create");
    await host.waitForSelector(".lobby-code");
    const code = await host.locator(".lobby-code").innerText();
    await peer.click("#coop-button");
    await peer.fill("#coop-name", "<b>Bravo</b>");
    await peer.fill("#coop-code", code);
    await peer.click("#coop-join");
    await host.waitForFunction(
      () =>
        document.querySelectorAll(".lobby-players li:not(.empty)").length === 2,
    );
    check(
      map + ": names remain literal text",
      await host
        .locator(".lobby-players")
        .innerText()
        .then((text) => text.includes("<b>Bravo</b>")),
    );
    await host.selectOption("#coop-map", map);
    await host.click("#coop-start");
    if (map === "abbey") {
      await peer.waitForSelector("#mobile-orientation:not(.hidden)");
      await host.waitForFunction(() => window.__vesper?.state === "loading");
      await host.waitForTimeout(500);
      check(
        "host waits while the mobile player rotates",
        (await state(host)) === "loading",
      );
      await peer.setViewportSize({ width: 844, height: 390 });
    }
    await Promise.all([playing(host), playing(peer)]);
    check(
      map + ": desktop and mobile start the same co-op run",
      await peer.evaluate(
        (map) =>
          window.__vesper.map === map &&
          window.__vesper.session.peer &&
          window.__vesper.touch,
        map,
      ),
    );
    for (const page of [host, peer])
      await page.evaluate(() => {
        const g = window.__vesper;
        g.phaseTimer = 3600;
        g.player.invulnerable = 1e9;
        g.player.points = 5000;
        const box = g.world.interactions.find((i) => i.kind === "box");
        g.player.position.set(box.position.x, 1.7, box.position.z + 1);
        g.updateHUD();
      });
    await Promise.all(
      [host, peer].map((page) =>
        page.evaluate(() => window.__vesper.interact()),
      ),
    );
    await peer.waitForTimeout(500);
    const balances = await Promise.all(
      [host, peer].map((page) =>
        page.evaluate(() => window.__vesper.player.points),
      ),
    );
    check(
      map + ": competing purchases charge exactly one player",
      balances[0] + balances[1] === 9050,
    );
    await peer.evaluate(() => window.__vesper.pause());
    await host.waitForFunction(() => window.__vesper.state === "paused");
    const time = await host.evaluate(() => window.__vesper.time);
    await host.waitForTimeout(150);
    check(
      map + ": co-op pause freezes the shared simulation",
      (await host.evaluate(() => window.__vesper.time)) === time,
    );
    await peer.evaluate(() => window.__vesper.resume());
    await Promise.all([playing(host), playing(peer)]);
    await peer.evaluate(() => {
      const g = window.__vesper;
      g.down();
      g.keys.add("KeyW");
      g.touchMove = { x: 1, y: 1 };
      g.player.lastHurt = -100;
    });
    const downPosition = await peer.evaluate(() =>
      window.__vesper.player.position.toArray(),
    );
    await peer.waitForTimeout(300);
    check(
      map + ": a downed player cannot move or regenerate",
      await peer.evaluate((position) => {
        const g = window.__vesper;
        return (
          g.player.health === 0 &&
          g.player.position
            .toArray()
            .every((v, i) => Math.abs(v - position[i]) < 0.001)
        );
      }, downPosition),
    );
    await host.evaluate(() => window.__vesper.beginWave());
    await peer.waitForFunction(() => !window.__vesper.downed);
    check(map + ": the next wave restores the mobile teammate", true);
    await host.evaluate(() => window.__vesper.menu());
    await peer.waitForFunction(() => window.__vesper.state === "menu");
    await host.waitForSelector("#coop-start");
    await host.click("#coop-start");
    await Promise.all([playing(host), playing(peer)]);
    check(
      map + ": the same lobby starts a fresh run",
      await host.evaluate(() => window.__vesper.wave === 0),
    );
    await host.context().close();
    await peer.waitForFunction(() => window.__vesper.state === "menu");
    check(map + ": host disconnect returns the teammate to the menu", true);
    await peer.context().close();
  }
  // Exercise the real four-player roster, including a host who is downed.
  const squad = [];
  for (let i = 0; i < 4; i++) squad.push(await open(i >= 2));
  const [leader, ...partners] = squad;
  await leader.click("#coop-button");
  await leader.fill("#coop-name", "Squad 1");
  await leader.click("#coop-create");
  await leader.waitForSelector(".lobby-code");
  const squadCode = await leader.locator(".lobby-code").innerText();
  for (const [i, page] of partners.entries()) {
    await page.click("#coop-button");
    await page.fill("#coop-name", "Squad " + (i + 2));
    await page.fill("#coop-code", squadCode);
    await page.click("#coop-join");
    await page.waitForSelector(".lobby-code");
  }
  await leader.waitForFunction(
    () =>
      document.querySelectorAll(".lobby-players li:not(.empty)").length === 4,
  );
  await leader.click("#coop-start");
  await Promise.all(squad.map(playing));
  check(
    "four browsers start with all three teammates",
    (
      await Promise.all(
        squad.map((page) =>
          page.evaluate(() => window.__vesper.session.players.size === 3),
        ),
      )
    ).every(Boolean),
  );
  for (const page of squad)
    await page.evaluate(() => {
      window.__vesper.phaseTimer = 3600;
    });
  for (const page of squad.slice(0, 3))
    await page.evaluate(() => window.__vesper.down());
  await leader.waitForFunction(
    () =>
      [...window.__vesper.session.players.values()].filter(
        (p) => p.health === 0,
      ).length === 2,
  );
  check(
    "a downed host keeps the last survivor's game running",
    (await state(leader)) === "playing",
  );
  await squad[2].context().close();
  await leader.waitForFunction(
    () => window.__vesper.session.players.size === 2,
  );
  const afterDisconnect = await state(leader);
  console.log("State after closing an invited browser:", afterDisconnect);
  // Closing a browser may blur it first, which correctly pauses the team.
  // The remaining players must still be able to resume and finish the run.
  if (afterDisconnect === "paused") {
    await leader.evaluate(() => window.__vesper.resume());
    await Promise.all([leader, squad[1], squad[3]].map(playing));
  }
  check(
    "an invited player's disconnect leaves the remaining team in play",
    (await state(leader)) === "playing",
  );
  await squad[3].evaluate(() => window.__vesper.down());
  for (const page of [leader, squad[1], squad[3]])
    await page.waitForFunction(() => window.__vesper.state === "gameover");
  check(
    "the last survivor falling ends the run for the remaining three players",
    true,
  );
  for (const page of [leader, squad[1], squad[3]]) await page.context().close();
  check("no unexpected browser errors", errors.length === 0);
} finally {
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync(
    "artifacts/foundation.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
}
