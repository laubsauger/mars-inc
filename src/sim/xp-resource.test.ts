// T58 XP-as-resource — core math unit tests (V19). Interest growth (bounded),
// magnetar zap (V3), liquidation consume-for-damage, Market Crash collapse, and
// determinism (V16).

import { describe, it, expect } from 'vitest';
import { stepXpResource } from './xp-resource';
import { ShardPool } from './xp';
import { EnemyPool, EnemyState, RUST_MITE } from './enemies';
import { SpatialHash } from './spatial-hash';
import { Rng } from '../core/rng';
import { FxQueue } from './fx';
import { createPlayer, type Player } from './player';

function tankAt(x: number, z: number): { pool: EnemyPool; hash: SpatialHash } {
  const pool = new EnemyPool();
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  // Big but FLOAT32-representable (1e9 ULP ≈ 128 would swallow small hits).
  pool.health[i] = 1e5;
  const hash = new SpatialHash(2);
  hash.insert(i, pool.posX[i]!, pool.posZ[i]!);
  return { pool, hash };
}

const noEnemies = (): { pool: EnemyPool; hash: SpatialHash } => ({
  pool: new EnemyPool(),
  hash: new SpatialHash(2),
});

function p(setup: (pl: Player) => void): Player {
  const pl = createPlayer();
  setup(pl);
  return pl;
}

describe('XP resource is free until a card is taken', () => {
  it('no-op (returns 0, leaves shards) with no flags', () => {
    const shards = new ShardPool();
    shards.spawn(0, 0, 5);
    const { pool, hash } = noEnemies();
    const dealt = stepXpResource(
      shards,
      createPlayer(),
      pool,
      hash,
      new Rng(1),
      new FxQueue(),
      0.1,
      false,
    );
    expect(dealt).toBe(0);
    expect(shards.value[0]).toBe(5);
  });
});

describe('Compound Interest (primer)', () => {
  it('a loose shard grows in value over time, bounded by the duration', () => {
    const shards = new ShardPool();
    shards.spawn(0, 0, 10);
    const pl = p((x) => (x.xpInterestRate = 0.12));
    const { pool, hash } = noEnemies();
    // Far from any player magnet (player at origin too, but no enemies/pickup here
    // — stepXpResource doesn't collect, just grows).
    for (let i = 0; i < 30; i++)
      stepXpResource(shards, pl, pool, hash, new Rng(1), new FxQueue(), 1 / 60, false);
    expect(shards.value[0]!).toBeGreaterThan(10); // appreciated
    // Keep growing well past the interest window — value must plateau (bounded).
    for (let i = 0; i < 1200; i++)
      stepXpResource(shards, pl, pool, hash, new Rng(1), new FxQueue(), 1 / 60, false);
    expect(shards.value[0]!).toBeLessThan(40); // didn't run away (e^(0.12·8) ≈ 2.6×)
  });
});

describe('Magnetar (engine, V3)', () => {
  it('a shard near the player zaps an enemy in range', () => {
    const shards = new ShardPool();
    shards.spawn(1, 0, 20); // near the player (origin) and on the enemy
    const { pool, hash } = tankAt(1, 0);
    const pl = p((x) => (x.xpMagnetar = true));
    const hp0 = pool.health[0]!;
    const dealt = stepXpResource(shards, pl, pool, hash, new Rng(1), new FxQueue(), 1 / 60, false);
    expect(dealt).toBeGreaterThan(0);
    expect(pool.health[0]!).toBeLessThan(hp0);
  });
});

describe('Liquidation (converter)', () => {
  it('sprint consumes loose shards for burst damage', () => {
    const shards = new ShardPool();
    for (let k = 0; k < 4; k++) shards.spawn(0.5, 0, 8);
    const { pool, hash } = tankAt(0.5, 0);
    const pl = p((x) => (x.xpLiquidation = 6));
    const hp0 = pool.health[0]!;
    const dealt = stepXpResource(
      shards,
      pl,
      pool,
      hash,
      new Rng(1),
      new FxQueue(),
      1 / 60,
      true /* sprintRising */,
    );
    expect(dealt).toBeGreaterThan(0);
    expect(pool.health[0]!).toBeLessThan(hp0);
    expect(shards.count).toBe(0); // all 4 fired + consumed
  });

  it('does nothing without the sprint edge', () => {
    const shards = new ShardPool();
    shards.spawn(0.5, 0, 8);
    const { pool, hash } = tankAt(0.5, 0);
    const pl = p((x) => (x.xpLiquidation = 6));
    stepXpResource(shards, pl, pool, hash, new Rng(1), new FxQueue(), 1 / 60, false);
    expect(shards.count).toBe(1); // not fired
  });
});

describe('Market Crash (catastrophe)', () => {
  it('collapses a hoard into one AoE + a single refund pickup', () => {
    const shards = new ShardPool();
    for (let k = 0; k < 60; k++) shards.spawn(0, 0, 4); // past CRASH_THRESHOLD
    const { pool, hash } = tankAt(1, 0);
    const pl = p((x) => (x.xpMarketCrash = true));
    const hp0 = pool.health[0]!;
    const dealt = stepXpResource(shards, pl, pool, hash, new Rng(1), new FxQueue(), 1 / 60, false);
    expect(dealt).toBeGreaterThan(0);
    expect(pool.health[0]!).toBeLessThan(hp0);
    expect(shards.count).toBe(1); // collapsed → one mega refund
    expect(shards.value[0]!).toBeGreaterThan(4); // fat refund
  });

  it('holds until the hoard crosses the threshold', () => {
    const shards = new ShardPool();
    for (let k = 0; k < 10; k++) shards.spawn(0, 0, 4);
    const { pool, hash } = noEnemies();
    const pl = p((x) => (x.xpMarketCrash = true));
    stepXpResource(shards, pl, pool, hash, new Rng(1), new FxQueue(), 1 / 60, false);
    expect(shards.count).toBe(10); // no crash yet
  });
});

describe('determinism (V16)', () => {
  it('same seed → identical enemy health after a magnetar zap', () => {
    const run = (): number => {
      const shards = new ShardPool();
      shards.spawn(1, 0, 20);
      const { pool, hash } = tankAt(1, 0);
      const pl = p((x) => (x.xpMagnetar = true));
      stepXpResource(shards, pl, pool, hash, new Rng(7), new FxQueue(), 1 / 60, false);
      return pool.health[0]!;
    };
    expect(run()).toBe(run());
  });
});
