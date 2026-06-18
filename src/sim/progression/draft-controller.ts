// Draft controller (T18/T41/T71). Owns the level-up → upgrade-draft lifecycle:
// the pending-level queue + flourish delay, the rolled options, per-run draft
// resources (reroll/banish/lock/tag-banish), the banished set, the lock, and the
// authoritative `upgradeLevels` map. Split out of World so the (large) draft state
// machine evolves independently of the sim orchestrator.
//
// World owns the controller and delegates its public API to it (so the UI surface
// is unchanged). The controller reaches back into the run via `DraftDeps`: stable
// refs (player/mods/effects/stats are reset in place, never reassigned) plus an
// `afterApply` hook for the world-side weapon-evolution check after a pick.

import type { Rng } from '../../core/rng';
import type { Player } from '../player';
import type { RunMods } from './mods';
import type { BuildEffects } from './effects';
import type { RunStats } from '../run';
import {
  type UpgradeDefinition,
  type UpgradeLevels,
  type DraftBoost,
  rollDraft,
  available,
  applyUpgrade,
  effectiveRarity,
  taken,
  isOffense,
  OFFENSE_TAGS,
  INTERESTING_RARITIES,
} from './upgrades';
import { previewUpgrade, type UpgradeChange } from './preview';
import { DRAFT_POOL } from './draft-pool';

const MILESTONE_EVERY = 3; // every Nth level → a draft guaranteed an "interesting" card
// (was 5 — early game felt repetitive; spice arrives sooner now)
const LEVELUP_DELAY = 0.55; // flourish window before the draft freezes the sim
const STARTING_REROLLS = 2; // per-run draft rerolls (T41)
const STARTING_BANISHES = 2; // per-run upgrade banishes (T41)
const STARTING_LOCKS = 1; // per-run draft locks — hold a card for the next draft (T71)
const STARTING_TAG_BANISHES = 1; // per-run tag banishes — drop a whole tag from the pool (T71)
const SKIP_HEAL_FRAC = 0.15; // skipping a draft heals this fraction of max HP
// Run-phase rarity lift (T44/V23): each boss kill adds this to the rarity `level`
// dial, so rarer cards grow more likely as the run graduates power tiers. Matches
// the wave-director's TIER_SIZE so a boss ≈ a full tier of rarity progress.
const BOSS_RARITY_TIER = 5;

/** Stable run refs + hooks the draft needs. player/mods/effects/stats are mutated
 *  in place across runs, so capturing them once is safe. */
export interface DraftDeps {
  player: Player;
  rng: Rng;
  mods: RunMods;
  effects: BuildEffects;
  stats: RunStats;
  /** Weapon-evolution check after an upgrade applies (World owns the weapon system). */
  afterApply: () => void;
}

export class DraftController {
  // ── Public state (read by the HUD/draft UI via World getters) ──────────────
  leveling = false;
  draft: UpgradeDefinition[] = [];
  draftId = 0; // bumps each time a draft opens / re-rolls (UI refresh key)
  pendingLevelUps = 0;
  rerollsLeft = STARTING_REROLLS;
  banishesLeft = STARTING_BANISHES;
  locksLeft = STARTING_LOCKS;
  tagBanishesLeft = STARTING_TAG_BANISHES;
  /** Authoritative owned-upgrade levels — the build's card record. */
  readonly upgradeLevels: UpgradeLevels = {};

  // ── Private machinery ──────────────────────────────────────────────────────
  private levelUpDelay = 0;
  private lockedId: string | null = null;
  private readonly banished = new Set<string>();

  constructor(private readonly deps: DraftDeps) {}

  /** Wipe to a fresh run. Call AFTER permanents apply (reads player bonus resources). */
  reset(): void {
    this.leveling = false;
    this.draft = [];
    this.pendingLevelUps = 0;
    this.levelUpDelay = 0;
    this.lockedId = null;
    this.banished.clear();
    for (const k of Object.keys(this.upgradeLevels)) delete this.upgradeLevels[k];
    const p = this.deps.player;
    this.rerollsLeft = STARTING_REROLLS + p.bonusRerolls;
    this.banishesLeft = STARTING_BANISHES + p.bonusBanishes;
    this.locksLeft = STARTING_LOCKS + p.bonusLocks;
    this.tagBanishesLeft = STARTING_TAG_BANISHES + p.bonusTagBanishes;
  }

  /** Queue N earned levels (XP or quest relic). Arms the pre-draft flourish window. */
  queueLevelUp(n: number): void {
    if (n <= 0) return;
    this.pendingLevelUps += n;
    if (!this.leveling) this.levelUpDelay = Math.max(this.levelUpDelay, LEVELUP_DELAY);
  }

  /** Tick the flourish delay; open the draft when it elapses (called each sim step). */
  update(dt: number): void {
    if (this.pendingLevelUps > 0 && !this.leveling) {
      if (this.levelUpDelay > 0) this.levelUpDelay -= dt;
      else this.openDraft();
    }
  }

  upgradeLevelOf(id: string): number {
    return this.upgradeLevels[id] ?? 0;
  }

  /** Per-option draft detail for the UI (T51): owned level, max level, and the
   *  numeric changes this pick would make to the live build. */
  upgradeInfo(def: UpgradeDefinition): {
    level: number;
    maxLevel: number;
    changes: UpgradeChange[];
  } {
    const owned = taken(this.upgradeLevels, def.id);
    const auto = previewUpgrade(def, this.deps.mods, this.deps.player, this.deps.effects);
    // Merge any DECLARED effect magnitudes (trigger cards the auto-preview can't read).
    const declared = def.previewStats?.(owned) ?? [];
    return { level: owned, maxLevel: def.maxLevel, changes: [...auto, ...declared] };
  }

  /** Id of the card currently held by Lock for the next draft (UI), or null. */
  get heldLock(): string | null {
    return this.lockedId;
  }

  /** Hold an offered card for the NEXT draft (T71). Bounded; one held at a time. */
  lockCard(index: number): void {
    if (!this.leveling || this.locksLeft <= 0 || this.lockedId !== null) return;
    const def = this.draft[index];
    if (!def) return;
    this.locksLeft -= 1;
    this.lockedId = def.id;
    this.draftId += 1; // re-push the draft slice so the UI shows the held lock
  }

  /** Banish EVERY card carrying `tag` from the run pool (T71). Refuses if it would
   *  shrink the pool below a full draft (V11). Deterministic (V16). */
  banishTag(tag: string): void {
    if (!this.leveling || this.tagBanishesLeft <= 0) return;
    const ids: string[] = [];
    for (const u of DRAFT_POOL) {
      if (u.tags.includes(tag) || u.grantsTags?.includes(tag)) ids.push(u.id);
    }
    if (ids.length === 0) return;
    const next = new Set(this.banished);
    for (const id of ids) next.add(id);
    // V11: never starve the draft — keep at least a full hand available.
    if (available(DRAFT_POOL, this.upgradeLevels, next).length < 3) return;
    this.tagBanishesLeft -= 1;
    for (const id of ids) this.banished.add(id);
    if (this.lockedId !== null && ids.includes(this.lockedId)) this.lockedId = null; // drop held
    const keep = new Set(this.draft.filter((d) => !ids.includes(d.id)).map((d) => d.id));
    this.draft = this.rollInto(keep);
    this.draftId += 1;
  }

  /** Re-roll the unlocked draft options (T41). `lockedIds` stay in place. */
  reroll(lockedIds: readonly string[] = []): void {
    if (!this.leveling || this.rerollsLeft <= 0) return;
    this.rerollsLeft -= 1;
    this.draft = this.rollInto(new Set(lockedIds));
    this.draftId += 1;
  }

  /** Banish an option from the run (never offered again) and replace it (T41). */
  banish(index: number): void {
    if (!this.leveling || this.banishesLeft <= 0) return;
    const def = this.draft[index];
    if (!def) return;
    this.banishesLeft -= 1;
    this.banished.add(def.id);
    const keep = new Set(this.draft.filter((_, i) => i !== index).map((d) => d.id));
    this.draft = this.rollInto(keep);
    this.draftId += 1;
  }

  /** Skip the draft for a heal instead of an upgrade (T41). */
  skipDraft(): void {
    if (!this.leveling) return;
    const p = this.deps.player;
    p.health = Math.min(p.maxHealth, p.health + p.maxHealth * SKIP_HEAL_FRAC);
    this.pendingLevelUps -= 1;
    this.draft = [];
    this.leveling = false;
    if (this.pendingLevelUps > 0) this.openDraft();
  }

  /** Apply the chosen draft option, then open the next draft or resume. */
  choose(index: number): void {
    if (!this.leveling) return;
    const def = this.draft[index];
    if (!def) return;
    this.applyAndReconcile(def);
    this.pendingLevelUps -= 1;
    this.draft = [];
    this.leveling = false;
    if (this.pendingLevelUps > 0) this.openDraft();
  }

  /** Apply an upgrade by id at +1 level (bypasses the draft — dev/grant). False if
   *  id unknown. Routes through the SAME applyUpgrade path as a real pick (V35). */
  grant(id: string): boolean {
    const def = DRAFT_POOL.find((u) => u.id === id);
    if (!def) return false;
    this.applyAndReconcile(def);
    return true;
  }

  /** Apply a pick + reconcile the LIVE draft-resource counters with any bonus the
   *  card just granted (draft-economy cards bump player.bonus* mid-run; the live
   *  counters were seeded once at reset, so we add the delta). */
  private applyAndReconcile(def: UpgradeDefinition): void {
    const p = this.deps.player;
    const r0 = p.bonusRerolls;
    const b0 = p.bonusBanishes;
    const l0 = p.bonusLocks;
    const t0 = p.bonusTagBanishes;
    applyUpgrade(
      def,
      { player: p, mods: this.deps.mods, effects: this.deps.effects },
      this.upgradeLevels,
    );
    this.rerollsLeft += p.bonusRerolls - r0;
    this.banishesLeft += p.bonusBanishes - b0;
    this.locksLeft += p.bonusLocks - l0;
    this.tagBanishesLeft += p.bonusTagBanishes - t0;
    this.deps.stats.upgradesTaken += 1; // run stat (V20)
    this.deps.afterApply(); // a pick may complete a weapon-evolution combo (T34, V18)
  }

  // ── Rolling internals ───────────────────────────────────────────────────────

  private openDraft(): void {
    this.draft = this.rollFresh();
    if (this.draft.length === 0) {
      // Pool exhausted — nothing to offer; consume pending level-ups.
      this.pendingLevelUps = 0;
      this.leveling = false;
      return;
    }
    this.draftId += 1;
    this.leveling = true;
  }

  /** Build a NEW level-up draft (T71), seeding a Lock-held card into slot 0 if it is
   *  still available, then rolling the rest. Consumes the held lock. */
  private rollFresh(): UpgradeDefinition[] {
    const forced: UpgradeDefinition[] = [];
    const exclude = new Set(this.banished);
    if (this.lockedId !== null) {
      const def = available(DRAFT_POOL, this.upgradeLevels, this.banished).find(
        (u) => u.id === this.lockedId,
      );
      if (def) {
        forced.push(def);
        exclude.add(def.id);
      }
      this.lockedId = null; // served (or no longer available) — released either way
    }
    const need = this.deps.player.draftSize - forced.length;
    const fresh =
      need > 0
        ? rollDraft(DRAFT_POOL, this.upgradeLevels, this.deps.rng, {
            count: need,
            level: this.deps.player.level,
            luck: this.deps.player.luck,
            banished: exclude,
            boost: this.foundationBoost(),
            tagBias: this.deps.player.draftTagBias,
            rarityBias: this.deps.player.draftRarityBias,
            rarityLevelBonus: this.rarityLevelBonus(),
          })
        : [];
    return this.ensureMilestone([...forced, ...fresh], exclude);
  }

  /** Milestone draft (T-variety): every Nth level, guarantee the hand holds at least
   *  one "interesting" (uncommon+) card — never an all-common parrot of +10% stats.
   *  If the rolled hand is all common, swap a common slot for a rare+ pick. */
  private ensureMilestone(hand: UpgradeDefinition[], exclude: Set<string>): UpgradeDefinition[] {
    const lvl = this.deps.player.level;
    if (lvl <= 0 || lvl % MILESTONE_EVERY !== 0) return hand;
    if (
      hand.some((d) =>
        INTERESTING_RARITIES.has(effectiveRarity(d, taken(this.upgradeLevels, d.id))),
      )
    )
      return hand; // already spicy (by the card's CURRENT tier)
    const shownIds = new Set(exclude);
    for (const d of hand) shownIds.add(d.id);
    const [pick] = rollDraft(DRAFT_POOL, this.upgradeLevels, this.deps.rng, {
      count: 1,
      level: lvl,
      luck: this.deps.player.luck,
      banished: shownIds,
      rarityFilter: INTERESTING_RARITIES,
      rarityLevelBonus: this.rarityLevelBonus(),
    });
    if (!pick) return hand; // pool had nothing rare+ left → keep the common hand (V11)
    // Replace a common slot (prefer the last, leave Lock-held slot 0 alone).
    const swapAt = hand
      .map((d) => effectiveRarity(d, taken(this.upgradeLevels, d.id)))
      .lastIndexOf('common');
    if (swapAt >= 0) hand[swapAt] = pick;
    else hand.push(pick);
    return hand;
  }

  /** Roll a draft keeping any locked entries (reroll/banish). `keep` = ids to hold. */
  private rollInto(keep: ReadonlySet<string>): UpgradeDefinition[] {
    const size = this.deps.player.draftSize;
    const kept = this.draft.filter((d) => keep.has(d.id));
    const need = size - kept.length;
    if (need <= 0) return kept.slice(0, size);
    const exclude = new Set(this.banished);
    for (const d of kept) exclude.add(d.id);
    const fresh = rollDraft(DRAFT_POOL, this.upgradeLevels, this.deps.rng, {
      count: need,
      level: this.deps.player.level,
      luck: this.deps.player.luck,
      banished: exclude,
      boost: this.foundationBoost(),
      tagBias: this.deps.player.draftTagBias,
      rarityBias: this.deps.player.draftRarityBias,
      rarityLevelBonus: this.rarityLevelBonus(),
    });
    return [...kept, ...fresh];
  }

  /** How many OFFENSIVE upgrades the build owns (kill-power foundations). */
  private offenseOwned(): number {
    let n = 0;
    for (const id in this.upgradeLevels) {
      if ((this.upgradeLevels[id] ?? 0) <= 0) continue;
      const def = DRAFT_POOL.find((u) => u.id === id);
      if (def && isOffense(def)) n++;
    }
    return n;
  }

  /** Foundation pity (T-pity): nudge the draft toward offence if the build has
   *  little/no kill power as the boss gearcheck looms. Soft — never forces a pick. */
  /** Run-phase rarity lift (T44/V23): bosses slain × the per-tier bonus, fed to the
   *  draft's rarity dial so rarer cards open up as the run advances power tiers. */
  private rarityLevelBonus(): number {
    return this.deps.stats.bossKills * BOSS_RARITY_TIER;
  }

  private foundationBoost(): DraftBoost | undefined {
    const offense = this.offenseOwned();
    const lvl = this.deps.player.level;
    let mult = 1;
    if (offense === 0 && lvl >= 2) {
      mult = Math.min(5, 1 + (lvl - 1) * 1.5); // L2 ×2 · L3 ×3.5 · L4+ ×5 (capped)
    } else if (offense === 1 && lvl >= 5) {
      mult = 1.6; // mild diversification nudge deeper in
    }
    return mult > 1 ? { tags: OFFENSE_TAGS, mult } : undefined;
  }
}
