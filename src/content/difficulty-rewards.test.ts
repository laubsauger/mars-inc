// Difficulty-milestone rewards (T49): per-tier Glory bounty + a Red Dust nugget for
// conquering the TOP tier (the "max-diff → prestige reward" spec row).

import { describe, it, expect } from 'vitest';
import { difficultyMilestone } from './difficulty-rewards';

describe('difficultyMilestone (T49)', () => {
  it('Glory bounty scales with the tier; only the top tier mints Red Dust', () => {
    const tiers = 4;
    const standard = difficultyMilestone(0, 'Standard', tiers);
    const veteran = difficultyMilestone(1, 'Veteran', tiers);
    const top = difficultyMilestone(tiers - 1, 'Nightmare', tiers);

    expect(veteran.gloryBonus).toBeGreaterThan(standard.gloryBonus); // harder pays more
    expect(standard.redDustBonus).toBe(0); // lower tiers: no Red Dust
    expect(top.redDustBonus).toBeGreaterThan(0); // top tier → prestige currency
    expect(top.key).toBe(`milestone:diff-${tiers - 1}`); // distinct persisted key per tier
  });
});
