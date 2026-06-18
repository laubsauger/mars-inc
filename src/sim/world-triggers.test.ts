// Batch 1: the previously-dead build levers must actually FIRE — lowHp / sprint /
// waveClear triggers + the recentCrit conditional. These guard the wiring so the
// new direction cards (Killing Spree, Adrenaline Dump, Breather, Slipstream…) can't
// silently become no-ops if the World step is refactored.

import { describe, it, expect } from 'vitest';
import { World } from './world';
import { RUST_MITE } from './enemies';
import { EnemyState } from './enemies';

const STEP = 1 / 60;
function started(): World {
  const w = new World(1);
  w.start(); // countdown off by default → live immediately
  return w;
}

describe('Batch 1 build-lever wiring', () => {
  it('fires the sprint trigger on the dash rising edge', () => {
    const w = started();
    let fired = 0;
    w.effects.on('sprint', () => fired++);
    // Hold a movement input + sprint so a charge is spent → rising edge.
    w.input = { ...w.input, moveX: 1, sprint: true };
    w.step(STEP);
    expect(fired).toBe(1);
    // Held sprint must NOT re-fire every step (edge-triggered).
    w.step(STEP);
    expect(fired).toBe(1);
  });

  it('fires the lowHp trigger once when health drops below the threshold', () => {
    const w = started();
    let fired = 0;
    w.effects.on('lowHp', () => fired++);
    w.player.health = w.player.maxHealth * 0.2; // below LOW_HP_FRAC (0.25)
    w.step(STEP);
    expect(fired).toBe(1);
    // Still low next step → does NOT re-fire (edge, not per-step).
    w.step(STEP);
    expect(fired).toBe(1);
  });

  it('fires the waveClear trigger when the last enemy dies', () => {
    const w = started();
    let fired = 0;
    w.effects.on('waveClear', () => fired++);
    // Put an enemy on the field, step so `hadEnemies` latches true.
    const e = w.enemies.spawn(RUST_MITE, 3, 0, 0, 0);
    w.enemies.state[e] = EnemyState.Active;
    w.step(STEP);
    expect(fired).toBe(0); // enemy still alive → no clear
    // Remove it (simulate the field emptying), step → clear fires once.
    w.enemies.count = 0;
    w.step(STEP);
    expect(fired).toBe(1);
  });

  it('fires the breather trigger when LOCAL space clears (no enemy within 7m)', () => {
    const w = started();
    let fired = 0;
    w.effects.on('breather', () => fired++);
    // Enemy 3m from the player (origin) → nearby latches true.
    const e = w.enemies.spawn(RUST_MITE, 3, 0, 0, 0);
    w.enemies.state[e] = EnemyState.Active;
    w.step(STEP);
    expect(fired).toBe(0); // someone within 7m → no breathing room
    // Push it far away (>7m) so the local space clears → breather fires once.
    w.enemies.posX[e] = 30;
    w.step(STEP);
    expect(fired).toBe(1);
    w.step(STEP);
    expect(fired).toBe(1); // edge, not per-step
  });

  // (recentCrit conditional is a one-line passthrough of recentCritTimer, set from
  //  weaponSystem.critThisStep — exercised by real crits in-sim; not unit-driven here
  //  because weaponSystem.step resets the flag at its start.)
});
