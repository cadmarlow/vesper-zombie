import { ENEMIES } from "../content/enemies.js";
import { INTENT, TACTICS } from "../content/assaults.js";
import { hordeRandom } from "../content/horde.js";
import { enemyActionDuration } from "./enemy-actions.js";

const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const key = (person) => (person.local ? "local" : person.id);

/** One roster per frame, instead of rebuilding it for every zombie. */
export function huntTargets(run) {
  const list = run.session?.everyone?.() || [
    {
      id: run.session?.id ?? 0,
      local: true,
      alive: !run.downed && run.player.health !== 0,
      position: run.player.position,
    },
  ];
  return list
    .filter((p) => p.alive)
    .map((p) => ({
      ...p,
      key: key(p),
      health: p.local
        ? run.player.health
        : run.session?.players?.get(p.id)?.health,
      yaw: p.local
        ? run.playerYaw || 0
        : run.session?.players?.get(p.id)?.tyaw || 0,
    }));
}

export function prepareEnemyIntentions(run, cleanup) {
  let state = run.enemyTactics;
  if (!state || state.world !== run.world) {
    state = run.enemyTactics = {
      world: run.world,
      memories: new Map(),
      nextSample: 0,
      previousAlive: 0,
      reliefUntil: 0,
    };
  }
  state.cleanup = cleanup;
  state.people = huntTargets(run);
  state.loads = new Map(state.people.map((p) => [p.key, 0]));
  state.routeBudget = 2;
  const now = run.time;
  if (state.previousAlive > state.people.length)
    state.reliefUntil = Math.max(state.reliefUntil, now + TACTICS.reliefTime);
  state.previousAlive = state.people.length;
  if (now >= state.nextSample) {
    state.nextSample = now + TACTICS.thinkInterval;
    const seen = new Set();
    for (const person of state.people) {
      seen.add(person.key);
      const last = state.memories.get(person.key);
      const dt = last ? now - last.time : 0;
      let vx = dt > 0 ? (person.position.x - last.x) / dt : 0;
      let vz = dt > 0 ? (person.position.z - last.z) / dt : 0;
      if (Math.hypot(vx, vz) > 8) vx = vz = 0; // teleport/respawn is not a heading
      if (last && person.health < last.health)
        state.reliefUntil = Math.max(
          state.reliefUntil,
          now + TACTICS.reliefTime,
        );
      state.memories.set(person.key, {
        x: person.position.x,
        z: person.position.z,
        time: now,
        vx: last ? last.vx * 0.35 + vx * 0.65 : 0,
        vz: last ? last.vz * 0.35 + vz * 0.65 : 0,
        health: person.health,
      });
    }
    for (const id of state.memories.keys())
      if (!seen.has(id)) state.memories.delete(id);
  }
  if (run.assault) run.assault.reliefUntil = state.reliefUntil;
  return state;
}

/** Stable aggro; small pressure bias only matters between comparably close prey. */
export function enemyFocus(run, enemy) {
  if (run.session && !run.session.everyone)
    return run.session.nearest(enemy.model.position);
  const state = run.enemyTactics;
  if (!state?.people.length) return null;
  let best = null,
    bestScore = Infinity;
  const current = state.people.find((p) => p.key === enemy.huntTarget);
  const score = (p) =>
    gap(enemy.model.position, p.position) +
    (state.loads.get(p.key) || 0) * 0.85;
  for (const person of state.people) {
    const value = score(person);
    if (value < bestScore) {
      best = person;
      bestScore = value;
    }
  }
  if (
    current &&
    (gap(enemy.model.position, current.position) < 3.5 ||
      run.time < (enemy.huntUntil || 0) ||
      score(current) <= bestScore + TACTICS.targetAdvantage)
  )
    best = current;
  if (best.key !== enemy.huntTarget) {
    enemy.huntTarget = best.key;
    enemy.huntUntil = run.time + TACTICS.targetLock;
    finishIntent(enemy, run.time, 0.4);
  }
  state.loads.set(best.key, (state.loads.get(best.key) || 0) + 1);
  return best;
}

function finishIntent(enemy, now, cooldown = 2.8) {
  if (enemy.intent?.role) {
    enemy.intent = {
      role: INTENT.pursue,
      sequence: enemy.intent.sequence + 1,
      since: now,
    };
  }
  enemy.tactical = null;
  enemy.nextTactic = Math.max(enemy.nextTactic || 0, now + cooldown);
}
function startIntent(enemy, role, path, prey, run, duration) {
  enemy.intent = {
    role,
    sequence: (enemy.intent?.sequence || 0) + 1,
    since: run.time,
  };
  enemy.tactical = {
    role,
    path,
    cursor: 0,
    until: run.time + duration,
    preyX: prey.x,
    preyZ: prey.z,
    target: enemy.huntTarget,
    revision: run.navigation?.revision,
    lastX: enemy.model.position.x,
    lastZ: enemy.model.position.z,
    progressAt: run.time,
  };
}
function allowedTactic(run, enemy, role) {
  const state = run.enemyTactics;
  if (run.time < state.reliefUntil) return false;
  const active = run.enemies.filter(
    (e) =>
      !e.dead &&
      e !== enemy &&
      e.tactical &&
      e.tactical.until > run.time &&
      e.tactical.role !== INTENT.support,
  );
  const maximum =
    run.difficultyId === "story"
      ? 1
      : Math.min(TACTICS.maxTactical, state.people.length + 1);
  return (
    active.length < maximum &&
    !active.some(
      (e) =>
        e.huntTarget === enemy.huntTarget &&
        (e.tactical.role === role || run.difficultyId === "story"),
    )
  );
}
function nearbyGoal(navigation, desired) {
  const cells = navigation.nearby(desired.x, desired.z, 1.8);
  cells.sort(
    (a, b) =>
      gap(navigation.point(a), desired) - gap(navigation.point(b), desired),
  );
  const at = cells.find((i) => navigation.distance[i] >= 0);
  return at === undefined ? null : navigation.point(at);
}
function pathLength(from, path) {
  let length = 0,
    last = from;
  for (const point of path) {
    length += gap(last, point);
    last = point;
  }
  return length;
}

/** Returns a real waypoint, or null to resume the normal prey flow field. */
export function enemyTacticalGoal(
  run,
  enemy,
  focus,
  navigation,
  distance,
  blocked,
  cleanup,
) {
  const now = run.time,
    state = run.enemyTactics,
    position = enemy.model.position;
  const prey = focus?.position || run.player.position;
  if (
    cleanup ||
    focus?.bait ||
    enemy.crawler ||
    ENEMIES[enemy.type].boss ||
    run.wave < 2 ||
    enemy.stagger > 0 ||
    (enemy.action?.kind === "melee" &&
      now < enemy.action.startTime + enemyActionDuration("melee", enemy.type))
  ) {
    finishIntent(enemy, now, 0.5);
    return null;
  }
  let plan = enemy.tactical;
  if (plan) {
    if (
      now >= plan.until ||
      plan.target !== enemy.huntTarget ||
      plan.revision !== run.navigation?.revision ||
      Math.hypot(prey.x - plan.preyX, prey.z - plan.preyZ) > 6 ||
      distance < 2.3
    ) {
      finishIntent(enemy, now);
      return null;
    }
    if (plan.role === INTENT.support) return plan.path[0];
    if (gap(position, { x: plan.lastX, z: plan.lastZ }) > 0.2) {
      plan.lastX = position.x;
      plan.lastZ = position.z;
      plan.progressAt = now;
    }
    if (now - plan.progressAt > 0.85) {
      finishIntent(enemy, now, 4);
      return null;
    }
    while (
      plan.cursor < plan.path.length &&
      gap(position, plan.path[plan.cursor]) < 0.25
    )
      plan.cursor++;
    const point = plan.path[plan.cursor];
    if (!point || !navigation.clear(position, point)) {
      finishIntent(enemy, now);
      return null;
    }
    return point;
  }
  if (!state || now < (enemy.nextTactic || 0) || !navigation.route) return null;
  enemy.nextTactic = now + 0.7 + hordeRandom(enemy.id, 607) * 0.5;
  if (
    enemy.type === "spitter" &&
    !blocked &&
    distance > 5 &&
    distance < 12 &&
    now >= (enemy.nextSupport || 0) &&
    (!enemy.supportPrey || gap(prey, enemy.supportPrey) > 3)
  ) {
    enemy.supportPrey = { x: prey.x, z: prey.z };
    enemy.nextSupport = now + TACTICS.supportCooldown;
    startIntent(
      enemy,
      INTENT.support,
      [{ x: position.x, z: position.z }],
      prey,
      run,
      TACTICS.supportTime,
    );
    return enemy.tactical.path[0];
  }
  if (
    distance < 5 ||
    distance > TACTICS.tacticalRange ||
    enemy.age < 2 ||
    !state.routeBudget
  )
    return null;
  const memory = state.memories.get(enemy.huntTarget);
  const velocity = memory ? Math.hypot(memory.vx, memory.vz) : 0;
  const pincer = enemy.assault?.pattern === "pincer";
  let role = null,
    desired;
  if (
    enemy.type === "runner" &&
    velocity > 0.7 &&
    !blocked &&
    hordeRandom(enemy.id, 601) < 0.6 &&
    allowedTactic(run, enemy, INTENT.intercept)
  ) {
    role = INTENT.intercept;
    const lead = Math.min(TACTICS.leadSeconds, TACTICS.maxLead / velocity);
    desired = { x: prey.x + memory.vx * lead, z: prey.z + memory.vz * lead };
    if (!navigation.clear(prey, desired)) return null;
  } else if (
    (enemy.type === "wraith" || (pincer && enemy.type === "runner")) &&
    hordeRandom(enemy.id, 602) < 0.75 &&
    allowedTactic(run, enemy, INTENT.flank)
  ) {
    role = INTENT.flank;
    const dx = position.x - prey.x,
      dz = position.z - prey.z;
    const side = enemy.assault?.side || (enemy.id & 1 ? -1 : 1);
    desired = {
      x:
        prey.x -
        (dz / distance) * TACTICS.flankOffset * side -
        (dx / distance) * 1.5,
      z:
        prey.z +
        (dx / distance) * TACTICS.flankOffset * side -
        (dz / distance) * 1.5,
    };
  }
  if (role === null) return null;
  state.routeBudget--;
  const goal = nearbyGoal(navigation, desired);
  if (!goal) return null;
  const path = navigation.route(position, goal);
  if (!path || pathLength(position, path) > distance * 1.55 + 3) return null;
  startIntent(
    enemy,
    role,
    path,
    prey,
    run,
    role === INTENT.intercept ? TACTICS.interceptTime : TACTICS.flankTime,
  );
  enemy.nextTactic = now + 4.5 + hordeRandom(enemy.id, 608) * 2;
  return path[0];
}

/** One readable leap/spit wind-up per prey, with a brief recovery gap. */
export function enemySpecialAllowed(run, enemy) {
  const state = run.enemyTactics;
  if (!state || run.wave < 2) return true;
  if (run.time < state.reliefUntil) return false;
  let total = 0,
    aimed = 0;
  for (const other of run.enemies) {
    const action = other.action;
    if (
      other === enemy ||
      other.dead ||
      !action ||
      (action.kind !== "spit" && !action.leap)
    )
      continue;
    if (
      run.time >=
      action.startTime + enemyActionDuration(action.kind, other.type) + 0.3
    )
      continue;
    total++;
    if (other.huntTarget === enemy.huntTarget) aimed++;
  }
  const perTarget = run.difficultyId === "nightmare" ? 2 : 1;
  return aimed < perTarget && total < Math.max(1, state.people.length);
}
