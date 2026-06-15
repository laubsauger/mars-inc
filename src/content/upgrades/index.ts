// Slice upgrade registry (T18). In-world names per docs/art-direction.md.
// Effects mutate the run mod layer / player stats — never content defs.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const UPGRADES: UpgradeDefinition[] = [
  {
    id: 'overcharge',
    name: 'Overcharge Clause',
    description: '+25% weapon damage.',
    tags: ['damage'],
    rarity: 'common',
    maxLevel: 5,
    baseWeight: 10,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.damageMult += 0.25;
    },
  },
  {
    id: 'rapid-billing',
    name: 'Rapid Billing',
    description: '+20% fire rate.',
    tags: ['fire-rate'],
    rarity: 'common',
    maxLevel: 5,
    baseWeight: 10,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.fireRateMult += 0.2;
    },
  },
  {
    id: 'split-shipment',
    name: 'Split Shipment',
    description: '+1 projectile per shot.',
    tags: ['multishot'],
    rarity: 'uncommon',
    maxLevel: 4,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.projectileCount += 1;
    },
  },
  {
    id: 'expedited-boots',
    name: 'Expedited Boots',
    description: '-15% sprint cooldown.',
    tags: ['movement'],
    rarity: 'common',
    maxLevel: 4,
    baseWeight: 8,
    synergyWeight: 2,
    apply: ({ player }) => {
      player.stats.sprintCooldown *= 0.85;
    },
  },
  {
    id: 'precision-audit',
    name: 'Precision Audit',
    description: '+8% critical chance.',
    tags: ['critical', 'damage'],
    rarity: 'uncommon',
    maxLevel: 4,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.critChanceAdd += 0.08;
    },
  },
  {
    id: 'haste-waiver',
    name: 'Haste Waiver',
    description: '+10% move speed.',
    tags: ['movement'],
    rarity: 'common',
    maxLevel: 4,
    baseWeight: 8,
    synergyWeight: 2,
    apply: ({ player }) => {
      player.stats.moveSpeed *= 1.1;
    },
  },
  {
    id: 'collections-magnet',
    name: 'Collections Magnet',
    description: '+40% pickup magnet range.',
    tags: ['economy'],
    rarity: 'common',
    maxLevel: 3,
    baseWeight: 7,
    synergyWeight: 1,
    apply: ({ player }) => {
      player.magnetRadius *= 1.4;
    },
  },
  {
    id: 'hazard-pay',
    name: 'Hazard Pay',
    description: '+25 max health, healed now.',
    tags: ['defense'],
    rarity: 'common',
    maxLevel: 4,
    baseWeight: 8,
    synergyWeight: 1,
    apply: ({ player }) => {
      player.maxHealth += 25;
      player.health = Math.min(player.maxHealth, player.health + 25);
    },
  },
  // Gated evolution: unlocked only after investing in multishot (§9.4 prereq).
  {
    id: 'shotgun-clause',
    name: 'Shotgun Clause',
    description: 'Wide barrage: +2 projectiles, tighter fan.',
    tags: ['multishot', 'damage'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 3,
    prerequisites: [{ id: 'split-shipment', minLevel: 2 }],
    apply: ({ mods }) => {
      mods.projectileCount += 2;
      mods.spreadArc *= 0.7;
    },
  },
  // Mutually-exclusive movement tradeoff vs. heavy-stance damage.
  {
    id: 'glass-runner',
    name: 'Glass Runner Waiver',
    description: '+25% move speed, but no health upgrades.',
    tags: ['movement'],
    rarity: 'uncommon',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 2,
    exclusions: [{ id: 'iron-stance' }],
    apply: ({ player }) => {
      player.stats.moveSpeed *= 1.25;
    },
  },
  {
    id: 'iron-stance',
    name: 'Iron Stance Mandate',
    description: '+50 max health, but no speed upgrades.',
    tags: ['defense'],
    rarity: 'uncommon',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 2,
    exclusions: [{ id: 'glass-runner' }],
    apply: ({ player }) => {
      player.maxHealth += 50;
      player.health += 50;
    },
  },
];
