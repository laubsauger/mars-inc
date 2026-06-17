// Prestige nodes (T72, V31). Bought with RED DUST (minted by sacrificing the Glory
// tree). These break RULES rather than stack stats: lift node caps, cheapen deep
// trees, seed a run. Owned levels persist in `profile.prestige.nodes` and apply at
// run start (run-only effects) or fold into the Glory-tree economy (cap/inflation).

import type { Player } from '../sim/player';
import type { RunMods } from '../sim/progression/mods';
import type { BuildEffects } from '../sim/progression/effects';

export type PrestigeLevels = Record<string, number>;

export interface PrestigeNode {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly costRedDust: number; // per level
  readonly maxLevel: number;
  /** +max level granted to EVERY Glory-tree node per level (cap-lift, V34). */
  readonly capLift?: number;
  /** Raises the Labor-Costs free tier per level (a cheaper deep tree). */
  readonly inflationFreeBonus?: number;
  /** Run-start seed (rule/stat) per level — mutates the fresh-run player/mods/build. */
  readonly apply?: (player: Player, level: number, mods: RunMods, effects: BuildEffects) => void;
}

export const PRESTIGE_NODES: readonly PrestigeNode[] = [
  {
    id: 'labor-union',
    name: 'Labor Union',
    description: '+4 free permanent levels before Labor Costs inflation bites, per level.',
    costRedDust: 2,
    maxLevel: 3,
    inflationFreeBonus: 4,
  },
  {
    id: 'overcapacity',
    name: 'Overcapacity Writ',
    description: '+1 max level on EVERY Glory-tree node, per level.',
    costRedDust: 3,
    maxLevel: 2,
    capLift: 1,
  },
  {
    id: 'red-momentum',
    name: 'Red Momentum',
    description: 'Start every run with +6% weapon damage, per level.',
    costRedDust: 2,
    maxLevel: 4,
    apply: (_p, level, mods) => {
      mods.damageMult += 0.06 * level;
    },
  },
  {
    id: 'blood-startup',
    name: 'Blood Startup Capital',
    description: 'Start every run already carrying +25 max HP, per level.',
    costRedDust: 2,
    maxLevel: 3,
    apply: (p, level) => {
      p.maxHealth += 25 * level;
      p.health = p.maxHealth;
    },
  },
];

export function prestigeNodeById(id: string): PrestigeNode | undefined {
  return PRESTIGE_NODES.find((n) => n.id === id);
}

/** Extra max levels added to every Glory-tree node from owned cap-lift prestige nodes. */
export function prestigeCapLift(nodes: PrestigeLevels): number {
  let lift = 0;
  for (const n of PRESTIGE_NODES) if (n.capLift) lift += n.capLift * (nodes[n.id] ?? 0);
  return lift;
}

/** The effective Labor-Costs free tier (base + Labor Union bonuses). */
export function prestigeInflationFree(base: number, nodes: PrestigeLevels): number {
  let bonus = 0;
  for (const n of PRESTIGE_NODES) {
    if (n.inflationFreeBonus) bonus += n.inflationFreeBonus * (nodes[n.id] ?? 0);
  }
  return base + bonus;
}

/** Apply owned prestige-node run-start seeds to the fresh-run player/mods/build. */
export function applyPrestige(
  player: Player,
  nodes: PrestigeLevels,
  mods: RunMods,
  effects: BuildEffects,
): void {
  for (const n of PRESTIGE_NODES) {
    const lvl = nodes[n.id] ?? 0;
    if (lvl > 0 && n.apply) n.apply(player, lvl, mods, effects);
  }
}
