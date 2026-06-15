// Run accounting + post-game result (T22). RunStats accumulates authoritative
// sim events (kills/damage/time/level); computeResult derives the player-facing
// summary. Pure & unit-tested so V20 (stats accurately describe the run) holds
// independent of the render layer.

export interface RunStats {
  kills: number;
  damageDealt: number;
  damageTaken: number; // total player health lost over the run
  timeSurvived: number; // seconds (= world.elapsed at death)
  level: number; // level reached
  upgradesTaken: number; // draft picks applied
}

export function newRunStats(): RunStats {
  return { kills: 0, damageDealt: 0, damageTaken: 0, timeSurvived: 0, level: 1, upgradesTaken: 0 };
}

export function resetRunStats(s: RunStats): void {
  s.kills = 0;
  s.damageDealt = 0;
  s.damageTaken = 0;
  s.timeSurvived = 0;
  s.level = 1;
  s.upgradesTaken = 0;
}

/** Derived post-game summary shown on the result screen. */
export interface RunResult {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  durationSec: number;
  level: number;
  upgradesTaken: number;
  dps: number; // damage per second over the run
  killsPerMin: number;
}

/**
 * Martian Glory awarded for a run (T26, §9.5). Earned from survival time, kills,
 * and level reached. Modest amounts — progression unlocks possibilities, not raw
 * power. Pure & deterministic from the result.
 */
export function gloryFor(result: RunResult): number {
  return Math.floor(result.durationSec * 0.5 + result.kills * 0.4 + result.level * 3);
}

/** Pure projection of accumulated stats into the result summary (V20). */
export function computeResult(stats: RunStats): RunResult {
  const t = Math.max(stats.timeSurvived, 0);
  // Guard divide-by-zero for instant deaths; rates collapse to 0, not NaN.
  const perSec = t > 0 ? 1 / t : 0;
  return {
    kills: stats.kills,
    damageDealt: stats.damageDealt,
    damageTaken: stats.damageTaken,
    durationSec: t,
    level: stats.level,
    upgradesTaken: stats.upgradesTaken,
    dps: stats.damageDealt * perSec,
    killsPerMin: stats.kills * perSec * 60,
  };
}
