// Boss-Glory banking economy (T45, V24/V34). Pure curves — the split + extract/death
// banking must behave predictably so progression reads honestly.

import { describe, it, expect } from 'vitest';
import {
  bossGloryFor,
  splitBossGlory,
  bankRunPot,
  bossFeats,
  SECURED_FRAC,
  EXTRACT_MULT,
  DEATH_KEEP_FRAC,
  BOSS_FAST_FEAT_SEC,
} from './glory';

describe('boss Glory economy (T45)', () => {
  it('finals pay more than minibosses, scaled by act + difficulty', () => {
    expect(bossGloryFor('final', 1, 1)).toBeGreaterThan(bossGloryFor('miniboss', 1, 1));
    // Harder act/difficulty pays more (V34).
    expect(bossGloryFor('final', 1.3, 1)).toBeGreaterThan(bossGloryFor('final', 1, 1));
    expect(bossGloryFor('miniboss', 1, 2.2)).toBeGreaterThan(bossGloryFor('miniboss', 1, 1));
  });

  it('split secures a fraction now + banks the rest into the run-pot', () => {
    const total = bossGloryFor('final', 1, 1);
    const { secured, pot } = splitBossGlory(total);
    expect(secured).toBe(Math.floor(total * SECURED_FRAC));
    expect(secured + pot).toBe(total); // no Glory lost in the split
    expect(pot).toBeGreaterThan(0);
  });

  it('extracting banks the pot at a bonus; dying keeps only a fraction', () => {
    const pot = 100;
    const extracted = bankRunPot(pot, true);
    const died = bankRunPot(pot, false);
    expect(extracted).toBe(Math.floor(pot * EXTRACT_MULT));
    expect(died).toBe(Math.floor(pot * DEATH_KEEP_FRAC));
    expect(extracted).toBeGreaterThan(died); // surviving to extract always wins
    expect(died).toBeLessThan(pot); // death loses part of the at-risk pot
  });
});

describe('boss mastery feats (T46, V26)', () => {
  it('always awards defeat; adds fast/flawless/family by performance', () => {
    // Slow, hurt, no weapon → just the defeat feat.
    expect(bossFeats(120, 50, undefined)).toEqual(['defeat']);
    // Quick + untouched + a weapon family → the full set.
    const full = bossFeats(BOSS_FAST_FEAT_SEC - 1, 0, 'rotary');
    expect(full).toContain('defeat');
    expect(full).toContain('fast');
    expect(full).toContain('flawless');
    expect(full).toContain('family:rotary');
  });

  it('fast is gated on the threshold; flawless on zero damage', () => {
    expect(bossFeats(BOSS_FAST_FEAT_SEC + 1, 0)).not.toContain('fast');
    expect(bossFeats(10, 1)).not.toContain('flawless');
  });
});
