import { chooseTrack } from "./content/music.js";

/** One streamed track: no full-song decoding or duplicate audio players in RAM. */
export class Score {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.volume = 0.75;
    this.selection = "random";
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(destination);
    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.audio.loop = true;
    this.audio.setAttribute("playsinline", "");
    this.source = ctx.createMediaElementSource(this.audio);
    this.source.connect(this.bus);
    this.audio.addEventListener("error", () => {
      this.error =
        "Ce morceau ne peut pas être chargé. Choisissez-en un autre.";
    });
  }
  setVolume(volume) {
    this.volume = volume;
  }
  select(selection) {
    if (selection === this.selection) return;
    this.selection = selection;
    this.startRun();
  }
  startRun() {
    this.track = chooseTrack(this.selection, this.track?.id);
    this.error = null;
    this.audio.src = `/music/${this.track.id}.mp3`;
    this.play();
  }
  play() {
    if (document.hidden || this.playPending || !this.track) return;
    this.playPending = this.audio
      .play()
      .catch((error) => {
        // Safari can defer autoplay until the next tap; keep the game usable.
        if (error.name !== "AbortError") this.blocked = true;
      })
      .finally(() => {
        this.playPending = null;
      });
  }
  unlock() {
    this.blocked = false;
    if (!this.track) this.startRun();
    else this.play();
  }
  tick({ state = "menu", hidden = false }) {
    const level =
      this.volume * (hidden ? 0 : state === "playing" ? 0.72 : 0.18);
    if (level !== this.lastLevel) {
      this.bus.gain.setTargetAtTime(level, this.ctx.currentTime, 0.2);
      this.lastLevel = level;
    }
    if (hidden) this.audio.pause();
    else if (this.audio.paused && !this.blocked && !this.error) this.play();
  }
  dispose() {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.source.disconnect();
    this.bus.disconnect();
  }
}
