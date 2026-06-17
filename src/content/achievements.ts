// Achievements (T-ach). Data-only: each defines a `check` predicate evaluated against
// a flat run+lifetime snapshot (AchCtx) the boot glue builds from the live world +
// saved profile. Unlock = check passes once; the tracker stamps the profile + fires a
// toast. Three flavours: EXPECTED (you'll get these playing), HARD (real mastery), and
// WEIRD (funny / off-beat). HIDDEN ones stay "???" in the menu until earned.

export type AchTier = 'expected' | 'hard' | 'weird';

/** Flat snapshot the tracker checks against. Built per-frame during a run (with
 *  `ended/won` false) and once more at run-end (final, with lifetime stats updated). */
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
  /** Shown once earned (the reveal). */
  desc: string;
  /** Shown while LOCKED — a nudge, or the mystery for hidden ones. */
  hint: string;
  icon: string;
  tier: AchTier;
  /** Hide name + desc behind "???" in the menu until earned (surprise / funny ones). */
  hidden?: boolean;
  check: (c: AchCtx) => boolean;
}

const RUST_MITE = 0; // variant index — the cheap fodder
/** Count of DISTINCT enemy types the run has killed at least one of. */
const variety = (c: AchCtx): number => c.killsByVariant.filter((n) => n > 0).length;

export const ACHIEVEMENTS: readonly Achievement[] = [
  // ── EXPECTED — you'll pick these up just playing ──────────────────────────
  {
    id: 'first-blood',
    name: 'First Blood',
    desc: 'Claim your first kill in the Pit.',
    hint: 'Kill an enemy.',
    icon: '⚔',
    tier: 'expected',
    check: (c) => c.kills >= 1,
  },
  {
    id: 'still-standing',
    name: 'Still Standing',
    desc: 'Survive a full minute in one run.',
    hint: 'Survive 60 seconds.',
    icon: '⏱',
    tier: 'expected',
    check: (c) => c.timeSurvived >= 60,
  },
  {
    id: 'first-felling',
    name: 'Severance Executed',
    desc: 'Slay your first boss.',
    hint: 'Slay a boss.',
    icon: '☠',
    tier: 'expected',
    check: (c) => c.bossKills >= 1,
  },
  {
    id: 'apprentice',
    name: 'Climbing the Ladder',
    desc: 'Reach level 10 in a run.',
    hint: 'Reach level 10.',
    icon: '▲',
    tier: 'expected',
    check: (c) => c.level >= 10,
  },
  {
    id: 'centurion',
    name: 'Centurion',
    desc: 'Rack up 100 kills in a single run.',
    hint: '100 kills in one run.',
    icon: '✪',
    tier: 'expected',
    check: (c) => c.kills >= 100,
  },
  {
    id: 'well-drafted',
    name: 'Well Drafted',
    desc: 'Take 10 upgrades in one run.',
    hint: 'Draft 10 upgrades in a run.',
    icon: '✍',
    tier: 'expected',
    check: (c) => c.upgradesTaken >= 10,
  },
  {
    id: 'regular',
    name: 'Regular Client',
    desc: 'Complete 5 runs (win or lose).',
    hint: 'Finish 5 runs.',
    icon: '↻',
    tier: 'expected',
    check: (c) => c.runCount >= 5,
  },

  // ── HARD — real mastery ───────────────────────────────────────────────────
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
    id: 'ascendant',
    name: 'Ascendant',
    desc: 'Reach level 25 in a single run.',
    hint: 'Reach level 25.',
    icon: '✦',
    tier: 'hard',
    check: (c) => c.level >= 25,
  },
  {
    id: 'massacre',
    name: 'Massacre',
    desc: 'Kill 1,000 enemies in one run.',
    hint: '1,000 kills in one run.',
    icon: '✹',
    tier: 'hard',
    check: (c) => c.kills >= 1000,
  },
  {
    id: 'glory-baron',
    name: 'Glory Baron',
    desc: 'Bank 3,000 Martian Glory across all runs.',
    hint: 'Bank 3,000 lifetime Glory.',
    icon: '◆',
    tier: 'hard',
    check: (c) => c.lifetimeGlory >= 3000,
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
  {
    id: 'iron-veteran',
    name: 'Iron Veteran',
    desc: 'Complete 25 runs.',
    hint: 'Finish 25 runs.',
    icon: '⛨',
    tier: 'hard',
    check: (c) => c.runCount >= 25,
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

  // ── WEIRD / FUNNY ─────────────────────────────────────────────────────────
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
    id: 'overstay',
    name: 'Overstayed Welcome',
    desc: 'Survive ten whole minutes. Don’t you have a home?',
    hint: 'Survive 10 minutes in one run.',
    icon: '∞',
    tier: 'weird',
    check: (c) => c.timeSurvived >= 600,
  },
  {
    id: 'exterminator',
    name: 'Pest Control',
    desc: 'Squash 200 Rust Mites in a single run.',
    hint: 'Kill 200 Rust Mites in one run.',
    icon: '※',
    tier: 'weird',
    check: (c) => (c.killsByVariant[RUST_MITE] ?? 0) >= 200,
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
    id: 'whole-buffet',
    name: 'The Whole Buffet',
    desc: 'Kill at least one of 10 different enemy types in a single run.',
    hint: 'Kill 10 different enemy types in one run.',
    icon: '◰',
    tier: 'weird',
    check: (c) => variety(c) >= 10,
  },
];

export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, Achievement> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** Newly-earned achievement ids for this snapshot — checks every NOT-yet-unlocked
 *  achievement against `ctx`. Cheated runs bank nothing (V35). Pure. */
export function newlyEarned(ctx: AchCtx, unlocked: Readonly<Record<string, number>>): string[] {
  if (ctx.cheated) return [];
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!unlocked[a.id] && a.check(ctx)) out.push(a.id);
  }
  return out;
}
