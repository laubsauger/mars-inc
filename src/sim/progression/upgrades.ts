// Upgrade definitions + draft (T18). Data-driven (§9.4). An upgrade is a pure
// description plus an `apply` that mutates the run context. Draft picks 3 valid
// options weighted by tag synergy, respecting maxLevel (V11: pool never empty,
// no invalid combo).

import type { RunMods } from './mods';
import type { BuildEffects } from './effects';
import type { Player } from '../player';
import type { Rng } from '../../core/rng';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'corrupted' | 'prototype';

export interface UpgradeContext {
  player: Player;
  mods: RunMods;
  /** Dynamic build engine (T38): register conditionals + triggers here. */
  effects: BuildEffects;
}

/** A gate on another upgrade: requires (or forbids) it at >= minLevel. */
export interface Requirement {
  id: string;
  minLevel?: number;
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
  /** Must ALL be satisfied before this can appear (§9.4 prerequisites). */
  prerequisites?: readonly Requirement[];
  /** If ANY is satisfied, this is excluded (mutually-exclusive builds). */
  exclusions?: readonly Requirement[];
  apply: (ctx: UpgradeContext) => void;
}

/** Per-run level taken for each upgrade id. */
export type UpgradeLevels = Record<string, number>;

export function taken(levels: UpgradeLevels, id: string): number {
  return levels[id] ?? 0;
}

function reqMet(levels: UpgradeLevels, r: Requirement): boolean {
  return taken(levels, r.id) >= (r.minLevel ?? 1);
}

/** Selectable = under maxLevel, prerequisites met, not excluded, not banished. */
export function available(
  registry: readonly UpgradeDefinition[],
  levels: UpgradeLevels,
  banished?: ReadonlySet<string>,
): UpgradeDefinition[] {
  return registry.filter((u) => {
    if (banished?.has(u.id)) return false;
    if (taken(levels, u.id) >= u.maxLevel) return false;
    if (u.prerequisites && !u.prerequisites.every((r) => reqMet(levels, r))) return false;
    if (u.exclusions && u.exclusions.some((r) => reqMet(levels, r))) return false;
    return true;
  });
}

// Rarity drives draft odds (T41). Base rate × a level/luck boost that lifts the
// rarer tiers as the run deepens — early picks are mostly common, late picks see
// legendaries/corrupted/prototypes far more often.
const RARITY_BASE: Record<Rarity, number> = {
  common: 1,
  uncommon: 0.6,
  rare: 0.3,
  corrupted: 0.14,
  prototype: 0.12,
  legendary: 0.08,
};
const RARITY_BOOST: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.2,
  rare: 0.5,
  corrupted: 0.8,
  prototype: 0.9,
  legendary: 1,
};

export function rarityWeight(rarity: Rarity, level: number, luck: number): number {
  const scale = 1 + (level * 0.035 + luck * 0.12) * RARITY_BOOST[rarity];
  return RARITY_BASE[rarity] * scale;
}

export interface DraftParams {
  count?: number;
  level?: number;
  luck?: number;
  banished?: ReadonlySet<string>;
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

function weightOf(
  u: UpgradeDefinition,
  counts: Map<string, number>,
  level: number,
  luck: number,
): number {
  let synergy = 0;
  for (const t of u.tags) synergy += counts.get(t) ?? 0;
  return (u.baseWeight + synergy * u.synergyWeight) * rarityWeight(u.rarity, level, luck);
}

/**
 * Roll `count` distinct upgrade options. Weighted by base + synergy + rarity
 * (scaled by run level + player luck, T41). Guaranteed non-empty as long as any
 * upgrade remains selectable (V11); returns fewer than `count` only when the
 * available pool is smaller.
 */
export function rollDraft(
  registry: readonly UpgradeDefinition[],
  levels: UpgradeLevels,
  rng: Rng,
  params: DraftParams = {},
): UpgradeDefinition[] {
  const count = params.count ?? 3;
  const level = params.level ?? 1;
  const luck = params.luck ?? 0;
  const pool = available(registry, levels, params.banished);
  const counts = tagCounts(registry, levels);
  const picks: UpgradeDefinition[] = [];

  while (picks.length < count && pool.length > 0) {
    let total = 0;
    for (const u of pool) total += weightOf(u, counts, level, luck);
    let r = rng.next() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= weightOf(pool[i]!, counts, level, luck);
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
