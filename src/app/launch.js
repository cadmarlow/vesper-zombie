import { mapDefinition } from "../maps/catalog.js";

/** One immutable request survives imports, shader compilation and phone rotation. */
export class LaunchGate {
  pending = null;
  deferred = null;
  defer(request) {
    this.deferred = request;
  }
  takeDeferred() {
    const request = this.deferred;
    this.deferred = null;
    return request;
  }
  run(request, launch) {
    if (this.pending) return this.pending;
    this.pending = Promise.resolve()
      .then(() => launch(request))
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}

export function createLauncher({
  sound,
  net,
  canvas,
  getSettings,
  getSelection,
  onGame,
  onLoading,
  onReady,
  onError,
  showOrientation,
  beforeLaunch = async () => true,
}) {
  const gate = new LaunchGate();
  let game;
  const launch = async (request) => {
    const { map, difficulty, touch, coop } = request;
    if (!(await beforeLaunch())) return;
    onLoading(mapDefinition(map), difficulty);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    try {
      if (!game) {
        const { Game } = await import("../game.js");
        game = new Game(canvas, getSettings(), onGame.event, sound);
        onGame.created(game);
        if (import.meta.env.DEV) {
          const { observeGame } = await import("../game/diagnostics.js");
          window.__vesper = observeGame(game);
        }
      }
      let session = null;
      if (coop) {
        if (
          !net.room ||
          net.room.run !== coop.run ||
          net.room.host !== coop.host
        )
          throw new Error("session-lost");
        const { Session } = await import("../multiplayer.js");
        session = new Session(net, {
          hostId: coop.host,
          players: coop.players,
          runId: coop.run,
        });
      }
      await game.start(map, difficulty, touch, session);
      onReady(mapDefinition(map));
    } catch (error) {
      if (coop) net.leave();
      onError(error);
    }
  };
  return {
    start(event, coop = null) {
      if (gate.pending || gate.deferred) return gate.pending;
      const touch =
        event?.pointerType === "touch" ||
        matchMedia("(pointer: coarse)").matches;
      const settings = getSettings();
      sound.setVolume(settings.volume);
      sound.setMusicVolume(settings.musicVolume);
      sound.setMusicTrack?.(settings.musicTrack);
      void sound.init().catch(() => {});
      const selection = getSelection();
      const request = {
        map: coop?.map || selection.map,
        difficulty: coop?.difficulty || selection.difficulty,
        touch,
        coop,
      };
      if (
        touch &&
        innerWidth < (window.visualViewport?.height || innerHeight)
      ) {
        gate.defer(request);
        showOrientation();
        return;
      }
      if (touch && event?.isTrusted && !document.fullscreenElement)
        document.documentElement.requestFullscreen?.().catch(() => {});
      return gate.run(request, launch);
    },
    resumeAfterRotation() {
      const request = gate.takeDeferred();
      return request ? gate.run(request, launch) : null;
    },
    get awaitingLandscape() {
      return !!gate.deferred;
    },
    cancelDeferred() {
      if (gate.takeDeferred()?.coop) net.leave();
    },
  };
}
