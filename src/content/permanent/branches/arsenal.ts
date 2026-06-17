// Permanent (meta) upgrades — ARSENAL branch. Data only; `apply` mutates the
// fresh-run player / mod layer / build engine. Split from index.ts by branch so
// content authors edit one branch without touching the others.

import type { PermanentUpgrade } from '../index';

export const ARSENAL_PERMANENTS: PermanentUpgrade[] = [
  {
    id: 'gyro-bracing',
    name: 'Gyro Bracing',
    description: '+10% recoil resistance per level.',
    branch: 'arsenal',
    rarity: 'common',
    cost: 85,
    maxLevel: 4,
    apply: (p, level) => {
      p.stats.recoilResistance += 0.1 * level;
    },
  },
  {
    id: 'overcharged-rounds',
    name: 'Overcharged Rounds',
    description: '+4% weapon damage per level.',
    branch: 'arsenal',
    rarity: 'common',
    cost: 90,
    maxLevel: 5,
    apply: (_p, level, mods) => {
      mods.damageMult += 0.04 * level;
    },
  },
  {
    id: 'quickdraw-clause',
    name: 'Quickdraw Clause',
    description: '+4% fire rate per level.',
    branch: 'arsenal',
    rarity: 'common',
    cost: 90,
    maxLevel: 5,
    apply: (_p, level, mods) => {
      mods.fireRateMult += 0.04 * level;
    },
  },
  {
    id: 'hairline-sights',
    name: 'Hairline Sights',
    description: '+2% crit chance per level.',
    branch: 'arsenal',
    rarity: 'common',
    cost: 95,
    maxLevel: 4,
    apply: (_p, level, mods) => {
      mods.critChanceAdd += 0.02 * level;
    },
  },
  {
    id: 'splinter-rounds',
    name: 'Splinter Rounds',
    description: 'Start with +1 pierce per level — shots punch through the front rank.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.pierce += level;
    },
  },
  {
    id: 'ricochet-clause',
    name: 'Ricochet Clause',
    description: 'Start with +1 ricochet bounce per level — spent shots hunt a fresh target.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.ricochet += level;
    },
  },
  {
    id: 'arc-garnishment',
    name: 'Arc Garnishment',
    description: 'Start with +1 chain-lightning arc per level — hits leap to packed crowds.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 160,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.chainCount += level;
    },
  },
  {
    id: 'hollow-points',
    name: 'Hollow Points',
    description: 'AMPLIFY: +40% critical hit DAMAGE per level — pays off once you build crit.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 160,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.critDamageMult += 0.4 * level;
    },
  },
  {
    id: 'accelerant',
    name: 'Accelerant',
    description: 'AMPLIFY: +30% status (burn/bleed) damage per level — rewards a DoT build.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 170,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.statusDamageMult += 0.3 * level;
    },
  },
  {
    id: 'wide-load',
    name: 'Wide Load',
    description: 'KEYSTONE: +1 projectile on every shot — double the lead downrange.',
    branch: 'arsenal',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.projectileCount += 1;
    },
  },
  {
    id: 'war-profiteering',
    name: 'War Profiteering',
    description: 'KEYSTONE: +1 projectile AND +1 pierce — the swarm is just inventory now.',
    branch: 'arsenal',
    rarity: 'legendary',
    cost: 440,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.projectileCount += 1;
      mods.pierce += 1;
    },
  },
  {
    id: 'armor-piercing',
    name: 'Armor-Piercing Rounds',
    description: '+2 pierce and +20% crit damage — punch through and punish.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 150,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.pierce += 2;
      mods.critDamageMult += 0.2;
    },
  },
  {
    id: 'high-velocity',
    name: 'High-Velocity Loads',
    description: '+20% range and +10% damage per level.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 140,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.rangeMult += 0.2 * level;
      mods.damageMult += 0.1 * level;
    },
  },
  {
    id: 'executioner-protocol',
    name: 'Executioner Protocol',
    description: 'KEYSTONE: +25% crit chance AND +70% crit damage — build a one-shot machine.',
    branch: 'arsenal',
    rarity: 'legendary',
    cost: 440,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.critChanceAdd += 0.25;
      mods.critDamageMult += 0.7;
    },
  },
  {
    id: 'frag-pattern',
    name: 'Frag Pattern',
    description: 'GRENADE: +25% grenade damage and +0.5 blast radius per level.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.grenadeDamageMult += 0.25 * level;
      mods.grenadeRadiusAdd += 0.5 * level;
    },
  },
  {
    id: 'bandolier',
    name: 'Bandolier',
    description: 'GRENADE: throw 15% faster per level — keep the lobs coming.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.grenadeCdMult *= Math.pow(0.85, level);
    },
  },
  // ── Mechanic seeds (Batch 2) — the tree should grant BEHAVIORS, not just stats ──
  {
    id: 'field-shrapnel',
    name: 'Field Shrapnel',
    description: 'Kills splinter a small shockwave into the pack around the corpse.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 230,
    maxLevel: 2,
    apply: (_p, level, _mods, effects) => {
      effects.on('kill', (c) => c.dealArea(c.x, c.z, 2.2, 4 + 3 * level));
    },
  },
  {
    id: 'marksmans-eye',
    name: "Marksman's Eye",
    description: '+7% crit chance per level while the nearest enemy is kept at distance.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 180,
    maxLevel: 2,
    apply: (_p, level, _mods, effects) => {
      const add = 0.07 * level;
      effects.addConditional((c) => (c.nearestDist > 9 ? { critAdd: add } : {}));
    },
  },
  {
    id: 'executioners-clause',
    name: "Executioner's Clause",
    description: 'KEYSTONE: crit chance climbs as the field thins — up to +40% finishing a wave.',
    branch: 'arsenal',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      // Smooth finisher (was a dead "≤3 enemies" gate): 0 at 10+ enemies → +40% as
      // the wave empties. Real varying uptime, not an almost-never threshold.
      effects.addConditional((c) => ({
        critAdd: Math.max(0, (10 - c.enemiesOnScreen) / 10) * 0.4,
      }));
    },
  },
  {
    id: 'incendiary-doctrine',
    name: 'Incendiary Doctrine',
    description: 'Start every run with burning rounds — hits set enemies alight (scaling DoT).',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 220,
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      // Seeds a STATUS build from the tree (dotCoef → hit-scaled burn, like the
      // Incendiary Rounds draft card). Opens the burn/reaction lane from run start.
      effects.on('hit', (c) => c.applyStatus(c.targetIndex, 'burn', { duration: 3, dotCoef: 0.5 }));
    },
  },
  {
    id: 'apex-munitions',
    name: 'Apex Munitions',
    description:
      'KEYSTONE: every critical hit DETONATES a blast scaled to the hit — crits become bombs.',
    branch: 'arsenal',
    rarity: 'legendary',
    cost: 520, // marquee crit→AoE keystone — ties the crit and explosive lanes together
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      effects.on('crit', (c) => {
        if (c.hitDamage > 0) c.dealArea(c.x, c.z, 3, c.hitDamage * 0.7);
      });
    },
  },
];
