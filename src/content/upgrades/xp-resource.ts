// XP-as-resource build family (T58, §V27/§V30). Treats uncollected XP shards as
// an economy you grow, weaponize, cash in, or detonate. Each card sets a flag on
// the player; the `stepXpResource` sim system reads them (all damage pipeline-
// routed, V3/V21). Tag-gated behind owning `xp-econ` so the chain only surfaces
// once the primer is in the build (T51/V29).

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const XP_RESOURCE_UPGRADES: UpgradeDefinition[] = [
  // PRIMER — create the resource: loose shards appreciate the longer you let them
  // sit, so NOT vacuuming them up becomes a choice.
  {
    id: 'compound-interest',
    name: 'Compound Interest',
    description: 'Uncollected XP shards gain value while they sit.',
    tags: ['xp', 'economy', 'xp-econ'],
    grantsTags: ['xp-econ'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ player }) => {
      player.xpInterestRate += 0.12; // +12%/s while young (bounded by duration)
    },
  },
  // ENGINE — generate value: the shards orbiting you aren't just savings, they
  // zap whatever they touch. Fatter shards (from interest) hit harder.
  {
    id: 'magnetar-array',
    name: 'Magnetar Array',
    description: 'XP shards within 5.5m orbit you and shock enemies within 1m of each shard.',
    tags: ['xp', 'economy', 'xp-econ', 'energy'],
    grantsTags: ['xp-econ'],
    requiresAnyTags: ['xp-econ'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 1,
    apply: ({ player }) => {
      player.xpMagnetar = true;
    },
  },
  // CONVERTER — transform the resource: sprint LIQUIDATES loose shards into a
  // burst of damage. Spends the XP — a deliberate cash-out for a fight.
  {
    id: 'liquidation-event',
    name: 'Liquidation Event',
    description: 'Sprinting fires your loose XP shards as blasts (XP is spent).',
    tags: ['xp', 'economy', 'xp-econ', 'movement'],
    grantsTags: ['xp-econ'],
    requiresAnyTags: ['xp-econ'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 1,
    apply: ({ player }) => {
      player.xpLiquidation += 6; // shards cashed out per sprint
    },
  },
  // LIABILITY (risk 2) — leverage: interest runs hotter, but shards left too long
  // CRASH and bleed value. Telegraphed by age; collect before they sour (V30).
  {
    id: 'margin-call',
    name: 'Margin Call',
    description: 'Interest runs hotter — but shards left too long start to crash.',
    tags: ['xp', 'economy', 'xp-econ', 'risk'],
    grantsTags: ['xp-econ'],
    requiresAllTags: ['xp-econ'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 3,
    role: 'liability',
    riskTier: 2,
    apply: ({ player }) => {
      player.xpInterestRate += 0.1;
      player.xpMarginCall = true;
    },
  },
  // CATASTROPHE (risk 3) — overheat the market: hoard too many loose shards and
  // it all COLLAPSES — a huge AoE scaled by the hoard, then one fat refund pickup.
  {
    id: 'market-crash',
    name: 'Market Crash',
    description: 'Hoard too many loose shards → they collapse: huge blast + a refund.',
    tags: ['xp', 'economy', 'xp-econ', 'explosive'],
    grantsTags: ['xp-econ'],
    requiresAllTags: ['xp-econ'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 3,
    role: 'catastrophe',
    riskTier: 3,
    apply: ({ player }) => {
      player.xpMarketCrash = true;
    },
  },
];
