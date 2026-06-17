// Permanent (meta) upgrades — ARENA branch. Data only; `apply` mutates the
// fresh-run player / mod layer / build engine. Split from index.ts by branch so
// content authors edit one branch without touching the others.

import type { PermanentUpgrade } from '../index';

export const ARENA_PERMANENTS: PermanentUpgrade[] = [
  {
    id: 'house-odds',
    name: 'House Odds',
    description: '+1 draft reroll each run per level.',
    branch: 'arena',
    rarity: 'common',
    cost: 110,
    maxLevel: 2,
    apply: (p, level) => {
      p.bonusRerolls += level;
    },
  },
  {
    id: 'blacklist-rights',
    name: 'Blacklist Rights',
    description: '+1 draft banish each run per level; at level 2, also +1 tag banish.',
    branch: 'arena',
    rarity: 'common',
    cost: 110,
    maxLevel: 2,
    apply: (p, level) => {
      p.bonusBanishes += level;
      // Tier 2 unlocks dropping a whole tag from the run pool (T71).
      p.bonusTagBanishes += Math.max(0, level - 1);
    },
  },
  {
    id: 'retainer-clause',
    name: 'Retainer Clause',
    description: '+1 draft lock each run per level — hold a card for the next level-up.',
    branch: 'arena',
    rarity: 'rare',
    cost: 130,
    maxLevel: 2,
    apply: (p, level) => {
      p.bonusLocks += level;
    },
  },
  {
    id: 'lucky-streak',
    name: 'Lucky Streak',
    description: 'Better odds of rare upgrades (+luck) per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 130,
    maxLevel: 3,
    apply: (p, level) => {
      p.luck += level;
    },
  },
  {
    id: 'sponsor-auditor',
    name: 'Sponsor Auditor',
    description: '+1 luck and +2% pickup radius per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 150,
    maxLevel: 3,
    apply: (p, level) => {
      p.luck += level;
      p.pickupRadius *= 1 + 0.02 * level;
    },
  },
  {
    id: 'wider-contracts',
    name: 'Wider Contracts',
    description:
      'RULE: every level-up offers +1 upgrade choice — more shots at the build you want.',
    branch: 'arena',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (p) => {
      p.draftSize += 1;
    },
  },
  {
    id: 'vendor-contacts',
    name: 'Vendor Contacts',
    description: '+6% pickup radius and +6% magnet per level — never miss a payout.',
    branch: 'arena',
    rarity: 'common',
    cost: 80,
    maxLevel: 4,
    apply: (p, level) => {
      p.pickupRadius *= 1 + 0.06 * level;
      p.magnetRadius *= 1 + 0.06 * level;
    },
  },
  {
    id: 'sponsorship-deal',
    name: 'Sponsorship Deal',
    description: 'ECONOMY: +12% Martian Glory earned from every run, per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 200,
    maxLevel: 3,
    apply: (p, level) => {
      p.gloryMult += 0.12 * level;
    },
  },
  {
    id: 'crowd-pleaser',
    name: 'Crowd-Pleaser',
    description: 'AMPLIFY: +2 luck — the crowd loves a rare contract.',
    branch: 'arena',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (p, level) => {
      p.luck += 2 * level;
    },
  },
  {
    id: 'high-roller',
    name: 'High Roller',
    description: 'RULE: +50% Glory earned, but you start every run with 25% less health.',
    branch: 'arena',
    rarity: 'legendary',
    cost: 340,
    maxLevel: 1,
    apply: (p) => {
      p.gloryMult += 0.5;
      p.maxHealth = Math.max(1, Math.round(p.maxHealth * 0.75));
      p.health = Math.min(p.health, p.maxHealth);
    },
  },
  {
    id: 'market-maker',
    name: 'Market Maker',
    description: 'ECONOMY: +12% Martian Glory earned per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 170,
    maxLevel: 2,
    apply: (p, level) => {
      p.gloryMult += 0.12 * level;
    },
  },
  {
    id: 'windfall',
    name: 'Windfall',
    description: '+1 luck and +8% pickup radius per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 130,
    maxLevel: 2,
    apply: (p, level) => {
      p.luck += level;
      p.pickupRadius *= 1 + 0.08 * level;
    },
  },
  {
    id: 'vip-access',
    name: 'VIP Access',
    description: 'KEYSTONE: +30% Glory, +2 luck, AND +1 draft option — the whole meta, upgraded.',
    branch: 'arena',
    rarity: 'legendary',
    cost: 420,
    maxLevel: 1,
    apply: (p) => {
      p.gloryMult += 0.3;
      p.luck += 2;
      p.draftSize += 1;
    },
  },
  {
    id: 'pocket-artillery',
    name: 'Pocket Artillery',
    description: 'GRENADE: +30% grenade damage and +30% knockback per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 170,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.grenadeDamageMult += 0.3 * level;
      mods.grenadeKnockbackMult += 0.3 * level;
    },
  },
];
