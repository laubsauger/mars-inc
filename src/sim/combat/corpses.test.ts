// T65 corpse/overkill — core math unit tests (V19). Pooling bounds (V5), the
// primer→engine gate, pipeline-routed detonation (V3), bounded chain (V30), and
// determinism (V16).

import { describe, it, expect } from 'vitest';
import { CorpseSystem, CorpsePool } from './corpses';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { Rng } from '../../core/rng';
import { FxQueue } from '../fx';
import { createPlayer, type Player } from '../player';
import type { KillEvent } from './weapon-system';

function tankAt(x: number, z: number): { pool: EnemyPool; hash: SpatialHash } {
  const pool = new EnemyPool();
  const i = pool.spawn(RUST_MITE, x, z, 0, 0);
  pool.state[i] = EnemyState.Active;
  pool.health[i] = 1e9; // never dies → detonations always land
  const hash = new SpatialHash(2);
  hash.insert(i, pool.posX[i]!, pool.posZ[i]!);
  return { pool, hash };
}

const kill = (x: number, z: number, overkill: number): KillEvent => ({
  x,
  z,
  variant: 0,
  overkill,
  size: 0.7,
});

describe('CorpsePool (V5 pool)', () => {
  it('caps at capacity and never overflows', () => {
    const p = new CorpsePool();
    let last = 0;
    for (let i = 0; i < 5000; i++) last = p.spawn(0, 0, 10, 0.7, 0);
    expect(last).toBe(-1); // refused past the cap
    expect(p.count).toBeLessThanOrEqual(256);
  });

  it('swap-remove keeps the live prefix contiguous', () => {
    const p = new CorpsePool();
    p.spawn(1, 0, 10, 0.7, 0);
    p.spawn(2, 0, 20, 0.7, 0);
    p.spawn(3, 0, 30, 0.7, 0);
    p.kill(0); // last (30) moves into slot 0
    expect(p.count).toBe(2);
    expect(p.stored[0]).toBe(30);
  });
});

describe('CorpseSystem ingest (Waste Not primer)', () => {
  it('stores overkill ONLY when corpseStore is on', () => {
    const off = new CorpseSystem();
    const p = createPlayer();
    off.ingest([kill(0, 0, 50)], p);
    expect(off.pool.count).toBe(0); // primer not taken → no body

    const on = new CorpseSystem();
    p.corpseStore = true;
    on.ingest([kill(1, 2, 50)], p);
    expect(on.pool.count).toBe(1);
    expect(on.pool.stored[0]).toBe(50);
    expect(on.pool.posX[0]).toBe(1);
  });

  it('ignores kills with no overkill', () => {
    const s = new CorpseSystem();
    const p = createPlayer();
    p.corpseStore = true;
    s.ingest([kill(0, 0, 0)], p);
    expect(s.pool.count).toBe(0);
  });
});

describe('CorpseSystem detonation (engine, V3)', () => {
  function player(): Player {
    const p = createPlayer();
    p.corpseStore = true;
    return p;
  }

  it('Violent Recycling: fuse-detonates → nearby enemy takes pipeline damage', () => {
    const { pool, hash } = tankAt(0.5, 0);
    const p = player();
    p.corpseDetonate = true;
    const sys = new CorpseSystem();
    sys.ingest([kill(0, 0, 80)], p);
    const hp0 = pool.health[0]!;
    const dealt = sys.step(p, pool, hash, new Rng(1), new FxQueue(), 1.0); // exhaust fuse
    expect(dealt).toBeGreaterThan(0);
    expect(pool.health[0]!).toBeLessThan(hp0);
    expect(sys.pool.count).toBe(0); // corpse consumed
  });

  it('without the engine, the corpse expires WITHOUT damage', () => {
    const { pool, hash } = tankAt(0.5, 0);
    const p = player(); // corpseDetonate stays false
    const sys = new CorpseSystem();
    sys.ingest([kill(0, 0, 80)], p);
    const hp0 = pool.health[0]!;
    const dealt = sys.step(p, pool, hash, new Rng(1), new FxQueue(), 1.0);
    expect(dealt).toBe(0);
    expect(pool.health[0]!).toBe(hp0); // untouched
    expect(sys.pool.count).toBe(0); // body still decays
  });

  it('Body Ballistics: a corpse launches toward the nearest enemy', () => {
    const { pool, hash } = tankAt(6, 0); // enemy to the +x
    const p = player();
    p.corpseBallistics = true;
    const sys = new CorpseSystem();
    sys.ingest([kill(0, 0, 80)], p);
    sys.step(p, pool, hash, new Rng(1), new FxQueue(), 0.1); // one short tick of flight
    expect(sys.pool.count).toBe(1); // still in flight
    expect(sys.pool.posX[0]!).toBeGreaterThan(0); // moved toward the enemy
  });
});

describe('CorpseSystem chain (liability, bounded V30)', () => {
  it('Chain of Evidence terminates — never grows unbounded', () => {
    const { pool, hash } = tankAt(0, 0);
    const p = createPlayer();
    p.corpseStore = true;
    p.corpseDetonate = true;
    p.corpseChain = true;
    const sys = new CorpseSystem();
    sys.ingest([kill(0, 0, 400)], p); // max store
    let maxSeen = 0;
    for (let s = 0; s < 40; s++) {
      sys.step(p, pool, hash, new Rng(s + 1), new FxQueue(), 1.0);
      maxSeen = Math.max(maxSeen, sys.pool.count);
    }
    expect(maxSeen).toBeLessThanOrEqual(4); // 1-in-1-out, never explodes in count
    expect(sys.pool.count).toBe(0); // the decaying store falls below floor → ends
  });
});

describe('CorpseSystem Moonshot (catastrophe)', () => {
  it('a heavy corpse calls a telegraphed meteor that hits hard', () => {
    const { pool, hash } = tankAt(0, 0);
    const p = createPlayer();
    p.corpseStore = true;
    p.corpseDetonate = true;
    p.corpseMeteorThreshold = 120;
    const sys = new CorpseSystem();
    const fx = new FxQueue();
    sys.ingest([kill(0, 0, 300)], p); // ≥ threshold
    // First step: arms the meteor + telegraph, doesn't land yet.
    sys.step(p, pool, hash, new Rng(1), fx, 0.1);
    expect(sys.pool.count).toBe(1);
    expect(fx.events.some((e) => e.kind === 'teleport')).toBe(true); // telegraph
    // Let the delay elapse → it strikes.
    const dealt = sys.step(p, pool, hash, new Rng(1), fx, 2.0);
    expect(dealt).toBeGreaterThan(0);
    expect(sys.pool.count).toBe(0);
  });
});

describe('CorpseSystem determinism (V16)', () => {
  it('same seed → identical enemy health after detonation', () => {
    const run = (): number => {
      const { pool, hash } = tankAt(0.5, 0);
      const p = createPlayer();
      p.corpseStore = true;
      p.corpseDetonate = true;
      const sys = new CorpseSystem();
      sys.ingest([kill(0, 0, 80)], p);
      sys.step(p, pool, hash, new Rng(42), new FxQueue(), 1.0);
      return pool.health[0]!;
    };
    expect(run()).toBe(run());
  });
});
