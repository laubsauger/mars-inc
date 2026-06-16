// DoT-as-%-of-hit + shock amplifier (T70, V33). Damaging ailments scale their dps
// as a fraction of the inflicting hit (so burn/bleed grow with the weapon), and
// shock is a magnitude-capped damage-taken amplifier.

import { describe, it, expect } from 'vitest';
import { applyStatus, shockAmp, corrodeAmp } from './status';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { World } from '../world';

const DT = 1 / 60;

function activeEnemy(pool: EnemyPool, x = 0, z = 0): number {
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  return i;
}

describe('shockAmp (T70, V33 — capped damage-taken modifier)', () => {
  it('rises 10% per stack and caps at +50%', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    expect(shockAmp(pool, i)).toBe(1); // no stacks
    applyStatus(pool, i, 'shock', { duration: 3, stacks: 3 });
    expect(shockAmp(pool, i)).toBeCloseTo(1.3);
    applyStatus(pool, i, 'shock', { duration: 3, stacks: 3 }); // 6 total → 0.6 raw, capped 0.5
    expect(shockAmp(pool, i)).toBeCloseTo(1.5);
  });

  it('is independent of corrosion (separate amplifiers)', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatus(pool, i, 'corrode', { duration: 3, stacks: 2 });
    expect(shockAmp(pool, i)).toBe(1); // corrosion doesn't shock
    expect(corrodeAmp(pool, i)).toBeCloseTo(1.12); // 2 × 0.06
  });
});

describe('DoT scales as a fraction of the hit (T70, V33)', () => {
  /** Register an on-hit DoT, plant active enemies, step until a hit lands, and read
   *  the dps the closure derived from the hit's damage. */
  function captureBurn(seed: number, dotCoef: number, duration: number) {
    const w = new World(seed);
    w.start();
    let rec: { hit: number; dps: number } | null = null;
    w.effects.on('hit', (ctx) => {
      if (rec) return;
      ctx.applyStatus(ctx.targetIndex, 'burn', { duration, dotCoef });
      rec = { hit: ctx.hitDamage, dps: w.enemies.burnDps[ctx.targetIndex]! };
    });
    for (let k = 0; k < 8; k++) {
      const i = w.enemies.spawn(RUST_MITE, w.player.pos.x + 1.5 + k * 0.25, w.player.pos.z, 0, 0);
      w.enemies.state[i] = EnemyState.Active;
    }
    for (let t = 0; t < 90 && !rec; t++) w.step(DT);
    return rec as { hit: number; dps: number } | null;
  }

  it('burn dps = dotCoef × hitDamage / duration (sidearm proc 1.0)', () => {
    const rec = captureBurn(42, 0.9, 3);
    expect(rec).not.toBeNull();
    expect(rec!.hit).toBeGreaterThan(0);
    expect(rec!.dps).toBeCloseTo((0.9 * rec!.hit) / 3); // hit-scaled, not the old flat 3
  });

  it('a steeper coefficient yields proportionally more dps for the same hit', () => {
    // Same seed → same hit damage; doubling dotCoef doubles derived dps.
    const lo = captureBurn(7, 0.4, 3);
    const hi = captureBurn(7, 0.8, 3);
    expect(lo).not.toBeNull();
    expect(hi).not.toBeNull();
    expect(hi!.hit).toBeCloseTo(lo!.hit); // identical hit (deterministic seed)
    expect(hi!.dps).toBeCloseTo(lo!.dps * 2);
  });
});
