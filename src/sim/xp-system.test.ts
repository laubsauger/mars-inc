import { describe, it, expect } from 'vitest';
import { ShardPool } from './xp';
import { emitShards, stepXp } from './xp-system';
import { createPlayer } from './player';
import { xpRequired } from '../content/balance/xp-curve';

describe('xp-curve (V13 from balance data)', () => {
  it('monotonic increasing', () => {
    for (let l = 1; l < 50; l++) expect(xpRequired(l + 1)).toBeGreaterThan(xpRequired(l));
  });
});

describe('emitShards (T17 drop on kill)', () => {
  it('spawns one shard per kill, valued by variant', () => {
    const pool = new ShardPool();
    emitShards(pool, [
      { x: 1, z: 2, variant: 0 },
      { x: 3, z: 4, variant: 1 },
    ]);
    expect(pool.count).toBe(2);
    expect(pool.value[0]).toBe(1); // rust mite
    expect(pool.value[1]).toBe(3); // debt hound
  });
});

describe('stepXp (collection + leveling)', () => {
  it('collects a shard within pickup radius and adds xp', () => {
    const pool = new ShardPool();
    pool.spawn(0, 0, 5); // on top of player
    const player = createPlayer();
    const ups = stepXp(pool, player, 1 / 60);
    expect(pool.count).toBe(0);
    expect(player.xp).toBe(5);
    expect(ups).toBe(0); // 5 < xpToNext
  });

  it('does not collect a shard far outside pickup/magnet range', () => {
    const pool = new ShardPool();
    pool.spawn(20, 0, 5);
    const player = createPlayer();
    stepXp(pool, player, 1 / 60);
    expect(pool.count).toBe(1);
    expect(player.xp).toBe(0);
  });

  it('magnetizes a shard within magnet range toward the player', () => {
    const pool = new ShardPool();
    const i = pool.spawn(player_magnet_dist(), 0, 1);
    const player = createPlayer();
    const before = pool.posX[i]!;
    stepXp(pool, player, 1 / 60);
    if (pool.count > 0) expect(pool.posX[0]!).toBeLessThan(before); // moved toward 0
  });

  it('levels up when xp crosses the threshold', () => {
    const pool = new ShardPool();
    const player = createPlayer();
    const need = player.xpToNext;
    pool.spawn(0, 0, need + 1);
    const ups = stepXp(pool, player, 1 / 60);
    expect(ups).toBe(1);
    expect(player.level).toBe(2);
    expect(player.xp).toBe(1);
  });

  it('handles multiple level-ups from a single large pickup', () => {
    const pool = new ShardPool();
    const player = createPlayer();
    pool.spawn(0, 0, 100000);
    const ups = stepXp(pool, player, 1 / 60);
    expect(ups).toBeGreaterThan(1);
    expect(player.level).toBe(1 + ups);
  });
});

function player_magnet_dist(): number {
  return 4; // inside default magnetRadius (5), outside pickup (1.6)
}
