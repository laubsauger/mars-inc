import { describe, it, expect } from 'vitest';
import { computeFitDistance } from './camera';

describe('computeFitDistance (V7 whole arena visible)', () => {
  const R = 35;
  const FOV = 45;

  it('wider aspect needs ≥ distance than square', () => {
    const square = computeFitDistance(R, FOV, 1);
    const wide = computeFitDistance(R, FOV, 16 / 9);
    expect(wide).toBeGreaterThanOrEqual(square);
  });

  it('tall (portrait) aspect still fits horizontally', () => {
    const portrait = computeFitDistance(R, FOV, 0.5);
    // vertical FOV constrains; horizontal must also fit at that distance.
    const vFov = (FOV * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * 0.5);
    const halfHorizExtent = portrait * Math.tan(hFov / 2);
    expect(halfHorizExtent).toBeGreaterThanOrEqual(R);
  });

  it('larger radius → proportionally larger distance', () => {
    const d1 = computeFitDistance(10, FOV, 1.6);
    const d2 = computeFitDistance(20, FOV, 1.6);
    expect(d2).toBeCloseTo(d1 * 2, 6);
  });
});
