// Gravedigger / necromancer upgrades (T-necro). A base card opens the build (slain
// enemies rise as pets that fight + decay); follow-ups gate on the `necro` tag to
// deepen it (more raises, tougher pets). Pets are a sim system (sim/combat/pets);
// these cards just set player.necroChance / necroPower. Stacks on the mod layer.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const NECRO_UPGRADES: UpgradeDefinition[] = [
  {
    id: 'gravediggers-pact',
    name: "Gravedigger's Pact",
    description:
      'Slain enemies have a 12% chance to RISE as a pet that fights for you, then decays.',
    tags: ['necro', 'summon'],
    rarity: 'rare',
    maxLevel: 4,
    baseWeight: 5,
    synergyWeight: 5,
    grantsTags: ['necro'],
    apply: ({ player }) => {
      player.necroChance = Math.min(0.6, player.necroChance + 0.12);
    },
  },
  {
    id: 'mass-grave',
    name: 'Mass Grave',
    description: '+10% raise chance and your pets claw harder. Build a standing horde.',
    tags: ['necro', 'summon'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 4,
    synergyWeight: 6,
    grantsTags: ['necro'],
    requiresAnyTags: ['necro'], // only after you can raise
    apply: ({ player }) => {
      player.necroChance = Math.min(0.6, player.necroChance + 0.1);
      player.necroPower += 0.25;
    },
  },
  {
    id: 'bone-lord',
    name: 'Bone Lord',
    description: 'KEYSTONE: risen pets are far tougher and deadlier — a real army of the dead.',
    tags: ['necro', 'summon'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 7,
    grantsTags: ['necro'],
    requiresAnyTags: ['necro'],
    apply: ({ player }) => {
      player.necroPower += 0.8;
      player.necroChance = Math.min(0.7, player.necroChance + 0.05);
    },
  },
];
