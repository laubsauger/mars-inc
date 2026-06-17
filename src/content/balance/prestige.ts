// Prestige economy (T72, V31/V34). Sacrificing the whole Glory tree MINTS Red Dust —
// a rarer currency that buys RULE-CHANGING prestige nodes (cap-lifts, cheaper deep
// trees, run-start seeds), not more stats. Plus the global "Labor Costs" inflation on
// Glory-node prices. All curves live here (V34) — never hardcoded in a system.

/** Permanent levels owned (globally) that carry NO Labor-Costs surcharge yet. */
export const INFLATION_FREE = 6;
/** Each owned level past the free tier adds this to ALL Glory-node prices. */
export const INFLATION_STEP = 0.04;
/** Bounded: the surcharge never exceeds +120% no matter how deep the tree (V34). */
export const INFLATION_CAP = 2.2;

/** Labor-Costs price multiplier given total permanent levels owned. Bounded (V34).
 *  `free` may be raised by the Labor Union prestige node → a cheaper deep tree. */
export function laborInflation(totalBought: number, free = INFLATION_FREE): number {
  const over = Math.max(0, totalBought - free);
  return Math.min(INFLATION_CAP, 1 + over * INFLATION_STEP);
}

// Red Dust minted when you PRESTIGE (sacrifice the tree). Sub-linear (P<1) so it
// rewards a DEEP investment without runaway — a tiny tree mints almost nothing, a
// maxed one mints a real prestige budget.
const PRESTIGE_K = 0.55;
const PRESTIGE_P = 0.7;

export function prestigeYield(totalGlorySpent: number): number {
  return Math.floor(PRESTIGE_K * Math.pow(Math.max(0, totalGlorySpent), PRESTIGE_P));
}
