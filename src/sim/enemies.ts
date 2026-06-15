// Enemy archetype pool (T9/T11). Data-oriented struct-of-arrays, fixed capacity,
// swap-remove — no per-frame allocation, no GC churn under crowd load (V5/V6).
// Full generic ECS deferred: archetype pools are the right shape for instanced
// crowds (execution rule 7 — concrete until a third archetype demands it).

import type { Vec2 } from './movement';

export const enum EnemyState {
  Telegraph = 0, // spawning at a gate, not yet a threat (V9)
  Active = 1,
}

export interface EnemyType {
  id: string;
  radius: number;
  maxHealth: number;
  speed: number;
  separationWeight: number;
  /** Render variant index for instancing/color. */
  variant: number;
  /** Threat cost the wave director spends to field one (§8.3). */
  threat: number;
}

export const MAX_ENEMIES = 2000;

export class EnemyPool {
  readonly capacity: number;
  count = 0;

  // Components (SoA). Index < count = live.
  readonly posX: Float32Array;
  readonly posZ: Float32Array;
  readonly prevX: Float32Array;
  readonly prevZ: Float32Array;
  readonly velX: Float32Array;
  readonly velZ: Float32Array;
  readonly health: Float32Array;
  readonly radius: Float32Array;
  readonly speed: Float32Array;
  readonly sepWeight: Float32Array;
  readonly variant: Uint8Array;
  readonly state: Uint8Array;
  readonly stateTimer: Float32Array;
  /** Per-enemy steering phase so updates stagger across ticks (low-freq). */
  readonly steerPhase: Uint8Array;

  constructor(capacity: number = MAX_ENEMIES) {
    this.capacity = capacity;
    this.posX = new Float32Array(capacity);
    this.posZ = new Float32Array(capacity);
    this.prevX = new Float32Array(capacity);
    this.prevZ = new Float32Array(capacity);
    this.velX = new Float32Array(capacity);
    this.velZ = new Float32Array(capacity);
    this.health = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);
    this.speed = new Float32Array(capacity);
    this.sepWeight = new Float32Array(capacity);
    this.variant = new Uint8Array(capacity);
    this.state = new Uint8Array(capacity);
    this.stateTimer = new Float32Array(capacity);
    this.steerPhase = new Uint8Array(capacity);
  }

  /** Spawn an enemy in Telegraph state. Returns index, or -1 if full. */
  spawn(type: EnemyType, x: number, z: number, telegraph: number, phase: number): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.prevX[i] = x;
    this.prevZ[i] = z;
    this.velX[i] = 0;
    this.velZ[i] = 0;
    this.health[i] = type.maxHealth;
    this.radius[i] = type.radius;
    this.speed[i] = type.speed;
    this.sepWeight[i] = type.separationWeight;
    this.variant[i] = type.variant;
    this.state[i] = EnemyState.Telegraph;
    this.stateTimer[i] = telegraph;
    this.steerPhase[i] = phase & 0xff;
    return i;
  }

  /** Swap-remove: move the last live enemy into slot i. */
  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.posX[i] = this.posX[last]!;
      this.posZ[i] = this.posZ[last]!;
      this.prevX[i] = this.prevX[last]!;
      this.prevZ[i] = this.prevZ[last]!;
      this.velX[i] = this.velX[last]!;
      this.velZ[i] = this.velZ[last]!;
      this.health[i] = this.health[last]!;
      this.radius[i] = this.radius[last]!;
      this.speed[i] = this.speed[last]!;
      this.sepWeight[i] = this.sepWeight[last]!;
      this.variant[i] = this.variant[last]!;
      this.state[i] = this.state[last]!;
      this.stateTimer[i] = this.stateTimer[last]!;
      this.steerPhase[i] = this.steerPhase[last]!;
    }
  }

  damage(i: number, amount: number): boolean {
    this.health[i]! -= amount;
    return this.health[i]! <= 0;
  }
}

// In-world naming per docs/art-direction.md humor rules.
export const RUST_MITE: EnemyType = {
  id: 'rust-mite',
  radius: 0.5,
  maxHealth: 6,
  speed: 4.2, // tier-1 fodder: well under player base so early kiting reads clearly
  separationWeight: 1.0,
  variant: 0,
  threat: 1,
};

export const DEBT_HOUND: EnemyType = {
  id: 'debt-hound',
  radius: 0.7,
  maxHealth: 14,
  speed: 6.8, // faster pressure unit, still kiteable at player base speed
  separationWeight: 1.2,
  variant: 1,
  threat: 4,
};

// Gatekeeper of Phobos — slice boss (T33 down-payment, art/mechanics → T33/T37).
// Big, slow, high-HP damage sponge that shares the instanced crowd pool (V6):
// one mesh, per-instance color (eliteMagenta) + radius scale. Placeholder until
// the full boss kit lands.
export const BOSS_GATEKEEPER: EnemyType = {
  id: 'gatekeeper-of-phobos',
  radius: 2.4,
  maxHealth: 1500,
  speed: 2.4,
  separationWeight: 0.3,
  variant: 2,
  threat: 250,
};

export interface SteerWeights {
  seek: number;
  separation: number;
}

export const DEFAULT_STEER: SteerWeights = { seek: 1, separation: 1.4 };

/**
 * Compute a desired velocity for one enemy: seek the target plus local
 * separation from neighbors. Pure — neighbor positions are supplied by the
 * caller (from the spatial hash). Returns a velocity scaled to `speed`.
 */
export function steerEnemy(
  px: number,
  pz: number,
  target: Vec2,
  speed: number,
  sepWeight: number,
  neighborsX: Float32Array,
  neighborsZ: Float32Array,
  neighborCount: number,
  selfRadius: number,
  weights: SteerWeights,
): Vec2 {
  // Seek.
  let sx = target.x - px;
  let sz = target.z - pz;
  const sl = Math.hypot(sx, sz);
  if (sl > 1e-6) {
    sx /= sl;
    sz /= sl;
  }

  // Separation: push away from close neighbors, weighted by closeness.
  let ax = 0;
  let az = 0;
  for (let n = 0; n < neighborCount; n++) {
    const dx = px - neighborsX[n]!;
    const dz = pz - neighborsZ[n]!;
    const d2 = dx * dx + dz * dz;
    const minDist = selfRadius * 2;
    if (d2 > 1e-6 && d2 < minDist * minDist) {
      const d = Math.sqrt(d2);
      ax += (dx / d) * (1 - d / minDist);
      az += (dz / d) * (1 - d / minDist);
    }
  }

  let dx = sx * weights.seek + ax * sepWeight * weights.separation;
  let dz = sz * weights.seek + az * sepWeight * weights.separation;
  const dl = Math.hypot(dx, dz);
  if (dl > 1e-6) {
    dx = (dx / dl) * speed;
    dz = (dz / dl) * speed;
  }
  return { x: dx, z: dz };
}
