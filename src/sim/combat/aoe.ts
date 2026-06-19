// Area damage helper (T38). Routes every enemy hit in a radius through the
// centralized damage pipeline (V3) — used by triggers (on-kill shockwaves),
// explosions, and future orbital strikes. Pooled query scratch, deterministic
// via the shared rng (V16). Returns total health actually removed (for stats).

import type { EnemyPool } from '../enemies';
import { EnemyState, ENEMY_BY_VARIANT } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Rng } from '../../core/rng';
import { type FxQueue, ImpactProfile } from '../fx';
import { makePacket, computeOutgoing, applyMitigation, type DamageType } from './damage';
import { radialPush } from './knockback';

const _scratch: number[] = [];
// Broad-phase query is widened by this so a large body (boss r≈2.7) whose centre is
// just outside the blast but whose footprint overlaps it is still returned.
const BODY_QUERY_MARGIN = 3;

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
  /** When true (and `fx` is set), each hit enemy also gets the per-hit impact
   *  spark + blood spray — so an explosion reads like real hits land, not just
   *  floating numbers. Off for silent triggers (novas/corpse) to avoid fx spam. */
  hitFx?: boolean;
  /** Linear distance falloff 0..1: at the blast edge, damage is `amount × (1 −
   *  falloff)`. 0 (default) = flat damage everywhere; 1 = drops to 0 at the rim. */
  falloff?: number;
  /** Outward shove applied to every enemy in the radius (radialPush impulse). 0/
   *  unset = no knockback. Lets explosions/meteors/corpse pops physically punch a
   *  hole, not just deal silent damage. */
  knockback?: number;
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
  // Query wider than the blast so LARGE bodies (bosses/brutes) whose CENTER sits
  // outside the radius — but whose footprint overlaps it — are still considered.
  const n = hash.queryCircle(x, z, radius + BODY_QUERY_MARGIN, _scratch);
  let dealt = 0;
  for (let k = 0; k < n; k++) {
    const e = _scratch[k]!;
    if (e === spec.exclude || e >= enemies.count) continue;
    if (enemies.health[e]! <= 0 || enemies.state[e] !== EnemyState.Active) continue;
    const dx = enemies.posX[e]! - x;
    const dz = enemies.posZ[e]! - z;
    const d2 = dx * dx + dz * dz;
    // Sphere overlap, not centre-in-radius: an enemy is hit if its BODY (footprint
    // radius) overlaps the blast. Otherwise a small effect never touched a wide unit
    // whose centre lay beyond the effect's own radius (V3 — effects must scale to size).
    const er = enemies.radius[e]!;
    const reach = radius + er;
    if (d2 > reach * reach) continue;
    // Distance falloff measured to the body SURFACE (not centre): a big unit whose
    // body sits in the blast core takes near-full, the same as a small one there.
    // SQUARED so the drop bites early (the chain-of-pops brake stays — outer ring weak).
    const surf = radius > 1e-3 ? Math.max(0, Math.sqrt(d2) - er) / radius : 0;
    const ratio = surf * surf; // 0 at/inside the surface → 1 at the rim
    const amount = spec.falloff ? spec.amount * (1 - spec.falloff * ratio) : spec.amount;

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
    if (spec.fx) {
      spec.fx.push('dmg', enemies.posX[e]!, enemies.posZ[e]!, removed, 0, out.crit ? 1 : 0);
      // Per-hit spark + blood so the blast reads like real hits land. Direction is
      // RADIAL OUT from the blast centre (matter exits away from the explosion).
      if (spec.hitFx) {
        const d = Math.sqrt(d2) || 1;
        const ux = dx / d;
        const uz = dz / d;
        spec.fx.push('impact', enemies.posX[e]!, enemies.posZ[e]!, ux, uz, ImpactProfile.Generic);
        const v = enemies.variant[e]!;
        if (ENEMY_BY_VARIANT[v]?.gore) {
          const r = enemies.radius[e]! * 0.9;
          spec.fx.push('blood', enemies.posX[e]! + ux * r, enemies.posZ[e]! + uz * r, ux, uz, v);
        }
      }
    }
  }
  // Physical shove: punch every enemy in the radius outward (after damage so the
  // pool indices are still valid — knockback doesn't remove anything).
  if (spec.knockback) radialPush(enemies, hash, x, z, radius, spec.knockback);
  return dealt;
}
