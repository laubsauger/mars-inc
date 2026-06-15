import { describe, it, expect } from 'vitest';
import { rollDraft, applyUpgrade, available, taken, type UpgradeLevels } from './upgrades';
import { defaultMods } from './mods';
import { createPlayer } from '../player';
import { UPGRADES } from '../../content/upgrades/index';
import { Rng } from '../../core/rng';

describe('rollDraft (V11 pool never empty, no invalid combo)', () => {
  it('returns 3 distinct options from a fresh pool', () => {
    const draft = rollDraft(UPGRADES, {}, new Rng(1));
    expect(draft).toHaveLength(3);
    expect(new Set(draft.map((d) => d.id)).size).toBe(3);
  });

  it('deterministic for a fixed seed (V16)', () => {
    const a = rollDraft(UPGRADES, {}, new Rng(42)).map((d) => d.id);
    const b = rollDraft(UPGRADES, {}, new Rng(42)).map((d) => d.id);
    expect(a).toEqual(b);
  });

  it('never offers an upgrade at maxLevel', () => {
    const levels: UpgradeLevels = {};
    const first = UPGRADES[0]!;
    levels[first.id] = first.maxLevel; // maxed
    for (let s = 0; s < 50; s++) {
      const draft = rollDraft(UPGRADES, levels, new Rng(s));
      expect(draft.find((d) => d.id === first.id)).toBeUndefined();
    }
  });

  it('returns fewer than 3 only when the pool is that small', () => {
    // Max out all but two upgrades.
    const levels: UpgradeLevels = {};
    for (let i = 0; i < UPGRADES.length - 2; i++) levels[UPGRADES[i]!.id] = UPGRADES[i]!.maxLevel;
    expect(rollDraft(UPGRADES, levels, new Rng(1))).toHaveLength(2);
  });

  it('non-empty while any upgrade remains under maxLevel', () => {
    const draft = rollDraft(UPGRADES, {}, new Rng(7));
    expect(draft.length).toBeGreaterThan(0);
  });
});

describe('applyUpgrade (T18 effects + level tracking)', () => {
  it('applies the effect and increments the taken level', () => {
    const levels: UpgradeLevels = {};
    const mods = defaultMods();
    const player = createPlayer();
    const dmg = UPGRADES.find((u) => u.id === 'overcharge')!;
    applyUpgrade(dmg, { player, mods }, levels);
    expect(taken(levels, 'overcharge')).toBe(1);
    expect(mods.damageMult).toBeCloseTo(1.25, 6);
  });

  it('stacks across repeated picks up to maxLevel', () => {
    const levels: UpgradeLevels = {};
    const mods = defaultMods();
    const player = createPlayer();
    const ms = UPGRADES.find((u) => u.id === 'split-shipment')!;
    applyUpgrade(ms, { player, mods }, levels);
    applyUpgrade(ms, { player, mods }, levels);
    expect(mods.projectileCount).toBe(3); // 1 + 2
    expect(available(UPGRADES, levels).find((u) => u.id === 'split-shipment')).toBeDefined();
  });
});
