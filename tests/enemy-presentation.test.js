import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { updateEnemyHitVolumes } from "../src/game/enemy-hitboxes.js";
import { animateDeath } from "../src/game/enemy-presentation.js";

function fixture() {
  const model = new T.Group();
  function bone(name, parent, y) {
    const node = new T.Bone();
    node.name = name;
    node.position.y = y;
    parent.add(node);
    model.userData[name] = node;
    return node;
  }
  const hips = bone("hips", model, 0.88),
    spine = bone("spine", hips, 0.19),
    torso = bone("torso", spine, 0.28),
    neck = bone("neck", torso, 0.22);
  bone("head", neck, 0.2);
  return model;
}

test("headshots follow a leaning, rotated and scaled zombie rather than its root", () => {
  const model = fixture();
  model.position.set(4, 0, -7);
  model.scale.set(1.3, 1.4, 1.3);
  model.rotation.y = 0.85;
  model.userData.hips.position.x = 0.1;
  model.userData.torso.rotation.x = 0.75;
  model.userData.neck.rotation.z = 0.2;
  const volumes = updateEnemyHitVolumes(model),
    head = volumes[0].sphere,
    expected = new T.Vector3(0, 0.035, 0.005).applyMatrix4(
      model.userData.head.matrixWorld,
    );
  assert.ok(head.center.distanceTo(expected) < 1e-10);
  assert.ok(head.center.distanceTo(new T.Vector3(4, 1.8 * 1.4, -7)) > 0.25);
  const origin = expected.clone().add(new T.Vector3(0, 0, 3));
  assert.ok(new T.Ray(origin, new T.Vector3(0, 0, -1)).intersectsSphere(head));
  assert.equal(head.radius, 0.21 * 1.4);
  const previous = head.center.clone();
  model.userData.torso.rotation.x = -0.3;
  assert.equal(updateEnemyHitVolumes(model), volumes);
  assert.ok(head.center.distanceTo(previous) > 0.3);
});

test("death keeps the struck pose continuous, articulates the pelvis and preserves head destruction", () => {
  const results = [];
  for (const fps of [30, 60]) {
    const model = fixture();
    model.userData.torso.rotation.x = 0.3;
    model.userData.head.scale.setScalar(0.0001);
    const enemy = { model, deathTime: 2.4, fallSide: -1 };
    animateDeath(enemy, 0);
    assert.ok(Math.abs(model.userData.torso.rotation.x - 0.3) < 1e-10);
    for (let i = 0; i < fps * 1.2; i++) animateDeath(enemy, 1 / fps);
    assert.ok(model.userData.hips.position.y < 0.3);
    assert.ok(model.userData.hips.rotation.x < -1.3);
    assert.equal(model.rotation.x, 0);
    assert.equal(model.userData.head.scale.x, 0.0001);
    assert.ok(
      model.position.y >= 0,
      "body must not sink before its removal fade",
    );
    results.push(model.userData.hips.quaternion.clone());
  }
  assert.ok(results[0].angleTo(results[1]) < 1e-7);
});
