import { describe, it, expect } from 'vitest';
import { applyAreaDamage } from './aoe';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { Rng } from '../../core/rng';

function seed(pool: EnemyPool, positions: [number, number][]): void {
  for (const [x, z] of positions) {
    const i = pool.spawn(RUST_MITE, x, z, 0, 0);
    pool.state[i] = EnemyState.Active;
  }
}

function hashOf(pool: EnemyPool): SpatialHash {
  const h = new SpatialHash(2);
  for (let i = 0; i < pool.count; i++) h.insert(i, pool.posX[i]!, pool.posZ[i]!);
  return h;
}

describe('applyAreaDamage (T38, V3 pipeline-routed)', () => {
  it('damages enemies inside the radius, skips those outside', () => {
    const pool = new EnemyPool();
    seed(pool, [
      [0, 0],
      [1, 0], // inside r=3
      [10, 0], // outside
    ]);
    const hp0 = pool.health[2]!;
    applyAreaDamage(pool, hashOf(pool), 0, 0, 3, { amount: 4 }, new Rng(1));
    expect(pool.health[0]!).toBeLessThan(RUST_MITE.maxHealth);
    expect(pool.health[1]!).toBeLessThan(RUST_MITE.maxHealth);
    expect(pool.health[2]!).toBe(hp0); // untouched
  });

  it('excludes the given index', () => {
    const pool = new EnemyPool();
    seed(pool, [
      [0, 0],
      [1, 0],
    ]);
    applyAreaDamage(pool, hashOf(pool), 0, 0, 3, { amount: 4, exclude: 0 }, new Rng(1));
    expect(pool.health[0]!).toBe(RUST_MITE.maxHealth); // excluded
    expect(pool.health[1]!).toBeLessThan(RUST_MITE.maxHealth);
  });

  it('returns total health removed (clamped, no overkill)', () => {
    const pool = new EnemyPool();
    seed(pool, [[0, 0]]);
    const dealt = applyAreaDamage(pool, hashOf(pool), 0, 0, 3, { amount: 9999 }, new Rng(1));
    expect(dealt).toBe(RUST_MITE.maxHealth); // not 9999
  });

  it('skips telegraphing (invulnerable) enemies', () => {
    const pool = new EnemyPool();
    const i = pool.spawn(RUST_MITE, 0, 0, 1, 0); // stays Telegraph
    applyAreaDamage(pool, hashOf(pool), 0, 0, 3, { amount: 5 }, new Rng(1));
    expect(pool.health[i]!).toBe(RUST_MITE.maxHealth);
  });

  it('deterministic for a fixed seed (V16)', () => {
    const a = new EnemyPool();
    const b = new EnemyPool();
    seed(a, [[0, 0]]);
    seed(b, [[0, 0]]);
    const da = applyAreaDamage(a, hashOf(a), 0, 0, 3, { amount: 4, critChance: 0.5 }, new Rng(9));
    const db = applyAreaDamage(b, hashOf(b), 0, 0, 3, { amount: 4, critChance: 0.5 }, new Rng(9));
    expect(da).toBe(db);
  });
});
