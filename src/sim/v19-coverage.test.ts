// V19 coverage ledger. Every core math system gets a unit test; this file tracks
// the ones whose systems don't exist yet, so the gap is visible (a green todo)
// rather than silently missing. Each lands with the task that builds the system.
//
// Implemented + tested elsewhere: damage (combat/damage.test), upgrade-stack
// (progression/upgrades.test), xp (xp-system.test), spawn-budget
// (director/wave-director.test + headless.test), drop (drop.test), target-select
// (combat/target-select.test).

import { describe, it } from 'vitest';

describe('V19 pending coverage (systems not yet built)', () => {
  // No status-effect system exists yet (no DoT/slow/stun timing to test). When a
  // status system lands, add status-timing tests here.
  it.todo('status-timing: tick-down, stacking, expiry');

  // Weapon evolution gating is T34 (V18). Its requirement-check is the core math
  // to cover once the evolution system exists.
  it.todo('evo-req: evolution gated by combo requirements, not level alone (T34)');
});
