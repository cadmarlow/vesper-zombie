import { PHASE } from "./state.js";

/** A map-owned audio bus; every node is stopped/disconnected on leaving Lacuna. */
export class LacunaAudio {
  constructor(sound) {
    this.ctx = sound.ctx;
    this.bells = new Set();
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(sound.master);
    this.water = ctx.createBufferSource();
    this.water.buffer = sound.noiseBuffer;
    this.water.loop = true;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 650;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0.07;
    this.water.connect(this.filter).connect(this.waterGain).connect(this.bus);
    this.siren = ctx.createOscillator();
    this.siren.type = "triangle";
    this.siren.frequency.value = 260;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.siren.connect(this.sirenGain).connect(this.bus);
    this.wind = ctx.createBufferSource();
    this.wind.buffer = sound.noiseBuffer;
    this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 340;
    this.windFilter.Q.value = 1.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.018;
    this.wind.connect(this.windFilter).connect(this.windGain).connect(this.bus);
    this.nextCreak = 11;
    this.nextDrip = 3;
    this.water.start();
    this.siren.start();
    this.wind.start();
    this.setPaused(false);
  }
  update(state, position, time) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const nearWater = Math.max(0.2, 1 - Math.abs(position.x) / 75);
    const flood = state.phase === PHASE.FLOOD;
    this.waterGain.gain.setTargetAtTime(
      (flood ? 0.21 : 0.055) * nearWater,
      now,
      0.6,
    );
    this.filter.frequency.setTargetAtTime(flood ? 1150 : 290, now, 0.8);
    this.windFilter.frequency.setTargetAtTime(
      290 + Math.sin(time * 0.12) * 130,
      now,
      1.2,
    );
    this.windGain.gain.setTargetAtTime(
      0.014 + Math.sin(time * 0.18) ** 2 * 0.017,
      now,
      0.8,
    );
    if (time >= this.nextCreak) {
      this.nextCreak = time + 21 + Math.sin(time * 0.47) ** 2 * 13;
      const side = Math.sin(time * 0.27) > 0 ? 58 : -60;
      this.unease(
        147,
        53,
        4.2,
        0.019,
        Math.max(-0.8, Math.min(0.8, (side - position.x) / 55)),
      );
      this.unease(82, 39, 1.3, 0.045, side > 0 ? 0.55 : -0.55, 1.7);
    }
    const sheltered =
      (position.x < -27 && position.z > -20 && position.z < 15) ||
      (position.x > 26 && position.z > -62 && position.z < -23);
    if (sheltered && time >= this.nextDrip) {
      this.nextDrip = time + 4.7 + Math.sin(time) ** 2 * 5;
      this.unease(1380, 620, 0.8, 0.016, Math.sin(time * 0.3) * 0.7);
    }
    this.siren.frequency.setTargetAtTime(
      295 + Math.sin(time * 2.1) * 70,
      now,
      0.15,
    );
    this.sirenGain.gain.setTargetAtTime(
      state.phase === PHASE.WARNING ? 0.045 : 0,
      now,
      0.12,
    );
  }
  setPaused(paused) {
    this.bus?.gain.setTargetAtTime(paused ? 0 : 1, this.ctx.currentTime, 0.04);
  }
  ring() {
    if (!this.ctx) return;
    for (const [frequency, volume, duration] of [
      [196, 0.08, 3.8],
      [412, 0.035, 2.8],
      [588, 0.018, 2.1],
    ]) {
      const oscillator = this.ctx.createOscillator(),
        gain = this.ctx.createGain(),
        now = this.ctx.currentTime;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(this.bus);
      const voice = { oscillator, gain };
      this.bells.add(voice);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        this.bells.delete(voice);
      };
      oscillator.start();
      oscillator.stop(now + duration + 0.1);
    }
  }
  // Inharmonic pipe strain and distant knocks have their own envelopes. They
  // never replace a real enemy cue, and share the map's pause/disposal bus.
  unease(from, to, duration, volume, pan, delay = 0) {
    if (!this.ctx) return;
    const oscillator = this.ctx.createOscillator(),
      gain = this.ctx.createGain(),
      filter = this.ctx.createBiquadFilter(),
      panner = this.ctx.createStereoPanner(),
      now = this.ctx.currentTime + delay;
    oscillator.type = from > 1000 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    filter.type = "lowpass";
    filter.frequency.value = from > 1000 ? 2100 : 390;
    filter.Q.value = 3;
    panner.pan.value = pan;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      volume,
      now + (duration > 3 ? 0.85 : 0.035),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(filter).connect(gain).connect(panner).connect(this.bus);
    const voice = { oscillator, gain, filter, panner };
    this.bells.add(voice);
    oscillator.onended = () => {
      for (const node of Object.values(voice)) node.disconnect();
      this.bells.delete(voice);
    };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.1);
  }
  dispose() {
    if (!this.ctx) return;
    this.water.stop();
    this.siren.stop();
    this.wind.stop();
    for (const voice of this.bells) {
      voice.oscillator.stop();
      voice.oscillator.disconnect();
      voice.gain.disconnect();
      voice.filter?.disconnect();
      voice.panner?.disconnect();
    }
    this.bells.clear();
    for (const node of [
      this.water,
      this.siren,
      this.filter,
      this.waterGain,
      this.sirenGain,
      this.wind,
      this.windFilter,
      this.windGain,
      this.bus,
    ])
      node.disconnect();
    this.ctx = null;
  }
}
