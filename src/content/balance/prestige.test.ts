// Prestige economy curves (T72, V34): Labor-Costs inflation (bounded) + Red Dust
// yield (sub-linear). Pure → unit-tested so progression stays honest.

import { describe, it, expect } from 'vitest';
import { laborInflation, prestigeYield, INFLATION_FREE, INFLATION_CAP } from './prestige';
import { prestigeCapLift, prestigeInflationFree } from '../prestige-nodes';

describe('Labor-Costs inflation (T72/V34)', () => {
  it('is a no-op up to the free tier, then climbs, but stays bounded', () => {
    expect(laborInflation(0)).toBe(1);
    expect(laborInflation(INFLATION_FREE)).toBe(1); // free tier → no surcharge
    expect(laborInflation(INFLATION_FREE + 5)).toBeGreaterThan(1); // past free → climbs
    expect(laborInflation(10_000)).toBeLessThanOrEqual(INFLATION_CAP); // bounded (V34)
  });

  it('a raised free tier (Labor Union) delays the surcharge', () => {
    const free = prestigeInflationFree(INFLATION_FREE, { 'labor-union': 2 });
    expect(free).toBeGreaterThan(INFLATION_FREE);
    expect(laborInflation(free, free)).toBe(1); // still free at the new, higher tier
  });
});

describe('Red Dust yield (T72/V34)', () => {
  it('is sub-linear — deep investment pays, but not runaway', () => {
    expect(prestigeYield(0)).toBe(0);
    const small = prestigeYield(500);
    const big = prestigeYield(5000);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(small * 10); // 10× the Glory mints < 10× the Red Dust
  });
});

describe('prestige cap-lift (T72)', () => {
  it('sums owned cap-lift node levels', () => {
    expect(prestigeCapLift({})).toBe(0);
    expect(prestigeCapLift({ overcapacity: 2 })).toBe(2);
  });
});
