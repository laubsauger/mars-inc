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
import { INFLATION_FREE, laborInflation } from '../balance/prestige';

export type GloryRarity = 'common' | 'rare' | 'legendary';

/** Boss gate on a Glory-tree node (T47, V25): the node stays LOCKED until a boss
 *  unlock key is owned (its themed branch revealed) AND, optionally, enough mastery
 *  feats are earned vs a specific boss. Trophies/mastery GATE; Glory PAYS (V25). */
export interface PermanentGate {
  /** Required `unlocks[key]` (a T48 first-kill key, e.g. `tree:arsenal-foreman`). */
  unlock: string;
  /** Optional mastery threshold: ≥ this many feats earned vs `masteryBoss`. */
  masteryBoss?: string;
  masteryFeats?: number;
  /** Human label for the lock requirement (shown in the tree). */
  requirement: string;
}

export interface PermanentUpgrade {
  id: string;
  name: string;
  description: string;
  branch: 'arsenal' | 'biology' | 'mobility' | 'command' | 'arena' | 'infamy';
  rarity: GloryRarity;
  cost: number; // Martian Glory per level
  maxLevel: number;
  /** Boss-gated node (T47): hidden/locked until the gate is satisfied. */
  gate?: PermanentGate;
  // `mods`/`effects` let a node SEED a build (start with a status primer, a drone,
  // recoil tuning…), not just buff a player stat. Plain stat nodes ignore the extras.
  apply: (player: Player, level: number, mods: RunMods, effects: BuildEffects) => void;
}

/** Is a node's boss gate satisfied? (no gate → always). Trophies/mastery GATE, Glory
 *  PAYS (V25). Pure — reads the persisted unlocks + per-boss mastery feat sets. */
export function permanentGateMet(
  def: PermanentUpgrade,
  unlocks: Record<string, boolean>,
  mastery: Record<string, string[]>,
): boolean {
  const g = def.gate;
  if (!g) return true;
  if (!unlocks[g.unlock]) return false;
  if (g.masteryFeats && g.masteryBoss) {
    if ((mastery[g.masteryBoss]?.length ?? 0) < g.masteryFeats) return false;
  }
  return true;
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
// Each further level escalates HARD (×2.2) so deep-stacking ONE node is a serious
// Glory sink — you can't cheaply max a branch and steamroll. Pairs with the tapered
// late-run Glory income (gloryFor) so progression stays earned, not snowballed.
const COST_GROWTH = 1.7; // per-level cost step (was 2.2 — too steep; L4 was 10.6× base, now ~4.9×)
// Prices climb HARDER along the tree: a node's rarity (which tracks its depth — the
// cost-sorted layout pushes rare/legendary nodes outward) multiplies its cost, so the
// deeper you path the steeper each node gets. Pure in (def, level) → refund stays exact.
const RARITY_COST_MULT: Record<GloryRarity, number> = {
  common: 1,
  rare: 2.6, // layer-2 nodes — meaningfully steeper than the cheap common ring
  legendary: 3.4, // branch-tip keystones — a real, run-defining Glory commitment
};
// Global "Labor Costs" inflation (T72/V34): the more permanent levels you own, the
// pricier EVERY further node gets (bounded). `totalBought` = total owned levels across
// the tree; `inflationFree` = the surcharge-free tier (raised by the Labor Union
// prestige node). Defaults make this a no-op for callers that don't track the total.
export function levelCost(
  def: PermanentUpgrade,
  ownedLevel: number,
  totalBought = 0,
  inflationFree = INFLATION_FREE,
): number {
  return Math.round(
    def.cost *
      UNLOCK_DISCOUNT *
      RARITY_COST_MULT[def.rarity] *
      Math.pow(COST_GROWTH, ownedLevel) *
      laborInflation(totalBought, inflationFree),
  );
}
