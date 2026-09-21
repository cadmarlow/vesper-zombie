import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  animateZombie,
  ZOMBIE_MOTION_PROFILES,
} from "../src/creature-motion.js";

function model(type = "walker", scale = 1, variation = 0.5) {
  const g = new T.Group();
  g.scale.setScalar(scale);
  const bone = (parent, x, y, z = 0) => {
    const b = new T.Bone();
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const hips = bone(g, 0, 0.88);
  const spine = bone(hips, 0, 0.19);
  const torso = bone(spine, 0, 0.28);
  const neck = bone(torso, 0, 0.22);
  const head = bone(neck, 0, 0.2);
  const jaw = bone(head, 0, -0.039, -0.018);
  const shoulders = [],
    arms = [],
    elbows = [],
    wrists = [],
    legs = [],
    fingers = [];
  for (const side of [-1, 1]) {
    const shoulder = bone(torso, side * 0.12, 0.1);
    shoulders.push(shoulder);
    const arm = bone(shoulder, side * 0.145, 0.01);
    arms.push(arm);
    const elbow = bone(arm, side * 0.016, -0.305);
    elbows.push(elbow);
    const wrist = bone(elbow, 0, -0.29);
    wrists.push(wrist);
    fingers.push(
      [0, 1, 2, 3, 4].map((i) => {
        const root = bone(wrist, (i - 1.5) * 0.025, -0.05);
        return { root, tip: bone(root, 0, -0.05), thumb: i === 4 };
      }),
    );
    const root = bone(hips, side * 0.115, 0);
    const shin = bone(root, 0, -0.42);
    const foot = bone(shin, 0, -0.36, 0.025);
    legs.push({
      root,
      shin,
      foot,
      toe: bone(foot, 0, -0.033, 0.105),
      lengths: { upper: 0.42, lower: Math.hypot(0.36, 0.025) },
    });
  }
  g.userData = {
    type,
    look: type === "archon" ? "brute" : type,
    variation,
    hips,
    spine,
    torso,
    neck,
    head,
    jaw,
    shoulders,
    arms,
    elbows,
    wrists,
    legs,
    fingers,
    rig: { hipHeight: 0.88, ankleHeight: 0.1, soleHeight: 0.024 },
  };
  return g;
}

function frame(g, time, dt, speed, yaw = 0, extras = {}) {
  const previousYaw = g.rotation.y;
  g.rotation.y = yaw;
  const vx = Math.sin(yaw) * speed,
    vz = Math.cos(yaw) * speed;
  g.position.x += vx * dt;
  g.position.z += vz * dt;
  animateZombie(
    g,
    time,
    speed / ZOMBIE_MOTION_PROFILES[g.userData.type].speed,
    false,
    0,
    {
      dt,
      velocityX: vx,
      velocityZ: vz,
      targetYaw: yaw,
      turnRate:
        Math.atan2(Math.sin(yaw - previousYaw), Math.cos(yaw - previousYaw)) /
        dt,
      action: "none",
      isGrounded: true,
      ...extras,
    },
  );
  g.updateMatrixWorld(true);
}

test("visible walker leg speed stays bounded at 30/60 Hz with uneven remote travel", () => {
  for (const fps of [30, 60])
    for (const jitter of [false, true]) {
      const g = model("walker", 1, 0.627);
      let previous,
        maxAngularSpeed = 0;
      for (let i = 0; i < fps * 5; i++) {
        const speed = 1.35 * (jitter ? [0.85, 1.2, 0.95, 1.28][i % 4] : 1);
        frame(g, i / fps, 1 / fps, speed);
        const angle = g.userData.legs[0].root.rotation.x;
        if (previous !== undefined)
          maxAngularSpeed = Math.max(
            maxAngularSpeed,
            Math.abs(angle - previous) * fps,
          );
        previous = angle;
      }
      assert.ok(maxAngularSpeed > 0.1);
      assert.ok(
        maxAngularSpeed < 12,
        `${fps} Hz, jitter ${jitter}: ${maxAngularSpeed} rad/s`,
      );
    }
});

test("each species keeps its planted ankles fixed in world space at supported speeds", () => {
  const actual = new T.Vector3();
  for (const [type, profile] of Object.entries(ZOMBIE_MOTION_PROFILES)) {
    const scale =
      type === "archon"
        ? 1.9
        : type === "brute"
          ? 1.45
          : type === "runner"
            ? 0.88
            : 1;
    for (const multiplier of [0.5, 1, 1.8]) {
      const g = model(type, scale);
      const previous = [new T.Vector3(), new T.Vector3()];
      const wasPlanted = [false, false];
      let contacts = 0;
      for (let n = 0; n < 360; n++) {
        frame(g, n / 60, 1 / 60, profile.speed * multiplier);
        for (let i = 0; i < 2; i++) {
          const foot = g.userData.motionState.feet[i];
          g.userData.legs[i].foot.getWorldPosition(actual);
          if (foot.planted) {
            const error = actual.distanceTo(foot.anchor);
            assert.ok(
              error < 0.006 * scale,
              `${type} ${multiplier}: planted ankle misses anchor by ${error.toFixed(5)}m at ${n}`,
            );
            assert.ok(
              Math.abs(actual.y - 0.076 * scale) < 0.006 * scale,
              `${type}: ankle leaves ground during stance`,
            );
            if (wasPlanted[i]) {
              assert.ok(
                actual.distanceTo(previous[i]) < 0.006 * scale,
                `${type}: planted foot slides`,
              );
              contacts++;
            }
          }
          previous[i].copy(actual);
          wasPlanted[i] = foot.planted;
        }
      }
      assert.ok(contacts > 100, `${type}: insufficient grounded samples`);
    }
  }
});

test("stopping lands both feet, restarting moves without resetting the gait clock", () => {
  const g = model();
  for (let n = 0; n < 85; n++) frame(g, n / 60, 1 / 60, 1.35);
  const phaseBefore = g.userData.walkPhase;
  for (let n = 85; n < 125; n++) frame(g, n / 60, 1 / 60, 0);
  assert.equal(g.userData.walkPhase, phaseBefore);
  assert.ok(g.userData.motionState.feet.every((f) => f.planted));
  const footPositions = g.userData.legs.map((l) =>
    l.foot.getWorldPosition(new T.Vector3()),
  );
  for (let n = 125; n < 185; n++) frame(g, n / 60, 1 / 60, 0);
  for (let i = 0; i < 2; i++) {
    const actual = g.userData.legs[i].foot.getWorldPosition(new T.Vector3());
    assert.ok(
      actual.distanceTo(footPositions[i]) < 0.003,
      "idle breathing must not move the supported feet",
    );
  }
  frame(g, 185 / 60, 1 / 60, 0.4);
  assert.notEqual(g.userData.walkPhase, phaseBefore);
  for (let n = 186; n < 270; n++) {
    frame(g, n / 60, 1 / 60, 1.35);
    assert.ok(g.userData.motionState.feet.some((f) => f.planted));
    for (let i = 0; i < 2; i++) {
      const foot = g.userData.motionState.feet[i];
      if (!foot.planted) continue;
      const actual = g.userData.legs[i].foot.getWorldPosition(new T.Vector3());
      assert.ok(
        actual.distanceTo(foot.anchor) < 0.006,
        "restart must preserve the support foot",
      );
    }
  }
});

test("walkers transfer support before lifting even on their first step and extreme variations", () => {
  const actual = new T.Vector3();
  for (const [type, profile] of Object.entries(ZOMBIE_MOTION_PROFILES)) {
    if (type === "runner") continue;
    for (const variation of [0, 0.2, 0.5, 0.7, 0.99]) {
      const g = model(type, 1, variation);
      for (let n = 0; n < 240; n++) {
        frame(g, n / 60, 1 / 60, n >= 80 && n < 120 ? 0 : profile.speed);
        assert.ok(
          g.userData.motionState.feet.some((f) => f.planted),
          `${type} variation ${variation}: both feet airborne at frame ${n}`,
        );
        for (let i = 0; i < 2; i++) {
          const foot = g.userData.motionState.feet[i];
          if (!foot.planted) continue;
          g.userData.legs[i].foot.getWorldPosition(actual);
          assert.ok(
            actual.distanceTo(foot.anchor) < 0.006,
            `${type} variation ${variation}: support slips at frame ${n}`,
          );
        }
      }
      assert.ok(
        g.userData.motionState.feet.every((f) => f.contactCount >= 2),
        `${type}: a queued step must eventually land`,
      );
    }
  }
});

test("emerging zombies carry the support frame upward and plant at the final ground height", () => {
  const ankle = new T.Vector3();
  for (const fps of [30, 60]) {
    for (const speed of [0, 1.35]) {
      const g = model();
      g.position.y = -0.19;
      for (let n = 0; n < fps * 2; n++) {
        if (n > 0) g.position.y = Math.min(0, g.position.y + 2.5 / fps);
        frame(g, n / fps, 1 / fps, speed, 0, { isGrounded: g.position.y >= 0 });
        for (let i = 0; i < 2; i++) {
          const foot = g.userData.motionState.feet[i];
          if (!foot.planted) continue;
          g.userData.legs[i].foot.getWorldPosition(ankle);
          assert.ok(
            Math.abs(ankle.y - (g.position.y + 0.076)) < 0.006,
            `emergence retained a stale underground anchor at frame ${n}`,
          );
          assert.ok(ankle.distanceTo(foot.anchor) < 0.006);
        }
      }
      assert.ok(
        g.userData.motionState.feet.every(
          (f) => Math.abs(f.anchor.y - 0.076) < 1e-8,
        ),
      );
    }
  }
});

test("cadence follows distance without a runner speed ceiling and accounts for scale", () => {
  const sample = (scale, speed) => {
    const g = model("runner", scale);
    for (let n = 0; n < 120; n++) frame(g, n / 60, 1 / 60, speed);
    return g.userData.motionState;
  };
  const normal = sample(1, 3.15),
    fast = sample(1, 6.3),
    large = sample(2, 3.15);
  assert.ok(Math.abs(fast.cadence / normal.cadence - 2) < 0.01);
  assert.ok(Math.abs(large.cadence / normal.cadence - 0.5) < 0.01);
});

test("30Hz and 60Hz retain matching gait phase and foot contact timing", () => {
  const sample = (fps) => {
    const g = model("walker", 1, 0.2);
    frame(g, 0, 1 / fps, 0);
    for (let n = 1; n <= fps * 6; n++) frame(g, n / fps, 1 / fps, 1.35);
    return g;
  };
  const a = sample(30),
    b = sample(60);
  assert.ok(Math.abs(a.userData.walkPhase - b.userData.walkPhase) < 1e-9);
  for (let i = 0; i < 2; i++) {
    assert.ok(
      Math.abs(
        a.userData.motionState.feet[i].contactCount -
          b.userData.motionState.feet[i].contactCount,
      ) <= 1,
    );
    const pa = a.userData.legs[i].foot.getWorldPosition(new T.Vector3());
    const pb = b.userData.legs[i].foot.getWorldPosition(new T.Vector3());
    assert.ok(
      pa.distanceTo(pb) < 0.12,
      `render cadence shifts foot too far: ${pa.distanceTo(pb)}`,
    );
  }
});

test("turns, interruptions, teleport corrections, and long sessions remain finite", () => {
  const g = model("spitter", 1.05, 0.78);
  for (let n = 0; n < 800; n++) {
    if (n === 400) g.position.set(50, 0, -35);
    const speed = n % 90 < 20 ? 0 : 1.45;
    frame(g, 21600 + n / 60, 1 / 60, speed, n / 150, {
      action: n % 120 > 60 ? "spit" : "none",
      actionPhase: (n % 120) / 120,
      actionContact: 0.55,
    });
    g.traverse((o) => {
      for (const value of [...o.position, ...o.quaternion])
        assert.ok(Number.isFinite(value));
    });
    for (const foot of g.userData.motionState.feet)
      assert.ok(Number.isFinite(foot.reachError));
  }
});

test("archon has a distinct gait, and directional reactions recover", () => {
  const archon = model("archon"),
    brute = model("brute");
  for (let n = 0; n < 120; n++) {
    frame(archon, n / 60, 1 / 60, 1);
    frame(brute, n / 60, 1 / 60, 1);
  }
  assert.notEqual(
    archon.userData.motionState.cadence,
    brute.userData.motionState.cadence,
  );
  assert.notEqual(
    archon.userData.torso.rotation.x,
    brute.userData.torso.rotation.x,
  );
  const left = model(),
    right = model();
  left.userData.hitReaction = { serial: 1, side: -1, head: true, strength: 1 };
  right.userData.hitReaction = { serial: 1, side: 1, head: true, strength: 1 };
  for (let n = 0; n < 8; n++) {
    frame(left, n / 60, 1 / 60, 0);
    frame(right, n / 60, 1 / 60, 0);
  }
  assert.ok(left.userData.head.rotation.y < -0.05);
  assert.ok(right.userData.head.rotation.y > 0.05);
  for (let n = 8; n < 120; n++) frame(left, n / 60, 1 / 60, 0);
  assert.ok(Math.abs(left.userData.head.rotation.y) < 0.002);
});

test("far detail preserves exact gait and contacts while close hands resume animation", () => {
  const near = model(),
    far = model();
  near.userData.detail = "full";
  far.userData.detail = "far";
  let farCurl;
  for (let n = 0; n < 120; n++) {
    frame(near, n / 60, 1 / 60, 1.35);
    frame(far, n / 60, 1 / 60, 1.35);
    if (n === 0) farCurl = far.userData.fingers[0][0].root.rotation.x;
    assert.equal(far.userData.fingers[0][0].root.rotation.x, farCurl);
    assert.equal(near.userData.walkPhase, far.userData.walkPhase);
    for (let i = 0; i < 2; i++) {
      const a = near.userData.motionState.feet[i],
        b = far.userData.motionState.feet[i];
      assert.equal(a.planted, b.planted);
      assert.equal(a.position.distanceTo(b.position), 0);
      assert.ok(
        near.userData.legs[i].foot.quaternion.equals(
          far.userData.legs[i].foot.quaternion,
        ),
      );
    }
  }
  far.userData.detail = "lite";
  for (let n = 120; n < 130; n++)
    frame(far, n / 60, 1 / 60, 1.35, 0, { action: "melee", actionPhase: 0.38 });
  assert.ok(
    Math.abs(far.userData.fingers[0][0].root.rotation.x - farCurl) > 0.05,
  );
});
