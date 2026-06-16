// T43/V22: a boss kill offers three distinct, available major rewards; each
// applies a real run-changing effect. Evolution is only offered with an eligible
// weapon. Deterministic roll (V16).

import { describe, it, expect } from 'vitest';
import { rollBossRewards, BOSS_REWARDS, type RewardCtx } from './boss-rewards';
import { createPlayer } from './player';
import { defaultMods } from './progression/mods';
import { BuildEffects } from './progression/effects';
import { WeaponSystem } from './combat/weapon-system';
import { equip } from './combat/weapon';
import { rustDevilMinigun } from '../content/weapons/rust-devil-minigun';
import { contractualSidearm } from '../content/weapons/contractual-sidearm';
import { Rng } from '../core/rng';

function ctx(weapon = contractualSidearm): RewardCtx {
  const weapons = new WeaponSystem();
  weapons.add(equip(weapon));
  return { player: createPlayer(), mods: defaultMods(), effects: new BuildEffects(), weapons };
}

const byId = (id: string) => BOSS_REWARDS.find((r) => r.id === id)!;

describe('boss rewards', () => {
  it('rolls up to three distinct rewards', () => {
    const r = rollBossRewards(ctx(), new Rng(1));
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length);
  });

  it('only offers Field Evolution with an evolvable weapon', () => {
    expect(byId('field-evolution').available!(ctx(contractualSidearm))).toBe(false);
    expect(byId('field-evolution').available!(ctx(rustDevilMinigun))).toBe(true);
  });

  it('the artifact applies power AND a drawback', () => {
    const c = ctx();
    const moveBefore = c.player.stats.moveSpeed;
    byId('reactor-heart').apply(c);
    expect(c.mods.damageMult).toBeGreaterThan(1); // power
    expect(c.player.stats.moveSpeed).toBeLessThan(moveBefore); // drawback
  });

  it('the evolution reward swaps the weapon to its advanced form', () => {
    const c = ctx(rustDevilMinigun);
    byId('field-evolution').apply(c);
    expect(c.weapons.primaryId).toBe('rust-devil-apex');
  });
});
