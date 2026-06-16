// Gravedigger pets (T-necro): a raised pet hunts + claws the nearest enemy through
// the pipeline (V3), decays over time, and dies (V5 pool). Deterministic (V16).

import { describe, it, expect } from 'vitest';
import { PetSystem } from './pets';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';
import { SpatialHash } from '../spatial-hash';
import { Rng } from '../../core/rng';
import { FxQueue } from '../fx';

const DT = 1 / 60;
const player = { pos: { x: 0, z: 0 } };

function arena(): { enemies: EnemyPool; hash: SpatialHash } {
  const enemies = new EnemyPool();
  const hash = new SpatialHash(2);
  return { enemies, hash };
}

function rebuild(hash: SpatialHash, enemies: EnemyPool): void {
  hash.clear();
  for (let i = 0; i < enemies.count; i++) hash.insert(i, enemies.posX[i]!, enemies.posZ[i]!);
}

describe('PetSystem (gravedigger)', () => {
  it('raises a pet that hunts and damages the nearest enemy', () => {
    const { enemies, hash } = arena();
    const e = enemies.spawn(RUST_MITE, 2, 0, 0, 0);
    enemies.state[e] = EnemyState.Active;
    enemies.health[e] = 1e6; // survive so we can measure damage

    const sys = new PetSystem();
    sys.raise(0, 0, RUST_MITE.variant, 0.7, 1, new FxQueue());
    expect(sys.pool.count).toBe(1);

    const hp0 = enemies.health[e]!;
    const rng = new Rng(1);
    const fx = new FxQueue();
    for (let t = 0; t < 120; t++) {
      rebuild(hash, enemies);
      sys.step(player, enemies, hash, rng, fx, DT);
    }
    expect(enemies.health[e]!).toBeLessThan(hp0); // pet closed in and clawed it
  });

  it('a pet decays and dies even with nothing to fight', () => {
    const { enemies, hash } = arena(); // no enemies
    const sys = new PetSystem();
    sys.raise(0, 0, RUST_MITE.variant, 0.7, 1, new FxQueue());
    expect(sys.pool.count).toBe(1);
    const rng = new Rng(1);
    const fx = new FxQueue();
    for (let t = 0; t < 600; t++) sys.step(player, enemies, hash, rng, fx, DT); // 10s
    expect(sys.pool.count).toBe(0); // crumbled back to dust
  });

  it('is pooled — never exceeds the cap', () => {
    const sys = new PetSystem();
    for (let i = 0; i < 200; i++) sys.raise(i, 0, RUST_MITE.variant, 0.7, 1, new FxQueue());
    expect(sys.pool.count).toBeLessThanOrEqual(48);
  });
});
