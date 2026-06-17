// Permanent (meta) upgrades bought with Martian Glory (T26, §9.5 Arsenal/Biology/
// Mobility). Data-driven; `apply` mutates the fresh run player / mod layer / build
// engine. Owned levels live in PlayerProfile.permanentUpgrades and are applied at
// run start. The Glory Tree UI (MainMenu) browses & buys them.
//
// Philosophy (§9.5): the tree unlocks POSSIBILITIES, not just raw numbers. Common
// nodes are stat tune-ups; RARE nodes hand you a mechanic (pierce, chain, a shield,
// a nova); LEGENDARY keystones are build-defining and cap at one level — they sit at
// the branch tips so a fully-grown branch ends in an identity, not a stat pile.

import type { Player } from '../../sim/player';
import type { RunMods } from '../../sim/progression/mods';
import type { BuildEffects } from '../../sim/progression/effects';
import { MOBILITY_PERMANENTS } from './branches/mobility';
import { BIOLOGY_PERMANENTS } from './branches/biology';
import { ARSENAL_PERMANENTS } from './branches/arsenal';
import { COMMAND_PERMANENTS } from './branches/command';
import { ARENA_PERMANENTS } from './branches/arena';
import { INFAMY_PERMANENTS } from './branches/infamy';

export type GloryRarity = 'common' | 'rare' | 'legendary';

export interface PermanentUpgrade {
  id: string;
  name: string;
  description: string;
  branch: 'arsenal' | 'biology' | 'mobility' | 'command' | 'arena' | 'infamy';
  rarity: GloryRarity;
  cost: number; // Martian Glory per level
  maxLevel: number;
  // `mods`/`effects` let a node SEED a build (start with a status primer, a drone,
  // recoil tuning…), not just buff a player stat. Plain stat nodes ignore the extras.
  apply: (player: Player, level: number, mods: RunMods, effects: BuildEffects) => void;
}

export const PERMANENT_UPGRADES: PermanentUpgrade[] = [
  ...MOBILITY_PERMANENTS,
  ...BIOLOGY_PERMANENTS,
  ...ARSENAL_PERMANENTS,
  ...COMMAND_PERMANENTS,
  ...ARENA_PERMANENTS,
  ...INFAMY_PERMANENTS,
];

export function permanentById(id: string): PermanentUpgrade | undefined {
  return PERMANENT_UPGRADES.find((u) => u.id === id);
}

// Per-level cost curve (T35 economy). The first level (the UNLOCK) is discounted so
// early/level-1 investment is cheap; each further level of the same node escalates
// geometrically. Tip/endgame nodes already carry a higher base `cost`, so they stay
// the most expensive overall. `ownedLevel` = how many levels you already have (0 =
// buying the unlock).
const UNLOCK_DISCOUNT = 0.7; // level 1 costs 70% of the node's base
// Each further level escalates HARD (×1.8) so deep-stacking a node is a serious
// Glory sink — you can't cheaply max one branch and steamroll. Pairs with the
// tapered late-run Glory income (gloryFor) so progression stays earned, not snowballed.
const COST_GROWTH = 1.8;
export function levelCost(def: PermanentUpgrade, ownedLevel: number): number {
  return Math.round(def.cost * UNLOCK_DISCOUNT * Math.pow(COST_GROWTH, ownedLevel));
}
