import { chromiumOptions } from "./browser.mjs";
// Deep play-through with real inputs only: keyboard, pointer-locked mouse
// deltas and UI buttons. The game state is READ to decide inputs (like a
// player reading the screen), never written.
//   MODE=solo|coop  WAVES=6  MAP=abbey|station|abyss  DIFFICULTY=normal
//   Dev server (5173) by default; VESPER_URL=http://localhost:4173 for the build.
//   Co-op needs `npm run relay` running.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const URL = process.env.VESPER_URL || "http://localhost:5173";
const MODE = process.env.MODE || "solo"; // solo | coop
const TARGET_WAVE = Number(process.env.WAVES || 6);
const DIFFICULTY = process.env.DIFFICULTY || "normal";
const MAP = process.env.MAP || "abbey";
const OUT = `artifacts/deep-${MODE}-${Date.now()}`;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const results = [];
const check = (name, ok, extra = "") => {
  results.push([name, ok, extra]);
  console.log(ok ? "PASS" : "FAIL", name, extra);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  ...chromiumOptions,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
async function openPage(label) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.label = label;
  page.on("pageerror", (e) => {
    page.errors.push(e.message);
    log(label, "PAGEERROR", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      page.errors.push(m.text());
      log(label, "CONSOLE", m.text().slice(0, 160));
    }
  });
  if (process.env.VESPER_URL) {
    const { openGameAudit } = await import("./game-audit.mjs");
    await openGameAudit(page);
  } else await page.goto(URL);
  await page.waitForSelector("#play-button");
  return page;
}

// ---------- observation (read-only) ----------
async function observe(page) {
  return page.evaluate(() => {
    const g = window.__vesper;
    if (!g) return { state: "none" };
    const toast =
      document.querySelector("#toast-container strong")?.textContent || "";
    const hud = {
      wave: document.querySelector("#wave-number")?.textContent,
      points: document.querySelector("#points-value")?.textContent,
      weapon: document.querySelector("#weapon-name")?.textContent,
      ammo: document.querySelector("#ammo-value")?.textContent,
      bossVisible: !document
        .querySelector("#boss-bar")
        ?.classList.contains("hidden"),
      interaction: document.querySelector("#interaction span")?.textContent,
      perks: document.querySelectorAll("#perk-slots span").length,
      team: [...document.querySelectorAll("#team-list > div > span")].map(
        (s) => s.textContent,
      ),
      downed: !document.querySelector("#downed")?.classList.contains("hidden"),
      toast,
    };
    if (!g.player || g.state === "menu") return { state: g.state, hud };
    return {
      state: g.state,
      phase: g.phase,
      wave: g.wave,
      phaseTimer: g.phaseTimer,
      points: g.player.points,
      health: g.player.health,
      ammo: g.weapon.ammo,
      reserve: g.weapon.reserve,
      grenades: g.player.grenades,
      level: g.weapon.level || 0,
      weaponId: g.weapon.id,
      perks: [...g.player.perks],
      downed: !!g.downed,
      power: g.world.power,
      pos: g.player.position.toArray(),
      yaw: g.yaw,
      pitch: g.pitch,
      camY: g.camera.position.y,
      sensitivity: g.settings.sensitivity,
      peer: !!g.session?.peer,
      slots: g.weapons.map((w) => ({
        id: w.id,
        ammo: w.ammo,
        reserve: w.reserve,
      })),
      slot: g.slot,
      enemies: g.enemies
        .filter((e) => !e.dead && e.model.position.y > -0.3)
        .map((e) => {
          const origin = g.camera.position,
            to = e.model.position.clone().add({ x: 0, y: 1.2, z: 0 });
          const dir = to.clone().sub(origin),
            len = dir.length();
          const visible =
            g.obstacleDistance(origin, dir.normalize(), len) >= len - 0.3;
          // The head as drawn: horde bodies stoop and lurch, so a player
          // aims at what is on screen, not at a fixed height.
          const part = e.model.userData.hitParts?.find((p) => p.head);
          const bone = part && e.model.getObjectByName(part.bone);
          const head = bone
            ? part.offset.clone().applyMatrix4(bone.matrixWorld)
            : null;
          return {
            x: e.model.position.x,
            z: e.model.position.z,
            type: e.type,
            scale: e.model.scale.y,
            id: e.id,
            visible,
            head: head && [head.x, head.y, head.z],
          };
        }),
      enemyCount: g.enemies.filter((e) => !e.dead).length,
      interactions: g.world.interactions.map((i, index) => ({
        index,
        kind: i.kind,
        x: i.position.x,
        z: i.position.z,
        cost: g.interactionCost(i),
        open: !!i.open,
        busy: !!i.busy,
        offered: i.offered || null,
        text: g.interactionText(i),
      })),
      hud,
      fps: Math.round(g.fps),
      calls: g.renderer.info.render.calls,
    };
  });
}
// A bot-side navigation grid built from the same obstacle data a player sees on the radar.
async function ensureBotNav(page) {
  await page.evaluate(async () => {
    if (window.__botNav) return;
    const g = window.__vesper;
    // Same class as the game's own flow field, also available on the production bundle.
    window.__botNav = new g.navigation.constructor(
      g.world.obstacles,
      g.navigation.size,
      1,
      0.42,
    );
    window.__botNav.goal = null;
  });
}
async function waypoint(page, target) {
  return page.evaluate(
    ({ target }) => {
      const g = window.__vesper,
        nav = window.__botNav;
      const key = `${target.x.toFixed(1)},${target.z.toFixed(1)},${g.world.doors.map((d) => (d.open ? 1 : 0)).join("")}`;
      if (nav.goal !== key) {
        nav.rebuild();
        nav.update(target.x, target.z);
        nav.goal = key;
      }
      const p = g.player.position;
      const w = nav.direction(p.x, p.z, target);
      return {
        x: w.x,
        z: w.z,
        reachable: nav.distance[nav.index(p.x, p.z)] >= 0,
      };
    },
    { target },
  );
}
// ---------- inputs (real) ----------
async function lock(page) {
  await page.mouse.click(640, 400);
  await sleep(150);
  const locked = await page.evaluate(
    () =>
      document.pointerLockElement === document.querySelector("#game-canvas"),
  );
  return locked;
}
async function look(page, dyaw, dpitch, sensitivity) {
  // Pointer-locked mouse: the game consumes movementX/Y from mousemove.
  const k = 0.0018 * sensitivity;
  const mx = Math.max(-260, Math.min(260, -dyaw / k));
  const my = Math.max(-200, Math.min(200, -dpitch / k));
  await page.evaluate(
    ({ mx, my }) => {
      document.dispatchEvent(
        new MouseEvent("mousemove", {
          movementX: mx,
          movementY: my,
          bubbles: true,
        }),
      );
    },
    { mx, my },
  );
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (from, to) => Math.atan2(-(to.x - from[0]), -(to.z - from[2]));

class Bot {
  constructor(page, opts) {
    this.page = page;
    this.opts = opts;
    this.keys = new Set();
    this.firing = false;
    this.lastGrenade = 0;
    this.lastReload = 0;
    this.plan = [...opts.plan];
    this.events = [];
    this.bought = [];
    this.waveSeen = 0;
    this.bossSeen = false;
    this.bossKilled = false;
    this.maxWave = 0;
    this.stuck = 0;
    this.lastPos = null;
    this.calledWave = 0;
  }
  async key(code, down) {
    if (down && !this.keys.has(code)) {
      await this.page.keyboard.down(code);
      this.keys.add(code);
    }
    if (!down && this.keys.has(code)) {
      await this.page.keyboard.up(code);
      this.keys.delete(code);
    }
  }
  async releaseAll() {
    for (const k of [...this.keys]) await this.key(k, false);
    if (this.firing) {
      await this.page.mouse.up();
      this.firing = false;
    }
  }
  async fire(on, automatic) {
    if (on && !this.firing) {
      await this.page.mouse.down();
      this.firing = true;
    } else if (!on && this.firing) {
      await this.page.mouse.up();
      this.firing = false;
    } else if (on && this.firing && !automatic) {
      await this.page.mouse.up();
      await this.page.mouse.down();
    }
  }
  async step(s) {
    const page = this.page;
    if (s.wave > this.maxWave) {
      this.maxWave = s.wave;
      this.events.push(
        `wave ${s.wave} at ${Math.round(performance.now() / 1000)}s points=${s.points} hp=${Math.round(s.health)}`,
      );
      log(
        page.label,
        `→ vague ${s.wave}`,
        `points ${s.points} hp ${Math.round(s.health)} weapon ${s.weaponId} lvl ${s.level}`,
      );
    }
    if (s.enemies.some((e) => e.type === "archon")) this.bossSeen = true;
    if (s.hud.bossVisible) this.bossHud = true;
    if (s.downed) {
      await this.releaseAll();
      return;
    }
    const alive = s.enemies.filter((e) => e.type !== "survivor");
    let target = null,
      best = Infinity,
      nearestAny = null,
      nearestD = Infinity;
    for (const e of alive) {
      const d = Math.hypot(e.x - s.pos[0], e.z - s.pos[2]);
      if (d < nearestD) {
        nearestD = d;
        nearestAny = e;
      }
      if (e.visible && d < best) {
        best = d;
        target = e;
      }
    }
    // Dry weapon: switch to the other slot, or top up during a lull.
    const empty = s.ammo === 0 && s.reserve === 0;
    if (
      empty &&
      s.slots.length > 1 &&
      Date.now() - (this.lastSwitch || 0) > 1500
    ) {
      const other = 1 - s.slot;
      if (s.slots[other].ammo + s.slots[other].reserve > 0) {
        await page.keyboard.press(other === 0 ? "Digit1" : "Digit2");
        this.lastSwitch = Date.now();
        this.events.push(`switched weapon (wave ${s.wave})`);
      }
    }
    if (
      nearestAny &&
      nearestD < 2.2 &&
      empty &&
      Date.now() - (this.lastMelee || 0) > 900
    ) {
      await page.keyboard.press("KeyV");
      this.lastMelee = Date.now();
    }
    // Low magazine and nobody close: reload early.
    if (
      s.ammo > 0 &&
      s.ammo < 6 &&
      s.reserve > 0 &&
      nearestD > 7 &&
      Date.now() - this.lastReload > 2500
    ) {
      await page.keyboard.press("KeyR");
      this.lastReload = Date.now();
    }
    // ---- combat ----
    if (!target && nearestAny && s.phase === "wave") {
      // No line of sight: walk toward the nearest one along the radar's routes.
      await this.fire(false, true);
      const w = await waypoint(page, { x: nearestAny.x, z: nearestAny.z });
      const dyaw = wrap(yawTo(s.pos, w) - s.yaw);
      await look(page, dyaw, -s.pitch * 0.5, s.sensitivity);
      await this.key("KeyS", false);
      await this.key("KeyD", false);
      await this.key("KeyW", Math.abs(dyaw) < 0.5 && nearestD > 3);
      return;
    }
    if (target && best < 40) {
      const aim = target.head
        ? { x: target.head[0], z: target.head[2] }
        : target;
      const headY = target.head ? target.head[1] : 1.8 * target.scale - 0.15;
      const dyaw = wrap(yawTo(s.pos, aim) - s.yaw);
      const dpitch =
        Math.atan2(
          headY - s.camY,
          Math.hypot(aim.x - s.pos[0], aim.z - s.pos[2]),
        ) - s.pitch;
      await look(page, dyaw, dpitch, s.sensitivity);
      const automatic = ["spectre", "marauder", "eclipse"].includes(s.weaponId);
      const aimed = Math.abs(dyaw) < 0.05 && Math.abs(dpitch) < 0.06;
      if (s.ammo === 0) {
        await this.fire(false, automatic);
        if (Date.now() - this.lastReload > 1500) {
          await page.keyboard.press("KeyR");
          this.lastReload = Date.now();
        }
      } else await this.fire(aimed && best < 32, automatic);
      const heavy = alive.filter(
        (e) =>
          (e.type === "brute" || e.type === "archon") &&
          Math.hypot(e.x - s.pos[0], e.z - s.pos[2]) < 14,
      );
      if (
        heavy.length &&
        s.grenades > 0 &&
        best > 4 &&
        Date.now() - this.lastGrenade > 4000
      ) {
        await page.keyboard.press("KeyG");
        this.lastGrenade = Date.now();
        this.events.push(`grenade at wave ${s.wave}`);
      }
      // keep distance: back off when close, stop otherwise
      await this.key("KeyW", false);
      await this.key("ShiftLeft", false);
      await this.key("KeyS", best < 4.5);
      await this.key("KeyA", false);
      await this.key("KeyD", best < 4.5 && Math.sin(Date.now() / 900) > 0);
      return;
    }
    await this.fire(false, true);
    await this.key("KeyS", false);
    await this.key("KeyD", false);
    // ---- shopping during rest ----
    if (s.phase === "rest" || alive.length === 0) {
      if (s.ammo < 5 && s.reserve > 0 && Date.now() - this.lastReload > 1500) {
        await page.keyboard.press("KeyR");
        this.lastReload = Date.now();
      }
      const next = this.plan[0];
      if (next) {
        const i = s.interactions.find(
          (it) =>
            it.kind === next.kind &&
            (next.pick
              ? next.pick(
                  it,
                  s.interactions.filter((d) => !d.open),
                )
              : true),
        );
        if (
          next.kind === "door" &&
          this.doorTarget &&
          s.interactions[this.doorTarget].open
        ) {
          this.plan.shift();
          this.bought.push("door");
          this.events.push(`bought door #${this.doorTarget} (wave ${s.wave})`);
          log(page.label, "✓ door", this.doorTarget);
          this.doorTarget = null;
          return;
        }
        if (next.kind === "door" && i) this.doorTarget = i.index;
        const done =
          !i ||
          (next.kind === "ammo" &&
            (this.ammoBoughtAt === s.wave || s.reserve >= 150)) ||
          (i.kind === "door" && i.open) ||
          (i.kind === "power" && s.power) ||
          (next.kind === "upgrade" && s.level >= (next.level || 1)) ||
          (next.kind !== "upgrade" &&
            next.kind !== "door" &&
            next.kind !== "power" &&
            next.kind !== "box" &&
            s.perks.includes(next.kind)) ||
          (next.kind === "box" && s.weaponId !== "vigil");
        if (done) {
          this.plan.shift();
          this.bought.push(next.kind);
          this.events.push(
            `bought ${next.kind} (wave ${s.wave}, points left ${s.points})`,
          );
          log(page.label, "✓", next.kind);
          await this.key("KeyW", false);
          return;
        }
        const needsPower =
          ["upgrade", "health", "speed", "rate", "focus"].includes(next.kind) &&
          !s.power;
        if (!needsPower && s.points >= i.cost) {
          const front = {
            x: i.x + (next.front?.[0] || 0),
            z: i.z + (next.front?.[1] || 0),
          };
          const d = Math.hypot(front.x - s.pos[0], front.z - s.pos[2]);
          if (d < 1.6) {
            await this.key("KeyW", false);
            await this.key("ShiftLeft", false);
            // face the machine and interact
            const dyaw = wrap(yawTo(s.pos, { x: i.x, z: i.z }) - s.yaw);
            await look(page, dyaw, -s.pitch, s.sensitivity);
            if (next.kind === "box" && i.busy && !i.offered) return; // wait for the draw
            await page.keyboard.press("KeyE");
            if (next.kind === "ammo") this.ammoBoughtAt = s.wave;
            await sleep(250);
            return;
          }
          const w = await waypoint(page, front);
          const dyaw = wrap(yawTo(s.pos, w) - s.yaw);
          await look(page, dyaw, -s.pitch * 0.5, s.sensitivity);
          await this.key("KeyW", Math.abs(dyaw) < 0.5);
          await this.key("ShiftLeft", Math.abs(dyaw) < 0.5);
          // stuck detection
          if (
            this.lastPos &&
            Math.hypot(this.lastPos[0] - s.pos[0], this.lastPos[2] - s.pos[2]) <
              0.02
          )
            this.stuck++;
          else this.stuck = 0;
          if (this.stuck > 25) {
            await page.keyboard.press("Space");
            await this.key("KeyA", true);
            await sleep(400);
            await this.key("KeyA", false);
            this.stuck = 0;
          }
          this.lastPos = s.pos;
          return;
        }
      }
      await this.key("KeyW", false);
      await this.key("ShiftLeft", false);
      // nothing to buy: call the next wave (host only)
      // A considerate host leaves teammates time to shop before calling the wave.
      const patient = this.opts.coop ? s.phaseTimer < 5 : s.phaseTimer > 1.5;
      if (
        !s.peer &&
        s.phase === "rest" &&
        patient &&
        Date.now() - this.calledWave > 3000
      ) {
        await page.keyboard.press("KeyN");
        this.calledWave = Date.now();
      }
    }
  }
}

async function startSolo(page) {
  await page.click(`[data-map="${MAP}"]`);
  await page.click(`[data-difficulty="${DIFFICULTY}"]`);
  await page.click("#play-button");
  await page.waitForFunction(() => window.__vesper?.state === "playing", null, {
    timeout: 90000,
  });
  check("Solo game starts from the menu", true);
  check("Pointer lock acquired through a canvas click", await lock(page));
}
async function startCoop(host, peer) {
  await host.click("#coop-button");
  await host.fill("#coop-name", "Alpha");
  await host.click("#coop-create");
  await host.waitForSelector(".lobby-code", { timeout: 15000 });
  const code = await host.locator(".lobby-code").innerText();
  await peer.click("#coop-button");
  await peer.fill("#coop-name", "Bravo");
  await peer.fill("#coop-code", code);
  await peer.click("#coop-join");
  await host.waitForFunction(
    () =>
      document.querySelectorAll(".lobby-players li:not(.empty)").length === 2,
    null,
    { timeout: 10000 },
  );
  await host.selectOption("#coop-map", MAP);
  await host.selectOption("#coop-difficulty", DIFFICULTY);
  await sleep(300);
  await host.click("#coop-start");
  await host.waitForFunction(() => window.__vesper?.state === "playing", null, {
    timeout: 90000,
  });
  await peer.waitForFunction(() => window.__vesper?.state === "playing", null, {
    timeout: 90000,
  });
  check("Co-op game starts for host and peer from the lobby", true);
  check("Host pointer lock", await lock(host));
  check("Peer pointer lock", await lock(peer));
}

const PLAN = [
  { kind: "door", front: [0, 2.2] },
  { kind: "power", front: [2.2, 0] },
  { kind: "box", front: [2.2, 0] },
  { kind: "ammo", front: [-2.2, 0] },
  { kind: "health", front: [2.2, 0] },
  { kind: "upgrade", front: [-2.2, 0], level: 1 },
  { kind: "speed", front: [-2.2, 0] },
  { kind: "rate", front: [2.2, 0] },
  { kind: "focus", front: [-2.2, 0] },
  { kind: "ammo", front: [-2.2, 0] },
  { kind: "upgrade", front: [-2.2, 0], level: 2 },
  { kind: "ammo", front: [-2.2, 0] },
];

async function run(pages) {
  const doorCount = await pages[0].evaluate(
    () => window.__vesper.world.doors.length,
  );
  const expand = (plan) =>
    plan.flatMap((step) =>
      step.kind === "door"
        ? Array.from({ length: doorCount }, (_, n) => ({
            kind: "door",
            front: [0, 0],
            pick: (it, all) =>
              it.open === false &&
              all
                .filter((d) => d.kind === "door")
                .sort((a, b) => a.cost - b.cost)
                .indexOf(it) === 0,
          }))
        : [step],
    );
  const bots = pages.map(
    (p, i) =>
      new Bot(p, {
        coop: pages.length > 1,
        plan: expand(
          i === 0
            ? PLAN
            : PLAN.filter((x) => x.kind !== "door" && x.kind !== "power"),
        ),
      }),
  );
  for (const p of pages) await ensureBotNav(p);
  const started = Date.now();
  let lastReport = 0,
    shots = 0;
  while (Date.now() - started < 14 * 60 * 1000) {
    const states = await Promise.all(pages.map(observe));
    if (states.every((s) => s.state === "gameover")) {
      log("game over on all pages");
      break;
    }
    for (let i = 0; i < pages.length; i++) {
      const s = states[i];
      if (s.state === "paused") {
        await pages[i].keyboard.press("Escape");
        continue;
      }
      if (s.state !== "playing") continue;
      await bots[i].step(s);
    }
    const s0 = states[0];
    if (s0.state === "playing" && Date.now() - lastReport > 15000) {
      lastReport = Date.now();
      log(
        pages
          .map(
            (p, i) =>
              `${p.label}: w${states[i].wave} ${states[i].phase} hp${Math.round(states[i].health || 0)} pts${states[i].points} enemies${states[i].enemyCount} fps${states[i].fps}${states[i].downed ? " DOWN" : ""}`,
          )
          .join(" | "),
      );
      if (s0.hud.bossVisible && shots < 1) {
        shots++;
        await pages[0].screenshot({
          path: `${OUT}/boss-${pages[0].label}.png`,
        });
      }
    }
    if (
      s0.wave >= TARGET_WAVE &&
      s0.phase === "rest" &&
      s0.state === "playing"
    ) {
      log("target wave reached during rest");
      break;
    }
    await sleep(90);
  }
  for (const b of bots) await b.releaseAll();
  const finals = await Promise.all(pages.map(observe));
  for (const p of pages)
    await p.screenshot({ path: `${OUT}/final-${p.label}.png` });
  return { bots, finals };
}

if (MODE === "solo") {
  const page = await openPage("solo");
  await startSolo(page);
  const { bots, finals } = await run([page]);
  const s = finals[0],
    b = bots[0];
  check(
    `Reached wave ${TARGET_WAVE} (got ${b.maxWave})`,
    b.maxWave >= TARGET_WAVE,
    `state ${s.state}`,
  );
  check(
    "Door, power and box bought through E",
    ["door", "power", "box"].every((k) => b.bought.includes(k)),
    b.bought.join(","),
  );
  check(
    "At least one perk bought",
    b.bought.some((k) => ["health", "speed", "rate", "focus"].includes(k)),
  );
  check(
    "Weapon transfigured at least once",
    (s.level || 0) >= 1,
    `level ${s.level}, HUD ${s.hud.weapon}`,
  );
  check(
    "HUD wave number matches the engine",
    s.hud.wave === String(s.wave).padStart(2, "0"),
    `${s.hud.wave} vs ${s.wave}`,
  );
  check(
    "HUD essences match the engine",
    s.hud.points === s.points.toLocaleString("fr-FR"),
    `${s.hud.points} vs ${s.points}`,
  );
  check(
    "Archonte appeared at wave 5",
    b.bossSeen || b.maxWave < 5,
    b.bossSeen ? "seen" : "not seen",
  );
  check("Boss bar shown in the HUD", b.bossHud || b.maxWave < 5);
  check(
    "No page or console errors",
    page.errors.length === 0,
    page.errors.slice(0, 3).join(" | "),
  );
  fs.writeFileSync(
    `${OUT}/events.json`,
    JSON.stringify({ events: b.events, bought: b.bought, final: s }, null, 2),
  );
} else {
  const host = await openPage("host"),
    peer = await openPage("peer");
  await startCoop(host, peer);
  const { bots, finals } = await run([host, peer]);
  const [h, p] = finals,
    [bh, bp] = bots;
  check(
    `Both reached wave ${TARGET_WAVE} (host ${bh.maxWave}, peer ${bp.maxWave})`,
    bh.maxWave >= TARGET_WAVE && bp.maxWave >= TARGET_WAVE,
  );
  check(
    "Wave numbers agree on both screens",
    h.hud.wave === p.hud.wave,
    `${h.hud.wave} vs ${p.hud.wave}`,
  );
  check(
    "Enemy counts agree within 2",
    Math.abs(h.enemyCount - p.enemyCount) <= 2,
    `${h.enemyCount} vs ${p.enemyCount}`,
  );
  check(
    "Peer earned points by playing (more than the 650 start)",
    p.points > 650 || bp.bought.length > 0,
    `peer points ${p.points}`,
  );
  check(
    "Peer bought through E via the host",
    bp.bought.length > 0,
    bp.bought.join(","),
  );
  check(
    "Host bought door and power",
    bh.bought.includes("door") && bh.bought.includes("power"),
    bh.bought.join(","),
  );
  check(
    "Team list shows the partner on both HUDs",
    h.hud.team.includes("Bravo") && p.hud.team.includes("Alpha"),
    JSON.stringify([h.hud.team, p.hud.team]),
  );
  check("Both HUDs agree on power state", h.power === p.power);
  check(
    "No page or console errors (host)",
    host.errors.length === 0,
    host.errors.slice(0, 3).join(" | "),
  );
  check(
    "No page or console errors (peer)",
    peer.errors.length === 0,
    peer.errors.slice(0, 3).join(" | "),
  );
  fs.writeFileSync(
    `${OUT}/events.json`,
    JSON.stringify(
      {
        host: { events: bh.events, bought: bh.bought, final: h },
        peer: { events: bp.events, bought: bp.bought, final: p },
      },
      null,
      2,
    ),
  );
}
await browser.close();
console.log(
  `\n${results.filter(([, ok]) => ok).length}/${results.length} checks passed · ${OUT}`,
);
if (results.some(([, ok]) => !ok)) process.exit(1);
