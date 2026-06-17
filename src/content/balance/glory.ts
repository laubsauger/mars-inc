// Boss Glory banking economy (T45, V24/V34). A boss kill pays Glory split two ways:
// a SECURED portion banks IMMEDIATELY (kept even on a hard quit / death — V40), and
// the rest drops into a RUN-POT that rides the rest of the run. EXTRACT (survive to
// the act conclusion) banks the pot at a bonus multiplier; DEATH keeps only a
// fraction (the risk of pushing on). All curves live here, never hardcoded in a
// system (V34). Pure functions — deterministic.

import type { BossTier } from '../bosses';
import { ENEMY_BY_VARIANT } from '../../sim/enemies';

// ── RunScore → Glory award (T72, V34) ────────────────────────────────────────
// Glory must be RARE (calibration pass). Two deliberate rules:
//  • TIME pays NOTHING — "I stayed alive 50s" is not progress (was a steady drip).
//  • KILLS pay by enemy VALUE, not headcount — a level-1 mite is ~nothing; a brute /
//    elite / ranged unit is worth real score. (Threat is the value scalar.)
// So RunScore = depth (level) + a threat-weighted kill score. Bosses are NOT scored
// here — they pay through the dedicated boss-kill banking (T45) so we don't double-dip.
// The whole curve stays sub-linear (GLORY_P < 1) so deep runs don't runaway. Difficulty
// + arena Glory multipliers apply at award time (`mult`), not in the score.
export const GLORY_K = 1.2;
export const GLORY_P = 0.8;
const LEVEL_W = 1; // depth (from level − 1, so a fresh run pays ~0)
// Glory-score per unit of enemy THREAT killed. A mite (threat 1) → 0.015; a brute
// (threat 16) → 0.24; a sentinel (threat 26) → 0.39. Cheap fodder barely registers.
const KILL_VALUE_K = 0.015;

/** Threat-weighted kill score: Σ kills · enemyThreat · K, EXCLUDING bosses (they pay
 *  via T45). Cheap units contribute almost nothing; tough/ranged units carry it. */
export function killScore(killsByVariant: readonly number[]): number {
  let s = 0;
  for (let v = 0; v < killsByVariant.length; v++) {
    const n = killsByVariant[v] ?? 0;
    if (n <= 0) continue;
    const t = ENEMY_BY_VARIANT[v];
    if (!t || t.boss) continue; // bosses score through boss banking, not the kill tally
    s += n * t.threat;
  }
  return s * KILL_VALUE_K;
}

export interface RunScoreParts {
  level: number;
  /** Pre-computed threat-weighted kill score (see `killScore`). */
  killScore: number;
}

/** The composite RunScore for a run (V34). Time does NOT contribute (calibration). */
export function runScore(p: RunScoreParts): number {
  return Math.max(0, Math.max(0, p.level - 1) * LEVEL_W + Math.max(0, p.killScore));
}

/** Glory minted from a RunScore: `floor(GLORY_K · score^GLORY_P · mult)` (V34). The
 *  `mult` carries arena/difficulty/infamy Glory multipliers. Sub-linear in score. */
export function gloryAward(score: number, mult = 1): number {
  return Math.floor(GLORY_K * Math.pow(Math.max(0, score), GLORY_P) * mult);
}

/** Fraction of a boss's Glory banked the instant it dies (the safe slice, V24). */
export const SECURED_FRAC = 0.4;
/** Run-pot multiplier when you EXTRACT (reward for surviving to bank it). */
export const EXTRACT_MULT = 1.6;
/** Run-pot fraction kept on DEATH (the rest is lost — the push-on risk). */
export const DEATH_KEEP_FRAC = 0.35;

const BASE_MINIBOSS = 45;
const BASE_FINAL = 130;

/** Glory a boss kill is worth BEFORE the secured/run-pot split. Finals pay far more;
 *  scales with the act + difficulty Glory multipliers (harder pays more, V34). */
export function bossGloryFor(tier: BossTier, actMult: number, diffMult: number): number {
  const base = tier === 'final' ? BASE_FINAL : BASE_MINIBOSS;
  return Math.floor(base * actMult * diffMult);
}

/** Split a boss-kill award into (securedNow, addedToRunPot). */
export function splitBossGlory(total: number): { secured: number; pot: number } {
  const secured = Math.floor(total * SECURED_FRAC);
  return { secured, pot: total - secured };
}

/** What the run-pot banks at run-end: extract → ×EXTRACT_MULT, death → ×DEATH_KEEP_FRAC. */
export function bankRunPot(pot: number, extracted: boolean): number {
  return Math.floor(pot * (extracted ? EXTRACT_MULT : DEATH_KEEP_FRAC));
}

/** A boss kill within this many seconds of the fight starting earns the `fast` feat. */
export const BOSS_FAST_FEAT_SEC = 30;

/** Score the feats earned for a boss kill (T46, V26 — feat-based, ⊥ HP-padding):
 *  always `defeat`; `fast` if quick; `flawless` if no damage taken in the fight;
 *  `family:<weapon-family>` for the primary used. Pure → unit-tested. */
export function bossFeats(
  fightDurationSec: number,
  fightDamageTaken: number,
  weaponFamily?: string,
): string[] {
  const feats = ['defeat'];
  if (fightDurationSec <= BOSS_FAST_FEAT_SEC) feats.push('fast');
  if (fightDamageTaken <= 0) feats.push('flawless');
  if (weaponFamily) feats.push(`family:${weaponFamily}`);
  return feats;
}
