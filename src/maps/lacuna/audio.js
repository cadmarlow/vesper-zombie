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
    this.water.start();
    this.siren.start();
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
    this.filter.frequency.setTargetAtTime(flood ? 1450 : 480, now, 0.8);
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
  dispose() {
    if (!this.ctx) return;
    this.water.stop();
    this.siren.stop();
    for (const voice of this.bells) {
      voice.oscillator.stop();
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    this.bells.clear();
    for (const node of [
      this.water,
      this.siren,
      this.filter,
      this.waterGain,
      this.sirenGain,
      this.bus,
    ])
      node.disconnect();
    this.ctx = null;
  }
}
