// Run-and-gun lanes (T-momentum): mobility (movingSec/moving) + kill-streak rage
// (rageStacks) conditionals, plus trigger cards. Verifies the cards read the new
// ConditionalCtx signals correctly.

import { describe, it, expect } from 'vitest';
import { MOMENTUM_UPGRADES } from './momentum';
import { applyUpgrade, type UpgradeDefinition } from '../../sim/progression/upgrades';
import { BuildEffects, type ConditionalCtx, type TriggerCtx } from '../../sim/progression/effects';
import { defaultMods } from '../../sim/progression/mods';
import { createPlayer } from '../../sim/player';

const byId = (id: string) => MOMENTUM_UPGRADES.find((u) => u.id === id)!;

const CTX: ConditionalCtx = {
  enemiesOnScreen: 5,
  enemiesNearby: 5,
  nearestDist: 6,
  firingRampSec: 0,
  hpFrac: 1,
  recentCrit: false,
  recoilActive: false,
  stationarySec: 0,
  moving: false,
  movingSec: 0,
  rageStacks: 0,
};

function apply(def: UpgradeDefinition, effects: BuildEffects) {
  applyUpgrade(def, { player: createPlayer(), mods: defaultMods(), effects }, {});
}

describe('momentum / rage lanes', () => {
  it('Momentum ramps damage with movingSec, nothing when still', () => {
    const e = new BuildEffects();
    apply(byId('momentum'), e);
    expect(e.evalConditionals({ ...CTX, movingSec: 0 }).damageMult).toBe(1);
    expect(e.evalConditionals({ ...CTX, movingSec: 5 }).damageMult).toBeCloseTo(1.25, 6);
    expect(e.evalConditionals({ ...CTX, movingSec: 99 }).damageMult).toBeCloseTo(1.35, 6); // capped
  });

  it('Hit & Run adds crit only while moving', () => {
    const e = new BuildEffects();
    apply(byId('hit-and-run'), e);
    expect(e.evalConditionals({ ...CTX, moving: false }).critAdd).toBe(0);
    expect(e.evalConditionals({ ...CTX, moving: true }).critAdd).toBeCloseTo(0.12, 6);
  });

  it('Carnage Engine scales damage with kill-streak stacks', () => {
    const e = new BuildEffects();
    apply(byId('carnage-engine'), e);
    expect(e.evalConditionals({ ...CTX, rageStacks: 0 }).damageMult).toBe(1);
    expect(e.evalConditionals({ ...CTX, rageStacks: 12 }).damageMult).toBeCloseTo(1.24, 6);
  });

  it("Berserker's Crown scales both damage and crit with stacks", () => {
    const e = new BuildEffects();
    apply(byId('berserkers-crown'), e);
    const r = e.evalConditionals({ ...CTX, rageStacks: 10 });
    expect(r.damageMult).toBeCloseTo(1.4, 6);
    expect(r.critAdd).toBeCloseTo(0.1, 6);
  });

  it('Trophy Hunter banks rage stacks on a tough kill (variant 14 = Foreman boss)', () => {
    const e = new BuildEffects();
    const player = createPlayer();
    applyUpgrade(byId('trophy-hunter'), { player, mods: defaultMods(), effects: e }, {});
    // Fire a kill of a high-threat variant through the trigger surface.
    e.fire('kill', {
      x: 0,
      z: 0,
      player,
      enemies: { variant: [] },
      hash: {},
      rng: { next: () => 0 },
      fx: { push: () => {} },
      variant: 14, // Foreman boss — threat ≫ 8
      magnitude: 0,
      targetIndex: -1,
      procCoef: 1,
      hitDamage: 0,
      dealArea: () => 0,
      applyStatus: () => {},
    } as unknown as TriggerCtx);
    expect(player.rage).toBe(4);
  });
});
