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

  it('values each shard by variant from balance data (V13 source)', () => {
    const pool = new ShardPool();
    emitShards(pool, [kill(0, 0, 0), kill(0, 0, 1)]);
    expect(pool.value[0]).toBe(SHARD_VALUE[0]); // Rust Mite = 1
    expect(pool.value[1]).toBe(SHARD_VALUE[1]); // Debt Hound = 3
  });

  it('falls back to a value of 1 for a variant with no balance entry', () => {
    // Boss (variant 2) has no SHARD_VALUE entry yet — its drop value is T33
    // balance. Until then the default keeps the drop coherent, never broken.
    expect(SHARD_VALUE[2]).toBeUndefined();
    const pool = new ShardPool();
    emitShards(pool, [kill(0, 0, 2)]);
    expect(pool.value[0]).toBe(1);
  });

  it('respects pool capacity — drops past the cap are dropped, not overflowed', () => {
    const pool = new ShardPool(2);
    emitShards(pool, [kill(0, 0, 0), kill(0, 0, 0), kill(0, 0, 0)]);
    expect(pool.count).toBe(2);
  });
});
