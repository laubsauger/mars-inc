import { describe, it, expect } from 'vitest';
import { EnemyPool, EnemyState, RUST_MITE, steerEnemy, DEFAULT_STEER } from './enemies';

describe('EnemyPool (V5 swap-remove pool)', () => {
  it('spawns in Telegraph state', () => {
    const p = new EnemyPool(10);
    const i = p.spawn(RUST_MITE, 5, 5, 0.5, 0);
    expect(i).toBe(0);
    expect(p.count).toBe(1);
    expect(p.state[i]).toBe(EnemyState.Telegraph);
    expect(p.health[i]).toBe(RUST_MITE.maxHealth);
  });

  it('returns -1 when full, never overflows', () => {
    const p = new EnemyPool(2);
    expect(p.spawn(RUST_MITE, 0, 0, 0, 0)).toBe(0);
    expect(p.spawn(RUST_MITE, 0, 0, 0, 0)).toBe(1);
    expect(p.spawn(RUST_MITE, 0, 0, 0, 0)).toBe(-1);
    expect(p.count).toBe(2);
  });

  it('swap-remove keeps liveness contiguous', () => {
    const p = new EnemyPool(10);
    p.spawn(RUST_MITE, 1, 0, 0, 0);
    p.spawn(RUST_MITE, 2, 0, 0, 0);
    p.spawn(RUST_MITE, 3, 0, 0, 0);
    p.kill(0); // last (x=3) moves into slot 0
    expect(p.count).toBe(2);
    expect(p.posX[0]).toBe(3);
    expect(p.posX[1]).toBe(2);
  });

  it('damage reports death at/under zero', () => {
    const p = new EnemyPool(10);
    const i = p.spawn(RUST_MITE, 0, 0, 0, 0);
    expect(p.damage(i, 3)).toBe(false);
    expect(p.damage(i, 3)).toBe(true);
  });
});

describe('steerEnemy (T11 seek + separation)', () => {
  const empty = new Float32Array(0);

  it('seeks toward target with no neighbors', () => {
    const v = steerEnemy(0, 0, { x: 10, z: 0 }, 5, 1, empty, empty, 0, 0.5, DEFAULT_STEER);
    expect(v.x).toBeGreaterThan(0);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(5, 5); // scaled to speed
  });

  it('separation pushes away from a close neighbor', () => {
    // Neighbor to the right, target to the right → separation bends path away.
    const nx = new Float32Array([0.3]);
    const nz = new Float32Array([0]);
    const v = steerEnemy(0, 0, { x: 10, z: 0 }, 5, 5, nx, nz, 1, 0.5, DEFAULT_STEER);
    expect(v.x).toBeLessThan(5); // pure seek would be +5 on x
  });

  it('output magnitude never exceeds speed', () => {
    const nx = new Float32Array([0.1, -0.1]);
    const nz = new Float32Array([0.1, -0.1]);
    const v = steerEnemy(0, 0, { x: 3, z: 3 }, 7, 9, nx, nz, 2, 0.5, DEFAULT_STEER);
    expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(7 + 1e-6);
  });
});
