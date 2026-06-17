// Difficulty-milestone rewards (T49, V22). Extracting (winning) an act at a global
// difficulty tier banks a ONE-TIME milestone: a persisted unlock key + a Glory bonus,
// a clear progression ladder up the difficulty tiers. The deeper table entries from
// the spec (artifact / weapon-evo / char-mutation / prestige node) need their content
// systems (the prestige/research epic, T72) — this is the milestone SPINE those will
// hang reward content on. Data only.

export interface DifficultyMilestone {
  /** Persisted `unlocks[key]` set the first time this tier is cleared. */
  readonly key: string;
  /** Banner label. */
  readonly label: string;
  /** One-time Glory bonus for the first clear at this tier (scales with tier). */
  readonly gloryBonus: number;
  /** One-time RED DUST bounty (only the TOP difficulty pays it — spec's
   *  "max-diff → prestige reward", a prestige-currency payoff for the hardest clear). */
  readonly redDustBonus: number;
}

/** The milestone earned by WINNING at difficulty tier `index` (0 = Standard).
 *  `tierCount` = total difficulty tiers, so the top tier is detected for the bonus. */
export function difficultyMilestone(
  index: number,
  tierName: string,
  tierCount: number,
): DifficultyMilestone {
  const isTop = index >= tierCount - 1;
  return {
    key: `milestone:diff-${index}`,
    label: `${tierName} Cleared`,
    gloryBonus: 40 * (index + 1), // harder tiers pay a bigger first-clear bounty
    redDustBonus: isTop ? 5 : 0, // only conquering the hardest tier mints Red Dust
  };
}
