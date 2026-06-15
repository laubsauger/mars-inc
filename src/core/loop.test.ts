import { describe, it, expect } from 'vitest';
import { stepCount, FIXED_DT } from './loop';

describe('stepCount (V1 fixed timestep)', () => {
  it('exact dt → one step, ~zero remainder', () => {
    const r = stepCount(0, FIXED_DT, 1);
    expect(r.steps).toBe(1);
    expect(r.accumulator).toBeCloseTo(0, 10);
  });

  it('half dt → zero steps, accumulates', () => {
    const r = stepCount(0, FIXED_DT / 2, 1);
    expect(r.steps).toBe(0);
    expect(r.accumulator).toBeCloseTo(FIXED_DT / 2, 10);
  });

  it('2.5 dt → two steps, half remainder', () => {
    const r = stepCount(0, FIXED_DT * 2.5, 1);
    expect(r.steps).toBe(2);
    expect(r.accumulator).toBeCloseTo(FIXED_DT * 0.5, 10);
  });

  it('clamps huge frame delta (no spiral of death)', () => {
    // 10s stall clamped to 0.1s → 6 steps max, not 600.
    const r = stepCount(0, 10, 1);
    expect(r.steps).toBe(6);
  });

  it('timeScale 0 freezes sim', () => {
    const r = stepCount(0, FIXED_DT * 5, 0);
    expect(r.steps).toBe(0);
    expect(r.accumulator).toBe(0);
  });

  it('determinism: fixed dt sum independent of frame pacing', () => {
    // 1 frame of 4*dt vs 4 frames of 1*dt → same total steps.
    const big = stepCount(0, FIXED_DT * 4, 1).steps;
    let acc = 0;
    let small = 0;
    for (let i = 0; i < 4; i++) {
      const r = stepCount(acc, FIXED_DT, 1);
      acc = r.accumulator;
      small += r.steps;
    }
    expect(big).toBe(small);
  });
});
