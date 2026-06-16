// Directional spawn patterns (T33 pacing). Waves spawn in TIGHT clusters at the
// gate mouths (not spread randomly), and over a run every gate direction is used
// — single / pincer / sweep / surround vary where the pressure comes from, which
// is the lever for kiting difficulty. Deterministic (V16).

import { describe, it, expect } from 'vitest';
import { WaveDirector } from './wave-director';
import { EnemyPool } from '../enemies';
import { Rng } from '../../core/rng';
import { GATE_COUNT } from '../constants';
import { gateOuterPoint } from '../arena';

const DT = 1 / 60;
// The four gate anchors for the ACTIVE arena (shape-aware: rim points for a
// circle, side midpoints for a rect). Telegraph spawns sit near these.
const GATE_ANCHORS = Array.from({ length: GATE_COUNT }, (_, g) => gateOuterPoint(g, 0, 2.5));

/** Nearest gate anchor (Euclidean) for an enemy at (x,z). */
function nearestGate(x: number, z: number): { gate: number; dist: number } {
  let best = 0;
  let bestD = Infinity;
  for (let g = 0; g < GATE_COUNT; g++) {
    const a = GATE_ANCHORS[g]!;
    const d = Math.hypot(a.x - x, a.z - z);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return { gate: best, dist: bestD };
}

describe('spawn patterns', () => {
  it('clusters spawns at gate mouths and uses every gate direction over a run', () => {
    const pool = new EnemyPool();
    const rng = new Rng(2024);
    const d = new WaveDirector();
    const used = new Set<number>();
    let maxOffset = 0;

    let elapsed = 0;
    for (let t = 0; t < 60 * 60; t++) {
      elapsed += DT;
      d.step(pool, rng, elapsed, DT);
    }

    expect(pool.count).toBeGreaterThan(0);
    for (let i = 0; i < pool.count; i++) {
      const { gate, dist } = nearestGate(pool.posX[i]!, pool.posZ[i]!);
      used.add(gate);
      maxOffset = Math.max(maxOffset, dist);
    }

    // Tight clusters: every enemy sits within the gate opening of a gate centre.
    expect(maxOffset).toBeLessThan(8);
    // Directional variety: all four gates fielded enemies across the run.
    expect(used.size).toBe(GATE_COUNT);
  });
});
