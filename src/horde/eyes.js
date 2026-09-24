import * as T from "three";
import { HORDE_EYES } from "../content/horde.js";
import { ENEMIES } from "../content/enemies.js";

// Glowing eyes, readable across a dark map: one additive, bloom-friendly
// billboard per eye, drawn for the whole horde in a single instanced call.
// Positions follow the animated head bone every frame. Fast movers drag a
// light streak behind each eye, stretched along their motion on screen.

const MAX = 128;
let glowTexture;
function texture() {
  if (glowTexture) return glowTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  const g = c.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  glowTexture = new T.CanvasTexture(canvas);
  glowTexture.userData.sharedSurface = true;
  return glowTexture;
}

const TRAIL_TIME = 0.09; // seconds of motion a streak spans
const position = new T.Vector3(),
  previous = new T.Vector3(),
  motion = new T.Vector3(),
  side = new T.Vector3(),
  up = new T.Vector3(),
  viewDir = new T.Vector3(),
  basis = new T.Matrix4(),
  matrix = new T.Matrix4(),
  quaternion = new T.Quaternion(),
  scale = new T.Vector3(),
  color = new T.Color(),
  toCamera = new T.Vector3(),
  forward = new T.Vector3();

export class HordeEyes {
  constructor(scene, mobile = false) {
    this.scene = scene;
    const material = new T.MeshBasicMaterial({
      map: texture(),
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), material, MAX);
    this.mesh.instanceColor = new T.InstancedBufferAttribute(
      new Float32Array(MAX * 3),
      3,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.count = 0;
    this.mobile = mobile;
    this.last = new Map(); // enemy -> last eye positions
    this.lastTime = null;
    scene.add(this.mesh);
  }
  update(enemies, camera, time = 0) {
    let n = 0;
    quaternion.copy(camera.quaternion);
    const dt =
      this.lastTime === null
        ? 0
        : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    camera.getWorldDirection(viewDir);
    const seen = new Set();
    for (const e of enemies) {
      if (n >= MAX - 1) break;
      const model = e.model;
      const horde = model.userData.horde;
      if (!horde || !model.visible || model.userData.headDestroyed) continue;
      if (e.dead && (e.deathTime ?? 0) < (e.eyesOutAt ?? 0)) continue;
      const head = horde.bones.head;
      const eyes = horde.pack.eyes;
      if (!head || !eyes) continue;
      model.updateWorldMatrix(true, false);
      // Dying eyes fade out over the first second of the fall.
      const fade = e.dead ? Math.max(0, 1 - (e.deathAge ?? 0) / 1.1) : 1;
      if (fade <= 0) continue;
      const rgb = HORDE_EYES[e.type] || HORDE_EYES.walker;
      const flicker = 0.85 + 0.15 * Math.sin(time * 9 + e.id * 1.7);
      const boss = ENEMIES[e.type]?.boss;
      const size =
        (boss ? 0.075 : 0.05) * model.scale.y * (this.mobile ? 1.25 : 1);
      head.updateWorldMatrix(true, false);
      seen.add(e);
      const last = this.last.get(e) || [];
      this.last.set(e, last);
      for (let k = 0; k < eyes.length; k++) {
        const local = eyes[k];
        position.copy(local).applyMatrix4(head.matrixWorld);
        const before = last[k];
        if (before) previous.copy(before);
        else previous.copy(position);
        (last[k] ||= new T.Vector3()).copy(position);
        // Only eyes facing the camera glow: no halo through the back of the skull.
        toCamera.subVectors(camera.position, position).normalize();
        forward.set(0, 0, 1).applyQuaternion(model.quaternion);
        const facing = T.MathUtils.smoothstep(
          forward.dot(toCamera),
          -0.1,
          0.35,
        );
        if (facing <= 0) continue;
        const intensity = (boss ? 5 : 3.4) * fade * facing * flicker;
        scale.setScalar(size);
        matrix.compose(position, quaternion, scale);
        this.mesh.setMatrixAt(n, matrix);
        color.setRGB(
          rgb[0] * intensity,
          rgb[1] * intensity,
          rgb[2] * intensity,
        );
        this.mesh.setColorAt(n, color);
        n++;
        // Streak: from the eye back along its screen-space motion.
        if (!this.mobile && dt > 0 && n < MAX - 1) {
          motion.subVectors(position, previous);
          motion.addScaledVector(viewDir, -motion.dot(viewDir));
          const speed = motion.length() / dt;
          if (speed > 2.2) {
            const length = Math.min(0.55, speed * TRAIL_TIME);
            side.copy(motion).normalize();
            up.crossVectors(viewDir, side).normalize();
            basis.makeBasis(
              side.multiplyScalar(length),
              up.multiplyScalar(size * 0.55),
              viewDir,
            );
            basis.setPosition(
              position
                .clone()
                .addScaledVector(motion.normalize(), -length * 0.5),
            );
            this.mesh.setMatrixAt(n, basis);
            const fade = Math.min(1, (speed - 2.2) / 2.5) * 0.45;
            color.setRGB(
              rgb[0] * intensity * fade,
              rgb[1] * intensity * fade,
              rgb[2] * intensity * fade,
            );
            this.mesh.setColorAt(n, color);
            n++;
          }
        }
      }
    }
    for (const e of this.last.keys()) if (!seen.has(e)) this.last.delete(e);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
