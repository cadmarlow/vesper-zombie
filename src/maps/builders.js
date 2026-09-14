import { buildAbbey } from "./abbey/layout.js";
import { buildStation } from "./station/layout.js";
import { buildAbyss } from "./abyss/layout.js";
import { enrichWorld } from "../world-detail.js";
import { buildArchitecture } from "../world-architecture.js";
// Each registration owns its layout. The legacy visual themes remain reusable.
export const MAP_BUILDERS = {
  abbey: buildAbbey,
  station: buildStation,
  abyss: buildAbyss,
};
export function buildMap(world, definition) {
  const build = MAP_BUILDERS[definition.id];
  if (!build) throw new Error("Missing map builder: " + definition.id);
  if (definition.theme === "abyss") {
    world.detail = build(world);
    world.machines();
  } else {
    world.environment();
    world.floor();
    build(world);
    world.machines();
    world.dressing();
    world.electricalNetwork();
    world.weather();
    world.detail = enrichWorld(world);
  }
  buildArchitecture(world);
}
export function validateWorld(world) {
  const fail = (message) => {
    throw new Error(world.id + ": " + message);
  };
  if (!world.spawn || !world.spawn.toArray().every(Number.isFinite))
    fail("invalid player spawn");
  if (
    !world.spawnPoints.length ||
    world.spawnPoints.some((p) => p.length !== 2 || !p.every(Number.isFinite))
  )
    fail("invalid enemy spawn anchors");
  for (const kind of ["box", "power", "extract"])
    if (world.interactions.filter((i) => i.kind === kind).length !== 1)
      fail("survival requires exactly one " + kind);
  const ids = new Set();
  for (const interaction of world.interactions) {
    interaction.id ??=
      interaction.kind +
      ":" +
      interaction.position.x +
      ":" +
      interaction.position.z;
    if (ids.has(interaction.id))
      fail("duplicate interaction id " + interaction.id);
    ids.add(interaction.id);
  }
}
