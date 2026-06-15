import { describe, it, expect } from 'vitest';
import { detectTier, TIER_BUDGETS } from './quality';

describe('detectTier (V17 tiers)', () => {
  it('high-end → high', () => {
    expect(detectTier({ deviceMemoryGb: 16, hardwareConcurrency: 12 })).toBe('high');
  });
  it('mid → medium', () => {
    expect(detectTier({ deviceMemoryGb: 4, hardwareConcurrency: 4 })).toBe('medium');
  });
  it('low-end → low', () => {
    expect(detectTier({ deviceMemoryGb: 2, hardwareConcurrency: 2 })).toBe('low');
  });
  it('missing hints → safe default (medium)', () => {
    expect(detectTier({})).toBe('medium');
  });
});

describe('TIER_BUDGETS (V17 visual-only degrade)', () => {
  it('visible-enemy budget decreases high→med→low', () => {
    expect(TIER_BUDGETS.high.maxVisibleEnemies).toBeGreaterThan(
      TIER_BUDGETS.medium.maxVisibleEnemies,
    );
    expect(TIER_BUDGETS.medium.maxVisibleEnemies).toBeGreaterThan(
      TIER_BUDGETS.low.maxVisibleEnemies,
    );
  });
  it('every tier self-labels', () => {
    for (const k of ['high', 'medium', 'low'] as const) {
      expect(TIER_BUDGETS[k].tier).toBe(k);
    }
  });
});
