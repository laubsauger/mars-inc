// Proc coefficient (T69, V32). Unit-covers the scaling math (chance·duration·stacks
// × coef) and resolution, then integration-covers that the coefficient threads from
// the firing weapon through the projectile to the on-hit trigger ctx, and that proc
// chains terminate at MAX_PROC_DEPTH (bounded recursion, deterministic V16/V21).

import { describe, it, expect } from 'vitest';
import {
  procCoefOf,
  applyStatusScaled,
  FAMILY_PROC_COEF,
  MAX_PROC_DEPTH,
  PROC_CHAIN_INHERIT,
} from './proc';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { Rng } from '../../core/rng';
import { World } from '../world';
import { contractualSidearm } from '../../content/weapons/contractual-sidearm';
import { phobosDriver } from '../../content/weapons/phobos-driver';
import { rustDevilMinigun } from '../../content/weapons/rust-devil-minigun';

const DT = 1 / 60;

function activeEnemy(pool: EnemyPool, x = 0, z = 0): number {
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  return i;
}

/** A deterministic rng stub returning a fixed roll, for the chance-gate test. */
function fixedRng(roll: number): Rng {
  const r = new Rng(1);
  r.next = () => roll;
  return r;
}

describe('procCoefOf (T69, V32)', () => {
  it('uses the weapon-family default when procCoef is absent', () => {
    expect(procCoefOf(contractualSidearm)).toBe(FAMILY_PROC_COEF.sidearm); // 1.0
    expect(procCoefOf(phobosDriver)).toBe(FAMILY_PROC_COEF.orbital); // 2.5
    expect(procCoefOf(rustDevilMinigun)).toBe(FAMILY_PROC_COEF.rotary); // 0.5
  });

  it('honors an explicit procCoef override on the def', () => {
    expect(procCoefOf({ ...contractualSidearm, procCoef: 1.75 })).toBe(1.75);
  });
});

describe('applyStatusScaled (T69, V32 — chance·duration·magnitude × coef)', () => {
  it('coef 1 is identical to a plain apply (duration unchanged)', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatusScaled(pool, i, 'burn', { duration: 3, dps: 4 }, 1, new Rng(1));
    expect(pool.burnTime[i]).toBe(3);
    expect(pool.burnDps[i]).toBe(4); // dps untouched — duration carries the scaling
  });

  it('scales duration up for a high-coef weapon, down for a low-coef one', () => {
    const hi = new EnemyPool();
    const a = activeEnemy(hi);
    applyStatusScaled(hi, a, 'burn', { duration: 4, dps: 5 }, 2.5, new Rng(1));
    expect(hi.burnTime[a]).toBeCloseTo(10); // 4 × 2.5

    const lo = new EnemyPool();
    const b = activeEnemy(lo);
    applyStatusScaled(lo, b, 'burn', { duration: 4, dps: 5 }, 0.5, new Rng(1));
    expect(lo.burnTime[b]).toBeCloseTo(2); // 4 × 0.5
  });

  it('scales stack count and floors it at 1', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    applyStatusScaled(pool, i, 'bleed', { duration: 4, dps: 2, stacks: 2 }, 3, new Rng(1));
    expect(pool.bleedStacks[i]).toBe(6); // 2 × 3
    const j = activeEnemy(pool, 5);
    applyStatusScaled(pool, j, 'shock', { duration: 3, stacks: 1 }, 0.4, new Rng(1));
    expect(pool.shockStacks[j]).toBe(1); // round(0.4) = 0 → floored to 1
  });

  it('rolls chance at chance × coef (clamped to 1)', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    // base chance 0.3, coef 0.5 → effective 0.15: a roll of 0.2 fails.
    expect(
      applyStatusScaled(pool, i, 'burn', { chance: 0.3, duration: 2, dps: 3 }, 0.5, fixedRng(0.2)),
    ).toBe(false);
    expect(pool.burnTime[i]).toBe(0);
    // coef 3 → effective min(1, 0.9) = 0.9: a roll of 0.2 lands.
    expect(
      applyStatusScaled(pool, i, 'burn', { chance: 0.3, duration: 2, dps: 3 }, 3, fixedRng(0.2)),
    ).toBe(true);
    expect(pool.burnTime[i]).toBeCloseTo(6); // 2 × 3
  });

  it('does not touch the rng when no chance is supplied (seed-stable)', () => {
    const pool = new EnemyPool();
    const i = activeEnemy(pool);
    let calls = 0;
    const r = new Rng(1);
    const orig = r.next.bind(r);
    r.next = () => {
      calls++;
      return orig();
    };
    applyStatusScaled(pool, i, 'burn', { duration: 2, dps: 3 }, 2, r);
    expect(calls).toBe(0); // chance-less apply consumes no randomness → existing seeds unaffected
  });
});

describe('proc coefficient end-to-end (T69, V32 wiring + bound)', () => {
  /** Register an on-hit recorder, plant active enemies in front of the player, and
   *  step until the auto-firing sidearm lands a hit. Returns recorded ctx data. */
  function captureHits(w: World, onCtx: (depth: number, coef: number, chain: () => void) => void) {
    w.start();
    w.effects.on('hit', (ctx) =>
      onCtx(ctx.depth, ctx.procCoef, () => ctx.procChain?.(ctx.targetIndex, false)),
    );
    for (let k = 0; k < 8; k++) {
      const i = w.enemies.spawn(RUST_MITE, w.player.pos.x + 1.5 + k * 0.25, w.player.pos.z, 0, 0);
      w.enemies.state[i] = EnemyState.Active;
    }
  }

  it('threads the firing weapon proc coefficient into the on-hit ctx', () => {
    const w = new World(42);
    const coefs: number[] = [];
    captureHits(w, (depth, coef) => {
      if (depth === 0) coefs.push(coef);
    });
    for (let t = 0; t < 90 && coefs.length === 0; t++) w.step(DT);
    expect(coefs.length).toBeGreaterThan(0);
    expect(coefs[0]).toBe(FAMILY_PROC_COEF.sidearm); // starter weapon = sidearm family (1.0)
  });

  it('a swapped weapon carries its own coefficient to the hit', () => {
    const w = new World(7);
    const coefs: number[] = [];
    captureHits(w, (depth, coef) => {
      if (depth === 0) coefs.push(coef);
    });
    w.weaponSystem.setPrimary(phobosDriver); // orbital, coef 2.5
    for (let t = 0; t < 200 && coefs.length === 0; t++) w.step(DT);
    expect(coefs.length).toBeGreaterThan(0);
    expect(coefs[0]).toBe(FAMILY_PROC_COEF.orbital); // 2.5 — projectile-carried, not the default
  });

  it('proc chains terminate at MAX_PROC_DEPTH and decay the coefficient', () => {
    const w = new World(99);
    const depths: number[] = [];
    const coefByDepth = new Map<number, number>();
    captureHits(w, (depth, coef, chain) => {
      depths.push(depth);
      coefByDepth.set(depth, coef);
      chain(); // re-enter UNCONDITIONALLY — only the depth guard can stop this
    });
    // Without the bound this recurses forever; the test completing IS the assertion.
    for (let t = 0; t < 90 && depths.length === 0; t++) w.step(DT);
    expect(depths.length).toBeGreaterThan(0);
    expect(Math.max(...depths)).toBe(MAX_PROC_DEPTH); // re-entered exactly to the cap, no deeper
    expect(depths).not.toContain(MAX_PROC_DEPTH + 1); // guard blocks before firing the over-deep ctx
    // Chained proc carries the inherited (decayed) coefficient.
    const base = coefByDepth.get(0)!;
    expect(coefByDepth.get(1)).toBeCloseTo(base * PROC_CHAIN_INHERIT);
  });
});
