import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { ENEMIES } from "../src/content/enemies.js";
import { prepareCreatureSkins } from "../src/creature-head.js";
import {
  zombieModel,
  setZombieDetail,
  destroyZombieHead,
  animateZombie,
} from "../src/creatures.js";
import { animateDeath } from "../src/game/enemy-presentation.js";

const meshes = (model) => model.children.filter((child) => child.isSkinnedMesh);

function affectedVertex(model, boneName) {
  let selected;
  let largest = 0;
  const origin = model
    .getObjectByName(boneName)
    .getWorldPosition(new T.Vector3());
  for (const mesh of meshes(model)) {
    const boneIndex = mesh.skeleton.bones.findIndex(
      (bone) => bone.name === boneName,
    );
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    for (let vertex = 0; vertex < position.count; vertex++) {
      let influence = 0;
      for (let slot = 0; slot < 4; slot++)
        if (skinIndex.array[vertex * 4 + slot] === boneIndex)
          influence += skinWeight.array[vertex * 4 + slot];
      if (influence < 0.7) continue;
      const point = mesh.getVertexPosition(vertex, new T.Vector3());
      const distance = mesh
        .localToWorld(point.clone())
        .distanceToSquared(origin);
      if (distance * influence > largest) {
        largest = distance * influence;
        selected = { mesh, vertex, point };
      }
    }
  }
  assert.ok(selected, `${boneName} must influence actual vertices`);
  return selected;
}

function posedHeightBounds(model) {
  model.updateMatrixWorld(true);
  const point = new T.Vector3();
  let lowest = Infinity;
  let highest = -Infinity;
  for (const mesh of meshes(model))
    for (
      let vertex = 0;
      vertex < mesh.geometry.attributes.position.count;
      vertex++
    ) {
      mesh.getVertexPosition(vertex, point);
      mesh.localToWorld(point);
      lowest = Math.min(lowest, point.y);
      highest = Math.max(highest, point.y);
    }
  return { lowest, highest };
}

test("zombie rigs preserve skinning, articulated hands and shared LOD geometry", async (t) => {
  // Only image loading is stubbed. These are the real generated geometries,
  // bones, bind matrices and Three.js CPU skinning calculations.
  t.mock.method(
    T.TextureLoader.prototype,
    "loadAsync",
    async () => new T.Texture(),
  );
  await prepareCreatureSkins(false);

  await t.test(
    "all species and LODs have normalized weights on the same rig",
    () => {
      for (const type of Object.keys(ENEMIES)) {
        let expectedNames;
        for (const detail of ["full", "lite", "far"]) {
          const model = zombieModel(type, detail, 71);
          model.updateMatrixWorld(true);
          const parts = meshes(model);
          const skeleton = parts[0].skeleton;
          const names = skeleton.bones.map((bone) => bone.name);
          assert.equal(names.length, 42);
          if (expectedNames) assert.deepEqual(names, expectedNames);
          else expectedNames = names;
          const influenced = new Set();
          for (const mesh of parts) {
            assert.equal(mesh.skeleton, skeleton);
            const { position, skinIndex, skinWeight } =
              mesh.geometry.attributes;
            for (let vertex = 0; vertex < position.count; vertex++) {
              let sum = 0;
              for (let slot = 0; slot < 4; slot++) {
                const weight = skinWeight.array[vertex * 4 + slot];
                const index = skinIndex.array[vertex * 4 + slot];
                assert.ok(
                  Number.isFinite(weight) && weight >= 0 && weight <= 1,
                );
                assert.ok(index < names.length);
                sum += weight;
                if (weight > 0) influenced.add(names[index]);
              }
              assert.ok(Math.abs(sum - 1) < 1e-6);
            }
            // A bind pose must reproduce the authored mesh, without an offset
            // caused by an incorrectly positioned new pivot or inverse matrix.
            for (let vertex = 0; vertex < position.count; vertex += 31) {
              const authored = new T.Vector3().fromBufferAttribute(
                position,
                vertex,
              );
              const posed = mesh.getVertexPosition(vertex, new T.Vector3());
              assert.ok(
                authored.distanceTo(posed) < 1e-5,
                `${type}/${detail} bind pose`,
              );
            }
          }
          for (const bone of skeleton.bones) {
            assert.equal(bone.userData.restPosition.length, 3);
            assert.equal(bone.userData.restQuaternion.length, 4);
            if (/^(shoulder|toe|finger|thumb)/.test(bone.name))
              assert.ok(
                influenced.has(bone.name),
                `${type}/${detail}/${bone.name}`,
              );
          }
        }
      }
    },
  );

  await t.test(
    "clavicles, toes and both finger joints deform real mesh vertices",
    () => {
      for (const boneName of [
        "shoulder0",
        "shoulder1",
        "toe0",
        "toe1",
        "finger0_0",
        "fingerTip0_0",
        "finger1_3",
        "fingerTip1_3",
        "thumb0",
        "thumbTip0",
        "thumb1",
        "thumbTip1",
      ]) {
        const model = zombieModel("walker", "full", "skinning-check");
        const untouched = zombieModel("walker", "full", "skinning-check");
        model.updateMatrixWorld(true);
        untouched.updateMatrixWorld(true);
        const sample = affectedVertex(model, boneName);
        const counterpart = meshes(untouched).find(
          (mesh) => mesh.name === sample.mesh.name,
        );
        assert.equal(sample.mesh.geometry, counterpart.geometry);
        const originalOther = counterpart.getVertexPosition(
          sample.vertex,
          new T.Vector3(),
        );
        model.getObjectByName(boneName).rotation.x = 0.55;
        model.updateMatrixWorld(true);
        const changed = sample.mesh.getVertexPosition(
          sample.vertex,
          new T.Vector3(),
        );
        assert.ok(
          changed.distanceTo(sample.point) > 0.004,
          `${boneName} visibly deforms`,
        );
        assert.ok(
          counterpart
            .getVertexPosition(sample.vertex, new T.Vector3())
            .distanceTo(originalOther) < 1e-8,
        );
      }
      const model = zombieModel("walker", "lite", 0);
      model.updateMatrixWorld(true);
      for (const hand of model.userData.fingers) {
        for (const finger of hand) {
          const before = finger.tip.getWorldPosition(new T.Vector3());
          finger.root.rotation.x = 0.6;
          model.updateMatrixWorld(true);
          const after = finger.tip.getWorldPosition(new T.Vector3());
          assert.ok(
            after.z < before.z,
            "curl bends toward the palm on either hand",
          );
        }
      }
    },
  );

  await t.test(
    "seeded identity and articulated pose survive detail changes independently",
    () => {
      for (const seed of [0, 71, "coop-enemy-71"]) {
        const model = zombieModel("walker", "full", seed);
        const clone = zombieModel("walker", "full", seed);
        const other = zombieModel("walker", "full", `${seed}-different`);
        assert.equal(model.userData.variation, clone.userData.variation);
        assert.notEqual(model.userData.variation, other.userData.variation);
        assert.deepEqual(model.scale.toArray(), clone.scale.toArray());
        assert.notEqual(
          model.userData.fingers[0][0].root,
          clone.userData.fingers[0][0].root,
        );
        model.userData.fingers[0][0].root.rotation.x = 0.6;
        model.userData.legs[0].toe.rotation.x = -0.2;
        assert.ok(destroyZombieHead(model, new T.Vector3()));
        for (const detail of ["far", "lite", "full"]) {
          setZombieDetail(model, detail);
          assert.equal(model.userData.detail, detail);
          assert.equal(model.userData.fingers[0][0].root.rotation.x, 0.6);
          assert.equal(model.userData.legs[0].toe.rotation.x, -0.2);
          assert.equal(model.userData.head.scale.x, 0.0001);
        }
        assert.equal(Math.abs(clone.userData.fingers[0][0].root.rotation.x), 0);
        assert.equal(Math.abs(clone.userData.legs[0].toe.rotation.x), 0);
        assert.equal(clone.userData.head.scale.x, 1);
        for (const mesh of meshes(model)) {
          const counterpart = meshes(clone).find(
            (part) => part.name === mesh.name,
          );
          assert.equal(mesh.geometry, counterpart.geometry);
          assert.notEqual(mesh.skeleton, counterpart.skeleton);
        }
      }
    },
  );

  await t.test(
    "collapsing bodies keep boots and dorsal anatomy above the floor before sinking",
    () => {
      const sampledFrames = new Set([6, 18, 30, 42, 60]);
      for (const type of Object.keys(ENEMIES))
        for (const offset of [0, 21, 42]) {
          const model = zombieModel(type, "far", 71);
          // Start from several settled gait poses, including a raised foot,
          // rather than only checking a neutral standing skeleton.
          for (let frame = 0; frame < 120 + offset; frame++)
            animateZombie(model, frame / 60, 1);
          const enemy = {
            model,
            deathTime: 2.4,
            fallSide: offset === 21 ? -1 : 1,
          };
          for (let frame = 1; frame <= 60; frame++) {
            animateDeath(enemy, 1 / 60);
            if (!sampledFrames.has(frame)) continue;
            const { lowest } = posedHeightBounds(model);
            assert.ok(
              lowest >= -0.012 * model.scale.y,
              `${type}, gait offset ${offset}, death ${frame / 60}s: geometry crossed ground at ${lowest}`,
            );
          }
          // Large enemies must also finish sinking before their instance is
          // removed; a fixed world-space sink previously left the boss visible.
          for (let frame = 60; frame < 144; frame++)
            animateDeath(enemy, 1 / 60);
          const { highest } = posedHeightBounds(model);
          assert.ok(
            highest < 0,
            `${type}: corpse still visible at removal (${highest})`,
          );
        }
    },
  );
});
