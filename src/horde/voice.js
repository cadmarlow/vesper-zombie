import { ENEMIES } from "../content/enemies.js";
import { hordeRandom } from "../content/horde.js";

// Positional zombie audio on the game's Web Audio graph: recorded CC0
// vocals, footsteps, impacts and a distant horde bed. Every body has its own
// voice pitch; a small pool of voices is shared by the whole horde and the
// quietest/least important sound is stolen first.

const BANK_URL = "/audio/horde/manifest.json";
let active = null;
/** Animation and combat code report events here; no-op until audio loads. */
export function hordeEvent(model, kind, info) {
  active?.event(model, kind, info);
}

/** Recordings kept per category on phones. */
const MOBILE_VARIANTS = 6;
const PRIORITY = {
  scream: 5,
  roar: 5,
  death: 4,
  pain: 4,
  flesh: 4,
  gore: 5,
  fall: 3,
  growl: 3,
  vomit: 3,
  female: 3,
  whoosh: 3,
  eat: 2,
  moan: 2,
  dirt: 2,
  breath: 1,
  step: 1,
  run: 1,
};

export class HordeAudio {
  constructor(sound, mobile = false) {
    this.sound = sound;
    this.mobile = mobile;
    this.buffers = new Map();
    this.voices = [];
    this.maxVoices = mobile ? 10 : 18;
    this.ready = false;
    this.beds = [];
    this.bedLevel = 0;
    this.lastPlayed = new Map();
    this.bodies = new WeakMap();
  }
  get ctx() {
    return this.sound.ctx;
  }
  async load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const manifest = await fetch(BANK_URL).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${BANK_URL}`);
        return r.json();
      });
      const jobs = [];
      const base = BANK_URL.slice(0, BANK_URL.lastIndexOf("/") + 1);
      // Decoded sound is ~4 bytes per sample: phones keep an even spread of
      // each category (about half the bank) and two ambience layers.
      const spread = (files, count) =>
        !this.mobile || files.length <= count
          ? files
          : Array.from(
              { length: count },
              (_, i) => files[Math.floor((i * files.length) / count)],
            );
      for (const [category, files] of Object.entries(manifest.categories)) {
        this.buffers.set(category, []);
        for (const f of spread(files, MOBILE_VARIANTS))
          jobs.push([category, base + f.file]);
      }
      this.bedBuffers = [];
      for (const f of spread(manifest.beds?.horde || [], 2))
        jobs.push(["__bed", base + f.file]);
      // A few requests at a time: phones must not stall the loader.
      let index = 0;
      const worker = async () => {
        while (index < jobs.length) {
          const [category, url] = jobs[index++];
          try {
            const data = await fetch(url).then((r) => r.arrayBuffer());
            const buffer = await this.ctx.decodeAudioData(data);
            if (category === "__bed") this.bedBuffers.push(buffer);
            else this.buffers.get(category).push(buffer);
          } catch (error) {
            console.warn("Horde sound unavailable", url, error);
          }
        }
      };
      await Promise.all(Array.from({ length: this.mobile ? 3 : 6 }, worker));
      this.ready = true;
      active = this;
    })();
    return this.loading;
  }
  attach(run, camera) {
    this.run = run;
    this.camera = camera;
    active = this.ready ? this : null;
    if (this.ready) this.startBed();
  }
  detach() {
    if (active === this) active = null;
    for (const v of this.voices) this.stopVoice(v);
    this.voices = [];
    for (const b of this.beds) {
      try {
        b.source.stop();
      } catch {}
      b.source.disconnect();
      b.gain.disconnect();
    }
    this.beds = [];
    this.run = null;
  }

  // ---- playback -------------------------------------------------------------
  pick(category, seed) {
    const list = this.buffers.get(category);
    if (!list?.length) return null;
    // Avoid repeating the last sample of a category.
    let i = Math.floor(((seed ?? Math.random()) * 9973) % list.length);
    if (list.length > 1 && i === this.lastPlayed.get(category))
      i = (i + 1) % list.length;
    this.lastPlayed.set(category, i);
    return list[i];
  }
  voiceOf(model) {
    let v = this.bodies.get(model);
    if (!v) {
      const seed = model.userData.horde?.seed ?? 1;
      const type = model.userData.type;
      const female = /-f\d|nurse|f12|f08|f04/.test(
        model.userData.horde?.pack?.id || "",
      );
      const heavy = ENEMIES[type]?.boss || type === "brute";
      v = {
        seed,
        female,
        rate:
          (heavy ? 0.78 : type === "runner" ? 1.06 : 0.92) +
          hordeRandom(seed, 81) * 0.16,
        nextVocal: 1 + hordeRandom(seed, 82) * 4,
        lastPain: -10,
        stepIndex: 0,
      };
      this.bodies.set(model, v);
    }
    return v;
  }
  play(
    category,
    { position, gain = 1, rate = 1, owner = null, delay = 0 } = {},
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.ready || !this.run) return null;
    const buffer = this.pick(category);
    if (!buffer) return null;
    const listener = this.camera?.position;
    const distance = position && listener ? position.distanceTo(listener) : 0;
    if (distance > 45) return null;
    const priority = (PRIORITY[category] ?? 1) - distance / 12;
    if (this.voices.length >= this.maxVoices) {
      let weakest = null;
      for (const v of this.voices)
        if (!weakest || v.priority < weakest.priority) weakest = v;
      if (!weakest || weakest.priority > priority) return null;
      this.stopVoice(weakest);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
    const out = ctx.createGain();
    out.gain.value = gain;
    let node = source;
    let panner = null,
      filter = null;
    if (position) {
      // Air absorption: distant voices lose their top end.
      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 18000 / (1 + distance * 0.18);
      panner = ctx.createPanner();
      panner.panningModel = this.mobile ? "equalpower" : "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 2.2;
      panner.rolloffFactor = 1.05;
      panner.maxDistance = 60;
      setPosition(panner, position);
      node.connect(filter);
      filter.connect(panner);
      node = panner;
    }
    node.connect(out);
    out.connect(this.sound.master);
    const when = ctx.currentTime + delay;
    source.start(when);
    const voice = {
      source,
      out,
      panner,
      filter,
      priority,
      owner,
      category,
      ends: when + buffer.duration / source.playbackRate.value,
    };
    source.onended = () => {
      this.stopVoice(voice, false);
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    };
    this.voices.push(voice);
    return voice;
  }
  stopVoice(voice, stop = true) {
    if (stop)
      try {
        voice.source.stop();
      } catch {}
    voice.source.disconnect();
    voice.filter?.disconnect();
    voice.panner?.disconnect();
    voice.out.disconnect();
    if (stop) {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    }
  }
  vocal(model, category, gain = 1, delay = 0) {
    const v = this.voiceOf(model);
    let cat = category;
    if (v.female && ["moan", "growl", "pain"].includes(category))
      cat = "female";
    const head = model.userData.head;
    const position = head
      ? head.getWorldPosition(this.tmp || (this.tmp = model.position.clone()))
      : model.position;
    return this.play(cat, {
      position: position.clone(),
      gain,
      rate: v.rate * (v.female && cat !== "female" ? 1.18 : 1),
      owner: model,
      delay,
    });
  }

  // ---- events from animation and combat --------------------------------------
  event(model, kind, info = {}) {
    if (!this.run || !model?.userData?.horde) return;
    const v = this.voiceOf(model);
    const type = model.userData.type;
    const t = this.run.time;
    switch (kind) {
      case "emerge":
        this.play("dirt", { position: model.position.clone(), gain: 0.9 });
        this.vocal(
          model,
          type === "brute" || ENEMIES[type]?.boss ? "roar" : "growl",
          0.9,
          0.45,
        );
        v.nextVocal = t + 2 + Math.random() * 3;
        break;
      case "attack":
        if (Math.random() < (type === "runner" ? 0.85 : 0.65))
          this.vocal(
            model,
            type === "brute" || ENEMIES[type]?.boss ? "roar" : "scream",
            1,
          );
        v.nextVocal = t + 1.5 + Math.random() * 2;
        break;
      case "swing":
        this.play("whoosh", {
          position: model.position.clone().setY(1.3),
          gain: 0.8,
          rate: 0.9 + Math.random() * 0.2,
        });
        break;
      case "pain":
        if (t - v.lastPain > 0.45 && Math.random() < 0.8) {
          v.lastPain = t;
          this.vocal(model, "pain", 0.95);
        }
        break;
      case "death":
        this.vocal(model, "death", 1);
        this.play("fall", {
          position: model.position.clone(),
          gain: 0.9,
          delay: info.fallDelay ?? 0.75,
        });
        break;
      case "headshot":
        this.play("gore", {
          position: (info.position || model.position).clone(),
          gain: 1,
        });
        break;
      case "flesh":
        this.play("flesh", {
          position: (info.position || model.position).clone(),
          gain: 0.75,
        });
        break;
      case "spit":
        this.vocal(model, "vomit", 1);
        break;
      case "land":
        this.play("fall", {
          position: model.position.clone(),
          gain: 0.45,
          rate: 1.15 + Math.random() * 0.15,
        });
        break;
      case "sever":
        // Without its jaw the voice sinks into a gurgle.
        if (info.jaw) v.rate *= 0.8;
        // An arm torn off: wet burst and a shriek, no fall.
        this.play("gore", {
          position: model.position.clone().setY(1.3),
          gain: 1,
          rate: 0.95,
        });
        if (t - v.lastPain > 0.2) {
          v.lastPain = t;
          this.vocal(model, "scream", 1, 0.05);
        }
        v.nextVocal = t + 1.5 + Math.random() * 2;
        break;
      case "dismember":
        // Legs torn off: wet burst, a shriek, the body slapping the floor.
        this.play("gore", {
          position: model.position.clone().setY(0.45),
          gain: 1,
          rate: 0.85,
        });
        this.vocal(model, "scream", 1, 0.08);
        this.play("fall", {
          position: model.position.clone(),
          gain: 0.85,
          delay: 0.32,
        });
        v.nextVocal = t + 1.8 + Math.random() * 2;
        break;
      case "step": {
        const d = this.camera
          ? model.position.distanceTo(this.camera.position)
          : 0;
        if (d > 13) return;
        if (info.crawling) {
          // Palms and stumps dragging over the floor.
          this.play("step", {
            position: model.position.clone(),
            gain: 0.3,
            rate: 1.15 + hordeRandom(v.seed, 90 + (v.stepIndex++ % 7)) * 0.2,
          });
          break;
        }
        const running = info.running;
        const heavy = type === "brute" || ENEMIES[type]?.boss;
        this.play(running ? "run" : "step", {
          position: model.position.clone(),
          gain: (heavy ? 1 : 0.5) * (running ? 0.9 : 0.75),
          rate: heavy
            ? 0.72
            : 0.9 + hordeRandom(v.seed, 90 + (v.stepIndex++ % 7)) * 0.2,
        });
        break;
      }
    }
  }

  // ---- per frame ------------------------------------------------------------------
  update(enemies, dt) {
    if (!this.ready || !this.run || !this.camera) return;
    const ctx = this.ctx;
    const l = ctx.listener;
    const cam = this.camera;
    const f = cam.getWorldDirection(
      this.forward || (this.forward = cam.position.clone()),
    );
    if (l.positionX) {
      const at = ctx.currentTime;
      l.positionX.setValueAtTime(cam.position.x, at);
      l.positionY.setValueAtTime(cam.position.y, at);
      l.positionZ.setValueAtTime(cam.position.z, at);
      l.forwardX.setValueAtTime(f.x, at);
      l.forwardY.setValueAtTime(f.y, at);
      l.forwardZ.setValueAtTime(f.z, at);
      l.upX.setValueAtTime(0, at);
      l.upY.setValueAtTime(1, at);
      l.upZ.setValueAtTime(0, at);
    } else {
      l.setPosition(cam.position.x, cam.position.y, cam.position.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
    // Voices follow their bodies.
    for (const voice of this.voices) {
      if (!voice.owner || !voice.panner) continue;
      const head = voice.owner.userData.head;
      if (head)
        setPosition(
          voice.panner,
          head.getWorldPosition(
            this.tmp2 || (this.tmp2 = cam.position.clone()),
          ),
        );
    }
    // Ambient vocals: moans at a distance, growls and breathing up close.
    const t = this.run.time;
    let near = 0;
    for (const e of enemies) {
      const model = e.model;
      if (!model.userData.horde || e.dead || model.position.y < -0.3) continue;
      const d = model.position.distanceTo(cam.position);
      if (d < 26) near++;
      const v = this.voiceOf(model);
      if (t < v.nextVocal) continue;
      const type = e.type;
      let category;
      if (d < 3.5) category = Math.random() < 0.5 ? "breath" : "growl";
      else if (d < 11)
        category =
          type === "runner" && Math.random() < 0.5
            ? "scream"
            : Math.random() < 0.6
              ? "growl"
              : "moan";
      else
        category = type === "spitter" && Math.random() < 0.3 ? "vomit" : "moan";
      if (d < 28) this.vocal(model, category, d < 3.5 ? 0.8 : 0.95);
      const busy = type === "runner" ? 2.2 : type === "brute" ? 5 : 3.2;
      v.nextVocal = t + busy * (0.6 + Math.random() * 1.2) + (d > 15 ? 2 : 0);
    }
    this.updateBed(near, dt);
  }
  startBed() {
    if (this.beds.length || !this.bedBuffers?.length) return;
    const ctx = this.ctx;
    for (const buffer of this.bedBuffers) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.sound.master);
      source.start(ctx.currentTime, Math.random() * buffer.duration);
      this.beds.push({ source, gain });
    }
  }
  updateBed(near, dt) {
    if (!this.beds.length) return;
    // The distant horde swells with the number of living zombies around.
    const target =
      Math.min(1, near / 14) * (this.run.phase === "wave" ? 1 : 0.35);
    this.bedLevel += (target - this.bedLevel) * Math.min(1, dt * 0.8);
    const at = this.ctx.currentTime;
    this.beds.forEach((b, i) => {
      const share = i === 0 ? 1 : Math.max(0, this.bedLevel * 1.4 - 0.3 * i);
      b.gain.gain.setTargetAtTime(this.bedLevel * share * 0.32, at, 0.3);
    });
  }
}

function setPosition(panner, p) {
  // A body mid-transition can report a degenerate pose for a frame.
  if (!Number.isFinite(p.x + p.y + p.z)) return;
  if (panner.positionX) {
    const at = panner.context.currentTime;
    panner.positionX.setValueAtTime(p.x, at);
    panner.positionY.setValueAtTime(p.y, at);
    panner.positionZ.setValueAtTime(p.z, at);
  } else panner.setPosition(p.x, p.y, p.z);
}
