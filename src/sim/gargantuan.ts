// Gargantuan eat-and-grow (T-garg). Each step, a Gargantuan that overlaps a small
// enemy DEVOURS it — the fodder is removed and the devourer grows: bigger body,
// more HP (and a heal), harder contact, a touch slower. It snowballs if you let a
// crowd feed it, so it's a "thin the fodder near it / kill it early" threat. Pure
// SoA mutation over the pool — deterministic (V16), no per-call alloc beyond the
// bounded scan. Lives outside the EnemyPool so the pool stays a dumb data store.

import { type EnemyPool, EnemyState, ENEMY_BY_VARIANT, GARGANTUAN } from './enemies';
import type { EnemyAttackSystem } from './enemy-attacks';
import type { FxQueue } from './fx';

const GARG_VARIANT = GARGANTUAN.variant;
const GARG_BASE_RADIUS = GARGANTUAN.radius; // 1.0 — growth measured from here
const EDIBLE_MAX_THREAT = 8; // only cheap fodder can be eaten (specials stay whole)
const EAT_REACH = 0.5; // a little past the body to "bite"
const GARG_MAX_RADIUS = 2.3; // growth cap (from 1.0)
const GROW_RADIUS = 0.07; // body growth per meal
const GROW_HP = 9; // max-HP gain per meal (also heals this much)
const GROW_CONTACT = 0.7; // contact-damage gain per meal
const GROW_SLOW = 0.04; // each meal slows it slightly (mass)
const GARG_MIN_SPEED = 0.7;
const MAX_EATS_PER_STEP = 12; // bound the work (Gargantuans are rare; few overlaps)

// Growing SLAM (T-garg): once it has fed past a threshold, a Gargantuan periodically
// stomps a telegraphed blast whose RADIUS and DAMAGE scale with how big it's grown.
// So letting one snowball isn't just "it eats the creeps" — a fat one carves a huge
// lethal zone every few seconds. Kill it (or starve it) before it gets there.
const STOMP_CD = 3.2; // seconds between slams
const STOMP_FUSE = 0.85; // telegraph (ground ring) before it lands — dodgeable
const STOMP_MIN_GROWTH = 0.2; // must have grown this much past base before it slams
const STOMP_RADIUS_MULT = 2.6; // slam radius = body radius × this (grows with the body)
const STOMP_DMG_BASE = 14;
const STOMP_DMG_PER_GROWTH = 24; // + this × (radius − base) → a maxed one hits hard

/** True if this variant is small fodder a Gargantuan can swallow (not a boss, a
 *  special, or another Gargantuan). */
function isEdible(variant: number): boolean {
  if (variant === GARG_VARIANT) return false;
  const t = ENEMY_BY_VARIANT[variant];
  return !!t && t.threat <= EDIBLE_MAX_THREAT;
}

/** Grow a Gargantuan one meal's worth (called per devour). */
function grow(pool: EnemyPool, g: number): void {
  pool.radius[g] = Math.min(GARG_MAX_RADIUS, pool.radius[g]! + GROW_RADIUS);
  pool.maxHp[g] = pool.maxHp[g]! + GROW_HP;
  pool.health[g] = Math.min(pool.maxHp[g]!, pool.health[g]! + GROW_HP); // a meal heals
  pool.contactDmg[g] = pool.contactDmg[g]! + GROW_CONTACT;
  pool.speed[g] = Math.max(GARG_MIN_SPEED, pool.speed[g]! - GROW_SLOW);
}

/** Per-Gargantuan SLAM: tick the stomp cooldown (stored in the unused `attackCd`
 *  slot) and, once grown, drop a telegraphed blast scaled to the body. */
function stepStomps(pool: EnemyPool, attacks: EnemyAttackSystem, dt: number): void {
  for (let g = 0; g < pool.count; g++) {
    if (pool.variant[g] !== GARG_VARIANT || pool.state[g] !== EnemyState.Active) continue;
    pool.attackCd[g] = pool.attackCd[g]! - dt; // attackCd is unused by Gargantuan → our timer
    if (pool.attackCd[g]! > 0) continue;
    pool.attackCd[g] = STOMP_CD;
    const growth = pool.radius[g]! - GARG_BASE_RADIUS;
    if (growth < STOMP_MIN_GROWTH) continue; // a fresh one just bites; only a fed one slams
    const radius = pool.radius[g]! * STOMP_RADIUS_MULT;
    const damage = STOMP_DMG_BASE + growth * STOMP_DMG_PER_GROWTH;
    attacks.hazardAt(pool.posX[g]!, pool.posZ[g]!, radius, STOMP_FUSE, damage, GARG_VARIANT); // telegraphed AoE
  }
}

/** Devour overlapping fodder + slam scaled to size for every active Gargantuan this
 *  step. Eat loop re-scans after each kill (swap-remove shifts indices), bounded by
 *  MAX_EATS_PER_STEP. */
export function stepGargantuans(
  pool: EnemyPool,
  attacks: EnemyAttackSystem,
  dt: number,
  fx: FxQueue,
): void {
  stepStomps(pool, attacks, dt);
  for (let eats = 0; eats < MAX_EATS_PER_STEP; eats++) {
    let gi = -1;
    let vi = -1;
    let bestD2 = Infinity;
    for (let g = 0; g < pool.count; g++) {
      if (pool.variant[g] !== GARG_VARIANT || pool.state[g] !== EnemyState.Active) continue;
      if (pool.radius[g]! >= GARG_MAX_RADIUS) continue; // fully grown — stops feeding
      const reach = pool.radius[g]! + EAT_REACH;
      for (let f = 0; f < pool.count; f++) {
        if (f === g || pool.state[f] !== EnemyState.Active) continue;
        if (!isEdible(pool.variant[f]!)) continue;
        const dx = pool.posX[f]! - pool.posX[g]!;
        const dz = pool.posZ[f]! - pool.posZ[g]!;
        const rr = reach + pool.radius[f]!;
        const d2 = dx * dx + dz * dz;
        if (d2 <= rr * rr && d2 < bestD2) {
          bestD2 = d2;
          gi = g;
          vi = f;
        }
      }
    }
    if (vi < 0) break; // nothing in reach → done this step
    grow(pool, gi);
    // Chomp cue: reuse the death poof at the swallowed body (scaled to it).
    fx.push('death', pool.posX[vi]!, pool.posZ[vi]!, pool.radius[vi]!, pool.variant[vi]!);
    pool.kill(vi);
  }
}
