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
  FROSTBITE_AUDITOR,
  LIABILITY_BLOB,
  PHASE_STALKER,
  SpawnKind,
  type EnemyType,
} from '../enemies';
import type { Rng } from '../../core/rng';
import type { FxQueue } from '../fx';
import { GATE_COUNT } from '../constants';
import { gateOuterPoint, interiorPoint } from '../arena';

const TELEGRAPH = 1.1; // gate-doors open + enemy walks in during this window (T37)
const TELE_TELEGRAPH = 1.0; // teleport materialize tell before the stalker is live (V9)
const TELE_AT = 60; // seconds → Phase Stalkers start blinking in
const TELE_PERIOD = 14; // base seconds between teleport waves (shrinks late)
const CHEAPEST = RUST_MITE.threat;
const HARD_CAP = 1200; // absolute ceiling regardless of curve (≤ pool capacity, V8)
const BOSS_AT = 90; // escalation-time seconds → Gatekeeper milestone spawn (T33/T29)
// The whole pre-boss timeline is stretched by this factor: the director reads
// elapsed/TIMELINE_STRETCH for ALL escalation (budget, waves, patterns, variant
// intros, teleporters, the boss), so spawn pressure, enemy variety, and the boss
// all arrive 3× later with the SAME shape — a longer, more gradual ramp. Real boss
// time = BOSS_AT × TIMELINE_STRETCH = 270s. dt-based accrual stays real-time.
export const TIMELINE_STRETCH = 3;

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
    threatPoints: 3.0 + elapsed * 0.15,
    maxConcurrentEnemies: Math.min(HARD_CAP, Math.floor(6 + elapsed * 1.6)),
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
    this.teleTimer = TELE_PERIOD;
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
    // Specials (elites + RANGED) are a small, slowly-growing SLICE of the swarm —
    // they spice the fodder, never replace it. ONE gate decides "special or
    // fodder" so their combined rate stays bounded (the old per-type rolls summed
    // up to a shooter-dominated mid-game). A second roll picks an unlocked type;
    // ranged classes unlock late + rare so the early game stays fair (V12 bounded).
    const specialChance = Math.min(0.3, Math.max(0, elapsed - 35) * 0.0035);
    if (rng.next() < specialChance) {
      const r = rng.next();
      // Melee Brute first; ranged classes ramp in much later and stay a minority.
      if (elapsed > 40 && r < 0.18) return LIABILITY_BLOB; // splitter (AoE check)
      if (elapsed > 50 && r < 0.3) return SEVERANCE_LOBBER; // lobbed AoE
      if (elapsed > 70 && r < 0.4) return RIOT_SHOTGUNNER; // close burst
      if (elapsed > 80 && r < 0.48) return FROSTBITE_AUDITOR; // cryo
      if (elapsed > 90 && r < 0.56) return REPO_MARSHAL; // gun
      if (elapsed > 110 && r < 0.62) return FORECLOSURE_MORTAR; // artillery
      return AUDIT_BRUTE; // the bulk of specials are the melee wall
    }
    // Fodder: Rust Mites + a growing minority of Debt Hounds.
    if (elapsed > 25) {
      const p = Math.min(0.4, (elapsed - 25) * 0.006 + houndBias);
      if (rng.next() < p) return DEBT_HOUND;
    }
    return RUST_MITE;
  }

  private spawnAtGate(pool: EnemyPool, rng: Rng, type: EnemyType): boolean {
    const gate = rng.int(0, GATE_COUNT - 1);
    // Appear OUTSIDE the gate; the telegraph walk carries them in (shape-aware).
    const p = gateOuterPoint(gate, rng.range(-1, 1), 2.5);
    return pool.spawn(type, p.x, p.z, TELEGRAPH, this.phase++) >= 0;
  }

  /** Spawn-time HP scale for fodder this step (run-phase escalation, T44). */
  private hpScale = 1;
  private teleTimer = TELE_PERIOD; // countdown to the next teleport wave (T33+)

  step(
    pool: EnemyPool,
    rng: Rng,
    elapsed: number,
    dt: number,
    adapt: Adaptation = NEUTRAL_ADAPT,
    hpScale = 1,
    fx?: FxQueue,
  ): void {
    this.hpScale = hpScale;
    // Stretch the escalation clock: every threshold below reads this slowed time,
    // so the run ramps over ~270s instead of ~90s (dt accrual stays real-time).
    elapsed = elapsed / TIMELINE_STRETCH;
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

    // Phase Stalkers: a separate cadence that IGNORES the gates and materializes
    // at interior points — so the player can't just watch the perimeter (V9 tell).
    if (elapsed >= TELE_AT) {
      this.teleTimer -= dt;
      if (this.teleTimer <= 0) {
        this.teleTimer = Math.max(6, TELE_PERIOD - (elapsed - TELE_AT) * 0.04);
        const n = elapsed > 130 ? 2 : 1;
        for (let k = 0; k < n; k++) this.spawnTeleporter(pool, rng, cap, fx);
      }
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

  /** Choose this wave's pressure shape. The DEFAULT is ONE gate at a time
   *  (Single, or Sweep which is a single rotating gate) — so on average a wave
   *  comes from one direction and is leadable. Multi-gate shapes (Adjacent /
   *  Opposing / Surround) are occasional pressure SPIKES that grow over the run. */
  private choosePattern(rng: Rng, elapsed: number): Pattern {
    const r = rng.next();
    // Calm open: almost always a single gate, rare two-gate nudge.
    if (elapsed < 25) return r < 0.78 ? Pattern.Single : Pattern.Adjacent;
    if (elapsed < 60) {
      // Single-gate baseline (Single + Sweep ≈ 78%); occasional pincer.
      return r < 0.5
        ? Pattern.Single
        : r < 0.78
          ? Pattern.Sweep
          : r < 0.92
            ? Pattern.Adjacent
            : Pattern.Opposing;
    }
    // Late: single still the plurality (~64% via Single+Sweep), multi-gate spikes
    // more often, with a rare full Surround.
    return r < 0.4
      ? Pattern.Single
      : r < 0.64
        ? Pattern.Sweep
        : r < 0.82
          ? Pattern.Opposing
          : r < 0.93
            ? Pattern.Adjacent
            : Pattern.Surround;
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
    // Tight cluster at one gate: small along-edge jitter + a depth stagger so
    // they don't overlap. The telegraph walk marches them out (shape-aware).
    const p = gateOuterPoint(gate, rng.range(-0.4, 0.4), 2.5 - rng.range(0, 1.5));
    return pool.spawn(type, p.x, p.z, TELEGRAPH, this.phase++, this.hpScale) >= 0;
  }

  /** Materialize a Phase Stalker at a random INTERIOR point (not a gate). The
   *  telegraph window + the render-side materialize FX make it dodgeable (V9). */
  private spawnTeleporter(pool: EnemyPool, rng: Rng, cap: number, fx?: FxQueue): void {
    if (pool.count >= cap) return;
    const p = interiorPoint(rng.next(), rng.next(), 0.3, 0.82); // interior, off the edge kite
    const x = p.x;
    const z = p.z;
    if (
      pool.spawn(
        PHASE_STALKER,
        x,
        z,
        TELE_TELEGRAPH,
        this.phase++,
        this.hpScale,
        SpawnKind.Teleport,
      ) >= 0
    ) {
      fx?.push('teleport', x, z);
    }
  }
}

/**
 * Run-phase difficulty scale (T44): a global multiplier on FODDER health so the
 * roster keeps pace with the player's growing damage — the curve ramps with time
 * AND steps up per boss kill (bosses are the progression hinge, §G). Bounded
 * growth, deterministic (pure function of run state). Boss HP is NOT scaled.
 */
export function difficultyScale(elapsed: number, bossKills: number): number {
  // Bosses are the progression hinge (§G): NO time-based HP growth until the first
  // boss falls. Pre-boss, every unit spawns at base HP — the field never quietly
  // inflates. After a kill, HP steps up per boss and ramps with time BETWEEN bosses
  // (stretched to the slowed escalation clock). Applied at spawn only; live units
  // are never re-scaled on the field.
  if (bossKills <= 0) return 1;
  return 1 + bossKills * 0.7 + (elapsed / TIMELINE_STRETCH) * 0.014;
}

/** Seconds between waves — long at the open, shrinking to a floor. */
function waveGap(elapsed: number): number {
  return Math.max(WAVE_GAP_MIN, WAVE_GAP_START - elapsed * 0.035);
}

/** Max enemies per gate this wave — small groups that grow over the run. */
function waveGroup(elapsed: number): number {
  return 3 + Math.floor(elapsed / 18);
}
