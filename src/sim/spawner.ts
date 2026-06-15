// Basic gate spawner (T13). Enemies enter through the four gates with a
// telegraph delay (V9 — readable warning, ⊥ pop at edge). A proper budgeted
// wave director replaces the cadence math at T20; spawn channel + telegraph
// stay.

import type { EnemyPool } from './enemies';
import { RUST_MITE, DEBT_HOUND } from './enemies';
import type { Rng } from '../core/rng';
import { ARENA_RADIUS, GATE_COUNT } from './constants';

const TELEGRAPH = 0.6;
const MAX_CONCURRENT = 600; // hard cap until the budgeted director (T20, V8)

export class Spawner {
  private timer = 0;
  private phase = 0;

  /** Spawn interval shrinks as the run escalates (placeholder ramp). */
  private interval(elapsed: number): number {
    return Math.max(0.15, 1.2 - elapsed * 0.02);
  }

  step(pool: EnemyPool, rng: Rng, elapsed: number, dt: number): void {
    if (pool.count >= MAX_CONCURRENT) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.interval(elapsed);

    const burst = 1 + Math.floor(elapsed / 20);
    for (let b = 0; b < burst && pool.count < MAX_CONCURRENT; b++) {
      const gate = rng.int(0, GATE_COUNT - 1);
      const angle = (gate / GATE_COUNT) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const r = ARENA_RADIUS - 1.5;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      // Tougher enemies start appearing after ~25s.
      const type = elapsed > 25 && rng.next() < 0.25 ? DEBT_HOUND : RUST_MITE;
      pool.spawn(type, x, z, TELEGRAPH, this.phase++);
    }
  }
}
