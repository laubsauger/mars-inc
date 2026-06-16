import { describe, it, expect } from 'vitest';
import { applyPermanents } from './permanents';
import { createPlayer } from '../player';
import { gloryFor } from '../run';
import { PERMANENT_UPGRADES } from '../../content/permanent/index';
import { defaultMods } from './mods';
import { BuildEffects } from './effects';

describe('build-seeding permanents (T35+)', () => {
  it('Live Wire seeds a Shock-on-hit trigger into the build engine', () => {
    const effects = new BuildEffects();
    applyPermanents(createPlayer(), { 'live-wire': 1 }, defaultMods(), effects);
    expect(effects.has('hit')).toBe(true);
  });

  it('Hair-Trigger Coils firms recoil + enables recoil→sprint recharge', () => {
    const p = createPlayer();
    const mods = defaultMods();
    applyPermanents(p, { 'hair-trigger': 1 }, mods, new BuildEffects());
    expect(mods.recoilMult).toBeGreaterThan(1);
    expect(p.recoilSprintRecharge).toBe(true);
  });

  it('Hunter Protocol starts the run with drones', () => {
    const p = createPlayer();
    applyPermanents(p, { 'hunter-protocol': 2 }, defaultMods(), new BuildEffects());
    expect(p.droneCount).toBe(2);
  });

  it('seeds the mod layer as a BASE value that in-run draft picks stack on top of', () => {
    // Glory Tree contributes starting pierce; the draft's pierce upgrades all use
    // `mods.pierce += …` (additive mod layer), so they build on the seeded base
    // rather than replacing it — explosive radius / damage / chain work the same,
    // and applyPermanents runs before any draft in world.reset.
    const mods = defaultMods();
    applyPermanents(createPlayer(), { 'splinter-rounds': 2 }, mods, new BuildEffects());
    expect(mods.pierce).toBe(2); // base from the Glory Tree
    mods.pierce += 1; // a draft pierce pick adds ON TOP, never overwrites
    expect(mods.pierce).toBe(3);
  });
});

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
      won: false,
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
      won: true,
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
    const baseCooldown = p.stats.sprintCooldown;
    const baseDuration = p.stats.sprintDuration;
    const baseRecoil = p.stats.recoilResistance;
    applyPermanents(p, {
      'house-odds': 2,
      'blacklist-rights': 1,
      'lucky-streak': 3,
      'fleet-footed': 2,
      'redline-servos': 2,
      'afterburn-clause': 2,
      'gyro-bracing': 3,
    });
    expect(p.bonusRerolls).toBe(2);
    expect(p.bonusBanishes).toBe(1);
    expect(p.luck).toBe(3);
    expect(p.stats.moveSpeed).toBeCloseTo(baseSpeed * 1.1, 5); // +5%/level × 2
    expect(p.stats.sprintCooldown).toBeCloseTo(baseCooldown * 0.88, 5);
    expect(p.stats.sprintDuration).toBeCloseTo(baseDuration * 1.14, 5);
    expect(p.stats.recoilResistance).toBeCloseTo(baseRecoil + 0.3, 5);
  });

  it('Biology/Arsenal utility permanents affect pickup, magnet, and luck', () => {
    const p = createPlayer();
    const baseHp = p.maxHealth;
    const basePickup = p.pickupRadius;
    const baseMagnet = p.magnetRadius;
    applyPermanents(p, {
      'organ-repo-insurance': 2,
      'magnetized-marrow': 3,
      'sponsor-auditor': 2,
    });
    expect(p.maxHealth).toBe(baseHp + 16);
    expect(p.health).toBe(baseHp + 16);
    expect(p.pickupRadius).toBeCloseTo(basePickup * 1.06 * 1.04, 5);
    expect(p.magnetRadius).toBeCloseTo(baseMagnet * 1.24, 5);
    expect(p.luck).toBe(2);
  });
});
