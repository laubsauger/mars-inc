// Permanent (meta) upgrades — BIOLOGY branch. Data only; `apply` mutates the
// fresh-run player / mod layer / build engine. Split from index.ts by branch so
// content authors edit one branch without touching the others.

import type { PermanentUpgrade } from '../index';

export const BIOLOGY_PERMANENTS: PermanentUpgrade[] = [
  {
    id: 'reinforced-plating',
    name: 'Reinforced Plating',
    description: '+20 starting max health per level.',
    branch: 'biology',
    rarity: 'common',
    cost: 90,
    maxLevel: 5,
    apply: (p, level) => {
      const bonus = 20 * level;
      p.maxHealth += bonus;
      p.health += bonus;
    },
  },
  {
    id: 'organ-repo-insurance',
    name: 'Organ Repo Insurance',
    description: '+8 starting max health and +3% pickup radius per level.',
    branch: 'biology',
    rarity: 'common',
    cost: 75,
    maxLevel: 5,
    apply: (p, level) => {
      const hp = 8 * level;
      p.maxHealth += hp;
      p.health += hp;
      p.pickupRadius *= 1 + 0.03 * level;
    },
  },
  {
    id: 'magnetized-marrow',
    name: 'Magnetized Marrow',
    description: '+8% XP magnet radius per level.',
    branch: 'biology',
    rarity: 'common',
    cost: 95,
    maxLevel: 4,
    apply: (p, level) => {
      p.magnetRadius *= 1 + 0.08 * level;
    },
  },
  {
    id: 'adrenal-glut',
    name: 'Adrenal Glut',
    description: '+5% pickup radius per level — sweep drops without the detour.',
    branch: 'biology',
    rarity: 'common',
    cost: 80,
    maxLevel: 4,
    apply: (p, level) => {
      p.pickupRadius *= 1 + 0.05 * level;
    },
  },
  {
    id: 'thick-hide',
    name: 'Thick Hide',
    description: '+12% knockback resistance per level — the swarm shoves you less.',
    branch: 'biology',
    rarity: 'common',
    cost: 80,
    maxLevel: 4,
    apply: (p, level) => {
      p.stats.knockbackResistance += 0.12 * level;
    },
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    description: 'KEYSTONE: cheat death once per run — a lethal hit leaves you at 40% instead.',
    branch: 'biology',
    rarity: 'legendary',
    cost: 380,
    maxLevel: 1,
    apply: (p) => {
      p.reviveCharges += 1;
    },
  },
  {
    id: 'emergency-plating',
    name: 'Emergency Plating',
    description: 'Start with +1 shield charge per level — eats a hit, then recharges.',
    branch: 'biology',
    rarity: 'rare',
    cost: 200,
    maxLevel: 2,
    apply: (p, level) => {
      p.shieldMax += level;
      p.shieldCharges += level;
    },
  },
  {
    id: 'second-heart',
    name: 'Second Heart',
    description:
      'KEYSTONE: +1 shield charge that recharges far faster — a heartbeat between deaths.',
    branch: 'biology',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (p) => {
      p.shieldMax += 1;
      p.shieldCharges += 1;
      p.shieldRecharge = Math.min(p.shieldRecharge, 6);
    },
  },
  {
    id: 'toxic-bloom',
    name: 'Toxic Bloom',
    description: 'KEYSTONE: every kill bursts a toxic cloud, damaging the pack around the corpse.',
    branch: 'biology',
    rarity: 'legendary',
    cost: 400,
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      effects.on('kill', (c) => {
        c.dealArea(c.x, c.z, 3.5, 9);
      });
    },
  },
  {
    id: 'armor-lattice',
    name: 'Armor Lattice',
    description: '+25 max health and +10% knockback resistance per level.',
    branch: 'biology',
    rarity: 'rare',
    cost: 140,
    maxLevel: 2,
    apply: (p, level) => {
      const hp = 25 * level;
      p.maxHealth += hp;
      p.health += hp;
      p.stats.knockbackResistance += 0.1 * level;
    },
  },
  {
    id: 'juggernaut-frame',
    name: 'Juggernaut Frame',
    description: 'KEYSTONE: +120 max health and near-immunity to knockback — an immovable wall.',
    branch: 'biology',
    rarity: 'legendary',
    cost: 420,
    maxLevel: 1,
    apply: (p) => {
      p.maxHealth += 120;
      p.health += 120;
      p.stats.knockbackResistance = Math.min(0.95, p.stats.knockbackResistance + 0.5);
    },
  },
];
