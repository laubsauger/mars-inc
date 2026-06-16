// V19: drop resolution is a core math system → unit-tested. On-kill events emit
// one pooled XP shard each, valued by enemy variant from balance data, and the
// pool cap is respected (V5 pooling — never grows unbounded).

import { describe, it, expect } from 'vitest';
import { ShardPool } from './xp';
import { emitShards } from './xp-system';
import { SHARD_VALUE } from '../content/balance/xp-curve';
import type { KillEvent } from './combat/weapon-system';

const kill = (x: number, z: number, variant: number): KillEvent => ({ x, z, variant });

describe('emitShards (drop)', () => {
  it('spawns exactly one shard per kill at the kill location', () => {
    const pool = new ShardPool();
    emitShards(pool, [kill(1, 2, 0), kill(3, 4, 0)]);
    expect(pool.count).toBe(2);
    expect(pool.posX[0]).toBe(1);
    expect(pool.posZ[0]).toBe(2);
    expect(pool.posX[1]).toBe(3);
  });

  it('total shard value per kill matches the balance data (V13 source)', () => {
    // Fodder (Mite) drops one shard worth its full value; meaner enemies burst
    // into several whose values SUM to the balance value (XP economy preserved).
    const mite = new ShardPool();
    emitShards(mite, [kill(0, 0, 0)]);
    expect(mite.count).toBe(1);
    expect(mite.value[0]).toBeCloseTo(SHARD_VALUE[0]!, 5); // Rust Mite = 1

    const hound = new ShardPool();
    emitShards(hound, [kill(0, 0, 1)]);
    expect(hound.count).toBeGreaterThan(1);
    let total = 0;
    for (let i = 0; i < hound.count; i++) total += hound.value[i]!;
    expect(total).toBeCloseTo(SHARD_VALUE[1]!, 4); // Debt Hound = 3 total
  });

  it('falls back to a total value of 1 for a variant with no balance entry', () => {
    // Boss (variant 2) has no SHARD_VALUE entry yet — the default keeps the drop
    // coherent. The full value is still spread across its (many) shards.
    expect(SHARD_VALUE[2]).toBeUndefined();
    const pool = new ShardPool();
    emitShards(pool, [kill(0, 0, 2)]);
    let total = 0;
    for (let i = 0; i < pool.count; i++) total += pool.value[i]!;
    expect(total).toBeCloseTo(1, 4);
  });

  it('respects pool capacity — drops past the cap are dropped, not overflowed', () => {
    const pool = new ShardPool(2);
    emitShards(pool, [kill(0, 0, 0), kill(0, 0, 0), kill(0, 0, 0)]);
    expect(pool.count).toBe(2);
  });
});
