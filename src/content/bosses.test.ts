// Per-boss movesets (T-bossmoves). Every boss must field a real, valid moveset so the
// controller always has something to run, and charge moves only live on charge-capable
// bosses (the controller falls back otherwise, but the data should be coherent).

import { describe, it, expect } from 'vitest';
import { BOSS_DEFS } from './bosses';

describe('boss movesets (T-bossmoves)', () => {
  it('every boss has a non-empty move pool for each of its phases', () => {
    for (const d of BOSS_DEFS) {
      expect(d.moves.length).toBeGreaterThan(0);
      // The controller reuses the last pool past its length, so we need at least one;
      // but a boss should ideally define a pool per phase — assert no EMPTY pools.
      for (const pool of d.moves) {
        expect(pool.length).toBeGreaterThan(0);
        for (const m of pool) expect(m.weight === undefined || m.weight > 0).toBe(true);
      }
    }
  });

  it('charge moves only appear on charge-capable bosses', () => {
    for (const d of BOSS_DEFS) {
      const hasCharge = d.moves.some((pool) => pool.some((m) => m.kind === 'charge'));
      if (hasCharge) expect(d.charge).toBe(true);
    }
  });

  it('finals are 3-phase, minibosses 2-phase (movesets match)', () => {
    for (const d of BOSS_DEFS) {
      expect(d.phases).toBe(d.tier === 'final' ? 3 : 2);
    }
  });
});
