import { describe, it, expect } from 'vitest';
import { WaveDirector, budgetAt, computeAdaptation, NEUTRAL_ADAPT } from './wave-director';
import { EnemyPool } from '../enemies';
import { Rng } from '../../core/rng';

describe('computeAdaptation (T21/V12 bounded, composition not raw stats)', () => {
  it('neutral build → ~neutral adaptation', () => {
    const a = computeAdaptation({ damageMult: 1, fireRateMult: 1, projectileCount: 1 });
    expect(a.pace).toBeCloseTo(1, 6);
    expect(a.houndBias).toBe(0);
  });

  it('strong offense accelerates pace but stays clamped ≤ 1.4', () => {
    const a = computeAdaptation({ damageMult: 5, fireRateMult: 5, projectileCount: 1 });
    expect(a.pace).toBeGreaterThan(1);
    expect(a.pace).toBeLessThanOrEqual(1.4);
  });

  it('weak offense never drops pace below 0.8', () => {
    const a = computeAdaptation({ damageMult: 0.1, fireRateMult: 0.1, projectileCount: 1 });
    expect(a.pace).toBeGreaterThanOrEqual(0.8);
  });

  it('multishot biases toward tankier targets, clamped ≤ 0.3', () => {
    const a = computeAdaptation({ damageMult: 1, fireRateMult: 1, projectileCount: 10 });
    expect(a.houndBias).toBeGreaterThan(0);
    expect(a.houndBias).toBeLessThanOrEqual(0.3);
  });
});

describe('budgetAt (T20 SpawnBudget curve)', () => {
  it('threat accrual and concurrent cap grow with time', () => {
    const early = budgetAt(0);
    const late = budgetAt(120);
    expect(late.threatPoints).toBeGreaterThan(early.threatPoints);
    expect(late.maxConcurrentEnemies).toBeGreaterThan(early.maxConcurrentEnemies);
  });
});

describe('WaveDirector (V8 bounded spawns)', () => {
  function simulate(seconds: number, pool: EnemyPool): WaveDirector {
    const d = new WaveDirector();
    const rng = new Rng(1);
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) d.step(pool, rng, t, dt);
    return d;
  }

  it('never exceeds the concurrent cap for the elapsed time', () => {
    const pool = new EnemyPool();
    const d = new WaveDirector();
    const rng = new Rng(3);
    const dt = 1 / 60;
    for (let t = 0; t < 60; t += dt) {
      d.step(pool, rng, t, dt);
      expect(pool.count).toBeLessThanOrEqual(budgetAt(t).maxConcurrentEnemies);
    }
  });

  it('actually spawns enemies over time', () => {
    const pool = new EnemyPool();
    simulate(10, pool);
    expect(pool.count).toBeGreaterThan(0);
  });

  it('bank is clamped — no unbounded hoard while pool is full', () => {
    // Tiny pool so it fills; the bank must not grow without bound.
    const pool = new EnemyPool(5);
    const d = simulate(30, pool);
    expect(pool.count).toBe(5);
    expect(d.banked).toBeLessThan(budgetAt(30).threatPoints * 5);
  });

  it('deterministic for a fixed seed (V16)', () => {
    const a = new EnemyPool();
    const b = new EnemyPool();
    simulate(8, a);
    simulate(8, b);
    expect(a.count).toBe(b.count);
    expect(Array.from(a.posX.slice(0, a.count))).toEqual(Array.from(b.posX.slice(0, b.count)));
  });

  it('reset clears the bank', () => {
    const pool = new EnemyPool();
    const d = simulate(10, pool);
    d.reset();
    expect(d.banked).toBe(0);
  });

  it('faster pace fields more enemies than neutral over the same window', () => {
    const fast = new EnemyPool();
    const neutral = new EnemyPool();
    const df = new WaveDirector();
    const dn = new WaveDirector();
    const dt = 1 / 60;
    for (let t = 0; t < 20; t += dt) {
      df.step(fast, new Rng(1), t, dt, { pace: 1.4, houndBias: 0 });
      dn.step(neutral, new Rng(1), t, dt, NEUTRAL_ADAPT);
    }
    expect(fast.count).toBeGreaterThanOrEqual(neutral.count);
  });

  it('adaptation still respects the concurrent cap (V8 bounded)', () => {
    const pool = new EnemyPool();
    const d = new WaveDirector();
    const rng = new Rng(2);
    const dt = 1 / 60;
    for (let t = 0; t < 40; t += dt) {
      d.step(pool, rng, t, dt, { pace: 1.4, houndBias: 0.3 });
      expect(pool.count).toBeLessThanOrEqual(budgetAt(t).maxConcurrentEnemies);
    }
  });
});
