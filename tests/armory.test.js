import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { WEAPONS } from "../src/content/weapons.js";
import { RIGS } from "../src/armory/catalog.js";
import { POSES } from "../src/armory/viewmodel.js";
import { WeaponAudio } from "../src/armory/audio.js";
import {
  blendPose,
  crossedEvents,
  sampleHand,
  sampleState,
  sampleTrack,
} from "../src/armory/timeline.js";
import { Spring3 } from "../src/armory/springs.js";

const publicFile = (path) => new URL(`../public/${path}`, import.meta.url);
const manifest = JSON.parse(
  fs.readFileSync(publicFile("models/armory/manifest.json"), "utf8"),
);
const bank = JSON.parse(
  fs.readFileSync(publicFile("audio/armory/manifest.json"), "utf8"),
);
const looks = [
  ...new Set(Object.entries(WEAPONS).map(([id, w]) => w.look || id)),
];
const energy = (look) =>
  Object.entries(WEAPONS).some(
    ([id, w]) => (w.look || id) === look && w.energy,
  );

// Parts (extras.part) and sockets (socket_*) of each built model.
const models = new Map();
async function model(id) {
  if (models.has(id)) return models.get(id);
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(
    fileURLToPath(publicFile(`models/armory/${id}.glb`)),
  );
  const parts = new Set(),
    sockets = new Set();
  for (const node of doc.getRoot().listNodes()) {
    const part = node.getExtras().part;
    if (part) parts.add(part);
    if (node.getName().startsWith("socket_"))
      sockets.add(node.getName().slice(7));
  }
  const info = { parts, sockets };
  models.set(id, info);
  return info;
}

const finite3 = (v) =>
  Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const length = (v) => Math.hypot(...v);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** A hand frame needs a direction and a lateral axis that are not parallel. */
const properFrame = (key) =>
  (finite3(key.knuckle) || finite3(key.wrist)) &&
  finite3(key.forward) &&
  finite3(key.lateral) &&
  length(cross(key.forward, key.lateral)) >
    0.2 * length(key.forward) * length(key.lateral);

const VECTOR_TRACKS = ["weaponPosition", "weaponRotation"];
const SCALAR_TRACKS = [
  "action",
  "pump",
  "bolt",
  "bolt_handle",
  "bolt_handleTurn",
  "charging_handle",
  "charging_handleTurn",
];
const MAGAZINE_STATES = new Set(["in", "drop", "hand", "hidden"]);
// Cues whose sound is carried by the recording of a neighbouring cue.
const SILENT = new Set([
  "pumpforward",
  "shellgrab",
  "boltback",
  "boltforward",
  "boltdown",
]);

const ordered = (keys, time = (k) => k[0]) =>
  keys.every(
    (k, i) =>
      time(k) >= 0 && time(k) <= 1 && (i === 0 || time(k) >= time(keys[i - 1])),
  );

test("every weapon look has a rig and a built model within budget", () => {
  for (const look of looks) {
    assert.ok(RIGS[look], `${look}: rig`);
    const entry = manifest.weapons[look];
    assert.ok(entry, `${look}: listed in the manifest`);
    assert.ok(entry.triangles < 45000, `${look}: ${entry.triangles} triangles`);
    for (const file of [
      `${look}.glb`,
      `${look}-wear-1024.webp`,
      `${look}-wear-512.webp`,
    ])
      assert.ok(
        fs.existsSync(publicFile(`models/armory/${file}`)),
        `${look}: ${file}`,
      );
  }
});

test("rig poses and grips are finite, proper hand frames", () => {
  for (const [id, rig] of Object.entries(RIGS)) {
    for (const pose of ["hip", "sprint"]) {
      assert.ok(finite3(rig[pose].position), `${id} ${pose} position`);
      assert.ok(finite3(rig[pose].rotation), `${id} ${pose} rotation`);
    }
    for (const side of ["right", "left"]) {
      const grip = rig.grips[side];
      assert.ok(properFrame(grip), `${id} ${side} grip frame`);
      assert.ok(finite3(grip.pole), `${id} ${side} grip pole`);
      for (const finger of ["index", "middle", "ring", "pinky"])
        assert.equal(grip.pose[finger].length, 3, `${id} ${side} ${finger}`);
      assert.equal(grip.pose.thumb.length, 4, `${id} ${side} thumb`);
      assert.ok(finite3(rig.shoulders?.[side] ?? [0, 0, 0]), `${id} shoulder`);
    }
    assert.ok(rig.relief > 0 && rig.relief < 0.5, `${id} eye relief`);
  }
});

test("action tracks are normalized, ordered and finite", async () => {
  for (const [id, rig] of Object.entries(RIGS)) {
    const { parts } = await model(id);
    const spaces = new Set(["view", "weapon", ...parts]);
    for (const [name, def] of Object.entries(rig.actions)) {
      const where = `${id}.${name}`;
      for (const key of VECTOR_TRACKS) {
        if (!def[key]) continue;
        assert.ok(ordered(def[key]), `${where} ${key} order`);
        assert.ok(
          def[key].every(([, v]) => finite3(v)),
          `${where} ${key} values`,
        );
      }
      for (const [side, track] of Object.entries(def.shoulders || {})) {
        assert.ok(ordered(track), `${where} ${side} shoulder order`);
        assert.ok(
          track.every(([, v]) => finite3(v)),
          `${where} ${side} shoulder`,
        );
      }
      for (const key of SCALAR_TRACKS) {
        if (!def[key]) continue;
        assert.ok(ordered(def[key]), `${where} ${key} order`);
        assert.ok(
          def[key].every(([, v]) => Number.isFinite(v)),
          `${where} ${key} values`,
        );
        const part = key.replace(/Turn$/, "");
        if (part !== "action")
          assert.ok(parts.has(part), `${where}: ${part} is a model part`);
      }
      for (const side of ["left", "right"]) {
        const track = def[side];
        if (!track) continue;
        assert.ok(
          ordered(track, (k) => k.t),
          `${where} ${side} hand order`,
        );
        for (const key of track) {
          if (key.grip === "rest") continue;
          assert.ok(properFrame(key), `${where} ${side} key ${key.t} frame`);
          assert.ok(
            spaces.has(key.space || "weapon"),
            `${where} ${side} key ${key.t}: space ${key.space}`,
          );
          if (typeof key.pose === "string")
            assert.ok(
              POSES[key.pose] || rig.poses?.[key.pose],
              `${where} ${side} key ${key.t}: pose ${key.pose}`,
            );
        }
      }
      if (def.mag) {
        assert.ok(parts.has("magazine"), `${where}: magazine part`);
        assert.ok(ordered(def.mag), `${where} magazine order`);
        for (const [, state] of def.mag)
          assert.ok(MAGAZINE_STATES.has(state), `${where}: ${state}`);
        if (def.mag.some(([, state]) => state === "hand"))
          assert.ok(properFrame(def.seat), `${where}: seat frame`);
      }
      assert.ok(ordered(def.events || []), `${where} event order`);
    }
    // Parts the firing cycle and the idle animation drive.
    if (rig.action?.part)
      assert.ok(parts.has(rig.action.part), `${id}: ${rig.action.part}`);
    for (const part of Object.keys(rig.parts || {}))
      assert.ok(parts.has(part), `${id}: ${part}`);
    for (const part of Object.keys(rig.spin || {}))
      assert.ok(parts.has(part), `${id}: spinning ${part}`);
  }
});

test("models carry the sockets the rigs aim, flash and eject from", async () => {
  for (const [id, rig] of Object.entries(RIGS)) {
    const { sockets } = await model(id);
    for (const socket of [
      rig.muzzle || "muzzle",
      rig.sight?.rear || "sight_rear",
      rig.sight?.front || "sight_front",
    ])
      assert.ok(sockets.has(socket), `${id}: socket_${socket}`);
    if (!energy(id))
      assert.ok(sockets.has(rig.eject || "eject"), `${id}: ejection port`);
  }
});

test("every action cue plays a recorded sound or is carried by one", () => {
  const categories = new Set(
    Object.entries(bank.categories)
      .filter(([, files]) => files.length)
      .map(([name]) => name),
  );
  for (const id of looks) assert.ok(categories.has(`shot_${id}`), id);
  const audio = new WeaponAudio({ ctx: null, master: null });
  const played = [];
  audio.pick = (category) => (played.push(category), null);
  audio.casing = () => played.push("brass");
  for (const [id, rig] of Object.entries(RIGS))
    for (const [name, def] of Object.entries(rig.actions))
      for (const [, cue] of def.events || []) {
        played.length = 0;
        const handled = audio.cue(cue, id);
        if (SILENT.has(cue)) continue;
        assert.ok(handled, `${id}.${name}: cue ${cue}`);
        for (const category of played)
          assert.ok(categories.has(category), `${id}: ${cue} → ${category}`);
      }
});

test("tracks ease between keys and hold outside them", () => {
  const track = [
    [0.2, [0, 0, 0]],
    [0.6, [1, 2, -1]],
  ];
  assert.deepEqual(sampleTrack(track, 0).toArray(), [0, 0, 0]);
  assert.deepEqual(sampleTrack(track, 1).toArray(), [1, 2, -1]);
  const mid = sampleTrack(track, 0.4).toArray();
  assert.ok(Math.abs(mid[0] - 0.5) < 1e-9 && Math.abs(mid[1] - 1) < 1e-9);
  // Eased: a quarter of the span is well below a quarter of the value.
  assert.ok(sampleTrack(track, 0.3).x < 0.2);
  assert.equal(
    sampleTrack(
      [
        [0, 0],
        [1, 4],
      ],
      0.5,
    ),
    2,
  );
  assert.equal(
    sampleState(
      [
        [0, "in"],
        [0.1, "drop"],
        [0.4, "hand"],
      ],
      0.25,
    ),
    "drop",
  );
  assert.deepEqual(
    crossedEvents(
      [
        [0.1, "a"],
        [0.5, "b"],
      ],
      0.1,
      0.5,
    ),
    ["b"],
  );
  assert.deepEqual(
    crossedEvents(
      [
        [0.1, "a"],
        [0.5, "b"],
      ],
      0,
      0.1,
    ),
    ["a"],
  );
});

test("hand samples and finger blends reuse their outputs", () => {
  const track = [
    { t: 0, grip: "rest" },
    { t: 0.5, pose: "grab" },
    { t: 1, grip: "rest" },
  ];
  const out = {};
  const sample = sampleHand(track, 0.25, out);
  assert.equal(sample, out);
  assert.equal(sample.a, track[0]);
  assert.equal(sample.b, track[1]);
  assert.ok(Math.abs(sample.k - 0.5) < 1e-9);
  assert.equal(sampleHand(track, 2, out).a, track[2]);
  const pose = {};
  blendPose(POSES.open, POSES.fist, 0.5, pose);
  const index = pose.index;
  blendPose(POSES.open, POSES.fist, 1, pose);
  assert.equal(pose.index, index, "the finger arrays are reused");
  assert.ok(
    pose.index.every((v, j) => Math.abs(v - POSES.fist.index[j]) < 1e-9),
  );
  assert.equal(pose.thumb.length, 4);
});

test("springs settle at 30 and 144 images per second", () => {
  for (const fps of [30, 144]) {
    const spring = new Spring3(240, 19);
    spring.impulse(0, 0.1, 0.8);
    let peak = 0;
    for (let i = 0; i < fps * 2; i++) {
      spring.update(1 / fps);
      peak = Math.max(peak, spring.value.length());
    }
    assert.ok(peak > 0.005, `${fps}: the kick moves the weapon`);
    assert.ok(spring.value.length() < 1e-4, `${fps}: back at rest`);
  }
});
