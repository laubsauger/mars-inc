import { describe, it, expect } from 'vitest';
import { GrenadeSystem } from './grenades';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { FxQueue } from '../fx';
import { Rng } from '../../core/rng';

const DT = 1 / 60;

function setup(x: number, z: number) {
  const pool = new EnemyPool();
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  pool.health[i] = 100; // tanky so the blast doesn't one-shot it
  const hash = new SpatialHash(2);
  hash.insert(i, x, z);
  return { pool, hash, i };
}

/** Step the grenade system until all flights have landed (bounded). */
function detonate(g: GrenadeSystem, pool: EnemyPool, hash: SpatialHash): number {
  const fx = new FxQueue();
  const rng = new Rng(1);
  let dealt = 0;
  for (let t = 0; t < 60 && g.count > 0; t++) dealt += g.step(pool, hash, rng, fx, DT);
  return dealt;
}

describe('GrenadeSystem (T-grenade)', () => {
  it('detonates on landing and deals AoE damage to enemies in radius', () => {
    const { pool, hash, i } = setup(2, 0);
    const g = new GrenadeSystem();
    g.configure(40, 4, 30, false);
    g.throwAt(0, 0, 2, 0); // land on the enemy
    const before = pool.health[i]!;
    const dealt = detonate(g, pool, hash);
    expect(dealt).toBeGreaterThan(0);
    expect(pool.health[i]!).toBeLessThan(before);
    expect(g.count).toBe(0); // consumed after detonation
  });

  it('knocks enemies outward from the blast', () => {
    const { pool, hash, i } = setup(2, 0);
    const g = new GrenadeSystem();
    g.configure(20, 4, 40, false);
    g.throwAt(0, 0, 1.4, 0); // land just short of the enemy (at x=2) so it shoves +x
    detonate(g, pool, hash);
    // radialPush adds knockback velocity (kbX), integrated by the enemy system later.
    expect(pool.kbX[i]!).toBeGreaterThan(0);
  });

  it('molotov sets the blast zone on fire (burn)', () => {
    const { pool, hash, i } = setup(2, 0);
    const g = new GrenadeSystem();
    g.configure(30, 4, 30, true); // molotov
    g.throwAt(0, 0, 2, 0);
    detonate(g, pool, hash);
    expect(pool.burnTime[i]!).toBeGreaterThan(0);
    expect(pool.burnDps[i]!).toBeGreaterThan(0);
  });

  it('a plain grenade leaves no burn', () => {
    const { pool, hash, i } = setup(2, 0);
    const g = new GrenadeSystem();
    g.configure(30, 4, 30, false);
    g.throwAt(0, 0, 2, 0);
    detonate(g, pool, hash);
    expect(pool.burnTime[i]!).toBe(0);
  });
});
