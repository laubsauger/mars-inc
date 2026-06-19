// Headless sim invariant tests (T29). No DOM, no render — drives the
// authoritative sim and asserts the bounds that keep a run fair and finite:
// concurrent-count cap and bounded bank (V8), runs terminate (V8), the entity
// pool stays populated, the boss milestone fires, and damage stays within the
// pipeline's band (V19). Complements the per-system unit tests with whole-run
// integration checks.

import { describe, it, expect } from 'vitest';
import { World } from './world';
import { EnemyPool, RUST_MITE, ENEMY_BY_VARIANT } from './enemies';
import { WaveDirector, budgetAt } from './director/wave-director';
import { Rng } from '../core/rng';
import { makePacket, computeOutgoing } from './combat/damage';
import type { InputSnapshot } from '../core/input';

const DT = 1 / 60;

const PASSIVE: InputSnapshot = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  pause: false,
  pickup: false,
  dropWeapon: false,
  fire: false,
  grenade: false,
  grenadeHeld: false,
  toggleAuto: false,
  mouseX: -1,
  mouseY: -1,
  mouseInside: false,
  aimX: 0,
  aimZ: 0,
  hasAim: false,
};

describe('V8 director bounds', () => {
  it('never exceeds the concurrent cap and keeps the bank bounded (∀ seed)', () => {
    for (const seed of [1, 7, 4242]) {
      const pool = new EnemyPool();
      const rng = new Rng(seed);
      const director = new WaveDirector();
      let elapsed = 0;
      // ~120s: deep enough into the stretched ramp to exercise growing caps + bank.
      for (let t = 0; t < 7200; t++) {
        elapsed += DT;
        director.step(pool, rng, elapsed, DT);
        const b = budgetAt(elapsed);
        const cap = Math.min(b.maxConcurrentEnemies, pool.capacity);
        expect(pool.count).toBeLessThanOrEqual(cap);
        // Bank is clamped each step so idle frames can't hoard an unbounded burst.
        expect(director.banked).toBeLessThanOrEqual(b.threatPoints * 4 + RUST_MITE.threat + 1e-6);
      }
      expect(pool.count).toBeGreaterThan(0); // pool stays populated (⊥ empty)
    }
  });

  it('fields the act-1 first boss once it never dies (sequenced runner, T75)', () => {
    const pool = new EnemyPool();
    const rng = new Rng(99);
    const director = new WaveDirector();
    director.reset(); // build the act roster (default cold-vault = Act 1)
    let elapsed = 0;
    // ~290s: well past the act's firstBossAt (55 escalation × TIMELINE_STRETCH 2 = 110s).
    for (let t = 0; t < 17400; t++) {
      elapsed += DT;
      director.step(pool, rng, elapsed, DT);
    }
    expect(director.bossSpawned).toBe(true);
    let bosses = 0;
    for (let i = 0; i < pool.count; i++) if (ENEMY_BY_VARIANT[pool.variant[i]!]?.boss) bosses++;
    // Nothing kills it here, so the sequence holds at Miniboss I: exactly one boss,
    // and the stage never advances without a kill.
    expect(bosses).toBe(1);
  });
});

describe('V8 runs terminate', () => {
  it('an undefended passive run ends in bounded time (∀ seed)', () => {
    for (const seed of [2, 11, 555]) {
      const w = new World(seed);
      w.weaponSystem.reset(); // strip weapons: no offense → the swarm must end it
      let t = 0;
      const cap = 6000; // 100s ceiling
      while (!w.ended && t < cap) {
        w.input = PASSIVE;
        w.step(DT);
        t++;
      }
      expect(w.ended).toBe(true);
      expect(w.player.health).toBe(0);
    }
  });
});

describe('pool stays populated mid-run', () => {
  it('a normal run has live enemies after warmup', () => {
    const w = new World(123);
    for (let t = 0; t < 1200; t++) {
      if (w.leveling) {
        w.choose(0);
        continue;
      }
      w.input = PASSIVE;
      w.step(DT);
    }
    expect(w.enemies.count).toBeGreaterThan(0);
  });
});

describe('V19 damage bands', () => {
  it('every roll lands on a discrete band within [no-crit, crit]', () => {
    const spec = makePacket({
      baseDamage: 10,
      additive: 2,
      multiplier: 1.5,
      critChance: 0.5,
      critMultiplier: 2,
      elementMultiplier: 1,
    });
    const noCrit = (10 + 2) * 1.5; // 18
    const crit = noCrit * 2; // 36
    const rng = new Rng(2024);
    let crits = 0;
    let normals = 0;
    for (let i = 0; i < 4000; i++) {
      const o = computeOutgoing(spec, rng);
      expect(o.amount).toBeGreaterThanOrEqual(noCrit - 1e-9);
      expect(o.amount).toBeLessThanOrEqual(crit + 1e-9);
      if (o.crit) {
        expect(o.amount).toBeCloseTo(crit);
        crits++;
      } else {
        expect(o.amount).toBeCloseTo(noCrit);
        normals++;
      }
    }
    // Both outcomes occur → the crit roll is actually seeded, not pinned.
    expect(crits).toBeGreaterThan(0);
    expect(normals).toBeGreaterThan(0);
  });
});
