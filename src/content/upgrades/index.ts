// Slice upgrade registry (T18). In-world names per docs/art-direction.md.
// Effects mutate the run mod layer / player stats — never content defs.
// The deep catalog (T33/T40, all rarities) is appended from `./catalog`.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';
import { CATALOG_UPGRADES } from './catalog';
import { ARSENAL_UPGRADES } from './arsenal';

const BASE_UPGRADES: UpgradeDefinition[] = [
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
  {
    id: 'liability-waiver',
    name: 'Liability Waiver',
    description: 'Shots pierce +1 enemy.',
    tags: ['pierce'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.pierce += 1;
    },
  },
  {
    id: 'arc-garnishment',
    name: 'Arc Garnishment',
    description: 'Hits chain INSTANT lightning through nearby packed enemies (starts 2, +1/level).',
    tags: ['chain', 'energy'],
    rarity: 'rare',
    maxLevel: 4,
    baseWeight: 4,
    synergyWeight: 3,
    apply: ({ mods }) => {
      // First pick lands a real chain (2 jumps); later levels grow the reach.
      mods.chainCount = mods.chainCount === 0 ? 2 : mods.chainCount + 1;
      mods.chainRange += 0.6;
    },
  },
];

/** Full base draft catalog: starter set + deep multi-rarity catalog + arsenal
 *  expansion (T40 variety pass — triggers/conditionals/status/economy/risk). */
export const UPGRADES: UpgradeDefinition[] = [
  ...BASE_UPGRADES,
  ...CATALOG_UPGRADES,
  ...ARSENAL_UPGRADES,
];
