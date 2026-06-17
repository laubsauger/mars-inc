// Upgrade definitions + draft (T18). Data-driven (§9.4). An upgrade is a pure
// description plus an `apply` that mutates the run context. Draft picks 3 valid
// options weighted by tag synergy, respecting maxLevel (V11: pool never empty,
// no invalid combo).

import type { RunMods } from './mods';
import type { BuildEffects } from './effects';
import type { Player } from '../player';
import type { Rng } from '../../core/rng';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'corrupted' | 'prototype';

/** 0 safe … 3 run-defining catastrophe (drives risk weighting + UI tint, T51). */
export type RiskTier = 0 | 1 | 2 | 3;

/** Where a card sits in a build machine (§T51-68 spine). */
export type BuildRole = 'primer' | 'engine' | 'converter' | 'liability' | 'catastrophe';

/** Build-aware appearance odds: multiply weight when the player owns the listed
 *  build-identity tags (own = any taken upgrade lists it in tags|grantsTags). */
export interface UpgradeWeightRule {
  whenTags: readonly string[];
  /** true → require ALL listed tags owned; default/false → ANY. */
  all?: boolean;
  multiplier: number;
}

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

  // ── Build-machine model (T51, §V27/V29). All optional — a plain stat card
  //    omits them and behaves exactly as before. ──────────────────────────────
  /** Build-identity tags this card CONTRIBUTES once taken (vs `tags` = its own
   *  category). Downstream cards gate/weight on owning these. */
  grantsTags?: readonly string[];
  /** Tag gates — "own a tag" = any taken upgrade lists it in tags|grantsTags. */
  requiresAllTags?: readonly string[];
  requiresAnyTags?: readonly string[];
  excludesTags?: readonly string[];
  /** Behavioral metadata for reactions/converters (stored; not a draft gate). */
  requiredStatusEffects?: readonly string[];
  consumesStatusEffects?: readonly string[];
  /** Unlock keys: card stays OUT of the pool until the key is unlocked (boss kill
   *  / skill-tree node). Enforced via the `gates` set passed to available(). */
  bossGate?: string;
  treeGate?: string;
  /** 0 safe … 3 catastrophe. */
  riskTier?: RiskTier;
  /** Primer/engine/converter/liability/catastrophe role in its build family. */
  role?: BuildRole;
  /** Build-aware odds adjustments (own-tag conditioned multipliers). */
  weightRules?: readonly UpgradeWeightRule[];

  /** Declared effect magnitudes for the card preview (T-clarity). The auto-preview
   *  can only diff tracked stats/conditionals — it can't see inside a TRIGGER closure
   *  (an on-kill nova, a sprint burst). A card with such effects declares the numbers
   *  here so the draft still shows a concrete NOW→AFTER per level. `ownedLevel` = how
   *  many levels already taken; return the cumulative before/after for the next pick. */
  previewStats?: (ownedLevel: number) => { label: string; from: string; to: string }[];

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

/** Build-identity tags currently OWNED → stack count (tags ∪ grantsTags across
 *  taken upgrades). The substrate for tag gates + build-aware weighting (T51). */
export function ownedTags(
  registry: readonly UpgradeDefinition[],
  levels: UpgradeLevels,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of registry) {
    const lvl = taken(levels, u.id);
    if (lvl === 0) continue;
    for (const t of u.tags) counts.set(t, (counts.get(t) ?? 0) + lvl);
    if (u.grantsTags) for (const t of u.grantsTags) counts.set(t, (counts.get(t) ?? 0) + lvl);
  }
  return counts;
}

/**
 * Selectable = under maxLevel, prerequisites met, not excluded, not banished,
 * tag gates satisfied, and any boss/tree unlock key present in `gates` (T51,
 * V29). `gates` holds unlocked boss/skill-tree keys; a gated card stays OUT
 * until its key is unlocked. Pass `owned` to avoid recomputing it per call.
 */
export function available(
  registry: readonly UpgradeDefinition[],
  levels: UpgradeLevels,
  banished?: ReadonlySet<string>,
  gates?: ReadonlySet<string>,
  owned: Map<string, number> = ownedTags(registry, levels),
): UpgradeDefinition[] {
  return registry.filter((u) => {
    if (banished?.has(u.id)) return false;
    if (taken(levels, u.id) >= u.maxLevel) return false;
    if (u.prerequisites && !u.prerequisites.every((r) => reqMet(levels, r))) return false;
    if (u.exclusions && u.exclusions.some((r) => reqMet(levels, r))) return false;
    // Unlock gates: locked until the boss/tree key is present.
    if (u.bossGate && !gates?.has(u.bossGate)) return false;
    if (u.treeGate && !gates?.has(u.treeGate)) return false;
    // Tag gates against the owned build identity.
    if (u.requiresAllTags && !u.requiresAllTags.every((t) => owned.has(t))) return false;
    if (u.requiresAnyTags && !u.requiresAnyTags.some((t) => owned.has(t))) return false;
    if (u.excludesTags && u.excludesTags.some((t) => owned.has(t))) return false;
    return true;
  });
}

// Rarity drives draft odds (T41). Base rate × a level/luck boost that lifts the
// rarer tiers as the run deepens — early picks are mostly common, late picks see
// legendaries/corrupted/prototypes far more often.
// Per-CARD base weight by rarity. These are tuned against the POOL COUNTS, not in a
// vacuum: there are ~43 rare / 34 uncommon cards vs only ~9 common, so a "fair-looking"
// 0.3 for rare made the rare TOTAL (43×0.3) outweigh commons (9×1) → drafts flooded
// with rare/uncommon. Bases pulled down so the per-tier TOTALS land ~common 47% /
// uncommon 32% / rare 18% / legendary+curse ~3% at base level (rarer tiers still climb
// with level + luck from this lower floor).
const RARITY_BASE: Record<Rarity, number> = {
  common: 1,
  uncommon: 0.26,
  rare: 0.18,
  corrupted: 0.1,
  prototype: 0.1,
  legendary: 0.06,
};
const RARITY_BOOST: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.2,
  rare: 0.5,
  corrupted: 0.8,
  prototype: 0.9,
  legendary: 1,
};

export function rarityWeight(
  rarity: Rarity,
  level: number,
  luck: number,
  rarityBias?: Record<string, number>,
): number {
  const scale = 1 + (level * 0.035 + luck * 0.12) * RARITY_BOOST[rarity];
  // Glory-Tree rarity nodes nudge a tier's odds (e.g. legendary ×1.4) — fine-grained
  // alongside luck (which lifts ALL rare+ tiers). Pure multiplier, opt-in.
  const bias = rarityBias?.[rarity] ?? 1;
  return RARITY_BASE[rarity] * scale * bias;
}

/** Tags that mean "this upgrade actually raises kill throughput" — the offensive
 *  FOUNDATION of a build. Used by the draft's foundation-pity nudge (T-pity): a
 *  player who's drafted only utility (move speed, range, defense) by the time the
 *  boss gearcheck looms gets these biased UP so they at least see a damage option.
 *  Soft odds only — never a guarantee (they can still pick poorly). */
export const OFFENSE_TAGS: ReadonlySet<string> = new Set([
  'damage',
  'fire-rate',
  'multishot',
  'crit',
  'aoe',
  'explosive',
  'chain',
  'ricochet',
  'drone',
  'summon',
]);

/** A draft-time weight nudge: cards carrying ANY `tags` get `mult`×'d. Kept generic
 *  so the same hook can serve other guided-draft moments later. */
export interface DraftBoost {
  tags: ReadonlySet<string>;
  mult: number;
}

/** True if the upgrade contributes offensive kill power (per {@link OFFENSE_TAGS}). */
export function isOffense(u: UpgradeDefinition): boolean {
  return u.tags.some((t) => OFFENSE_TAGS.has(t));
}

/** Rarities that count as an "interesting" milestone reward — anything past the
 *  plain common stat tune-up. A milestone draft guarantees ≥1 of these (T-variety). */
export const INTERESTING_RARITIES: ReadonlySet<Rarity> = new Set([
  'uncommon',
  'rare',
  'legendary',
  'corrupted',
  'prototype',
]);

export interface DraftParams {
  count?: number;
  level?: number;
  luck?: number;
  banished?: ReadonlySet<string>;
  /** Unlocked boss/skill-tree keys (gate boss/tree-locked cards into the pool). */
  gates?: ReadonlySet<string>;
  /** Optional weight nudge toward a tag set (foundation pity, T-pity). */
  boost?: DraftBoost | undefined;
  /** When set, only cards of these rarities are eligible (milestone "interesting"
   *  rolls draw from rare+ tiers). */
  rarityFilter?: ReadonlySet<Rarity> | undefined;
  /** Persistent draft-SHAPING bias from Glory-Tree "Specialist" nodes: tag → weight
   *  multiplier. A card's weight ×= the product of biases over its tags, so a meta
   *  node can steer the draft toward a build direction (T-draftshape). */
  tagBias?: Record<string, number> | undefined;
  /** Per-rarity odds multiplier from Glory-Tree rarity nodes (e.g. {legendary: 1.4}).
   *  Folded into rarityWeight — finer control than the all-tiers `luck` lever. */
  rarityBias?: Record<string, number> | undefined;
  /** Run-phase rarity lift (T44/V23): added to `level` ONLY for rarity weighting, so
   *  each boss kill makes rarer tiers more likely (the run graduates a power tier).
   *  Doesn't touch availability/prerequisites — `level` here is purely a rarity dial. */
  rarityLevelBonus?: number | undefined;
}

/** Build-aware weight: base + tag synergy (its own tags AND any requires*Tags it
 *  leans on, so a card you've set up appears more) + per-rule multipliers, all
 *  scaled by rarity×level×luck. `counts` = ownedTags (tags ∪ grantsTags). */
// Per-owned-level repeat damping (T-variety). A card you've already taken shows up
// LESS each subsequent draft, so the draft stops parroting the same "+10% damage"
// 15 times and surfaces fresh options — the archetype stays supported by SIBLING
// cards (tag synergy) rather than the one card you keep seeing. Not zero: a stack
// you're building can still re-appear, just not dominate.
const REPEAT_DAMP = 0.55;

function weightOf(
  u: UpgradeDefinition,
  counts: Map<string, number>,
  level: number,
  luck: number,
  ownedLevel: number,
  boost?: DraftBoost,
  tagBias?: Record<string, number>,
  rarityBias?: Record<string, number>,
): number {
  // Synergy is the SUM of owned tag counts, but capped so one deep archetype can't
  // run away and crowd the draft with a single family (the "all pets" problem).
  let synergy = 0;
  for (const t of u.tags) synergy += counts.get(t) ?? 0;
  if (u.requiresAnyTags) for (const t of u.requiresAnyTags) synergy += counts.get(t) ?? 0;
  if (u.requiresAllTags) for (const t of u.requiresAllTags) synergy += counts.get(t) ?? 0;
  synergy = Math.min(synergy, 6); // cap the snowball — synergy biases, never dominates
  let w =
    (u.baseWeight + synergy * u.synergyWeight) * rarityWeight(u.rarity, level, luck, rarityBias);
  // Damp the EXACT card by how many levels of it you already own → forces variety.
  if (ownedLevel > 0) w /= 1 + ownedLevel * REPEAT_DAMP;
  if (u.weightRules) {
    for (const rule of u.weightRules) {
      const hit = rule.all
        ? rule.whenTags.every((t) => counts.has(t))
        : rule.whenTags.some((t) => counts.has(t));
      if (hit) w *= rule.multiplier;
    }
  }
  // Foundation pity (T-pity): lift cards in the boosted tag set. Applied last so it
  // scales the fully-resolved weight.
  if (boost && u.tags.some((t) => boost.tags.has(t))) w *= boost.mult;
  // Draft-shaping bias (Specialist tree nodes): a card's weight ×= the product of
  // biases over its own tags ∪ grantsTags, so a permanent steers WHICH cards appear.
  if (tagBias) {
    for (const t of u.tags) w *= tagBias[t] ?? 1;
    if (u.grantsTags) for (const t of u.grantsTags) w *= tagBias[t] ?? 1;
  }
  return w;
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
  // `level` here is the RARITY dial only (weightOf → rarityWeight); the run-phase
  // bonus lifts rarer tiers per boss kill without affecting availability (V23/T44).
  const level = (params.level ?? 1) + (params.rarityLevelBonus ?? 0);
  const luck = params.luck ?? 0;
  const boost = params.boost;
  const tagBias = params.tagBias;
  const rarityBias = params.rarityBias;
  const counts = ownedTags(registry, levels);
  let pool = available(registry, levels, params.banished, params.gates, counts);
  if (params.rarityFilter) pool = pool.filter((u) => params.rarityFilter!.has(u.rarity));
  const picks: UpgradeDefinition[] = [];

  while (picks.length < count && pool.length > 0) {
    let total = 0;
    for (const u of pool)
      total += weightOf(u, counts, level, luck, taken(levels, u.id), boost, tagBias, rarityBias);
    let r = rng.next() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= weightOf(
        pool[i]!,
        counts,
        level,
        luck,
        taken(levels, pool[i]!.id),
        boost,
        tagBias,
        rarityBias,
      );
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
