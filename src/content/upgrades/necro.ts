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
      'UNLOCK the Gravedigger: slain enemies gain a 7% chance to RISE as a pet that fights for you, then decays.',
    tags: ['necro', 'summon'],
    rarity: 'rare',
    // One-time OPENER (maxLevel 1) — it unlocks the build, then leaves the pool so
    // it never sits next to Mass Grave reading like a duplicate. Mass Grave is the
    // repeatable scaler (raise chance + pet strength).
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 5,
    grantsTags: ['necro'],
    apply: ({ player }) => {
      player.necroChance = Math.min(0.3, player.necroChance + 0.07);
    },
  },
  {
    id: 'mass-grave',
    name: 'Mass Grave',
    description: '+4% raise chance per level AND your pets claw harder — grow a standing horde.',
    tags: ['necro', 'summon'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 4,
    synergyWeight: 6,
    grantsTags: ['necro'],
    requiresAnyTags: ['necro'], // only after the Gravedigger is unlocked
    apply: ({ player }) => {
      // INCREMENTAL: +4% raise chance per level on top of the 7% opener, capped 0.32 —
      // a support layer that grows over many picks, never an instant screen-clearing
      // wall of pets (the glory-tree-explodes problem). Pet POWER scales it too.
      player.necroChance = Math.min(0.32, player.necroChance + 0.04);
      player.necroPower += 0.18;
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
      player.necroPower += 0.6;
      player.necroChance = Math.min(0.35, player.necroChance + 0.04);
    },
  },
];
