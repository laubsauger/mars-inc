import { describe, it, expect } from 'vitest';
import { BountySystem } from './bounty-system';
import { createPlayer } from './player';
import { Rng } from '../core/rng';
import { FxQueue } from './fx';

const DT = 1 / 60;

function stepFor(sys: BountySystem, seconds: number, player = createPlayer(), rng = new Rng(7)) {
  const fx = new FxQueue();
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) sys.step(player, rng, fx, DT);
}

describe('BountySystem (timed map upgrade source)', () => {
  it('spawns the first relic only after the initial delay', () => {
    const sys = new BountySystem();
    stepFor(sys, 20); // before FIRST_AT (24s)
    expect(sys.pool.count).toBe(0);
    stepFor(sys, 6); // cross 24s
    expect(sys.pool.count).toBe(1);
  });

  it('spawns relics away from the player', () => {
    const sys = new BountySystem();
    const player = createPlayer(); // at origin
    stepFor(sys, 26, player);
    expect(sys.pool.count).toBe(1);
    const dx = sys.pool.posX[0]! - player.pos.x;
    const dz = sys.pool.posZ[0]! - player.pos.z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(4); // not dropped on top of you
  });

  it('collecting a relic on walk-over grants exactly one draft', () => {
    const sys = new BountySystem();
    const player = createPlayer();
    const rng = new Rng(7);
    stepFor(sys, 26, player, rng);
    expect(sys.pool.count).toBe(1);
    // Walk onto the relic.
    player.pos.x = sys.pool.posX[0]!;
    player.pos.z = sys.pool.posZ[0]!;
    sys.step(player, rng, new FxQueue(), DT);
    expect(sys.collectedThisStep).toBe(1);
    expect(sys.pool.count).toBe(0);
  });

  it('reset clears relics and re-arms the first-spawn timer', () => {
    const sys = new BountySystem();
    stepFor(sys, 26);
    expect(sys.pool.count).toBe(1);
    sys.reset();
    expect(sys.pool.count).toBe(0);
    stepFor(sys, 20); // before FIRST_AT again
    expect(sys.pool.count).toBe(0);
  });
});
