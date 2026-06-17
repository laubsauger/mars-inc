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
  bossKills: number; // bosses slain this run
  killsByVariant: number[]; // kills bucketed by enemy variant (for the summary)
}

export function newRunStats(): RunStats {
  return {
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    timeSurvived: 0,
    level: 1,
    upgradesTaken: 0,
    bossKills: 0,
    killsByVariant: [],
  };
}

export function resetRunStats(s: RunStats): void {
  s.kills = 0;
  s.damageDealt = 0;
  s.damageTaken = 0;
  s.timeSurvived = 0;
  s.level = 1;
  s.upgradesTaken = 0;
  s.bossKills = 0;
  s.killsByVariant.length = 0;
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
  won: boolean; // true if the run ended by defeating the boss (T33)
}

/**
 * Martian Glory awarded for a run (T26, §9.5). Rewards how FAR you got, not just
 * showing up: depth (level) scales quadratically while time/kills are small drips
 * — a tier-1 death pays a pittance, a deep run pays real money. Beating the boss
 * pays a victory bounty. Progression unlocks possibilities, not raw power. Pure
 * & deterministic from the result.
 */
export function gloryFor(result: RunResult, gloryMult = 1): number {
  const win = result.won ? 200 : 0;
  // SUB-linear depth reward (§V34: GLORY_P < 1) — the old `level²` term made deep
  // runs pay exponentially, snowballing the Glory Tree. `level^1.4` keeps early
  // payouts intact (~L10 unchanged) but tapers the late tail hard. Kills weight cut
  // too: late runs rack thousands of kills, so a fat per-kill rate ballooned income.
  // Kills weight kept low: it scales with the arena's paceMult (Act 2 floods enemies),
  // so a fat per-kill rate double-counted difficulty on top of gloryMult. Depth (level)
  // is the main signal; kills/duration are a modest survival bonus.
  const base =
    result.durationSec * 0.2 + result.kills * 0.06 + Math.pow(result.level, 1.4) * 2.4 + win;
  // Harder Acts pay more (T-Act): the growth outlet for Glory-Tree investment.
  return Math.floor(base * gloryMult);
}

/** Pure projection of accumulated stats into the result summary (V20). */
export function computeResult(stats: RunStats, won = false): RunResult {
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
    won,
  };
}
