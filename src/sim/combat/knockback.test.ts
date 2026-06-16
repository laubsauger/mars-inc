import { describe, it, expect } from 'vitest';
import { radialPush, knockbackFrom } from './knockback';
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
