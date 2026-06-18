// V16: same seed → same sim outcome. All sim randomness flows through one seeded
// Rng (mulberry32); no Math.random / Date / performance in the sim. This locks
// that contract: two worlds on the same seed, fed identical scripted input,
// stay bit-identical across their full authoritative state — including the Rng
// stream itself — while different seeds diverge. Guards every future sim change.

import { describe, it, expect } from 'vitest';
import { World } from './world';
import { EnemyState } from './enemies';
import type { InputSnapshot } from '../core/input';

const DT = 1 / 60;

/** Deterministic scripted input (pure function of tick — no randomness) so two
 *  runs receive identical drivers. Exercises move, sprint, aim, recoil paths. */
function scriptInput(t: number): InputSnapshot {
  const a = t * 0.07;
  return {
    moveX: Math.sin(a),
    moveZ: Math.cos(a * 1.3),
    sprint: t % 120 < 20,
    pause: false,
    pickup: false,
    fire: true, // hold fire so the run shoots (default is manual now)
    grenade: false,
    grenadeHeld: false,
    toggleAuto: false,
    mouseX: -1,
    mouseY: -1,
    mouseInside: false,
    aimX: Math.cos(a * 0.5) * 12,
    aimZ: Math.sin(a * 0.5) * 12,
    hasAim: true,
  };
}

/** Advance a world one scripted tick, keeping draft picks in lockstep (same seed
 *  → identical drafts, so picking index 0 on both keeps them synchronized). */
function driveTick(w: World, t: number): void {
  if (w.leveling) {
    w.choose(0);
    return;
  }
  const input = scriptInput(t);
  // Aim at the nearest live enemy so the scripted run reliably lands hits (the
  // weapon fires at the cursor). World-driven but still deterministic — both runs
  // see identical enemies — and robust to spawn-pattern changes.
  let best = Infinity;
  const e = w.enemies;
  for (let i = 0; i < e.count; i++) {
    if (e.state[i] !== EnemyState.Active) continue;
    const dx = e.posX[i]! - w.player.pos.x;
    const dz = e.posZ[i]! - w.player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      input.aimX = e.posX[i]!;
      input.aimZ = e.posZ[i]!;
    }
  }
  w.input = input;
  w.step(DT);
}

/** Flatten the full authoritative sim state into a comparable signature. The Rng
 *  snapshot is included — if any system drew from a different source, the streams
 *  desync and this catches it. */
function signature(w: World): unknown {
  const e: number[] = [];
  for (let i = 0; i < w.enemies.count; i++) {
    e.push(w.enemies.posX[i]!, w.enemies.posZ[i]!, w.enemies.health[i]!, w.enemies.state[i]!);
  }
  const pr: number[] = [];
  for (let i = 0; i < w.weaponSystem.projectiles.count; i++) {
    pr.push(w.weaponSystem.projectiles.posX[i]!, w.weaponSystem.projectiles.posZ[i]!);
  }
  const sh: number[] = [];
  for (let i = 0; i < w.shards.count; i++) {
    sh.push(w.shards.posX[i]!, w.shards.posZ[i]!, w.shards.value[i]!);
  }
  return {
    tick: w.tick,
    elapsed: w.elapsed,
    rng: w.rng.snapshot(),
    player: {
      x: w.player.pos.x,
      z: w.player.pos.z,
      vx: w.player.vel.x,
      vz: w.player.vel.z,
      health: w.player.health,
      level: w.player.level,
      xp: w.player.xp,
      facing: w.player.facing,
    },
    stats: { ...w.stats },
    enemyCount: w.enemies.count,
    e,
    pr,
    sh,
  };
}

const TICKS = 1200; // 20s of sim: countdown, spawns, kills, drafts, projectiles

describe('determinism (V16)', () => {
  it('same seed + same input → bit-identical full state at every checkpoint', () => {
    const a = new World(0xc0ffee);
    const b = new World(0xc0ffee);
    for (let t = 0; t < TICKS; t++) {
      driveTick(a, t);
      driveTick(b, t);
      // Spot-check periodically (cheap) and always at the end.
      if (t % 200 === 0 || t === TICKS - 1) {
        expect(signature(a)).toEqual(signature(b));
      }
    }
    // Meaningful run: combat actually happened (else the test proves nothing).
    expect(a.stats.kills).toBeGreaterThan(0);
    expect(a.tick).toBeGreaterThan(0);
  });

  it('different seeds diverge (randomness is actually seeded, not constant)', () => {
    const a = new World(1);
    const b = new World(2);
    for (let t = 0; t < TICKS; t++) {
      driveTick(a, t);
      driveTick(b, t);
    }
    expect(signature(a)).not.toEqual(signature(b));
  });

  it('reset() reseeds → a reused world is identical to a fresh one (V15+V16)', () => {
    const fresh = new World(42);
    for (let t = 0; t < TICKS; t++) driveTick(fresh, t);

    const reused = new World(42);
    for (let t = 0; t < 300; t++) driveTick(reused, t); // a prior partial run
    reused.reset();
    for (let t = 0; t < TICKS; t++) driveTick(reused, t);

    expect(signature(reused)).toEqual(signature(fresh));
  });
});
