// Pierce + chain-lightning run-mods (modifier math). Tested at the weapon-system
// level so they don't couple to the upgrade-context shape: pierce is folded into
// projectile spawn; chain arcs reduced damage to nearby enemies via the
// centralized pipeline (V3).

import { describe, it, expect } from 'vitest';
import { WeaponSystem } from './weapon-system';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { defaultMods } from '../progression/mods';
import { Rng } from '../../core/rng';
import { FxQueue } from '../fx';
import { createPlayer } from '../player';
import { contractualSidearm } from '../../content/weapons/contractual-sidearm';
import { applyUpgrade } from '../progression/upgrades';
import { BuildEffects } from '../progression/effects';
import { UPGRADES } from '../../content/upgrades/index';

// Zero-crit spec so direct vs. arc damage is deterministic (no crit variance).
const NO_CRIT = { ...contractualSidearm.damage, critChance: 0 };

function activeEnemy(pool: EnemyPool, x: number, z: number, hp = 100): number {
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  pool.health[i] = hp;
  return i;
}

describe('pierce / chain upgrades apply to the mod layer', () => {
  it('Liability Waiver adds pierce; Arc Garnishment adds chain', () => {
    const mods = defaultMods();
    const player = createPlayer();
    const effects = new BuildEffects();
    applyUpgrade(UPGRADES.find((u) => u.id === 'liability-waiver')!, { player, mods, effects }, {});
    applyUpgrade(UPGRADES.find((u) => u.id === 'arc-garnishment')!, { player, mods, effects }, {});
    expect(mods.pierce).toBe(1);
    expect(mods.chainCount).toBe(2); // first pick lands a real 2-jump chain
  });
});

describe('pierce', () => {
  it('a piercing projectile damages two overlapping enemies in one pass', () => {
    const pool = new EnemyPool();
    const a = activeEnemy(pool, 5, 0);
    const b = activeEnemy(pool, 5, 0.3); // both within the projectile hit radius

    const hash = new SpatialHash(2);
    hash.insert(a, 5, 0);
    hash.insert(b, 5, 0.3);

    const ws = new WeaponSystem();
    ws.projectiles.spawn(5, 0, 0, 0, 0.2, 1, 1, NO_CRIT); // pierce 1 → hits 2

    ws.step(createPlayer(), pool, hash, defaultMods(), new Rng(1), 1 / 60, new FxQueue());
    expect(pool.health[a]!).toBeLessThan(100);
    expect(pool.health[b]!).toBeLessThan(100);
  });

  it('a non-piercing projectile stops at the first enemy', () => {
    const pool = new EnemyPool();
    const a = activeEnemy(pool, 5, 0);
    const b = activeEnemy(pool, 5, 0.3);
    const hash = new SpatialHash(2);
    hash.insert(a, 5, 0);
    hash.insert(b, 5, 0.3);
    const ws = new WeaponSystem();
    ws.projectiles.spawn(5, 0, 0, 0, 0.2, 1, 0, NO_CRIT); // pierce 0
    ws.step(createPlayer(), pool, hash, defaultMods(), new Rng(1), 1 / 60, new FxQueue());
    // Exactly one of the two took damage (the first hit consumed the projectile).
    const hit = (pool.health[a]! < 100 ? 1 : 0) + (pool.health[b]! < 100 ? 1 : 0);
    expect(hit).toBe(1);
  });
});

describe('explosive blast', () => {
  it('an explosive projectile damages the struck enemy AND nearby ones', () => {
    const pool = new EnemyPool();
    const a = activeEnemy(pool, 5, 0); // direct hit
    const b = activeEnemy(pool, 6, 0.5); // caught in the blast (within radius 4)
    const c = activeEnemy(pool, 30, 0); // far away, untouched

    const hash = new SpatialHash(2);
    hash.insert(a, 5, 0);
    hash.insert(b, 6, 0.5);
    hash.insert(c, 30, 0);

    const ws = new WeaponSystem();
    ws.projectiles.spawn(5, 0, 0, 0, 0.2, 1, 0, NO_CRIT, 4.0); // blast radius 4

    ws.step(createPlayer(), pool, hash, defaultMods(), new Rng(1), 1 / 60, new FxQueue());

    expect(pool.health[a]!).toBeLessThan(100); // direct
    expect(pool.health[b]!).toBeLessThan(100); // splash
    expect(pool.health[c]!).toBe(100); // out of range
  });
});

describe('chain lightning', () => {
  it('arcs reduced damage from a struck enemy to a nearby one', () => {
    const pool = new EnemyPool();
    const a = activeEnemy(pool, 5, 0); // direct hit
    const b = activeEnemy(pool, 5, 1); // within chain range, not a direct hit

    const hash = new SpatialHash(2);
    hash.insert(a, 5, 0);
    hash.insert(b, 5, 1);

    const ws = new WeaponSystem(); // no weapons → fire() is a no-op
    ws.projectiles.spawn(5, 0, 0, 0, 0.2, 1, 0, NO_CRIT); // stationary, sits on A

    const mods = { ...defaultMods(), chainCount: 1, chainChance: 1, chainRange: 6 }; // 100% arc for the test
    ws.step(createPlayer(), pool, hash, mods, new Rng(1), 1 / 60, new FxQueue());

    expect(pool.health[a]!).toBeLessThan(100); // direct hit
    expect(pool.health[b]!).toBeLessThan(100); // chained arc
    expect(pool.health[b]!).toBeGreaterThan(pool.health[a]!); // arc is weaker
  });

  it('does nothing extra when chainCount is 0', () => {
    const pool = new EnemyPool();
    const a = activeEnemy(pool, 5, 0);
    const b = activeEnemy(pool, 5, 1);
    const hash = new SpatialHash(2);
    hash.insert(a, 5, 0);
    hash.insert(b, 5, 1);
    const ws = new WeaponSystem();
    ws.projectiles.spawn(5, 0, 0, 0, 0.2, 1, 0, NO_CRIT);
    ws.step(createPlayer(), pool, hash, defaultMods(), new Rng(1), 1 / 60, new FxQueue());
    expect(pool.health[b]!).toBe(100); // untouched without chain
  });
});
