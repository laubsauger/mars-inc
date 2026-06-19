import { describe, it, expect } from 'vitest';
import {
  normalizeInput,
  integrateVelocity,
  clampToArena,
  updateSprint,
  newSprintState,
  applyRecoil,
  knockbackVelocity,
  type MovementStats,
} from './movement';
import { createPlayer, stepPlayer } from './player';
import type { InputSnapshot } from '../core/input';

const NO_INPUT: InputSnapshot = {
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

const STATS: MovementStats = {
  moveSpeed: 10,
  acceleration: 14,
  deceleration: 22,
  turnResponsiveness: 1,
  collisionRadius: 0.7,
  sprintMultiplier: 1.8,
  sprintDuration: 0.8,
  sprintCooldown: 5,
  sprintCharges: 1,
  knockbackResistance: 0,
  recoilResistance: 0,
};

describe('normalizeInput (V4 no faster diagonals)', () => {
  it('diagonal magnitude = 1, not 1.41', () => {
    const d = normalizeInput(1, 1);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 6);
  });
  it('zero stays zero', () => {
    expect(normalizeInput(0, 0)).toEqual({ x: 0, z: 0 });
  });
  it('sub-unit input preserved (analog-ish)', () => {
    const d = normalizeInput(0.5, 0);
    expect(d.x).toBeCloseTo(0.5, 6);
  });
});

describe('integrateVelocity (§5.2 accel/decel)', () => {
  it('accelerates toward max but not instantly', () => {
    const v1 = integrateVelocity({ x: 0, z: 0 }, { x: 1, z: 0 }, 10, 14, 22, 1 / 60);
    expect(v1.x).toBeGreaterThan(0);
    expect(v1.x).toBeLessThan(10);
  });
  it('reaches full speed after enough steps', () => {
    let v = { x: 0, z: 0 };
    for (let i = 0; i < 120; i++) v = integrateVelocity(v, { x: 1, z: 0 }, 10, 14, 22, 1 / 60);
    expect(v.x).toBeCloseTo(10, 1);
  });
  it('decel tail on release approaches zero', () => {
    let v = { x: 10, z: 0 };
    for (let i = 0; i < 120; i++) v = integrateVelocity(v, { x: 0, z: 0 }, 10, 14, 22, 1 / 60);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(0, 3);
  });
  it('never exceeds max speed', () => {
    let v = { x: 0, z: 0 };
    for (let i = 0; i < 300; i++) v = integrateVelocity(v, { x: 1, z: 1 }, 10, 14, 22, 1 / 60);
    expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(10 + 1e-6);
  });
});

describe('clampToArena (boundary response)', () => {
  it('keeps player inside radius', () => {
    const r = clampToArena({ x: 100, z: 0 }, { x: 5, z: 0 }, 35, 0.7);
    expect(Math.hypot(r.pos.x, r.pos.z)).toBeCloseTo(35 - 0.7, 6);
  });
  it('zeroes outward velocity, keeps tangential (slide)', () => {
    const r = clampToArena({ x: 35, z: 0 }, { x: 5, z: 3 }, 35, 0.7);
    expect(r.vel.x).toBeCloseTo(0, 6); // outward (+x) removed
    expect(r.vel.z).toBeCloseTo(3, 6); // tangential kept
  });
  it('no-op when inside', () => {
    const pos = { x: 1, z: 1 };
    const vel = { x: 2, z: 0 };
    const r = clampToArena(pos, vel, 35, 0.7);
    expect(r.pos).toBe(pos);
    expect(r.vel).toBe(vel);
  });
});

describe('updateSprint (§5.3 resource)', () => {
  it('consumes a charge on rising edge and activates', () => {
    let s = newSprintState(STATS);
    s = updateSprint(s, true, STATS, 1 / 60);
    expect(s.active).toBe(true);
    expect(s.charges).toBe(0);
    expect(s.forgiveness).toBeGreaterThan(0);
  });
  it('does not activate without a charge', () => {
    let s = newSprintState(STATS);
    s = updateSprint(s, true, STATS, 1 / 60); // uses the one charge
    while (s.active) s = updateSprint(s, false, STATS, 1 / 60);
    const before = s.charges;
    s = updateSprint(s, true, STATS, 1 / 60);
    expect(before).toBe(0);
    expect(s.active).toBe(false);
  });
  it('expires after duration', () => {
    let s = newSprintState(STATS);
    s = updateSprint(s, true, STATS, 1 / 60);
    let t = 0;
    while (s.active && t < 2) {
      s = updateSprint(s, false, STATS, 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThanOrEqual(STATS.sprintDuration - 0.02);
    expect(s.active).toBe(false);
  });
  it('recharges a charge after cooldown', () => {
    let s = newSprintState(STATS);
    s = updateSprint(s, true, STATS, 1 / 60);
    for (let t = 0; t < STATS.sprintCooldown + 1; t += 0.1) s = updateSprint(s, false, STATS, 0.1);
    expect(s.charges).toBe(1);
  });
});

describe('applyRecoil (V10 capped)', () => {
  it('pushes opposite fire direction', () => {
    const v = applyRecoil({ x: 0, z: 0 }, -1, 0, 50, 0, 1 / 60, 0.5);
    expect(v.x).toBeLessThan(0);
  });
  it('never exceeds maxKick per call', () => {
    const v = applyRecoil({ x: 0, z: 0 }, 1, 0, 99999, 0, 1 / 60, 0.5);
    expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(0.5 + 1e-9);
  });
  it('resistance scales impulse down', () => {
    const full = applyRecoil({ x: 0, z: 0 }, 1, 0, 10, 0, 1 / 60, 999);
    const half = applyRecoil({ x: 0, z: 0 }, 1, 0, 10, 0.5, 1 / 60, 999);
    expect(half.x).toBeCloseTo(full.x * 0.5, 6);
  });
  it('zero direction → no change', () => {
    const v = applyRecoil({ x: 1, z: 2 }, 0, 0, 10, 0, 1 / 60, 1);
    expect(v).toEqual({ x: 1, z: 2 });
  });
});

describe('knockbackVelocity (player body-check shove)', () => {
  it('pushes along the given (enemy→player) direction, normalized to force', () => {
    const v = knockbackVelocity(3, 0, 9, 0); // dir +x, magnitude only from force
    expect(v.x).toBeCloseTo(9, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });
  it('resistance scales the shove down (1 = immovable)', () => {
    const full = knockbackVelocity(0, 1, 10, 0);
    const half = knockbackVelocity(0, 1, 10, 0.5);
    expect(half.z).toBeCloseTo(full.z * 0.5, 6);
    expect(knockbackVelocity(0, 1, 10, 1)).toEqual({ x: 0, z: 0 });
    expect(knockbackVelocity(0, 1, 10, 2)).toEqual({ x: 0, z: 0 }); // clamped, never reversed
  });
  it('zero direction or force → no shove', () => {
    expect(knockbackVelocity(0, 0, 10, 0)).toEqual({ x: 0, z: 0 });
    expect(knockbackVelocity(1, 0, 0, 0)).toEqual({ x: 0, z: 0 });
  });
});

describe('recoil impulse survives movement input (oversteer fix, V10)', () => {
  it('recoil still displaces the player when steering AGAINST it', () => {
    const withRecoil = createPlayer();
    const noRecoil = createPlayer();
    withRecoil.recoilVel = { x: 6, z: 0 }; // kicked toward +x
    // Both hold LEFT (−x) — the recoil player must still end up further +x,
    // i.e. the held input does NOT fully cancel the kick (the old bug).
    const input: InputSnapshot = { ...NO_INPUT, moveX: -1 };
    stepPlayer(withRecoil, input, 1 / 60);
    stepPlayer(noRecoil, input, 1 / 60);
    expect(withRecoil.pos.x).toBeGreaterThan(noRecoil.pos.x);
  });

  it('the recoil impulse decays toward zero (controllable, never permanent)', () => {
    const p = createPlayer();
    p.recoilVel = { x: 6, z: 0 };
    for (let i = 0; i < 300; i++) stepPlayer(p, NO_INPUT, 1 / 60); // ~5s (slow decay)
    expect(Math.hypot(p.recoilVel.x, p.recoilVel.z)).toBe(0);
  });
});
