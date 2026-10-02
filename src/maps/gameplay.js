import { LacunaGameplay } from "./lacuna/gameplay.js";

export function createMapGameplay(context, commands) {
  return context.run.map === "lacuna"
    ? new LacunaGameplay(context, commands)
    : null;
}
