import { createRelay } from "../server/index.js";
import { openGameAudit } from "./game-audit.mjs";

export async function checkLacunaCoop(browser, report, check) {
  // Explicit opt-in: use the deployed client's configured relay for a live
  // release check. Each run creates its own room and closes both clients.
  const live = process.env.LACUNA_LIVE_RELAY === "1";
  const relay = live ? null : createRelay({ port: 0, host: "127.0.0.1" });
  const address = await relay?.ready;
  const previous = process.env.VESPER_RELAY;
  if (live) delete process.env.VESPER_RELAY;
  else process.env.VESPER_RELAY = `ws://127.0.0.1:${address.port}`;
  report.coopRelay = live ? "deployed client configuration" : "local relay";
  const pages = [];
  try {
    for (let i = 0; i < 2; i++) {
      const page = await browser.newPage({
        viewport: { width: 1100, height: 700 },
      });
      page.on("pageerror", (e) => report.errors.push(e.message));
      await openGameAudit(page);
      pages.push(page);
    }
    const [host, peer] = pages;
    await host.click("#coop-button");
    await host.fill("#coop-name", "Éclusier");
    await host.click("#coop-create");
    await host.waitForSelector(".lobby-code");
    const code = await host.locator(".lobby-code").innerText();
    await peer.click("#coop-button");
    await peer.fill("#coop-name", "Gardienne");
    await peer.fill("#coop-code", code);
    await peer.click("#coop-join");
    await host.waitForFunction(
      () =>
        document.querySelectorAll(".lobby-players li:not(.empty)").length === 2,
    );
    await host.selectOption("#coop-map", "lacuna");
    await host.click("#coop-start");
    await Promise.all(
      pages.map((p) =>
        p.waitForFunction(() => window.__vesper?.state === "playing", null, {
          timeout: 90000,
        }),
      ),
    );
    await Promise.all(
      pages.map((p) =>
        p.evaluate(() => {
          const g = window.__vesper;
          g.player.invulnerable = 1e9;
          g.player.points = 10000;
          g.phaseTimer = 6000;
        }),
      ),
    );
    await host.evaluate(() => {
      const g = window.__vesper;
      g.player.position.set(0, 1.7, 50);
      g.interact();
      const power = g.world.interactions.find((i) => i.kind === "power");
      g.player.position.set(power.position.x + 2, 1.7, power.position.z);
      g.interact();
      g.player.position.set(15, 1.7, 27);
    });
    await peer.waitForFunction(
      () => window.__vesper.world.power && window.__vesper.world.doors[0].open,
    );
    check("co-op: Lacuna, gate and power replicated", true);
    await peer.evaluate(() => window.__vesper.player.position.set(24, 1.7, 29));
    await peer.waitForTimeout(900);
    await peer.evaluate(() => window.__vesper.interact());
    await host.waitForFunction(
      () => window.__vesper.run.mapGameplay.hydraulics.phase === 1,
    );
    await peer.waitForFunction(
      () =>
        window.__vesper.run.mapGameplay.hydraulics.phase === 1 &&
        window.__vesper.player.points === 9650,
    );
    const attributed = await host.evaluate(() => {
      const g = window.__vesper;
      return g.run.mapGameplay.owner === [...g.session.players.keys()][0];
    });
    check(
      "co-op: remote valve validated, charged once and credited to its operator",
      attributed,
    );
    await peer.evaluate(() => window.__vesper.interact());
    await peer.waitForTimeout(300);
    check(
      "co-op: duplicate activation cannot spend twice",
      await peer.evaluate(() => window.__vesper.player.points === 9650),
    );
    await host.evaluate(() => {
      const g = window.__vesper,
        r = g.run.mapGameplay;
      // Finish the manual sequence, then prepare an automatic warning.
      for (let i = 0; i < 20; i++) r.update(1);
      r.hydraulics.phase = 1;
      r.hydraulics.mode = 0;
      r.hydraulics.timer = 2;
    });
    await peer.evaluate(() => window.__vesper.player.position.set(0, 1.7, 0));
    await peer.waitForTimeout(3300);
    check(
      "co-op: remote player holds the retractable bridge open",
      await host.evaluate(() => {
        const g = window.__vesper;
        return (
          g.run.mapGameplay.hydraulics.phase === 1 &&
          !g.world.lacunaBridgeObstacle.active
        );
      }),
    );
    await peer.evaluate(() => window.__vesper.player.position.set(-16, 1.7, 0));
    await Promise.all(
      pages.map((p) =>
        p.waitForFunction(
          () => window.__vesper.world.lacunaBridgeObstacle.active,
        ),
      ),
    );
    check(
      "co-op: bridge collision and flood synchronize on both clients",
      (
        await Promise.all(
          pages.map((p) =>
            p.evaluate(() => window.__vesper.run.mapGameplay.hydraulics.phase),
          ),
        )
      ).every((phase) => phase === 2),
    );
    await peer.evaluate(() => window.__vesper.pause());
    await host.waitForFunction(() => window.__vesper.state === "paused");
    const before = await host.evaluate(
      () => window.__vesper.run.mapGameplay.hydraulics.timer,
    );
    await host.waitForTimeout(700);
    check(
      "co-op: pause freezes hydraulics and mutes their bus",
      await host.evaluate((before) => {
        const r = window.__vesper.run.mapGameplay;
        return r.hydraulics.timer === before && r.audio.bus.gain.value < 0.01;
      }, before),
    );
    await host.evaluate(() => window.__vesper.resume());
    await peer.waitForFunction(() => window.__vesper.state === "playing");
    await host.screenshot({ path: `${report.out}/coop-host.png` });
    await peer.screenshot({ path: `${report.out}/coop-peer.png` });
  } catch (error) {
    report.coopFailure = await Promise.all(
      pages.map((page) =>
        page
          .evaluate(() => {
            const g = window.__vesper;
            return g
              ? {
                  state: g.state,
                  map: g.map,
                  time: g.time,
                  timer: g.phaseTimer,
                  host: g.session?.host,
                  power: g.world?.power,
                  doors: g.world?.doors.map((d) => d.open),
                  snapshot: g.session?.snapshot(),
                  lastTick: g.session?.lastSnapshotTick,
                }
              : { loaded: false };
          })
          .catch(() => null),
      ),
    );
    for (let i = 0; i < pages.length; i++)
      await pages[i]
        .screenshot({ path: `${report.out}/coop-failure-${i}.png` })
        .catch(() => {});
    console.log("COOP FAILURE", JSON.stringify(report.coopFailure));
    throw error;
  } finally {
    await Promise.all(pages.map((page) => page.close()));
    await relay?.close();
    if (previous === undefined) delete process.env.VESPER_RELAY;
    else process.env.VESPER_RELAY = previous;
  }
}
