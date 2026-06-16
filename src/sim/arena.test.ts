// Arena shape helpers (V4). Boundary/spawn math must be shape-correct for both
// the circular Rust Crown and the rectangular Cold Vault.

import { describe, it, expect } from 'vitest';
import {
  clampToArena,
  arenaContains,
  clampPoint,
  gateOuterPoint,
  wallDistance,
  interiorPoint,
  RUST_CROWN,
  COLD_VAULT,
} from './arena';

const RECT = COLD_VAULT.shape;
const CIRC = RUST_CROWN.shape;
// Derive expectations from the def so dimension tweaks don't break the test.
const HW = RECT.kind === 'rect' ? RECT.halfW : 0;
const HZ = RECT.kind === 'rect' ? RECT.halfZ : 0;

describe('arena (rect)', () => {
  it('clamps a point past a wall and kills the outward velocity', () => {
    const r = clampToArena({ x: HW + 100, z: 0 }, { x: 5, z: 1 }, 1, RECT);
    expect(r.pos.x).toBeCloseTo(HW - 1, 5); // halfW − collisionRadius
    expect(r.vel.x).toBe(0); // outward (+x) killed
    expect(r.vel.z).toBe(1); // tangential kept
  });

  it('leaves an in-bounds point untouched', () => {
    const r = clampToArena({ x: 5, z: 5 }, { x: 1, z: 1 }, 1, RECT);
    expect(r.pos).toEqual({ x: 5, z: 5 });
  });

  it('arenaContains respects the rectangle + margin', () => {
    expect(arenaContains(HW - 1, HZ - 1, 0, RECT)).toBe(true);
    expect(arenaContains(HW + 1, 0, 0, RECT)).toBe(false);
    expect(arenaContains(HW + 1, 0, 2, RECT)).toBe(true); // within margin
  });

  it('clampPoint pulls an enemy back inside (no velocity)', () => {
    const p = clampPoint(HW + 200, -(HZ + 200), 1, RECT);
    expect(p.x).toBeCloseTo(HW - 1, 5);
    expect(p.z).toBeCloseTo(-(HZ - 1), 5);
  });

  it('gateOuterPoint puts the four gates on the four sides', () => {
    expect(gateOuterPoint(0, 0, 2.5, RECT)).toMatchObject({ x: HW + 2.5, z: 0 }); // +x
    expect(gateOuterPoint(1, 0, 2.5, RECT).z).toBeGreaterThan(HZ); // +z
    expect(gateOuterPoint(2, 0, 2.5, RECT).x).toBeLessThan(-HW); // −x
    expect(gateOuterPoint(3, 0, 2.5, RECT).z).toBeLessThan(-HZ); // −z
  });

  it('wallDistance hits the near wall along the ray', () => {
    // From centre heading +x → hits the +x wall at halfW.
    expect(wallDistance(0, 0, 1, 0, 999, RECT)).toBeCloseTo(HW, 5);
  });

  it('interiorPoint stays inside the rectangle', () => {
    for (let i = 0; i < 50; i++) {
      const p = interiorPoint((i * 0.137) % 1, (i * 0.71) % 1, 0.3, 0.82, RECT);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(HW);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(HZ);
    }
  });
});

describe('arena (circle) — stashed variant still works', () => {
  it('clamps radially and contains by radius', () => {
    const r = clampToArena({ x: 100, z: 0 }, { x: 5, z: 0 }, 1, CIRC);
    expect(Math.hypot(r.pos.x, r.pos.z)).toBeCloseTo(34, 5); // radius 35 − 1
    expect(arenaContains(34, 0, 0, CIRC)).toBe(true);
    expect(arenaContains(40, 0, 0, CIRC)).toBe(false);
  });
});
