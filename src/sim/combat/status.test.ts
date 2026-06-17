import { describe, it, expect } from 'vitest';
import { applyStatus, tickStatus, corrodeAmp } from './status';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { FxQueue } from '../fx';
import { Rng } from '../../core/rng';

function activeEnemy(pool: EnemyPool, x = 0, z = 0): number {
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  return i;
}

describe('applyStatus (T39)', () => {
  it('burn sets dps + duration, refreshing to the stronger value', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatus(pool, i, 'burn', { duration: 2, dps: 3 });
    expect(pool.burnDps[i]).toBe(3);
    applyStatus(pool, i, 'burn', { duration: 1, dps: 5 }); // weaker duration, stronger dps
    expect(pool.burnDps[i]).toBe(5);
    expect(pool.burnTime[i]).toBe(2); // longer kept
  });

  it('chill stores the smaller (stronger) movement multiplier', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatus(pool, i, 'chill', { duration: 2, slowMult: 0.7 });
    applyStatus(pool, i, 'chill', { duration: 2, slowMult: 0.5 });
    expect(pool.chillMult[i]).toBe(0.5);
  });

  it('rejects out-of-range indices', () => {
    const pool = new EnemyPool();
    expect(applyStatus(pool, 0, 'burn', { duration: 1, dps: 1 })).toBe(false);
  });
});

describe('tickStatus (T39, V3 burn DoT + decay)', () => {
  it('burn removes health over time and expires', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatus(pool, i, 'burn', { duration: 1, dps: 3 });
    const fx = new FxQueue();
    const rng = new Rng(1);
    const before = pool.health[i]!;
    let dealt = 0;
    for (let t = 0; t < 1; t += 1 / 60) dealt += tickStatus(pool, rng, 1 / 60, fx);
    expect(pool.health[i]!).toBeLessThan(before);
    expect(dealt).toBeGreaterThan(0);
    // After duration, burn is cleared.
    tickStatus(pool, rng, 1 / 60, fx);
    expect(pool.burnTime[i]).toBe(0);
  });

  it('mark amplifies burn damage', () => {
    const fx = new FxQueue();
    const plain = new EnemyPool();
    const marked = new EnemyPool();
    const a = activeEnemy(plain);
    const b = activeEnemy(marked);
    applyStatus(plain, a, 'burn', { duration: 1, dps: 4 });
    applyStatus(marked, b, 'burn', { duration: 1, dps: 4 });
    applyStatus(marked, b, 'mark', { duration: 1, amplify: 2 });
    // DoT lands in chunks (~0.5s ticks) now — probe one full tick so the amp shows
    // (a single 1/60 step floors both to the min-1 integer and hides it).
    const dPlain = tickStatus(plain, new Rng(1), 0.5, fx);
    const dMark = tickStatus(marked, new Rng(1), 0.5, fx);
    expect(dMark).toBeGreaterThan(dPlain);
  });

  it('chill restores movement multiplier on expiry', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatus(pool, i, 'chill', { duration: 0.05, slowMult: 0.5 });
    const fx = new FxQueue();
    const rng = new Rng(1);
    expect(pool.chillMult[i]).toBe(0.5);
    tickStatus(pool, rng, 0.1, fx); // past duration
    expect(pool.chillMult[i]).toBe(1);
    expect(pool.chillTime[i]).toBe(0);
  });

  it('deterministic for a fixed seed (V16)', () => {
    const fx = new FxQueue();
    const a = new EnemyPool();
    const b = new EnemyPool();
    applyStatus(a, activeEnemy(a), 'burn', { duration: 1, dps: 4 });
    applyStatus(b, activeEnemy(b), 'burn', { duration: 1, dps: 4 });
    expect(tickStatus(a, new Rng(7), 1 / 60, fx)).toBe(tickStatus(b, new Rng(7), 1 / 60, fx));
  });
});

// ── T52: Shock / Corrode / Bleed substrate (V5 stacks bounded, V3 routed) ────
describe('stacking statuses (T52)', () => {
  it('shock accumulates stacks, refreshes duration, capped', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatus(pool, i, 'shock', { duration: 2, stacks: 2 });
    applyStatus(pool, i, 'shock', { duration: 3, stacks: 3 });
    expect(pool.shockStacks[i]).toBe(5);
    expect(pool.shockTime[i]).toBe(3);
    for (let k = 0; k < 10; k++) applyStatus(pool, i, 'shock', { duration: 1, stacks: 5 });
    expect(pool.shockStacks[i]).toBe(6); // MAX_STACKS.shock
  });

  it('corrode amplifies incoming damage per stack', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    expect(corrodeAmp(pool, i)).toBe(1); // none
    applyStatus(pool, i, 'corrode', { duration: 3, stacks: 5 });
    expect(corrodeAmp(pool, i)).toBeCloseTo(1.3, 5); // 1 + 5×0.06
  });

  it('bleed is a stacking DoT through the pipeline; more stacks → more damage', () => {
    const fx = new FxQueue();
    const lo = new EnemyPool();
    const hi = new EnemyPool();
    const a = activeEnemy(lo);
    const b = activeEnemy(hi);
    applyStatus(lo, a, 'bleed', { duration: 5, dps: 2, stacks: 1 });
    applyStatus(hi, b, 'bleed', { duration: 5, dps: 2, stacks: 4 });
    const dLo = tickStatus(lo, new Rng(1), 0.5, fx);
    const dHi = tickStatus(hi, new Rng(1), 0.5, fx);
    expect(dLo).toBeGreaterThan(0);
    expect(dHi).toBeCloseTo(dLo * 4, 4); // damage scales with stack count
  });

  it('bleed clears stacks + dps on expiry', () => {
    const fx = new FxQueue();
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatus(pool, i, 'bleed', { duration: 0.05, dps: 3, stacks: 3 });
    tickStatus(pool, new Rng(1), 0.1, fx); // past duration
    expect(pool.bleedTime[i]).toBe(0);
    expect(pool.bleedStacks[i]).toBe(0);
    expect(pool.bleedDps[i]).toBe(0);
  });

  it('shock + corrode markers count down and clear stacks (no standalone damage)', () => {
    const fx = new FxQueue();
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatus(pool, i, 'shock', { duration: 0.05, stacks: 3 });
    applyStatus(pool, i, 'corrode', { duration: 0.05, stacks: 3 });
    const dealt = tickStatus(pool, new Rng(1), 0.1, fx);
    expect(dealt).toBe(0); // primers don't deal damage themselves
    expect(pool.shockStacks[i]).toBe(0);
    expect(pool.corrodeStacks[i]).toBe(0);
  });
});
