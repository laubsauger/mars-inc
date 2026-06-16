// Status reactions (T53, V28). A primed status pair consumes both atomically and
// releases an AoE burst — V3-routed, deterministic. Off until enabled.

import { describe, it, expect } from 'vitest';
import { resolveReactions, REACTIONS, type ReactionId } from './reactions';
import { applyStatus } from './status';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { FxQueue } from '../fx';
import { Rng } from '../../core/rng';

function active(pool: EnemyPool, x = 0, z = 0): number {
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  pool.health[i] = 1000; // survive the burst so we can read consumed statuses
  return i;
}

function hashOf(pool: EnemyPool): SpatialHash {
  const h = new SpatialHash(2);
  for (let i = 0; i < pool.count; i++) h.insert(i, pool.posX[i]!, pool.posZ[i]!);
  return h;
}

const ALL: ReadonlySet<ReactionId> = new Set(REACTIONS.map((r) => r.id));

describe('status reactions (T53)', () => {
  it('does nothing when no reaction is enabled (base game unchanged)', () => {
    const pool = new EnemyPool();
    const i = active(pool);
    applyStatus(pool, i, 'burn', { duration: 2, dps: 3 });
    applyStatus(pool, i, 'chill', { duration: 2, slowMult: 0.5 });
    const res = resolveReactions(pool, hashOf(pool), new Rng(1), new FxQueue(), new Set());
    expect(res.count).toBe(0);
    expect(pool.burnTime[i]).toBeGreaterThan(0); // statuses untouched
    expect(pool.chillTime[i]).toBeGreaterThan(0);
  });

  it('Thermal Shock: burn+chill consume both atomically and burst', () => {
    const pool = new EnemyPool();
    const i = active(pool);
    const j = active(pool, 1.5, 0); // neighbour caught in the AoE
    applyStatus(pool, i, 'burn', { duration: 2, dps: 3 });
    applyStatus(pool, i, 'chill', { duration: 2, slowMult: 0.5 });
    const res = resolveReactions(pool, hashOf(pool), new Rng(1), new FxQueue(), ALL);
    expect(res.count).toBe(1);
    expect(res.dealt).toBeGreaterThan(0);
    expect(res.stagger).toBeGreaterThan(0);
    expect(pool.burnTime[i]).toBe(0); // consumed
    expect(pool.chillTime[i]).toBe(0);
    expect(pool.markTime[i]!).toBeGreaterThan(0); // vulnerability applied
    expect(pool.health[j]!).toBeLessThan(1000); // neighbour took the burst
  });

  it('respects stack thresholds (Plasma Bloom needs 3 shock)', () => {
    const pool = new EnemyPool();
    const i = active(pool);
    const only: ReadonlySet<ReactionId> = new Set<ReactionId>(['plasmaBloom']);
    applyStatus(pool, i, 'burn', { duration: 2, dps: 2 });
    applyStatus(pool, i, 'shock', { duration: 2, stacks: 2 }); // below threshold
    expect(resolveReactions(pool, hashOf(pool), new Rng(1), new FxQueue(), only).count).toBe(0);
    applyStatus(pool, i, 'shock', { duration: 2, stacks: 1 }); // now 3
    expect(resolveReactions(pool, hashOf(pool), new Rng(1), new FxQueue(), only).count).toBe(1);
    expect(pool.shockStacks[i]).toBe(0); // consumed
    expect(pool.burnTime[i]).toBe(0);
  });

  it('at most one reaction per enemy per step', () => {
    const pool = new EnemyPool();
    const i = active(pool);
    // Prime two reactions at once (burn+chill = Thermal, corrode+burn = Acid Fog).
    applyStatus(pool, i, 'burn', { duration: 2, dps: 2 });
    applyStatus(pool, i, 'chill', { duration: 2, slowMult: 0.5 });
    applyStatus(pool, i, 'corrode', { duration: 2, stacks: 3 });
    const res = resolveReactions(pool, hashOf(pool), new Rng(1), new FxQueue(), ALL);
    expect(res.count).toBe(1); // only the first matched reaction fires
  });

  it('deterministic for a fixed seed (V16)', () => {
    const mk = () => {
      const p = new EnemyPool();
      const i = active(p);
      active(p, 1, 0);
      applyStatus(p, i, 'burn', { duration: 2, dps: 3 });
      applyStatus(p, i, 'chill', { duration: 2, slowMult: 0.5 });
      return p;
    };
    const a = mk();
    const b = mk();
    const ra = resolveReactions(a, hashOf(a), new Rng(9), new FxQueue(), ALL);
    const rb = resolveReactions(b, hashOf(b), new Rng(9), new FxQueue(), ALL);
    expect(ra.dealt).toBe(rb.dealt);
  });
});
