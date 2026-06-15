// V19: target selection is a core math system → unit-tested. Covers each
// targeting rule (aim / nearest / lowest-health / nearest-to-aim), range gating,
// and the telegraph exclusion (telegraphing enemies are not yet valid targets).

import { describe, it, expect } from 'vitest';
import { resolveAim } from './weapon-system';
import { equip, type WeaponDefinition, type TargetingRule } from './weapon';
import { contractualSidearm } from '../../content/weapons/contractual-sidearm';
import { createPlayer } from '../player';
import { EnemyPool, EnemyState, RUST_MITE } from '../enemies';

function weapon(targeting: TargetingRule, range = 16): ReturnType<typeof equip> {
  const def: WeaponDefinition = { ...contractualSidearm, targeting, range };
  return equip(def);
}

/** Add a live (Active) enemy; telegraphing enemies are added but left inactive. */
function addEnemy(pool: EnemyPool, x: number, z: number, hp?: number, active = true): number {
  const i = pool.spawn(RUST_MITE, x, z, 0.6, 0);
  if (active) pool.state[i] = EnemyState.Active;
  if (hp !== undefined) pool.health[i] = hp;
  return i;
}

function isUnit(v: { x: number; z: number }): boolean {
  return Math.abs(Math.hypot(v.x, v.z) - 1) < 1e-6;
}

describe('resolveAim — nearest', () => {
  it('targets the closest active enemy as a unit vector', () => {
    const pool = new EnemyPool();
    addEnemy(pool, 10, 0); // far
    addEnemy(pool, 3, 0); // near
    const aim = resolveAim(weapon('nearest'), createPlayer(), pool);
    expect(aim).not.toBeNull();
    expect(isUnit(aim!)).toBe(true);
    expect(aim!.x).toBeCloseTo(1);
    expect(aim!.z).toBeCloseTo(0);
  });

  it('ignores enemies outside range', () => {
    const pool = new EnemyPool();
    addEnemy(pool, 20, 0); // beyond range 16
    expect(resolveAim(weapon('nearest', 16), createPlayer(), pool)).toBeNull();
  });

  it('ignores telegraphing (not-yet-active) enemies', () => {
    const pool = new EnemyPool();
    addEnemy(pool, 4, 0, undefined, false); // still telegraphing
    expect(resolveAim(weapon('nearest'), createPlayer(), pool)).toBeNull();
  });
});

describe('resolveAim — lowest-health', () => {
  it('targets the lowest-health in-range enemy', () => {
    const pool = new EnemyPool();
    addEnemy(pool, 5, 0, 10); // healthy, +x
    addEnemy(pool, 0, 5, 2); // weak, +z
    const aim = resolveAim(weapon('lowest-health'), createPlayer(), pool);
    expect(aim).not.toBeNull();
    expect(aim!.x).toBeCloseTo(0);
    expect(aim!.z).toBeCloseTo(1);
  });
});

describe('resolveAim — aim (mouse-directed)', () => {
  it('fires toward the ground cursor regardless of enemies', () => {
    const pool = new EnemyPool();
    addEnemy(pool, 8, 0); // off to +x, should be ignored in favor of the cursor
    const p = createPlayer();
    p.aim = { x: 0, z: 10, has: true };
    const aim = resolveAim(weapon('aim'), p, pool);
    expect(aim).not.toBeNull();
    expect(isUnit(aim!)).toBe(true);
    expect(aim!.x).toBeCloseTo(0);
    expect(aim!.z).toBeCloseTo(1);
  });

  it('falls back to nearest enemy when there is no cursor (keyboard-only)', () => {
    const pool = new EnemyPool();
    addEnemy(pool, 4, 0);
    const p = createPlayer();
    p.aim = { x: 0, z: 0, has: false };
    const aim = resolveAim(weapon('aim'), p, pool);
    expect(aim).not.toBeNull();
    expect(aim!.x).toBeCloseTo(1);
  });

  it('returns null with no cursor and no enemies', () => {
    const p = createPlayer();
    p.aim = { x: 0, z: 0, has: false };
    expect(resolveAim(weapon('aim'), p, new EnemyPool())).toBeNull();
  });
});

describe('resolveAim — nearest-to-aim', () => {
  it('soft-snaps to the in-range enemy nearest the cursor', () => {
    const pool = new EnemyPool();
    addEnemy(pool, 8, 1); // near the cursor at (10,0)
    const p = createPlayer();
    p.aim = { x: 10, z: 0, has: true };
    const aim = resolveAim(weapon('nearest-to-aim'), p, pool);
    expect(aim).not.toBeNull();
    expect(isUnit(aim!)).toBe(true);
    expect(aim!.x).toBeGreaterThan(0.9); // toward the +x enemy, not raw cursor
  });
});
