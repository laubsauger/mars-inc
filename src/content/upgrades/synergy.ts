// Synergy upgrades (T-synergy). These ONLY appear once you've committed to a build
// (gated via `requiresAnyTags` on tags you already own), so picking a mechanic
// opens a follow-up that deepens it — "now that you have drones, here's a drone
// upgrade". They stack ON TOP of whatever the Glory Tree + earlier picks seeded
// (the mod layer is additive). Kept in their own registry so the synergy web grows
// independently of the base catalog.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const SYNERGY_UPGRADES: UpgradeDefinition[] = [
  {
    id: 'drone-battery',
    name: 'Drone Battery',
    description: '+1 companion drone. Build a real swarm once you own one.',
    tags: ['drone', 'summon'],
    rarity: 'rare',
    maxLevel: 4,
    baseWeight: 5,
    synergyWeight: 6,
    grantsTags: ['drone'],
    requiresAnyTags: ['drone'], // only after you have a drone
    apply: ({ player }) => {
      player.droneCount += 1;
    },
  },
  {
    id: 'fuel-air-charge',
    name: 'Fuel-Air Charge',
    description: 'Bigger blasts: +explosive radius and +15% damage. Lean into the booms.',
    tags: ['explosive', 'aoe', 'damage'],
    rarity: 'rare',
    maxLevel: 4,
    baseWeight: 5,
    synergyWeight: 6,
    grantsTags: ['explosive'],
    requiresAnyTags: ['explosive', 'aoe'], // only once you're an explosive build
    apply: ({ mods }) => {
      mods.blastRadius += 0.9;
      mods.damageMult += 0.15;
      mods.blastDamageMult = Math.min(1.1, mods.blastDamageMult + 0.2); // fuller splash payload
    },
  },
  {
    id: 'arc-cascade',
    name: 'Arc Cascade',
    description: '+1 chain arc and longer hops. Turn a spark into a storm.',
    tags: ['chain', 'aoe'],
    rarity: 'rare',
    maxLevel: 4,
    baseWeight: 5,
    synergyWeight: 6,
    grantsTags: ['chain'],
    requiresAnyTags: ['chain'], // only after you own chain lightning
    apply: ({ mods }) => {
      mods.chainChance = Math.min(1, mods.chainChance + 0.1); // also raises the arc proc
      mods.chainCount += 1;
      mods.chainRange += 1.5;
    },
  },
  {
    id: 'kinetic-rebound',
    name: 'Kinetic Rebound',
    description: '+1 ricochet bounce and longer reach. Spent shots keep hunting.',
    tags: ['ricochet', 'kinetic'],
    rarity: 'rare',
    maxLevel: 4,
    baseWeight: 5,
    synergyWeight: 6,
    grantsTags: ['ricochet'],
    requiresAnyTags: ['ricochet'], // only after you own a ricochet
    apply: ({ mods }) => {
      mods.ricochet += 1;
      mods.ricochetRange += 2.5;
      mods.ricochetRetain = Math.min(0.9, mods.ricochetRetain + 0.18); // bounces keep more punch
    },
  },
  {
    id: 'networked-munitions',
    name: 'Networked Munitions',
    description:
      'KEYSTONE: your drones inherit ALL your projectile mods — explosive, pierce, chain, ricochet, status-on-hit.',
    tags: ['drone', 'summon'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 7,
    grantsTags: ['drone'],
    requiresAnyTags: ['drone'], // only once you actually field drones
    apply: ({ player }) => {
      player.droneInheritMods = true;
    },
  },
];
