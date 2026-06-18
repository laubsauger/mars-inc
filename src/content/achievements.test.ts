import { describe, it, expect } from 'vitest';
import {
  newlyEarned,
  stageOf,
  maxStage,
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  type AchCtx,
} from './achievements';

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

  it('cheated runs bank nothing', () => {
    expect(newlyEarned(base({ kills: 99999, level: 99, cheated: true }), {})).toEqual([]);
  });

  it('leveled achievements stage up with the metric, not all at once', () => {
    const bl = ACHIEVEMENT_BY_ID.get('bloodletter')!;
    expect(stageOf(bl, base({ kills: 10 }))).toBe(0); // below first threshold (50)
    expect(stageOf(bl, base({ kills: 60 }))).toBe(1);
    expect(stageOf(bl, base({ kills: 300 }))).toBe(2);
    expect(stageOf(bl, base({ kills: 99999 }))).toBe(maxStage(bl));
  });

  it('newlyEarned reports only stages ABOVE the stored one', () => {
    const ctx = base({ kills: 300 }); // bloodletter stage 2
    expect(newlyEarned(ctx, {}).find((e) => e.id === 'bloodletter')?.stage).toBe(2);
    // Already at stage 2 → no new event.
    expect(
      newlyEarned(ctx, { bloodletter: 2 }).find((e) => e.id === 'bloodletter'),
    ).toBeUndefined();
    // At stage 1 → re-reports the new top stage 2.
    expect(newlyEarned(ctx, { bloodletter: 1 }).find((e) => e.id === 'bloodletter')?.stage).toBe(2);
  });

  it('a single strong run does NOT unlock half the set', () => {
    // A good-but-not-insane run: 220 kills, level 16, 4 min, 14 upgrades, no boss.
    const run = base({
      kills: 220,
      level: 16,
      timeSurvived: 240,
      upgradesTaken: 14,
      ended: true,
    });
    const earned = newlyEarned(run, {});
    const totalStages = ACHIEVEMENTS.reduce((s, a) => s + maxStage(a), 0);
    const gotStages = earned.reduce((s, e) => s + e.stage, 0);
    expect(gotStages).toBeLessThan(totalStages * 0.35); // well under half the total stages
  });

  it('hidden funny one-shots fire on their odd conditions', () => {
    expect(newlyEarned(base({ ended: true, kills: 0 }), {}).some((e) => e.id === 'liability')).toBe(
      true,
    );
    expect(
      newlyEarned(base({ ended: true, won: true, damageTaken: 0 }), {}).some(
        (e) => e.id === 'no-notes',
      ),
    ).toBe(true);
  });

  it('flawless-felling needs a boss kill AND zero damage', () => {
    expect(
      stageOf(ACHIEVEMENT_BY_ID.get('flawless-felling')!, base({ bossKills: 1, damageTaken: 5 })),
    ).toBe(0);
    expect(
      stageOf(ACHIEVEMENT_BY_ID.get('flawless-felling')!, base({ bossKills: 1, damageTaken: 0 })),
    ).toBe(1);
  });
});
