import { PERKS } from "../content/rules.js";
import { TONIC } from "../content/services.js";

/** Owns a paid drink until its first sip, then lets the hands recover. */
export class TonicSystem {
  constructor({ run, view, input, sound, emit }, { updateHUD, setGun }) {
    Object.assign(this, { run, view, input, sound, emit });
    this.updateHUD = updateHUD;
    this.setGun = setGun;
  }
  start(kind, cost) {
    if (
      !PERKS[kind] ||
      this.run.state !== "playing" ||
      this.run.downed ||
      this.run.tonic
    )
      return false;
    // A switch changes the slot before the old weapon has finished lowering.
    // Settle that selection before the drink replaces its pending draw.
    if (this.run.pendingDraw > 0) this.setGun?.();
    const state = (this.run.tonic = {
      kind,
      cost,
      elapsed: 0,
      consumed: false,
      owner: this.run.player,
    });
    this.run.reloadTime = 0;
    this.run.shellReload = null;
    this.run.pendingDraw = 0;
    this.input.mouse.fire = this.input.mouse.aim = false;
    this.view.viewModel?.startTonic(state);
    return true;
  }
  update(dt) {
    const state = this.run.tonic;
    if (!state || this.run.state === "paused") return;
    if (
      this.run.state !== "playing" ||
      this.run.downed ||
      this.run.player !== state.owner
    ) {
      this.cancel();
      return;
    }
    const prev = state.elapsed;
    state.elapsed = Math.min(TONIC.duration, state.elapsed + Math.max(0, dt));
    for (const [time, cue] of [
      [TONIC.grasp, "take"],
      [TONIC.open, "open"],
      [TONIC.consume, "sip"],
      [TONIC.secondSip, "sip"],
    ])
      if (prev < time && state.elapsed >= time) this.sound.tonicCue?.(cue);
    if (!state.consumed && state.elapsed >= TONIC.consume) {
      state.consumed = true;
      if (!state.owner.perks.includes(state.kind))
        state.owner.perks.push(state.kind);
      if (state.kind === "health")
        state.owner.health = state.owner.maxHealth = 180;
      this.emit("toast", {
        title: PERKS[state.kind].name,
        text: PERKS[state.kind].description,
      });
      this.updateHUD();
    }
    if (state.elapsed >= TONIC.duration) {
      this.run.tonic = null;
      this.view.viewModel?.finishTonic();
      this.run.shotTimer = Math.max(this.run.shotTimer || 0, 0.1);
      this.updateHUD();
    }
  }
  cancel() {
    const state = this.run.tonic;
    if (!state) return;
    this.run.tonic = null;
    if (!state.consumed && this.run.player === state.owner)
      state.owner.points += state.cost;
    this.view.viewModel?.finishTonic();
    if (this.run.state === "playing" || this.run.state === "paused")
      this.updateHUD();
  }
}
