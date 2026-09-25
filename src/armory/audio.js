// Weapon sound on the game's Web Audio graph. Each shot layers a CC0
// recording (built by scripts/armory/build-sounds.mjs) with a synthesized
// sub-bass punch and a send into the venue's reverb: an impulse response
// generated for the stone nave, the steel hangar or the flooded vault.
// Mechanical cues (magazines, slides, pumps, bolts, brass) follow the
// view-model's keyframes. Until the bank is decoded, Sound keeps its
// synthesized fallback.

const BANK_URL = "/audio/armory/manifest.json";

/** Layering per weapon: recording gain, sub thump (Hz, gain), reverb send. */
const SHOT = {
  vigil: { gain: 0.95, sub: [92, 0.22], send: 0.24, casing: "brass" },
  spectre: { gain: 0.78, sub: [84, 0.15], send: 0.18, casing: "brass" },
  marauder: { gain: 0.92, sub: [68, 0.26], send: 0.24, casing: "brass" },
  requiem: { gain: 1.0, sub: [52, 0.4], send: 0.32, casing: null },
  longinus: { gain: 1.0, sub: [44, 0.46], send: 0.42, casing: null },
  eclipse: {
    gain: 0.8,
    sub: [58, 0.2],
    send: 0.34,
    casing: null,
    energy: true,
  },
};

/** Reload and action cues -> bank category (per weapon when it differs). */
const CUES = {
  magout: "magout",
  magin: "magin",
  charge: "charge",
  pumpback: "pump",
  boltup: "bolt",
  shell: "shell",
  cloth: "raise",
  raise: "raise",
  aim: "raise",
  dryfire: "dryfire",
};
const RELEASE = {
  vigil: "slide",
  spectre: "charge",
  marauder: "charge",
  longinus: "charge",
};

/** Venue reverbs: seconds, decay rate, brightness (0 dark .. 1 bright). */
const ROOMS = {
  abbey: {
    seconds: 3.4,
    decay: 2.2,
    tone: 0.55,
    wet: 0.5,
    early: [0.021, 0.037, 0.054, 0.071],
  },
  station: {
    seconds: 2.2,
    decay: 3.2,
    tone: 0.75,
    wet: 0.42,
    early: [0.012, 0.019, 0.033, 0.047],
  },
  abyss: {
    seconds: 2.8,
    decay: 2.6,
    tone: 0.28,
    wet: 0.55,
    early: [0.017, 0.031, 0.045],
  },
};

export class WeaponAudio {
  constructor(sound, mobile = false) {
    this.sound = sound;
    this.mobile = mobile;
    this.buffers = new Map();
    this.last = new Map();
    this.ready = false;
    this.room = null;
    this.brassAt = 0;
  }
  get ctx() {
    return this.sound.ctx;
  }
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const manifest = await fetch(BANK_URL).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${BANK_URL}`);
        return r.json();
      });
      const base = BANK_URL.slice(0, BANK_URL.lastIndexOf("/") + 1);
      const jobs = [];
      for (const [category, files] of Object.entries(manifest.categories)) {
        this.buffers.set(category, []);
        for (const f of files) jobs.push([category, base + f.file]);
      }
      let index = 0;
      const worker = async () => {
        while (index < jobs.length) {
          const [category, url] = jobs[index++];
          try {
            const data = await fetch(url).then((r) => r.arrayBuffer());
            this.buffers
              .get(category)
              .push(await this.ctx.decodeAudioData(data));
          } catch (error) {
            console.warn("Weapon sound unavailable", url, error);
          }
        }
      };
      await Promise.all(Array.from({ length: this.mobile ? 3 : 6 }, worker));
      this.output = this.ctx.createGain();
      this.output.gain.value = 1;
      this.output.connect(this.sound.master);
      this.ready = true;
      if (this.pendingRoom) this.setRoom(this.pendingRoom);
    })();
    return this.loading;
  }

  /** Builds the venue's reverb once per map. */
  setRoom(map) {
    if (!this.ready) {
      this.pendingRoom = map;
      return;
    }
    if (this.roomName === map) return;
    this.roomName = map;
    const spec = ROOMS[map] || ROOMS.abbey;
    const ctx = this.ctx;
    this.reverb?.disconnect();
    this.wet?.disconnect();
    const rate = ctx.sampleRate;
    const length = Math.floor(spec.seconds * rate);
    const ir = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      let low = 0;
      const k = 0.08 + spec.tone * 0.6;
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        const noise = Math.random() * 2 - 1;
        // Darkens as it decays: high frequencies die first in stone.
        low += (noise - low) * (k * Math.exp(-t * 0.9));
        data[i] = low * Math.exp(-t * spec.decay) * (t < 0.004 ? t / 0.004 : 1);
      }
      for (const [j, e] of spec.early.entries()) {
        const at = Math.floor((e + ch * 0.0031 * (j + 1)) * rate);
        if (at < length) data[at] += (0.55 - j * 0.1) * (ch ? -1 : 1);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = spec.wet;
    this.reverb.connect(this.wet);
    this.wet.connect(this.output);
  }

  pick(category) {
    const list = this.buffers.get(category);
    if (!list?.length) return null;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.last.get(category))
      i = (i + 1) % list.length;
    this.last.set(category, i);
    return list[i];
  }

  play(
    buffer,
    {
      gain = 1,
      rate = 1,
      pan = 0,
      delay = 0,
      send = 0,
      lowpass = 0,
      highpass = 0,
    } = {},
  ) {
    if (!buffer) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    let node = src;
    const chain = [src];
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lowpass;
      node.connect(f);
      node = f;
      chain.push(f);
    }
    if (highpass) {
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = highpass;
      node.connect(f);
      node = f;
      chain.push(f);
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(g);
    g.connect(p);
    p.connect(this.output);
    chain.push(g, p);
    if (send > 0 && this.reverb) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(this.reverb);
      chain.push(s);
    }
    src.onended = () => chain.forEach((n) => n.disconnect());
    src.start(t);
  }

  /** Sub-bass punch under the recording: the chest hit of a real shot. */
  thump(freq, gain, delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(this.output);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    o.start(t);
    o.stop(t + 0.22);
  }

  /** Transfiguration: a ringing, pitched shimmer over the report. */
  arcane(level, delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const base = [0, 330, 262, 196][Math.min(3, level)] || 330;
    for (const [mult, gain] of [
      [1, 0.05],
      [2.01, 0.03],
      [3.02, 0.015],
    ]) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(base * mult * 1.12, t);
      o.frequency.exponentialRampToValueAtTime(base * mult, t + 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g);
      g.connect(this.output);
      if (this.reverb) g.connect(this.reverb);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
      o.start(t);
      o.stop(t + 0.62);
    }
  }

  /** A shot. remote: a teammate's report, filtered by distance. */
  shot(
    id,
    { level = 0, aimed = false, distance = 0, pan = 0, remote = false } = {},
  ) {
    const spec = SHOT[id] || SHOT.marauder;
    const drift = 0.97 + Math.random() * 0.06 - (level ? 0.04 : 0);
    const far = remote ? Math.min(1, distance / 40) : 0;
    this.play(this.pick(`shot_${id}`) || this.pick("shot_marauder"), {
      gain:
        spec.gain * (remote ? 0.55 * (1 - far * 0.7) : 1) * (aimed ? 0.96 : 1),
      rate: drift,
      pan,
      send: spec.send * (remote ? 1.4 : 1),
      lowpass: remote ? 9000 - far * 7000 : 0,
    });
    if (!remote) {
      this.thump(spec.sub[0] * drift, spec.sub[1]);
      if (level) this.arcane(level);
      if (spec.casing && performance.now() > this.brassAt) {
        this.brassAt = performance.now() + 110;
        this.casing("brass", 0.42 + Math.random() * 0.25);
      }
    }
  }

  /** Spent brass or hulls landing on the floor. */
  casing(kind = "brass", delay = 0.5) {
    this.play(this.pick(kind === "hull" ? "hulls" : "brass"), {
      gain: kind === "hull" ? 0.45 : 0.6,
      rate: 0.92 + Math.random() * 0.2,
      pan: 0.25 + Math.random() * 0.3,
      delay,
      send: 0.12,
      highpass: 300,
    });
  }

  cue(name, id) {
    if (name === "eject") {
      this.casing(id === "requiem" ? "hull" : "brass", 0.45);
      return true;
    }
    let category = name === "release" ? RELEASE[id] : CUES[name];
    if (id === "eclipse" && (name === "magin" || name === "release"))
      category = "energy";
    if (id === "eclipse" && name === "magout") category = "dryfire";
    if (!category) return false;
    const quiet = name === "aim" ? 0.3 : category === "raise" ? 0.55 : 1;
    this.play(this.pick(category), {
      gain: quiet * (category === "energy" ? 0.7 : 1),
      rate: 0.97 + Math.random() * 0.06,
      pan: name === "magout" || name === "magin" ? -0.12 : 0.1,
      send: 0.08,
    });
    return true;
  }
}
