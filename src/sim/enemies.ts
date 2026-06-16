// Enemy archetype pool (T9/T11). Data-oriented struct-of-arrays, fixed capacity,
// swap-remove — no per-frame allocation, no GC churn under crowd load (V5/V6).
// Full generic ECS deferred: archetype pools are the right shape for instanced
// crowds (execution rule 7 — concrete until a third archetype demands it).

import type { Vec2 } from './movement';

export const enum EnemyState {
  Telegraph = 0, // spawning at a gate, not yet a threat (V9)
  Active = 1,
}

/**
 * Ranged-attack profile (T33). Absent = melee/contact only (default). The enemy
 * attack system reads this per enemy via its variant. Extensible by `kind` so
 * future enemy guns (`gun`) drop in beside the lobbed grenade (`lob`) without a
 * rewrite — see [[ranged-enemy-framework]].
 */
export type EnemyAttack =
  | {
      kind: 'lob'; // arc a grenade/molotov to the player's ground point; cooks off
      range: number; // max distance to start an attack
      cooldown: number; // seconds between attacks
      windup: number; // telegraph before release (enemy braces)
      speed: number; // projectile ground speed
      fuse: number; // ground cook-off time once landed (telegraph ring)
      blastRadius: number;
      damage: number;
    }
  | {
      kind: 'gun'; // straight fast projectile(s)
      range: number;
      cooldown: number;
      speed: number;
      damage: number;
      spread: number;
      burst?: number; // pellets per volley (default 1 = single aimed round)
    };

export interface EnemyType {
  id: string;
  radius: number;
  maxHealth: number;
  speed: number;
  separationWeight: number;
  /** Render variant index for instancing/color. */
  variant: number;
  /** Optional ranged attack; absent = melee/contact only. */
  attack?: EnemyAttack;
  /** Contact (melee) damage on touch; defaults to DEFAULT_CONTACT_DAMAGE. */
  contactDamage?: number;
  /** Threat cost the wave director spends to field one (§8.3). */
  threat: number;
}

/** Touch damage when an enemy reaches the player, unless its type overrides it. */
export const DEFAULT_CONTACT_DAMAGE = 6;

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
  /** Ranged-attack cooldown remaining (s); 0 = ready (T33). */
  readonly attackCd: Float32Array;
  /** Per-enemy contact (melee) damage (T33). */
  readonly contactDmg: Float32Array;
  // Status effects (T39): per-enemy remaining-time + potency. 0 time = inactive.
  readonly burnTime: Float32Array; // burn DoT remaining (s)
  readonly burnDps: Float32Array; // burn damage per second
  readonly chillTime: Float32Array; // slow remaining (s)
  readonly chillMult: Float32Array; // movement multiplier (1 = none, <1 = slowed)
  readonly markTime: Float32Array; // mark remaining (s)
  readonly markMult: Float32Array; // status-damage amplifier (1 = none, >1 = amplified)

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
    this.attackCd = new Float32Array(capacity);
    this.burnTime = new Float32Array(capacity);
    this.burnDps = new Float32Array(capacity);
    this.chillTime = new Float32Array(capacity);
    this.chillMult = new Float32Array(capacity);
    this.markTime = new Float32Array(capacity);
    this.markMult = new Float32Array(capacity);
    this.contactDmg = new Float32Array(capacity);
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
    this.attackCd[i] = 0;
    this.contactDmg[i] = type.contactDamage ?? DEFAULT_CONTACT_DAMAGE;
    this.burnTime[i] = 0;
    this.burnDps[i] = 0;
    this.chillTime[i] = 0;
    this.chillMult[i] = 1;
    this.markTime[i] = 0;
    this.markMult[i] = 1;
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
      this.attackCd[i] = this.attackCd[last]!;
      this.contactDmg[i] = this.contactDmg[last]!;
      this.burnTime[i] = this.burnTime[last]!;
      this.burnDps[i] = this.burnDps[last]!;
      this.chillTime[i] = this.chillTime[last]!;
      this.chillMult[i] = this.chillMult[last]!;
      this.markTime[i] = this.markTime[last]!;
      this.markMult[i] = this.markMult[last]!;
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
  speed: 3.6, // tier-1 fodder: well under player base so early kiting reads clearly
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
  contactDamage: 22, // body-checks hurt — don't stand in the Gatekeeper
};

// Severance Lobber — first ranged class (T33). Hangs back (slow) and lobs a
// liability writ that cooks off on the ground, telegraphing its blast radius
// before it goes off. The general ranged framework also carries the future
// `gun` kind — see [[ranged-enemy-framework]].
export const SEVERANCE_LOBBER: EnemyType = {
  id: 'severance-lobber',
  radius: 0.6,
  maxHealth: 20,
  speed: 2.8,
  separationWeight: 0.9,
  variant: 3,
  threat: 6,
  attack: {
    kind: 'lob',
    range: 22,
    cooldown: 3.6,
    windup: 0.45,
    speed: 14,
    fuse: 1.0,
    blastRadius: 3.4,
    damage: 18,
  },
};

// Repossession Marshal — first gun enemy (T33). Fires straight rounds from range
// on a tight cooldown; lower per-hit damage than the lob but relentless, forcing
// the player to break line of sight / keep moving. Exercises the `gun` path of
// the ranged framework — see [[ranged-enemy-framework]].
export const REPO_MARSHAL: EnemyType = {
  id: 'repo-marshal',
  radius: 0.6,
  maxHealth: 16,
  speed: 3.2,
  separationWeight: 0.9,
  variant: 4,
  threat: 8,
  attack: {
    kind: 'gun',
    range: 26,
    cooldown: 1.8,
    speed: 30,
    damage: 8,
    spread: 0.12,
  },
};

// Foreclosure Mortar — long-range artillery zoner (T33). Slow and fragile-ish but
// lobs a heavy, wide, slow-fusing shell from across the arena: it denies space
// rather than chasing. Forces movement even when nothing is close.
export const FORECLOSURE_MORTAR: EnemyType = {
  id: 'foreclosure-mortar',
  radius: 0.7,
  maxHealth: 28,
  speed: 2.0,
  separationWeight: 0.8,
  variant: 5,
  threat: 12,
  attack: {
    kind: 'lob',
    range: 32,
    cooldown: 5.0,
    windup: 0.6,
    speed: 10,
    fuse: 1.4,
    blastRadius: 5.0,
    damage: 26,
  },
};

// Riot Shotgunner — close-range burst (T33). Fires a shotgun spray of pellets;
// brutal up close, harmless at distance — the counter is to keep it at range.
export const RIOT_SHOTGUNNER: EnemyType = {
  id: 'riot-shotgunner',
  radius: 0.6,
  maxHealth: 18,
  speed: 4.2,
  separationWeight: 0.9,
  variant: 6,
  threat: 9,
  attack: {
    kind: 'gun',
    range: 14,
    cooldown: 2.4,
    speed: 26,
    damage: 5,
    spread: 0.5,
    burst: 5,
  },
};

// Audit Brute — slow melee wall (T33). High HP, big body, and a punishing touch:
// it can't be ignored or bodyblocked casually. The melee counterweight to the
// ranged classes; rewards kiting and burst damage.
export const AUDIT_BRUTE: EnemyType = {
  id: 'audit-brute',
  radius: 1.1,
  maxHealth: 90,
  speed: 2.6,
  separationWeight: 0.5,
  variant: 7,
  threat: 16,
  contactDamage: 16,
};

/** Display names by variant — for HUD intros / readouts (T33). */
export const ENEMY_DISPLAY_NAME: readonly string[] = [
  'Rust Mite',
  'Debt Hound',
  'Gatekeeper of Phobos',
  'Severance Lobber',
  'Repossession Marshal',
  'Foreclosure Mortar',
  'Riot Shotgunner',
  'Audit Brute',
];

/** Variant index → enemy type, so SoA-pooled enemies recover their def (and
 *  attack profile) at runtime without storing it per instance. */
export const ENEMY_BY_VARIANT: readonly (EnemyType | undefined)[] = [
  RUST_MITE,
  DEBT_HOUND,
  BOSS_GATEKEEPER,
  SEVERANCE_LOBBER,
  REPO_MARSHAL,
  FORECLOSURE_MORTAR,
  RIOT_SHOTGUNNER,
  AUDIT_BRUTE,
];

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
