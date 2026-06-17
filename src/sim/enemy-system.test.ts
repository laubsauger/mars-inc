import { describe, it, expect } from 'vitest';
import { EnemySystem } from './enemy-system';
import { EnemyPool, EnemyState, RUST_MITE, SpawnKind } from './enemies';
import { createPlayer } from './player';

describe('EnemySystem (T11/T13)', () => {
  it('telegraphing enemy does not move or deal damage', () => {
    const pool = new EnemyPool();
    // Interior (teleport) telegraph spawn overlapping the player: stays Telegraph on
    // its timer (a gate walk-in would instead go live on crossing the threshold).
    pool.spawn(RUST_MITE, 0.1, 0, 1.0, 0, 1, SpawnKind.Teleport);
    const sys = new EnemySystem(pool, 2);
    const player = createPlayer();
    sys.step(player, 1, 1 / 60);
    expect(player.health).toBe(100);
    expect(pool.state[0]).toBe(EnemyState.Telegraph);
  });

  it('active enemy overlapping the player deals contact damage', () => {
    const pool = new EnemyPool();
    const e = pool.spawn(RUST_MITE, 0.1, 0, 0, 0);
    pool.state[e] = EnemyState.Active;
    const sys = new EnemySystem(pool, 2);
    const player = createPlayer();
    sys.step(player, 1, 1 / 60);
    expect(player.health).toBeLessThan(100);
  });

  it('active enemy steers toward the player', () => {
    const pool = new EnemyPool();
    const e = pool.spawn(RUST_MITE, 10, 0, 0, 0);
    pool.state[e] = EnemyState.Active;
    const sys = new EnemySystem(pool, 2);
    const player = createPlayer();
    const startX = pool.posX[e]!;
    for (let t = 0; t < 30; t++) sys.step(player, t, 1 / 60);
    expect(pool.posX[e]!).toBeLessThan(startX); // moved toward origin (player)
  });

  it('i-frames prevent repeated hits every tick', () => {
    const pool = new EnemyPool();
    const e = pool.spawn(RUST_MITE, 0.1, 0, 0, 0);
    pool.state[e] = EnemyState.Active;
    const sys = new EnemySystem(pool, 2);
    const player = createPlayer();
    sys.step(player, 1, 1 / 60);
    const afterOne = player.health;
    sys.step(player, 2, 1 / 60); // still in i-frames → no extra damage
    expect(player.health).toBe(afterOne);
  });
});
