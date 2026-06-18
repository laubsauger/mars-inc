// Per-enemy contact damage (T33): an enemy's touch damage comes from its type
// (default 6), so a Brute punishes contact far harder than a Mite.

import { describe, it, expect } from 'vitest';
import { EnemyPool, EnemyState, RUST_MITE, AUDIT_BRUTE } from './enemies';
import { EnemySystem } from './enemy-system';
import { createPlayer } from './player';

function hitOnce(type: typeof RUST_MITE): number {
  const pool = new EnemyPool();
  const sys = new EnemySystem(pool, 2);
  const player = createPlayer();
  const i = pool.spawn(type, 0, 0, 0, 0); // on top of the player
  pool.state[i] = EnemyState.Active;
  pool.meleeCd[i] = 0; // ready to SWING now (skip the first-swing wind-up)
  const before = player.health;
  sys.step(player, 0, 1 / 60); // one swing (i-frames gate further hits)
  return before - player.health;
}

describe('per-enemy contact damage', () => {
  it('Brute touch damage exceeds the Mite default', () => {
    const mite = hitOnce(RUST_MITE);
    const brute = hitOnce(AUDIT_BRUTE);
    expect(mite).toBe(6); // DEFAULT_CONTACT_DAMAGE
    expect(brute).toBe(16);
    expect(brute).toBeGreaterThan(mite);
  });
});
