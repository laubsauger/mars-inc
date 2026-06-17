// Boss-gated Glory-tree nodes (T47, V25): trophies/mastery GATE, Glory PAYS. The
// gate predicate must hold a node shut until its unlock key + mastery threshold land.

import { describe, it, expect } from 'vitest';
import { permanentGateMet, permanentById, PERMANENT_UPGRADES } from './index';

describe('permanentGateMet (T47/V25)', () => {
  it('ungated nodes are always available', () => {
    const plain = PERMANENT_UPGRADES.find((u) => !u.gate)!;
    expect(permanentGateMet(plain, {}, {})).toBe(true);
  });

  it('an unlock-gated node opens only once its key is owned', () => {
    const node = permanentById('foreman-payload')!;
    expect(node.gate?.unlock).toBe('tree:arsenal-foreman');
    expect(permanentGateMet(node, {}, {})).toBe(false);
    expect(permanentGateMet(node, { 'tree:arsenal-foreman': true }, {})).toBe(true);
  });

  it('a mastery-gated node also needs enough feats vs its boss', () => {
    const node = permanentById('sovereign-warrant')!;
    const unlocks = { 'tree:arsenal-sovereign': true };
    // Unlock owned but not enough feats → still locked.
    expect(permanentGateMet(node, unlocks, { 'repo-sovereign': ['defeat'] })).toBe(false);
    // Unlock + the required feat count → open.
    expect(
      permanentGateMet(node, unlocks, { 'repo-sovereign': ['defeat', 'fast', 'flawless'] }),
    ).toBe(true);
  });
});
