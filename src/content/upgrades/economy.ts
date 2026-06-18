// Draft-ECONOMY cards (T-economy). The genre's least-used inspiration axis: upgrades
// that change the DRAFT itself rather than your combat stats — more options, better
// rarity odds, extra rerolls/banishes. They make the meta-game of building a build
// part of the build. All read player fields the draft controller already consumes
// live (draftSize / luck / draftRarityBias) or reconciles on pick (bonus rerolls/
// banishes), so no card needs sim access beyond {player}.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const ECONOMY_UPGRADES: UpgradeDefinition[] = [
  {
    id: 'open-bidding',
    name: 'Open Bidding',
    description:
      'See ONE more option on every future level-up draft — more to choose, more to build.',
    tags: ['economy', 'draft'],
    grantsTags: ['economy'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ player }) => {
      player.draftSize += 1;
    },
  },
  {
    id: 'second-opinion',
    name: 'Second Opinion',
    description: '+2 draft rerolls for the rest of the run — fish for the card your build wants.',
    tags: ['economy', 'draft'],
    grantsTags: ['economy'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 7,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ player }) => {
      player.bonusRerolls += 2;
    },
  },
  {
    id: 'blacklist-expansion',
    name: 'Blacklist Expansion',
    description: '+2 banishes — strike cards you never want out of the run pool for good.',
    tags: ['economy', 'draft'],
    grantsTags: ['economy'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 7,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ player }) => {
      player.bonusBanishes += 2;
    },
  },
  {
    id: 'premium-contracts',
    name: 'Premium Contracts',
    description:
      'Pull strings: rare cards appear ×1.4 as often and legendaries ×1.6 — chase the big payoffs.',
    tags: ['economy', 'luck'],
    grantsTags: ['economy'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ player }) => {
      const r = player.draftRarityBias;
      r.rare = (r.rare ?? 1) * 1.4;
      r.legendary = (r.legendary ?? 1) * 1.6;
    },
  },
  {
    id: 'negotiator',
    name: 'Negotiator',
    description:
      '+1 reroll AND +1 lock per level — re-roll a hand while keeping the one card you like.',
    tags: ['economy', 'draft'],
    grantsTags: ['economy'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ player }) => {
      player.bonusRerolls += 1;
      player.bonusLocks += 1;
    },
  },
  {
    id: 'connoisseur',
    name: 'Connoisseur',
    description:
      'KEYSTONE: +1 draft option, +1 luck, and legendaries appear ×1.8 as often — build exactly what you want.',
    tags: ['economy', 'luck', 'draft'],
    requiresAnyTags: ['economy'],
    grantsTags: ['economy'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 4,
    role: 'engine',
    riskTier: 0,
    apply: ({ player }) => {
      player.draftSize += 1;
      player.luck += 1;
      const r = player.draftRarityBias;
      r.legendary = (r.legendary ?? 1) * 1.8;
    },
  },
];
