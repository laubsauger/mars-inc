// Gargantuan grow-and-slam (T-garg). A Gargantuan swells every step just by EXISTING
// (passive clock) AND faster when it DEVOURS overlapping fodder — bigger body, more HP
// (heals), harder contact. It never slows. Past a small growth threshold it periodically
// SLAMS a telegraphed blast whose radius+damage scale with its size, so an ignored one
// quickly becomes a huge, lethal zoning threat — deal with it early or suffer. Pure SoA
// mutation over the pool — deterministic (V16), no per-call alloc beyond the bounded
// scan. Lives outside the EnemyPool so the pool stays a dumb data store.

import { type EnemyPool, EnemyState, ENEMY_BY_VARIANT, GARGANTUAN } from './enemies';
import type { EnemyAttackSystem } from './enemy-attacks';
import type { FxQueue } from './fx';

const GARG_VARIANT = GARGANTUAN.variant;
const GARG_BASE_RADIUS = GARGANTUAN.radius; // 1.0 — growth measured from here
const EDIBLE_MAX_THREAT = 8; // only cheap fodder can be eaten (specials stay whole)
const EAT_REACH = 0.5; // a little past the body to "bite"
const GARG_MAX_RADIUS = 3.4; // growth cap (from 1.0) — a fed/ignored one becomes a WALL
const GROW_RADIUS = 0.07; // extra body growth per meal (on top of the passive clock)
const GROW_HP = 9; // max-HP gain per meal (also heals this much)
const GROW_CONTACT = 0.7; // contact-damage gain per meal
const MAX_EATS_PER_STEP = 12; // bound the work (Gargantuans are rare; few overlaps)

// Passive GROWTH-OVER-TIME (T-garg v2): a Gargantuan swells just by existing — it does
// NOT need to eat to become a threat, and it does NOT slow as it grows (its danger is
// the slam zone, not a chase). Ignore it and within seconds it's huge, hard-hitting,
// and slamming a lethal ring — so you're pushed to deal with it early. Per-SECOND rates.
const PASSIVE_GROW_RADIUS = 0.05; // body swells ~half a metre every 10s on its own
const PASSIVE_GROW_HP = 4.5; // max-HP creeps up (also heals this much) → a tank if left
const PASSIVE_GROW_CONTACT = 0.35; // its touch gets meaner as it bloats

// Growing SLAM (T-garg): once past a small growth threshold a Gargantuan periodically
// stomps a telegraphed blast whose RADIUS and DAMAGE scale with how big it's grown.
// With passive growth it crosses the threshold in ~2s, so even a starved one quickly
// carves a huge lethal zone every couple seconds. Kill it before it snowballs.
const STOMP_CD = 2.6; // seconds between slams (was 3.2 — more relentless)
const STOMP_FUSE = 0.85; // telegraph (ground ring) before it lands — dodgeable
const STOMP_MIN_GROWTH = 0.12; // grows past this in ~2s of passive bloat → slams early
const STOMP_RADIUS_MULT = 2.6; // slam radius = body radius × this (grows with the body)
const STOMP_DMG_BASE = 22; // was 14 — a real bite even at the first slam
const STOMP_DMG_PER_GROWTH = 34; // + this × (radius − base) → a maxed one is devastating

/** True if this variant is small fodder a Gargantuan can swallow (not a boss, a
 *  special, or another Gargantuan). */
function isEdible(variant: number): boolean {
  if (variant === GARG_VARIANT) return false;
  const t = ENEMY_BY_VARIANT[variant];
  return !!t && t.threat <= EDIBLE_MAX_THREAT;
}

/** Grow a Gargantuan one meal's worth (called per devour). A meal is a BONUS on top
 *  of the passive clock — body, HP (heals), and contact. Speed is left untouched: a
 *  Gargantuan never slows as it grows (its threat is the slam, not the chase). */
function grow(pool: EnemyPool, g: number): void {
  pool.radius[g] = Math.min(GARG_MAX_RADIUS, pool.radius[g]! + GROW_RADIUS);
  pool.maxHp[g] = pool.maxHp[g]! + GROW_HP;
  pool.health[g] = Math.min(pool.maxHp[g]!, pool.health[g]! + GROW_HP); // a meal heals
  pool.contactDmg[g] = pool.contactDmg[g]! + GROW_CONTACT;
}

/** Passive growth-over-time: a Gargantuan swells every step whether or not it eats,
 *  so an ignored one becomes a real problem fast. Capped at GARG_MAX_RADIUS. */
function growOverTime(pool: EnemyPool, g: number, dt: number): void {
  if (pool.radius[g]! >= GARG_MAX_RADIUS) return; // fully grown — clock stops
  pool.radius[g] = Math.min(GARG_MAX_RADIUS, pool.radius[g]! + PASSIVE_GROW_RADIUS * dt);
  const hp = PASSIVE_GROW_HP * dt;
  pool.maxHp[g] = pool.maxHp[g]! + hp;
  pool.health[g] = Math.min(pool.maxHp[g]!, pool.health[g]! + hp);
  pool.contactDmg[g] = pool.contactDmg[g]! + PASSIVE_GROW_CONTACT * dt;
}

/** Per-Gargantuan SLAM: tick the stomp cooldown (stored in the unused `attackCd`
 *  slot) and, once grown, drop a telegraphed blast scaled to the body. */
function stepStomps(pool: EnemyPool, attacks: EnemyAttackSystem, dt: number): void {
  for (let g = 0; g < pool.count; g++) {
    if (pool.variant[g] !== GARG_VARIANT || pool.state[g] !== EnemyState.Active) continue;
    growOverTime(pool, g, dt); // swell whether or not it ate this step
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
