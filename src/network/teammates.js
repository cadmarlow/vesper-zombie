import * as T from "three";
import {
  survivorModel,
  survivorWeapon,
  animateSurvivor,
  TEAM_COLORS,
  releaseSurvivor,
} from "../survivor.js";
import { setSurfaceQuality } from "../surfaces.js";
import { PLAYER_FLAGS as FLAGS } from "../../server/protocol.js";
function nameSprite() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(
    new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(1.25, 0.47, 1);
  sprite.position.y = 2.15;
  sprite.renderOrder = 5;
  sprite.userData.canvas = c;
  return sprite;
}
function updateLabel(p, rescue) {
  const down = !!(p.flags & FLAGS.DOWN),
    dead = !!(p.flags & FLAGS.DEAD);
  const status = dead
    ? "ÉLIMINÉ"
    : down
      ? `À TERRE · ${Math.ceil(rescue?.remaining ?? 45)} S`
      : "";
  const key = `${p.name}:${status}`;
  p.label.position.y = down ? 0.8 : p.flags & FLAGS.CROUCH ? 1.78 : 2.05;
  if (p.label.userData.key === key) return;
  p.label.userData.key = key;
  const ctx = p.label.userData.canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 96);
  ctx.fillStyle = "#081216d9";
  ctx.fillRect(0, 6, 256, status ? 84 : 50);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 27px sans-serif";
  ctx.fillStyle = down ? "#ff987b" : "#e8e7d9";
  ctx.fillText(p.name.toUpperCase(), 128, 32, 238);
  if (status) {
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(status, 128, 69, 238);
  }
  p.label.material.map.needsUpdate = true;
}
export class TeammateView {
  constructor(context, roster, players) {
    Object.assign(this, { context, roster, players });
  }
  ensurePlayerModel(p) {
    if (p.model || !this.context?.run.world) return;
    const seat = [...this.roster.keys()].indexOf(p.id);
    const model = survivorModel(
      TEAM_COLORS[Math.max(0, seat) % TEAM_COLORS.length],
    );
    setSurfaceQuality(model, this.context.run.settings.quality);
    model.position.set(p.tx, 0, p.tz);
    p.label = nameSprite();
    model.add(p.label);
    this.context.view.scene.add(model);
    p.model = model;
  }
  removePlayerModel(p) {
    if (!p.model) return;
    this.context.view.scene.remove(p.model);
    releaseSurvivor(p.model);
    p.model = p.gun = p.label = null;
  }
  updateRemotePlayers(dt) {
    const g = this.context;
    for (const p of this.players.values()) {
      this.ensurePlayerModel(p);
      if (!p.model) continue;
      const m = p.model;
      const before = m.position.x,
        beforeZ = m.position.z;
      m.position.x = T.MathUtils.damp(m.position.x, p.tx, 14, dt);
      m.position.z = T.MathUtils.damp(m.position.z, p.tz, 14, dt);
      m.position.y = T.MathUtils.damp(
        m.position.y,
        Math.max(0, p.ty - 1.7),
        14,
        dt,
      );
      // Character faces +Z; the first-person camera looks down -Z.
      let delta = p.tyaw + Math.PI - m.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      m.rotation.y += delta * Math.min(1, dt * 14);
      const moved = Math.hypot(m.position.x - before, m.position.z - beforeZ);
      p.speed = T.MathUtils.damp(p.speed, dt > 0 ? moved / dt : 0, 8, dt);
      const down = p.flags & FLAGS.DOWN;
      m.visible = true;
      updateLabel(p, g.run.session?.rescue?.status(p.id));
      const crouch = !!(p.flags & FLAGS.CROUCH);
      const gun = (p.gun = survivorWeapon(m, p.weapon, p.level > 0));
      animateSurvivor(m, g.run.time + p.seed, p.speed / 3.65, {
        crouch,
        pitch: p.pitch,
        firing: !!(p.flags & FLAGS.FIRING),
        down: !!down,
        reviving: !!(p.flags & FLAGS.REVIVING),
      });
      if (gun)
        gun.userData.flash.visible =
          !!(p.flags & FLAGS.FIRING) && Math.random() < 0.5;
    }
  }
}
