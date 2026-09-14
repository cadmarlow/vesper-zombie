import abbey from "./abbey/definition.js";
import station from "./station/definition.js";
import abyss from "./abyss/definition.js";
export const MAPS = [abbey, station, abyss];
export function mapDefinition(id) {
  const map = MAPS.find((map) => map.id === id);
  if (!map) throw new Error("Unknown map: " + id);
  return map;
}
