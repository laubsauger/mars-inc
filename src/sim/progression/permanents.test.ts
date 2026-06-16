import { describe, it, expect } from 'vitest';
import { applyPermanents } from './permanents';
import { createPlayer } from '../player';
import { gloryFor } from '../run';
import { PERMANENT_UPGRADES } from '../../content/permanent/index';

describe('gloryFor (T26 award)', () => {
  it('rewards longer, deadlier, higher-level runs more', () => {
    const small = gloryFor({
      kills: 5,
      damageDealt: 0,
      damageTaken: 0,
      durationSec: 30,
      level: 2,
      upgradesTaken: 1,
      dps: 0,
      killsPerMin: 0,
    });
    const big = gloryFor({
      kills: 200,
      damageDealt: 0,
      damageTaken: 0,
      durationSec: 600,
      level: 20,
      upgradesTaken: 10,
      dps: 0,
      killsPerMin: 0,
    });
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThanOrEqual(0);
  });
});

describe('applyPermanents (T26 applied to next run)', () => {
  it('no owned upgrades → baseline player unchanged', () => {
    const p = createPlayer();
    const maxHp = p.maxHealth;
    applyPermanents(p, {});
    expect(p.maxHealth).toBe(maxHp);
  });

  it('reinforced plating raises starting max health by level', () => {
    const p = createPlayer();
    const base = p.maxHealth;
    applyPermanents(p, { 'reinforced-plating': 2 });
    expect(p.maxHealth).toBe(base + 40); // 20/level × 2
    expect(p.health).toBe(base + 40);
  });

  it('jump-start adds sprint charges', () => {
    const p = createPlayer();
    const base = p.stats.sprintCharges;
    applyPermanents(p, { 'jump-start': 1 });
    expect(p.stats.sprintCharges).toBe(base + 1);
    expect(p.sprint.maxCharges).toBe(base + 1);
  });

  it('clamps applied level to the upgrade maxLevel', () => {
    const def = PERMANENT_UPGRADES.find((u) => u.id === 'reinforced-plating')!;
    const p = createPlayer();
    const base = p.maxHealth;
    applyPermanents(p, { 'reinforced-plating': 999 });
    expect(p.maxHealth).toBe(base + 20 * def.maxLevel);
  });

  it('ignores unknown ids', () => {
    const p = createPlayer();
    const maxHp = p.maxHealth;
    applyPermanents(p, { 'does-not-exist': 3 });
    expect(p.maxHealth).toBe(maxHp);
  });

  it('Arsenal/Mobility branches grant draft resources, luck, speed (T35)', () => {
    const p = createPlayer();
    const baseSpeed = p.stats.moveSpeed;
    applyPermanents(p, {
      'house-odds': 2,
      'blacklist-rights': 1,
      'lucky-streak': 3,
      'fleet-footed': 2,
    });
    expect(p.bonusRerolls).toBe(2);
    expect(p.bonusBanishes).toBe(1);
    expect(p.luck).toBe(3);
    expect(p.stats.moveSpeed).toBeCloseTo(baseSpeed * 1.1, 5); // +5%/level × 2
  });
});
