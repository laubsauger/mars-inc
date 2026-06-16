import { describe, it, expect } from 'vitest';
import { DroneSystem } from './drones';
import { ProjectilePool } from './projectiles';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { createPlayer } from '../player';

function activeEnemyAt(pool: EnemyPool, hash: SpatialHash, x: number, z: number): void {
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active; // skip telegraph for the test
  hash.clear();
  for (let k = 0; k < pool.count; k++) hash.insert(k, pool.posX[k]!, pool.posZ[k]!);
}

describe('companion drones (T40 drone family)', () => {
  it('fires a projectile at a nearby active enemy', () => {
    const player = createPlayer();
    const enemies = new EnemyPool();
    const hash = new SpatialHash(2);
    const projectiles = new ProjectilePool();
    activeEnemyAt(enemies, hash, 5, 0);

    const drones = new DroneSystem();
    drones.setCount(1);
    drones.step(player, enemies, hash, projectiles, 1 / 60, 1);

    expect(projectiles.count).toBe(1); // a drone bolt was spawned into the shared pool
  });

  it('does nothing with no drones', () => {
    const player = createPlayer();
    const enemies = new EnemyPool();
    const hash = new SpatialHash(2);
    const projectiles = new ProjectilePool();
    activeEnemyAt(enemies, hash, 5, 0);

    const drones = new DroneSystem();
    drones.setCount(0);
    drones.step(player, enemies, hash, projectiles, 1 / 60, 1);

    expect(projectiles.count).toBe(0);
  });

  it('holds fire on the cooldown, then fires again', () => {
    const player = createPlayer();
    const enemies = new EnemyPool();
    const hash = new SpatialHash(2);
    const projectiles = new ProjectilePool();
    activeEnemyAt(enemies, hash, 5, 0);

    const drones = new DroneSystem();
    drones.setCount(1);
    drones.step(player, enemies, hash, projectiles, 1 / 60, 1); // shot 1
    drones.step(player, enemies, hash, projectiles, 1 / 60, 1); // on cooldown → no shot
    expect(projectiles.count).toBe(1);

    for (let t = 0; t < 0.7; t += 1 / 60) {
      drones.step(player, enemies, hash, projectiles, 1 / 60, 1);
    }
    expect(projectiles.count).toBeGreaterThanOrEqual(2); // cooldown elapsed → fired again
  });
});
