// Achievements (T-ach). Two shapes:
//   • LEVELED — a `metric(ctx)` + escalating `thresholds`. Each threshold crossed is a
//     STAGE (Bloodletter I → V). Early stages are reachable, late ones are real grinds,
//     so a single good run only ever earns the low tiers — never "half the set" at once.
//   • ONE-SHOT — a boolean `check(ctx)`. Reserved for hard feats + funny/odd moments.
// The save stores the highest STAGE earned per id (0 = none). HIDDEN ones stay "???"
// in the menu until earned. Checks are pure + deterministic from the snapshot.

export type AchTier = 'expected' | 'hard' | 'weird';

/** Flat snapshot the tracker checks against. Built per-frame during a run (with
 *  `ended/won` false) and once more at run-end (final, lifetime stats updated). */
export interface AchCtx {
  // ── This run ──
  kills: number;
  bossKills: number;
  timeSurvived: number; // seconds
  damageTaken: number;
  level: number;
  upgradesTaken: number;
  killsByVariant: readonly number[];
  ended: boolean; // the run has finished (death / victory)
  won: boolean; // ended by beating the act's final boss
  weaponId: string; // current primary weapon id
  cheated: boolean; // dev-tampered → never banks achievements
  difficulty: number; // tier index (0 = Standard)
  // ── Lifetime (from the profile) ──
  runCount: number;
  lifetimeGlory: number;
  lifetimeBossKills: number;
}

export interface Achievement {
  id: string;
  name: string;
  /** Shown once earned (the reveal / what it's about). */
  desc: string;
  /** Shown while LOCKED — a nudge, or the mystery for hidden ones. */
  hint: string;
  icon: string;
  tier: AchTier;
  /** Hide name + desc behind "???" until earned (surprise / funny ones). */
  hidden?: boolean;
  // ── Leveled ── escalating thresholds against a live metric.
  metric?: (c: AchCtx) => number;
  thresholds?: readonly number[];
  unit?: string; // display unit for the thresholds ("kills", "Glory", …)
  // ── One-shot ── a single boolean feat.
  check?: (c: AchCtx) => boolean;
}

const RUST_MITE = 0; // variant index — the cheap fodder
/** Count of DISTINCT enemy types the run has killed at least one of. */
const variety = (c: AchCtx): number => c.killsByVariant.filter((n) => n > 0).length;

export const ACHIEVEMENTS: readonly Achievement[] = [
  // ── LEVELED — escalating mastery (low tiers reachable, top tiers a grind) ──────
  {
    id: 'bloodletter',
    name: 'Bloodletter',
    desc: 'Kills in a single run',
    hint: 'Rack up kills in one run.',
    icon: '⚔',
    tier: 'expected',
    metric: (c) => c.kills,
    thresholds: [50, 250, 1000, 4000, 15000],
    unit: 'kills',
  },
  {
    id: 'ascendant',
    name: 'Ascendant',
    desc: 'Level reached in a single run',
    hint: 'Level up deep in a run.',
    icon: '▲',
    tier: 'expected',
    metric: (c) => c.level,
    thresholds: [8, 18, 30, 45],
    unit: 'level',
  },
  {
    id: 'endurance',
    name: 'Endurance',
    desc: 'Seconds survived in a single run',
    hint: 'Stay alive.',
    icon: '⏱',
    tier: 'expected',
    metric: (c) => c.timeSurvived,
    thresholds: [120, 300, 600, 1200],
    unit: 'seconds',
  },
  {
    id: 'architect',
    name: 'Architect',
    desc: 'Upgrades drafted in a single run',
    hint: 'Draft upgrades in one run.',
    icon: '✍',
    tier: 'expected',
    metric: (c) => c.upgradesTaken,
    thresholds: [12, 25, 45],
    unit: 'upgrades',
  },
  {
    id: 'executioner',
    name: 'Executioner',
    desc: 'Bosses slain across all runs',
    hint: 'Slay bosses across your runs.',
    icon: '☠',
    tier: 'hard',
    metric: (c) => c.lifetimeBossKills,
    thresholds: [1, 6, 20, 60],
    unit: 'bosses',
  },
  {
    id: 'veteran',
    name: 'Veteran',
    desc: 'Runs completed across your career',
    hint: 'Finish runs, win or lose.',
    icon: '↻',
    tier: 'hard',
    metric: (c) => c.runCount,
    thresholds: [5, 30, 100, 300],
    unit: 'runs',
  },
  {
    id: 'tycoon',
    name: 'Glory Tycoon',
    desc: 'Martian Glory banked across all runs',
    hint: 'Bank Martian Glory.',
    icon: '◆',
    tier: 'hard',
    metric: (c) => c.lifetimeGlory,
    thresholds: [2000, 10000, 50000, 250000],
    unit: 'Glory',
  },

  // ── ONE-SHOT — hard feats ──────────────────────────────────────────────────
  {
    id: 'pit-champion',
    name: 'Pit Champion',
    desc: 'Win a run by slaying the act’s final boss.',
    hint: 'Win a run.',
    icon: '♛',
    tier: 'hard',
    check: (c) => c.won,
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    desc: 'Win a run on Brutal difficulty or higher.',
    hint: 'Win on Brutal+.',
    icon: '⚡',
    tier: 'hard',
    check: (c) => c.won && c.difficulty >= 2,
  },
  {
    id: 'flawless-felling',
    name: 'Flawless Felling',
    desc: 'Slay a boss having taken NO damage all run.',
    hint: 'Slay a boss without taking a hit.',
    icon: '❖',
    tier: 'hard',
    check: (c) => c.bossKills >= 1 && c.damageTaken === 0,
  },

  // ── ONE-SHOT — weird / funny (mostly hidden) ───────────────────────────────
  {
    id: 'no-notes',
    name: 'No Notes',
    desc: 'Win a run without taking a single point of damage. Showoff.',
    hint: '???',
    icon: '✓',
    tier: 'weird',
    hidden: true,
    check: (c) => c.won && c.damageTaken === 0,
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    desc: 'Win a run using only the Contractual Sidearm. Pathetic — by design.',
    hint: '???',
    icon: '▯',
    tier: 'weird',
    hidden: true,
    check: (c) => c.won && c.weaponId === 'contractual-sidearm',
  },
  {
    id: 'severance-package',
    name: 'Severance Package',
    desc: 'Die within 10 seconds of the bell. Brutal contract.',
    hint: '???',
    icon: '✂',
    tier: 'weird',
    hidden: true,
    check: (c) => c.ended && !c.won && c.timeSurvived < 10,
  },
  {
    id: 'liability',
    name: 'Total Liability',
    desc: 'Die without landing a single kill. The crowd is disappointed.',
    hint: '???',
    icon: '⚠',
    tier: 'weird',
    hidden: true,
    check: (c) => c.ended && !c.won && c.kills === 0,
  },
  {
    id: 'exterminator',
    name: 'Pest Control',
    desc: 'Squash 300 Rust Mites in a single run.',
    hint: 'Kill 300 Rust Mites in one run.',
    icon: '※',
    tier: 'weird',
    check: (c) => (c.killsByVariant[RUST_MITE] ?? 0) >= 300,
  },
  {
    id: 'whole-buffet',
    name: 'The Whole Buffet',
    desc: 'Kill at least one of 12 different enemy types in a single run.',
    hint: 'Kill 12 different enemy types in one run.',
    icon: '◰',
    tier: 'weird',
    check: (c) => variety(c) >= 12,
  },
];

export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, Achievement> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** Highest stage an achievement can reach (leveled = #thresholds, one-shot = 1). */
export function maxStage(a: Achievement): number {
  return a.thresholds ? a.thresholds.length : 1;
}

/** Current stage for `ctx` (0 = none). Leveled = #thresholds met; one-shot = 0/1. */
export function stageOf(a: Achievement, ctx: AchCtx): number {
  if (a.thresholds && a.metric) {
    const v = a.metric(ctx);
    let s = 0;
    for (const t of a.thresholds) {
      if (v >= t) s++;
      else break;
    }
    return s;
  }
  return a.check?.(ctx) ? 1 : 0;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export function roman(n: number): string {
  return ROMAN[n] ?? `${n}`;
}

/** Display name for an earned stage (leveled appends a numeral; one-shot is plain). */
export function stageName(a: Achievement, stage: number): string {
  return a.thresholds ? `${a.name} ${roman(stage)}` : a.name;
}

/** Display description for an earned stage — leveled shows the threshold reached. */
export function stageDesc(a: Achievement, stage: number): string {
  if (a.thresholds) {
    const t = a.thresholds[Math.max(0, stage - 1)] ?? 0;
    return `${t.toLocaleString()} ${a.unit ?? ''} — ${a.desc.toLowerCase()}`.trim();
  }
  return a.desc;
}

/** Newly-earned STAGES for this snapshot — for each achievement whose current stage
 *  exceeds the stored one, the new top stage. Cheated runs bank nothing (V35). Pure. */
export function newlyEarned(
  ctx: AchCtx,
  unlocked: Readonly<Record<string, number>>,
): { id: string; stage: number }[] {
  if (ctx.cheated) return [];
  const out: { id: string; stage: number }[] = [];
  for (const a of ACHIEVEMENTS) {
    const cur = stageOf(a, ctx);
    const prev = unlocked[a.id] ?? 0;
    if (cur > prev) out.push({ id: a.id, stage: cur });
  }
  return out;
}
