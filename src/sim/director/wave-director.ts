// Budgeted wave director (T20). Replaces the placeholder spawner. Accrues threat
// points over run time and spends them on enemies through the gates with a
// telegraph (V9). The concurrent cap is a hard ceiling (V8: count never exceeds
// maxConcurrentEnemies, and the bank is clamped so it can't hoard).

import type { EnemyPool } from '../enemies';
import {
  RUST_MITE,
  DEBT_HOUND,
  BOSS_GATEKEEPER,
  SEVERANCE_LOBBER,
  REPO_MARSHAL,
  FORECLOSURE_MORTAR,
  RIOT_SHOTGUNNER,
  AUDIT_BRUTE,
  type EnemyType,
} from '../enemies';
import type { Rng } from '../../core/rng';
import { ARENA_RADIUS, GATE_COUNT } from '../constants';

const TELEGRAPH = 1.1; // gate-doors open + enemy walks in during this window (T37)
const CHEAPEST = RUST_MITE.threat;
const HARD_CAP = 1200; // absolute ceiling regardless of curve (≤ pool capacity, V8)
const BOSS_AT = 90; // seconds → Gatekeeper milestone spawn (T33/T29)

// Wave rhythm (T33 pacing): spawn in clustered PULSES with breathers between —
// not a constant fill. Early waves are small groups from 2 of the 4 gates; the
// gap shrinks, groups grow, and more gates open as the run escalates.
const WAVE_GAP_START = 2.5; // seconds between waves at the open
const WAVE_GAP_MIN = 1.0; // late-game floor

// Directional spawn patterns. Kiting makes WHERE enemies come from the real
// pressure dial: a wave from one gate is easy to lead away from; opposing gates
// pincer you; a clockwise sweep keeps rotating the threat; surround removes the
// escape. Patterns escalate from kiteable to overwhelming over the run.
const enum Pattern {
  Single = 0, // one gate — low pressure
  Adjacent = 1, // two neighbours — push from one side
  Opposing = 2, // two opposite gates — pincer, breaks straight-line kiting
  Sweep = 3, // single gate rotating clockwise each wave — rotating pressure
  Surround = 4, // all four gates — nowhere to run
}

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
    // Opening accrual must fund the first clustered pulses (waveGroup × gates),
    // else the bank trickle starves the waves and almost nothing spawns in the
    // first minute. Still gentle vs late game and monotonic (V8).
    threatPoints: 4.5 + elapsed * 0.25,
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
  private waveTimer = 1.0; // first wave lands shortly after the countdown
  private sweepGate = 0; // clockwise cursor for the Sweep pattern

  reset(): void {
    this.bank = 0;
    this.phase = 0;
    this.boss = false;
    this.waveTimer = 1.0;
    this.sweepGate = 0;
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
    // Severance Lobbers (ranged) start trickling in after ~45s. Gated by time so
    // the early-game rng stream is untouched (determinism stays stable, V16).
    // Audit Brutes (melee wall) start showing up around 40s.
    if (elapsed > 40 && rng.next() < Math.min(0.12, (elapsed - 40) * 0.003)) {
      return AUDIT_BRUTE;
    }
    if (elapsed > 45 && rng.next() < Math.min(0.18, (elapsed - 45) * 0.004)) {
      return SEVERANCE_LOBBER;
    }
    // Riot Shotgunners (close burst) push the player to keep distance.
    if (elapsed > 50 && rng.next() < Math.min(0.14, (elapsed - 50) * 0.003)) {
      return RIOT_SHOTGUNNER;
    }
    // Repossession Marshals (gun) trickle in a bit later than the lobbers.
    if (elapsed > 60 && rng.next() < Math.min(0.15, (elapsed - 60) * 0.003)) {
      return REPO_MARSHAL;
    }
    // Foreclosure Mortars (long-range artillery) are a rare late-game zoner.
    if (elapsed > 75 && rng.next() < Math.min(0.08, (elapsed - 75) * 0.002)) {
      return FORECLOSURE_MORTAR;
    }
    // Debt Hounds start appearing after ~25s, with rising probability + build bias.
    if (elapsed > 25) {
      const p = Math.min(0.5, (elapsed - 25) * 0.01 + houndBias);
      if (rng.next() < p) return DEBT_HOUND;
    }
    return RUST_MITE;
  }

  private spawnAtGate(pool: EnemyPool, rng: Rng, type: EnemyType): boolean {
    const gate = rng.int(0, GATE_COUNT - 1);
    const angle = (gate / GATE_COUNT) * Math.PI * 2 + rng.range(-0.12, 0.12);
    // Appear INSIDE the recessed portal tunnel (behind the blast doors); the
    // telegraph walk then carries them out through the opening into the arena, so
    // they read as marching out of the gate, not popping in front of it (T40).
    const r = ARENA_RADIUS + 2.5;
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

    // Wave rhythm: hold spawns between pulses (the breather), then release a
    // clustered burst from a growing subset of gates. The bank built up during
    // the breather is what funds the burst — so waves naturally scale with the
    // budget curve while the arena gets moments to breathe.
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer = waveGap(elapsed);
      this.spawnWave(pool, rng, elapsed, houndBias, cap);
    }

    // Clamp so a long breather can't accumulate an unbounded burst (V8 bounded).
    this.bank = Math.min(this.bank, b.threatPoints * 4 + CHEAPEST);
  }

  /** Release one wave: tight clustered groups from the gates a directional
   *  pattern selects (the pressure shape — single / pincer / sweep / surround). */
  private spawnWave(
    pool: EnemyPool,
    rng: Rng,
    elapsed: number,
    houndBias: number,
    cap: number,
  ): void {
    const gates = this.gatesFor(this.choosePattern(rng, elapsed), rng);
    const perGate = waveGroup(elapsed);
    // Round-robin across the chosen gates so a small early bank spreads to all
    // sides (2 units from 2 gates) instead of piling onto the first gate.
    for (let k = 0; k < perGate; k++) {
      for (const gate of gates) {
        if (pool.count >= cap || this.bank < CHEAPEST) return;
        const rolled = this.pickType(rng, elapsed, houndBias);
        const type = this.bank >= rolled.threat ? rolled : RUST_MITE;
        if (this.bank < type.threat) return;
        if (!this.spawnCluster(pool, rng, gate, type)) return; // pool full
        this.bank -= type.threat;
      }
    }
  }

  /** Choose this wave's pressure shape — gentle/kiteable early, relentless late. */
  private choosePattern(rng: Rng, elapsed: number): Pattern {
    const r = rng.next();
    // Open with two-sided pressure (a couple units from two gates) so the very
    // first pulse already reads as a fight, not a lone straggler.
    if (elapsed < 20) return r < 0.6 ? Pattern.Adjacent : Pattern.Opposing;
    if (elapsed < 45) {
      return r < 0.25
        ? Pattern.Adjacent
        : r < 0.55
          ? Pattern.Opposing
          : r < 0.85
            ? Pattern.Sweep
            : Pattern.Surround;
    }
    return r < 0.3 ? Pattern.Opposing : r < 0.6 ? Pattern.Sweep : Pattern.Surround;
  }

  /** Resolve a pattern to the gate indices it spawns from this wave. */
  private gatesFor(pattern: Pattern, rng: Rng): number[] {
    switch (pattern) {
      case Pattern.Single:
        return [rng.int(0, GATE_COUNT - 1)];
      case Pattern.Adjacent: {
        const g = rng.int(0, GATE_COUNT - 1);
        return [g, (g + 1) % GATE_COUNT];
      }
      case Pattern.Opposing: {
        const g = rng.int(0, 1); // 0&2 or 1&3 — directly opposed
        return [g, g + 2];
      }
      case Pattern.Sweep: {
        const g = this.sweepGate;
        this.sweepGate = (this.sweepGate + 1) % GATE_COUNT; // rotate clockwise
        return [g];
      }
      case Pattern.Surround:
        return [0, 1, 2, 3];
    }
  }

  /** Spawn one enemy tightly clustered at a single gate (small arc + depth jitter). */
  private spawnCluster(pool: EnemyPool, rng: Rng, gate: number, type: EnemyType): boolean {
    const angle = (gate / GATE_COUNT) * Math.PI * 2 + rng.range(-0.05, 0.05);
    // Inside the portal tunnel, behind the doors (T40); slight depth stagger keeps
    // the cluster from overlapping. The telegraph walk marches them out the gate.
    const r = ARENA_RADIUS + 2.5 - rng.range(0, 1.5);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    return pool.spawn(type, x, z, TELEGRAPH, this.phase++) >= 0;
  }
}

/** Seconds between waves — long at the open, shrinking to a floor. */
function waveGap(elapsed: number): number {
  return Math.max(WAVE_GAP_MIN, WAVE_GAP_START - elapsed * 0.035);
}

/** Max enemies per gate this wave — small groups that grow over the run. */
function waveGroup(elapsed: number): number {
  return 3 + Math.floor(elapsed / 18);
}
