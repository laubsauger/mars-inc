import { describe, it, expect } from 'vitest';
import { SpatialHash } from './spatial-hash';

describe('SpatialHash (V6 neighbor queries)', () => {
  it('finds an inserted point within radius', () => {
    const h = new SpatialHash(4);
    h.insert(1, 0, 0);
    const out: number[] = [];
    h.queryCircle(0, 0, 2, out);
    expect(out).toContain(1);
  });

  it('broad-phase includes near-miss cells but caller filters exact', () => {
    const h = new SpatialHash(4);
    h.insert(7, 100, 100);
    const out: number[] = [];
    h.queryCircle(0, 0, 5, out);
    expect(out).not.toContain(7);
  });

  it('handles negative coordinates', () => {
    const h = new SpatialHash(4);
    h.insert(3, -20, -33);
    const out: number[] = [];
    h.queryCircle(-20, -33, 1, out);
    expect(out).toContain(3);
  });

  it('clear empties without losing capacity', () => {
    const h = new SpatialHash(4);
    h.insert(1, 0, 0);
    h.clear();
    const out: number[] = [];
    h.queryCircle(0, 0, 2, out);
    expect(out).toHaveLength(0);
  });

  it('reuses caller array (no alloc) across queries', () => {
    const h = new SpatialHash(4);
    h.insert(1, 0, 0);
    h.insert(2, 1, 1);
    const out: number[] = [];
    h.queryCircle(0, 0, 3, out);
    const first = out.length;
    h.queryCircle(0, 0, 3, out);
    expect(out.length).toBe(first); // not appended twice
  });

  it('returns many points in a dense cell', () => {
    const h = new SpatialHash(10);
    for (let i = 0; i < 50; i++) h.insert(i, 1, 1);
    const out: number[] = [];
    const n = h.queryCircle(1, 1, 1, out);
    expect(n).toBe(50);
  });
});
