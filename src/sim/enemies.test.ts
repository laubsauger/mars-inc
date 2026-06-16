import { describe, it, expect } from 'vitest';
import {
  EnemyPool,
  EnemyState,
  RUST_MITE,
  LIABILITY_BLOB,
  BLOBLING,
  steerEnemy,
  splitOnDeath,
  DEFAULT_STEER,
} from './enemies';
import { Rng } from '../core/rng';

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

  it('holds at the stop ring — no inward seek once inside stopDist (anti-jiggle)', () => {
    // Enemy at distance 2 from target, stopDist 3 → inside the contact ring.
    // With no neighbors, seek is zeroed → velocity ~0 (does not crawl to centre).
    const v = steerEnemy(8, 0, { x: 10, z: 0 }, 5, 1, empty, empty, 0, 0.5, DEFAULT_STEER, 3);
    expect(Math.hypot(v.x, v.z)).toBeLessThan(1e-6);
  });

  it('still seeks at full speed well outside the stop ring', () => {
    // Distance 10 ≫ stopDist+band → seek unaffected.
    const v = steerEnemy(0, 0, { x: 10, z: 0 }, 5, 1, empty, empty, 0, 0.5, DEFAULT_STEER, 3);
    expect(v.x).toBeGreaterThan(0);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(5, 5);
  });
});

describe('splitOnDeath (T33 splitter blob)', () => {
  it('a blob ruptures into 2 bloblings at the death site', () => {
    const pool = new EnemyPool();
    const spawned = splitOnDeath(pool, LIABILITY_BLOB.variant, 5, -3, new Rng(7));
    expect(spawned).toBe(2);
    expect(pool.count).toBe(2);
    for (let i = 0; i < pool.count; i++) {
      expect(pool.variant[i]).toBe(BLOBLING.variant);
      // children scatter near (but not exactly on) the kill site
      expect(Math.hypot(pool.posX[i]! - 5, pool.posZ[i]! + 3)).toBeLessThan(2);
      expect(pool.state[i]).toBe(EnemyState.Telegraph); // brief pop-in tell (V9)
    }
  });

  it('bloblings are terminal — they do not split again', () => {
    const pool = new EnemyPool();
    const spawned = splitOnDeath(pool, BLOBLING.variant, 0, 0, new Rng(1));
    expect(spawned).toBe(0);
    expect(pool.count).toBe(0);
  });

  it('non-splitter variants spawn nothing', () => {
    const pool = new EnemyPool();
    expect(splitOnDeath(pool, RUST_MITE.variant, 0, 0, new Rng(1))).toBe(0);
  });

  it('is deterministic for a given seed (V16)', () => {
    const a = new EnemyPool();
    const b = new EnemyPool();
    splitOnDeath(a, LIABILITY_BLOB.variant, 2, 2, new Rng(42));
    splitOnDeath(b, LIABILITY_BLOB.variant, 2, 2, new Rng(42));
    expect(a.posX[0]).toBe(b.posX[0]);
    expect(a.posZ[1]).toBe(b.posZ[1]);
  });
});
