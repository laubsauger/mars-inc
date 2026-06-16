import { describe, it, expect } from 'vitest';
import { ARSENAL_UPGRADES } from './arsenal';
import { UPGRADES } from './index';
import { World } from '../../sim/world';
import { EnemyState, RUST_MITE } from '../../sim/enemies';

const DT = 1 / 60;

describe('arsenal expansion (T40)', () => {
  it('every id is unique across the whole draft catalog', () => {
    const ids = UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the catalog cut the duplicate stat-sticks', () => {
    const ids = new Set(UPGRADES.map((u) => u.id));
    for (const dead of [
      'lubricated-action',
      'quicksilver',
      'precision-audit',
      'hazard-pay',
      'phase-driver',
    ]) {
      expect(ids.has(dead)).toBe(false);
    }
  });

  it('keeps a real rarity spread (curses + capstones, not flat stats)', () => {
    const count = (r: string) => ARSENAL_UPGRADES.filter((u) => u.rarity === r).length;
    expect(count('corrupted')).toBeGreaterThan(0);
    expect(count('legendary')).toBeGreaterThan(0);
    expect(ARSENAL_UPGRADES.length).toBeGreaterThanOrEqual(20);
  });

  it('every arsenal card applies without throwing', () => {
    for (const u of ARSENAL_UPGRADES) {
      const w = new World(1);
      w.start();
      expect(() => u.apply({ player: w.player, mods: w.mods, effects: w.effects })).not.toThrow();
    }
  });

  it('arsenal triggers + conditionals survive live combat (hit/crit/kill)', () => {
    const w = new World(3);
    w.start();
    // Stack every arsenal card onto one run so all triggers/conditionals are live.
    for (const u of ARSENAL_UPGRADES) {
      u.apply({ player: w.player, mods: w.mods, effects: w.effects });
    }
    for (let k = 0; k < 12; k++) {
      const i = w.enemies.spawn(RUST_MITE, w.player.pos.x + 1.5 + k * 0.3, w.player.pos.z, 0, 0);
      w.enemies.state[i] = EnemyState.Active;
    }
    expect(() => {
      for (let t = 0; t < 240; t++) w.step(DT);
    }).not.toThrow();
  });
});
