import * as T from "three";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";

export class WorldOcclusionPass extends GTAOPass {
  _renderOverride(renderer, ...args) {
    // The beauty pass has just updated the same scene and camera. AO changes
    // visibility/materials only; a second full transform traversal is redundant.
    const autoUpdate = this.scene.matrixWorldAutoUpdate;
    this.scene.matrixWorldAutoUpdate = false;
    try {
      return super._renderOverride(renderer, ...args);
    } finally {
      this.scene.matrixWorldAutoUpdate = autoUpdate;
    }
  }
  _overrideVisibility() {
    super._overrideVisibility();
    // GTAOPass r185 excludes points/lines, but treats glow sprites, mist and
    // glass as solid rectangles in its normal buffer. Exclude only those from
    // AO; its inherited restore puts them back before the beauty composite.
    this.scene.traverse((o) => {
      if (
        o.visible &&
        (o.isSprite || (o.material?.transparent && !o.material.depthWrite))
      ) {
        o.visible = false;
        this._visibilityCache.push(o);
      }
    });
  }
}

export class ContactShadows {
  constructor(scene) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const c = canvas.getContext("2d"),
      gradient = c.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, "rgba(255,255,255,.65)");
    gradient.addColorStop(0.45, "rgba(255,255,255,.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 64, 64);
    this.texture = new T.CanvasTexture(canvas);
    this.mesh = new T.InstancedMesh(
      new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({
        map: this.texture,
        color: 0x030504,
        transparent: true,
        depthWrite: false,
      }),
      64,
    );
    this.mesh.name = "enemy-contact-shadows";
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.dummy = new T.Object3D();
    this.scene = scene;
    scene.add(this.mesh);
  }
  update(enemies) {
    let i = 0;
    for (const e of enemies) {
      if (i === 64) break;
      if (e.model.position.y < -0.15) continue;
      this.dummy.position.set(e.model.position.x, 0.024, e.model.position.z);
      this.dummy.rotation.set(-Math.PI / 2, 0, -e.model.rotation.y);
      const s = e.model.scale.y;
      this.dummy.scale.set(
        s * (e.dead ? 1.35 : 0.85),
        s * (e.dead ? 1.6 : 0.62),
        1,
      );
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i++, this.dummy.matrix);
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}

// A map-local radiance probe is captured once during loading so architectural
// PBR surfaces reflect the actual building. View models use their own lighting.
// No second scene render is added to the gameplay frame.
export function captureEnvironment(renderer, scene, world, mobile) {
  const cube = new T.WebGLCubeRenderTarget(mobile ? 128 : 256, {
    type: T.HalfFloatType,
    generateMipmaps: true,
    minFilter: T.LinearMipmapLinearFilter,
  });
  const camera = new T.CubeCamera(0.2, 145, cube);
  camera.position.set(0, 3.3, world.id === "abyss" ? 8 : 10);
  const previous = scene.environment,
    intensity = scene.environmentIntensity;
  const shadowUpdate = renderer.shadowMap.autoUpdate;
  const generator = new T.PMREMGenerator(renderer);
  try {
    // The existing studio radiance is only a weak bounce during probe capture.
    scene.environmentIntensity = 0.18;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    camera.update(renderer, scene);
    return generator.fromCubemap(cube.texture);
  } finally {
    scene.environment = previous;
    scene.environmentIntensity = intensity;
    renderer.shadowMap.autoUpdate = shadowUpdate;
    renderer.shadowMap.needsUpdate = true;
    cube.dispose();
    generator.dispose();
  }
}

export const cinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    hurt: { value: 0 },
    cold: { value: 0 },
    texel: { value: new T.Vector2(1, 1) },
    sharpen: { value: 0.2 },
  },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  // Edge-limited sharpening restores scan detail after FXAA without bright
  // ringing. No depth of field or motion blur obscures targets or costs frames.
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 texel;
    uniform float time,hurt,cold,sharpen; varying vec2 vUv;
    void main(){
      vec3 c=texture2D(tDiffuse,vUv).rgb;
      vec3 n=texture2D(tDiffuse,vUv+vec2(0.,texel.y)).rgb;
      vec3 s=texture2D(tDiffuse,vUv-vec2(0.,texel.y)).rgb;
      vec3 e=texture2D(tDiffuse,vUv+vec2(texel.x,0.)).rgb;
      vec3 w=texture2D(tDiffuse,vUv-vec2(texel.x,0.)).rgb;
      vec3 lo=min(c,min(min(n,s),min(e,w))),hi=max(c,max(max(n,s),max(e,w)));
      c=clamp(c+(c-(n+s+e+w)*.25)*sharpen,lo,hi);
      float l=dot(c,vec3(.2126,.7152,.0722));
      c=mix(vec3(l),c,.95);
      c*=mix(vec3(.935,1.012,1.037),vec3(1.039,1.014,.961),smoothstep(.08,.8,l));
      c*=mix(vec3(1.),vec3(.965,1.012,1.025),cold);
      float vignette=smoothstep(.25,.77,length((vUv-.5)*vec2(1.,.86)));
      c*=1.-vignette*.15;
      float grain=fract(sin(dot(gl_FragCoord.xy+mod(time,1000.),vec2(12.9898,78.233)))*43758.5453)-.5;
      c+=grain*.0035;
      c=mix(c,vec3(.36,.027,.018),hurt*vignette*.72);
      gl_FragColor=vec4(max(c,0.),1.);
    }
  `,
};
