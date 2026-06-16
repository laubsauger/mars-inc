// Corpse / Overkill build family (T65, §V27/§V30). A primer→engine→converter→
// liability→catastrophe chain that TRANSFORMS the overkill mechanic: kills past
// 0 hp store energy in a body, and later cards make that body explode, fly,
// chain, or call down a meteor. Each card sets a flag on the player; the sim
// `CorpseSystem` reads them (all damage pipeline-routed, V3/V21).
//
// Build-aware (T51/V29): the engine/converter/liability/catastrophe are tag-gated
// behind owning `corpse`, so they only surface once the primer (Waste Not) is in
// the build — drafts branch into this family instead of offering dead cards.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const CORPSE_UPGRADES: UpgradeDefinition[] = [
  // PRIMER — create the resource: overkilled kills leave a corpse holding the
  // overkill. Alone it's just bodies; the engine gives them teeth.
  {
    id: 'waste-not',
    name: 'Waste Not',
    description: 'Overkill is stored in the corpse it kills.',
    tags: ['overkill', 'corpse', 'economy'],
    grantsTags: ['corpse'],
    rarity: 'uncommon',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ player }) => {
      player.corpseStore = true;
    },
  },
  // ENGINE — generate value: corpses detonate on a short fuse, blasting the
  // crowd for a chunk of the overkill banked in them.
  {
    id: 'violent-recycling',
    name: 'Violent Recycling',
    description: 'Stored corpses detonate — bigger overkill, bigger blast.',
    tags: ['overkill', 'corpse', 'explosive'],
    grantsTags: ['corpse'],
    requiresAnyTags: ['corpse'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 1,
    apply: ({ player }) => {
      player.corpseStore = true;
      player.corpseDetonate = true;
    },
  },
  // CONVERTER — transform delivery: instead of sitting, corpses LAUNCH at the
  // nearest enemy and detonate on arrival (a homing overkill bomb).
  {
    id: 'body-ballistics',
    name: 'Body Ballistics',
    description: 'Corpses launch at the nearest enemy before they blow.',
    tags: ['overkill', 'corpse', 'explosive'],
    grantsTags: ['corpse'],
    requiresAnyTags: ['corpse'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 1,
    apply: ({ player }) => {
      player.corpseStore = true;
      player.corpseBallistics = true;
    },
  },
  // LIABILITY (risk 2) — a detonation that lands seeds a fresh, decaying corpse →
  // a bounded chain reaction. The danger (V30): those blasts now SINGE you too if
  // you stand in them. Counterplay: read the fuse and move (the chain decays out).
  {
    id: 'chain-of-evidence',
    name: 'Chain of Evidence',
    description: 'Detonations spawn a smaller corpse — chains. Blasts hurt you too.',
    tags: ['overkill', 'corpse', 'explosive', 'risk'],
    grantsTags: ['corpse'],
    requiresAllTags: ['corpse'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 3,
    role: 'liability',
    riskTier: 2,
    apply: ({ player }) => {
      player.corpseStore = true;
      player.corpseDetonate = true;
      player.corpseChain = true;
      player.corpsePlayerDanger = true;
    },
  },
  // CATASTROPHE (risk 3) — a body fat with overkill calls a TELEGRAPHED orbital
  // meteor: a delayed, screen-shaking strike. Run-defining payoff on a crit-heavy
  // overkill build.
  {
    id: 'moonshot',
    name: 'Moonshot',
    description: 'A corpse heavy with overkill calls down an orbital meteor.',
    tags: ['overkill', 'corpse', 'orbital'],
    grantsTags: ['corpse'],
    requiresAllTags: ['corpse'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 3,
    role: 'catastrophe',
    riskTier: 3,
    apply: ({ player }) => {
      player.corpseStore = true;
      player.corpseDetonate = true;
      player.corpseMeteorThreshold = 120;
    },
  },
];
