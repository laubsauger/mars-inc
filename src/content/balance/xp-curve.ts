// XP level curve — balance data, loaded by the leveling system (V13: ⊥ hardcoded
// in gameplay systems). §9.1: frequent early choices, slower late.

export function xpRequired(level: number): number {
  // §9.1: frequent early choices, slower late. The exponent shapes the late ramp;
  // the linear/constant terms are tuned so the FIRST ~3 levels stay fast (the build
  // needs to come together without perfect rolls) — then 1.7 steepens hard so
  // mid/late levels don't fly by now that bounty relics add a second upgrade
  // stream on top of XP. Pairs with threat-scaled XP income (xp-system).
  //  L1 8 · L2 13 · L3 19 · L5 33 · L8 61 · L10 84  (vs the old flat 8/12/17 · 59).
  return 4 + level * 3 + Math.floor(Math.pow(level, 1.7));
}

/** Shard value dropped by an enemy variant. */
export const SHARD_VALUE: Record<number, number> = {
  0: 1, // Rust Mite
  1: 3, // Debt Hound
};
