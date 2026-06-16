// Weapon drops (T33): the boss always drops a crate; standing on a crate and
// pressing pickup (E) swaps the player's primary weapon. Crates decay after a
// TTL. Deterministic via a seeded rng (V16).

import { describe, it, expect } from 'vitest';
import { WeaponDropSystem, DROP_TTL } from './weapon-drops';
import { WeaponSystem } from './combat/weapon-system';
import type { KillEvent } from './combat/weapon-system';
import { equip } from './combat/weapon';
import { contractualSidearm } from '../content/weapons/contractual-sidearm';
import { createPlayer } from './player';
import { Rng } from '../core/rng';
import { FxQueue } from './fx';

function freshWeapons(): WeaponSystem {
  const ws = new WeaponSystem();
  ws.add(equip(contractualSidearm));
  return ws;
}

describe('weapon drops', () => {
  const DT = 1 / 60;

  it('a boss kill always drops a crate', () => {
    const sys = new WeaponDropSystem();
    const kills: KillEvent[] = [{ x: 5, z: 5, variant: 2 }]; // boss variant
    const player = createPlayer();
    player.pos.x = 100; // far away so it isn't instantly collected
    sys.step(player, kills, freshWeapons(), new Rng(1), new FxQueue(), DT, false);
    expect(sys.pool.count).toBe(1);
  });

  it('standing on a crate does NOT swap until pickup is pressed', () => {
    const sys = new WeaponDropSystem();
    const weapons = freshWeapons();
    const player = createPlayer();
    player.pos.x = 100; // far → crate drops but isn't collected yet
    const rng = new Rng(1);
    const fx = new FxQueue();
    sys.step(player, [{ x: 0, z: 0, variant: 2 }], weapons, rng, fx, DT, false);
    expect(sys.pool.count).toBe(1);

    // Walk onto the crate but DON'T press pickup → no swap, crate stays, prompt set.
    player.pos.x = 0;
    player.pos.z = 0;
    sys.step(player, [], weapons, rng, fx, DT, false);
    expect(sys.pool.count).toBe(1);
    expect(sys.promptIndex).toBe(0);
    expect(sys.justPicked).toBeNull();
    expect(weapons.primaryId).toBe('contractual-sidearm'); // unchanged

    // Press pickup → swap + crate consumed.
    sys.step(player, [], weapons, rng, fx, DT, true);
    expect(sys.pool.count).toBe(0);
    expect(sys.justPicked).not.toBeNull();
    expect(weapons.primaryId).not.toBe('contractual-sidearm');
  });

  it('pressing pickup while not on a crate does nothing', () => {
    const sys = new WeaponDropSystem();
    const weapons = freshWeapons();
    const player = createPlayer();
    player.pos.x = 100;
    const rng = new Rng(1);
    const fx = new FxQueue();
    sys.step(player, [{ x: 0, z: 0, variant: 2 }], weapons, rng, fx, DT, false);
    // Player far from the crate, presses E → no swap.
    sys.step(player, [], weapons, rng, fx, DT, true);
    expect(sys.pool.count).toBe(1);
    expect(weapons.primaryId).toBe('contractual-sidearm');
  });

  it('an ignored crate decays after its TTL', () => {
    const sys = new WeaponDropSystem();
    const weapons = freshWeapons();
    const player = createPlayer();
    player.pos.x = 100; // never collect it
    const rng = new Rng(1);
    const fx = new FxQueue();
    sys.step(player, [{ x: 0, z: 0, variant: 2 }], weapons, rng, fx, DT, false);
    expect(sys.pool.count).toBe(1);
    const steps = Math.ceil(DROP_TTL / DT) + 2;
    for (let t = 0; t < steps; t++) sys.step(player, [], weapons, rng, fx, DT, false);
    expect(sys.pool.count).toBe(0); // aged out
  });

  it('ordinary kills rarely drop (chance-gated), and the pool is bounded', () => {
    const sys = new WeaponDropSystem();
    const player = createPlayer();
    player.pos.x = 100;
    const weapons = freshWeapons();
    const rng = new Rng(7);
    const fx = new FxQueue();
    for (let t = 0; t < 500; t++) {
      sys.step(player, [{ x: 5, z: 5, variant: 0 }], weapons, rng, fx, DT, false); // mite kills
    }
    expect(sys.pool.count).toBeLessThanOrEqual(32); // bounded by capacity
  });
});
