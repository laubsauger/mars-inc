import { describe, it, expect } from 'vitest';
import { makePacket, computeOutgoing, applyMitigation } from './damage';
import { Rng } from '../../core/rng';

describe('computeOutgoing (V3 fixed order)', () => {
  it('base only (no crit) = base', () => {
    const rng = new Rng(1);
    const p = makePacket({ baseDamage: 6, critChance: 0 });
    expect(computeOutgoing(p, rng).amount).toBe(6);
  });

  it('additive before multiplicative: (base+add)*mult', () => {
    const rng = new Rng(1);
    const p = makePacket({ baseDamage: 10, additive: 5, multiplier: 2, critChance: 0 });
    expect(computeOutgoing(p, rng).amount).toBe(30); // (10+5)*2
  });

  it('crit multiplies after mult', () => {
    // critChance 1 → always crit.
    const rng = new Rng(1);
    const p = makePacket({ baseDamage: 10, multiplier: 2, critChance: 1, critMultiplier: 3 });
    const r = computeOutgoing(p, rng);
    expect(r.crit).toBe(true);
    expect(r.amount).toBe(60); // 10*2*3
  });

  it('element scales last', () => {
    const rng = new Rng(1);
    const p = makePacket({ baseDamage: 10, critChance: 0, elementMultiplier: 1.5 });
    expect(computeOutgoing(p, rng).amount).toBe(15);
  });

  it('deterministic for a fixed seed (V16)', () => {
    const p = makePacket({ baseDamage: 8, critChance: 0.5 });
    const a = Array.from({ length: 20 }, () => computeOutgoing(p, new Rng(7)).amount);
    // Same fresh seed each time → identical first roll.
    expect(new Set(a).size).toBe(1);
  });
});

describe('applyMitigation (steps 6-8 armor/shield)', () => {
  it('armor reduces flat, chip floor of 5%', () => {
    expect(applyMitigation(10, 4, 0).toHealth).toBe(6);
    expect(applyMitigation(10, 100, 0).toHealth).toBeCloseTo(0.5, 6); // floored at 5%
  });

  it('shield absorbs before health', () => {
    const r = applyMitigation(10, 0, 4);
    expect(r.toHealth).toBe(6);
    expect(r.shieldLeft).toBe(0);
  });

  it('shield larger than damage absorbs all', () => {
    const r = applyMitigation(5, 0, 20);
    expect(r.toHealth).toBe(0);
    expect(r.shieldLeft).toBe(15);
  });
});
