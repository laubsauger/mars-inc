// Draft-SHAPING (Glory-Tree Specialist contracts): a permanent's `tagBias` steers
// WHICH cards the draft offers, without granting any effect. Guards the weighting
// hook so the bias actually skews the roll toward the chosen archetype.

import { describe, it, expect } from 'vitest';
import { rollDraft, type UpgradeDefinition } from './upgrades';
import { Rng } from '../../core/rng';

// Two equal-weight cards, one tagged 'boom'. With a strong bias on 'boom', it should
// dominate the picks; with no bias, both appear roughly evenly.
const POOL: UpgradeDefinition[] = [
  {
    id: 'plain',
    name: 'Plain',
    description: '',
    tags: ['stat'],
    rarity: 'common',
    maxLevel: 9,
    baseWeight: 10,
    synergyWeight: 0,
    apply: () => {},
  },
  {
    id: 'boom',
    name: 'Boom',
    description: '',
    tags: ['explosive'],
    rarity: 'common',
    maxLevel: 9,
    baseWeight: 10,
    synergyWeight: 0,
    apply: () => {},
  },
];

describe('draft tag bias (Specialist contracts)', () => {
  it('a strong tag bias makes biased cards dominate the offered options', () => {
    let boomPicks = 0;
    for (let seed = 0; seed < 40; seed++) {
      const [first] = rollDraft(POOL, {}, new Rng(seed), {
        count: 1,
        tagBias: { explosive: 50 },
      });
      if (first?.id === 'boom') boomPicks++;
    }
    expect(boomPicks).toBeGreaterThan(36); // ~50:1 odds → almost always Boom
  });

  it('no bias → both cards appear (bias is opt-in, not default)', () => {
    let boomPicks = 0;
    for (let seed = 0; seed < 40; seed++) {
      const [first] = rollDraft(POOL, {}, new Rng(seed), { count: 1 });
      if (first?.id === 'boom') boomPicks++;
    }
    expect(boomPicks).toBeGreaterThan(8);
    expect(boomPicks).toBeLessThan(32); // roughly even, neither dominates
  });
});

// Rarity-odds bias (Premium Contracts / Connoisseur tree nodes). A rare normally has
// far lower base weight than a common; a strong rarityBias should flip the odds.
const RARITY_POOL: UpgradeDefinition[] = [
  {
    id: 'c',
    name: 'C',
    description: '',
    tags: [],
    rarity: 'common',
    maxLevel: 9,
    baseWeight: 10,
    synergyWeight: 0,
    apply: () => {},
  },
  {
    id: 'r',
    name: 'R',
    description: '',
    tags: [],
    rarity: 'rare',
    maxLevel: 9,
    baseWeight: 10,
    synergyWeight: 0,
    apply: () => {},
  },
];

describe('draft rarity bias (Premium Contracts / Connoisseur)', () => {
  it('a strong rare bias flips the odds toward the rare card', () => {
    let rarePicks = 0;
    for (let seed = 0; seed < 40; seed++) {
      const [first] = rollDraft(RARITY_POOL, {}, new Rng(seed), {
        count: 1,
        rarityBias: { rare: 100 },
      });
      if (first?.id === 'r') rarePicks++;
    }
    expect(rarePicks).toBeGreaterThan(34); // rare base 0.3 × 100 ≫ common base 1
  });
});
