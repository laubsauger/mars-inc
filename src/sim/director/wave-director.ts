// Budgeted wave director (T20). Replaces the placeholder spawner. Accrues threat
// points over run time and spends them on enemies through the gates with a
// telegraph (V9). The concurrent cap is a hard ceiling (V8: count never exceeds
// maxConcurrentEnemies, and the bank is clamped so it can't hoard).

import type { EnemyPool } from '../enemies';
import { RUST_MITE, DEBT_HOUND, BOSS_GATEKEEPER, type EnemyType } from '../enemies';
import type { Rng } from '../../core/rng';
import { ARENA_RADIUS, GATE_COUNT } from '../constants';

const TELEGRAPH = 0.6;
const CHEAPEST = RUST_MITE.threat;
const HARD_CAP = 1200; // absolute ceiling regardless of curve (≤ pool capacity, V8)
const BOSS_AT = 90; // seconds → Gatekeeper milestone spawn (T33/T29)

export interface SpawnBudget {
  threatPoints: number; // accrual rate (points/sec) at this time
  maxConcurrentEnemies: number;
  eliteBudget: number;
  rangedBudget: number;
  hazardBudget: number;
}

// Adaptive composition (T21, §8.4, V12). Adapt the MIX and PACE to the player's
// build — never scale per-enemy stats to player damage (that makes upgrades feel
// fake). Bounded: pace and bias are hard-clamped so adaptation stays subtle.

export interface AdaptInput {
  damageMult: number;
  fireRateMult: number;
  projectileCount: number;
}

export interface Adaptation {
  pace: number; // threat-accrual multiplier
  houndBias: number; // added probability of fielding a tankier Debt Hound
}

const PACE_MIN = 0.8;
const PACE_MAX = 1.4;
const BIAS_MAX = 0.3;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const NEUTRAL_ADAPT: Adaptation = { pace: 1, houndBias: 0 };

/**
 * Pure mapping from build signals to a bounded adaptation. Overperforming
 * offense (more damage / fire rate) accelerates the schedule; area/multishot
 * builds meet a few more tanky targets instead of pure swarm. Always clamped.
 */
export function computeAdaptation(b: AdaptInput): Adaptation {
  const offense = (b.damageMult - 1) * 0.5 + (b.fireRateMult - 1) * 0.5;
  const pace = clamp(1 + offense * 0.4, PACE_MIN, PACE_MAX);
  const houndBias = clamp((b.projectileCount - 1) * 0.06, 0, BIAS_MAX);
  return { pace, houndBias };
}

/** Budget as a function of elapsed run seconds. Tunable curve (§8.3). */
export function budgetAt(elapsed: number): SpawnBudget {
  return {
    // Gentler opening: less threat/sec and a lower concurrent floor early so the
    // first minute breathes; still ramps to a heavy late game (monotonic).
    threatPoints: 1.0 + elapsed * 0.12,
    maxConcurrentEnemies: Math.min(HARD_CAP, Math.floor(8 + elapsed * 2.1)),
    eliteBudget: Math.floor(elapsed / 30),
    rangedBudget: 0,
    hazardBudget: 0,
  };
}

export class WaveDirector {
  private bank = 0;
  private phase = 0;
  private boss = false; // Gatekeeper milestone fired this run

  reset(): void {
    this.bank = 0;
    this.phase = 0;
    this.boss = false;
  }

  /** Current bank of unspent threat points (dev overlay). */
  get banked(): number {
    return this.bank;
  }

  /** Whether the boss milestone has fired this run (dev overlay / run state). */
  get bossSpawned(): boolean {
    return this.boss;
  }

  private pickType(rng: Rng, elapsed: number, houndBias: number): EnemyType {
    // Debt Hounds start appearing after ~25s, with rising probability + build bias.
    if (elapsed > 25) {
      const p = Math.min(0.5, (elapsed - 25) * 0.01 + houndBias);
      if (rng.next() < p) return DEBT_HOUND;
    }
    return RUST_MITE;
  }

  private spawnAtGate(pool: EnemyPool, rng: Rng, type: EnemyType): boolean {
    const gate = rng.int(0, GATE_COUNT - 1);
    const angle = (gate / GATE_COUNT) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const r = ARENA_RADIUS - 1.5;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    return pool.spawn(type, x, z, TELEGRAPH, this.phase++) >= 0;
  }

  step(
    pool: EnemyPool,
    rng: Rng,
    elapsed: number,
    dt: number,
    adapt: Adaptation = NEUTRAL_ADAPT,
  ): void {
    const b = budgetAt(elapsed);
    const pace = clamp(adapt.pace, PACE_MIN, PACE_MAX); // re-clamp: director owns bounds (V12)
    const houndBias = clamp(adapt.houndBias, 0, BIAS_MAX);
    this.bank += b.threatPoints * pace * dt;

    const cap = Math.min(b.maxConcurrentEnemies, pool.capacity);

    // Boss milestone: claim a free slot before the fodder fill so the concurrent
    // count never exceeds the cap (V8). Spawned free (not bought from the bank).
    if (!this.boss && elapsed >= BOSS_AT && pool.count < cap) {
      if (this.spawnAtGate(pool, rng, BOSS_GATEKEEPER)) this.boss = true;
    }

    while (pool.count < cap && this.bank >= CHEAPEST) {
      const type = this.pickType(rng, elapsed, houndBias);
      if (this.bank < type.threat) {
        // Can't afford the rolled type this tick; spend on the cheapest instead
        // so the bank keeps flowing rather than stalling on an expensive roll.
        if (this.bank < CHEAPEST) break;
        if (!this.spawnAtGate(pool, rng, RUST_MITE)) break;
        this.bank -= RUST_MITE.threat;
        continue;
      }
      if (!this.spawnAtGate(pool, rng, type)) break; // pool full
      this.bank -= type.threat;
    }

    // Clamp so idle frames can't accumulate an unbounded burst (V8 bounded).
    this.bank = Math.min(this.bank, b.threatPoints * 4 + CHEAPEST);
  }
}
