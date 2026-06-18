// Orbital blades (T-orbit): spinning bodies slice enemies they sweep, pipeline-
// routed (V3), on a fixed tick cadence (no per-frame nuke), deterministic (V16/V21).

import { describe, it, expect } from 'vitest';
import { OrbitalSystem } from './orbitals';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { createPlayer } from '../player';
import { Rng } from '../../core/rng';
import { FxQueue } from '../fx';

const DT = 1 / 60;

function activeEnemyAt(pool: EnemyPool, x: number, z: number): number {
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active; // skip the telegraph for the test
  pool.health[i] = 1000; // fat so it survives, we measure the damage dealt
  pool.maxHp[i] = 1000;
  return i;
}

function buildHash(pool: EnemyPool): SpatialHash {
  const hash = new SpatialHash(4);
  hash.clear();
  for (let e = 0; e < pool.count; e++) hash.insert(e, pool.posX[e]!, pool.posZ[e]!);
  return hash;
}

describe('orbital blades', () => {
  it('slices an enemy sitting on the orbit ring', () => {
    const sys = new OrbitalSystem();
    sys.setCount(1);
    const player = createPlayer();
    const pool = new EnemyPool();
    // Blade orbits at radius 3.4; park the enemy right on the ring at +x.
    const e = activeEnemyAt(pool, 3.4, 0);
    const before = pool.health[e]!;

    // Sweep ~one full revolution; the first tick lands when hitCd reaches 0.
    let dealt = 0;
    for (let t = 0; t < 120; t++) {
      const hash = buildHash(pool);
      dealt += sys.step(player, pool, hash, 10, player.orbitRadius, DT, new Rng(1), new FxQueue());
    }
    expect(dealt).toBeGreaterThan(0);
    expect(pool.health[e]!).toBeLessThan(before);
  });

  it('does nothing with zero blades', () => {
    const sys = new OrbitalSystem();
    const player = createPlayer();
    const pool = new EnemyPool();
    activeEnemyAt(pool, 3.4, 0);
    const hash = buildHash(pool);
    const dealt = sys.step(
      player,
      pool,
      hash,
      50,
      player.orbitRadius,
      DT,
      new Rng(1),
      new FxQueue(),
    );
    expect(dealt).toBe(0);
  });

  it('reset clears active blades', () => {
    const sys = new OrbitalSystem();
    sys.setCount(4);
    expect(sys.count).toBe(4);
    sys.reset();
    expect(sys.count).toBe(0);
  });

  it('is deterministic for the same seed (V16)', () => {
    const run = (): number => {
      const sys = new OrbitalSystem();
      sys.setCount(3);
      const player = createPlayer();
      const pool = new EnemyPool();
      activeEnemyAt(pool, 3.0, 0.4);
      activeEnemyAt(pool, -3.2, 0);
      let total = 0;
      const rng = new Rng(42);
      for (let t = 0; t < 60; t++) {
        const hash = buildHash(pool);
        total += sys.step(player, pool, hash, 8, player.orbitRadius, DT, rng, new FxQueue());
      }
      return total;
    };
    expect(run()).toBe(run());
  });
});
