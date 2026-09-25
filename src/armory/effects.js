import * as T from "three";

// View-model effects, drawn with the view-model camera: layered muzzle
// flashes (front star, side petals, core), brass leaving the real ejection
// port, and smoke wisps curling off the muzzle after a burst. Fixed pools;
// nothing is allocated per shot.

function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

let flashTextures = null;
function textures() {
  if (flashTextures) return flashTextures;
  // Front view of a muzzle blast: a hot core and 4-6 ragged prongs.
  const star = canvasTexture(128, (c, n) => {
    const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, "rgba(255,255,245,1)");
    g.addColorStop(0.12, "rgba(255,240,200,0.95)");
    g.addColorStop(0.3, "rgba(255,190,110,0.45)");
    g.addColorStop(1, "rgba(255,120,40,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random() * 0.4;
      const len = n * (0.34 + Math.random() * 0.14);
      c.save();
      c.translate(n / 2, n / 2);
      c.rotate(a);
      const pg = c.createLinearGradient(0, 0, len, 0);
      pg.addColorStop(0, "rgba(255,235,190,0.9)");
      pg.addColorStop(1, "rgba(255,140,50,0)");
      c.fillStyle = pg;
      c.beginPath();
      c.moveTo(0, -n * 0.035);
      c.quadraticCurveTo(len * 0.5, -n * 0.05, len, 0);
      c.quadraticCurveTo(len * 0.5, n * 0.05, 0, n * 0.035);
      c.fill();
      c.restore();
    }
  });
  // Side view: a tapering flame cone with licks, origin on the left edge.
  const petal = canvasTexture(128, (c, n) => {
    c.globalCompositeOperation = "lighter";
    for (let k = 0; k < 3; k++) {
      const w = n * (0.16 - k * 0.04);
      const len = n * (0.95 - k * 0.2);
      const g = c.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, `rgba(255,245,220,${0.9 - k * 0.2})`);
      g.addColorStop(0.35, `rgba(255,190,100,${0.6 - k * 0.15})`);
      g.addColorStop(1, "rgba(255,110,30,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, n / 2 - w * 0.3);
      c.bezierCurveTo(
        len * 0.3,
        n / 2 - w,
        len * 0.7,
        n / 2 - w * 0.5,
        len,
        n / 2,
      );
      c.bezierCurveTo(
        len * 0.7,
        n / 2 + w * 0.5,
        len * 0.3,
        n / 2 + w,
        0,
        n / 2 + w * 0.3,
      );
      c.fill();
    }
  });
  const glow = canvasTexture(64, (c, n) => {
    const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.2, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
  });
  const smoke = canvasTexture(64, (c, n) => {
    for (let i = 0; i < 18; i++) {
      const x = n / 2 + (Math.random() - 0.5) * n * 0.4,
        y = n / 2 + (Math.random() - 0.5) * n * 0.4,
        r = n * (0.12 + Math.random() * 0.2);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, n, n);
    }
  });
  flashTextures = { star, petal, glow, smoke };
  for (const t of Object.values(flashTextures)) t.userData.sharedSurface = true;
  return flashTextures;
}

const additive = (map, color) =>
  new T.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.DoubleSide,
    toneMapped: false,
  });

/** Styles: gas colour, size and petal length per weapon family. */
// Sizes are larger than life on purpose: a real flash is a few centimetres
// and would read as a spark at arm's length.
export const FLASH_STYLES = {
  pistol: { color: 0xffc98a, size: 0.17, petal: 0.26, prongs: 1 },
  smg: { color: 0xffc27a, size: 0.15, petal: 0.24, prongs: 1 },
  rifle: { color: 0xffbd70, size: 0.21, petal: 0.36, prongs: 1.2 },
  shotgun: { color: 0xffb060, size: 0.32, petal: 0.46, prongs: 1.5 },
  sniper: { color: 0xffc070, size: 0.34, petal: 0.3, prongs: 1.8, brake: true },
  energy: { color: 0x6fffe0, size: 0.24, petal: 0.32, prongs: 1 },
  upgraded: { color: 0xffa04a },
};

/** Builds the flash meshes under a weapon's muzzle-flash group. */
export function dressFlash(group, style, upgraded = false) {
  const tex = textures();
  const color = new T.Color(
    upgraded && !style.energy ? FLASH_STYLES.upgraded.color : style.color,
  );
  group.clear();
  const front = new T.Mesh(
    new T.PlaneGeometry(1, 1),
    additive(tex.star, color),
  );
  front.scale.setScalar(style.size);
  front.userData.baseScale = style.size;
  group.add(front);
  const petals = [];
  for (let i = 0; i < 2; i++) {
    const g = new T.PlaneGeometry(1, 1);
    // Origin on the muzzle, flame toward -z.
    g.translate(0.5, 0, 0);
    g.rotateY(Math.PI / 2);
    const p = new T.Mesh(g, additive(tex.petal, color));
    p.rotation.z = (i * Math.PI) / 2;
    p.scale.set(style.petal * 0.45, style.petal * 0.45, style.petal);
    p.userData.base = p.scale.clone();
    group.add(p);
    petals.push(p);
  }
  if (style.brake) {
    // Muzzle brake: two sideways jets.
    for (const s of [-1, 1]) {
      const g = new T.PlaneGeometry(1, 1);
      g.translate(0.5, 0, 0);
      const p = new T.Mesh(g, additive(tex.petal, color));
      p.position.z = 0.02;
      p.rotation.y = s > 0 ? 0 : Math.PI;
      p.scale.set(style.petal * 0.8, style.petal * 0.35, 1);
      p.userData.base = p.scale.clone();
      group.add(p);
      petals.push(p);
    }
  }
  const core = new T.Mesh(
    new T.PlaneGeometry(1, 1),
    additive(tex.glow, color.clone().lerp(new T.Color(1, 1, 1), 0.5)),
  );
  core.scale.setScalar(style.size * 0.6);
  group.add(core);
  group.userData.flash = { front, petals, core, style, color };
  return group;
}

const faceQ = new T.Quaternion();
const kick = new T.Vector3();
// Casings leave the port lying across the bore.
const ACROSS = new T.Quaternion().setFromAxisAngle(
  new T.Vector3(0, 0, 1),
  Math.PI / 2,
);
/** Give the next frames of the flash a new random look. */
export function reseedFlash(group) {
  const f = group?.userData.flash;
  if (f) f.seeded = false;
}
/** Shape of the flash `age` seconds after the shot; scale eases it when aiming. */
export function shapeFlash(group, age, camera, scale = 1) {
  const f = group?.userData.flash;
  if (!f) return 0;
  const life = 0.045;
  const k = Math.max(0, 1 - age / life);
  group.visible = k > 0;
  if (!group.visible) return 0;
  if (!f.seeded) {
    f.seeded = true;
    f.roll = Math.random() * Math.PI * 2;
    f.scale = 0.75 + Math.random() * 0.5;
    f.stretch = 0.7 + Math.random() * 0.6;
  }
  // The star faces the camera (it is seen from behind the gun).
  if (camera)
    f.front.quaternion.copy(group.parent.getWorldQuaternion(faceQ).invert());
  f.front.rotateZ(f.roll);
  const s = f.front.userData.baseScale * f.scale * (0.6 + 0.4 * k) * scale;
  f.front.scale.setScalar(s);
  f.front.material.opacity = k;
  f.core.scale.setScalar(s * 0.6);
  f.core.material.opacity = k;
  f.core.quaternion.copy(f.front.quaternion);
  for (const p of f.petals) {
    p.scale.copy(p.userData.base).multiplyScalar(f.scale * scale);
    p.scale.z *= f.stretch;
    p.material.opacity = k * 0.9;
  }
  return k;
}

/** Brass and smoke in the view frame. */
export class ViewEffects {
  constructor(root, mobile = false) {
    this.root = root;
    this.casings = Array.from({ length: mobile ? 8 : 14 }, () => ({
      life: 0,
      p: new T.Vector3(),
      v: new T.Vector3(),
      q: new T.Quaternion(),
      w: new T.Vector3(),
      shell: false,
    }));
    this.cursor = 0;
    const brass = new T.MeshStandardMaterial({
      color: 0xc89a48,
      metalness: 1,
      roughness: 0.28,
    });
    const hull = new T.MeshStandardMaterial({
      color: 0x8e1d17,
      metalness: 0,
      roughness: 0.55,
    });
    // A cartridge case: rim, extractor groove, body, shoulder, neck.
    const caseGeo = new T.LatheGeometry(
      [
        [0, 0],
        [0.0048, 0],
        [0.0048, 0.0012],
        [0.004, 0.0016],
        [0.0043, 0.002],
        [0.0045, 0.019],
        [0.0033, 0.022],
        [0.003, 0.028],
        [0.0026, 0.028],
        [0.0026, 0.0035],
        [0, 0.0035],
      ].map(([r, y]) => new T.Vector2(r, y)),
      10,
    );
    caseGeo.translate(0, -0.014, 0);
    const shellGeo = new T.CylinderGeometry(0.0095, 0.0095, 0.068, 10);
    this.brass = new T.InstancedMesh(caseGeo, brass, this.casings.length);
    this.shells = new T.InstancedMesh(shellGeo, hull, this.casings.length);
    for (const m of [this.brass, this.shells]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.count = this.casings.length;
      root.add(m);
    }
    this.hideAll();
    const tex = textures();
    this.smoke = Array.from({ length: mobile ? 6 : 12 }, () => {
      const s = new T.Sprite(
        new T.SpriteMaterial({
          map: tex.smoke,
          color: 0xb9bdb8,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }),
      );
      s.visible = false;
      root.add(s);
      return { sprite: s, life: 0, max: 1, v: new T.Vector3() };
    });
    this.smokeCursor = 0;
    this.heat = 0;
    this.dummy = new T.Object3D();
  }

  hideAll() {
    this.dummy ||= new T.Object3D();
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.casings.length; i++) {
      this.brass.setMatrixAt(i, this.dummy.matrix);
      this.shells.setMatrixAt(i, this.dummy.matrix);
    }
    this.brass.instanceMatrix.needsUpdate =
      this.shells.instanceMatrix.needsUpdate = true;
  }

  /** position/direction in the view frame; shell: shotgun hull. */
  eject(position, direction, weaponQuaternion, shell = false) {
    const c = this.casings[this.cursor++ % this.casings.length];
    c.life = 0.7;
    c.shell = shell;
    c.p.copy(position);
    c.v
      .copy(direction)
      .multiplyScalar(shell ? 1.6 : 2.2 + Math.random() * 0.8)
      .add(
        kick.set((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.5, 0.15),
      );
    c.q.copy(weaponQuaternion).multiply(ACROSS);
    c.w.set(
      (Math.random() - 0.3) * 30,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 20,
    );
  }

  /** Called on each shot: heat builds smoke after sustained fire. */
  shot(muzzle) {
    this.heat = Math.min(4, this.heat + 0.55);
    if (this.heat > 1.6 && Math.random() < 0.55) this.puff(muzzle, 0.6);
  }

  puff(position, strength = 1) {
    const s = this.smoke[this.smokeCursor++ % this.smoke.length];
    s.life = s.max = 1.1 + Math.random() * 0.8;
    s.sprite.position.copy(position);
    s.sprite.visible = true;
    s.strength = strength;
    s.v.set(
      (Math.random() - 0.5) * 0.03,
      0.05 + Math.random() * 0.05,
      (Math.random() - 0.5) * 0.03,
    );
  }

  update(dt, muzzle) {
    this.heat = Math.max(0, this.heat - dt * 1.2);
    // Lingering heat: occasional wisps off the muzzle.
    if (muzzle && this.heat > 1 && Math.random() < dt * this.heat * 1.4)
      this.puff(muzzle, 0.45);
    const d = this.dummy;
    let dirty = false;
    for (let i = 0; i < this.casings.length; i++) {
      const c = this.casings[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      c.v.y -= 9.8 * dt;
      c.p.addScaledVector(c.v, dt);
      const spin = c.w.length();
      if (spin > 0)
        c.q.multiply(
          faceQ.setFromAxisAngle(d.position.copy(c.w).normalize(), spin * dt),
        );
      d.position.copy(c.p);
      d.quaternion.copy(c.q);
      d.scale.setScalar(c.life > 0 ? 1 : 0);
      d.updateMatrix();
      (c.shell ? this.shells : this.brass).setMatrixAt(i, d.matrix);
      d.scale.setScalar(0);
      d.updateMatrix();
      (c.shell ? this.brass : this.shells).setMatrixAt(i, d.matrix);
      dirty = true;
    }
    if (dirty)
      this.brass.instanceMatrix.needsUpdate =
        this.shells.instanceMatrix.needsUpdate = true;
    for (const s of this.smoke) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = 1 - s.life / s.max;
      s.sprite.position.addScaledVector(s.v, dt);
      s.v.y += dt * 0.02;
      s.sprite.scale.setScalar(0.03 + k * 0.12);
      s.sprite.material.opacity =
        Math.sin(Math.min(1, k) * Math.PI) * 0.22 * (s.strength ?? 1);
      if (s.life <= 0) s.sprite.visible = false;
    }
  }

  dispose() {
    for (const m of [this.brass, this.shells]) {
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
      m.dispose();
    }
    for (const s of this.smoke) {
      s.sprite.removeFromParent();
      s.sprite.material.dispose();
    }
  }
}
