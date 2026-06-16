import { describe, it, expect } from 'vitest';
import {
  rollDraft,
  rarityWeight,
  applyUpgrade,
  available,
  taken,
  type UpgradeDefinition,
  type UpgradeLevels,
} from './upgrades';
import { defaultMods } from './mods';
import { BuildEffects } from './effects';
import { createPlayer } from '../player';
import { UPGRADES } from '../../content/upgrades/index';
import { Rng } from '../../core/rng';

function byId(id: string): UpgradeDefinition {
  return UPGRADES.find((u) => u.id === id)!;
}

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

describe('rarity weighting (T41)', () => {
  it('rarer tiers get more likely as level + luck rise', () => {
    expect(rarityWeight('legendary', 30, 5)).toBeGreaterThan(rarityWeight('legendary', 1, 0));
    expect(rarityWeight('common', 30, 5)).toBeGreaterThan(rarityWeight('legendary', 30, 5));
  });

  it('banished upgrades are filtered out of the pool', () => {
    const banished = new Set([UPGRADES[0]!.id]);
    const ids = available(UPGRADES, {}, banished).map((u) => u.id);
    expect(ids).not.toContain(UPGRADES[0]!.id);
  });

  it('rollDraft never offers banished ids', () => {
    const banished = new Set([UPGRADES[0]!.id]);
    for (let s = 0; s < 40; s++) {
      const draft = rollDraft(UPGRADES, {}, new Rng(s), { level: 10, luck: 2, banished });
      expect(draft.find((d) => d.id === UPGRADES[0]!.id)).toBeUndefined();
    }
  });

  it('count param limits how many options are rolled', () => {
    expect(rollDraft(UPGRADES, {}, new Rng(1), { count: 2 })).toHaveLength(2);
  });
});

describe('prerequisites + exclusions (T19, V11 no invalid combo)', () => {
  it('a prereq-gated upgrade is hidden until its requirement is met', () => {
    const ids = available(UPGRADES, {}).map((u) => u.id);
    expect(ids).not.toContain('shotgun-clause'); // needs split-shipment >= 2

    const ok = available(UPGRADES, { 'split-shipment': 2 }).map((u) => u.id);
    expect(ok).toContain('shotgun-clause');
  });

  it('prereq not satisfied at lower level', () => {
    const ids = available(UPGRADES, { 'split-shipment': 1 }).map((u) => u.id);
    expect(ids).not.toContain('shotgun-clause');
  });

  it('taking one of a mutually-exclusive pair removes the other', () => {
    const beforeIds = available(UPGRADES, {}).map((u) => u.id);
    expect(beforeIds).toContain('glass-runner');
    expect(beforeIds).toContain('iron-stance');

    const afterIds = available(UPGRADES, { 'glass-runner': 1 }).map((u) => u.id);
    expect(afterIds).not.toContain('iron-stance');
  });

  it('rollDraft never offers an excluded or unmet-prereq upgrade', () => {
    const levels: UpgradeLevels = { 'glass-runner': 1 };
    for (let s = 0; s < 60; s++) {
      const draft = rollDraft(UPGRADES, levels, new Rng(s));
      expect(draft.find((d) => d.id === 'iron-stance')).toBeUndefined();
      expect(draft.find((d) => d.id === 'shotgun-clause')).toBeUndefined();
    }
  });

  it('applying the gated upgrade works once unlocked', () => {
    const levels: UpgradeLevels = { 'split-shipment': 2 };
    const mods = defaultMods();
    mods.projectileCount = 3; // from split-shipment x2
    applyUpgrade(
      byId('shotgun-clause'),
      { player: createPlayer(), mods, effects: new BuildEffects() },
      levels,
    );
    expect(mods.projectileCount).toBe(5);
    expect(taken(levels, 'shotgun-clause')).toBe(1);
  });
});

describe('applyUpgrade (T18 effects + level tracking)', () => {
  it('applies the effect and increments the taken level', () => {
    const levels: UpgradeLevels = {};
    const mods = defaultMods();
    const player = createPlayer();
    const dmg = UPGRADES.find((u) => u.id === 'overcharge')!;
    applyUpgrade(dmg, { player, mods, effects: new BuildEffects() }, levels);
    expect(taken(levels, 'overcharge')).toBe(1);
    expect(mods.damageMult).toBeCloseTo(1.25, 6);
  });

  it('stacks across repeated picks up to maxLevel', () => {
    const levels: UpgradeLevels = {};
    const mods = defaultMods();
    const player = createPlayer();
    const ms = UPGRADES.find((u) => u.id === 'split-shipment')!;
    applyUpgrade(ms, { player, mods, effects: new BuildEffects() }, levels);
    applyUpgrade(ms, { player, mods, effects: new BuildEffects() }, levels);
    expect(mods.projectileCount).toBe(3); // 1 + 2
    expect(available(UPGRADES, levels).find((u) => u.id === 'split-shipment')).toBeDefined();
  });
});
