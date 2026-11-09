import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Rescue } from "../src/network/rescue.js";
import { chooseTrack, MUSIC_TRACKS } from "../src/content/music.js";
import { canRelay } from "../server/protocol.js";

function fixture() {
  const input = { keys: new Set(), mouse: { fire: false } };
  const player = {
    position: new T.Vector3(0, 1.7, 0),
    health: 100,
    maxHealth: 100,
  };
  const run = { player, state: "playing", time: 0, downed: false };
  const other = {
    id: 2,
    name: "Bravo",
    tx: 1,
    ty: 1.7,
    tz: 0,
    health: 0,
    maxHealth: 100,
    flags: 8,
  };
  const sent = [];
  const session = {
    id: 1,
    host: true,
    roster: new Map([
      [1, "Alpha"],
      [2, "Bravo"],
    ]),
    players: new Map([[2, other]]),
    context: {
      run,
      input,
      emit() {},
      commands: {
        obstacleDistance: (_, __, distance) => distance,
        revive() {
          run.downed = false;
          player.health = 50;
        },
        eliminate() {
          run.eliminated = true;
        },
      },
    },
    broadcast() {},
    send(id, message) {
      sent.push({ id, ...message });
    },
  };
  const rescue = new Rescue(session);
  const step = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      run.time += 1 / 60;
      rescue.update(1 / 60);
    }
  };
  return { session, rescue, input, run, player, other, sent, step };
}
test("three uninterrupted seconds revive a teammate once, preserving its position", () => {
  const f = fixture();
  f.input.keys.add("KeyE");
  f.step(2.8);
  assert.equal(f.other.flags, 8);
  assert.ok(f.rescue.status(2).progress > 0.9);
  f.step(0.3);
  assert.equal(f.other.flags, 0);
  assert.equal(f.other.health, 50);
  assert.equal(f.other.tx, 1);
  assert.equal(f.rescue.states.size, 0);
  assert.equal(f.sent.filter((m) => m.k === "revived").length, 1);
  f.step(1);
  assert.equal(f.sent.length, 1);
});
test("releasing, shooting, leaving range or being hurt interrupts rescue", () => {
  for (const interrupt of [
    (f) => f.input.keys.clear(),
    (f) => (f.input.mouse.fire = true),
    (f) => (f.other.tx = 4),
    (f) => (f.player.health = 80),
  ]) {
    const f = fixture();
    f.input.keys.add("KeyE");
    f.step(1.5);
    interrupt(f);
    f.step(0.1);
    assert.ok(f.rescue.status(2).progress < 0.04);
    assert.equal(f.other.flags, 8);
  }
});
test("controller interact can revive a teammate, and firing interrupts it", () => {
  const f = fixture();
  f.input.gamepad = { interact: true, fire: false };
  f.step(1);
  assert.ok(f.rescue.status(2).progress > 0.3);
  f.input.gamepad.fire = true;
  f.step(0.1);
  assert.equal(f.rescue.status(2).progress, 0);
  f.input.gamepad.fire = false;
  f.step(3.1);
  assert.equal(f.other.flags, 0);
});
test("rescue cannot cross a wall and touch release cancels it", () => {
  const f = fixture();
  f.input.touchInteract = true;
  f.session.context.commands.obstacleDistance = () => 0.4;
  f.step(1);
  assert.equal(f.rescue.status(2).progress, 0);
  f.session.context.commands.obstacleDistance = (_, __, d) => d;
  f.step(1);
  assert.ok(f.rescue.status(2).progress > 0.3);
  f.input.touchInteract = false;
  f.step(0.1);
  assert.equal(f.rescue.status(2).progress, 0);
});
test("a peer can rescue the host; dead or absent peers cannot", () => {
  const f = fixture();
  f.run.downed = true;
  f.player.health = 0;
  f.other.flags = 0;
  f.other.health = 100;
  f.other.rescueTarget = 1;
  f.step(3.1);
  assert.equal(f.run.downed, false);
  assert.equal(f.player.health, 50);
  const dead = fixture();
  dead.run.downed = true;
  dead.other.flags = 8;
  dead.other.rescueTarget = 1;
  dead.step(3.1);
  assert.equal(dead.run.downed, true);
});
test("45 seconds eliminate once; disconnect removes rescue state", () => {
  const f = fixture();
  f.step(45.1);
  assert.ok(f.other.flags & 32);
  assert.equal(f.rescue.status(2).dead, true);
  f.step(1);
  assert.equal(f.sent.filter((m) => m.k === "eliminated").length, 1);
  f.session.players.clear();
  f.step(0.1);
  assert.equal(f.rescue.states.size, 0);
});
test("only the host advances rescue or sends resurrection events", () => {
  const f = fixture();
  f.session.host = false;
  f.input.keys.add("KeyE");
  f.step(4);
  assert.equal(f.rescue.states.size, 0);
  assert.equal(f.sent.length, 0);
  for (const k of ["revived", "eliminated"]) {
    assert.equal(canRelay({ t: "ev", k }, false), false);
    assert.equal(canRelay({ t: "ev", k }, true), true);
  }
});
test("random songs never repeat immediately and a selected song stays selected", () => {
  for (const track of MUSIC_TRACKS)
    for (const random of [() => 0, () => 0.999]) {
      assert.notEqual(chooseTrack("random", track.id, random).id, track.id);
      assert.equal(chooseTrack(track.id, track.id, random).id, track.id);
    }
  assert.ok(MUSIC_TRACKS.includes(chooseTrack("obsolete", null)));
});

function zombieFixture() {
  const model = new T.Group();
  Object.assign(model, {
    userData: {
      hips: new T.Bone(),
      torso: new T.Bone(),
      head: new T.Bone(),
      jaw: new T.Bone(),
      arms: [new T.Bone(), new T.Bone()],
      elbows: [new T.Bone(), new T.Bone()],
      wrists: [new T.Bone(), new T.Bone()],
      legs: [0, 1].map(() => ({
        root: new T.Bone(),
        shin: new T.Bone(),
        foot: new T.Bone(),
      })),
      type: "walker",
      variation: 0.5,
    },
  });
  return model;
}

test("zombie gait stays continuous late in a run and at cycle boundaries", async () => {
  const { animateZombie } = await import("../src/creatures.js");
  const early = zombieFixture(),
    late = zombieFixture();
  for (let i = 0; i < 240; i++) {
    const speed = i % 2 ? 0.9 : 1.1;
    animateZombie(early, i / 60, speed);
    animateZombie(late, 600 + i / 60, speed);
    assert.ok(
      Math.abs(early.userData.walkPhase - late.userData.walkPhase) < 1e-9,
    );
  }
  const g = zombieFixture();
  g.userData.walkPhase = 4 * Math.PI - 0.001;
  animateZombie(g, 600, 1);
  const before = g.userData.arms[1].rotation.y;
  animateZombie(g, 600 + 1 / 60, 1);
  assert.ok(Math.abs(g.userData.arms[1].rotation.y - before) < 0.01);
  animateZombie(g, 601, 0);
  const stoppedPhase = g.userData.walkPhase;
  for (let i = 1; i <= 60; i++) animateZombie(g, 601 + i / 60, 0);
  assert.equal(g.userData.walkPhase, stoppedPhase);
  for (const foot of g.userData.motionState.feet) {
    assert.ok(foot.planted, "an interrupted step must finish on the floor");
    assert.ok(Math.abs(foot.position.y - 0.076) < 1e-9);
  }
  for (const leg of g.userData.legs)
    assert.ok(Number.isFinite(leg.shin.rotation.x));
});

test("snapshot interpolation never rewinds when the host slows or packets arrive in bursts", async () => {
  const { WorldReplica } = await import("../src/network/replica.js");
  for (const fps of [30, 60])
    for (const rate of [1, 0.75, 0.5]) {
      const model = zombieFixture();
      const enemy = {
        model,
        type: "walker",
        samples: [],
        age: 1,
        seed: 0,
        stagger: 0,
        speed: 0,
      };
      const context = {
        run: {
          time: 0,
          enemies: [enemy],
          player: { position: new T.Vector3() },
        },
        commands: { applyDetail() {} },
      };
      const replica = new WorldReplica(context, {}, {});
      let next = 0,
        sequence = 0,
        previous = 0;
      const queue = [];
      for (let frame = 0; frame < 10 * fps; frame++) {
        const t = frame / fps;
        context.run.time = t;
        if (t >= next) {
          const time = next * rate;
          queue.push({
            arrival: next + [0.04, 0.07, 0.1, 0.13][sequence++ % 4],
            time,
            x: time * 1.7,
            z: 0,
            yaw: 0,
          });
          next += 0.05;
        }
        while (queue[0]?.arrival <= t) {
          const sample = queue.shift();
          replica.latestTime = sample.time;
          replica.renderTime ??= sample.time - 0.1;
          enemy.samples.push(sample);
          if (enemy.samples.length > 8) enemy.samples.shift();
        }
        if (!enemy.samples.length) continue;
        replica.updateRemoteEnemies(1 / fps);
        const step = model.position.x - previous;
        assert.ok(
          step >= 0 && step < 0.09,
          `rate ${rate}, ${fps} FPS: unexpected step ${step}`,
        );
        previous = model.position.x;
      }
      assert.ok(
        Math.abs(previous - 17 * rate) < 0.5,
        "replica must actually follow the moving host",
      );
    }
});
