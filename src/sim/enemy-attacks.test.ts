// Enemy ranged framework (T33): a lobbed grenade cooks off and deals AoE to the
// player only if they're inside the telegraphed radius at detonation — so it's
// dodgeable. Range-gated and pooled. Deterministic via a seeded rng (V16).

import { describe, it, expect } from 'vitest';
import { EnemyAttackSystem } from './enemy-attacks';
import {
  EnemyPool,
  EnemyState,
  SEVERANCE_LOBBER,
  REPO_MARSHAL,
  FORECLOSURE_MORTAR,
  RIOT_SHOTGUNNER,
} from './enemies';
import { createPlayer } from './player';
import { Rng } from '../core/rng';
import { FxQueue } from './fx';

const DT = 1 / 60;

function grenadier(pool: EnemyPool, x: number, z: number): number {
  const i = pool.spawn(SEVERANCE_LOBBER, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  return i;
}

function gunner(pool: EnemyPool, x: number, z: number): number {
  const i = pool.spawn(REPO_MARSHAL, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  return i;
}

describe('enemy lob attack', () => {
  it('cooks off and damages a stationary player in the blast radius', () => {
    const pool = new EnemyPool();
    grenadier(pool, 20, 0);
    const player = createPlayer(); // at origin, 100 hp
    const sys = new EnemyAttackSystem();
    const rng = new Rng(5);
    const fx = new FxQueue();

    let sawHazard = false;
    for (let t = 0; t < 300 && player.health === 100; t++) {
      sys.step(pool, player, rng, DT, fx);
      if (sys.hazards.count > 0) sawHazard = true;
    }
    expect(sawHazard).toBe(true); // grenade landed and armed a telegraphed zone
    expect(player.health).toBeLessThan(100); // blast connected
  });

  it('misses a player who leaves the radius before detonation (dodgeable)', () => {
    const pool = new EnemyPool();
    grenadier(pool, 20, 0);
    const player = createPlayer();
    const sys = new EnemyAttackSystem();
    const rng = new Rng(5);
    const fx = new FxQueue();

    let moved = false;
    for (let t = 0; t < 300; t++) {
      sys.step(pool, player, rng, DT, fx);
      // As soon as the hazard arms, sprint clear of it.
      if (sys.hazards.count > 0 && !moved) {
        player.pos.x = 40;
        player.pos.z = 40;
        moved = true;
      }
    }
    expect(moved).toBe(true);
    expect(player.health).toBe(100); // dodged the cook-off
  });

  it('does not fire from outside attack range', () => {
    const pool = new EnemyPool();
    grenadier(pool, 40, 0); // beyond range 22
    const player = createPlayer();
    const sys = new EnemyAttackSystem();
    const rng = new Rng(5);
    const fx = new FxQueue();
    for (let t = 0; t < 120; t++) sys.step(pool, player, rng, DT, fx);
    expect(sys.projectiles.count).toBe(0);
    expect(sys.hazards.count).toBe(0);
  });

  it('respects cooldown — at most one grenade in the air shortly after firing', () => {
    const pool = new EnemyPool();
    grenadier(pool, 18, 0);
    const player = createPlayer();
    const sys = new EnemyAttackSystem();
    const rng = new Rng(9);
    const fx = new FxQueue();
    // Step a short window (< cooldown) and count grenades launched.
    let maxInAir = 0;
    for (let t = 0; t < 30; t++) {
      sys.step(pool, player, rng, DT, fx);
      maxInAir = Math.max(maxInAir, sys.projectiles.count);
    }
    expect(maxInAir).toBeLessThanOrEqual(1);
  });
});

describe('enemy gun attack', () => {
  it('a straight round hits a stationary player in its path', () => {
    const pool = new EnemyPool();
    gunner(pool, 15, 0); // within range 26, lined up with player at origin
    const player = createPlayer();
    const sys = new EnemyAttackSystem();
    const rng = new Rng(3);
    const fx = new FxQueue();
    for (let t = 0; t < 120 && player.health === 100; t++) {
      sys.step(pool, player, rng, DT, fx);
    }
    expect(player.health).toBeLessThan(100);
  });

  it('rounds expire at max range and never spawn a ground hazard', () => {
    const pool = new EnemyPool();
    gunner(pool, 15, 0);
    const player = createPlayer();
    const sys = new EnemyAttackSystem();
    const rng = new Rng(3);
    const fx = new FxQueue();
    // Player far off the firing line: rounds fly past and expire.
    player.pos.x = 0;
    player.pos.z = 40;
    for (let t = 0; t < 300; t++) sys.step(pool, player, rng, DT, fx);
    expect(sys.hazards.count).toBe(0); // guns never create AoE zones
    expect(sys.projectiles.count).toBeLessThanOrEqual(2); // bounded, they expire
  });

  it('does not fire from outside range', () => {
    const pool = new EnemyPool();
    gunner(pool, 40, 0); // beyond range 26
    const player = createPlayer();
    const sys = new EnemyAttackSystem();
    for (let t = 0; t < 120; t++) sys.step(pool, player, new Rng(3), DT, new FxQueue());
    expect(sys.projectiles.count).toBe(0);
  });

  it('a shotgunner volley puts multiple pellets in the air at once', () => {
    const pool = new EnemyPool();
    const i = pool.spawn(RIOT_SHOTGUNNER, 10, 0, 0, 0);
    pool.state[i] = EnemyState.Active;
    const player = createPlayer();
    const sys = new EnemyAttackSystem();
    const rng = new Rng(1);
    const fx = new FxQueue();
    let maxInAir = 0;
    for (let t = 0; t < 10; t++) {
      sys.step(pool, player, rng, DT, fx);
      maxInAir = Math.max(maxInAir, sys.projectiles.count);
    }
    expect(maxInAir).toBe(5); // burst of 5 pellets
  });
});

describe('mortar', () => {
  it('lobs a wide, heavy shell that cooks off into a large blast', () => {
    const pool = new EnemyPool();
    const i = pool.spawn(FORECLOSURE_MORTAR, 28, 0, 0, 0);
    pool.state[i] = EnemyState.Active;
    const player = createPlayer();
    const sys = new EnemyAttackSystem();
    const rng = new Rng(2);
    const fx = new FxQueue();
    let blastRadius = 0;
    for (let t = 0; t < 400 && player.health === 100; t++) {
      sys.step(pool, player, rng, DT, fx);
      if (sys.hazards.count > 0) blastRadius = Math.max(blastRadius, sys.hazards.radius[0]!);
    }
    expect(blastRadius).toBeGreaterThan(4); // big AoE
    expect(player.health).toBeLessThan(100); // heavy hit
  });
});
