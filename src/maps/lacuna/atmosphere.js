import * as T from "three";
import { mesh, glowSprite } from "../../assets.js";
import { rng } from "../../logic.js";
import { worldSurface, projectSurfaceUV } from "../../surfaces.js";
import { PURGE_ZONES } from "./data.js";
import { PHASE, MODE } from "./state.js";

const noiseGLSL = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){return .54*noise(p)+.27*noise(p*2.03)+.13*noise(p*4.07)+.06*noise(p*8.1);}`;

export function atmosphere(w, a) {
  const random = rng(1936617);
  w.scene.background = new T.Color(0x8caaa9);
  w.scene.fog = new T.FogExp2(0x9baead, 0.0036);
  w.lighting = {
    ambient: 1.65,
    powerAmbient: 0.09,
    fill: 0.3,
    powerFill: 0.1,
    poweredBrightness: 0.72,
  };
  w.hemi = new T.HemisphereLight(0xd0e5f1, 0x9a9d8b, 1.65);
  w.sun = new T.DirectionalLight(0xffdfb1, 3.25);
  w.sun.position.set(-95, 110, -48);
  w.sun.castShadow = true;
  Object.assign(w.sun.shadow.camera, {
    left: -108,
    right: 108,
    top: 110,
    bottom: -110,
    near: 1,
    far: 330,
  });
  w.sun.shadow.normalBias = 0.075;
  w.sun.shadow.bias = -0.00015;
  w.sun.shadow.mapSize.setScalar(2048);
  w.fill = new T.DirectionalLight(0x9dccdd, 0.3);
  w.fill.position.set(90, 45, 45);
  w.root.add(w.hemi, w.sun, w.fill);
  w.coreHalo = glowSprite(0xd9ebcd, 3);
  w.coreHalo.visible = false;
  w.root.add(w.coreHalo);
  const sky = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}`,
    fragmentShader: `varying vec3 vDirection;uniform float time;${noiseGLSL}
    void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.);
    vec3 sky=mix(vec3(.69,.76,.73),vec3(.28,.43,.50),pow(h,.5));
    vec3 sun=normalize(vec3(-.68,.65,-.31));float glow=pow(max(dot(d,sun),0.),18.);
    sky+=vec3(.35,.24,.10)*glow;
    vec2 uv=d.xz/(max(d.y,.035))*.8+vec2(time*.001,0.);
    float cloud=smoothstep(.40,.72,fbm(uv*2.));
    sky=mix(sky,mix(vec3(.47,.57,.60),vec3(.90,.84,.70),glow),cloud*smoothstep(.02,.20,d.y)*.87);
    sky+=vec3(.7,.5,.25)*pow(max(dot(d,sun),0.),600.);
    gl_FragColor=vec4(sky,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const dome = mesh(new T.SphereGeometry(370, 40, 20), sky, w.root);
  dome.castShadow = dome.receiveShadow = false;
  dome.frustumCulled = false;
  // Continuous valley ground beyond the playable town, with a true opening
  // for the deep canal. The sky must never show through a mountainside.
  for (const x of [-196, 196])
    a.block(a.m.moss, x, -0.9, 0, 248, 1, 620).castShadow = false;
  for (const z of [-244, 200])
    a.block(a.m.moss, 0, -0.9, z, 144, 1, z < 0 ? 248 : 240).castShadow = false;
  a.block(a.m.stone, 0, -10, -30, 19, 3, 184).castShadow = false;
  // Mountain ridges use vertex colours and silhouettes instead of giant textures.
  const mountainMaterial = worldSurface("stone", 0xabbab8, 16, {
    vertexColors: true,
    roughness: 1,
    flatShading: false,
  });
  for (const side of [-1, 1]) {
    const geometry = new T.PlaneGeometry(360, 170, 100, 32);
    geometry.rotateX(-Math.PI / 2);
    const p = geometry.attributes.position,
      colors = [];
    for (let i = 0; i < p.count; i++) {
      const longitudinal = p.getX(i),
        transverse = p.getZ(i);
      const ridge =
        70 +
        Math.sin(longitudinal * 0.025) * 24 +
        Math.sin(longitudinal * 0.063) * 12;
      const height =
        Math.max(0, 1 - Math.abs(transverse) / 88) * ridge + random() * 3 - 16;
      p.setXYZ(i, side * (170 + transverse), height, longitudinal - 25);
      const c = new T.Color(
        height > 75 ? 0xb1bab6 : height > 47 ? 0x718385 : 0x405a52,
      );
      c.multiplyScalar(0.88 + random() * 0.2);
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    if (side > 0) {
      const index = geometry.index;
      for (let i = 0; i < index.count; i += 3) {
        const b = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, b);
      }
    }
    geometry.computeVertexNormals();
    projectSurfaceUV(geometry, 16);
    const mountain = mesh(geometry, mountainMaterial, w.root);
    mountain.castShadow = false;
  }
  for (const side of [-1, 1]) {
    const rock = new T.IcosahedronGeometry(1, 3);
    const p = rock.attributes.position;
    const colors = [];
    for (let i = 0; i < p.count; i++) {
      const scale = 1 + 0.08 * Math.sin(p.getY(i) * 13 + p.getZ(i) * 7);
      p.setXYZ(
        i,
        p.getX(i) * scale * 63 + side * 105,
        p.getY(i) * 104 - 7,
        p.getZ(i) * 57 - 151,
      );
      const c = new T.Color(p.getY(i) > 73 ? 0xbdc7c7 : 0x667974);
      colors.push(c.r, c.g, c.b);
    }
    rock.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    rock.computeVertexNormals();
    projectSurfaceUV(rock, 16);
    mesh(rock, mountainMaterial, w.root).castShadow = false;
  }
  // Trees outside the playable limits frame the city without blocking routes.
  const foliage = new T.MeshStandardMaterial({ color: 0x314e43, roughness: 1 });
  const trees = new T.InstancedMesh(new T.ConeGeometry(1, 1, 9), foliage, 1050);
  const matrix = new T.Matrix4(),
    quaternion = new T.Quaternion();
  for (let i = 0; i < 210; i++) {
    const side = i % 2 ? -1 : 1,
      height = 5 + random() * 11;
    const x = side * (78 + random() * 35),
      z = random() * 220 - 130;
    for (let tier = 0; tier < 5; tier++) {
      const width = height * (0.25 - tier * 0.038);
      matrix.compose(
        new T.Vector3(
          x + (random() - 0.5) * 0.5,
          height * (0.28 + tier * 0.15),
          z,
        ),
        quaternion,
        new T.Vector3(width, height * 0.42, width * 0.9),
      );
      trees.setMatrixAt(i * 5 + tier, matrix);
      trees.setColorAt(
        i * 5 + tier,
        new T.Color().setHSL(0.38, 0.16, 0.48 + random() * 0.14),
      );
    }
  }
  trees.receiveShadow = true;
  w.root.add(trees);
  const moteGeometry = new T.BufferGeometry(),
    positions = [];
  for (let i = 0; i < 1600; i++)
    positions.push(
      (random() - 0.5) * 140,
      random() * 22,
      (random() - 0.5) * 158,
    );
  moteGeometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(positions, 3),
  );
  w.particles = new T.Points(
    moteGeometry,
    new T.PointsMaterial({
      color: 0xe3e4d0,
      size: 0.018,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    }),
  );
  w.root.add(w.particles);

  const waterMaterial = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, surge: { value: 0 } },
    vertexShader: `varying vec2 vUv;uniform float time;void main(){vUv=uv;vec3 p=position;p.z+=sin(p.x*.8+time)*.06;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float time;uniform float surge;${noiseGLSL}
    void main(){vec2 p=vUv*vec2(8.,90.);p.y-=time*(.65+surge*2.5);
    float n=fbm(p+vec2(sin(p.y*.5),0.));
    float foam=smoothstep(.59,.78,n)*(.24+surge*.65);
    float edge=pow(abs(vUv.x-.5)*2.,12.);
    vec3 col=mix(vec3(.065,.19,.19),vec3(.24,.41,.39),n);
    col=mix(col,vec3(.76,.85,.78),clamp(foam+edge*.28,0.,1.));
    gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const water = mesh(
    new T.PlaneGeometry(18, 183, 6, 55),
    waterMaterial,
    w.root,
    0,
    -5.9,
    -32,
  );
  water.rotation.x = -Math.PI / 2;
  water.castShadow = false;
  const fallMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { time: { value: 0 }, surge: { value: 0 } },
    vertexShader: `varying vec2 vUv;uniform float time;uniform float surge;void main(){vUv=uv;vec3 p=position;p.x+=sin(uv.y*27.+time*3.)*.13*(1.-uv.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float time;uniform float surge;${noiseGLSL}
    void main(){float n=fbm(vec2(vUv.x*9.,vUv.y*15.+time*2.3));
    float a=smoothstep(0.,.13,vUv.x)*smoothstep(1.,.87,vUv.x);
    a*=.3+n*.7;vec3 col=mix(vec3(.55,.71,.70),vec3(.92,.96,.88),n);
    gl_FragColor=vec4(col,a*(.35+surge*.6));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const falls = [];
  for (const x of [-35, -21, -7, 7, 21, 35]) {
    const fall = mesh(
      new T.PlaneGeometry(8, 75, 5, 25),
      fallMaterial,
      w.root,
      x,
      27,
      -101 - (x * x) / 550,
    );
    fall.castShadow = false;
    falls.push(fall);
  }
  // Warning paint, four rotating lamps and a visible jet line per danger zone.
  const zones = PURGE_ZONES.map((zone) => {
    const signal = new T.MeshStandardMaterial({
      color: 0xd49d38,
      emissive: 0xff5c1a,
      emissiveIntensity: 0.1,
    });
    for (const side of [-1, 1]) {
      a.block(
        a.m.warning,
        zone.x,
        0.016,
        zone.z + (side * zone.d) / 2,
        zone.w,
        0.028,
        0.13,
      );
      a.block(
        a.m.warning,
        zone.x + (side * zone.w) / 2,
        0.016,
        zone.z,
        0.13,
        0.028,
        zone.d,
      );
    }
    const group = new T.Group();
    w.root.add(group);
    const steamGeometry = new T.BufferGeometry(),
      particles = [];
    for (let i = 0; i < 96; i++)
      particles.push(
        (random() - 0.5) * zone.w,
        random() * 3.4,
        (random() - 0.5) * zone.d,
      );
    steamGeometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(particles, 3),
    );
    const jet = new T.Points(
      steamGeometry,
      new T.PointsMaterial({
        color: 0xdaede6,
        map: mistTexture(),
        size: 2.2,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    jet.position.set(zone.x, 0.1, zone.z);
    group.add(jet);
    for (const side of [-1, 1]) {
      a.block(
        a.m.iron,
        zone.x + (side * zone.w) / 2,
        0.06,
        zone.z,
        0.4,
        0.1,
        zone.d,
      );
      const beacon = a.block(
        signal,
        zone.x + (side * zone.w) / 2,
        2,
        zone.z - zone.d / 2,
        0.24,
        0.48,
        0.24,
        group,
      );
      beacon.castShadow = false;
      a.block(
        a.m.iron,
        beacon.position.x,
        0.9,
        beacon.position.z,
        0.08,
        1.8,
        0.08,
      );
    }
    return { signal, jet };
  });
  let state = null,
    surge = 0;
  return {
    setState(next) {
      state = next;
    },
    update(dt, time) {
      const active = state?.phase === PHASE.FLOOD;
      const target = active
        ? state.mode === MODE.RELEASE
          ? 1.3
          : state.mode === MODE.VALVE
            ? 0.45
            : 1
        : 0;
      surge = T.MathUtils.damp(surge, target, 0.7, dt);
      sky.uniforms.time.value = time;
      waterMaterial.uniforms.time.value = fallMaterial.uniforms.time.value =
        time;
      waterMaterial.uniforms.surge.value = fallMaterial.uniforms.surge.value =
        surge;
      water.position.y = -5.9 + surge * 3.8;
      falls.forEach((fall, i) => {
        fall.scale.x = 0.25 + surge * (i % 2 ? 0.7 : 0.9);
      });
      for (let i = 0; i < zones.length; i++) {
        const { signal, jet } = zones[i];
        const selected = state?.zone === i;
        signal.emissiveIntensity =
          selected && state?.phase === PHASE.WARNING
            ? 0.3 + 3 * Math.pow(Math.sin(time * 6), 2)
            : selected && active
              ? 2.5
              : 0.06;
        jet.material.opacity = T.MathUtils.damp(
          jet.material.opacity,
          selected && active ? 0.6 : 0,
          2,
          dt,
        );
        jet.visible = jet.material.opacity > 0.01;
        if (jet.visible) {
          const p = jet.geometry.attributes.position;
          for (let j = 0; j < p.count; j++)
            p.array[j * 3 + 1] =
              (p.array[j * 3 + 1] + dt * (1.4 + (j % 3))) % 3.8;
          p.needsUpdate = true;
        }
      }
      for (const material of w.lacunaLamps)
        material.emissiveIntensity = 0.12 + w.powerLevel * 1.5;
    },
    setQuality(quality, mobile) {
      trees.count = quality === "low" ? 500 : mobile ? 750 : 1050;
      for (const zone of zones)
        zone.jet.geometry.setDrawRange(
          0,
          quality === "low" || mobile ? 48 : 96,
        );
    },
  };
}

let mist;
function mistTexture() {
  if (mist) return mist.clone();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d"),
    gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,.45)");
  gradient.addColorStop(0.35, "rgba(255,255,255,.24)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  mist = new T.CanvasTexture(canvas);
  return mist.clone();
}
