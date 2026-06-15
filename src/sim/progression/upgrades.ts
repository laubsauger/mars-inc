// Upgrade definitions + draft (T18). Data-driven (§9.4). An upgrade is a pure
// description plus an `apply` that mutates the run context. Draft picks 3 valid
// options weighted by tag synergy, respecting maxLevel (V11: pool never empty,
// no invalid combo).

import type { RunMods } from './mods';
import type { Player } from '../player';
import type { Rng } from '../../core/rng';

export type Rarity = 'common' | 'uncommon' | 'rare';

export interface UpgradeContext {
  player: Player;
  mods: RunMods;
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  tags: readonly string[];
  rarity: Rarity;
  maxLevel: number;
  baseWeight: number;
  /** Extra weight per matching tag already taken (synergy bias, §9.4). */
  synergyWeight: number;
  apply: (ctx: UpgradeContext) => void;
}

/** Per-run level taken for each upgrade id. */
export type UpgradeLevels = Record<string, number>;

export function taken(levels: UpgradeLevels, id: string): number {
  return levels[id] ?? 0;
}

/** Upgrades still selectable (under maxLevel). */
export function available(
  registry: readonly UpgradeDefinition[],
  levels: UpgradeLevels,
): UpgradeDefinition[] {
  return registry.filter((u) => taken(levels, u.id) < u.maxLevel);
}

/** Count how many owned upgrades carry a given tag (for synergy weighting). */
function tagCounts(
  registry: readonly UpgradeDefinition[],
  levels: UpgradeLevels,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of registry) {
    const lvl = taken(levels, u.id);
    if (lvl === 0) continue;
    for (const t of u.tags) counts.set(t, (counts.get(t) ?? 0) + lvl);
  }
  return counts;
}

function weightOf(u: UpgradeDefinition, counts: Map<string, number>): number {
  let synergy = 0;
  for (const t of u.tags) synergy += counts.get(t) ?? 0;
  return u.baseWeight + synergy * u.synergyWeight;
}

/**
 * Roll `count` distinct upgrade options. Weighted by base + synergy. Guaranteed
 * non-empty as long as any upgrade remains under maxLevel (V11); returns fewer
 * than `count` only when the available pool is smaller.
 */
export function rollDraft(
  registry: readonly UpgradeDefinition[],
  levels: UpgradeLevels,
  rng: Rng,
  count = 3,
): UpgradeDefinition[] {
  const pool = available(registry, levels);
  const counts = tagCounts(registry, levels);
  const picks: UpgradeDefinition[] = [];

  while (picks.length < count && pool.length > 0) {
    let total = 0;
    for (const u of pool) total += weightOf(u, counts);
    let r = rng.next() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= weightOf(pool[i]!, counts);
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    picks.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return picks;
}

export function applyUpgrade(
  def: UpgradeDefinition,
  ctx: UpgradeContext,
  levels: UpgradeLevels,
): void {
  def.apply(ctx);
  levels[def.id] = taken(levels, def.id) + 1;
}
