import { chromiumOptions } from "./browser.mjs";
// Isolated production-build CPU/GPU measurements. No instrumentation is shipped.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { createStaticServer } from "./serve.mjs";
import { openGameAudit } from "./game-audit.mjs";

const label = process.argv[2] || "profile";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid report label");
const out = `artifacts/thermal-${label}`;
fs.mkdirSync(out, { recursive: true });
const server = createStaticServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
process.env.VESPER_URL = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = {
  label,
  date: new Date().toISOString(),
  scenes: [],
  errors: [],
  scope:
    "Mac Chrome, isolated browser, 1440x900 CSS at DPR 1.5, fixed high quality. CPU process percentages use one core as 100%. The GPU process percentage measures its CPU use, not physical GPU utilization. Raw WebGL timer queries include driver timing effects; they are not calibrated GPU execution time, temperature or power.",
};
try {
  const browserCDP = await browser.newBrowserCDPSession();
  const hardware = await browserCDP.send("SystemInfo.getInfo");
  report.gpu = hardware.gpu.devices;
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") report.errors.push(message.text());
  });
  await openGameAudit(page);
  await page.click("#play-button");
  await page.waitForFunction(() => window.__vesper?.state === "playing", null, {
    timeout: 60000,
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  async function measure(name, profile = false) {
    await page.waitForTimeout(500);
    const initial = await browserCDP.send("SystemInfo.getProcessInfo");
    const initialMetrics = await cdp.send("Performance.getMetrics");
    if (profile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    }
    const started = performance.now();
    const data = await page.evaluate(async () => {
      const g = window.__vesper,
        r = g.renderer,
        gl = r.getContext();
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const measures = {},
        pending = [],
        restore = [];
      let frames = 0,
        disjoint = 0;
      const add = (name, value) => (measures[name] ||= []).push(value);
      const wrap = (object, key, name, draws = false) => {
        const original = object[key];
        object[key] = function (...args) {
          const calls = r.info.render.calls,
            triangles = r.info.render.triangles;
          const before = performance.now();
          try {
            return original.apply(this, args);
          } finally {
            add(name + ".cpuMs", performance.now() - before);
            if (draws) {
              add(name + ".calls", r.info.render.calls - calls);
              add(name + ".triangles", r.info.render.triangles - triangles);
            }
          }
        };
        restore.push(() => (object[key] = original));
      };
      const autoReset = r.info.autoReset;
      r.info.autoReset = false;
      for (const key of [
        "update",
        "updatePlayer",
        "updateEnemies",
        "updateNavigation",
        "updateHUD",
        "updateEffects",
      ])
        wrap(g, key, key);
      if (g.world) wrap(g.world, "update", "world");
      const passNames = [
        "worldRender",
        "occlusion",
        "weaponRender",
        "bloom",
        "output",
        "antialias",
        "film",
      ];
      for (const [i, pass] of g.composer.passes.entries())
        wrap(pass, "render", passNames[i] || String(i), true);
      const originalRender = g.composer.render;
      const poll = () => {
        if (!ext) return;
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          disjoint++;
          for (const { query } of pending) gl.deleteQuery(query);
          pending.length = 0;
          return;
        }
        while (
          pending.length &&
          gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)
        ) {
          const { query, name } = pending.shift();
          add(
            name + ".gpuMs",
            gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6,
          );
          gl.deleteQuery(query);
        }
      };
      g.composer.render = function (...args) {
        frames++;
        r.info.reset();
        const query = ext && frames % 10 === 0 ? gl.createQuery() : null;
        if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        const before = performance.now();
        const result = originalRender.apply(this, args);
        if (query) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pending.push({ query, name: "render" });
        }
        add("render.cpuMs", performance.now() - before);
        add("render.calls", r.info.render.calls);
        add("render.triangles", r.info.render.triangles);
        poll();
        return result;
      };
      const beginning = performance.now();
      try {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        poll();
      } finally {
        g.composer.render = originalRender;
        for (const undo of restore.reverse()) undo();
        r.info.autoReset = autoReset;
        for (const { query } of pending) gl.deleteQuery(query);
      }
      const elapsed = performance.now() - beginning;
      const stats = {};
      for (const [key, values] of Object.entries(measures)) {
        values.sort((a, b) => a - b);
        const total = values.reduce((a, b) => a + b, 0);
        stats[key] = {
          samples: values.length,
          mean: total / values.length,
          p95: values[Math.floor(values.length * 0.95)],
          total,
        };
      }
      return {
        elapsedMs: elapsed,
        renderedFps: (frames * 1000) / elapsed,
        frames,
        state: g.state,
        enemies: g.enemies.length,
        quality: g.settings.quality,
        frameRate: g.settings.frameRate,
        ratio: g.renderSize.ratio,
        timerQueryAvailable: !!ext,
        disjoint,
        stats,
        memory: { ...r.info.memory },
        heap: performance.memory?.usedJSHeapSize,
      };
    });
    if (profile) {
      const { profile: cpu } = await cdp.send("Profiler.stop");
      fs.writeFileSync(`${out}/${name}.cpuprofile`, JSON.stringify(cpu));
      const nodes = new Map(cpu.nodes.map((node) => [node.id, node.callFrame]));
      const times = new Map();
      for (let i = 0; i < cpu.samples.length; i++) {
        const frame = nodes.get(cpu.samples[i]);
        const key = `${frame.functionName || "anonymous"} (${frame.url.split("/").at(-1)}:${frame.lineNumber + 1})`;
        times.set(key, (times.get(key) || 0) + cpu.timeDeltas[i]);
      }
      data.hotFunctions = [...times]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 18)
        .map(([name, microseconds]) => ({
          name,
          milliseconds: microseconds / 1000,
        }));
    }
    const final = await browserCDP.send("SystemInfo.getProcessInfo");
    const metrics = await cdp.send("Performance.getMetrics");
    const wall = (performance.now() - started) / 1000;
    data.cpuPercent = {};
    for (const process of final.processInfo) {
      const before = initial.processInfo.find((p) => p.id === process.id);
      if (before)
        data.cpuPercent[process.type] =
          (data.cpuPercent[process.type] || 0) +
          ((process.cpuTime - before.cpuTime) * 100) / wall;
    }
    data.mainThreadPercent =
      ((metrics.metrics.find((m) => m.name === "TaskDuration").value -
        initialMetrics.metrics.find((m) => m.name === "TaskDuration").value) *
        100) /
      wall;
    report.scenes.push({ name, ...data });
    console.log(
      JSON.stringify({
        name,
        fps: data.renderedFps,
        cpu: data.cpuPercent,
        mainThread: data.mainThreadPercent,
        timer: data.timerQueryAvailable,
        drawCalls: data.stats["render.calls"]?.mean,
        renderCpuMs: data.stats["render.cpuMs"]?.mean,
        updateCpuMs: data.stats["update.cpuMs"]?.mean,
        gpuMs: Object.fromEntries(
          Object.entries(data.stats)
            .filter(([name]) => name.endsWith(".gpuMs"))
            .map(([name, s]) => [name, s.mean]),
        ),
      }),
    );
  }
  for (const map of ["abbey", "station", "abyss"]) {
    await page.evaluate(async (map) => {
      const g = window.__vesper;
      if (g.map !== map) await g.start(map, "normal", false);
      g.applySettings({
        ...g.settings,
        quality: "high",
        frameRate: 60,
        adaptiveQuality: false,
        touchAdaptiveQuality: false,
      });
      g.phaseTimer = 3600;
      g.player.invulnerable = 1e9;
      g.world.doors.forEach((door) => g.world.openDoor(door));
      g.updateNavigation(true);
      g.world.setPower();
      g.player.position.set(0, 1.7, map === "abyss" ? 32 : 18);
      g.yaw = 0;
      g.pitch = 0.025;
    }, map);
    await page.waitForTimeout(4500);
    await measure(map + "-empty");
    await page.evaluate(() => {
      const g = window.__vesper;
      for (let i = 0; i < 28; i++) {
        g.spawnEnemy(
          ["walker", "runner", "brute", "spitter", "wraith"][i % 5],
          g.player.position
            .clone()
            .set(
              ((i % 7) - 3) * 1.6,
              0,
              g.player.position.z - 6 - Math.floor(i / 7) * 2.4,
            ),
        );
        const e = g.enemies.at(-1);
        e.model.position.y = 0;
        e.stagger = 1e9;
      }
    });
    await measure(map + "-horde", map === "abbey");
    if (map === "abbey") {
      await page.evaluate(() => window.__vesper.pause());
      await measure("paused");
      await page.screenshot({ path: `${out}/paused.png` });
      await page.evaluate(() => window.__vesper.resume());
      await page.evaluate(() => {
        const g = window.__vesper;
        g.applySettings({ ...g.settings, frameRate: 30 });
      });
      await measure("abbey-horde-30fps");
    }
  }
  await page.evaluate(() => window.__vesper.end(false));
  await measure("gameover");
  await page.evaluate(() => window.__vesper.menu());
  await measure("menu-after-run");
  assert.deepEqual(report.errors, []);
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(out);
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
