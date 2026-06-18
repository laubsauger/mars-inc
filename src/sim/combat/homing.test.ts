// Smart Rounds (T-homing): projectiles with mods.homingTurn > 0 curve toward the
// nearest enemy in flight (capped turn rate). Deterministic (V16).

import { describe, it, expect } from 'vitest';
import { WeaponSystem } from './weapon-system';
import { equip } from './weapon';
import { contractualSidearm } from '../../content/weapons/contractual-sidearm';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { createPlayer } from '../player';
import { defaultMods } from '../progression/mods';
import { Rng } from '../../core/rng';
import { FxQueue } from '../fx';

const DT = 1 / 60;

function buildHash(pool: EnemyPool): SpatialHash {
  const hash = new SpatialHash(4);
  hash.clear();
  for (let e = 0; e < pool.count; e++) hash.insert(e, pool.posX[e]!, pool.posZ[e]!);
  return hash;
}

describe('homing projectiles', () => {
  it('curves a straight-fired bullet toward an off-axis enemy', () => {
    const ws = new WeaponSystem();
    ws.add(equip(contractualSidearm));
    const player = createPlayer();
    player.aim = { x: 0, z: 10, has: true }; // fire straight toward +z

    const pool = new EnemyPool();
    // Enemy ahead but well off to the +x side → a straight bullet would miss it.
    const e = pool.spawn(RUST_MITE, 6, 7, 0, 0);
    pool.state[e] = EnemyState.Active;
    pool.health[e] = 1000;
    pool.maxHp[e] = 1000;

    const mods = defaultMods();
    mods.homingTurn = 12; // sharp seeker
    const rng = new Rng(1);

    // step() fires AND advances, so the bullet already steers toward the +x enemy
    // this same step — its velocity gains a strong +x component (it was launched
    // straight +z, where a non-homing bullet keeps velX ≈ 0; see the next test).
    ws.step(player, pool, buildHash(pool), mods, rng, DT, new FxQueue());
    expect(ws.projectiles.count).toBeGreaterThan(0);
    expect(ws.projectiles.velX[0]!).toBeGreaterThan(1); // curved toward +x
  });

  it('flies straight with homingTurn = 0', () => {
    const ws = new WeaponSystem();
    ws.add(equip(contractualSidearm));
    const player = createPlayer();
    player.aim = { x: 0, z: 10, has: true };
    const pool = new EnemyPool();
    const e = pool.spawn(RUST_MITE, 6, 7, 0, 0);
    pool.state[e] = EnemyState.Active;
    const mods = defaultMods(); // homingTurn = 0
    const rng = new Rng(1);
    ws.step(player, pool, buildHash(pool), mods, rng, DT, new FxQueue());
    // No homing → the bullet keeps its launch heading (straight +z, velX ≈ 0).
    expect(Math.abs(ws.projectiles.velX[0]!)).toBeLessThan(0.5);
  });
});
