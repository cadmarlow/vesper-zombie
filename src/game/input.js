import { clamp } from "../logic.js";
/** Keyboard and mouse produce the same commands as TouchControls. */
export class DesktopControls {
  constructor(run, view, input, commands) {
    Object.assign(this, { run, view, input, commands });
    this.abort = new AbortController();
    this.bind();
  }
  bind() {
    const listen = (target, type, handler, options = {}) => {
      target.addEventListener(type, handler, {
        ...options,
        signal: this.abort.signal,
      });
    };
    listen(window, "resize", () => this.commands.resize());
    listen(window, "keydown", (e) => {
      if (e.target.matches("input,select,textarea")) return;
      // Only swallow navigation keys during play. Menus and panels keep
      // keyboard focus traversal and button activation.
      if (
        this.run.state === "playing" &&
        [
          "Space",
          "Tab",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      )
        e.preventDefault();
      this.input.keys.add(e.code);
      if (e.repeat) return;
      if (this.run.state === "playing") {
        switch (e.code) {
          case "KeyR":
            this.commands.reload();
            break;
          case "KeyE":
            this.commands.interact();
            break;
          case "KeyG":
            this.commands.grenade();
            break;
          case "KeyV":
            this.commands.melee();
            break;
          case "KeyC":
            this.commands.toggleCrouch();
            break;
          case "ShiftLeft":
          case "ShiftRight":
            this.run.player.crouched = false;
            break;
          case "KeyF":
            this.view.flashlight.visible = !this.view.flashlight.visible;
            break;
          case "Digit1":
            this.commands.switchWeapon(0);
            break;
          case "Digit2":
            this.commands.switchWeapon(1);
            break;
          case "KeyN":
            if (this.run.phase === "rest" && !this.run.session?.peer)
              this.run.phaseTimer = Math.min(this.run.phaseTimer, 0.2);
            break;
          case "Escape":
            this.commands.pause();
            break;
          case "Space":
            this.commands.jump();
            break;
        }
      } else if (e.code === "Escape" && this.run.state === "paused")
        this.commands.resume();
    });
    listen(window, "keyup", (e) => this.input.keys.delete(e.code));
    listen(window, "blur", () => {
      this.input.keys.clear();
      if (this.run.state === "playing") this.commands.pause();
    });
    listen(document, "visibilitychange", () => {
      if (document.hidden && this.run.state === "playing")
        this.commands.pause();
      if (!document.hidden) this.view.needsRender = true;
      this.commands.requestFrame();
    });
    listen(document, "pointerlockchange", () => {
      if (
        document.pointerLockElement !== this.view.canvas &&
        this.run.state === "playing" &&
        !this.run.touch
      )
        this.commands.pause();
    });
    listen(document, "mousemove", (e) => {
      if (this.run.state !== "playing") return;
      if (document.pointerLockElement === this.view.canvas) {
        this.input.yaw -= e.movementX * 0.0018 * this.run.settings.sensitivity;
        this.input.pitch = clamp(
          this.input.pitch -
            e.movementY * 0.0018 * this.run.settings.sensitivity,
          -1.38,
          1.38,
        );
      }
    });
    listen(this.view.canvas, "mousedown", (e) => {
      if (this.run.state !== "playing") return;
      if (document.pointerLockElement !== this.view.canvas && !this.run.touch) {
        this.commands.lock();
        return;
      }
      if (e.button === 0) {
        this.input.mouse.fire = true;
        this.commands.shoot();
      }
      if (e.button === 2) this.input.mouse.aim = true;
    });
    listen(window, "mouseup", (e) => {
      if (e.button === 0) this.input.mouse.fire = false;
      if (e.button === 2) this.input.mouse.aim = false;
    });
    listen(this.view.canvas, "contextmenu", (e) => e.preventDefault());
    listen(
      this.view.canvas,
      "wheel",
      (e) => {
        if (this.run.state === "playing") {
          e.preventDefault();
          this.commands.switchWeapon(1 - this.run.slot);
        }
      },
      { passive: false },
    );
  }
  dispose() {
    this.abort.abort();
    this.input.keys.clear();
    this.input.mouse.fire = this.input.mouse.aim = false;
  }
}

/** Small common input API for touch; no renderer or enemy state is exposed. */
export function createInputPort(run, input, actions) {
  const port = { ...actions };
  for (const name of [
    "keys",
    "mouse",
    "yaw",
    "pitch",
    "touchMove",
    "touchSprint",
    "touchRun",
  ])
    Object.defineProperty(port, name, {
      get: () => input[name],
      set: (value) => {
        input[name] = value;
      },
    });
  for (const name of ["state", "touch", "slot"])
    Object.defineProperty(port, name, { get: () => run[name] });
  return port;
}
