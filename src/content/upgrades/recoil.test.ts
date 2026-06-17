// Recoil build family (T55): recoil feeds sprint, buffs shots while active, ramps
// fire rate, and gates a catastrophe. Recoil impulse stays V10-capped.

import { describe, it, expect } from 'vitest';
import { RECOIL_UPGRADES } from './recoil';
import { available, applyUpgrade, type UpgradeDefinition } from '../../sim/progression/upgrades';
import { BuildEffects, type ConditionalCtx } from '../../sim/progression/effects';
import { defaultMods } from '../../sim/progression/mods';
import { createPlayer } from '../../sim/player';

const byId = (id: string) => RECOIL_UPGRADES.find((u) => u.id === id)!;

const CTX: ConditionalCtx = {
  enemiesOnScreen: 5,
  enemiesNearby: 5,
  nearestDist: 6,
  firingRampSec: 0,
  hpFrac: 1,
  recentCrit: false,
  recoilActive: false,
  stationarySec: 0,
};

function apply(
  def: UpgradeDefinition,
  ctx: {
    player: ReturnType<typeof createPlayer>;
    mods: ReturnType<typeof defaultMods>;
    effects: BuildEffects;
  },
) {
  applyUpgrade(def, ctx, {});
}

describe('recoil build family (T55)', () => {
  it('Backblast Harness turns on recoil→sprint recharge', () => {
    const player = createPlayer();
    apply(byId('backblast-harness'), { player, mods: defaultMods(), effects: new BuildEffects() });
    expect(player.recoilSprintRecharge).toBe(true);
  });

  it('Brass Surfing adds pierce + only buffs damage while recoil is active', () => {
    const mods = defaultMods();
    const effects = new BuildEffects();
    apply(byId('brass-surfing'), { player: createPlayer(), mods, effects });
    expect(mods.pierce).toBe(1);
    expect(effects.evalConditionals({ ...CTX, recoilActive: false }).damageMult).toBe(1);
    expect(effects.evalConditionals({ ...CTX, recoilActive: true }).damageMult).toBeCloseTo(1.3, 6);
  });

  it('Kinetic Overdraft is a flat fire-rate-for-recoil liability (no ramp/hold)', () => {
    const mods = defaultMods();
    const effects = new BuildEffects();
    apply(byId('kinetic-overdraft'), { player: createPlayer(), mods, effects });
    expect(mods.fireRateMult).toBeCloseTo(1.35, 6); // +35% fire rate
    expect(mods.recoilMult).toBeCloseTo(1.45, 6); // recoil kicks 45% harder
    // No conditional registered — the old "while holding a target" ramp is gone.
    expect(effects.evalConditionals({ ...CTX, firingRampSec: 100 }).fireRateMult).toBe(1);
  });

  it('the recoil cards are gated behind owning a recoil source', () => {
    expect(available(RECOIL_UPGRADES, {}).some((u) => u.id === 'brass-surfing')).toBe(false);
    const owned = { 'backblast-harness': 1 };
    expect(available(RECOIL_UPGRADES, owned).some((u) => u.id === 'brass-surfing')).toBe(true);
  });

  it('God-Kicker needs Kinetic Overdraft first', () => {
    const withRecoil = { 'backblast-harness': 1 };
    expect(available(RECOIL_UPGRADES, withRecoil).some((u) => u.id === 'god-kicker-assembly')).toBe(
      false,
    );
    const ready = { 'backblast-harness': 1, 'kinetic-overdraft': 1 };
    expect(available(RECOIL_UPGRADES, ready).some((u) => u.id === 'god-kicker-assembly')).toBe(
      true,
    );
  });
});
