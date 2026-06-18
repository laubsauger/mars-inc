import { describe, it, expect } from 'vitest';
import { applyPermanents } from './permanents';
import { createPlayer } from '../player';
import { runScore, killScore, gloryAward } from '../../content/balance/glory';
import { PERMANENT_UPGRADES } from '../../content/permanent/index';
import { defaultMods } from './mods';
import { BuildEffects } from './effects';

describe('Glory-Tree permanents (T35 reweave — amplify, gate rules; no build-seeding)', () => {
  it('Accelerant AMPLIFIES status damage (rewards a DoT build, does not seed one)', () => {
    const mods = defaultMods();
    const effects = new BuildEffects();
    applyPermanents(createPlayer(), { accelerant: 2 }, mods, effects);
    expect(mods.statusDamageMult).toBeCloseTo(1.6); // 1 + 0.3×2
    expect(effects.has('hit')).toBe(false); // it amplifies — it does NOT apply a status on hit
  });

  it('Hollow Points amplifies crit damage', () => {
    const mods = defaultMods();
    applyPermanents(createPlayer(), { 'hollow-points': 2 }, mods, new BuildEffects());
    expect(mods.critDamageMult).toBeCloseTo(1.8); // 1 + 0.4×2
  });

  it('Premium Contracts raises rare/legendary draft odds (quality, not +1 card)', () => {
    const p = createPlayer();
    applyPermanents(p, { 'premium-contracts': 1 }, defaultMods(), new BuildEffects());
    expect(p.draftSize).toBe(3); // draft count unchanged — quality, not quantity
    expect(p.draftRarityBias['rare']).toBeCloseTo(1.6, 6);
    expect(p.draftRarityBias['legendary']).toBeCloseTo(1.5, 6);
  });

  it('Second Wind grants a revive charge (cheat death once)', () => {
    const p = createPlayer();
    applyPermanents(p, { 'second-wind': 1 }, defaultMods(), new BuildEffects());
    expect(p.reviveCharges).toBe(1);
  });

  it('Drone Overclock amplifies COMMAND drone damage', () => {
    const p = createPlayer();
    applyPermanents(p, { 'drone-overclock': 2 }, defaultMods(), new BuildEffects());
    expect(p.droneDamageMult).toBeCloseTo(1.4); // 1 + 0.2×2 (rebalanced amplify tier)
  });

  it('Glass Protocol is an INFAMY rule-break: more damage, halved health', () => {
    const p = createPlayer();
    const mods = defaultMods();
    const base = p.maxHealth;
    applyPermanents(p, { 'glass-protocol': 1 }, mods, new BuildEffects());
    expect(mods.damageMult).toBeCloseTo(1.6); // +0.6
    expect(p.maxHealth).toBe(Math.round(base * 0.5));
  });

  it('Sponsorship Deal raises the Glory multiplier (economy node)', () => {
    const p = createPlayer();
    applyPermanents(p, { 'sponsorship-deal': 3 }, defaultMods(), new BuildEffects());
    expect(p.gloryMult).toBeCloseTo(1.36); // 1 + 0.12×3
  });

  it('Hunter Protocol commissions ONE standing drone (maxLevel 1, no casual stacking)', () => {
    const p = createPlayer();
    applyPermanents(p, { 'hunter-protocol': 1 }, defaultMods(), new BuildEffects());
    expect(p.droneCount).toBe(1);
  });

  it('no permanent seeds an on-hit status any more (the seeders were cut)', () => {
    for (const id of ['frostbrand', 'hemorrhage-writ', 'caustic-coating', 'live-wire']) {
      expect(PERMANENT_UPGRADES.find((u) => u.id === id)).toBeUndefined();
    }
  });

  it('seeds the mod layer as a BASE that in-run draft picks stack on top of (STAT amplifiers only)', () => {
    // Glory Tree contributes a base STAT amplifier (e.g. +damage%); the draft's
    // upgrades use `mods.X += …` (additive layer), so they build on the seeded base
    // rather than replacing it. Mechanic GRANTS (pierce/chain/ricochet/projectile/
    // blast/DoT) are NOT seeded here — those are draft-only, the tree only biases the
    // draft toward them (see draftTagBias). applyPermanents runs before any draft.
    const mods = defaultMods();
    const base = mods.damageMult;
    applyPermanents(createPlayer(), { 'overcharged-rounds': 2 }, mods, new BuildEffects());
    expect(mods.damageMult).toBeCloseTo(base + 0.08); // +4% × 2 levels from the tree
    mods.damageMult += 0.25; // a draft damage pick adds ON TOP, never overwrites
    expect(mods.damageMult).toBeCloseTo(base + 0.33);
  });

  it('does NOT seed build mechanics (pierce/chain/ricochet) — those are draft-only', () => {
    const mods = defaultMods();
    applyPermanents(
      createPlayer(),
      { 'splinter-rounds': 2, 'arc-garnishment': 2, 'ricochet-clause': 2 },
      mods,
      new BuildEffects(),
    );
    // The tree biases the draft toward them but never grants the mechanic for free.
    expect(mods.pierce).toBe(0);
    expect(mods.chainCount).toBe(0);
    expect(mods.ricochet).toBe(0);
  });
});

describe('Glory award (T72/V34 RunScore curve — rarity calibration)', () => {
  it('rewards deeper, higher-value-kill runs more', () => {
    const small = gloryAward(runScore({ level: 2, killScore: 1 }));
    const big = gloryAward(runScore({ level: 20, killScore: 20 }));
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThanOrEqual(0);
  });

  it('a fresh run (level 1, nothing done) mints ~0 Glory', () => {
    expect(gloryAward(runScore({ level: 1, killScore: 0 }))).toBe(0);
  });

  it('TIME mints nothing (calibration) + cheap fodder barely scores', () => {
    // Only mites (variant 0, threat 1): 200 kills → a tiny kill score, no time term.
    const mites = killScore([200]);
    expect(mites).toBeLessThan(4); // 200 × 1 × 0.015 = 3 → trivial
    // A short low-level mite-spam run mints single-digit Glory, not tens.
    const earlyGlory = gloryAward(runScore({ level: 5, killScore: mites }));
    expect(earlyGlory).toBeLessThan(12);
  });

  it('valuable kills (brutes/elites) score far above cheap fodder', () => {
    const mite = killScore([10]); // variant 0 threat 1
    const brutes = [...new Array(8).fill(0)];
    brutes[7] = 10; // variant 7 = Audit Brute (threat 16)
    expect(killScore(brutes)).toBeGreaterThan(mite * 10);
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
      'gyro-bracing': 2,
    });
    expect(p.bonusRerolls).toBe(2);
    expect(p.bonusBanishes).toBe(1);
    expect(p.luck).toBe(3);
    expect(p.stats.moveSpeed).toBeCloseTo(baseSpeed * 1.1, 5); // +5%/level × 2
    expect(p.stats.sprintCooldown).toBeCloseTo(baseCooldown * 0.88, 5);
    expect(p.stats.sprintDuration).toBeCloseTo(baseDuration * 1.14, 5);
    expect(p.stats.recoilResistance).toBeCloseTo(baseRecoil + 0.2, 5); // +0.1/lvl × 2 (maxLevel 2)
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
