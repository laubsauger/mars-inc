// XP level curve — balance data, loaded by the leveling system (V13: ⊥ hardcoded
// in gameplay systems). §9.1: frequent early choices, slower late.

export function xpRequired(level: number): number {
  return 8 + level * 4 + Math.floor(Math.pow(level, 1.55));
}

/** Shard value dropped by an enemy variant. */
export const SHARD_VALUE: Record<number, number> = {
  0: 1, // Rust Mite
  1: 3, // Debt Hound
};
