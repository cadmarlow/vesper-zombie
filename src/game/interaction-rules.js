/** Doors are operated across their frame; other interactions use their centre. */
export function interactionDistance(interaction, position) {
  const door = interaction.kind === "door";
  const dx = door
    ? Math.max(
        0,
        Math.abs(position.x - interaction.obstacle.x) -
          interaction.obstacle.w / 2,
      )
    : position.x - interaction.position.x;
  const dz = door
    ? Math.max(
        0,
        Math.abs(position.z - interaction.obstacle.z) -
          interaction.obstacle.d / 2,
      )
    : position.z - interaction.position.z;
  return Math.max(0, Math.hypot(dx, dz) - (door ? 1 : 0));
}
export function sharedInteractionCost(interaction, run, actor, take = false) {
  if (!actor.alive || interactionDistance(interaction, actor.position) >= 3.1)
    return null;
  switch (interaction.kind) {
    case "door":
      if (interaction.open) return null;
      break;
    case "power":
      if (run.world.power) return null;
      break;
    case "box":
      if (take) return interaction.busy && interaction.offered ? 0 : null;
      if (interaction.busy) return null;
      break;
    case "extract":
      return run.world.power &&
        !run.extraction &&
        run.wave >= 10 &&
        !(run.wave === 10 && run.phase === "wave")
        ? 0
        : null;
    default:
      return null;
  }
  const cost = interaction.cost || 0;
  return actor.points >= cost ? cost : null;
}
