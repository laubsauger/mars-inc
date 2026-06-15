import { describe, it, expect } from 'vitest';
import { WeaponSystem } from './weapon-system';
import { equip } from './weapon';
import { contractualSidearm } from '../../content/weapons/contractual-sidearm';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { createPlayer } from '../player';
import { defaultMods } from '../progression/mods';
import { Rng } from '../../core/rng';

function rebuild(hash: SpatialHash, enemies: EnemyPool): void {
  hash.clear();
  for (let i = 0; i < enemies.count; i++) hash.insert(i, enemies.posX[i]!, enemies.posZ[i]!);
}

function run(ws: WeaponSystem, player: ReturnType<typeof createPlayer>, enemies: EnemyPool) {
  const hash = new SpatialHash(2);
  const mods = defaultMods();
  const rng = new Rng(1);
  let killed = 0;
  for (let t = 0; t < 600 && enemies.count > 0; t++) {
    rebuild(hash, enemies);
    ws.step(player, enemies, hash, mods, rng, 1 / 60);
    killed += ws.kills.length;
  }
  return killed;
}

describe('WeaponSystem (T14 fire + collide + kill)', () => {
  it('mouse-aim fires toward cursor and kills the targeted enemy', () => {
    const enemies = new EnemyPool();
    const e = enemies.spawn(RUST_MITE, 4, 0, 0.6, 0);
    enemies.state[e] = EnemyState.Active;

    const player = createPlayer();
    player.aim = { x: 4, z: 0, has: true };

    const ws = new WeaponSystem();
    ws.add(equip(contractualSidearm));

    const killed = run(ws, player, enemies);
    expect(killed).toBe(1);
    expect(enemies.count).toBe(0);
  });

  it('falls back to nearest enemy when no cursor aim', () => {
    const enemies = new EnemyPool();
    const e = enemies.spawn(RUST_MITE, 0, 5, 0.6, 0);
    enemies.state[e] = EnemyState.Active;

    const player = createPlayer(); // aim.has = false

    const ws = new WeaponSystem();
    ws.add(equip(contractualSidearm));

    expect(run(ws, player, enemies)).toBe(1);
  });

  it('does not target telegraphing enemies', () => {
    const enemies = new EnemyPool();
    enemies.spawn(RUST_MITE, 3, 0, 999, 0); // stuck in Telegraph
    const player = createPlayer();
    player.aim = { x: 3, z: 0, has: true };
    const ws = new WeaponSystem();
    ws.add(equip(contractualSidearm));

    const hash = new SpatialHash(2);
    const mods = defaultMods();
    const rng = new Rng(1);
    for (let t = 0; t < 120; t++) {
      rebuild(hash, enemies);
      ws.step(player, enemies, hash, mods, rng, 1 / 60);
    }
    // No active target → no shot lands; telegraph enemy survives.
    expect(enemies.count).toBe(1);
  });

  it('projectiles are pooled (count stays bounded)', () => {
    const enemies = new EnemyPool();
    const player = createPlayer();
    player.aim = { x: 10, z: 0, has: true };
    const ws = new WeaponSystem();
    ws.add(equip(contractualSidearm));
    const hash = new SpatialHash(2);
    const mods = defaultMods();
    const rng = new Rng(1);
    for (let t = 0; t < 600; t++) {
      rebuild(hash, enemies);
      ws.step(player, enemies, hash, mods, rng, 1 / 60);
    }
    // Lifetime expiry recycles slots — never unbounded growth.
    expect(ws.projectiles.count).toBeLessThan(10);
  });
});
