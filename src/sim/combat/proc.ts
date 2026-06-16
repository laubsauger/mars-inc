// Proc coefficient (T69, V32). A single per-weapon scalar that scales how strongly
// on-hit status/trigger effects land: `chance · duration · magnitude` all multiply
// by it (Risk of Rain 2 model). A fast spray gun procs weakly per hit; a slow
// heavy hitter procs hard. Routed through the same status/trigger surfaces (V3),
// pooled (V5), deterministic under the shared rng (V16/V21).

import type { WeaponDefinition, WeaponFamily } from './weapon';
import type { EnemyPool } from '../enemies';
import type { Rng } from '../../core/rng';
import { applyStatus, type StatusType, type StatusOpts } from './status';

/** Family identity defaults — used when a weapon def doesn't set `procCoef`.
 *  Tuned against fire cadence so proc DPS stays roughly flat across families:
 *  fast cadence → low coef, slow-big-hit → high coef. */
export const FAMILY_PROC_COEF: Record<WeaponFamily, number> = {
  sidearm: 1.0, // the reference
  rotary: 0.5, // many fast hits, each a weak proc (RoR2 Nailgun ≈ 0.6)
  explosive: 0.7, // slow, already multi-hits via AoE
  drone: 0.6, // frequent small bursts
  energy: 0.4, // fast repeater / near-continuous
  orbital: 2.5, // very slow, huge single hits → long burns (RoR2 Railgunner = 3.0)
};

/** Re-entry cap for proc chains (V32): a triggered proc may re-roll on-hit at most
 *  this deep. Bounds recursion (V5/V8 spirit) and keeps the run deterministic. */
export const MAX_PROC_DEPTH = 1;

/** A chained (re-entered) proc carries this fraction of the parent coefficient, so
 *  a depth-1 chain can never equal the primary hit (geometric decay). */
export const PROC_CHAIN_INHERIT = 0.2;

/** Effective proc coefficient for a weapon: explicit def value, else family default. */
export function procCoefOf(def: WeaponDefinition): number {
  return def.procCoef ?? FAMILY_PROC_COEF[def.family];
}

/**
 * Apply a status scaled by a proc coefficient (T69, V32). `chance` (if present) is
 * rolled at `chance · coef` (clamped to 1); `duration` and stack count scale by the
 * coefficient (dps is left alone — scaling duration already scales total DoT, so
 * scaling dps too would double-count). At `coef === 1` and no chance this is exactly
 * `applyStatus`, so existing content + seeds are unaffected (the rng is only touched
 * when a `chance` is supplied). Returns true if the status landed.
 */
export function applyStatusScaled(
  pool: EnemyPool,
  i: number,
  type: StatusType,
  opts: StatusOpts,
  coef: number,
  rng: Rng,
): boolean {
  if (opts.chance !== undefined && rng.next() >= Math.min(1, opts.chance * coef)) return false;
  if (coef === 1) return applyStatus(pool, i, type, opts);
  const scaled: StatusOpts = { ...opts, duration: opts.duration * coef };
  if (opts.stacks !== undefined) scaled.stacks = Math.max(1, Math.round(opts.stacks * coef));
  return applyStatus(pool, i, type, scaled);
}
