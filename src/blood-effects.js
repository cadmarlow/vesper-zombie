import * as T from "three";
import { rng } from "./logic.js";

const UP = new T.Vector3(0, 1, 0);
const FRONT = new T.Vector3(0, 0, 1);
const IDENTITY = new T.Quaternion();

function splatterTexture(mist = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d"),
    random = rng(mist ? 4981 : 7493);
  // Irregular liquid islands and satellite drops, with a transparent border.
  // Drawn once locally; neither a remote image nor a new texture per impact.
  if (!mist) {
    c.fillStyle = "rgba(255,255,255,.96)";
    c.beginPath();
    for (let i = 0; i <= 48; i++) {
      const angle = ((i % 48) / 48) * Math.PI * 2;
      const radius = 30 + random() * 15 + Math.sin(angle * 5) * 7;
      const x = 128 + Math.cos(angle) * radius;
      const y = 128 + Math.sin(angle) * radius * 0.8;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
    c.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const angle = random() * Math.PI * 2,
        reach = 45 + random() * 40;
      c.strokeStyle = "rgba(255,255,255,.82)";
      c.lineWidth = 1 + random() * 3;
      c.beginPath();
      c.moveTo(128 + Math.cos(angle) * 20, 128 + Math.sin(angle) * 20);
      c.quadraticCurveTo(
        128 + Math.cos(angle + 0.1) * reach * 0.7,
        128 + Math.sin(angle + 0.1) * reach * 0.7,
        128 + Math.cos(angle) * reach,
        128 + Math.sin(angle) * reach,
      );
      c.stroke();
    }
  }
  for (let i = 0; i < (mist ? 110 : 60); i++) {
    const angle = random() * Math.PI * 2,
      reach = random() ** 0.8 * 102,
      radius = mist
        ? 7 + (1 - reach / 110) * random() * 24
        : 1 + (1 - reach / 120) * random() * 11,
      x = 128 + Math.cos(angle) * reach,
      y = 128 + Math.sin(angle) * reach;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.scale(mist ? 1 : 1.2 + random(), 0.5 + random() * 0.8);
    if (mist) {
      const gradient = c.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
      gradient.addColorStop(0, "rgba(255,255,255,.55)");
      gradient.addColorStop(0.65, "rgba(255,255,255,.23)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = gradient;
    } else c.fillStyle = `rgba(255,255,255,${0.55 + random() * 0.45})`;
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function fadingMaterial(texture, opacity, lit = false) {
  const parameters = {
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  };
  const material = lit
    ? new T.MeshStandardMaterial({ ...parameters, roughness: 0.58 })
    : new T.MeshBasicMaterial(parameters);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float bloodFade; varying float vBloodFade;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBloodFade = bloodFade;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vBloodFade;",
      )
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.a *= vBloodFade;",
      );
  };
  material.customProgramCacheKey = () => "vesper-blood-fade-1";
  return material;
}

function poolMesh(geometry, material, count, fading = false) {
  if (fading)
    geometry.setAttribute(
      "bloodFade",
      new T.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(
        T.DynamicDrawUsage,
      ),
    );
  const mesh = new T.InstancedMesh(geometry, material, count);
  mesh.setColorAt(0, new T.Color(0xffffff));
  mesh.instanceColor.setUsage(T.DynamicDrawUsage);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

// Three bounded draw calls, independent of the number of hits. Slots, textures,
// transforms and materials are recycled; only active instances are submitted.
export class BloodEffects {
  constructor(parent, mobile, camera) {
    this.root = new T.Group();
    this.root.name = "blood-effects";
    parent.add(this.root);
    this.mobile = mobile;
    this.camera = camera;
    this.cursor = this.cloudCursor = this.stainCursor = 0;
    this.bursts = this.headBursts = 0;
    this.dummy = new T.Object3D();
    this.direction = new T.Vector3();
    this.normal = new T.Vector3();
    this.ground = new T.Vector3();
    this.color = new T.Color();
    this.particles = Array.from({ length: mobile ? 96 : 180 }, () => ({
      life: 0,
      max: 1,
      p: new T.Vector3(),
      v: new T.Vector3(),
      color: new T.Color(),
      size: 0.02,
      chunk: false,
      stain: 0,
      spin: 0,
    }));
    this.clouds = Array.from({ length: mobile ? 6 : 12 }, () => ({
      life: 0,
      max: 1,
      p: new T.Vector3(),
      v: new T.Vector3(),
      size: 1,
      angle: 0,
    }));
    this.stains = Array.from({ length: mobile ? 40 : 80 }, () => ({
      life: 0,
      matrix: new T.Matrix4(),
      color: new T.Color(),
    }));
    this.drops = poolMesh(
      new T.SphereGeometry(1, 8, 5),
      new T.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.56,
        metalness: 0,
      }),
      this.particles.length,
    );
    this.spray = poolMesh(
      new T.PlaneGeometry(1, 1),
      fadingMaterial(splatterTexture(true), 0.88),
      this.clouds.length,
      true,
    );
    this.splats = poolMesh(
      new T.PlaneGeometry(1, 1),
      fadingMaterial(splatterTexture(), 0.86, true),
      this.stains.length,
      true,
    );
    this.spray.renderOrder = 3;
    this.splats.renderOrder = 1;
    this.root.add(this.drops, this.spray, this.splats);
  }
  hit(position, direction, headKill = false) {
    this.bursts++;
    if (headKill) this.headBursts++;
    this.direction.copy(direction).normalize();
    if (this.direction.lengthSq() < 0.5) this.direction.set(0, 0, -1);
    const count = headKill ? (this.mobile ? 26 : 44) : this.mobile ? 7 : 12,
      force = headKill ? 3.9 : 2.2;
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor++ % this.particles.length];
      p.chunk = headKill && i < (this.mobile ? 4 : 7);
      p.life = p.max = p.chunk
        ? 1.6 + Math.random() * 0.6
        : 0.65 + Math.random() * 0.75;
      p.size = p.chunk
        ? 0.025 + Math.random() * 0.033
        : 0.009 + Math.random() * 0.013;
      p.spin = Math.random() * 6.28;
      p.p.copy(position);
      p.p.x += (Math.random() - 0.5) * 0.06;
      p.p.y += (Math.random() - 0.5) * 0.05;
      p.p.z += (Math.random() - 0.5) * 0.06;
      p.v
        .copy(this.direction)
        .multiplyScalar(force * (i % 4 ? 0.4 + Math.random() : -0.65));
      p.v.x += (Math.random() - 0.5) * force * 1.1;
      p.v.y += 0.6 + Math.random() * force * 0.8;
      p.v.z += (Math.random() - 0.5) * force * 1.1;
      p.color
        .setHex(p.chunk ? 0x67181a : 0x881317)
        .multiplyScalar(0.65 + Math.random() * 0.55);
      p.stain =
        i === 0
          ? headKill
            ? 0.65
            : 0.3
          : i % 5 === 1
            ? 0.14 + Math.random() * 0.18
            : 0;
      if (p.stain) p.life = p.max = Math.max(p.max, 1.55);
    }
    const c = this.clouds[this.cloudCursor++ % this.clouds.length];
    c.life = c.max = headKill ? 0.34 : 0.23;
    c.p.copy(position);
    c.v.copy(this.direction).multiplyScalar(headKill ? 0.65 : 0.4);
    c.size = headKill ? 0.9 : 0.42;
    c.angle = Math.random() * Math.PI * 2;
  }
  stain(position, normal, size = 0.4) {
    const s = this.stains[this.stainCursor++ % this.stains.length],
      d = this.dummy;
    s.life = 18 + Math.random() * 8;
    d.position.copy(position).addScaledVector(normal, 0.012);
    d.quaternion.setFromUnitVectors(FRONT, normal);
    d.rotateZ(Math.random() * Math.PI * 2);
    d.scale.set(size * (0.8 + Math.random() * 0.35), size, 1);
    d.updateMatrix();
    s.matrix.copy(d.matrix);
    s.color.setHex(0x651015).multiplyScalar(0.75 + Math.random() * 0.4);
  }
  update(dt) {
    const d = this.dummy;
    let count = 0;
    for (const p of this.particles) {
      p.life = Math.max(0, p.life - dt);
      if (!p.life) continue;
      if (p.p.y > 0.028) {
        p.v.y -= dt * 9.8;
        p.p.addScaledVector(p.v, dt);
        if (p.p.y <= 0.028) {
          p.p.y = 0.028;
          if (p.stain) {
            this.ground.copy(p.p).y = 0;
            this.stain(this.ground, UP, p.stain);
            p.stain = 0;
          }
          p.v.set(0, 0, 0);
          if (!p.chunk) {
            p.life = 0;
            continue;
          }
        }
      }
      d.position.copy(p.p);
      if (p.chunk)
        d.rotation.set(p.spin + p.life * 5, p.spin + p.life * 7, p.life * 3);
      else {
        this.normal.copy(p.v).normalize();
        if (this.normal.lengthSq() < 0.5) this.normal.copy(UP);
        d.quaternion.setFromUnitVectors(UP, this.normal);
      }
      const size = p.size * Math.min(1, p.life / 0.22);
      d.scale.set(
        size,
        size * (p.chunk ? 0.7 : 2.6),
        size * (p.chunk ? 1.3 : 0.75),
      );
      d.updateMatrix();
      this.drops.setMatrixAt(count, d.matrix);
      this.drops.setColorAt(count++, p.color);
    }
    this.drops.count = count;
    this.drops.instanceMatrix.needsUpdate = true;
    if (this.drops.instanceColor) this.drops.instanceColor.needsUpdate = true;
    count = 0;
    for (const c of this.clouds) {
      c.life = Math.max(0, c.life - dt);
      if (!c.life) continue;
      c.p.addScaledVector(c.v, dt);
      const age = 1 - c.life / c.max;
      d.position.copy(c.p);
      d.quaternion.copy(this.camera?.quaternion || IDENTITY);
      d.rotateZ(c.angle);
      d.scale.setScalar(c.size * (0.45 + age * 0.85));
      d.updateMatrix();
      this.spray.setMatrixAt(count, d.matrix);
      this.color.setHex(0xa01b21);
      this.spray.setColorAt(count, this.color);
      this.spray.geometry.attributes.bloodFade.setX(count++, (1 - age) ** 1.25);
    }
    this.spray.count = count;
    this.spray.instanceMatrix.needsUpdate = true;
    this.spray.geometry.attributes.bloodFade.needsUpdate = true;
    if (this.spray.instanceColor) this.spray.instanceColor.needsUpdate = true;
    count = 0;
    for (const s of this.stains) {
      s.life = Math.max(0, s.life - dt);
      if (!s.life) continue;
      this.splats.setMatrixAt(count, s.matrix);
      this.splats.setColorAt(count, s.color);
      this.splats.geometry.attributes.bloodFade.setX(
        count++,
        Math.min(1, s.life / 4),
      );
    }
    this.splats.count = count;
    this.splats.instanceMatrix.needsUpdate = true;
    this.splats.geometry.attributes.bloodFade.needsUpdate = true;
    if (this.splats.instanceColor) this.splats.instanceColor.needsUpdate = true;
  }
}
