// Weapon catalog (T33, §I.data) + the innate-pellets mechanic. Weapons are data;
// the weapon system reads them. Verifies the slice set is well-formed and that a
// shotgun's pellet count fans out through the shared fire path.

import { describe, it, expect } from 'vitest';
import { WEAPONS, weaponById } from './index';
import { liabilityShotgun } from './liability-shotgun';
import { contractualSidearm } from './contractual-sidearm';
import { WeaponSystem } from '../../sim/combat/weapon-system';
import { equip } from '../../sim/combat/weapon';
import { EnemyPool } from '../../sim/enemies';
import { SpatialHash } from '../../sim/spatial-hash';
import { defaultMods } from '../../sim/progression/mods';
import { Rng } from '../../core/rng';
import { FxQueue } from '../../sim/fx';
import { createPlayer } from '../../sim/player';

describe('weapon catalog', () => {
  it('has seven weapons with unique ids and several families', () => {
    expect(WEAPONS).toHaveLength(7);
    const ids = new Set(WEAPONS.map((w) => w.id));
    expect(ids.size).toBe(7);
    const families = new Set(WEAPONS.map((w) => w.family));
    expect(families.size).toBeGreaterThanOrEqual(5);
  });

  it('the Ion Lance is a hitscan energy weapon', () => {
    const lance = weaponById('ion-lance');
    expect(lance?.hitscan?.width).toBeGreaterThan(0);
    expect(lance?.family).toBe('energy');
  });

  it('looks up by id', () => {
    expect(weaponById('phobos-driver')?.displayName).toBe('Phobos Driver');
    expect(weaponById('nope')).toBeUndefined();
  });

  it('recoil is a real per-weapon trade-off (rapid/heavy kick hard, precise barely)', () => {
    const recoil = (id: string) => weaponById(id)!.recoil;
    // Minigun + the heavy hitters shove you; the energy repeater stays planted.
    expect(recoil('rust-devil-minigun')).toBeGreaterThan(recoil('arc-repeater') * 5);
    expect(recoil('liability-shotgun')).toBeGreaterThan(recoil('contractual-sidearm'));
    expect(recoil('arc-repeater')).toBeLessThan(recoil('contractual-sidearm'));
  });
});

function fireOnce(def: typeof liabilityShotgun): number {
  const ws = new WeaponSystem();
  ws.add(equip(def));
  const player = createPlayer();
  player.aim = { x: 0, z: 10, has: true }; // mouse-aim toward a point
  ws.step(
    player,
    new EnemyPool(),
    new SpatialHash(2),
    defaultMods(),
    new Rng(1),
    1 / 60,
    new FxQueue(),
  );
  return ws.projectiles.count;
}

describe('innate pellets', () => {
  it('a shotgun fires its full pellet fan in one shot', () => {
    expect(fireOnce(liabilityShotgun)).toBe(liabilityShotgun.pellets);
  });

  it('a single-shot weapon fires one projectile', () => {
    expect(fireOnce(contractualSidearm)).toBe(1);
  });
});
