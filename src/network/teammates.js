import * as T from "three";
import {
  survivorModel,
  survivorWeapon,
  animateSurvivor,
  TEAM_COLORS,
} from "../survivor.js";
import { setSurfaceQuality } from "../surfaces.js";
import { disposeModel } from "../resources.js";
const F_CROUCH = 1,
  F_FIRING = 4,
  F_DOWN = 8;
function nameSprite(name) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0b1316cc";
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = "#e8d9c4";
  ctx.fillText(name.toUpperCase(), 128, 32, 236);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(
    new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.y = 2.15;
  sprite.renderOrder = 5;
  return sprite;
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
    p.label = nameSprite(p.name);
    model.add(p.label);
    this.context.view.scene.add(model);
    p.model = model;
  }
  removePlayerModel(p) {
    if (!p.model) return;
    this.context.view.scene.remove(p.model);
    disposeModel(p.model);
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
      let delta = p.tyaw - m.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      m.rotation.y += delta * Math.min(1, dt * 14);
      const moved = Math.hypot(m.position.x - before, m.position.z - beforeZ);
      p.speed = T.MathUtils.damp(p.speed, dt > 0 ? moved / dt : 0, 8, dt);
      const down = p.flags & F_DOWN;
      m.visible = !down;
      const crouch = !!(p.flags & F_CROUCH);
      const gun = (p.gun = survivorWeapon(m, p.weapon, p.level > 0));
      animateSurvivor(m, g.run.time + p.seed, p.speed / 3.65, {
        crouch,
        pitch: p.pitch,
        firing: !!(p.flags & F_FIRING),
      });
      if (gun)
        gun.userData.flash.visible =
          !!(p.flags & F_FIRING) && Math.random() < 0.5;
    }
  }
}
