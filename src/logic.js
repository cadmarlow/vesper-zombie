import { WEAPONS } from "./config.js";
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function rng(seed = 1) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function waveCount(wave, difficulty = 1) {
  return Math.ceil((5 + wave * 2.5) * difficulty);
}
export function enemyType(wave, random = Math.random) {
  const r = random();
  if (wave >= 5 && r < 0.11) return "brute";
  if (wave >= 6 && r < 0.23) return "wraith";
  if (wave >= 4 && r < 0.39) return "spitter";
  if (wave >= 2 && r < 0.62) return "runner";
  return "walker";
}
export function mysteryWeapon(random = Math.random) {
  const r = random();
  return r < 0.09
    ? "eclipse"
    : r < 0.24
      ? "longinus"
      : r < 0.44
        ? "requiem"
        : r < 0.72
          ? "marauder"
          : "spectre";
}
export function newWeapon(id) {
  const def = WEAPONS[id];
  return { id, ammo: def.mag, reserve: def.reserve, level: 0 };
}
export function magazine(weapon) {
  return (
    WEAPONS[weapon.id].mag +
    (weapon.level ? Math.ceil(WEAPONS[weapon.id].mag * 0.5) : 0)
  );
}
export function reloadWeapon(weapon) {
  const needed = Math.min(magazine(weapon) - weapon.ammo, weapon.reserve);
  weapon.ammo += needed;
  weapon.reserve -= needed;
  return needed;
}
export function inside(x, z, o, r = 0.38) {
  return (
    o.active !== false &&
    x > o.x - o.w / 2 - r &&
    x < o.x + o.w / 2 + r &&
    z > o.z - o.d / 2 - r &&
    z < o.z + o.d / 2 + r
  );
}
export function canStand(x, z, obstacles, r = 0.38) {
  return !obstacles.some((o) => inside(x, z, o, r));
}
export function moveSlide(position, dx, dz, obstacles, r = 0.38) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  for (let i = 0; i < steps; i++) {
    if (canStand(position.x + dx / steps, position.z, obstacles, r))
      position.x += dx / steps;
    if (canStand(position.x, position.z + dz / steps, obstacles, r))
      position.z += dz / steps;
  }
  return position;
}
// Swept collision for a circular footprint, using the same expanded rectangles
// as moveSlide. A clear point ray alone is insufficient at pillars and corners.
export function clearPath(from, to, obstacles, radius = 0.38) {
  const dx = to.x - from.x,
    dz = to.z - from.z;
  for (const o of obstacles) {
    if (o.active === false) continue;
    let enter = 0,
      leave = 1;
    const bounds = [
      [
        from.x,
        dx,
        o.x - o.w / 2 - radius + 1e-7,
        o.x + o.w / 2 + radius - 1e-7,
      ],
      [
        from.z,
        dz,
        o.z - o.d / 2 - radius + 1e-7,
        o.z + o.d / 2 + radius - 1e-7,
      ],
    ];
    let intersects = true;
    for (const [position, delta, min, max] of bounds) {
      if (Math.abs(delta) < 1e-10) {
        if (position < min || position > max) {
          intersects = false;
          break;
        }
      } else {
        const a = (min - position) / delta,
          b = (max - position) / delta;
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
        if (enter > leave) {
          intersects = false;
          break;
        }
      }
    }
    if (intersects) return false;
  }
  return true;
}

// One flow field per footprint size. Connections and steering both respect
// collision clearance, including when an actor is between cell centers.
export class Navigation {
  constructor(obstacles, size = 64, cell = 1, clearance = 0.38) {
    this.obstacles = obstacles;
    this.size = size;
    this.cell = cell;
    this.clearance = clearance;
    this.n = Math.ceil(size / cell);
    this.distance = new Int16Array(this.n * this.n);
    this.blocked = new Uint8Array(this.n * this.n);
    this.links = new Uint8Array(this.n * this.n);
    this.queue = new Int32Array(this.n * this.n);
    this.rebuild();
  }
  index(x, z) {
    const c = Math.floor((x + this.size / 2) / this.cell),
      r = Math.floor((z + this.size / 2) / this.cell);
    return c < 0 || r < 0 || c >= this.n || r >= this.n ? -1 : r * this.n + c;
  }
  point(i) {
    return {
      x: ((i % this.n) + 0.5) * this.cell - this.size / 2,
      z: (Math.floor(i / this.n) + 0.5) * this.cell - this.size / 2,
    };
  }
  neighbours(i) {
    const col = i % this.n;
    return [
      col > 0 ? i - 1 : -1,
      col < this.n - 1 ? i + 1 : -1,
      i - this.n,
      i + this.n,
    ];
  }
  nearby(x, z, radius = 2.5) {
    const center = this.index(x, z);
    if (center < 0) return [];
    const col = center % this.n,
      row = Math.floor(center / this.n);
    const cells = Math.ceil(radius / this.cell),
      indices = [];
    for (
      let r = Math.max(0, row - cells);
      r <= Math.min(this.n - 1, row + cells);
      r++
    ) {
      for (
        let c = Math.max(0, col - cells);
        c <= Math.min(this.n - 1, col + cells);
        c++
      ) {
        const i = r * this.n + c,
          p = this.point(i);
        if (!this.blocked[i] && Math.hypot(p.x - x, p.z - z) <= radius)
          indices.push(i);
      }
    }
    return indices;
  }
  rebuild() {
    this.distance.fill(-1);
    this.links.fill(0);
    for (let i = 0; i < this.blocked.length; i++) {
      const p = this.point(i);
      this.blocked[i] = canStand(p.x, p.z, this.obstacles, this.clearance)
        ? 0
        : 1;
    }
    for (let i = 0; i < this.blocked.length; i++) {
      if (this.blocked[i]) continue;
      const from = this.point(i);
      this.neighbours(i).forEach((j, direction) => {
        if (
          j >= 0 &&
          j < this.blocked.length &&
          !this.blocked[j] &&
          clearPath(from, this.point(j), this.obstacles, this.clearance)
        ) {
          this.links[i] |= 1 << direction;
        }
      });
    }
  }
  update(x, z) {
    this.distance.fill(-1);
    // The player may hug a wall whose grid-cell center is blocked. Pick a
    // nearby clear goal visible from the player instead of seeding that wall.
    const target = { x, z };
    const goals = this.nearby(x, z).filter((i) =>
      clearPath(target, this.point(i), this.obstacles, 0),
    );
    const playerCell = this.index(x, z);
    goals.sort((a, b) => {
      const p = this.point(a),
        q = this.point(b);
      const delta = Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z);
      if (Math.abs(delta) > 1e-7) return delta;
      return a === playerCell ? -1 : b === playerCell ? 1 : a - b;
    });
    const start = goals[0];
    if (start === undefined) return;
    let head = 0,
      tail = 0;
    this.queue[tail++] = start;
    this.distance[start] = 0;
    while (head < tail) {
      const i = this.queue[head++];
      this.neighbours(i).forEach((j, direction) => {
        if (!(this.links[i] & (1 << direction)) || this.distance[j] >= 0)
          return;
        this.distance[j] = this.distance[i] + 1;
        this.queue[tail++] = j;
      });
    }
  }
  direction(x, z, target) {
    const from = { x, z };
    const i = this.index(x, z);
    if (i < 0) return from;
    if (clearPath(from, target, this.obstacles, this.clearance)) return target;
    const distance = this.distance[i];
    let best = null,
      bestDistance = Infinity,
      bestTravel = Infinity;
    let retreat = null,
      retreatDistance = Infinity,
      retreatTravel = Infinity;
    for (const j of this.nearby(x, z, 2)) {
      if (this.distance[j] < 0) continue;
      const p = this.point(j);
      if (!clearPath(from, p, this.obstacles, this.clearance)) continue;
      const travel = Math.hypot(p.x - x, p.z - z);
      if (distance >= 0 && this.distance[j] > distance) {
        if (
          this.distance[j] < retreatDistance ||
          (this.distance[j] === retreatDistance && travel < retreatTravel)
        ) {
          retreat = p;
          retreatDistance = this.distance[j];
          retreatTravel = travel;
        }
        continue;
      }
      if (
        this.distance[j] < bestDistance ||
        (this.distance[j] === bestDistance && travel < bestTravel)
      ) {
        best = p;
        bestDistance = this.distance[j];
        bestTravel = travel;
      }
    }
    // Returning the current cell center lets the actor finish a corner before
    // taking the next edge. Never steer straight through an obstructing wall.
    // Separation can move an actor into the clear corner of a cell whose
    // center is behind an obstacle. A short backward step restores a safe
    // connection to the flow field instead of permanently freezing there.
    return best || retreat || from;
  }
  spawnPosition(anchors, player, random = Math.random, occupied = []) {
    const valid = (i) => {
      if (this.blocked[i] || this.distance[i] < 0) return false;
      const p = this.point(i);
      return (
        Math.hypot(p.x - player.x, p.z - player.z) > 10 &&
        occupied.every(
          (other) =>
            Math.hypot(p.x - other.x, p.z - other.z) >
            this.clearance * 2 + 0.25,
        )
      );
    };
    const candidates = [
      ...new Set(anchors.flatMap(([x, z]) => this.nearby(x, z, 2.5))),
    ].filter(valid);
    if (!candidates.length) {
      // A blocked authored anchor must not stop the wave. Fall back only to
      // reachable, physically clear cells, still well away from the player.
      for (let i = 0; i < this.distance.length; i++)
        if (valid(i)) candidates.push(i);
    }
    if (!candidates.length) return null;
    return this.point(candidates[Math.floor(random() * candidates.length)]);
  }
}
