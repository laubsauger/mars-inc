// V18: weapon evolution is gated by a COMBO of upgrades, never by the weapon
// reaching a level on its own. The checker only returns an evolution when ALL of
// its requirements are met.

import { describe, it, expect } from 'vitest';
import { availableEvolution, EVOLUTIONS } from './evolutions';

describe('availableEvolution (V18 combo gate)', () => {
  it('returns nothing until the FULL combo is met', () => {
    expect(availableEvolution('rust-devil-minigun', {})).toBeUndefined();
    // Partial combo (fire rate maxed but no damage stacks) → still no evolution.
    expect(availableEvolution('rust-devil-minigun', { 'rapid-billing': 5 })).toBeUndefined();
    // Full combo → evolves.
    expect(
      availableEvolution('rust-devil-minigun', { 'rapid-billing': 5, overcharge: 3 })?.evolved.id,
    ).toBe('rust-devil-apex');
  });

  it('gates the Arc Repeater behind arc-garnishment x2', () => {
    expect(availableEvolution('arc-repeater', { 'arc-garnishment': 1 })).toBeUndefined();
    expect(availableEvolution('arc-repeater', { 'arc-garnishment': 2 })?.evolved.id).toBe(
      'tesla-cascade',
    );
  });

  it('a weapon with no evolution never evolves, however leveled', () => {
    expect(
      availableEvolution('contractual-sidearm', { 'rapid-billing': 9, overcharge: 9 }),
    ).toBeUndefined();
  });

  it('EVERY evolution requires at least one upgrade — never level-5 alone (V18)', () => {
    for (const e of EVOLUTIONS) {
      expect(e.requires.length).toBeGreaterThan(0);
      expect(e.evolved.id).not.toBe(e.baseId);
    }
  });
});
