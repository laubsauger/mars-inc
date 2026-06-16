// Build-depth engine (T38). The flat RunMods scalar layer (damage/fireRate/…) is
// only the static part of a build. This adds the two DYNAMIC pieces that make
// builds diverge:
//
//   • CONDITIONAL modifiers — evaluated each step against live combat context
//     (enemies on screen, nearest-target distance, sustained-fire ramp, player
//     HP fraction, recent crit). Produce a transient damage/crit bonus.
//   • TRIGGERS — handlers fired on combat events (kill/overkill/crit/hit/shot/
//     low-hp/sprint/wave-clear) that can deal area damage, spawn FX, etc.
//
// Both resolve through the centralized damage pipeline (V3) and are deterministic
// under the shared rng (V16, V21). Upgrades register conditionals/triggers via
// the UpgradeContext; the catalog (T40) and weapon families (T42) build on this.

import type { Player } from '../player';
import type { EnemyPool } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Rng } from '../../core/rng';
import type { FxQueue } from '../fx';
import type { StatusType, StatusOpts } from '../combat/status';
import type { ReactionId } from '../combat/reactions';

// ---- Conditionals ---------------------------------------------------------

export interface ConditionalCtx {
  /** Active enemies on the battlefield right now. */
  enemiesOnScreen: number;
  /** Distance to the nearest active enemy (Infinity if none). */
  nearestDist: number;
  /** Seconds of sustained combat (ramps while enemies present, resets when clear). */
  firingRampSec: number;
  /** Player health fraction 0..1. */
  hpFrac: number;
  /** True if a crit landed within the recent window. */
  recentCrit: boolean;
  /** True while recent recoil is moving the player (recoil builds, T55). */
  recoilActive: boolean;
}

/** Returns transient bonuses; combined multiplicatively/additively across all. */
export type ConditionalModifier = (ctx: ConditionalCtx) => {
  damageMult?: number;
  critAdd?: number;
  /** Transient fire-rate multiplier (ramp builds: Kinetic Overdraft, T55). */
  fireRateMult?: number;
};

export interface ConditionalResult {
  damageMult: number;
  critAdd: number;
  fireRateMult: number;
}

// ---- Triggers -------------------------------------------------------------

export type TriggerEvent =
  | 'hit'
  | 'crit'
  | 'kill'
  | 'overkill'
  | 'shot'
  | 'lowHp'
  | 'sprint'
  | 'waveClear'
  | 'reaction'; // a status reaction fired (T53 cross-upgrade hook)

export interface TriggerCtx {
  x: number;
  z: number;
  player: Player;
  enemies: EnemyPool;
  hash: SpatialHash;
  rng: Rng;
  fx: FxQueue;
  /** Enemy variant for kill/overkill events (0 otherwise). */
  variant: number;
  /** Damage of the event (e.g. overkill amount), 0 when not meaningful. */
  magnitude: number;
  /** Enemy pool index for hit/crit events (-1 when the enemy is gone, e.g. kill). */
  targetIndex: number;
  /** Pipeline-routed area damage (V3); returns health removed. */
  dealArea: (x: number, z: number, radius: number, amount: number) => number;
  /** Apply a status to an enemy index (T39). No-op for invalid indices. */
  applyStatus: (index: number, type: StatusType, opts: StatusOpts) => void;
}

export type TriggerHandler = (ctx: TriggerCtx) => void;

/**
 * Mutable per-run effect registry. Upgrades add conditionals + trigger handlers;
 * the weapon/world systems evaluate/fire them. Reset in place on restart so the
 * world keeps its reference (matches RunMods/player reset pattern).
 */
export class BuildEffects {
  private conditionals: ConditionalModifier[] = [];
  private triggers = new Map<TriggerEvent, TriggerHandler[]>();
  /** Status reactions unlocked this run (T53). Off until an upgrade enables one. */
  private reactions = new Set<ReactionId>();

  addConditional(mod: ConditionalModifier): void {
    this.conditionals.push(mod);
  }

  /** Enable a status reaction for this run (T53/T54 upgrade cards). */
  enableReaction(id: ReactionId): void {
    this.reactions.add(id);
  }

  /** The set of reactions currently active (read by the world's status step). */
  get enabledReactions(): ReadonlySet<ReactionId> {
    return this.reactions;
  }

  on(event: TriggerEvent, handler: TriggerHandler): void {
    const list = this.triggers.get(event);
    if (list) list.push(handler);
    else this.triggers.set(event, [handler]);
  }

  has(event: TriggerEvent): boolean {
    return (this.triggers.get(event)?.length ?? 0) > 0;
  }

  /** Combine all conditionals into one transient result (no per-call alloc beyond this). */
  evalConditionals(ctx: ConditionalCtx): ConditionalResult {
    let damageMult = 1;
    let critAdd = 0;
    let fireRateMult = 1;
    for (let i = 0; i < this.conditionals.length; i++) {
      const r = this.conditionals[i]!(ctx);
      if (r.damageMult !== undefined) damageMult *= r.damageMult;
      if (r.critAdd !== undefined) critAdd += r.critAdd;
      if (r.fireRateMult !== undefined) fireRateMult *= r.fireRateMult;
    }
    return { damageMult, critAdd, fireRateMult };
  }

  fire(event: TriggerEvent, ctx: TriggerCtx): void {
    const list = this.triggers.get(event);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i]!(ctx);
  }

  reset(): void {
    this.conditionals.length = 0;
    this.triggers.clear();
    this.reactions.clear();
  }
}
