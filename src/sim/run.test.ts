// V20: post-game stats accurately describe the run (counts/damage/time match
// sim events, derived rates correct).

import { describe, it, expect } from 'vitest';
import { computeResult, newRunStats, resetRunStats, type RunStats } from './run';

describe('computeResult', () => {
  it('echoes counts/damage/time/level/upgrades verbatim', () => {
    const stats: RunStats = {
      kills: 42,
      damageDealt: 1200,
      damageTaken: 88,
      timeSurvived: 60,
      level: 7,
      upgradesTaken: 6,
    };
    const r = computeResult(stats);
    expect(r.kills).toBe(42);
    expect(r.damageDealt).toBe(1200);
    expect(r.damageTaken).toBe(88);
    expect(r.durationSec).toBe(60);
    expect(r.level).toBe(7);
    expect(r.upgradesTaken).toBe(6);
  });

  it('derives dps and kills/min from time', () => {
    const r = computeResult({
      kills: 30,
      damageDealt: 600,
      damageTaken: 0,
      timeSurvived: 60,
      level: 3,
      upgradesTaken: 2,
    });
    expect(r.dps).toBeCloseTo(10);
    expect(r.killsPerMin).toBeCloseTo(30);
  });

  it('collapses rates to 0 on instant death (no divide-by-zero)', () => {
    const r = computeResult(newRunStats());
    expect(r.dps).toBe(0);
    expect(r.killsPerMin).toBe(0);
    expect(Number.isNaN(r.dps)).toBe(false);
  });
});

describe('resetRunStats', () => {
  it('returns stats to a fresh run baseline', () => {
    const s = newRunStats();
    s.kills = 5;
    s.damageDealt = 99;
    s.damageTaken = 33;
    s.timeSurvived = 12;
    s.level = 4;
    s.upgradesTaken = 3;
    resetRunStats(s);
    expect(s).toEqual(newRunStats());
  });
});
