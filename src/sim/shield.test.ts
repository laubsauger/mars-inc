import { describe, it, expect } from 'vitest';
import { createPlayer, hitPlayer, stepPlayer } from './player';
import type { InputSnapshot } from '../core/input';

const IDLE: InputSnapshot = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  pause: false,
  pickup: false,
  fire: false,
  grenade: false,
  toggleAuto: false,
  mouseX: -1,
  mouseY: -1,
  mouseInside: false,
  aimX: 0,
  aimZ: 0,
  hasAim: false,
};

describe('recharging shield (T40 defensive)', () => {
  it('absorbs one instance of damage with no health loss, then breaks', () => {
    const p = createPlayer();
    p.shieldMax = 1;
    p.shieldCharges = 1;
    const landed = hitPlayer(p, 30);
    expect(landed).toBe(false); // absorbed → no damage "landed"
    expect(p.health).toBe(100); // health untouched
    expect(p.shieldCharges).toBe(0); // charge consumed
  });

  it('a second hit (shield down) damages health normally', () => {
    const p = createPlayer();
    p.shieldMax = 1;
    p.shieldCharges = 1;
    hitPlayer(p, 30); // absorbed
    p.invuln = 0; // clear i-frames for the test
    const landed = hitPlayer(p, 30);
    expect(landed).toBe(true);
    expect(p.health).toBe(70);
  });

  it('recharges a broken charge after the cooldown', () => {
    const p = createPlayer();
    p.shieldMax = 1;
    p.shieldCharges = 1;
    p.shieldRecharge = 2;
    hitPlayer(p, 30); // breaks → timer = 2s
    expect(p.shieldCharges).toBe(0);
    // step ~2.1s of sim time
    for (let t = 0; t < 2.1; t += 1 / 60) stepPlayer(p, IDLE, 1 / 60);
    expect(p.shieldCharges).toBe(1);
  });

  it('does nothing when no shield is drafted (shieldMax 0)', () => {
    const p = createPlayer();
    const landed = hitPlayer(p, 25);
    expect(landed).toBe(true);
    expect(p.health).toBe(75);
    expect(p.shieldMax).toBe(0);
  });
});
