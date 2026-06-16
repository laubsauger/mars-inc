// Area damage helper (T38). Routes every enemy hit in a radius through the
// centralized damage pipeline (V3) — used by triggers (on-kill shockwaves),
// explosions, and future orbital strikes. Pooled query scratch, deterministic
// via the shared rng (V16). Returns total health actually removed (for stats).

import type { EnemyPool } from '../enemies';
import { EnemyState } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Rng } from '../../core/rng';
import type { FxQueue } from '../fx';
import { makePacket, computeOutgoing, applyMitigation, type DamageType } from './damage';

const _scratch: number[] = [];

export interface AreaDamageSpec {
  amount: number;
  critChance?: number;
  critMultiplier?: number;
  damageType?: DamageType;
  /** Skip this enemy index (e.g. the one that already took the direct hit). */
  exclude?: number;
  /** When set, floats a damage number on EVERY enemy this AoE hits — so splash,
   *  novas, triggers, and corpse blasts read like real hits, not silent damage. */
  fx?: FxQueue;
  /** Linear distance falloff 0..1: at the blast edge, damage is `amount × (1 −
   *  falloff)`. 0 (default) = flat damage everywhere; 1 = drops to 0 at the rim. */
  falloff?: number;
}

export function applyAreaDamage(
  enemies: EnemyPool,
  hash: SpatialHash,
  x: number,
  z: number,
  radius: number,
  spec: AreaDamageSpec,
  rng: Rng,
): number {
  const n = hash.queryCircle(x, z, radius, _scratch);
  const r2 = radius * radius;
  let dealt = 0;
  for (let k = 0; k < n; k++) {
    const e = _scratch[k]!;
    if (e === spec.exclude || e >= enemies.count) continue;
    if (enemies.health[e]! <= 0 || enemies.state[e] !== EnemyState.Active) continue;
    const dx = enemies.posX[e]! - x;
    const dz = enemies.posZ[e]! - z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    // Distance falloff: full at the centre, less toward the edge (crowd-control
    // splash instead of a flat one-shot ring).
    const amount = spec.falloff
      ? spec.amount * (1 - spec.falloff * (Math.sqrt(d2) / radius))
      : spec.amount;

    const packet = makePacket({
      weaponId: 'aoe',
      baseDamage: amount,
      critChance: spec.critChance ?? 0,
      critMultiplier: spec.critMultiplier ?? 2,
      damageType: spec.damageType ?? 'explosive',
    });
    const out = computeOutgoing(packet, rng);
    const mit = applyMitigation(out.amount, 0, 0);
    const removed = Math.min(mit.toHealth, enemies.health[e]!);
    dealt += removed;
    enemies.health[e]! -= mit.toHealth;
    // Per-enemy damage number so AoE never deals "silent" damage (V3 reads).
    if (spec.fx)
      spec.fx.push('dmg', enemies.posX[e]!, enemies.posZ[e]!, removed, 0, out.crit ? 1 : 0);
  }
  return dealt;
}
