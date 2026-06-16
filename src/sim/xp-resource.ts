// XP-as-resource build family (T58, §V27). Turns uncollected XP shards into an
// economy you can grow, weaponize, cash in, or blow up:
//   • Compound Interest (primer)  — loose shards GAIN value the longer they sit.
//   • Magnetar (engine)           — nearby loose shards orbit you and ZAP enemies.
//   • Liquidation (converter)     — sprint FIRES loose shards for burst damage
//        (the XP is spent, not banked).
//   • Margin Call (liability)     — fatter interest, but shards left too long
//        CRASH (decay) — telegraphed by age; collect them to lock in the gains.
//   • Market Crash (catastrophe)  — too many loose shards → mass collapse: a big
//        AoE scaled by the hoarded value + a single mega-pickup refund.
//
// All damage routes through `applyAreaDamage` (V3); pooled shards (V5); rng-only
// + fixed order (V16/V21). Pure sim — gated so it's free until a card is taken.

import { ShardPool, ShardState } from './xp';
import type { Player } from './player';
import type { EnemyPool } from './enemies';
import type { SpatialHash } from './spatial-hash';
import type { Rng } from '../core/rng';
import type { FxQueue } from './fx';
import { applyAreaDamage } from './combat/aoe';

const INTEREST_DURATION = 8; // s a shard keeps earning interest (bounds the growth)
const MARGIN_MULT = 1.6; // Margin Call fattens the interest rate
const MARGIN_AGE = 6; // s before an un-collected shard starts to crash (decay)
const MARGIN_DECAY = 0.3; // frac/s a crashing shard loses
const MARGIN_FLOOR = 0.2; // a crashed shard never drops below this (still worth grabbing)

export const ORBIT_RANGE = 5.5; // shards within this of the player orbit + zap
const ORBIT_INWARD = 0.07; // GENTLE pull → orbits stay at VARIED radii (no collapse to a few spots)
/** A magnetar shard orbits + zaps for this long, then matures and is collected as
 *  XP (the orbit is a temporary weapon, not a black hole — leveling never stalls). */
export const ORBIT_CONSUME_AGE = 4.5;
const ORBIT_SPEED = 2.6; // rad/s swirl (visual; sim positions, view follows)
const ZAP_RADIUS = 1.0; // each orbiting shard's damage radius
const ZAP_SCALE = 0.7; // zap damage = shard value × this

const LIQ_RADIUS = 2.3; // liquidation blast radius per fired shard
const LIQ_SCALE = 2.4; // liquidation damage = shard value × this

const CRASH_THRESHOLD = 55; // loose shards past this trigger Market Crash
const CRASH_RADIUS = 7.5;
const CRASH_DMG_SCALE = 1.4; // crash AoE = total loose value × this
const CRASH_REFUND = 0.5; // mega-pickup = total loose value × this

/** Advance the XP-resource systems. Returns enemy health removed (run stats, V20).
 *  `sprintRising` = the sprint started THIS step (drives Liquidation). */
export function stepXpResource(
  pool: ShardPool,
  player: Player,
  enemies: EnemyPool,
  hash: SpatialHash,
  rng: Rng,
  fx: FxQueue,
  dt: number,
  sprintRising: boolean,
): number {
  const active =
    player.xpInterestRate > 0 ||
    player.xpMagnetar ||
    player.xpLiquidation > 0 ||
    player.xpMarginCall ||
    player.xpMarketCrash;
  if (!active) return 0;

  const px = player.pos.x;
  const pz = player.pos.z;
  const rate = player.xpInterestRate * (player.xpMarginCall ? MARGIN_MULT : 1);
  let dealt = 0;

  // 1. Interest growth + Margin Call decay (loose shards age in stepXp's prevX
  //    pass; here we age the economy). Only loose shards earn/crash.
  for (let i = 0; i < pool.count; i++) {
    if (pool.state[i] !== ShardState.Loose) continue;
    pool.age[i]! += dt;
    if (rate > 0 && pool.age[i]! < INTEREST_DURATION) {
      pool.value[i]! += pool.value[i]! * rate * dt; // compounds, bounded by duration
    }
    if (player.xpMarginCall && pool.age[i]! > MARGIN_AGE) {
      pool.value[i]! = Math.max(MARGIN_FLOOR, pool.value[i]! * (1 - MARGIN_DECAY * dt));
    }
  }

  // 2. Magnetar — loose shards near the player swirl and zap enemies (XP weapon),
  //    spiralling slowly INWARD so they eventually reach pickup range and cash in
  //    as XP (the orbit is a temporary weapon, not an XP black hole).
  if (player.xpMagnetar) {
    const r2 = ORBIT_RANGE * ORBIT_RANGE;
    const c = Math.cos(ORBIT_SPEED * dt);
    const s = Math.sin(ORBIT_SPEED * dt);
    const inward = Math.max(0, 1 - ORBIT_INWARD * dt); // shrink the orbit radius
    for (let i = 0; i < pool.count; i++) {
      const dx = pool.posX[i]! - px;
      const dz = pool.posZ[i]! - pz;
      if (dx * dx + dz * dz > r2) continue;
      // Rotate around the player AND spiral inward a touch each step.
      pool.posX[i] = px + (dx * c - dz * s) * inward;
      pool.posZ[i] = pz + (dx * s + dz * c) * inward;
      // Zap whatever it's touching, scaled by the shard's (interest-grown) value.
      dealt += applyAreaDamage(
        enemies,
        hash,
        pool.posX[i]!,
        pool.posZ[i]!,
        ZAP_RADIUS,
        { amount: pool.value[i]! * ZAP_SCALE, damageType: 'energy', fx },
        rng,
      );
    }
  }

  // 3. Liquidation — sprinting FIRES loose shards: each pops at the nearest enemy
  //    for burst damage, and its XP is spent (the shard is consumed).
  if (player.xpLiquidation > 0 && sprintRising) {
    let fired = 0;
    for (let i = pool.count - 1; i >= 0 && fired < player.xpLiquidation; i--) {
      if (pool.state[i] !== ShardState.Loose) continue;
      dealt += applyAreaDamage(
        enemies,
        hash,
        pool.posX[i]!,
        pool.posZ[i]!,
        LIQ_RADIUS,
        { amount: pool.value[i]! * LIQ_SCALE, damageType: 'energy', fx },
        rng,
      );
      fx.push('impact', pool.posX[i]!, pool.posZ[i]!, 0, 0, 4 /* Blast */);
      pool.kill(i);
      fired++;
    }
  }

  // 4. Market Crash — hoarding too many loose shards collapses the market: one
  //    big AoE scaled by the total, then a single mega-pickup refund (catastrophe).
  if (player.xpMarketCrash) {
    let loose = 0;
    let total = 0;
    for (let i = 0; i < pool.count; i++) {
      if (pool.state[i] !== ShardState.Loose) continue;
      loose++;
      total += pool.value[i]!;
    }
    if (loose >= CRASH_THRESHOLD) {
      dealt += applyAreaDamage(
        enemies,
        hash,
        px,
        pz,
        CRASH_RADIUS,
        { amount: total * CRASH_DMG_SCALE, damageType: 'energy', fx },
        rng,
      );
      fx.push('teleport', px, pz); // big telegraph-style burst
      // Collapse every loose shard, then drop one fat refund pickup at the player.
      for (let i = pool.count - 1; i >= 0; i--) {
        if (pool.state[i] === ShardState.Loose) pool.kill(i);
      }
      pool.spawn(px, pz, total * CRASH_REFUND);
    }
  }

  return dealt;
}
