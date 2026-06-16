// XP level curve — balance data, loaded by the leveling system (V13: ⊥ hardcoded
// in gameplay systems). §9.1: frequent early choices, slower late.

export function xpRequired(level: number): number {
  // Cheaper first couple of levels → the first upgrade draft lands fast (get the
  // player building early, §9.1). Late game is dominated by the level^1.55 term,
  // so the curve still steepens.
  return 5 + level * 4 + Math.floor(Math.pow(level, 1.55));
}

/** Shard value dropped by an enemy variant. */
export const SHARD_VALUE: Record<number, number> = {
  0: 1, // Rust Mite
  1: 3, // Debt Hound
};
