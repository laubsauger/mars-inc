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
    id: 'premium-contracts',
    name: 'Premium Contracts',
    description:
      'KEYSTONE: rare cards appear ×1.6 and legendary ×1.5 as often — quality, not quantity.',
    branch: 'arena',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (p) => {
      // Better DRAFT QUALITY (rarer cards) instead of MORE cards on screen — a +1
      // choice every level snowballs the build; nudging rarity odds keeps the 3-card
      // decision tense but richer.
      p.draftRarityBias['rare'] = (p.draftRarityBias['rare'] ?? 1) * 1.6;
      p.draftRarityBias['legendary'] = (p.draftRarityBias['legendary'] ?? 1) * 1.5;
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
    description: 'KEYSTONE: +30% Glory, +3 luck, and rare cards appear ×1.4 as often.',
    branch: 'arena',
    rarity: 'legendary',
    cost: 420,
    maxLevel: 1,
    apply: (p) => {
      p.gloryMult += 0.3;
      p.luck += 3;
      p.draftRarityBias['rare'] = (p.draftRarityBias['rare'] ?? 1) * 1.4;
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
  // ── SPECIALIST CONTRACTS (draft-shaping) — the clever progression: these don't
  //    grant any effect, they STEER WHICH CARDS the draft offers, so you can commit
  //    to an archetype across runs and actually assemble it. Each tag's draft weight
  //    ×1.8 per level. They inform/synergize a build instead of copying a card. ──
  {
    id: 'demolition-license',
    name: 'Demolition License',
    description: 'DRAFT BIAS: explosive & AoE cards are offered ×1.8 more often per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (p, level) => {
      const m = Math.pow(1.8, level);
      p.draftTagBias['explosive'] = (p.draftTagBias['explosive'] ?? 1) * m;
      p.draftTagBias['aoe'] = (p.draftTagBias['aoe'] ?? 1) * m;
    },
  },
  {
    id: 'hazmat-contract',
    name: 'Hazmat Contract',
    description:
      'DRAFT BIAS: status/DoT cards (burn, chill, shock, corrode, bleed) ×1.8 more often per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (p, level) => {
      const m = Math.pow(1.8, level);
      for (const t of ['status', 'burn', 'chill', 'shock', 'corrode', 'bleed']) {
        p.draftTagBias[t] = (p.draftTagBias[t] ?? 1) * m;
      }
    },
  },
  {
    id: 'marksman-contract',
    name: 'Marksman Contract',
    description: 'DRAFT BIAS: crit & precision cards are offered ×1.8 more often per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (p, level) => {
      const m = Math.pow(1.8, level);
      p.draftTagBias['crit'] = (p.draftTagBias['crit'] ?? 1) * m;
      p.draftTagBias['precision'] = (p.draftTagBias['precision'] ?? 1) * m;
    },
  },
  {
    id: 'kennel-contract',
    name: 'Kennel Contract',
    description: 'DRAFT BIAS: drone & summon cards are offered ×1.8 more often per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (p, level) => {
      const m = Math.pow(1.8, level);
      p.draftTagBias['drone'] = (p.draftTagBias['drone'] ?? 1) * m;
      p.draftTagBias['summon'] = (p.draftTagBias['summon'] ?? 1) * m;
    },
  },
  {
    id: 'specialist-mandate',
    name: 'Specialist Mandate',
    description:
      'KEYSTONE: doubles the pull of EVERY draft-bias contract you own — go all-in on a specialty.',
    branch: 'arena',
    rarity: 'legendary',
    cost: 420,
    maxLevel: 1,
    apply: (p) => {
      // Square-ish amplifier: re-multiply each already-biased tag so a committed
      // specialist's chosen archetype dominates their offered cards.
      for (const t of Object.keys(p.draftTagBias)) {
        p.draftTagBias[t] = (p.draftTagBias[t] ?? 1) * 1.6;
      }
    },
  },
  // ── RARITY-ODDS nodes — fine-grained draft-quality control (vs all-tiers `luck`). ──
  {
    id: 'connoisseur',
    name: 'Connoisseur',
    description: 'Uncommon cards appear ×1.25 and rare ×1.2 as often per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 160,
    maxLevel: 2,
    apply: (p, level) => {
      p.draftRarityBias['uncommon'] = (p.draftRarityBias['uncommon'] ?? 1) * (1 + 0.25 * level);
      p.draftRarityBias['rare'] = (p.draftRarityBias['rare'] ?? 1) * (1 + 0.2 * level);
    },
  },
  {
    id: 'all-or-nothing-contract',
    name: 'All-or-Nothing Contract',
    description:
      'KEYSTONE GAMBLE: legendary cards appear ×2.2 as often — but commons appear ×0.4 as often.',
    branch: 'arena',
    rarity: 'legendary',
    cost: 400,
    maxLevel: 1,
    apply: (p) => {
      // The opposing choice to Premium Contracts: high-variance. You see far more
      // legendaries but lose the safe common filler — feast or famine drafts.
      p.draftRarityBias['legendary'] = (p.draftRarityBias['legendary'] ?? 1) * 2.2;
      p.draftRarityBias['common'] = (p.draftRarityBias['common'] ?? 1) * 0.4;
    },
  },
];
