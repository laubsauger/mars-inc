// Permanent (meta) upgrades bought with Martian Glory (T26, §9.5 Arsenal/Biology/
// Mobility). Data-driven; `apply` mutates the fresh run player. Owned levels live
// in PlayerProfile.permanentUpgrades and are applied at run start. The Glory Tree
// UI to buy them lands at T35 — this is the data + a minimal buy path.

import type { Player } from '../../sim/player';

export interface PermanentUpgrade {
  id: string;
  name: string;
  description: string;
  branch: 'arsenal' | 'biology' | 'mobility';
  cost: number; // Martian Glory per level
  maxLevel: number;
  apply: (player: Player, level: number) => void;
}

export const PERMANENT_UPGRADES: PermanentUpgrade[] = [
  {
    id: 'reinforced-plating',
    name: 'Reinforced Plating',
    description: '+20 starting max health per level.',
    branch: 'biology',
    cost: 90,
    maxLevel: 5,
    apply: (p, level) => {
      const bonus = 20 * level;
      p.maxHealth += bonus;
      p.health += bonus;
    },
  },
  {
    id: 'jump-start',
    name: 'Jump-Start Contract',
    description: '+1 sprint charge per level.',
    branch: 'mobility',
    cost: 140,
    maxLevel: 2,
    apply: (p, level) => {
      p.stats.sprintCharges += level;
      p.sprint.maxCharges += level;
      p.sprint.charges += level;
    },
  },
  // ── Mobility ──────────────────────────────────────────────────────────────
  {
    id: 'fleet-footed',
    name: 'Fleet-Footed Clause',
    description: '+5% base move speed per level.',
    branch: 'mobility',
    cost: 80,
    maxLevel: 4,
    apply: (p, level) => {
      p.stats.moveSpeed *= 1 + 0.05 * level;
    },
  },
  // ── Arsenal (unlock POSSIBILITIES over raw power, §9.5) ────────────────────
  {
    id: 'house-odds',
    name: 'House Odds',
    description: '+1 draft reroll each run per level.',
    branch: 'arsenal',
    cost: 110,
    maxLevel: 2,
    apply: (p, level) => {
      p.bonusRerolls += level;
    },
  },
  {
    id: 'blacklist-rights',
    name: 'Blacklist Rights',
    description: '+1 draft banish each run per level.',
    branch: 'arsenal',
    cost: 110,
    maxLevel: 2,
    apply: (p, level) => {
      p.bonusBanishes += level;
    },
  },
  {
    id: 'lucky-streak',
    name: 'Lucky Streak',
    description: 'Better odds of rare upgrades (+luck) per level.',
    branch: 'arsenal',
    cost: 130,
    maxLevel: 3,
    apply: (p, level) => {
      p.luck += level;
    },
  },
];

export function permanentById(id: string): PermanentUpgrade | undefined {
  return PERMANENT_UPGRADES.find((u) => u.id === id);
}
