// XP level curve — balance data, loaded by the leveling system (V13: ⊥ hardcoded
// in gameplay systems). §9.1: frequent early choices, slower late.

export function xpRequired(level: number): number {
  // §9.1: frequent early choices, slower late. The exponent shapes the late ramp; the
  // linear/constant terms were softened (4+3·lvl → 2+2·lvl) so the FIRST ~5 levels ding
  // fast — the open shouldn't drag while your build is still nothing. The 2.1 tail is
  // untouched, so late levels still climb HARD (late waves flood shards). Pairs with
  // bounty relics (a second upgrade stream) + threat-scaled XP income.
  //  L1 5 · L3 18 · L5 40 · L8 96 · L10 147 · L20 581 · L30 1326 (steep tail).
  return 2 + level * 2 + Math.floor(Math.pow(level, 2.1));
}

/** Shard value dropped by an enemy variant. */
export const SHARD_VALUE: Record<number, number> = {
  0: 1, // Rust Mite
  1: 3, // Debt Hound
};
