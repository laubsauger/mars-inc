// Directional spawn patterns (T33 pacing). Waves spawn in TIGHT clusters at the
// gate mouths (not spread randomly), and over a run every gate direction is used
// — single / pincer / sweep / surround vary where the pressure comes from, which
// is the lever for kiting difficulty. Deterministic (V16).

import { describe, it, expect } from 'vitest';
import { WaveDirector } from './wave-director';
import { EnemyPool } from '../enemies';
import { Rng } from '../../core/rng';
import { GATE_COUNT } from '../constants';

const DT = 1 / 60;
const GATE_ANGLES = Array.from({ length: GATE_COUNT }, (_, g) => (g / GATE_COUNT) * Math.PI * 2);

function angDist(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/** Nearest gate index for an enemy at (x,z); the telegraph walk-in is radial so
 *  the spawn angle is preserved. */
function nearestGate(x: number, z: number): { gate: number; dist: number } {
  const a = Math.atan2(z, x);
  let best = 0;
  let bestD = Infinity;
  for (let g = 0; g < GATE_COUNT; g++) {
    const d = angDist(a, GATE_ANGLES[g]!);
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

    // Tight clusters: every enemy sits within the gate jitter of a gate centre.
    expect(maxOffset).toBeLessThan(0.2);
    // Directional variety: all four gates fielded enemies across the run.
    expect(used.size).toBe(GATE_COUNT);
  });
});
