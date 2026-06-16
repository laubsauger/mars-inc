import { describe, it, expect } from 'vitest';
import { ADVANCED_UPGRADES } from './advanced';
import { BuildEffects, type ConditionalCtx, type TriggerCtx } from '../../sim/progression/effects';
import { defaultMods } from '../../sim/progression/mods';
import { createPlayer } from '../../sim/player';

function apply(id: string): BuildEffects {
  const def = ADVANCED_UPGRADES.find((u) => u.id === id)!;
  const effects = new BuildEffects();
  def.apply({ player: createPlayer(), mods: defaultMods(), effects });
  return effects;
}

const BASE: ConditionalCtx = {
  enemiesOnScreen: 3,
  nearestDist: 5,
  firingRampSec: 0,
  hpFrac: 1,
  recentCrit: false,
  recoilActive: false,
  stationarySec: 0,
};

describe('advanced upgrades drive the build engine (T38)', () => {
  it('Last Contract: +60% damage only below 35% hp (conditional)', () => {
    const e = apply('last-contract');
    expect(e.evalConditionals({ ...BASE, hpFrac: 0.9 }).damageMult).toBe(1);
    expect(e.evalConditionals({ ...BASE, hpFrac: 0.2 }).damageMult).toBeCloseTo(1.6, 6);
  });

  it('Point-Blank Clause: +50% damage only when an enemy is close', () => {
    const e = apply('point-blank-clause');
    expect(e.evalConditionals({ ...BASE, nearestDist: 12 }).damageMult).toBe(1);
    expect(e.evalConditionals({ ...BASE, nearestDist: 3 }).damageMult).toBeCloseTo(1.5, 6);
  });

  it('Crowd Control Clause: crit only against 12+ enemies', () => {
    const e = apply('crowd-clause');
    expect(e.evalConditionals({ ...BASE, enemiesOnScreen: 5 }).critAdd).toBe(0);
    expect(e.evalConditionals({ ...BASE, enemiesOnScreen: 20 }).critAdd).toBeCloseTo(0.15, 6);
  });

  it('Severance Package: registers an on-kill trigger that deals area damage', () => {
    const e = apply('severance-package');
    expect(e.has('kill')).toBe(true);
    let dealt = 0;
    e.fire('kill', {
      x: 0,
      z: 0,
      player: {} as TriggerCtx['player'],
      enemies: {} as TriggerCtx['enemies'],
      hash: {} as TriggerCtx['hash'],
      rng: {} as TriggerCtx['rng'],
      fx: { push: () => {} } as unknown as TriggerCtx['fx'],
      variant: 0,
      magnitude: 0,
      targetIndex: 0,
      procCoef: 1,
      hitDamage: 0,
      depth: 0,
      applyStatus: () => {},
      dealArea: (_x, _z, _r, amount) => {
        dealt += amount;
        return amount;
      },
    });
    expect(dealt).toBeGreaterThan(0);
  });

  it('Hostile Takeover: legendary on-overkill nova scales with magnitude', () => {
    const e = apply('hostile-takeover');
    expect(e.has('overkill')).toBe(true);
    let radius = 0;
    e.fire('overkill', {
      x: 0,
      z: 0,
      player: {} as TriggerCtx['player'],
      enemies: {} as TriggerCtx['enemies'],
      hash: {} as TriggerCtx['hash'],
      rng: {} as TriggerCtx['rng'],
      fx: { push: () => {} } as unknown as TriggerCtx['fx'],
      variant: 1,
      magnitude: 20,
      targetIndex: 0,
      procCoef: 1,
      hitDamage: 0,
      depth: 0,
      applyStatus: () => {},
      dealArea: (_x, _z, r, _amount) => {
        radius = r;
        return _amount;
      },
    });
    expect(radius).toBeCloseTo(4.5, 6);
  });

  it('every advanced upgrade carries a valid rarity', () => {
    const valid = new Set(['common', 'uncommon', 'rare', 'legendary', 'corrupted', 'prototype']);
    for (const u of ADVANCED_UPGRADES) expect(valid.has(u.rarity)).toBe(true);
  });
});
