import { describe, it, expect } from 'vitest';
import { newlyEarned, ACHIEVEMENTS, type AchCtx } from './achievements';

const base = (over: Partial<AchCtx> = {}): AchCtx => ({
  kills: 0,
  bossKills: 0,
  timeSurvived: 0,
  damageTaken: 0,
  level: 1,
  upgradesTaken: 0,
  killsByVariant: [],
  ended: false,
  won: false,
  weaponId: 'contractual-sidearm',
  cheated: false,
  difficulty: 0,
  runCount: 0,
  lifetimeGlory: 0,
  lifetimeBossKills: 0,
  ...over,
});

describe('achievements', () => {
  it('every achievement id is unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('first-blood fires on the first kill, not before', () => {
    expect(newlyEarned(base({ kills: 0 }), {})).not.toContain('first-blood');
    expect(newlyEarned(base({ kills: 1 }), {})).toContain('first-blood');
  });

  it('cheated runs bank nothing', () => {
    expect(newlyEarned(base({ kills: 9999, level: 99, cheated: true }), {})).toEqual([]);
  });

  it('already-unlocked achievements are not re-emitted', () => {
    const ctx = base({ kills: 200 });
    expect(newlyEarned(ctx, {})).toContain('first-blood');
    expect(newlyEarned(ctx, { 'first-blood': 1, centurion: 1 })).not.toContain('first-blood');
  });

  it('hidden funny ones fire on their odd conditions', () => {
    // Total Liability: die with zero kills.
    expect(newlyEarned(base({ ended: true, won: false, kills: 0 }), {})).toContain('liability');
    // No Notes: win taking no damage.
    expect(newlyEarned(base({ ended: true, won: true, damageTaken: 0 }), {})).toContain('no-notes');
  });

  it('flawless-felling needs a boss kill AND zero damage', () => {
    expect(newlyEarned(base({ bossKills: 1, damageTaken: 5 }), {})).not.toContain(
      'flawless-felling',
    );
    expect(newlyEarned(base({ bossKills: 1, damageTaken: 0 }), {})).toContain('flawless-felling');
  });
});
