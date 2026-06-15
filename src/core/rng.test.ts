import { describe, it, expect } from 'vitest';
import { Rng } from './rng';

describe('Rng (V16 determinism)', () => {
  it('same seed → same sequence', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds → different sequences', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next() in [0,1)', () => {
    const r = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() inclusive bounds', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('snapshot/restore reproduces stream', () => {
    const r = new Rng(42);
    r.next();
    r.next();
    const snap = r.snapshot();
    const after = [r.next(), r.next(), r.next()];
    r.restore(snap);
    expect([r.next(), r.next(), r.next()]).toEqual(after);
  });
});
