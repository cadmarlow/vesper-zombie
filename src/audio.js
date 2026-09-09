// Original real-time sound design. No remote media or copyrighted sound samples.
import { Score } from "./music.js";
export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.65;
    this.stepIndex = 0;
  }
  async init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.score = new Score(this.ctx, this.master);
      const length = this.ctx.sampleRate * 4;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.ambient();
      // The drone and reverb otherwise keep the audio thread busy while the
      // tab is hidden; the music bus already mutes itself there.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.ctx.suspend().catch(() => {});
        else this.ctx.resume().catch(() => {});
      });
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }
  setVolume(v) {
    this.volume = v;
    if (this.master)
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
  setMusicVolume(v) {
    this.musicVolume = v;
    this.score?.setVolume(v);
  }
  music(state) {
    if (!this.score) return;
    this.score.setVolume(this.musicVolume ?? 0.75);
    this.score.tick(state);
  }
  tone(
    freq,
    duration = 0.2,
    volume = 0.15,
    type = "sine",
    endFreq = 0,
    delay = 0,
  ) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq)
      o.frequency.exponentialRampToValueAtTime(
        Math.max(10, endFreq),
        t + duration,
      );
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.master);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    o.start(t);
    o.stop(t + duration + 0.02);
  }
  noise(duration = 0.15, volume = 0.2, cutoff = 1500, delay = 0, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay,
      s = this.ctx.createBufferSource(),
      f = this.ctx.createBiquadFilter(),
      g = this.ctx.createGain(),
      p = this.ctx.createStereoPanner();
    s.buffer = this.noiseBuffer;
    // Long swells (wave call, generator) outlast the random offset: loop.
    s.loop = true;
    f.type = "lowpass";
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    p.pan.value = pan;
    s.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(this.master);
    s.onended = () => {
      s.disconnect();
      f.disconnect();
      g.disconnect();
      p.disconnect();
    };
    s.start(t, Math.random() * 2);
    s.stop(t + duration);
  }
  ambient() {
    const ctx = this.ctx;
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.5;
    this.ambience.connect(this.master);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = [36.7, 55.1, 73.6][i];
      g.gain.value = 0.027;
      o.connect(g);
      g.connect(this.ambience);
      o.start();
    }
    const s = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter();
    s.buffer = this.noiseBuffer;
    s.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 280;
    const g = ctx.createGain();
    g.gain.value = 0.09;
    s.connect(filter);
    filter.connect(g);
    g.connect(this.ambience);
    s.start();
  }
  shot(def) {
    this.noise(0.15 + def.recoil, 0.28, def.energy ? 3300 : 1900);
    this.tone(def.sound, 0.19, 0.32, "triangle", 35);
    this.noise(0.24, 0.1, 800, 0.055);
    if (def.energy) {
      this.tone(970, 0.28, 0.12, "sawtooth", 130);
      this.tone(1440, 0.3, 0.07, "sine", 480);
    } else this.tone(2100, 0.035, 0.065, "square", 1300);
  }
  step(sprint, crouch = false) {
    this.noise(
      0.065,
      crouch ? 0.025 : sprint ? 0.13 : 0.057,
      450,
      0,
      this.stepIndex++ % 2 ? 0.25 : -0.25,
    );
    this.tone(70, 0.08, 0.035, "sine", 35);
  }
  hit(head = false) {
    this.noise(0.07, 0.07, 2800);
    this.tone(head ? 1400 : 850, 0.065, 0.05, "triangle", 450);
  }
  flesh(headKill = false) {
    this.noise(
      headKill ? 0.18 : 0.075,
      headKill ? 0.12 : 0.045,
      headKill ? 1050 : 720,
    );
    this.tone(
      headKill ? 110 : 150,
      headKill ? 0.12 : 0.06,
      headKill ? 0.09 : 0.025,
      "triangle",
      38,
    );
    if (headKill) this.noise(0.055, 0.065, 2400, 0.025);
  }
  hurt() {
    this.noise(0.28, 0.26, 380);
    this.tone(65, 0.27, 0.26, "sine", 29);
  }
  reload(duration) {
    this.noise(0.06, 0.14, 2600);
    this.tone(350, 0.06, 0.04, "square", 120);
    this.noise(0.08, 0.14, 2200, duration * 0.65);
    this.noise(0.09, 0.18, 3100, duration * 0.9);
  }
  wave() {
    for (let i = 0; i < 4; i++)
      this.tone(
        [73.4, 110, 146.8, 155.5][i],
        2.5,
        0.085,
        "triangle",
        0,
        i * 0.14,
      );
    this.noise(2, 0.11, 220);
  }
  purchase() {
    [440, 554, 660].forEach((f, i) =>
      this.tone(f, 0.25, 0.08, "sine", 0, i * 0.09),
    );
  }
  box() {
    for (let i = 0; i < 16; i++)
      this.tone(
        260 + Math.sin(i * 2.5) * 120 + i * 24,
        0.12,
        0.05,
        "triangle",
        0,
        i * 0.17,
      );
  }
  pickup() {
    this.tone(650, 0.12, 0.08);
    this.tone(980, 0.23, 0.06, "sine", 0, 0.1);
  }
  explosion() {
    this.noise(0.85, 0.6, 700);
    this.tone(85, 0.8, 0.55, "sine", 22);
    this.noise(0.3, 0.3, 3500);
  }
  melee() {
    this.noise(0.12, 0.06, 3300);
    this.tone(1700, 0.11, 0.025, "triangle", 700);
  }
  knifeSwing() {
    this.noise(0.18, 0.24, 3100, 0, -0.4);
    this.noise(0.12, 0.12, 1500, 0.045, 0.35);
  }
  knifeImpact(wall = false) {
    this.noise(wall ? 0.1 : 0.16, 0.3, wall ? 4800 : 850);
    this.tone(wall ? 2100 : 115, 0.14, 0.14, "triangle", wall ? 850 : 38);
  }
  powerOn() {
    this.noise(0.18, 0.35, 1900);
    this.tone(32, 2.6, 0.22, "sawtooth", 110);
    for (let i = 0; i < 4; i++) {
      this.noise(0.1, 0.13, 2400, 0.35 + i * 0.6);
      this.tone(73.4 * (i + 1), 2.2, 0.1, "triangle", 0, 0.8 + i * 0.45);
    }
    this.noise(2.2, 0.18, 180, 1.5);
  }
  click() {
    this.tone(700, 0.025, 0.035, "sine", 400);
  }
  growl(distance, pan, type) {
    const v = Math.max(0, 1 - distance / 27) * 0.07;
    if (!v) return;
    this.noise(0.55, v, 250 + Math.random() * 250, 0, pan);
    this.tone(type === "brute" ? 38 : 63, 0.55, v, "sawtooth", 30);
  }
  death() {
    this.tone(110, 2.6, 0.22, "sawtooth", 28);
    this.noise(2, 0.16, 500);
  }
}
