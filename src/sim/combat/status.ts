// Status-effect system (T39, §5.4 status step). Per-enemy status lives in the
// EnemyPool SoA (burn/chill/mark now; corrode/infection/shock framework to come).
// Applied on-hit (chance/stacks/duration are upgrade outputs), ticked once per
// sim step in pipeline order. Burn deals damage through the centralized pipeline
// (V3), pooled, deterministic under the shared rng (V16, V21).

import type { EnemyPool } from '../enemies';
import { EnemyState } from '../enemies';
import type { Rng } from '../../core/rng';
import type { FxQueue } from '../fx';
import { makePacket, computeOutgoing, applyMitigation } from './damage';

export type StatusType = 'burn' | 'chill' | 'mark' | 'shock' | 'corrode' | 'bleed';

/** Per-status stack ceilings (bounded, V5 — ⊥ infinite accumulation). */
const MAX_STACKS: Record<'shock' | 'corrode' | 'bleed', number> = {
  shock: 6,
  corrode: 10,
  bleed: 12,
};
/** Corrosion armor-shred: each stack amplifies incoming damage by this (proxy
 *  until enemy armor exists). Read via `corrodeAmp`. */
const CORRODE_PER_STACK = 0.06;

export interface StatusOpts {
  /** Application chance 0..1 (rolled by caller or here). */
  chance?: number;
  duration: number;
  /** Burn / bleed damage-per-second (bleed is per-stack). */
  dps?: number;
  /** Chill movement multiplier (e.g. 0.6 = 40% slow). */
  slowMult?: number;
  /** Mark status-damage amplifier (e.g. 1.5 = +50%). */
  amplify?: number;
  /** Stacks added for stacking statuses (shock/corrode/bleed). Default 1. */
  stacks?: number;
}

/** Incoming-damage multiplier from corrosion on enemy `i` (1 = none). Read by the
 *  weapon system so corroded targets take more (armor-shred, V3-routed). */
export function corrodeAmp(pool: EnemyPool, i: number): number {
  return 1 + pool.corrodeStacks[i]! * CORRODE_PER_STACK;
}

/**
 * Apply (or refresh) a status on enemy `i`. Duration refreshes to the longer of
 * current/new; potency takes the stronger value (no infinite stacking, bounded).
 * Returns true if applied.
 */
export function applyStatus(
  pool: EnemyPool,
  i: number,
  type: StatusType,
  opts: StatusOpts,
): boolean {
  if (i < 0 || i >= pool.count) return false;
  switch (type) {
    case 'burn':
      pool.burnTime[i] = Math.max(pool.burnTime[i]!, opts.duration);
      pool.burnDps[i] = Math.max(pool.burnDps[i]!, opts.dps ?? 0);
      return true;
    case 'chill':
      pool.chillTime[i] = Math.max(pool.chillTime[i]!, opts.duration);
      // Stronger slow = smaller multiplier.
      pool.chillMult[i] = Math.min(pool.chillMult[i]!, opts.slowMult ?? 0.6);
      return true;
    case 'mark':
      pool.markTime[i] = Math.max(pool.markTime[i]!, opts.duration);
      pool.markMult[i] = Math.max(pool.markMult[i]!, opts.amplify ?? 1.5);
      return true;
    case 'shock':
      pool.shockTime[i] = Math.max(pool.shockTime[i]!, opts.duration);
      pool.shockStacks[i] = Math.min(MAX_STACKS.shock, pool.shockStacks[i]! + (opts.stacks ?? 1));
      return true;
    case 'corrode':
      pool.corrodeTime[i] = Math.max(pool.corrodeTime[i]!, opts.duration);
      pool.corrodeStacks[i] = Math.min(
        MAX_STACKS.corrode,
        pool.corrodeStacks[i]! + (opts.stacks ?? 1),
      );
      return true;
    case 'bleed':
      pool.bleedTime[i] = Math.max(pool.bleedTime[i]!, opts.duration);
      pool.bleedStacks[i] = Math.min(MAX_STACKS.bleed, pool.bleedStacks[i]! + (opts.stacks ?? 1));
      pool.bleedDps[i] = Math.max(pool.bleedDps[i]!, opts.dps ?? 0);
      return true;
  }
}

/**
 * Tick all statuses for one sim step. Decrements timers, restores chill/mark to
 * neutral on expiry, and applies burn damage (amplified by an active mark) via
 * the pipeline. Returns total health removed (for run stats, V20).
 */
export function tickStatus(pool: EnemyPool, rng: Rng, dt: number, fx: FxQueue): number {
  let dealt = 0;
  for (let i = 0; i < pool.count; i++) {
    if (pool.state[i] !== EnemyState.Active) continue;

    // Mark amplifier (read before tick so this step's burn benefits).
    const markActive = pool.markTime[i]! > 0;
    const amp = markActive ? pool.markMult[i]! : 1;
    if (markActive) {
      pool.markTime[i]! -= dt;
      if (pool.markTime[i]! <= 0) {
        pool.markTime[i] = 0;
        pool.markMult[i] = 1;
      }
    }

    // Chill: count down, restore speed multiplier on expiry.
    if (pool.chillTime[i]! > 0) {
      pool.chillTime[i]! -= dt;
      if (pool.chillTime[i]! <= 0) {
        pool.chillTime[i] = 0;
        pool.chillMult[i] = 1;
      }
    }

    // Burn: damage over time, amplified by mark, routed through the pipeline.
    if (pool.burnTime[i]! > 0 && pool.burnDps[i]! > 0) {
      pool.burnTime[i]! -= dt;
      const packet = makePacket({
        weaponId: 'burn',
        baseDamage: pool.burnDps[i]! * dt * amp,
        damageType: 'thermal',
      });
      const out = computeOutgoing(packet, rng);
      const mit = applyMitigation(out.amount, 0, 0);
      const removed = Math.min(mit.toHealth, pool.health[i]!);
      pool.health[i]! -= mit.toHealth;
      dealt += removed;
      // Burn ticks float a number too (aggregation tallies the small ticks).
      fx.push('dmg', pool.posX[i]!, pool.posZ[i]!, removed, 0, 0);
      if (pool.burnTime[i]! <= 0) {
        pool.burnTime[i] = 0;
        pool.burnDps[i] = 0;
      } else if (rng.next() < 0.25) {
        // Visual-only ember fleck — 'ember' never triggers a sound (the per-tick
        // 'impact' sfx on burning crowds was an awful per-frame fire drone).
        fx.push('ember', pool.posX[i]!, pool.posZ[i]!);
      }
    }

    // Bleed: stacking DoT (dps × stacks), mark-amplified, routed through V3.
    if (pool.bleedTime[i]! > 0 && pool.bleedDps[i]! > 0 && pool.bleedStacks[i]! > 0) {
      pool.bleedTime[i]! -= dt;
      const packet = makePacket({
        weaponId: 'bleed',
        baseDamage: pool.bleedDps[i]! * pool.bleedStacks[i]! * dt * amp,
        damageType: 'kinetic',
      });
      const out = computeOutgoing(packet, rng);
      const mit = applyMitigation(out.amount, 0, 0);
      const removed = Math.min(mit.toHealth, pool.health[i]!);
      pool.health[i]! -= mit.toHealth;
      dealt += removed;
      fx.push('dmg', pool.posX[i]!, pool.posZ[i]!, removed, 0, 0);
      if (pool.bleedTime[i]! <= 0) {
        pool.bleedTime[i] = 0;
        pool.bleedStacks[i] = 0;
        pool.bleedDps[i] = 0;
      }
    }

    // Shock + corrode: passive markers (primers for reactions T53). Count down,
    // clear stacks on expiry. No standalone damage — corrode's amp is read on-hit.
    if (pool.shockTime[i]! > 0) {
      pool.shockTime[i]! -= dt;
      if (pool.shockTime[i]! <= 0) {
        pool.shockTime[i] = 0;
        pool.shockStacks[i] = 0;
      }
    }
    if (pool.corrodeTime[i]! > 0) {
      pool.corrodeTime[i]! -= dt;
      if (pool.corrodeTime[i]! <= 0) {
        pool.corrodeTime[i] = 0;
        pool.corrodeStacks[i] = 0;
      }
    }
  }
  return dealt;
}
