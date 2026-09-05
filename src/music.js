// Two original, evolving horror cues, performed locally by Web Audio.
// An eight-bar motif, detuned strings, prepared bells and a wave-driven pulse.
export class Score {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.volume = 0.75;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.volume;
    const output = ctx.createGain();
    output.gain.value = 2.2;
    this.bus.connect(output).connect(destination);
    this.reverb = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, ctx.sampleRate * 3.8, ctx.sampleRate);
    let seed = 773;
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] =
          ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / data.length, 3.1);
      }
    }
    this.reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    this.reverb.connect(wet).connect(this.bus);
    this.next = 0;
    this.beat = 0;
    this.map = null;
    this.scheduled = 0;
    this.voices = new Set();
  }
  setVolume(volume) {
    this.volume = volume;
  }
  // Keep the scheduler tied to audio time, independently of simulation speed.
  tick({
    map = "abbey",
    phase = "rest",
    wave = 0,
    state = "playing",
    power = false,
    hidden = false,
  }) {
    const now = this.ctx.currentTime;
    const level = this.volume * (hidden ? 0 : state === "playing" ? 1 : 0.22);
    if (level !== this.lastLevel) {
      this.bus.gain.setTargetAtTime(level, now, 0.35);
      this.lastLevel = level;
    }
    if (hidden || this.ctx.state !== "running") return;
    if (this.map !== map) {
      this.clear();
      this.map = map;
      this.beat = 0;
      this.next = now + 0.06;
    }
    if (this.next < now) this.next = now + 0.04;
    while (this.next < now + 0.16) {
      this.scheduleBeat(this.next, this.beat++, {
        map,
        phase: state === "playing" ? phase : "rest",
        wave,
        power,
      });
      this.next += 0.48;
    }
  }
  clear() {
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      voice.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
      voice.osc.stop(this.ctx.currentTime + 0.4);
    }
  }
  note(midi, at, duration, volume, kind = "bell", pan = 0) {
    const ctx = this.ctx,
      gain = ctx.createGain(),
      stereo = ctx.createStereoPanner();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = kind === "pad" ? 720 : 3200;
    stereo.pan.value = pan;
    gain.connect(filter).connect(stereo);
    stereo.connect(this.bus);
    stereo.connect(this.reverb);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(
      volume,
      at + (kind === "pad" ? 1.5 : 0.015),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const partials =
      kind === "pad"
        ? [
            [1, -7, 0.6],
            [1, 7, 0.4],
          ]
        : [
            [1, 0, 0.75],
            [2.013, 0, 0.19],
            [3.97, 0, 0.06],
          ];
    let remaining = partials.length;
    for (const [ratio, detune, amplitude] of partials) {
      const osc = ctx.createOscillator(),
        partial = ctx.createGain();
      osc.type = kind === "pad" ? "sawtooth" : "sine";
      osc.frequency.value = 440 * 2 ** ((midi - 69) / 12) * ratio;
      osc.detune.value = detune;
      partial.gain.value = amplitude;
      osc.connect(partial).connect(gain);
      const voice = { osc, gain };
      this.voices.add(voice);
      osc.onended = () => {
        osc.disconnect();
        partial.disconnect();
        this.voices.delete(voice);
        if (--remaining === 0) {
          gain.disconnect();
          filter.disconnect();
          stereo.disconnect();
        }
      };
      osc.start(at);
      osc.stop(at + duration + 0.1);
    }
    this.scheduled++;
  }
  pulse(at, tension) {
    const ctx = this.ctx,
      osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.frequency.setValueAtTime(85, at);
    osc.frequency.exponentialRampToValueAtTime(36, at + 0.35);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.08 + tension * 0.06, at + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    osc.connect(gain).connect(this.bus);
    const voice = { osc, gain };
    this.voices.add(voice);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    };
    osc.start(at);
    osc.stop(at + 0.75);
  }
  scheduleBeat(
    at,
    beat,
    { map = "abbey", phase = "rest", wave = 0, power = false } = {},
  ) {
    const base = map === "abbey" ? 38 : 37;
    const bar = Math.floor(beat / 8) % 8,
      step = beat % 64;
    const tension = phase === "wave" ? Math.min(1, 0.35 + wave / 16) : 0;
    if (beat % 16 === 0) {
      const chord = [
        [0, 7, 12],
        [0, 6, 13],
        [-2, 5, 12],
        [-1, 6, 12],
      ][Math.floor(bar / 2)];
      chord.forEach((interval, i) =>
        this.note(
          base + interval,
          at + i * 0.09,
          9.8,
          0.07 + tension * 0.022,
          "pad",
          (i - 1) * 0.55,
        ),
      );
      this.note(base - 12, at, 7.5, 0.08, "pad");
    }
    const motif =
      map === "abbey"
        ? [
            24,
            null,
            31,
            27,
            25,
            null,
            19,
            null,
            24,
            27,
            36,
            null,
            25,
            19,
            24,
            null,
          ]
        : [
            24,
            25,
            null,
            31,
            18,
            null,
            24,
            null,
            36,
            null,
            30,
            25,
            19,
            null,
            13,
            null,
          ];
    if (step % 4 === 0) {
      const note = motif[Math.floor(step / 4)];
      if (note !== null)
        this.note(
          base + note,
          at,
          4.6,
          0.15,
          "bell",
          Math.sin(beat * 1.7) * 0.6,
        );
    }
    if (tension && beat % 2 === 0) this.pulse(at, tension);
    if (tension > 0.6 && beat % 8 === 5)
      this.note(base + 19, at, 0.8, 0.065, "bell", -0.4);
    if (power && beat % 16 === 12)
      this.note(base + 43, at, 5.4, 0.06, "bell", 0.7);
  }
}
