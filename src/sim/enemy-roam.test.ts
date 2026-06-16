// Aggro-gated roaming (T-roam): an enemy with `aggroRange` patrols (slow wander)
// while the player is outside that radius, and only locks on + chases once the
// player closes in. Breaks the homogeneous everyone-beelines-you swarm.

import { describe, it, expect } from 'vitest';
import { EnemyPool, EnemyState, AUDIT_BRUTE } from './enemies';
import { EnemySystem } from './enemy-system';
import { createPlayer } from './player';

function distToPlayer(pool: EnemyPool, i: number, px: number, pz: number): number {
  return Math.hypot(pool.posX[i]! - px, pool.posZ[i]! - pz);
}

function runBrute(startX: number): number {
  const pool = new EnemyPool();
  const sys = new EnemySystem(pool, 2);
  const player = createPlayer(); // at origin
  const i = pool.spawn(AUDIT_BRUTE, startX, 0, 0, 0);
  pool.state[i] = EnemyState.Active;
  for (let t = 0; t < 90; t++) sys.step(player, t, 1 / 60); // ~1.5s
  return distToPlayer(pool, i, player.pos.x, player.pos.z);
}

describe('aggro-gated roaming (Audit Brute lurker)', () => {
  it('does NOT beeline the player while outside its aggro range', () => {
    // Brute starts at 30u; aggroRange is 15, so it should roam, not close in.
    const end = runBrute(30);
    expect(end).toBeGreaterThan(25); // stayed out there patrolling, didn't charge
  });

  it('locks on and chases once the player is within aggro range', () => {
    // Brute starts at 10u (< 15 aggro) → it commits and closes the gap.
    const end = runBrute(10);
    expect(end).toBeLessThan(9); // moved in toward the player
  });

  it('aggroRange 0 (fodder) always chases regardless of distance', () => {
    const pool = new EnemyPool();
    const sys = new EnemySystem(pool, 2);
    const player = createPlayer();
    // A copy of the brute with no aggro gate → behaves like normal fodder.
    const always = { ...AUDIT_BRUTE, aggroRange: 0 };
    const i = pool.spawn(always, 30, 0, 0, 0);
    pool.state[i] = EnemyState.Active;
    for (let t = 0; t < 90; t++) sys.step(player, t, 1 / 60);
    expect(distToPlayer(pool, i, player.pos.x, player.pos.z)).toBeLessThan(30); // closed in
  });
});
