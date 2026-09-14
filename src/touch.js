// A two-thumb FPS controller. Every contact owns its capture until release.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export class TouchControls {
  constructor(root, getGame, getSettings) {
    this.root = root;
    this.getGame = getGame;
    this.getSettings = getSettings;
    this.contacts = new Map();
    this.stick = root.querySelector("#touch-stick");
    this.move = root.querySelector("#touch-move");
    this.look = root.querySelector("#touch-look");
    this.bind(this.move, "move");
    this.bind(this.look, "look");
    for (const button of root.querySelectorAll("[data-action]"))
      this.bind(button, button.dataset.action);
    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
  }
  bind(element, action) {
    element.addEventListener("pointerdown", (e) => {
      const game = this.getGame();
      if (!game || game.state !== "playing" || !game.touch) return;
      // One thumb per zone: a second finger must not add up joystick or
      // camera input. A contact whose release event never arrived (browser
      // gesture, lost capture) is replaced by the new one instead of blocking
      // the zone for the rest of the session.
      if (action === "move" || action === "look")
        for (const [id, c] of [...this.contacts])
          if (c.action === action) this.release(id);
      e.preventDefault();
      element.setPointerCapture(e.pointerId);
      const contact = { action, element, x: e.clientX, y: e.clientY };
      this.contacts.set(e.pointerId, contact);
      element.classList.add("pressed");
      this.root.classList.add("experienced");
      if (action === "move") {
        const box = this.move.getBoundingClientRect();
        contact.originX = e.clientX;
        contact.originY = e.clientY;
        // Clamp only the decoration: touching near an edge must never move
        // the player until the thumb actually drags.
        this.stick.style.left =
          clamp(e.clientX, box.left + 54, box.right - 54) + "px";
        this.stick.style.top =
          clamp(e.clientY, box.top + 54, box.bottom - 40) + "px";
        this.stick.classList.add("active");
        this.moveStick(contact, e);
      } else if (action === "fire") {
        game.mouse.fire = true;
        game.shoot();
      } else if (action === "aim") game.mouse.aim = !game.mouse.aim;
      else if (action === "reload") game.reload();
      else if (action === "interact") {
        game.touchInteract = true;
        game.interact();
      } else if (action === "grenade") game.grenade();
      else if (action === "melee") game.melee();
      else if (action === "switch") game.switchWeapon(1 - game.slot);
      else if (action === "jump") game.jump();
      else if (action === "crouch") game.toggleCrouch();
    });
    element.addEventListener("pointermove", (e) => {
      const contact = this.contacts.get(e.pointerId),
        game = this.getGame();
      if (!contact || !game || game.state !== "playing") return;
      e.preventDefault();
      if (contact.action === "move") this.moveStick(contact, e);
      else if (contact.action === "look" || contact.action === "fire") {
        const sensitivity = this.getSettings().touchSensitivity ?? 1;
        const ads = game.mouse.aim ? 0.55 : 1;
        const friction = game.touchAimFriction();
        // CSS-pixel deltas keep the same thumb feel on Retina and standard screens.
        game.yaw -=
          (e.clientX - contact.x) * 0.005 * sensitivity * ads * friction;
        game.pitch = clamp(
          game.pitch -
            (e.clientY - contact.y) * 0.005 * sensitivity * ads * friction,
          -1.3,
          1.3,
        );
      }
      contact.x = e.clientX;
      contact.y = e.clientY;
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      element.addEventListener(event, (e) => this.release(e.pointerId));
  }
  moveStick(contact, e) {
    const game = this.getGame();
    const dx = e.clientX - contact.originX,
      dy = e.clientY - contact.originY;
    const distance = Math.hypot(dx, dy),
      radius = 46;
    const amount = clamp((distance / radius - 0.12) / 0.88, 0, 1);
    const x = distance ? dx / distance : 0,
      y = distance ? dy / distance : 0;
    game.touchMove = { x: x * amount, y: -y * amount };
    // Sprint only when pushing forward, not when strafing or backing away.
    game.touchSprint = amount > 0.94 && y < -0.78;
    this.stick.classList.toggle("sprinting", game.touchSprint);
    this.stick.style.setProperty(
      "--stick-x",
      `${x * Math.min(distance, 38)}px`,
    );
    this.stick.style.setProperty(
      "--stick-y",
      `${y * Math.min(distance, 38)}px`,
    );
  }
  release(id) {
    const contact = this.contacts.get(id);
    if (!contact) return;
    this.contacts.delete(id);
    contact.element.classList.remove("pressed");
    if (contact.element.hasPointerCapture(id))
      contact.element.releasePointerCapture(id);
    const game = this.getGame();
    if (contact.action === "move") {
      if (game) {
        game.touchMove = { x: 0, y: 0 };
        game.touchSprint = false;
        game.touchRun = false;
      }
      this.stick.classList.remove("active", "sprinting");
      this.stick.style.cssText = "";
    }
    if (game && contact.action === "interact") game.touchInteract = false;
    if (
      game &&
      contact.action === "fire" &&
      ![...this.contacts.values()].some((c) => c.action === "fire")
    )
      game.mouse.fire = false;
  }
  reset() {
    for (const id of [...this.contacts.keys()]) this.release(id);
    const game = this.getGame();
    if (game) {
      game.touchMove = { x: 0, y: 0 };
      game.touchSprint = game.touchRun = false;
      game.touchInteract = false;
      if (game.touch) game.mouse.fire = game.mouse.aim = false;
    }
  }
}
