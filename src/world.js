import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  box,
  cylinder,
  sphere,
  mesh,
  mat,
  glow,
  label,
  glowSprite,
  createMaterials,
  weaponModel,
} from "./assets.js";
import { rng } from "./logic.js";
import { projectSurfaceUV, setSurfaceQuality } from "./surfaces.js";
import { enrichWorld } from "./world-detail.js";
import { buildAbyss } from "./world-abyss.js";

export class World {
  constructor(scene, id, quality) {
    this.scene = scene;
    this.id = id;
    this.quality = quality;
    this.root = new T.Group();
    scene.add(this.root);
    this.static = new T.Group();
    this.root.add(this.static);
    this.obstacles = [];
    this.interactions = [];
    this.lights = [];
    this.animated = [];
    this.doors = [];
    this.materials = createMaterials();
    this.random = rng(id === "abbey" ? 37 : 72);
    this.power = false;
    this.powerTime = 0;
    this.powerLevel = 0;
    this.circuits = [];
    this.time = 0;
    this.bounds = { x: 24, z: 29 };
    this.spawn = new T.Vector3(0, 1.7, 20);
    this.spawnPoints = [
      [-19, 23],
      [19, 23],
      [-19, 4],
      [19, 4],
      [-19, -22],
      [19, -22],
      [0, -25],
    ];
    if (id === "abyss") {
      this.detail = buildAbyss(this);
      this.machines();
    } else {
      this.environment();
      this.floor();
      if (id === "abbey") this.abbey();
      else this.station();
      this.machines();
      this.dressing();
      this.electricalNetwork();
      this.weather();
      this.detail = enrichWorld(this);
    }
    this.batch();
  }
  obstacle(x, z, w, d, h = 3, extra = {}) {
    const o = { x, z, w, d, h, active: true, ...extra };
    this.obstacles.push(o);
    return o;
  }
  solid(mat, x, y, z, w, h, d) {
    const m = box(this.static, mat, x, y, z, w, h, d);
    this.obstacle(x, z, w, d, h);
    return m;
  }
  environment() {
    const s = this.scene,
      abbey = this.id === "abbey";
    s.background = new T.Color(abbey ? 0x101b24 : 0x102330);
    s.fog = new T.FogExp2(abbey ? 0x132027 : 0x18303b, 0.014);
    const hemi = new T.HemisphereLight(
      abbey ? 0xadc7de : 0x9ddef0,
      abbey ? 0x454238 : 0x344c58,
      1.05,
    );
    this.root.add(hemi);
    this.hemi = hemi;
    this.root.add(new T.AmbientLight(0x9faeac, 0.2));
    const sun = new T.DirectionalLight(abbey ? 0xadcce4 : 0xa1d8f0, 2.15);
    sun.position.set(-25, 42, -32);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(this.quality === "high" ? 2048 : 1024);
    Object.assign(sun.shadow.camera, {
      left: -34,
      right: 34,
      top: 36,
      bottom: -36,
      near: 1,
      far: 120,
    });
    sun.shadow.normalBias = 0.06;
    sun.shadow.bias = -0.0002;
    this.root.add(sun);
    this.sun = sun;
    const fill = new T.DirectionalLight(abbey ? 0xc36d43 : 0x4dcccd, 0.55);
    fill.position.set(15, 8, 18);
    this.root.add(fill);
    this.fill = fill;
    this.fill.intensity = 0.2;
    this.scene.environmentIntensity = 0.27;
    if (abbey) {
      const eclipse = new T.Group();
      eclipse.position.set(7, 31, -63);
      this.root.add(eclipse);
      const disc = mesh(
        new T.CircleGeometry(5.1, 64),
        new T.MeshBasicMaterial({ color: 0x111c24, fog: false }),
        eclipse,
      );
      const ring = mesh(
        new T.RingGeometry(5.12, 5.22, 100),
        new T.MeshBasicMaterial({ color: 0xffaa73, fog: false }),
        eclipse,
      );
      const halo = glowSprite(0xff6a3b, 25);
      halo.material.opacity = 0.22;
      eclipse.add(halo);
      halo.position.z = -0.1;
      for (let i = 0; i < 4; i++) {
        const cor = mesh(
          new T.RingGeometry(5.22 + i * 0.12, 5.27 + i * 0.16, 96),
          new T.MeshBasicMaterial({
            color: 0xe45a36,
            transparent: true,
            opacity: 0.26 / (i + 1),
            fog: false,
            depthWrite: false,
          }),
          eclipse,
        );
        cor.position.z = -0.05;
      }
    } else {
      const geo = new T.PlaneGeometry(160, 26, 64, 8);
      const aurora = new T.Mesh(
        geo,
        new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: T.DoubleSide,
          uniforms: { time: { value: 0 } },
          vertexShader:
            "varying vec2 vUv; uniform float time; void main(){vUv=uv;vec3 p=position;p.z+=sin(p.x*.08+time*.1)*6.;p.y+=sin(p.x*.06)*8.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}",
          fragmentShader:
            "varying vec2 vUv; uniform float time; void main(){float a=sin(vUv.x*45.+sin(vUv.x*16.+time*.1)*3.)*.3+.5;a*=pow(sin(vUv.y*3.14159),2.)*.22;gl_FragColor=vec4(mix(vec3(.13,.25,.7),vec3(.15,.9,.7),vUv.y),a);}",
        }),
      );
      aurora.position.set(0, 38, -75);
      this.root.add(aurora);
      this.aurora = aurora;
    }
    const stars = new T.BufferGeometry(),
      p = [];
    for (let i = 0; i < 500; i++) {
      const theta = this.random() * Math.PI * 2,
        phi = this.random() * 1.4;
      p.push(
        Math.cos(theta) * Math.sin(phi) * 110,
        Math.cos(phi) * 110,
        Math.sin(theta) * Math.sin(phi) * 110,
      );
    }
    stars.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    this.root.add(
      new T.Points(
        stars,
        new T.PointsMaterial({
          color: 0xbcd6da,
          size: 0.14,
          transparent: true,
          opacity: 0.65,
          fog: false,
        }),
      ),
    );
  }
  floor() {
    const m = this.materials;
    box(this.static, m.floor, 0, -0.22, 0, 50, 0.4, 60);
    this.obstacle(-25, 0, 2, 62);
    this.obstacle(25, 0, 2, 62);
    this.obstacle(0, -30, 52, 2);
    this.obstacle(0, 30, 52, 2);
    // Inlaid pathways, expansion joints and reflected pools of colored light.
    for (let x of [-7.5, 7.5]) {
      box(this.static, m.gold, x, 0.011, 0, 0.07, 0.025, 56);
      box(this.static, m.dark, x + 0.2, 0.013, 0, 0.045, 0.025, 56);
    }
    for (let z = -27; z < 29; z += 3)
      box(this.static, m.dark, 0, 0.006, z, 15, 0.012, 0.025);
  }
  column(x, z, height = 10) {
    const m = this.materials;
    this.solid(m.stone, x, 0.32, z, 1.6, 0.65, 1.6);
    cylinder(this.static, m.trim, x, 0.83, z, 0.68, 0.38, 0.57);
    cylinder(
      this.static,
      m.stone,
      x,
      height / 2 + 0.8,
      z,
      0.48,
      height - 0.8,
      0.43,
      12,
    );
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      cylinder(
        this.static,
        m.trim,
        x + Math.cos(a) * 0.4,
        height / 2 + 0.8,
        z + Math.sin(a) * 0.4,
        0.13,
        height - 0.8,
        0.12,
        7,
      );
    }
    cylinder(this.static, m.trim, x, height + 0.2, z, 0.65, 0.35, 0.53);
    box(this.static, m.trim, x, height + 0.48, z, 1.45, 0.26, 1.45);
  }
  arch(x, y, z, width, height, rotation = 0) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotation;
    this.static.add(g);
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const px = -width / 2 + width * t,
        py = height * Math.sqrt(1 - Math.abs(t * 2 - 1));
      points.push(new T.Vector3(px, py, 0));
    }
    const curve = new T.CatmullRomCurve3(points);
    mesh(new T.TubeGeometry(curve, 28, 0.23, 6, false), this.materials.trim, g);
    for (let dx of [-0.19, 0.19]) {
      const rib = mesh(
        new T.TubeGeometry(curve, 28, 0.07, 5, false),
        this.materials.gold,
        g,
        0,
        dx,
        dx * 0.7,
      );
    }
  }
  lantern(x, y, z, color = 0xff9757, intensity = 8, powered = false) {
    const m = this.materials;
    box(this.static, m.black, x, y - 0.45, z, 0.28, 0.1, 0.28);
    cylinder(this.static, m.black, x, y - 0.23, z, 0.12, 0.42, 0.15, 6);
    const bulb = glow(color, powered ? 0.03 : 4);
    sphere(this.static, bulb, x, y, z, 0.1, 0.7, 1.5, 0.7);
    const s = glowSprite(color, 1.15);
    s.position.set(x, y, z);
    this.root.add(s);
    if (powered) s.material.opacity = 0.03;
    const light = new T.PointLight(color, intensity, 8, 1.8);
    light.position.set(x, y, z);
    this.root.add(light);
    if (powered) light.intensity = intensity * 0.03;
    this.lights.push({
      light,
      bulb,
      halo: s,
      powered,
      base: intensity,
      phase: this.random() * 7,
    });
  }
  candles(x, z, count = 4) {
    for (let i = 0; i < count; i++) {
      const dx = x + (this.random() - 0.5) * 0.9,
        dz = z + (this.random() - 0.5) * 0.6,
        h = 0.12 + this.random() * 0.23;
      cylinder(
        this.static,
        this.materials.trim,
        dx,
        h / 2,
        dz,
        0.045,
        h,
        0.04,
        7,
      );
      sphere(
        this.static,
        this.materials.red,
        dx,
        h + 0.055,
        dz,
        0.033,
        0.6,
        1.8,
        0.6,
      );
    }
  }
  abbey() {
    const m = this.materials;
    for (const x of [-11, 11])
      for (const z of [-21, -11, -1, 9, 22])
        this.column(x, z, z === 22 ? 10 : 11.5);
    for (const z of [-21, -11, -1, 9, 22]) {
      this.arch(0, 11.8, z, 22, 6.4);
      for (const x of [-18, 18]) {
        this.column(x, z, 6.5);
        this.arch(x < 0 ? -14.5 : 14.5, 6.9, z, 7, 4);
      }
    }
    for (const x of [-11, 11])
      for (const z of [-16, -6, 4, 15.5])
        this.arch(x, 11.8, z, z === 15.5 ? 13 : 10, 4, Math.PI / 2);
    // Broken perimeter: buttresses, pointed windows and luminous stained glass.
    for (const x of [-23, 23]) {
      this.solid(m.stone, x, 2.1, 0, 1.1, 4.2, 58);
      for (let z = -25; z < 28; z += 8) {
        this.solid(m.stone, x, 6.4, z, 1.65, 8.5, 1.9);
        box(this.static, m.trim, x, 10.8, z, 2, 0.4, 2.1);
        this.arch(x, 6.2, z + 4, 5.7, 3.3, Math.PI / 2);
        const window = box(this.static, m.dark, x, 5.6, z + 4, 0.3, 3.1, 4.3);
        for (let i = -1; i <= 1; i++)
          box(
            this.static,
            m.copper,
            x + (x < 0 ? 0.17 : -0.17),
            5.5,
            z + 4 + i * 1.05,
            0.04,
            2.9,
            0.065,
          );
      }
    }
    this.solid(m.stone, -16, 7, -28, 16, 14, 1.5);
    this.solid(m.stone, 16, 7, -28, 16, 14, 1.5);
    this.arch(0, 7, -28, 16, 8);
    box(this.static, m.stone, 0, 16.5, -28, 17, 3, 1.5);
    const rose = new T.Group();
    rose.position.set(0, 13.4, -27.15);
    this.static.add(rose);
    mesh(new T.TorusGeometry(2.8, 0.22, 8, 48), m.trim, rose);
    mesh(new T.TorusGeometry(2.48, 0.085, 6, 40), m.gold, rose);
    mesh(
      new T.CircleGeometry(2.42, 40),
      glow(0x8b3c32, 0.35),
      rose,
      0,
      0,
      -0.05,
    );
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      box(
        rose,
        m.trim,
        Math.sin(a) * 1.22,
        Math.cos(a) * 1.22,
        0,
        0.09,
        2.48,
        0.15,
      ).rotation.z = -a;
      const petal = mesh(
        new T.TorusGeometry(0.64, 0.065, 5, 20),
        m.gold,
        rose,
        Math.sin(a) * 1.7,
        Math.cos(a) * 1.7,
        0.1,
      );
      petal.scale.y = 1.3;
    }
    mesh(new T.TorusGeometry(0.65, 0.13, 6, 24), m.trim, rose);
    // Side aisles are navigable; seats form readable cover islands.
    for (let z of [15, 10, 1, -4, -14])
      for (let x of [-4.9, 4.9]) {
        if (z === -4) continue;
        this.solid(m.wood, x, 0.55, z, 3.2, 1.1, 0.8);
        box(this.static, m.wood, x, 0.44, z + 0.4, 3.25, 0.15, 0.7);
        box(this.static, m.trim, x - 1.6, 0.6, z, 0.14, 1.2, 0.85);
        box(this.static, m.trim, x + 1.6, 0.6, z, 0.14, 1.2, 0.85);
      }
    // Ritual altar with orbiting copper rings, luminous fissure and engraved plinth.
    this.solid(m.stone, 0, 0.6, -19, 5, 1.2, 3);
    box(this.static, m.trim, 0, 1.3, -19, 5.5, 0.25, 3.4);
    const rings = new T.Group();
    rings.position.set(0, 4, -19);
    this.root.add(rings);
    for (let i = 0; i < 3; i++) {
      const ring = mesh(
        new T.TorusGeometry(1.45 + i * 0.3, 0.038, 6, 72),
        i === 1 ? m.red : m.gold,
        rings,
      );
      ring.rotation.x = i * 0.8;
      ring.rotation.y = i * 0.6;
    }
    const core = mesh(new T.IcosahedronGeometry(0.65, 1), m.black, rings);
    core.rotation.z = 0.5;
    const inner = glowSprite(0xff7539, 4.5);
    rings.add(inner);
    inner.material.opacity = 0.35;
    this.coreHalo = inner;
    this.animated.push({ object: rings, kind: "relic" });
    this.lantern(0, 2.3, -18, 0xff6438, 23, true);
    for (const z of [-21, -1, 19])
      for (const x of [-10, 10]) this.lantern(x, 2.5, z);
    for (let x of [-3.4, 3.4]) {
      this.candles(x, -18, 10);
      this.candles(x, -20, 7);
    }
    for (let z of [-13, 6, 23]) this.candles(-12, z, 6);
    // Distant silhouette, mausoleums and fallen masonry.
    for (let i = 0; i < 14; i++) {
      const x = (i % 2 ? -1 : 1) * (28 + this.random() * 14),
        z = -35 + this.random() * 70,
        h = 12 + this.random() * 20;
      box(this.static, m.stone, x, h / 2, z, 4, h, 5);
      mesh(new T.ConeGeometry(3, 8, 4), m.dark, this.static, x, h + 4, z);
    }
    for (let i = 0; i < 70; i++) {
      const side = this.random() < 0.5 ? -1 : 1,
        x = side * (19.3 + this.random() * 2),
        z = -25 + this.random() * 51;
      const rock = mesh(
        new T.DodecahedronGeometry(0.12 + this.random() * 0.4, 0),
        m.stone,
        this.static,
        x,
        0.15,
        z,
      );
      rock.rotation.set(this.random() * 4, this.random() * 4, 0);
      rock.scale.y = 0.55;
    }
    this.gate(5, "La nef interdite");
  }
  station() {
    const m = this.materials;
    const floorStripe = mat(0xd0a652, 0.7, 0.3);
    for (const x of [-23, 23]) {
      this.solid(m.metal, x, 3, 0, 1, 6, 58);
      for (let z = -26; z <= 26; z += 6) {
        this.solid(m.dark, x, 6, z, 1.5, 12, 0.75);
        box(this.static, m.metal, x, 10, z, 2, 0.5, 1.2);
        box(
          this.static,
          m.cyan,
          x + (x < 0 ? 0.65 : -0.65),
          4,
          z,
          0.06,
          3,
          0.12,
        );
      }
    }
    for (let z = -25; z < 29; z += 10) {
      for (let x of [-13, 13]) {
        this.solid(m.metal, x, 4.5, z, 0.75, 9, 0.75);
        box(this.static, m.rust, x, 1, z, 1.25, 0.25, 1.25);
        for (let h of [2, 6])
          box(this.static, m.gold, x, h, z, 0.85, 0.2, 0.85);
      }
      box(this.static, m.dark, 0, 9, z, 28, 0.75, 0.7);
      for (let x = -12; x <= 12; x += 4) {
        const brace = box(this.static, m.rust, x, 9.9, z, 0.18, 2.8, 0.18);
        brace.rotation.z = x % 8 === 0 ? 0.8 : -0.8;
      }
      box(this.static, m.metal, 0, 11, z, 28, 0.25, 0.45);
    }
    // Ribbed industrial blocks frame wide looping routes around cargo islands.
    for (const [x, z, w, d] of [
      [-17, 12, 6, 7],
      [17, 7, 6, 9],
      [-17, -15, 6, 7],
      [17, -21, 6, 7],
    ]) {
      this.solid(m.metal, x, 2, z, w, 4, d);
      for (let i = 0; i < w * 3; i++)
        box(
          this.static,
          m.dark,
          x - w / 2 + i / 3,
          2,
          z + d / 2 + 0.02,
          0.065,
          3.8,
          0.04,
        );
      box(this.static, m.snow, x, 4.05, z, w + 0.15, 0.1, d + 0.15);
      const l = label("B Ø R E A L", "#8db4b8", w * 0.75, 0.6);
      l.position.set(x, 2.7, z + d / 2 + 0.06);
      this.static.add(l);
    }
    for (const [x, z] of [
      [-5, 12],
      [5, -1],
      [-5, -11],
    ]) {
      this.solid(m.metal, x, 0.8, z, 3, 1.6, 2.5);
      box(this.static, m.rust, x, 0.85, z, 3.05, 0.12, 2.55);
      for (const dx of [-1.1, 1.1])
        box(this.static, m.dark, x + dx, 0.8, z + 0.03, 0.13, 1.7, 2.6);
    }
    // Overhead conduits and cages.
    for (const x of [-20, 20]) {
      const p = cylinder(this.static, m.rust, x, 6, 0, 0.3, 54, 0.3, 12);
      p.rotation.x = Math.PI / 2;
      for (let z = -24; z < 26; z += 4) {
        const ring = mesh(
          new T.TorusGeometry(0.36, 0.055, 6, 14),
          m.dark,
          this.static,
          x,
          6,
          z,
        );
      }
      const p2 = cylinder(
        this.static,
        m.metal,
        x + 0.8,
        5.7,
        0,
        0.17,
        54,
        0.17,
        8,
      );
      p2.rotation.x = Math.PI / 2;
    }
    for (let x of [-8, 8]) {
      for (let z = -28; z < 28; z += 2) {
        const stripe = box(
          this.static,
          floorStripe,
          x,
          0.02,
          z,
          0.45,
          0.015,
          0.8,
        );
        stripe.rotation.y = -0.5;
      }
    }
    // Central reactor visible from the spawn, surrounded by orbiting induction rings.
    this.solid(m.dark, 0, 0.45, -20, 7, 0.9, 7);
    cylinder(this.static, m.metal, 0, 1, -20, 2.7, 0.7, 2.4, 32);
    const reactor = new T.Group();
    reactor.position.set(0, 4.5, -20);
    this.root.add(reactor);
    const glass = cylinder(reactor, m.glass, 0, 0, 0, 1.5, 6.5, 1.5, 32);
    cylinder(reactor, m.cyan, 0, 0, 0, 0.23, 6, 0.23, 12);
    for (let i = 0; i < 5; i++) {
      const ring = mesh(
        new T.TorusGeometry(2.05, 0.1, 8, 48),
        i % 2 ? m.cyan : m.metal,
        reactor,
        0,
        -2.8 + i * 1.4,
        0,
      );
      ring.rotation.x = Math.PI / 2;
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      cylinder(
        reactor,
        m.dark,
        Math.sin(a) * 2.6,
        0,
        Math.cos(a) * 2.6,
        0.13,
        7,
      );
      const tube = cylinder(
        reactor,
        m.cyan,
        Math.sin(a) * 2.65,
        0,
        Math.cos(a) * 2.65,
        0.035,
        6,
      );
    }
    cylinder(this.static, m.metal, 0, 8.2, -20, 3, 0.8, 2.7, 32);
    const orb = glowSprite(0x4bfce3, 9);
    orb.position.set(0, 4, -20);
    orb.material.opacity = 0.3;
    this.coreHalo = orb;
    this.root.add(orb);
    this.animated.push({ object: reactor, kind: "reactor" });
    this.lantern(0, 4, -18, 0x50f5de, 60, true);
    box(this.static, m.metal, 0, 6, -28, 48, 12, 1.4);
    const sign = label("SECTEUR 07 / ANOMALIE ACTIVE", "#79e0d8", 10, 1);
    sign.position.set(0, 9.5, -27.2);
    this.static.add(sign);
    // Antenna, perimeter snow drifts, mountains.
    cylinder(this.static, m.metal, -20, 15, -32, 0.7, 18, 0.5, 12);
    sphere(this.static, m.snow, -20, 25, -32, 5);
    const wire = mesh(
      new T.IcosahedronGeometry(5.05, 2),
      new T.MeshBasicMaterial({ color: 0x263e48, wireframe: true }),
      this.static,
      -20,
      25,
      -32,
    );
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2,
        h = 14 + this.random() * 22;
      const mount = mesh(
        new T.ConeGeometry(12 + this.random() * 15, h, 5),
        i % 2 ? m.snow : m.stone,
        this.static,
        Math.sin(a) * 75,
        h / 2 - 6,
        Math.cos(a) * 75,
      );
      mount.rotation.y = this.random() * 4;
    }
    for (const z of [-22, -5, 17])
      for (const x of [-12, 12])
        this.lantern(x, 4, z, z === -5 ? 0x62f7e7 : 0xffb260, 14, true);
    for (let i = 0; i < 45; i++) {
      const x = (this.random() < 0.5 ? -1 : 1) * (21 + this.random()),
        z = (this.random() - 0.5) * 56;
      const rock = sphere(
        this.static,
        m.snow,
        x,
        0.07,
        z,
        0.3 + this.random() * 0.8,
        1,
        0.23,
        1.5,
      );
    }
    this.gate(3, "Secteur de confinement");
  }
  gate(z, name) {
    const m = this.materials; // Cross-map progression barrier; a broad central door opens a full second arena.
    const g = new T.Group();
    g.position.set(0, 0, z);
    this.root.add(g);
    const bars = new T.Group();
    g.add(bars);
    for (let x = -10; x <= 10; x += 0.5) {
      box(bars, m.black, x, 2.5, 0, 0.085, 5, 0.12);
      if (this.id === "abbey")
        mesh(new T.ConeGeometry(0.14, 0.42, 4), m.gold, bars, x, 5.2, 0);
    }
    for (let y of [0.4, 2, 4]) box(bars, m.rust, 0, y, 0, 21, 0.1, 0.18);
    for (let s of [-1, 1]) {
      this.solid(m.stone, s * 17.3, 1.8, z, 13.4, 3.6, 0.75);
    }
    const obstacle = this.obstacle(0, z, 21, 0.4, 5);
    const sign = label("ACCÈS SCELLÉ · 750", "#efa974", 4, 0.6);
    sign.position.set(0, 2.1, 0.2);
    g.add(sign);
    const gate = {
      kind: "door",
      name,
      cost: 750,
      position: new T.Vector3(0, 1, z + 1),
      root: g,
      bars,
      obstacle,
      sign,
      open: false,
    };
    this.interactions.push(gate);
    this.doors.push(gate);
  }
  machines() {
    const m = this.materials;
    const locations = {
      box: [-17, 18],
      ammo: [17, 20],
      power: [-18, -21],
      upgrade: [17, -13],
      health: [-17, -6],
      speed: [17, -3],
      extract: [0, 26],
    };
    for (const [kind, [x, z]] of this.machineLocations ||
      Object.entries(locations)) {
      const g = new T.Group();
      g.position.set(x, 0, z);
      this.root.add(g);
      const direction = x < 0 ? Math.PI / 2 : x > 0 ? -Math.PI / 2 : Math.PI;
      g.rotation.y = direction;
      const info = {
        kind,
        root: g,
        position: new T.Vector3(x, 1, z),
        name: {
          box: "Le Reliquaire",
          ammo: "Ravitaillement",
          power: "Générateur",
          upgrade: "La Transfiguration",
          health: "Sang de fer",
          speed: "Nerfs d’acier",
          extract: "Balise d’extraction",
        }[kind],
        cost: {
          box: 950,
          ammo: 350,
          power: 0,
          upgrade: 3000,
          health: 2000,
          speed: 1500,
          extract: 0,
        }[kind],
      };
      if (kind === "box") {
        box(g, m.wood, 0, 0.62, 0, 2.6, 1.05, 1.05);
        for (let sx of [-1.1, 1.1]) {
          box(g, m.gold, sx, 0.63, 0, 0.1, 1.15, 1.1);
          box(g, m.black, sx, 0.14, 0, 0.2, 0.28, 1.18);
        }
        const lid = new T.Group();
        lid.position.set(0, 1.14, -0.53);
        g.add(lid);
        box(lid, m.wood, 0, 0.08, 0.53, 2.67, 0.16, 1.1);
        for (let sx of [-1.1, 1.1])
          box(lid, m.gold, sx, 0.09, 0.53, 0.12, 0.19, 1.14);
        info.lid = lid;
        box(g, m.gold, 0, 0.8, 0.55, 0.21, 0.26, 0.06);
        const sig = label("◇   ?   ◇", "#efbf80", 1.3, 0.34);
        sig.position.set(0, 0.65, 0.535);
        g.add(sig);
        const beam = cylinder(
          g,
          mat(0xeab16a, 0.5, 0, {
            emissive: 0xf6aa56,
            emissiveIntensity: 0.9,
            transparent: true,
            opacity: 0.07,
            depthWrite: false,
            side: T.DoubleSide,
          }),
          0,
          9,
          0,
          0.4,
          17,
          1.4,
          16,
        );
        info.beam = beam;
        const s = glowSprite(0xffbd6a, 3);
        s.position.y = 1.4;
        s.material.opacity = 0.26;
        g.add(s);
        info.halo = s;
      } else if (kind === "extract") {
        cylinder(g, m.dark, 0, 0.12, 0, 0.85, 0.24, 1, 12);
        cylinder(g, m.metal, 0, 0.62, 0, 0.12, 0.9, 0.09, 8);
        box(g, m.dark, 0, 1.16, 0, 0.68, 0.36, 0.38);
        sphere(g, m.red, 0, 1.42, 0, 0.06);
        const a = box(g, m.metal, 0.22, 1.8, 0, 0.03, 0.95, 0.03);
        const ring = mesh(
          new T.RingGeometry(1.4, 1.45, 48),
          m.cyan,
          g,
          0,
          0.02,
          0,
        );
        ring.rotation.x = -Math.PI / 2;
        info.ring = ring;
      } else {
        const color =
          kind === "health"
            ? 0xcf534e
            : kind === "speed"
              ? 0xe9be61
              : kind === "upgrade"
                ? 0x8667d9
                : kind === "power"
                  ? 0x92cf9c
                  : 0x8ac0c5;
        const body = mat(color, 0.52, 0.55, { map: m.metal.map });
        box(g, m.dark, 0, 0.1, 0, 1.65, 0.2, 1.15);
        box(g, body, 0, 1.2, 0, 1.4, 2.25, 0.9);
        box(g, m.dark, 0, 1.35, 0.47, 1.1, 1.5, 0.05);
        const screen = box(
          g,
          glow(color, 0.8),
          0,
          1.77,
          0.51,
          0.85,
          0.42,
          0.02,
        );
        info.screen = screen;
        info.powered = ["power", "health", "speed", "upgrade"].includes(kind);
        if (info.powered) screen.material.emissiveIntensity = 0.015;
        const title = label(
          {
            ammo: "MUNITIONS",
            power: "COURANT",
            upgrade: "TRANSCEND",
            health: "SANG DE FER",
            speed: "NERFS D’ACIER",
          }[kind],
          `#${new T.Color(color).getHexString()}`,
          1.2,
          0.28,
        );
        title.position.set(0, 2.55, 0.15);
        g.add(title);
        for (let i = 0; i < 3; i++) {
          box(g, m.metal, -0.3 + i * 0.3, 1.12, 0.52, 0.2, 0.09, 0.08);
          sphere(
            g,
            i === 0 ? m.red : m.white,
            -0.33 + i * 0.32,
            1.44,
            0.52,
            0.036,
          );
        }
        for (let i = 0; i < 6; i++)
          box(g, m.metal, 0, 0.43 + i * 0.047, 0.51, 0.9, 0.018, 0.03);
        if (kind === "upgrade") {
          for (let s of [-1, 1]) {
            const coil = cylinder(
              g,
              m.copper,
              s * 0.79,
              1.6,
              0,
              0.15,
              1.4,
              0.15,
            );
            for (let i = 0; i < 6; i++)
              cylinder(
                g,
                m.cyan,
                s * 0.79,
                1.1 + i * 0.18,
                0,
                0.19,
                0.033,
                0.19,
                12,
              );
          }
          sphere(g, m.cyan, 0, 2.7, 0, 0.2);
        }
        if (kind === "power") {
          const lever = box(g, m.gold, 0.32, 1.15, 0.68, 0.075, 0.5, 0.075);
          lever.rotation.x = -0.5;
          info.lever = lever;
        }
      }
      this.obstacle(
        x,
        z,
        kind === "box" ? 2.8 : 1.6,
        1.5,
        kind === "box" ? 1.3 : 2.7,
      );
      const tag = label(
        info.name.toUpperCase(),
        kind === "box" ? "#e8b67c" : "#a5bfbc",
        kind === "box" ? 3.1 : 2.6,
        0.45,
      );
      tag.position.set(0, kind === "box" ? 2.5 : 3.2, 0);
      g.add(tag);
      info.tag = tag;
      this.interactions.push(info);
    }
  }
  dressing() {
    const m = this.materials,
      abbey = this.id === "abbey";
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = abbey ? "#452b2a" : "#29464a";
    ctx.fillRect(0, 0, 256, 512);
    ctx.strokeStyle = abbey ? "#bb9470" : "#a1c5ba";
    ctx.lineWidth = 3;
    ctx.strokeRect(17, 15, 222, 472);
    ctx.lineWidth = 2;
    ctx.strokeRect(23, 21, 210, 460);
    ctx.beginPath();
    ctx.arc(128, 164, 65, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(93, 134);
    ctx.lineTo(128, 235);
    ctx.lineTo(163, 134);
    ctx.moveTo(128, 76);
    ctx.lineTo(128, 117);
    ctx.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.sin(a) * 72, 164 + Math.cos(a) * 72);
      ctx.lineTo(128 + Math.sin(a) * 79, 164 + Math.cos(a) * 79);
      ctx.stroke();
    }
    ctx.font = "20px serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#a99779";
    ctx.fillText(abbey ? "MEMENTO MORI" : "BOREAL / VII", 128, 345);
    ctx.font = "12px serif";
    ctx.fillText(abbey ? "LUX IN TENEBRIS" : "PROTOCOL VESPER", 128, 378);
    for (let i = 0; i < 2800; i++) {
      ctx.fillStyle = `rgba(0,0,0,${this.random() * 0.25})`;
      ctx.fillRect(
        this.random() * 256,
        this.random() * 512,
        1 + this.random() * 9,
        1 + this.random() * 4,
      );
    }
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    const cloth = mat(0xc3bbae, 0.95, 0, { map: tex, side: T.DoubleSide });
    for (const x of [-10.5, 10.5])
      for (const z of [-8, 15]) {
        const pole = box(this.static, m.gold, x, 8.6, z, 1.7, 0.055, 0.055);
        const geo = new T.PlaneGeometry(1.45, 3.8, 8, 16);
        const position = geo.attributes.position;
        for (let i = 0; i < position.count; i++) {
          const y = position.getY(i);
          if (y < -1.6) position.setY(i, y + this.random() * 0.35);
          position.setZ(i, Math.sin(position.getX(i) * 7) * 0.07);
        }
        geo.computeVertexNormals();
        const banner = new T.Mesh(geo, cloth);
        banner.position.set(x, 6.65, z);
        banner.castShadow = true;
        this.root.add(banner);
        this.animated.push({
          object: banner,
          kind: "banner",
          base: new Float32Array(position.array),
          phase: this.random() * 4,
        });
      }
    for (const [x, z] of [
      [-20, 24],
      [20, 13],
      [-20, -9],
      [20, -24],
    ]) {
      const g = new T.Group();
      g.position.set(x, 0, z);
      this.static.add(g);
      for (let j = 0; j < 3; j++) {
        const xx = (j % 2) * 0.75 - 0.35,
          zz = Math.floor(j / 2) * 0.7;
        const barrel = cylinder(
          g,
          abbey ? m.rust : m.metal,
          xx,
          0.55,
          zz,
          0.3,
          1.1,
          0.3,
          14,
        );
        for (let h of [0.12, 0.4, 0.95]) {
          const hoop = mesh(
            new T.TorusGeometry(0.31, 0.025, 6, 18),
            m.dark,
            g,
            xx,
            h,
            zz,
          );
          hoop.rotation.x = Math.PI / 2;
        }
        cylinder(g, m.dark, xx, 0.55, zz, 0.315, 0.06, 0.315, 14);
      }
      this.obstacle(x + 0.1, z + 0.3, 1.5, 1.5, 1.1);
    }
    if (abbey) {
      const ritual = new T.Group();
      ritual.position.set(0, 0.025, -12);
      ritual.rotation.x = -Math.PI / 2;
      this.static.add(ritual);
      for (let r of [2.1, 2.17, 2.5])
        mesh(new T.RingGeometry(r, r + 0.012, 72), m.copper, ritual);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const mark = box(
          ritual,
          m.gold,
          Math.sin(a) * 2.33,
          Math.cos(a) * 2.33,
          0,
          0.027,
          0.15,
          0.009,
        );
        mark.rotation.z = -a;
      }
    }
  }
  weather() {
    const n = 1600,
      positions = new Float32Array(n * 3),
      r = this.random;
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (r() - 0.5) * 56;
      positions[i * 3 + 1] = r() * 22;
      positions[i * 3 + 2] = (r() - 0.5) * 62;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(positions, 3));
    const snow = this.id === "station";
    const particleTex = glowSprite().material.map;
    this.particles = new T.Points(
      geo,
      new T.PointsMaterial({
        color: snow ? 0xc5e8ee : 0xf5ac70,
        size: snow ? 0.07 : 0.04,
        transparent: true,
        opacity: snow ? 0.6 : 0.5,
        map: particleTex,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    this.root.add(this.particles);
  }
  batch() {
    const byMaterial = new Map(),
      keep = [];
    this.static.updateMatrixWorld(true);
    this.static.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.transparent) {
        keep.push(o);
        return;
      }
      const geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      if (o.material.userData.worldMeters)
        projectSurfaceUV(geo, o.material.userData.worldMeters);
      if (!geo.getAttribute("uv"))
        geo.setAttribute(
          "uv",
          new T.BufferAttribute(
            new Float32Array(geo.getAttribute("position").count * 2),
            2,
          ),
        );
      if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
      byMaterial.get(o.material).push(geo.index ? geo.toNonIndexed() : geo);
    });
    for (const [material, geos] of byMaterial) {
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const m = new T.Mesh(merged, material);
        m.castShadow = true;
        m.receiveShadow = true;
        this.root.add(m);
      }
      geos.forEach((g) => g.dispose());
    }
    for (const o of keep) this.root.attach(o);
    this.root.remove(this.static);
    this.static.clear();
  }
  electricalNetwork() {
    const color = this.id === "abbey" ? 0xffcf88 : 0x69ecf2;
    this.materials.cyan.emissiveIntensity = 0.035;
    this.coreHalo.material.opacity = 0.045;
    for (const [index, z] of [-20, -7, 7, 20].entries()) {
      const material = glow(color, 0);
      material.color.set(0x202c30);
      for (const x of [-8, 8]) {
        for (const dx of [-1.35, 1.35]) {
          cylinder(
            this.static,
            this.materials.dark,
            x + dx,
            7.1,
            z,
            0.025,
            3.2,
            0.025,
            6,
          );
          box(
            this.static,
            this.materials.gold,
            x + dx,
            5.5,
            z,
            0.12,
            0.27,
            0.5,
          );
        }
        box(this.static, this.materials.dark, x, 5.5, z, 3.5, 0.2, 0.46);
        box(this.static, material, x, 5.37, z, 3.2, 0.065, 0.28);
        // Recessed floor conductors lead back to the spawn and light in sequence.
        for (let dz = -5; dz <= 5; dz += 2)
          box(this.static, material, x, 0.035, z + dz, 0.09, 0.025, 1.6);
      }
      const light = new T.PointLight(color, 0, 24, 1.45);
      light.position.set(0, 5.1, z);
      this.root.add(light);
      this.circuits.push({ material, light, delay: index * 0.6, level: 0 });
    }
  }
  update(dt, time) {
    this.time = time;
    this.detail.update(dt, time);
    if (this.power) this.powerTime += dt;
    this.powerLevel = this.power ? Math.min(1, this.powerTime / 3.2) : 0;
    // Soften powered highlights while keeping ambient visibility on each map.
    const poweredBrightness =
      this.lighting?.poweredBrightness ?? (this.id === "abbey" ? 0.86 : 0.84);
    const glowLevel = this.powerLevel * poweredBrightness;
    for (const c of this.circuits) {
      const ramp = this.power
        ? T.MathUtils.clamp((this.powerTime - c.delay) / 0.9, 0, 1)
        : 0;
      c.level = ramp * ramp * (3 - 2 * ramp);
      c.material.emissiveIntensity = c.level * 4.5 * poweredBrightness;
      c.light.intensity = c.level * 48 * poweredBrightness;
    }
    this.hemi.intensity =
      (this.lighting?.ambient ?? 1.05) +
      this.powerLevel * (this.lighting?.powerAmbient ?? 0.35);
    this.fill.intensity =
      (this.lighting?.fill ?? 0.2) +
      this.powerLevel * (this.lighting?.powerFill ?? 0.75);
    this.scene.environmentIntensity = 0.25 + this.powerLevel * 0.18;
    this.materials.cyan.emissiveIntensity = 0.035 + glowLevel * 3;
    this.coreHalo.material.opacity = 0.045 + glowLevel * 0.46;
    for (const i of this.interactions)
      if (i.powered)
        i.screen.material.emissiveIntensity = 0.015 + this.powerLevel * 3;
    for (const l of this.lights) {
      l.light.intensity =
        l.base *
        (l.powered ? 0.03 + glowLevel * 0.97 : 1) *
        (0.91 +
          Math.sin(time * 8 + l.phase) * 0.045 +
          Math.sin(time * 13 + l.phase) * 0.03);
      if (l.powered) {
        l.bulb.emissiveIntensity = 0.03 + glowLevel * 4;
        l.halo.material.opacity = 0.03 + glowLevel * 0.65;
      }
    }
    if (
      this.lightBudget &&
      this.viewer &&
      time > (this.nextLightSelection || 0)
    ) {
      this.nextLightSelection = time + 0.4;
      const sources = [
        ...this.lights.map((l) => l.light),
        ...this.circuits.map((c) => c.light),
      ];
      sources.sort(
        (a, b) =>
          b.intensity /
            (12 + b.position.distanceToSquared(this.viewer.position)) -
          a.intensity /
            (12 + a.position.distanceToSquared(this.viewer.position)),
      );
      sources.forEach((light, i) => {
        light.visible = i < this.lightBudget;
      });
    }
    for (const a of this.animated) {
      if (a.kind === "banner") {
        const pos = a.object.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = a.base[i * 3 + 1],
            weight = (1.9 - y) / 3.8;
          pos.array[i * 3 + 2] =
            a.base[i * 3 + 2] +
            Math.sin(time * 1.9 + y * 2.1 + a.phase) * 0.14 * weight;
        }
        pos.needsUpdate = true;
        a.object.geometry.computeVertexNormals();
      } else if (a.kind === "relic") {
        a.object.rotation.y += dt * (0.025 + this.powerLevel * 0.65);
        a.object.rotation.z = Math.sin(time * 0.3) * 0.15;
      } else
        a.object.children.forEach((c, i) => {
          if (c.geometry?.type === "TorusGeometry")
            c.rotation.z +=
              dt * (i % 2 ? 1 : -1) * (0.015 + this.powerLevel * 0.35);
        });
    }
    if (this.aurora) this.aurora.material.uniforms.time.value = time;
    const p = this.particles.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.array[i * 3 + 1] += dt * (this.id === "station" ? -1.1 : 0.3);
      p.array[i * 3] += Math.sin(time * 0.5 + i) * dt * 0.14;
      if (p.array[i * 3 + 1] > 22) p.array[i * 3 + 1] = 0;
      if (p.array[i * 3 + 1] < 0) p.array[i * 3 + 1] = 22;
    }
    p.needsUpdate = true;
    for (const d of this.doors)
      if (d.open)
        d.bars.position.y = T.MathUtils.lerp(d.bars.position.y, 6.3, dt * 2);
    const relic = this.interactions.find((i) => i.kind === "box");
    if (relic?.lid)
      relic.lid.rotation.x = T.MathUtils.lerp(
        relic.lid.rotation.x,
        relic.busy ? -1.6 : 0,
        dt * 4,
      );
    if (relic?.display) {
      relic.display.rotation.y = time * 1.7;
      relic.display.position.y = 1.8 + Math.sin(time * 3) * 0.1;
    }
  }
  setPower() {
    if (this.power) return false;
    this.power = true;
    this.powerTime = 0;
    const power = this.interactions.find((i) => i.kind === "power");
    power.lever.rotation.x = 0.6;
    return true;
  }
  setQuality(quality, mobile = false) {
    this.quality = quality;
    setSurfaceQuality(this.root, quality);
    const shadowSize =
      quality === "high" && !mobile ? 2048 : quality === "low" ? 512 : 1024;
    if (this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.setScalar(shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.particles.geometry.setDrawRange(
      0,
      quality === "low" ? 320 : quality === "medium" || mobile ? 650 : 1600,
    );
    this.detail.setQuality(quality, mobile);
    this.lightBudget =
      mobile || quality === "low"
        ? 6
        : quality === "medium"
          ? Math.min(this.maxLights || 10, 10)
          : this.maxLights || 0;
    this.nextLightSelection = 0;
    for (const l of [
      ...this.lights.map((l) => l.light),
      ...this.circuits.map((c) => c.light),
    ])
      l.visible = true;
  }
  openDoor(d) {
    d.open = true;
    d.obstacle.active = false;
    d.sign.visible = false;
  }
  showBoxWeapon(id) {
    const b = this.interactions.find((i) => i.kind === "box");
    if (b.display) {
      b.root.remove(b.display);
      disposeModel(b.display);
    }
    b.display = weaponModel(id);
    b.display.scale.setScalar(1.4);
    b.display.position.y = 1.8;
    b.root.add(b.display);
  }
  dispose() {
    // Render targets (including their depth texture) belong to the old light.
    // Removing its meshes alone does not release the shadow allocation.
    this.sun.shadow.dispose();
    disposeModel(this.root);
    this.scene.remove(this.root);
  }
}
export function disposeModel(root) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of Array.isArray(o.material)
      ? o.material
      : o.material
        ? [o.material]
        : []) {
      materials.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => {
    if (!t.userData.sharedSurface) t.dispose();
  });
}
