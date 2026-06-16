// XP level curve — balance data, loaded by the leveling system (V13: ⊥ hardcoded
// in gameplay systems). §9.1: frequent early choices, slower late.

export function xpRequired(level: number): number {
  // §9.1: frequent early choices, slower late. The exponent shapes the late ramp;
  // the linear/constant terms keep the FIRST ~3 levels fast (the build needs to
  // come together without perfect rolls) — then 1.9 steepens HARD so late levels
  // don't fly by (you were levelling too much past ~10) now that bounty relics add
  // a second upgrade stream on top of XP. Pairs with threat-scaled XP income.
  //  L3 21 · L5 41 · L8 79 · L10 113 · L15 209 · L20 327 (much steeper tail than 1.7).
  return 4 + level * 3 + Math.floor(Math.pow(level, 1.9));
}

/** Shard value dropped by an enemy variant. */
export const SHARD_VALUE: Record<number, number> = {
  0: 1, // Rust Mite
  1: 3, // Debt Hound
};
