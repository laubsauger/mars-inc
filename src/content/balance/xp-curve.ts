// XP level curve — balance data, loaded by the leveling system (V13: ⊥ hardcoded
// in gameplay systems). §9.1: frequent early choices, slower late.

export function xpRequired(level: number): number {
  // §9.1: frequent early choices, slower late. The exponent shapes the late ramp;
  // the linear/constant terms keep the FIRST ~3 levels fast (the build needs to
  // come together without perfect rolls) — then 2.1 steepens HARD so late levels
  // don't fly by. Late waves drop a FLOOD of shards, so the tail must climb faster
  // than income or you ding every few seconds past ~L20. Pairs with bounty relics
  // (a second upgrade stream) + threat-scaled XP income.
  //  L3 23 · L5 48 · L8 106 · L10 159 · L15 350 · L20 609 · L30 1356 (steep tail).
  return 4 + level * 3 + Math.floor(Math.pow(level, 2.1));
}

/** Shard value dropped by an enemy variant. */
export const SHARD_VALUE: Record<number, number> = {
  0: 1, // Rust Mite
  1: 3, // Debt Hound
};
