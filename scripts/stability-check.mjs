import { chromium, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openGameAudit } from "./game-audit.mjs";
const out = `artifacts/stability-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [] };
const check = (name, ok) => {
  assert(ok, name);
  report.checks.push(name);
  console.log("PASS", name);
};
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const safari =
  process.env.VESPER_PEER_ENGINE === "webkit"
    ? await webkit.launch({ headless: true })
    : null;
report.peerEngine = safari ? "WebKit" : "Chromium";
let host, peer;
try {
  const open = async (mobile) => {
    const context = await (mobile && safari ? safari : browser).newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1280, height: 720 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => report.errors.push(e.message));
    await p.addInitScript(() => {
      localStorage.setItem(
        "vesper-settings",
        JSON.stringify({ quality: "medium", frameRate: 60 }),
      );
    });
    await openGameAudit(p);
    return p;
  };
  host = await open(false);
  peer = await open(true);
  await host.click("#coop-button");
  await host.fill("#coop-name", "Alpha");
  await host.click("#coop-create");
  await host.waitForSelector(".lobby-code");
  const code = await host.locator(".lobby-code").innerText();
  await peer.tap("#coop-button");
  await peer.fill("#coop-name", "Bravo");
  await peer.fill("#coop-code", code);
  await peer.tap("#coop-join");
  await host.waitForFunction(
    () =>
      document.querySelectorAll(".lobby-players li:not(.empty)").length === 2,
  );
  await host.selectOption("#coop-map", "abyss");
  await host.click("#coop-start");
  for (const p of [host, peer])
    await p.waitForFunction(() => window.__vesper?.state === "playing", null, {
      timeout: 90000,
    });
  await Promise.all(
    [host, peer].map((p, index) =>
      p.evaluate((index) => {
        const g = window.__vesper;
        g.phaseTimer = 9000;
        g.player.invulnerable = 1e9;
        g.player.position.set(index ? 1 : 0, 1.7, 34);
        g.time = 600;
      }, index),
    ),
  );
  await host.waitForTimeout(350);
  check(
    "Desktop and touch peer share the Abyss run",
    await peer.evaluate(
      () =>
        window.__vesper.touch &&
        window.__vesper.session.peer &&
        window.__vesper.map === "abyss",
    ),
  );
  check(
    "Teammate uses two textured skinned meshes and an animation mixer",
    await host.evaluate(() => {
      const m = [...window.__vesper.session.players.values()][0].model;
      let skins = 0;
      m.traverse((o) => {
        if (o.isSkinnedMesh && o.material.map) skins++;
      });
      return skins === 2 && !!m.userData.mixer && m.userData.body.scale.x < 2;
    }),
  );
  check(
    "Teammate weapon points in the direction the player aims",
    await host.evaluate(() => {
      const p = [...window.__vesper.session.players.values()][0];
      const direction = p.gun.position
        .clone()
        .set(0, 0, -1)
        .applyQuaternion(p.gun.getWorldQuaternion(p.gun.quaternion.clone()));
      const expected = direction
        .clone()
        .set(
          -Math.sin(p.tyaw) * Math.cos(p.pitch),
          Math.sin(p.pitch),
          -Math.cos(p.tyaw) * Math.cos(p.pitch),
        );
      return direction.dot(expected) > 0.995;
    }),
  );
  const contacts = await host.evaluate(() => {
    const g = window.__vesper;
    g.scene.updateMatrixWorld(true);
    function faceCount(point, axis, sign) {
      let count = 0;
      const keys = ["x", "y", "z"];
      const other = keys.filter((k) => k !== axis);
      const a = g.player.position.clone(),
        b = a.clone(),
        c = a.clone(),
        n = a.clone();
      g.world.root.traverse((o) => {
        if (!o.isMesh || o.material.transparent || !(o.layers.mask & 1)) return;
        const geo = o.geometry,
          pos = geo.attributes.position,
          idx = geo.index;
        for (let i = 0; i < (idx?.count || pos.count); i += 3) {
          for (const [v, j] of [
            [a, i],
            [b, i + 1],
            [c, i + 2],
          ])
            v.fromBufferAttribute(pos, idx ? idx.getX(j) : j).applyMatrix4(
              o.matrixWorld,
            );
          if (
            ![a, b, c].every((v) => Math.abs(v[axis] - point[axis]) < 0.00001)
          )
            continue;
          n.subVectors(b, a).cross(c.clone().sub(a));
          if (n[axis] * sign <= 0) continue;
          const [u, v] = other;
          const edge = (x, y) =>
            (y[u] - x[u]) * (point[v] - x[v]) -
            (y[v] - x[v]) * (point[u] - x[u]);
          const e = [edge(a, b), edge(b, c), edge(c, a)];
          if (e.every((x) => x >= -1e-9) || e.every((x) => x <= 1e-9)) count++;
        }
      });
      return count;
    }
    return [24, -23]
      .flatMap((z) =>
        [-6, 6].map((x) => ({
          x,
          z,
          count: faceCount({ x, y: 1.73, z: z + 0.123 }, "x", -Math.sign(x)),
        })),
      )
      .concat({ table: faceCount({ x: 16.3, y: 1.355, z: 37.023 }, "y", 1) });
  });
  report.surfaceContacts = contacts;
  check(
    "Walls and table expose one surface at each reported overlap",
    contacts.every((p) => (p.count ?? p.table) === 1),
  );
  await peer.evaluate(() => window.__vesper.down());
  await host.waitForFunction(
    () => !!([...window.__vesper.session.players.values()][0].flags & 8),
  );
  await host.waitForTimeout(300);
  check(
    "Both screens explain downed state and show the fallen body",
    (await host.evaluate(() => {
      const p = [...window.__vesper.session.players.values()][0];
      return (
        p.model.visible &&
        p.model.userData.downBlend > 0.5 &&
        document.querySelector("#team-list").textContent.includes("À TERRE")
      );
    })) && (await peer.locator("#downed").isVisible()),
  );
  await host.keyboard.down("KeyE");
  await host.waitForFunction(
    () =>
      window.__vesper.session.rescue.status(
        [...window.__vesper.session.players.keys()][0],
      )?.progress > 0.2,
  );
  await host.keyboard.up("KeyE");
  await host.waitForFunction(
    () =>
      window.__vesper.session.rescue.status(
        [...window.__vesper.session.players.keys()][0],
      )?.progress === 0,
  );
  check(
    "Releasing E cancels the actual network revive",
    await peer.evaluate(() => window.__vesper.downed),
  );
  await host.keyboard.down("KeyE");
  await peer.waitForFunction(() => !window.__vesper.downed, null, {
    timeout: 10000,
  });
  await host.keyboard.up("KeyE");
  check(
    "Desktop revives the mobile teammate in place at half health",
    await peer.evaluate(() => {
      const g = window.__vesper;
      return (
        g.player.health >= 50 &&
        g.player.health < 60 &&
        Math.abs(g.player.position.x - 1) < 0.01 &&
        g.player.invulnerable > g.time
      );
    }),
  );
  await host.evaluate(() => window.__vesper.down());
  await peer.waitForFunction(() =>
    document.querySelector("#mobile-interact").textContent.includes("réanimer"),
  );
  const cdp = safari ? null : await peer.context().newCDPSession(peer);
  const r = await peer.locator("#mobile-interact").boundingBox();
  if (safari) await peer.keyboard.down("KeyE");
  else
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          id: 1,
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          radiusX: 8,
          radiusY: 8,
          force: 1,
        },
      ],
    });
  await peer.waitForFunction(
    () => window.__vesper.session.rescue.hud().progress > 0.1,
  );
  await peer.screenshot({ path: `${out}/mobile-revive.png` });
  await host.waitForFunction(() => !window.__vesper.downed, null, {
    timeout: 10000,
  });
  if (safari) await peer.keyboard.up("KeyE");
  else
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  check(
    safari
      ? "WebKit peer revives the desktop host"
      : "Native touch hold revives the desktop host",
    await host.evaluate(
      () => window.__vesper.player.health >= 50 && !window.__vesper.downed,
    ),
  );
  await host.waitForFunction(
    () => [...window.__vesper.session.players.values()][0].rescueTarget === 0,
  );
  check("Touch release clears rescue intent on the host", true);
  await peer.evaluate(() => window.__vesper.down());
  await host.waitForFunction(
    () => window.__vesper.session.rescue.states.size === 1,
  );
  await host.evaluate(() => {
    const s = window.__vesper.session.rescue;
    for (const state of s.states.values()) state.remaining = 0.1;
  });
  await peer.waitForFunction(() => window.__vesper.run.eliminated);
  // HUDs refresh at 13 Hz, independently of network event delivery.
  await Promise.all([
    peer.waitForFunction(
      () => {
        const text = document.querySelector("#downed").innerText;
        return text.includes("ÉLIMINÉ") && text.includes("prochaine vague");
      },
      null,
      { timeout: 2000 },
    ),
    host.waitForFunction(
      () => document.querySelector("#team-list").innerText.includes("ÉLIMINÉ"),
      null,
      { timeout: 2000 },
    ),
  ]);
  check(
    "Elimination is explicit on both HUDs",
    (await peer
      .locator("#downed")
      .innerText()
      .then((t) => t.includes("ÉLIMINÉ") && t.includes("prochaine vague"))) &&
      (await host
        .locator("#team-list")
        .innerText()
        .then((t) => t.includes("ÉLIMINÉ"))),
  );
  await host.evaluate(() => {
    const g = window.__vesper;
    g.session.broadcast({ k: "wave" });
  });
  await peer.waitForFunction(() => !window.__vesper.downed);
  check(
    "A new wave restores the eliminated teammate",
    await peer.evaluate(
      () =>
        !window.__vesper.run.eliminated &&
        window.__vesper.player.health === 100,
    ),
  );
  // Preserve message order while delivering snapshots in delayed bursts.
  await peer.evaluate(() => {
    const g = window.__vesper;
    g.applySettings({ ...g.settings, frameRate: 30 });
    const net = window.__vesper.session.net;
    let due = 0,
      sequence = 0;
    const callbacks = net.handlers.get("state");
    net.handlers.set(
      "state",
      new Set(
        [...callbacks].map((callback) => (message) => {
          const now = performance.now();
          due = Math.max(due + 1, now + [40, 70, 100, 130][sequence++ % 4]);
          setTimeout(() => callback(message), due - now);
        }),
      ),
    );
  });
  await host.evaluate(() => {
    const g = window.__vesper;
    g.spawnEnemy("walker", g.player.position.clone().set(0, 0, 28));
  });
  await peer.waitForFunction(() => window.__vesper.enemies.length > 0);
  const motion = await peer.evaluate(
    () =>
      new Promise((resolve) => {
        const g = window.__vesper;
        const rows = [];
        const until = performance.now() + 1800;
        function sample() {
          const e = g.enemies[0];
          rows.push({
            x: e.model.position.x,
            z: e.model.position.z,
            phase: e.model.userData.walkPhase,
            leg: e.model.userData.legs[0].root.rotation.x,
          });
          if (performance.now() < until) requestAnimationFrame(sample);
          else resolve(rows);
        }
        sample();
      }),
  );
  let maxStep = 0,
    maxLeg = 0;
  for (let i = 1; i < motion.length; i++) {
    maxStep = Math.max(
      maxStep,
      Math.hypot(motion[i].x - motion[i - 1].x, motion[i].z - motion[i - 1].z),
    );
    maxLeg = Math.max(maxLeg, Math.abs(motion[i].leg - motion[i - 1].leg));
  }
  report.motion = { samples: motion.length, maxStep, maxLeg };
  check(
    "Late-run remote zombie movement and gait stay continuous under delayed snapshots",
    motion.length > 20 &&
      maxStep > 0.001 &&
      maxStep < 0.25 &&
      maxLeg > 0.001 &&
      maxLeg < 0.2,
  );
  await host.evaluate(() => {
    const e = window.__vesper.enemies[0];
    e.dead = true;
    e.deathTime = 100;
  });
  await peer.waitForFunction(
    () =>
      window.__vesper.enemies[0]?.dead &&
      window.__vesper.enemies[0].deathTime <= 0,
    null,
    { timeout: 8000 },
  );
  check(
    "Delayed corpse snapshots do not recreate a falling body",
    await peer.evaluate(
      () =>
        window.__vesper.enemies.length === 1 &&
        !window.__vesper.enemies[0].model.visible,
    ),
  );
  await host.evaluate(() => (window.__vesper.enemies[0].deathTime = 0));
  await peer.waitForFunction(() => window.__vesper.enemies.length === 0);
  check("The host's corpse removal releases the peer replica", true);
  await peer.tap("#hud-pause");
  await peer.tap("#pause-settings");
  await peer.selectOption("#setting-musicTrack", "chair-acier");
  await peer.waitForFunction(
    () =>
      window.__vesper.sound.score.audio.currentTime > 0.1 &&
      !window.__vesper.sound.score.audio.paused,
  );
  check(
    "Settings change the playing track and persist the choice",
    await peer.evaluate(() => {
      const g = window.__vesper;
      return (
        g.sound.score.track.id === "chair-acier" &&
        JSON.parse(localStorage.getItem("vesper-settings")).musicTrack ===
          "chair-acier" &&
        !g.sound.score.audio.error
      );
    }),
  );
  await peer.locator("#setting-musicTrack").scrollIntoViewIfNeeded();
  await peer.screenshot({ path: `${out}/mobile-music.png` });
  const partial = await peer.request.get(
    new URL("/music/lumiere.mp3", process.env.VESPER_URL).href,
    { headers: { Range: "bytes=0-99" } },
  );
  check(
    "Music supports Safari byte-range streaming",
    partial.status() === 206 &&
      (await partial.body()).length === 100 &&
      partial.headers()["content-type"] === "audio/mpeg",
  );
  check("No JavaScript errors", report.errors.length === 0);
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
  console.error(error);
  await host?.screenshot({ path: `${out}/host-failure.png` }).catch(() => {});
  await peer?.screenshot({ path: `${out}/peer-failure.png` }).catch(() => {});
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await safari?.close();
  console.log(out);
}
