import { describe, it, expect } from 'vitest';
import { WeaponSystem } from './weapon-system';
import { equip } from './weapon';
import { contractualSidearm } from '../../content/weapons/contractual-sidearm';
import { ionLance } from '../../content/weapons/ion-lance';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { createPlayer } from '../player';
import { defaultMods } from '../progression/mods';
import { FxQueue } from '../fx';
import { Rng } from '../../core/rng';

function rebuild(hash: SpatialHash, enemies: EnemyPool): void {
  hash.clear();
  for (let i = 0; i < enemies.count; i++) hash.insert(i, enemies.posX[i]!, enemies.posZ[i]!);
}

function run(ws: WeaponSystem, player: ReturnType<typeof createPlayer>, enemies: EnemyPool) {
  const hash = new SpatialHash(2);
  const mods = defaultMods();
  const fx = new FxQueue();
  const rng = new Rng(1);
  let killed = 0;
  for (let t = 0; t < 600 && enemies.count > 0; t++) {
    rebuild(hash, enemies);
    ws.step(player, enemies, hash, mods, rng, 1 / 60, fx);
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

  it('the Ion Lance hitscan beam damages enemies on the aim line + emits a laser FX', () => {
    const enemies = new EnemyPool();
    // Two mites in a line down +x (beam pierces 2) + one off the line. Give them
    // plenty of HP so they SURVIVE the hit — otherwise compactDead swap-removes the
    // dead ones and the index-based health check reads the wrong enemy.
    const a = enemies.spawn(RUST_MITE, 5, 0, 0, 0);
    const b = enemies.spawn(RUST_MITE, 9, 0, 0, 1);
    const off = enemies.spawn(RUST_MITE, 7, 5, 0, 2);
    for (const e of [a, b, off]) {
      enemies.state[e] = EnemyState.Active;
      enemies.health[e] = enemies.maxHp[e] = 200; // survive the beam
    }

    const player = createPlayer();
    player.aim = { x: 5, z: 0, has: true };
    const ws = new WeaponSystem();
    ws.add(equip(ionLance));

    const hash = new SpatialHash(2);
    rebuild(hash, enemies);
    const fx = new FxQueue();
    ws.step(player, enemies, hash, defaultMods(), new Rng(1), 1 / 60, fx);

    expect(fx.events.some((e) => e.kind === 'laser')).toBe(true); // drew the beam
    expect(enemies.health[a]!).toBeLessThan(200); // on-line: hit
    expect(enemies.health[b]!).toBeLessThan(200); // pierced to the 2nd
    expect(enemies.health[off]!).toBe(200); // off the line: untouched
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
    const fx = new FxQueue();
    const rng = new Rng(1);
    for (let t = 0; t < 120; t++) {
      rebuild(hash, enemies);
      ws.step(player, enemies, hash, mods, rng, 1 / 60, fx);
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
    const fx = new FxQueue();
    const rng = new Rng(1);
    for (let t = 0; t < 600; t++) {
      rebuild(hash, enemies);
      ws.step(player, enemies, hash, mods, rng, 1 / 60, fx);
    }
    // Lifetime expiry recycles slots — never unbounded growth.
    expect(ws.projectiles.count).toBeLessThan(10);
  });

  it('pierce passes through to a SECOND enemy (not eaten re-hitting the first)', () => {
    const enemies = new EnemyPool();
    const a = enemies.spawn(RUST_MITE, 4, 0, 0, 0);
    const b = enemies.spawn(RUST_MITE, 7, 0, 0, 0); // further down the same line
    enemies.state[a] = EnemyState.Active;
    enemies.state[b] = EnemyState.Active;
    enemies.health[a] = 100; // survive so we can confirm BOTH took damage
    enemies.health[b] = 100;

    const ws = new WeaponSystem();
    ws.add(equip(contractualSidearm));
    ws.weapons[0]!.cooldownLeft = 999; // suppress auto-fire; drive one manual shot
    // One projectile flying +x with pierce 1.
    ws.projectiles.spawn(0, 0, 24, 0, 0.18, 5, 1, { ...contractualSidearm.damage, critChance: 0 });

    const hash = new SpatialHash(2);
    const mods = defaultMods();
    const fx = new FxQueue();
    const rng = new Rng(1);
    const player = createPlayer();
    for (let t = 0; t < 90; t++) {
      rebuild(hash, enemies);
      ws.step(player, enemies, hash, mods, rng, 1 / 60, fx);
    }
    expect(enemies.health[a]!).toBeLessThan(100); // hit first
    expect(enemies.health[b]!).toBeLessThan(100); // pierced through to the second
  });

  it('ricochet redirects a spent projectile to a fresh enemy (visible bounce)', () => {
    const enemies = new EnemyPool();
    const a = enemies.spawn(RUST_MITE, 5, 0, 0, 0);
    const b = enemies.spawn(RUST_MITE, 5, 3, 0, 0);
    enemies.state[a] = EnemyState.Active;
    enemies.state[b] = EnemyState.Active;
    enemies.health[a] = 100; // survive the hit so we can detect both took damage
    enemies.health[b] = 100;

    const player = createPlayer();
    const ws = new WeaponSystem();
    ws.add(equip(contractualSidearm));
    ws.weapons[0]!.cooldownLeft = 999; // suppress auto-fire; drive one manual projectile

    // One projectile flying +x toward enemy a, with 1 ricochet bounce, no pierce.
    ws.projectiles.spawn(
      0,
      0,
      24,
      0,
      0.18,
      5,
      0,
      { ...contractualSidearm.damage, critChance: 0 },
      0,
      0,
      1,
    );

    const hash = new SpatialHash(2);
    const mods = defaultMods();
    mods.ricochet = 1;
    const fx = new FxQueue();
    const rng = new Rng(1);
    for (let t = 0; t < 90; t++) {
      rebuild(hash, enemies);
      ws.step(player, enemies, hash, mods, rng, 1 / 60, fx);
    }

    expect(enemies.health[a]!).toBeLessThan(100); // direct hit
    expect(enemies.health[b]!).toBeLessThan(100); // bounce reached the second enemy
  });

  it('without ricochet a spent projectile dies on first hit (no bounce)', () => {
    const enemies = new EnemyPool();
    const a = enemies.spawn(RUST_MITE, 5, 0, 0, 0);
    const b = enemies.spawn(RUST_MITE, 5, 3, 0, 0);
    enemies.state[a] = EnemyState.Active;
    enemies.state[b] = EnemyState.Active;
    enemies.health[a] = 100;
    enemies.health[b] = 100;

    const player = createPlayer();
    const ws = new WeaponSystem();
    ws.add(equip(contractualSidearm));
    ws.weapons[0]!.cooldownLeft = 999;
    ws.projectiles.spawn(0, 0, 24, 0, 0.18, 5, 0, { ...contractualSidearm.damage, critChance: 0 });

    const hash = new SpatialHash(2);
    const mods = defaultMods(); // ricochet 0
    const fx = new FxQueue();
    const rng = new Rng(1);
    for (let t = 0; t < 90; t++) {
      rebuild(hash, enemies);
      ws.step(player, enemies, hash, mods, rng, 1 / 60, fx);
    }

    expect(enemies.health[a]!).toBeLessThan(100); // hit
    expect(enemies.health[b]!).toBe(100); // untouched — no bounce
  });
});
