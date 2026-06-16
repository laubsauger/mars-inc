// Status-reaction engine (T53, V28). Status effects react CHEMICALLY: when an
// enemy carries two primed statuses, the reaction CONSUMES both stack-sets
// atomically and releases a burst — AoE damage routed through the V3 pipeline
// (pooled, deterministic V16/V21), a brief vulnerability (mark), and boss-stagger.
// Reactions are OFF until an upgrade enables them (BuildEffects.enableReaction),
// so the base game is unchanged; T54 ships the primer→catastrophe card chains.

import type { EnemyPool } from '../enemies';
import { EnemyState } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Rng } from '../../core/rng';
import { type FxQueue, ImpactProfile } from '../fx';
import type { DamageType } from './damage';
import { applyAreaDamage } from './aoe';
import { applyStatus, type StatusType } from './status';

export type ReactionId =
  | 'thermalShock'
  | 'plasmaBloom'
  | 'rustLightning'
  | 'bloodCrystal'
  | 'acidFog';

export interface StatusReaction {
  id: ReactionId;
  name: string;
  /** The two statuses that must BOTH be primed (intensity ≥ threshold). */
  a: StatusType;
  thresholdA: number;
  b: StatusType;
  thresholdB: number;
  /** Burst released on the reaction. */
  burst: number;
  radius: number;
  damageType: DamageType;
  /** Brief vulnerability applied to the reacting enemy (mark amplify+duration). */
  vulnDuration: number;
  vulnAmplify: number;
  /** Boss-stagger contributed (accumulated by the caller). */
  stagger: number;
}

/** The 5 named reactions (§T54 chains build their cards on these). Burn/chill are
 *  presence-based (threshold 1); shock/corrode/bleed thresholds count stacks. */
export const REACTIONS: readonly StatusReaction[] = [
  {
    id: 'thermalShock',
    name: 'Thermal Shock',
    a: 'burn',
    thresholdA: 1,
    b: 'chill',
    thresholdB: 1,
    burst: 42,
    radius: 4,
    damageType: 'explosive',
    vulnDuration: 3,
    vulnAmplify: 1.5,
    stagger: 30,
  },
  {
    id: 'plasmaBloom',
    name: 'Plasma Bloom',
    a: 'burn',
    thresholdA: 1,
    b: 'shock',
    thresholdB: 3,
    burst: 32,
    radius: 3,
    damageType: 'energy',
    vulnDuration: 2.5,
    vulnAmplify: 1.4,
    stagger: 20,
  },
  {
    id: 'rustLightning',
    name: 'Rust Lightning',
    a: 'corrode',
    thresholdA: 2,
    b: 'shock',
    thresholdB: 1,
    burst: 26,
    radius: 3,
    damageType: 'energy',
    vulnDuration: 2.5,
    vulnAmplify: 1.3,
    stagger: 18,
  },
  {
    id: 'bloodCrystal',
    name: 'Blood Crystal',
    a: 'bleed',
    thresholdA: 3,
    b: 'chill',
    thresholdB: 1,
    burst: 34,
    radius: 3.5,
    damageType: 'kinetic',
    vulnDuration: 3,
    vulnAmplify: 1.4,
    stagger: 22,
  },
  {
    id: 'acidFog',
    name: 'Acid Fog',
    a: 'corrode',
    thresholdA: 2,
    b: 'burn',
    thresholdB: 1,
    burst: 22,
    radius: 4.5,
    damageType: 'thermal',
    vulnDuration: 3,
    vulnAmplify: 1.3,
    stagger: 16,
  },
];

/** Status intensity used to prime reactions: time-based statuses report presence
 *  (1 active / 0 not); stacking statuses report their stack count. */
function intensity(pool: EnemyPool, i: number, s: StatusType): number {
  switch (s) {
    case 'burn':
      return pool.burnTime[i]! > 0 ? 1 : 0;
    case 'chill':
      return pool.chillTime[i]! > 0 ? 1 : 0;
    case 'mark':
      return pool.markTime[i]! > 0 ? 1 : 0;
    case 'shock':
      return pool.shockStacks[i]!;
    case 'corrode':
      return pool.corrodeStacks[i]!;
    case 'bleed':
      return pool.bleedStacks[i]!;
  }
}

/** Zero a status's fields on enemy `i` (atomic consume before the burst, V28). */
function consume(pool: EnemyPool, i: number, s: StatusType): void {
  switch (s) {
    case 'burn':
      pool.burnTime[i] = 0;
      pool.burnDps[i] = 0;
      break;
    case 'chill':
      pool.chillTime[i] = 0;
      pool.chillMult[i] = 1;
      break;
    case 'mark':
      pool.markTime[i] = 0;
      pool.markMult[i] = 1;
      break;
    case 'shock':
      pool.shockTime[i] = 0;
      pool.shockStacks[i] = 0;
      break;
    case 'corrode':
      pool.corrodeTime[i] = 0;
      pool.corrodeStacks[i] = 0;
      break;
    case 'bleed':
      pool.bleedTime[i] = 0;
      pool.bleedStacks[i] = 0;
      pool.bleedDps[i] = 0;
      break;
  }
}

export interface ReactionResult {
  dealt: number;
  count: number;
  stagger: number;
}

/** Called once per fired reaction (cross-upgrade hook: Feedback Loop, etc, T54). */
export type OnReaction = (r: StatusReaction, x: number, z: number, dealt: number) => void;

/**
 * Scan active enemies; for each ENABLED reaction whose two statuses are primed,
 * consume both atomically and release the burst (AoE via V3, vuln, stagger).
 * One reaction per enemy per step (statuses are gone after). Deterministic: enemy
 * index order, fixed reaction order, shared rng. Returns totals for run stats.
 */
export function resolveReactions(
  pool: EnemyPool,
  hash: SpatialHash,
  rng: Rng,
  fx: FxQueue,
  enabled: ReadonlySet<ReactionId>,
  onReaction?: OnReaction,
): ReactionResult {
  let dealt = 0;
  let count = 0;
  let stagger = 0;
  if (enabled.size === 0) return { dealt, count, stagger };

  for (let i = 0; i < pool.count; i++) {
    if (pool.state[i] !== EnemyState.Active) continue;
    for (let k = 0; k < REACTIONS.length; k++) {
      const r = REACTIONS[k]!;
      if (!enabled.has(r.id)) continue;
      if (intensity(pool, i, r.a) < r.thresholdA || intensity(pool, i, r.b) < r.thresholdB) {
        continue;
      }
      // Atomic consume BEFORE the burst (V28 — no double-spend).
      consume(pool, i, r.a);
      consume(pool, i, r.b);
      const x = pool.posX[i]!;
      const z = pool.posZ[i]!;
      const d = applyAreaDamage(
        pool,
        hash,
        x,
        z,
        r.radius,
        { amount: r.burst, damageType: r.damageType, fx },
        rng,
      );
      dealt += d;
      count++;
      stagger += r.stagger;
      // Brief vulnerability on the reacting enemy (if it survived the burst).
      if (pool.health[i]! > 0) {
        applyStatus(pool, i, 'mark', { duration: r.vulnDuration, amplify: r.vulnAmplify });
      }
      fx.push('impact', x, z, 0, 0, ImpactProfile.Blast);
      // Per-enemy numbers now come from applyAreaDamage (spec.fx); no aggregate.
      onReaction?.(r, x, z, d);
      break; // statuses consumed → at most one reaction per enemy this step
    }
  }
  return { dealt, count, stagger };
}
