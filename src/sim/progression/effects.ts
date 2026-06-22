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
  /** Active enemies within the "local" radius around the player (crowd cards read
   *  THIS, not the whole-arena count — the arena is always full, so arena-count crowd
   *  bonuses were unconditional; a radius makes them reward actually being mobbed). */
  enemiesNearby: number;
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
  /** Seconds the player has stood STILL (ramps while not moving, resets on move) —
   *  for "turret"/hold-position builds (Entrenchment). */
  stationarySec: number;
  /** True while the player is actively moving (input intent, not velocity). */
  moving: boolean;
  /** Seconds the player has been MOVING continuously (ramps while moving, resets when
   *  still) — the run-and-gun lane that REWARDS mobility (opposite of stationarySec). */
  movingSec: number;
  /** Kill-streak stacks (0..cap): +1 per kill, all lost if you go too long without one.
   *  Fuels aggressive "rage/frenzy" build cards — reward chaining kills, not turtling. */
  rageStacks: number;
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

// ---- Effect provenance (HUD strip) ----------------------------------------

/** Which upgrade registered an effect — captured ambiently when the upgrade's
 *  `apply` runs (see `applyUpgrade`), so the HUD can attribute every conditional
 *  / trigger to a card without each card hand-declaring metadata. */
export interface EffectSource {
  id: string;
  label: string;
  tags: readonly string[];
}

/** One build effect's LIVE status for the bottom-bar effect strip. A conditional
 *  lights up (`active`) when its condition is currently met; a trigger is always
 *  `active` (it's an equipped proc, not a continuous state). */
export interface EffectStatus {
  id: string;
  label: string;
  /** 'conditional' = situational buff with live on/off state; 'trigger' = event proc. */
  kind: 'conditional' | 'trigger';
  active: boolean;
  /** Short magnitude readout, e.g. "+35% dmg · +12% crit" (best-case), '' if unprobeable. */
  detail: string;
  /** Source upgrade tags → the HUD maps these to a glyph (presentation owns the icon). */
  tags: readonly string[];
}

/** Best-case probe: each field set to its most-generous value so a card's nominal
 *  magnitude shows on the strip even while dormant. Each conditional reads only the
 *  fields it cares about, so contradictory fields (moving AND stationary) coexist. */
export const PROBE_CTX: ConditionalCtx = {
  enemiesOnScreen: 99,
  enemiesNearby: 99,
  nearestDist: 0,
  firingRampSec: 12,
  hpFrac: 0.01,
  recentCrit: true,
  recoilActive: true,
  stationarySec: 12,
  moving: true,
  movingSec: 12,
  rageStacks: 12,
};

type CondOut = ReturnType<ConditionalModifier>;
function condActive(r: CondOut): boolean {
  return (r.damageMult ?? 1) > 1.001 || (r.critAdd ?? 0) > 0.001 || (r.fireRateMult ?? 1) > 1.001;
}
function condParts(r: CondOut): string[] {
  const out: string[] = [];
  if ((r.damageMult ?? 1) > 1.001) out.push(`+${Math.round((r.damageMult! - 1) * 100)}% dmg`);
  if ((r.critAdd ?? 0) > 0.001) out.push(`+${Math.round(r.critAdd! * 100)}% crit`);
  if ((r.fireRateMult ?? 1) > 1.001) out.push(`+${Math.round((r.fireRateMult! - 1) * 100)}% RoF`);
  return out;
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
  | 'waveClear' // every enemy on the field is dead (rare — full clear)
  | 'breather' // your LOCAL space cleared: no enemies within 7m (achievable via kiting)
  | 'hurt' // the player took damage THIS step (thorns / retaliate cards) — magnitude = dmg
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
  /** Firing weapon's proc coefficient for this event (T69, V32); on hit/crit it
   *  scales this ctx's status/magnitude. 1 for non-weapon events (kill/shot/reaction). */
  procCoef: number;
  /** Damage this hit dealt (T70, V33); lets on-hit DoTs scale as a fraction of the
   *  hit (`dotCoef`). 0 for non-hit events. */
  hitDamage: number;
  /** Proc-chain re-entry depth (V32); 0 = primary hit, bounded by `MAX_PROC_DEPTH`. */
  depth: number;
  /** Re-roll on-hit triggers on another enemy at a reduced (inherited) coefficient,
   *  depth-bounded (V32). Present only on hit/crit contexts. */
  procChain?: (index: number, crit: boolean) => void;
}

export type TriggerHandler = (ctx: TriggerCtx) => void;

/**
 * Mutable per-run effect registry. Upgrades add conditionals + trigger handlers;
 * the weapon/world systems evaluate/fire them. Reset in place on restart so the
 * world keeps its reference (matches RunMods/player reset pattern).
 */
interface ConditionalEntry {
  mod: ConditionalModifier;
  source?: EffectSource | undefined;
}
interface TriggerEntry {
  handler: TriggerHandler;
  source?: EffectSource | undefined;
}

export class BuildEffects {
  private conditionals: ConditionalEntry[] = [];
  private triggers = new Map<TriggerEvent, TriggerEntry[]>();
  /** Status reactions unlocked this run (T53). Off until an upgrade enables one. */
  private reactions = new Set<ReactionId>();
  /** Ambient attribution: set by `applyUpgrade` around a card's `apply` so every
   *  conditional/trigger it registers is tagged with that card (for the HUD strip).
   *  Undefined for un-attributed registrations (tests, sandbox preview) → hidden. */
  private source: EffectSource | undefined = undefined;

  /** Tag subsequent registrations with `src`; pair with `endSource()`. */
  beginSource(src: EffectSource): void {
    this.source = src;
  }
  endSource(): void {
    this.source = undefined;
  }

  addConditional(mod: ConditionalModifier): void {
    this.conditionals.push({ mod, source: this.source });
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
    const entry: TriggerEntry = { handler, source: this.source };
    const list = this.triggers.get(event);
    if (list) list.push(entry);
    else this.triggers.set(event, [entry]);
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
      const r = this.conditionals[i]!.mod(ctx);
      if (r.damageMult !== undefined) damageMult *= r.damageMult;
      if (r.critAdd !== undefined) critAdd += r.critAdd;
      if (r.fireRateMult !== undefined) fireRateMult *= r.fireRateMult;
    }
    return { damageMult, critAdd, fireRateMult };
  }

  /** Per-source LIVE status for the HUD effect strip (read-only). One chip per
   *  attributed upgrade: conditionals report on/off against `live`; magnitude shows
   *  the best-case `probe` so the readout is stable. Trigger-only sources are
   *  always-equipped procs. Insertion order = registration order (deterministic). */
  liveEffects(live: ConditionalCtx, probe: ConditionalCtx = PROBE_CTX): EffectStatus[] {
    interface Acc {
      src: EffectSource;
      hasCond: boolean;
      active: boolean;
      parts: Set<string>;
    }
    const byId = new Map<string, Acc>();
    const ensure = (s: EffectSource): Acc => {
      let a = byId.get(s.id);
      if (!a) {
        a = { src: s, hasCond: false, active: false, parts: new Set() };
        byId.set(s.id, a);
      }
      return a;
    };
    for (const c of this.conditionals) {
      if (!c.source) continue;
      const a = ensure(c.source);
      a.hasCond = true;
      if (condActive(c.mod(live))) a.active = true;
      for (const p of condParts(c.mod(probe))) a.parts.add(p);
    }
    for (const list of this.triggers.values()) {
      for (const t of list) if (t.source) ensure(t.source);
    }
    const out: EffectStatus[] = [];
    for (const a of byId.values()) {
      const kind = a.hasCond ? 'conditional' : 'trigger';
      out.push({
        id: a.src.id,
        label: a.src.label,
        kind,
        active: kind === 'trigger' ? true : a.active,
        detail: a.hasCond ? [...a.parts].join(' · ') : 'Proc',
        tags: a.src.tags,
      });
    }
    return out;
  }

  fire(event: TriggerEvent, ctx: TriggerCtx): void {
    const list = this.triggers.get(event);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i]!.handler(ctx);
  }

  reset(): void {
    this.conditionals.length = 0;
    this.triggers.clear();
    this.reactions.clear();
    this.source = undefined;
  }
}
