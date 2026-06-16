// Health drops (T33+): kills occasionally drop a medkit; walking over it heals
// (clamped). Pooled + bounded, deterministic via a seeded rng (V16).

import { describe, it, expect } from 'vitest';
import { HealthDropSystem, HEALTH_TTL } from './health-drops';
import type { KillEvent } from './combat/weapon-system';
import { createPlayer } from './player';
import { Rng } from '../core/rng';
import { FxQueue } from './fx';

const DT = 1 / 60;
const kill = (x: number, z: number): KillEvent => ({ x, z, variant: 0 });

describe('health drops', () => {
  it('walking onto a medkit heals the player (clamped to max)', () => {
    const sys = new HealthDropSystem();
    const player = createPlayer();
    player.health = 50;
    player.pos.x = 100; // far → kit drops but isn't collected yet
    const rng = new Rng(1);
    const fx = new FxQueue();
    // Force a drop by spawning directly (chance is seed-dependent).
    sys.pool.spawn(0, 0);
    expect(sys.pool.count).toBe(1);

    player.pos.x = 0;
    sys.step(player, [], rng, fx, DT);
    expect(sys.pool.count).toBe(0); // collected
    expect(player.health).toBe(75); // +25
    expect(sys.healedThisStep).toBe(25);
  });

  it('overheal is clamped and counts only the health actually restored', () => {
    const sys = new HealthDropSystem();
    const player = createPlayer();
    player.health = player.maxHealth - 10;
    sys.pool.spawn(0, 0);
    sys.step(player, [], new Rng(1), new FxQueue(), DT);
    expect(player.health).toBe(player.maxHealth);
    expect(sys.healedThisStep).toBe(10);
  });

  it('ignored kits decay after their TTL', () => {
    const sys = new HealthDropSystem();
    const player = createPlayer();
    player.pos.x = 100; // never collect
    sys.pool.spawn(0, 0);
    const steps = Math.ceil(HEALTH_TTL / DT) + 2;
    for (let t = 0; t < steps; t++) sys.step(player, [], new Rng(1), new FxQueue(), DT);
    expect(sys.pool.count).toBe(0);
  });

  it('drops are chance-gated and the pool stays bounded', () => {
    const sys = new HealthDropSystem();
    const player = createPlayer();
    player.pos.x = 100;
    const rng = new Rng(7);
    const fx = new FxQueue();
    for (let t = 0; t < 500; t++) sys.step(player, [kill(5, 5)], rng, fx, DT);
    expect(sys.pool.count).toBeLessThanOrEqual(24);
  });
});
