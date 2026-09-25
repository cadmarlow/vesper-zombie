import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { cinematicShader, WorldOcclusionPass } from "../rendering.js";
import { knifeModel } from "../assets.js";
import { disposeModel } from "../resources.js";
export class Presentation {
  constructor(canvas, run) {
    this.run = run;
    this.canvas = canvas;
    this.gunCache = new Map();
    this.fps = 60;
    this.mobileResolutionScale = 1;
    this.desktopResolutionScale = 1;
    this.resolutionRecovery = 0;
    this.adaptiveOcclusionOff = false;
    this.mobileFrameMs = 16.7;
    this.resolutionTimer = 0;
    // Every frame goes through the composer's own render targets and ends in
    // a full-screen quad, so a multisampled canvas only adds a resolve per
    // frame. Anti-aliasing comes from the FXAA pass.
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setClearColor(0x111d25);
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, 0.045);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 0.38;
    room.dispose();
    pmrem.dispose();
    this.camera = new T.PerspectiveCamera(this.run.settings.fov, 1, 0.08, 160);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.viewScene = new T.Scene();
    this.viewScene.environment = this.environmentTarget.texture;
    this.viewScene.environmentIntensity = 0.52;
    this.viewCamera = new T.PerspectiveCamera(62, 1, 0.01, 10);
    this.weaponAmbient = new T.HemisphereLight(0xc4dae7, 0x242929, 1.65);
    this.viewScene.add(this.weaponAmbient);
    const key = new T.DirectionalLight(0xdce7ea, 2.1);
    key.position.set(-2, 3, -1);
    this.viewScene.add(key);
    this.weaponKey = key;
    const rim = new T.DirectionalLight(0x779ea8, 1.5);
    rim.position.set(2, 0, 1);
    this.viewScene.add(rim);
    this.weaponRim = rim;
    this.weaponBounce = new T.PointLight(0xffbb77, 0, 5, 1.5);
    this.weaponBounce.position.set(-0.7, 0.2, -1.3);
    this.viewScene.add(this.weaponBounce);
    this.knife = knifeModel();
    this.viewScene.add(this.knife);
    this.knifeTrail = new T.Mesh(
      new T.RingGeometry(0.25, 0.27, 32, 1, 0.2, 1.9),
      new T.MeshBasicMaterial({
        color: 0xe8e9ce,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
      }),
    );
    this.knifeTrail.position.set(0, -0.01, -0.7);
    this.viewScene.add(this.knifeTrail);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new WorldOcclusionPass(this.scene, this.camera, 1, 1);
    this.ao.blendIntensity = 1.1;
    this.ao.updateGtaoMaterial({
      radius: 0.48,
      distanceExponent: 1.5,
      thickness: 0.8,
      samples: 8,
    });
    this.ao.updatePdMaterial({
      lumaPhi: 5,
      depthPhi: 2,
      normalPhi: 3,
      radius: 4,
      samples: 8,
    });
    this.composer.addPass(this.ao);
    // First-person models go through the same exposure, bloom and grading.
    this.viewPass = new RenderPass(this.viewScene, this.viewCamera);
    this.viewPass.clear = false;
    this.viewPass.clearDepth = true;
    this.composer.addPass(this.viewPass);
    this.bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.23, 0.45, 1.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.antialias = new ShaderPass(FXAAShader);
    this.composer.addPass(this.antialias);
    this.film = new ShaderPass(cinematicShader);
    this.composer.addPass(this.film);
    this.flash = new T.PointLight(0xffb260, 0, 8, 1);
    this.scene.add(this.flash);
    this.flashlight = new T.SpotLight(0xd5e8e3, 18, 23, 0.5, 0.65, 1.7);
    this.scene.add(this.flashlight, this.flashlight.target);
    this.flashlight.visible = true;
  }
  resize() {
    this.needsRender = true;
    const w = innerWidth,
      h = window.visualViewport?.height || innerHeight;
    const cap = this.run.touch
      ? this.run.settings.quality === "high"
        ? 2
        : this.run.settings.quality === "medium"
          ? 1.5
          : 1
      : this.run.settings.quality === "high"
        ? 1.65
        : this.run.settings.quality === "medium"
          ? 1.15
          : 1;
    const budget = this.run.settings.quality === "high" ? 1600000 : 1000000;
    const nativeRatio = Math.min(
      devicePixelRatio,
      cap,
      Math.sqrt((this.run.touch ? budget : 2600000) / (w * h)),
    );
    const ratio = Math.max(
      Math.min(nativeRatio, 0.75),
      nativeRatio *
        (this.run.touch
          ? this.mobileResolutionScale
          : this.desktopResolutionScale),
    );
    const composerRatio = ratio;
    const previous = this.renderSize;
    // Browser bars can emit both viewport and window resize events. Avoid
    // allocating the same render targets twice for one viewport change.
    if (!previous || previous.ratio !== ratio)
      this.renderer.setPixelRatio(ratio);
    if (!previous || previous.w !== w || previous.h !== h)
      this.renderer.setSize(w, h);
    // The composer otherwise stays at 1× and stretches the world on Retina screens.
    if (!previous || previous.composerRatio !== composerRatio)
      this.composer.setPixelRatio(composerRatio);
    if (!previous || previous.w !== w || previous.h !== h)
      this.composer.setSize(w, h);
    this.renderSize = { w, h, ratio, composerRatio };
    this.antialias.uniforms.resolution.value.set(
      1 / (w * ratio),
      1 / (h * ratio),
    );
    this.film.uniforms.texel.value.copy(
      this.antialias.uniforms.resolution.value,
    );
    this.ao.enabled =
      !this.run.touch &&
      this.run.settings.quality === "high" &&
      !this.adaptiveOcclusionOff;
    this.ao.setSize(
      Math.max(1, Math.floor(w * ratio * 0.5)),
      Math.max(1, Math.floor(h * ratio * 0.5)),
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.fov = this.run.touch ? 58 : 62;
    this.viewCamera.updateProjectionMatrix();
    this.bloom.enabled = this.run.settings.quality !== "low";
  }
  dispose() {
    this.viewEffects?.dispose();
    this.viewModel?.dispose();
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
    disposeModel(this.knife);
    disposeModel(this.knifeTrail);
    this.environmentTarget.dispose();
    this.renderer.dispose();
  }
}
