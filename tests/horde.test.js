import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { ENEMIES } from "../src/content/enemies.js";
import {
  HORDE_ANIMATIONS,
  HORDE_CAST,
  HORDE_MOTION,
  hordeGait,
  hordePackUrl,
} from "../src/content/horde.js";
import { prepareHordeMaterial, WOUNDS } from "../src/horde/material.js";
import { warpAttack } from "../src/horde/animator.js";
import {
  canCrawl,
  crawlSpeed,
  crippleAfterHit,
  maimAfterHit,
} from "../src/game/crawlers.js";
import { ARM_LEFT, ARM_RIGHT, LIMBS } from "../src/horde/dismember.js";
import { validSnapshot } from "../server/protocol.js";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const publicFile = (url) => new URL(`../public${url}`, import.meta.url);
const JOINTS = [
  "Pelvis",
  "Spine",
  "Spine1",
  "Spine2",
  "Neck",
  "Head",
  "MJaw",
  ...["L", "R"].flatMap((s) =>
    [
      "Clavicle",
      "UpperArm",
      "Forearm",
      "Hand",
      "Thigh",
      "Calf",
      "Foot",
      "Toe0",
    ].map((b) => `${s} ${b}`),
  ),
].map((n) => `Bip01 ${n}`);
const playable = Object.keys(ENEMIES).filter((t) => !ENEMIES[t].hidden);

test("every playable enemy type has horde bodies for desktop and mobile", () => {
  for (const type of playable) {
    const cast = HORDE_CAST[type] || HORDE_CAST[ENEMIES[type].look];
    assert.ok(cast?.length, `${type} has a cast`);
    for (const id of cast)
      for (const mobile of [false, true])
        assert.ok(
          fs.existsSync(publicFile(hordePackUrl(id, mobile))),
          `${hordePackUrl(id, mobile)} exists`,
        );
  }
});

test("horde packs keep the shared 23-joint rig, LODs, materials and landmarks", async () => {
  const ids = [...new Set(Object.values(HORDE_CAST).flat())];
  for (const id of ids)
    for (const mobile of [false, true]) {
      const doc = await io.read(publicFile(hordePackUrl(id, mobile)).pathname);
      const root = doc.getRoot();
      const skins = root.listSkins();
      assert.equal(skins.length, 1, `${id}: one skin`);
      assert.deepEqual(
        skins[0]
          .listJoints()
          .map((j) => j.getName())
          .sort(),
        [...JOINTS].sort(),
        `${id}: canonical joints`,
      );
      const levels = root
        .listNodes()
        .filter((n) => n.getExtras()?.vesperDetail)
        .map((n) => n.getExtras().vesperDetail)
        .sort();
      assert.deepEqual(
        levels,
        mobile ? ["far", "lite"] : ["far", "full", "lite"],
        `${id} LODs`,
      );
      const budget = { full: 11000, lite: 6000, far: 3200 };
      for (const node of root.listNodes().filter((n) => n.getMesh())) {
        const lod = node.getExtras().vesperDetail;
        let triangles = 0;
        for (const p of node.getMesh().listPrimitives())
          triangles += p.getIndices().getCount() / 3;
        assert.ok(
          triangles <= budget[lod],
          `${id} ${lod}: ${triangles} triangles`,
        );
        assert.equal(node.getSkin(), skins[0], `${id}: LODs share the skin`);
      }
      const zombie = root.listMaterials().find((m) => m.getName() === "zombie");
      assert.ok(zombie.getBaseColorTexture(), `${id}: colour atlas`);
      assert.ok(zombie.getNormalTexture(), `${id}: normal map`);
      assert.ok(zombie.getMetallicRoughnessTexture(), `${id}: surface mask`);
      const meta = root.getExtras().vesperHorde;
      assert.ok(meta.landmarks.eyeL && meta.landmarks.eyeR, `${id}: eyes`);
      assert.ok(
        meta.hipHeight > 0.75 && meta.hipHeight < 1.05,
        `${id}: hip height`,
      );
      assert.equal(meta.profile, mobile ? "mobile" : "desktop");
    }
});

test("the clip library covers every motion pool with usable metadata", async () => {
  const doc = await io.read(publicFile(HORDE_ANIMATIONS).pathname);
  const clips = new Map(
    doc
      .getRoot()
      .listAnimations()
      .map((a) => [a.getName(), a]),
  );
  for (const [type, pools] of Object.entries(HORDE_MOTION))
    for (const [group, entry] of Object.entries(pools))
      for (const [pool, names] of group === "crawl"
        ? Object.entries(entry).map(([k, v]) => [k, [v].flat()])
        : [[group, entry]])
        for (const name of names) {
          const clip = clips.get(name);
          assert.ok(clip, `${type}.${group}.${pool}: ${name} exists`);
          const extras = clip.getExtras();
          if (pool === "move") {
            assert.ok(extras.loop, `${name} loops`);
            assert.ok(extras.speed > 0.1, `${name} has a natural speed`);
          }
          if (pool === "attack")
            assert.ok(
              extras.contact > 0.1 && extras.contact < 0.9,
              `${name} contact`,
            );
          if (pool === "death") assert.ok(extras.death, `${name} is a death`);
        }
  for (const clip of clips.values()) {
    const targets = new Set(
      clip.listChannels().map((c) => c.getTargetNode().getName()),
    );
    for (const joint of JOINTS)
      assert.ok(targets.has(joint), `${clip.getName()} drives ${joint}`);
  }
});

test("each type finds a gait close to its navigation speed", async () => {
  const doc = await io.read(publicFile(HORDE_ANIMATIONS).pathname);
  const speed = new Map(
    doc
      .getRoot()
      .listAnimations()
      .map((a) => [a.getName(), a.getExtras().speed]),
  );
  for (const type of playable) {
    const pools = HORDE_MOTION[type];
    const scale = ENEMIES[type].scale;
    for (const wave of [1, 6, 15])
      for (let id = 1; id < 40; id++) {
        const expected =
          ENEMIES[type].speed *
          (1 + Math.min(wave, 20) * 0.022) *
          hordeGait(type, id, wave).factor;
        const ratios = pools.move.map((n) => expected / (speed.get(n) * scale));
        assert.ok(
          ratios.some((r) => r >= 0.72 && r <= 1.7),
          `${type} wave ${wave} id ${id}: ${expected.toFixed(2)} m/s has a matching gait`,
        );
      }
  }
});

test("gaits are deterministic per network id and speed up with the waves", () => {
  for (let id = 1; id < 200; id++)
    assert.deepEqual(hordeGait("walker", id, 4), hordeGait("walker", id, 4));
  const mean = (wave) => {
    let sum = 0;
    for (let id = 1; id <= 2000; id++)
      sum += hordeGait("walker", id, wave).factor;
    return sum / 2000;
  };
  assert.ok(mean(1) < mean(6) && mean(6) < mean(14), "later waves walk faster");
  assert.ok(mean(1) > 0.6 && mean(14) < 1.2);
});

test("the sound bank is complete, present and CC0", () => {
  const manifest = JSON.parse(
    fs.readFileSync(publicFile("/audio/horde/manifest.json")),
  );
  for (const category of [
    "moan",
    "growl",
    "scream",
    "pain",
    "death",
    "female",
    "step",
    "run",
    "fall",
    "flesh",
    "gore",
    "dirt",
    "whoosh",
    "vomit",
    "roar",
  ]) {
    const files = manifest.categories[category];
    assert.ok(files?.length, `${category} has sounds`);
    for (const f of files)
      assert.ok(fs.existsSync(publicFile(`/audio/horde/${f.file}`)), f.file);
  }
  assert.ok(manifest.beds.horde.length > 0, "horde ambience bed");
  assert.ok(manifest.credits.length > 20);
  for (const c of manifest.credits)
    assert.equal(c.license, "CC0 1.0", `${c.title} is CC0`);
});

test("attack playback lands the clip's contact frame on the gameplay contact", () => {
  const info = { contact: 0.42 };
  const duration = 1.1;
  assert.equal(warpAttack(0, 0.38, info, duration), 0);
  assert.ok(
    Math.abs(warpAttack(0.38, 0.38, info, duration) - 0.42 * duration) < 1e-9,
  );
  assert.ok(Math.abs(warpAttack(1, 0.38, info, duration) - duration) < 1e-9);
  let previous = -1;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const t = warpAttack(Math.min(1, p), 0.38, info, duration);
    assert.ok(t >= previous, "monotonic");
    previous = t;
  }
});

test("the zombie surface injects into the current three.js standard shader", () => {
  for (const mobile of [false, true]) {
    const material = new T.MeshStandardMaterial();
    prepareHordeMaterial(material, { mobile });
    material.userData.hordeUniforms = undefined;
    const shader = {
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
    material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /vHordeBind = position;/);
    assert.match(shader.fragmentShader, /hordeFresh/);
    assert.match(shader.fragmentShader, /hordeWounds\[i\]/);
    assert.match(shader.fragmentShader, /totalEmissiveRadiance \+= hordeEye/);
    assert.match(
      shader.fragmentShader,
      /roughnessFactor = mix\(roughnessFactor, 0\.28/,
    );
    assert.equal(shader.uniforms.hordeWounds.value.length, WOUNDS);
    assert.equal(!!shader.defines.HORDE_MOBILE, mobile);
    assert.notEqual(
      material.customProgramCacheKey(),
      new T.MeshStandardMaterial().customProgramCacheKey(),
    );
  }
});

function fakeZombie(type = "walker", health = 200) {
  const model = new T.Object3D();
  model.userData = { horde: { bones: {} }, legs: [] };
  return { id: 5, type, model, health, maxHealth: 300, dead: false };
}

test("explosions and crippling leg damage turn bodies into crawlers", () => {
  const random = Math.random;
  try {
    Math.random = () => 0.1;
    const near = fakeZombie();
    assert.ok(
      crippleAfterHit(near, 200, { explosive: true, distance: 1.5 }, null, 10),
    );
    assert.ok(near.crawler && near.model.userData.legsLost);
    assert.equal(crawlSpeed(near, 5, 10.5), 0, "no crawling while falling");
    assert.ok(crawlSpeed(near, 5, 12) > 0.3);
    assert.equal(canCrawl(near), false, "only once");
    const far = fakeZombie();
    assert.equal(
      crippleAfterHit(far, 60, { explosive: true, distance: 5.5 }, null, 10),
      false,
    );
    const brute = fakeZombie("brute");
    assert.ok(
      crippleAfterHit(brute, 200, { explosive: true, distance: 1 }, null, 10),
      "a brute cannot crawl but the blast takes an arm",
    );
    assert.ok(!brute.crawler);
    assert.ok(brute.model.userData.cuts & (ARM_LEFT | ARM_RIGHT));
    const legs = fakeZombie();
    assert.equal(crippleAfterHit(legs, 90, { leg: true }, null, 10), false);
    assert.equal(crippleAfterHit(legs, 90, { leg: false }, null, 10), false);
    assert.ok(crippleAfterHit(legs, 90, { leg: true }, null, 10), "180 of 300");
    const dying = fakeZombie("walker", 0);
    assert.equal(
      crippleAfterHit(dying, 500, { explosive: true, distance: 1 }, null, 10),
      false,
    );
    const rising = fakeZombie();
    rising.model.position.y = -0.6;
    assert.equal(canCrawl(rising), false, "not while climbing out");
  } finally {
    Math.random = random;
  }
});

test("the crawler list is optional on the wire and validated", () => {
  const base = {
    n: 1,
    wave: 1,
    phase: "wave",
    timer: 0,
    remaining: 0,
    power: 0,
    extraction: -1,
    paused: false,
    doors: [],
    box: null,
    e: [],
    p: [],
    k: [],
    j: [],
  };
  assert.equal(validSnapshot(base), true);
  assert.equal(validSnapshot({ ...base, c: [3, 9] }), true);
  assert.equal(validSnapshot({ ...base, c: [0] }), false);
  assert.equal(validSnapshot({ ...base, c: ["3"] }), false);
  assert.equal(validSnapshot({ ...base, c: new Array(129).fill(1) }), false);
});

test("arms tear off at the elbow or the shoulder, never from bosses", () => {
  const forearm = fakeZombie();
  assert.equal(
    maimAfterHit(forearm, 90, { arm: "L", lower: true }, null, 1),
    false,
  );
  assert.ok(
    maimAfterHit(forearm, 60, { arm: "L", lower: true }, null, 1),
    "150 of 300",
  );
  assert.equal(forearm.model.userData.cuts, LIMBS.forearmL.bit);
  assert.equal(
    maimAfterHit(forearm, 200, { arm: "L", lower: true }, null, 1),
    false,
    "nothing left below the elbow",
  );
  const shoulder = fakeZombie();
  assert.ok(maimAfterHit(shoulder, 140, { arm: "R", lower: false }, null, 1));
  assert.equal(shoulder.model.userData.cuts, LIMBS.armR.bit);
  const boss = fakeZombie("archon");
  assert.equal(maimAfterHit(boss, 1000, { arm: "L" }, null, 1), false);
  const dying = fakeZombie("walker", 0);
  assert.equal(maimAfterHit(dying, 1000, { arm: "L" }, null, 1), false);
  const random = Math.random;
  try {
    Math.random = () => 0.1;
    const jaw = fakeZombie();
    assert.equal(maimAfterHit(jaw, 40, {}, null, 1, true), false, "too weak");
    assert.ok(maimAfterHit(jaw, 90, {}, null, 1, true));
    assert.equal(jaw.model.userData.cuts, LIMBS.jaw.bit);
    assert.equal(maimAfterHit(jaw, 90, {}, null, 1, true), false, "only once");
  } finally {
    Math.random = random;
  }
});

test("torn limbs travel as an optional validated mask", () => {
  const base = {
    n: 1,
    wave: 1,
    phase: "wave",
    timer: 0,
    remaining: 0,
    power: 0,
    extraction: -1,
    paused: false,
    doors: [],
    box: null,
    e: [],
    p: [],
    k: [],
    j: [],
  };
  assert.equal(
    validSnapshot({ ...base, x: [[3, LIMBS.legs.bit | LIMBS.armR.bit]] }),
    true,
  );
  assert.equal(validSnapshot({ ...base, x: [[3, 64]] }), false);
  assert.equal(validSnapshot({ ...base, x: [[0, 1]] }), false);
  assert.equal(validSnapshot({ ...base, x: [[3]] }), false);
  assert.equal(validSnapshot({ ...base, lp: [[3, 12]] }), true);
  assert.equal(validSnapshot({ ...base, lp: [[3, -1]] }), false);
  assert.equal(validSnapshot({ ...base, lp: [[0, 2]] }), false);
});

test("fast eyes drag a streak on desktop, none on phones", async () => {
  const { HordeEyes } = await import("../src/horde/eyes.js");
  // The glow sprite is painted on a canvas once: a minimal stand-in.
  const hadDocument = "document" in globalThis;
  globalThis.document ??= {
    createElement: () => ({
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop() {} }),
        fillRect() {},
      }),
    }),
  };
  for (const mobile of [false, true]) {
    const scene = new T.Scene();
    const eyes = new HordeEyes(scene, mobile);
    const camera = new T.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 1.6, 5);
    camera.lookAt(0, 1.6, 0);
    camera.updateMatrixWorld(true);
    const model = new T.Group();
    const head = new T.Bone();
    head.position.set(0, 1.6, 0);
    model.add(head);
    model.userData = {
      type: "runner",
      horde: {
        bones: { head },
        pack: {
          eyes: [new T.Vector3(0.03, 0, 0.1), new T.Vector3(-0.03, 0, 0.1)],
        },
      },
    };
    scene.add(model);
    const enemy = { id: 3, type: "runner", model, dead: false };
    eyes.update([enemy], camera, 1);
    const still = eyes.mesh.count;
    model.position.x += 0.3; // 6 m/s across the view
    eyes.update([enemy], camera, 1.05);
    assert.equal(still, 2, "two eyes");
    assert.equal(
      eyes.mesh.count,
      mobile ? 2 : 4,
      mobile ? "no streak" : "streaks",
    );
    eyes.dispose();
  }
});
