// XP collection + leveling (T17). Drops shards from kills, drifts them to the
// player within magnet range, collects within pickup range, and reports how many
// level-ups the gained XP triggered (the run state opens a draft per level).

import { ShardPool, ShardState } from './xp';
import type { Player } from './player';
import type { KillEvent } from './combat/weapon-system';
import { xpRequired, SHARD_VALUE } from '../content/balance/xp-curve';
import { ENEMY_BY_VARIANT } from './enemies';
import { ORBIT_RANGE } from './xp-resource';

const MAGNET_SPEED = 18;

/** Total XP a kill of this variant is worth. Explicit `SHARD_VALUE` overrides win;
 *  otherwise it scales with the enemy's THREAT so a 90-hp brute pays far more than
 *  a mite (the old flat `?? 1` made tier-3/4 a brick wall — same XP for a tank as
 *  a fodder). Capped so a boss is a big-but-bounded dump, not a dozen instant
 *  levels. V13: still sourced from balance data (SHARD_VALUE + enemy threat). */
export function shardValueFor(variant: number): number {
  const explicit = SHARD_VALUE[variant];
  if (explicit !== undefined) return explicit;
  const threat = ENEMY_BY_VARIANT[variant]?.threat ?? 1;
  return Math.max(1, Math.min(30, Math.round(threat * 0.8)));
}

/** Spawn one shard per kill, valued by enemy variant. */
export function emitShards(pool: ShardPool, kills: readonly KillEvent[]): void {
  for (const k of kills) {
    const total = shardValueFor(k.variant); // total XP value, scaled by enemy threat
    // Shard COUNT scales with the enemy's size (maxHealth) — bigger/meaner enemies
    // burst into more crystals, fodder drops one — but every kill drops at least
    // one. Each shard is worth total/count so the run XP is unchanged. Scattered
    // by the golden angle (deterministic, V16 — no rng needed).
    const hp = ENEMY_BY_VARIANT[k.variant]?.maxHealth ?? 6;
    const count = Math.max(1, Math.min(10, Math.round(hp / 6)));
    const per = total / count;
    for (let i = 0; i < count; i++) {
      if (count === 1) {
        pool.spawn(k.x, k.z, per);
      } else {
        const a = i * 2.399963; // golden angle
        const r = 0.35 + (i / count) * 0.9;
        pool.spawn(k.x + Math.cos(a) * r, k.z + Math.sin(a) * r, per);
      }
    }
  }
}

/**
 * Advance shards and collect XP. Returns the number of level-ups gained this
 * step (0+). Mutates player.xp/level/xpToNext.
 */
export function stepXp(pool: ShardPool, player: Player, dt: number): number {
  const px = player.pos.x;
  const pz = player.pos.z;
  const magnet2 = player.magnetRadius * player.magnetRadius;
  const pickup2 = player.pickupRadius * player.pickupRadius;
  // Magnetar (XP-as-weapon, T-resource): near shards become an orbiting weapon, so
  // DON'T magnet/collect them while they're in orbit range — they stay loose and
  // visibly swirl (stepXpResource rotates them). Without this hold, the magnet here
  // sucks them in and collects them before they can orbit (the "no orbit" bug).
  const orbitHold = player.xpMagnetar;
  const orbit2 = ORBIT_RANGE * ORBIT_RANGE;
  let gained = 0;

  for (let i = pool.count - 1; i >= 0; i--) {
    pool.prevX[i] = pool.posX[i]!;
    pool.prevZ[i] = pool.posZ[i]!;
    const dx = px - pool.posX[i]!;
    const dz = pz - pool.posZ[i]!;
    const d2 = dx * dx + dz * dz;

    if (orbitHold && d2 <= orbit2) {
      pool.state[i] = ShardState.Loose; // released from magnet → orbits, not collected
      continue;
    }

    if (d2 <= pickup2) {
      gained += pool.value[i]!;
      pool.kill(i);
      continue;
    }

    if (pool.state[i] === ShardState.Magnet || d2 <= magnet2) {
      pool.state[i] = ShardState.Magnet;
      const d = Math.sqrt(d2) || 1;
      pool.posX[i]! += (dx / d) * MAGNET_SPEED * dt;
      pool.posZ[i]! += (dz / d) * MAGNET_SPEED * dt;
    }
  }

  if (gained === 0) return 0;
  player.xp += gained;
  let levelUps = 0;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = xpRequired(player.level);
    levelUps += 1;
  }
  return levelUps;
}
