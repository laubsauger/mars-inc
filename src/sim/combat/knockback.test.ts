import { describe, it, expect } from 'vitest';
import { radialPush, knockbackFrom, directionalPush } from './knockback';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';

function activeAt(pool: EnemyPool, hash: SpatialHash, x: number, z: number): number {
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  hash.clear();
  for (let k = 0; k < pool.count; k++) hash.insert(k, pool.posX[k]!, pool.posZ[k]!);
  return i;
}

describe('knockback (T42 crowd control)', () => {
  it('radialPush shoves enemies in range outward from the centre', () => {
    const pool = new EnemyPool();
    const hash = new SpatialHash(2);
    const i = activeAt(pool, hash, 3, 0); // 3 units +x of the origin
    const pushed = radialPush(pool, hash, 0, 0, 6, 16);
    expect(pushed).toBe(1);
    expect(pool.kbX[i]!).toBeGreaterThan(0); // pushed along +x (away from origin)
    expect(Math.abs(pool.kbZ[i]!)).toBeLessThan(1e-6);
  });

  it('radialPush ignores enemies beyond the radius', () => {
    const pool = new EnemyPool();
    const hash = new SpatialHash(2);
    const i = activeAt(pool, hash, 20, 0);
    radialPush(pool, hash, 0, 0, 6, 16);
    expect(pool.kbX[i]!).toBe(0);
  });

  it('knockbackFrom pushes a single enemy away from the source', () => {
    const pool = new EnemyPool();
    const hash = new SpatialHash(2);
    const i = activeAt(pool, hash, 0, 4);
    knockbackFrom(pool, i, 0, 0, 10);
    expect(pool.kbZ[i]!).toBeGreaterThan(0); // away from origin along +z
  });
});

describe('directionalPush (grenade-launcher forward bias)', () => {
  // An enemy BEHIND + to the side of the blast (relative to the throw direction):
  // pure radial would shove it backward; forward bias should steer it downrange.
  it('steers the push toward the forward vector vs. pure radial', () => {
    const fwdX = 1,
      fwdZ = 0; // throwing toward +x
    // Pure radial reference.
    const a = new EnemyPool();
    const ha = new SpatialHash(2);
    const ia = activeAt(a, ha, -1, -1); // behind (−x) + to the side (−z)
    radialPush(a, ha, 0, 0, 6, 10);
    // Forward-biased.
    const b = new EnemyPool();
    const hb = new SpatialHash(2);
    const ib = activeAt(b, hb, -1, -1);
    directionalPush(b, hb, 0, 0, 6, 10, fwdX, fwdZ, 0.65);
    // The biased push has a MORE downrange (+x) component than the radial one.
    expect(b.kbX[ib]!).toBeGreaterThan(a.kbX[ia]!);
  });

  it('preserves the impulse magnitude (≈ force) regardless of bias', () => {
    const pool = new EnemyPool();
    const hash = new SpatialHash(2);
    const i = activeAt(pool, hash, -1, -1);
    directionalPush(pool, hash, 0, 0, 6, 10, 1, 0, 0.65);
    expect(Math.hypot(pool.kbX[i]!, pool.kbZ[i]!)).toBeCloseTo(10, 4);
  });

  it('falls back to pure forward for an enemy at the dead centre', () => {
    const pool = new EnemyPool();
    const hash = new SpatialHash(2);
    const i = activeAt(pool, hash, 0, 0); // radial direction is degenerate
    directionalPush(pool, hash, 0, 0, 6, 10, 1, 0, 0.65);
    expect(pool.kbX[i]!).toBeCloseTo(10, 4); // pushed straight along +x (forward)
    expect(Math.abs(pool.kbZ[i]!)).toBeLessThan(1e-6);
  });
});
