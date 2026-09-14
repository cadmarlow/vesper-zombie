const PICKUP_TYPES = ["health", "ammo", "double", "insta"];
// Tuple ordering is part of the wire contract, independent from registry order.
export function snapshot(context, players, id, tick, me) {
  const g = context;
  const box = g.run.world.interactions.find((i) => i.kind === "box");
  return {
    t: "state",
    paused: g.run.state === "paused",
    rescue: g.run.session?.rescue.snapshot() || [],
    n: tick,
    time: +g.run.time.toFixed(3),
    wave: g.run.wave,
    phase: g.run.phase,
    timer: +g.run.phaseTimer.toFixed(1),
    remaining: g.run.remaining,
    power: g.run.world.power ? 1 : 0,
    doors: g.run.world.doors.map((d) => [d.id, d.open ? 1 : 0]),
    box: box
      ? [
          box.busy ? 1 : 0,
          box.offered || null,
          box.display?.userData.weaponId || null,
        ]
      : null,
    extraction: g.run.extraction ? Math.ceil(g.run.extractionTimer) : -1,
    e: g.run.enemies.map((e) => [
      e.id,
      e.type,
      +e.model.position.x.toFixed(2),
      +e.model.position.z.toFixed(2),
      +e.model.rotation.y.toFixed(2),
      Math.max(0, Math.round(e.health)),
      e.dead ? 1 : 0,
      e.attacking ? 1 : 0,
      e.model.userData.headDestroyed ? 1 : 0,
      e.stagger > 0 ? 1 : 0,
      e.maxHealth,
    ]),
    p: [
      [
        id,
        me.x,
        me.y,
        me.z,
        me.yaw,
        me.pitch,
        me.w,
        me.l,
        me.hp,
        me.mhp,
        me.f,
        me.points,
        me.grenades,
      ],
      ...[...players.values()].map((p) => [
        p.id,
        p.tx,
        p.ty,
        p.tz,
        p.tyaw,
        p.pitch,
        p.weapon,
        p.level,
        p.health,
        p.maxHealth,
        p.flags,
        p.points,
        p.grenades,
      ]),
    ],
    k: g.run.pickups.map((p) => [
      p.id,
      PICKUP_TYPES.indexOf(p.type),
      +p.mesh.position.x.toFixed(2),
      +p.mesh.position.z.toFixed(2),
    ]),
    j: g.run.projectiles.map((p) => [
      p.id,
      p.type === "grenade" ? 0 : 1,
      +p.mesh.position.x.toFixed(2),
      +p.mesh.position.y.toFixed(2),
      +p.mesh.position.z.toFixed(2),
    ]),
  };
}
