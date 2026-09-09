import * as T from "three";
import { BloodEffects } from "./blood-effects.js";

const UP = new T.Vector3(0, 1, 0);
const delta = new T.Vector3();
const FRONT = new T.Vector3(0, 0, 1);

function markTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d"),
    g = ctx.createRadialGradient(64, 64, 2, 64, 64, 60);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.16, "rgba(9,7,5,.95)");
  g.addColorStop(0.25, "rgba(19,14,10,.75)");
  g.addColorStop(0.5, "rgba(42,32,21,.22)");
  g.addColorStop(1, "rgba(20,15,10,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.399;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 12, 64 + Math.sin(a) * 12);
    ctx.lineTo(64 + Math.cos(a + 0.1) * 43, 64 + Math.sin(a + 0.1) * 43);
    ctx.strokeStyle = "rgba(12,9,7,.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

// Fixed GPU allocations: automatic fire recycles slots instead of creating meshes.
export class CombatEffects {
  constructor(scene, mobile, camera) {
    this.root = new T.Group();
    this.root.name = "combat-effects";
    scene.add(this.root);
    this.blood = new BloodEffects(this.root, mobile, camera);
    this.limit = mobile ? 128 : 240;
    this.cursor = 0;
    this.markCursor = 0;
    this.casingCursor = 0;
    this.dummy = new T.Object3D();
    this.color = new T.Color();
    this.particles = Array.from({ length: this.limit }, () => ({
      life: 0,
      p: new T.Vector3(),
      v: new T.Vector3(),
      size: 0.02,
      max: 1,
    }));
    this.debris = new T.InstancedMesh(
      new T.IcosahedronGeometry(1, 0),
      new T.MeshBasicMaterial({ color: 0xffffff }),
      this.limit,
    );
    this.debris.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.debris.setColorAt(0, this.color);
    this.debris.instanceColor.setUsage(T.DynamicDrawUsage);
    this.debris.frustumCulled = false;
    this.root.add(this.debris);
    this.markCount = mobile ? 32 : 72;
    this.marks = new T.InstancedMesh(
      new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({
        map: markTexture(),
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      this.markCount,
    );
    this.marks.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.marks.frustumCulled = false;
    this.root.add(this.marks);
    this.casings = Array.from({ length: mobile ? 14 : 30 }, () => ({
      life: 0,
      p: new T.Vector3(),
      v: new T.Vector3(),
      rotation: new T.Euler(),
    }));
    this.brass = new T.InstancedMesh(
      new T.CylinderGeometry(0.009, 0.009, 0.036, 6),
      new T.MeshStandardMaterial({
        color: 0xb49b58,
        metalness: 0.78,
        roughness: 0.37,
      }),
      this.casings.length,
    );
    this.brass.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.brass.frustumCulled = false;
    this.root.add(this.brass);
    // Bullet tracers live 45 ms: a small ring of reusable meshes replaces a
    // fresh cylinder geometry and material for every round fired.
    this.tracerGeometry = new T.CylinderGeometry(1, 1, 1, 4);
    this.tracers = Array.from({ length: mobile ? 8 : 16 }, () => {
      const mesh = new T.Mesh(
        this.tracerGeometry,
        new T.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
        }),
      );
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      return { mesh, life: 0, max: 0.045 };
    });
    this.tracerCursor = 0;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (const mesh of [this.debris, this.marks, this.brass])
      for (let i = 0; i < mesh.count; i++)
        mesh.setMatrixAt(i, this.dummy.matrix);
    const smokeCount = mobile ? 12 : 24;
    this.smokeSlots = Array.from({ length: smokeCount }, () => ({
      life: 0,
      max: 1,
      p: new T.Vector3(),
      v: new T.Vector3(),
    }));
    this.smokeCursor = 0;
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(smokeCount * 3), 3),
    );
    geometry.setAttribute(
      "age",
      new T.BufferAttribute(new Float32Array(smokeCount), 1),
    );
    this.smoke = new T.Points(
      geometry,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: `attribute float age;varying float vAge;void main(){vAge=age;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=age>0.?min(180.,(1.-age)*190./max(.2,-mv.z)):0.;}`,
        fragmentShader: `varying float vAge;void main(){float d=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.15,1.,d))*sin(vAge*3.14159)*.11;gl_FragColor=vec4(.47,.49,.46,a);}`,
      }),
    );
    this.smoke.frustumCulled = false;
    this.root.add(this.smoke);
  }
  burst(position, color, count, force = 1) {
    for (let i = 0; i < count; i++) {
      const index = this.cursor++ % this.limit,
        p = this.particles[index];
      p.life = p.max = 0.25 + Math.random() * 0.5;
      p.size = 0.012 + Math.random() * 0.022;
      p.p.copy(position);
      p.v.set(
        (Math.random() - 0.5) * force * 5,
        Math.random() * force * 4,
        (Math.random() - 0.5) * force * 5,
      );
      this.color.setHex(color);
      this.color.multiplyScalar(0.65 + Math.random() * 0.55);
      this.debris.setColorAt(index, this.color);
    }
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
  }
  puff(position) {
    const s = this.smokeSlots[this.smokeCursor++ % this.smokeSlots.length];
    s.life = s.max = 0.6 + Math.random() * 0.7;
    s.p.copy(position);
    s.v.set(
      (Math.random() - 0.5) * 0.18,
      0.22 + Math.random() * 0.18,
      (Math.random() - 0.5) * 0.18,
    );
  }
  casing(position, quaternion) {
    const c = this.casings[this.casingCursor++ % this.casings.length];
    c.life = 3.8;
    c.p.copy(position);
    c.v
      .set(1.5 + Math.random(), 1.2 + Math.random(), 0.3)
      .applyQuaternion(quaternion);
    c.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  }
  tracer(start, end, color, radius) {
    delta.subVectors(end, start);
    const length = delta.length();
    if (length < 0.001) return;
    const t = this.tracers[this.tracerCursor++ % this.tracers.length],
      m = t.mesh;
    m.position.copy(start).addScaledVector(delta, 0.5);
    m.quaternion.setFromUnitVectors(UP, delta.divideScalar(length));
    m.scale.set(radius, length, radius);
    m.material.color.setHex(color);
    m.material.opacity = 0.65;
    m.visible = true;
    t.life = t.max;
  }
  impact(position, normal, size = 0.22) {
    if (!normal) return;
    const d = this.dummy;
    d.position.copy(position).addScaledVector(normal, 0.012);
    d.quaternion.setFromUnitVectors(FRONT, normal);
    d.rotateZ(Math.random() * 6.28);
    d.scale.setScalar(size);
    d.updateMatrix();
    this.marks.setMatrixAt(this.markCursor++ % this.markCount, d.matrix);
    this.marks.instanceMatrix.needsUpdate = true;
  }
  update(dt) {
    this.blood.update(dt);
    const d = this.dummy;
    // Only live slots, plus the one frame that hides a slot, touch the GPU
    // buffers: idle automatic-fire pools no longer upload every frame.
    let dirty = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        if (p.hidden) continue;
        p.hidden = true;
        d.scale.setScalar(0);
        d.updateMatrix();
        this.debris.setMatrixAt(i, d.matrix);
        dirty = true;
        continue;
      }
      p.hidden = false;
      p.life = Math.max(0, p.life - dt);
      p.v.y -= dt * 7;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.025) {
        p.p.y = 0.025;
        p.v.y = Math.abs(p.v.y) * 0.18;
        p.v.x *= 0.7;
        p.v.z *= 0.7;
      }
      d.position.copy(p.p);
      d.rotation.set(p.life * 4, p.life * 6, 0);
      d.scale.setScalar(p.life > 0 ? p.size * Math.min(1, p.life / 0.15) : 0);
      d.updateMatrix();
      this.debris.setMatrixAt(i, d.matrix);
      dirty = true;
    }
    if (dirty) this.debris.instanceMatrix.needsUpdate = true;
    dirty = false;
    for (let i = 0; i < this.casings.length; i++) {
      const c = this.casings[i];
      if (c.life <= 0) {
        if (c.hidden) continue;
        c.hidden = true;
        d.scale.setScalar(0);
        d.updateMatrix();
        this.brass.setMatrixAt(i, d.matrix);
        dirty = true;
        continue;
      }
      c.hidden = false;
      c.life = Math.max(0, c.life - dt);
      if (c.p.y > 0.018) {
        c.v.y -= dt * 9;
        c.p.addScaledVector(c.v, dt);
        c.rotation.x += dt * 13;
        c.rotation.z += dt * 8;
        if (c.p.y < 0.018) {
          c.p.y = 0.018;
          c.v.set(0, 0, 0);
          c.rotation.z = Math.PI / 2;
        }
      }
      d.position.copy(c.p);
      d.rotation.copy(c.rotation);
      d.scale.setScalar(c.life > 0 ? Math.min(1, c.life * 3) : 0);
      d.updateMatrix();
      this.brass.setMatrixAt(i, d.matrix);
      dirty = true;
    }
    if (dirty) this.brass.instanceMatrix.needsUpdate = true;
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else t.mesh.material.opacity = 0.65 * (t.life / t.max);
    }
    const pos = this.smoke.geometry.attributes.position,
      age = this.smoke.geometry.attributes.age;
    let smoking = false;
    for (let i = 0; i < this.smokeSlots.length; i++) {
      const s = this.smokeSlots[i];
      if (s.life <= 0 && age.getX(i) === 0) continue;
      s.life = Math.max(0, s.life - dt);
      s.p.addScaledVector(s.v, dt);
      pos.setXYZ(i, s.p.x, s.p.y, s.p.z);
      age.setX(i, s.life / s.max);
      smoking = true;
    }
    if (smoking) pos.needsUpdate = age.needsUpdate = true;
  }
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      // Instance buffers are released only through the mesh's own dispose event.
      if (o.isInstancedMesh) o.dispose();
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }
}
