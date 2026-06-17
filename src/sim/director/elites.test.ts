import { describe, it, expect } from 'vitest';
import { promoteSpawns, eliteProgress } from './elites';
import { EnemyPool, RUST_MITE, LANCE_SENTINEL } from '../enemies';
import { Rng } from '../../core/rng';

function poolOf(type: typeof RUST_MITE, count: number): EnemyPool {
  const pool = new EnemyPool();
  for (let i = 0; i < count; i++) pool.spawn(type, 0, 0, 0, i);
  return pool;
}

describe('elite progression (T-elite)', () => {
  it('eliteProgress folds level + boss kills (a boss = a full tier)', () => {
    expect(eliteProgress(1, 0)).toBe(0);
    expect(eliteProgress(6, 0)).toBe(5);
    expect(eliteProgress(1, 1)).toBe(5);
  });

  it('shields cheap fodder once the run has progressed (the ladder)', () => {
    const early = poolOf(RUST_MITE, 1);
    promoteSpawns(early, 0, new Rng(1));
    expect(early.shield[0]).toBe(0); // no baseline shield at the very start

    const mid = poolOf(RUST_MITE, 1);
    promoteSpawns(mid, 12, new Rng(1));
    expect(mid.shield[0]).toBeGreaterThanOrEqual(1); // shielded deeper in
    expect(mid.evaluated[0]).toBe(1);
  });

  it('promotes a slice of fodder to elites at high progress', () => {
    const pool = poolOf(RUST_MITE, 300);
    promoteSpawns(pool, 40, new Rng(7));
    let elites = 0;
    for (let i = 0; i < pool.count; i++) if (pool.elite[i]) elites++;
    expect(elites).toBeGreaterThan(0);
    // An elite is beefier + shielded + bigger than a plain mite.
    const e = Array.from({ length: pool.count }, (_, i) => i).find((i) => pool.elite[i]);
    expect(e).toBeDefined();
    expect(pool.maxHp[e!]).toBeGreaterThan(RUST_MITE.maxHealth);
    expect(pool.shield[e!]).toBeGreaterThanOrEqual(2);
    expect(pool.radius[e!]).toBeGreaterThan(RUST_MITE.radius);
  });

  it('evaluates each spawn only once (no re-roll on a later step)', () => {
    const pool = poolOf(RUST_MITE, 50);
    promoteSpawns(pool, 40, new Rng(3));
    const shieldSnap = Array.from(pool.shield.slice(0, pool.count));
    const eliteSnap = Array.from(pool.elite.slice(0, pool.count));
    promoteSpawns(pool, 40, new Rng(99)); // different rng — must change nothing
    expect(Array.from(pool.shield.slice(0, pool.count))).toEqual(shieldSnap);
    expect(Array.from(pool.elite.slice(0, pool.count))).toEqual(eliteSnap);
  });

  it('never promotes a unit with its own shield identity (e.g. the Lance Sentinel)', () => {
    const pool = new EnemyPool();
    pool.spawn(LANCE_SENTINEL, 0, 0, 0, 0);
    promoteSpawns(pool, 60, new Rng(1));
    expect(pool.elite[0]).toBe(0);
    expect(pool.shield[0]).toBe(LANCE_SENTINEL.shield); // keeps its built-in shield
  });

  it('is deterministic for a fixed seed (V16)', () => {
    const a = poolOf(RUST_MITE, 100);
    const b = poolOf(RUST_MITE, 100);
    promoteSpawns(a, 40, new Rng(11));
    promoteSpawns(b, 40, new Rng(11));
    expect(Array.from(a.elite.slice(0, a.count))).toEqual(Array.from(b.elite.slice(0, b.count)));
  });
});
