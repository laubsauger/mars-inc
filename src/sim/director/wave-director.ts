// Budgeted wave director (T20). Replaces the placeholder spawner. Accrues threat
// points over run time and spends them on enemies through the gates with a
// telegraph (V9). The concurrent cap is a hard ceiling (V8: count never exceeds
// maxConcurrentEnemies, and the bank is clamped so it can't hoard).

import type { EnemyPool } from '../enemies';
import {
  RUST_MITE,
  DEBT_HOUND,
  SEVERANCE_LOBBER,
  REPO_MARSHAL,
  FORECLOSURE_MORTAR,
  RIOT_SHOTGUNNER,
  AUDIT_BRUTE,
  FROSTBITE_AUDITOR,
  LIABILITY_BLOB,
  PHASE_STALKER,
  LANCE_SENTINEL,
  GARGANTUAN,
  ENEMY_BY_VARIANT,
  SpawnKind,
  type EnemyType,
} from '../enemies';
import type { Rng } from '../../core/rng';
import type { FxQueue } from '../fx';
import { GATE_COUNT } from '../constants';
import { gateOuterPoint, interiorPoint, activeArena, activeDifficulty } from '../arena';
import { type ActDef, actFor } from '../../content/acts';
import type { BossDef } from '../../content/bosses';

const TELEGRAPH = 1.1; // gate-doors open + enemy walks in during this window (T37)
const TELE_TELEGRAPH = 1.0; // teleport materialize tell before the stalker is live (V9)
const TELE_AT = 60; // seconds → Phase Stalkers start blinking in
const TELE_PERIOD = 14; // base seconds between teleport waves (shrinks late)
const CHEAPEST = RUST_MITE.threat;
const HARD_CAP = 1200; // absolute ceiling regardless of curve (≤ pool capacity, V8)
// First-boss timing + the breather between sequenced bosses come from the ActDef
// (T75). BOSS_PERIOD only governs the ENDLESS Overrun mode (T50): once the act's
// final boss falls and the player opts into infinite, the director recurs the
// final-boss body on this period, scaling HP with each kill.
const BOSS_PERIOD = 70; // REAL seconds between recurring bosses in Overrun (infinite)
// Boss-creep cadence (T75 feedback): while a boss is up the normal wave rhythm is
// paused, replaced by this lighter reinforcement trickle so the fight still has
// adds without burying the boss. REAL seconds between trickles + group size.
const BOSS_CREEP_PERIOD = 5.5; // seconds between reinforcement trickles during a boss
const BOSS_CREEP_FIRST = 4; // delay before the FIRST trickle after the boss arrives
const BOSS_CREEP_GROUP = 2; // base enemies per trickle (a touch more late-run)
// The whole timeline is stretched by this factor: the director reads
// elapsed/TIMELINE_STRETCH for ALL escalation (budget, waves, patterns, variant
// intros, teleporters, the boss), so the run ramps with the SAME shape but spread
// out. Real first-boss time = BOSS_AT × TIMELINE_STRETCH = 150s. dt-based accrual
// stays real-time.
export const TIMELINE_STRETCH = 2;

// Wave rhythm (T33 pacing): spawn in clustered PULSES with breathers between —
// not a constant fill. Early waves are small groups from 2 of the 4 gates; the
// gap shrinks, groups grow, and more gates open as the run escalates.
const WAVE_DISPLAY_PERIOD = 8; // escalation-seconds per HUD "wave" tick (coarse readout)
const WAVE_GAP_START = 1.2; // seconds between waves at the open — snappy, ⊥ draggy
const WAVE_GAP_MIN = 0.45; // late-game floor — waves crash in fast deep in the run

// THEMED milestone waves (T-themes): scripted bursts that punctuate the run — a sudden
// swarm of mites, a pack of splitters, a gun line — so progress has texture and beats,
// not a smooth fill. Each fires ONCE when the escalation clock crosses `at` (same slowed
// time as every threshold). Spawned FREE (not from the bank) in a surround burst, scaled
// by the run's live hpScale. `act` selects which arena fields it (different feel per Act).
interface ThemedWave {
  at: number; // escalation seconds (pre-TIMELINE_STRETCH, like BOSS_AT)
  act: number; // which Act fields it (1 = Cold Vault, 2 = Rust Crown)
  type: EnemyType;
  count: number;
  label: string; // HUD banner shown when it lands
}
const THEMED_WAVES: readonly ThemedWave[] = [
  // ── ACT 1 — learn the beats: a swarm, a split, a pack, a wall. ──
  { at: 30, act: 1, type: RUST_MITE, count: 48, label: 'MITE SWARM' },
  { at: 70, act: 1, type: LIABILITY_BLOB, count: 6, label: 'SPLITTER PACK' },
  { at: 110, act: 1, type: DEBT_HOUND, count: 14, label: 'HOUND PACK' },
  { at: 150, act: 1, type: AUDIT_BRUTE, count: 5, label: 'BRUTE SQUAD' },
  // ── ACT 2 — bigger, sooner, deadlier comp. Opens on a HOUND BLITZ (fast melee
  //    pressure), NOT a mite swarm — a distinct first beat from Act 1. ──
  { at: 22, act: 2, type: DEBT_HOUND, count: 16, label: 'HOUND BLITZ' },
  { at: 55, act: 2, type: LIABILITY_BLOB, count: 10, label: 'SPLITTER BLOOM' },
  { at: 90, act: 2, type: REPO_MARSHAL, count: 8, label: 'GUN LINE' },
  { at: 125, act: 2, type: GARGANTUAN, count: 2, label: 'DEVOURERS INBOUND' },
  { at: 160, act: 2, type: AUDIT_BRUTE, count: 9, label: 'BRUTE WALL' },
];
const RECUR_INTERVAL = 38; // escalation s between RECURRING themed waves (post-schedule)

// Directional spawn patterns. Kiting makes WHERE enemies come from the real
// pressure dial: a wave from one gate is easy to lead away from; opposing gates
// pincer you; a clockwise sweep keeps rotating the threat; surround removes the
// escape. Patterns escalate from kiteable to overwhelming over the run.
const enum Pattern {
  Single = 0, // one gate — low pressure
  Adjacent = 1, // two neighbours — push from one side
  Opposing = 2, // two opposite gates — pincer, breaks straight-line kiting
  Sweep = 3, // single gate rotating clockwise each wave — rotating pressure
  Surround = 4, // all four gates — nowhere to run
}

export interface SpawnBudget {
  threatPoints: number; // accrual rate (points/sec) at this time
  maxConcurrentEnemies: number;
  eliteBudget: number;
  rangedBudget: number;
  hazardBudget: number;
}

// Adaptive composition (T21, §8.4, V12). Adapt the MIX and PACE to the player's
// build — never scale per-enemy stats to player damage (that makes upgrades feel
// fake). Bounded: pace and bias are hard-clamped so adaptation stays subtle.

export interface AdaptInput {
  damageMult: number;
  fireRateMult: number;
  projectileCount: number;
}

export interface Adaptation {
  pace: number; // threat-accrual multiplier
  houndBias: number; // added probability of fielding a tankier Debt Hound
}

const PACE_MIN = 0.8;
const PACE_MAX = 1.4;
const BIAS_MAX = 0.3;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const NEUTRAL_ADAPT: Adaptation = { pace: 1, houndBias: 0 };

/**
 * Pure mapping from build signals to a bounded adaptation. Overperforming
 * offense (more damage / fire rate) accelerates the schedule; area/multishot
 * builds meet a few more tanky targets instead of pure swarm. Always clamped.
 */
export function computeAdaptation(b: AdaptInput): Adaptation {
  const offense = (b.damageMult - 1) * 0.5 + (b.fireRateMult - 1) * 0.5;
  const pace = clamp(1 + offense * 0.4, PACE_MIN, PACE_MAX);
  const houndBias = clamp((b.projectileCount - 1) * 0.06, 0, BIAS_MAX);
  return { pace, houndBias };
}

/** Budget as a function of elapsed run seconds. Tunable curve (§8.3). */
export function budgetAt(elapsed: number): SpawnBudget {
  return {
    // Opening accrual must fund the first clustered pulses (waveGroup × gates),
    // else the bank trickle starves the waves and almost nothing spawns in the
    // first minute. Still gentle vs late game and monotonic (V8).
    // Numbers ramp HARD and keep ramping (accelerating) so late waves are a real
    // horde, not a trickle — the bank funds bigger bursts, the cap lets more stand.
    // Opening must feel LIVE (a draggy first minute reads as broken). Strong base +
    // brisk early ramp; the quadratic still carries the late horde.
    threatPoints: 8.0 + elapsed * 0.34 + elapsed * elapsed * 0.0016,
    // Count growth tamed vs the old low-HP-ocean quadratic, but a livelier floor so
    // the start isn't sparse. The power-tier sawtooth (capMul) does the thinning at
    // each HP step; HP escalation (hpScaleFor) carries the late difficulty.
    maxConcurrentEnemies: Math.min(
      HARD_CAP,
      Math.floor(10 + elapsed * 2.0 + elapsed * elapsed * 0.006),
    ),
    eliteBudget: Math.floor(elapsed / 30),
    rangedBudget: 0,
    hazardBudget: 0,
  };
}

export class WaveDirector {
  private bank = 0;
  private phase = 0;
  private boss = false; // at least one boss has spawned this run
  // Act runner (T75): the FINITE default path fields the act's bosses in order.
  // `bossStage` = index of the NEXT boss to spawn (== bosses.length once the final
  // is down). `bossArmTimer` is the REAL-seconds breather before the next boss
  // arms (set on a kill via advanceBossStage). `act` is this run's roster.
  private act: ActDef = actFor(1);
  private bossStage = 0;
  private bossArmTimer = 0;
  private forceNextBoss = false; // dev: spawn the next staged boss ASAP (T74)
  private bossCreepTimer = 0; // countdown to the next boss-creep reinforcement trickle
  /** Active boss phase (0-based), set by the world each step — orchestrates the
   *  boss-creep cadence (higher phase → more/faster reinforcements, T44/V42). */
  bossPhase = 0;
  // Overrun (T50): once the final boss falls, the player may opt into an ENDLESS
  // gauntlet — the director then recurs the final-boss body on BOSS_PERIOD with
  // escalating HP. `infinite` flips on via enterInfinite().
  private infinite = false;
  private bossesSpawned = 0; // how many bosses fielded → escalates HP in Overrun
  private waveTimer = 0.4; // first wave lands quickly — no slow empty open
  private sweepGate = 0; // clockwise cursor for the Sweep pattern
  private lastSentinelGate = -1; // last gate a sentinel used → spread them across gates
  /** Wave pulse counter (HUD): one per released gate-wave pulse, 1-based once the run
   *  starts. The director's rhythm is continuous threat, but each pulse IS a "wave". */
  waveNumber = 0;
  /** Themed milestone waves for THIS run's Act, sorted by `at`; `themeIdx` is the cursor. */
  private themes: ThemedWave[] = [];
  private themeIdx = 0;
  /** Once the AUTHORED schedule is spent, themed waves RECUR every RECUR_INTERVAL —
   *  cycling the act's pool with escalating counts — so the run stays punctuated past
   *  the last milestone (and past boss 1, since runs continue). `recurAt` = next fire
   *  time (∞ until the schedule exhausts), `recurCount` = how many have recurred. */
  private recurAt = Infinity;
  private recurCount = 0;
  /** Set to a themed wave's label the step it lands; HUD reads it for a banner, then it
   *  persists until the next theme (de-duped by the reader, mirrors `world.justEvolved`). */
  waveEvent: string | null = null;

  reset(): void {
    this.bank = 0;
    this.phase = 0;
    this.boss = false;
    this.bossStage = 0;
    this.bossArmTimer = 0;
    this.forceNextBoss = false;
    this.bossCreepTimer = BOSS_CREEP_FIRST;
    this.bossPhase = 0;
    this.infinite = false;
    this.bossesSpawned = 0;
    this.waveTimer = 0.4;
    this.sweepGate = 0;
    this.lastSentinelGate = -1;
    this.teleTimer = TELE_PERIOD;
    this.waveNumber = 0;
    // Build this run's themed schedule + boss roster for the active Act (set before
    // reset, T-Act/T75).
    const act = activeArena().act;
    this.act = actFor(act);
    this.themes = THEMED_WAVES.filter((t) => t.act === act).sort((a, b) => a.at - b.at);
    this.themeIdx = 0;
    this.recurAt = Infinity;
    this.recurCount = 0;
    this.waveEvent = null;
  }

  /** Current bank of unspent threat points (dev overlay). */
  get banked(): number {
    return this.bank;
  }

  /** Whether the boss milestone has fired this run (dev overlay / run state). */
  get bossSpawned(): boolean {
    return this.boss;
  }

  /** The boss about to be fielded next (Miniboss I/II or the Final), or null once
   *  the act's roster is exhausted in the finite path. The HUD reads it for the
   *  inbound-boss countdown label + tier styling (T78). */
  nextBossDef(): BossDef | null {
    if (this.infinite) return this.act.bosses[this.act.bosses.length - 1] ?? null;
    return this.bossStage < this.act.bosses.length ? this.act.bosses[this.bossStage]! : null;
  }

  /** The finite act roster is fully cleared (final boss down) and the run is NOT
   *  in endless Overrun → the world offers the conclusion (extract / Overrun). */
  actComplete(): boolean {
    return !this.infinite && this.bossStage >= this.act.bosses.length;
  }

  /** A boss fell: advance to the next stage + arm its breather. Called by the world
   *  on the boss-kill edge so spawn sequencing stays the director's authority. */
  advanceBossStage(): void {
    this.bossStage++;
    this.bossesSpawned++;
    this.bossArmTimer = this.infinite ? BOSS_PERIOD : this.act.interBossGap;
  }

  /** Opt into the endless Overrun gauntlet after the final boss (T50). The director
   *  then recurs the final-boss body on BOSS_PERIOD with escalating HP. */
  enterInfinite(): void {
    this.infinite = true;
    this.bossArmTimer = BOSS_PERIOD;
  }

  get isInfinite(): boolean {
    return this.infinite;
  }

  /** Dev (T74): field the next staged boss on the next step (still routes through
   *  the normal spawn + HP-scale path; ignored while a boss is already up). */
  forceBossNow(): void {
    this.bossArmTimer = 0;
    this.forceNextBoss = true;
  }

  private pickType(rng: Rng, elapsed: number, houndBias: number, act: number): EnemyType {
    // ACT 2 is a different FLOW, not Act 1 at higher HP: its roster cadence is shoved
    // ~70s forward (the mid-game composition lands from the OPEN — brutes, ranged,
    // splitters immediately) and specials are a bigger slice. So the Crown FEELS like
    // a different fight (heavy, mixed, deadly comp) while the difficulty TIER owns the
    // raw stat scaling. `eff` only shifts the MIX thresholds, never real run time.
    const eff = act >= 2 ? elapsed + 70 : elapsed;
    // Specials (elites + RANGED) are a small, slowly-growing SLICE of the swarm —
    // they spice the fodder, never replace it. ONE gate decides "special or
    // fodder" so their combined rate stays bounded. A second roll picks an unlocked
    // type; ranged classes unlock late + rare so Act 1's early game stays fair.
    const specialChance = Math.min(act >= 2 ? 0.45 : 0.3, Math.max(0, eff - 35) * 0.0035);
    if (rng.next() < specialChance) {
      const r = rng.next();
      // Melee Brute first; ranged classes ramp in much later and stay a minority.
      if (eff > 40 && r < 0.18) return LIABILITY_BLOB; // splitter (AoE check)
      if (eff > 50 && r < 0.3) return SEVERANCE_LOBBER; // lobbed AoE
      if (eff > 70 && r < 0.4) return RIOT_SHOTGUNNER; // close burst
      if (eff > 80 && r < 0.48) return FROSTBITE_AUDITOR; // cryo
      if (eff > 90 && r < 0.56) return REPO_MARSHAL; // gun
      if (eff > 110 && r < 0.62) return FORECLOSURE_MORTAR; // artillery
      if (eff > 65 && r < 0.67) return LANCE_SENTINEL; // laser turret — sprinkled in early so you learn it, stays rare
      if (eff > 120 && r < 0.72) return GARGANTUAN; // devourer — kill it before it snowballs
      return AUDIT_BRUTE; // the bulk of specials are the melee wall
    }
    // Fodder: Rust Mites + a growing minority of Debt Hounds. Hounds start mixing in
    // EARLY (eff > 10) so the open isn't a long mites-only slog, ramping to a healthy
    // ~45% share so the crowd has texture, not a sea of identical fodder.
    if (eff > 10) {
      const p = Math.min(0.45, (eff - 10) * 0.008 + 0.08 + houndBias);
      if (rng.next() < p) return DEBT_HOUND;
    }
    return RUST_MITE;
  }

  private spawnAtGate(pool: EnemyPool, rng: Rng, type: EnemyType, hpScale = 1): boolean {
    const gate = rng.int(0, GATE_COUNT - 1);
    // Appear OUTSIDE the gate; the telegraph walk carries them in (shape-aware).
    const p = gateOuterPoint(gate, rng.range(-1, 1), 2.5);
    return pool.spawn(type, p.x, p.z, TELEGRAPH, this.phase++, hpScale) >= 0;
  }

  /** Drive the boss SEQUENCE (T75). Finite path: spawn the next staged boss once
   *  its timer elapses and none is on the field; Overrun: recur the final body with
   *  escalating HP. HP scale folds the boss's own scale × the Act/difficulty mult. */
  private stepBoss(pool: EnemyPool, rng: Rng, elapsed: number, dt: number, cap: number): void {
    const actDiff = activeArena().difficultyMult * activeDifficulty().hpMult;

    if (this.infinite) {
      if (pool.count >= cap) return;
      if (this.bossOnField(pool)) {
        this.bossArmTimer = BOSS_PERIOD; // hold while a boss lives
        return;
      }
      this.bossArmTimer -= dt;
      if (this.bossArmTimer <= 0) {
        const def = this.act.bosses[this.act.bosses.length - 1]!;
        const scale = def.scale * (1 + this.bossesSpawned * 0.5) * actDiff;
        if (this.spawnAtGate(pool, rng, def.enemyType, scale)) {
          this.boss = true;
          this.bossArmTimer = BOSS_PERIOD;
          this.bossCreepTimer = BOSS_CREEP_FIRST;
        }
      }
      return;
    }

    // Finite act roster.
    if (this.bossStage >= this.act.bosses.length) return; // act cleared
    if (pool.count >= cap) return;
    if (this.bossOnField(pool)) return; // a boss is up; stage advances on its death

    let ready: boolean;
    if (this.bossStage === 0 && !this.boss) {
      ready = elapsed >= this.act.firstBossAt; // escalation-time gate for the opener
    } else {
      this.bossArmTimer -= dt; // real-seconds breather after the previous kill
      ready = this.bossArmTimer <= 0;
    }
    if (this.forceNextBoss) ready = true;
    if (!ready) return;

    const def = this.act.bosses[this.bossStage]!;
    if (this.spawnAtGate(pool, rng, def.enemyType, def.scale * actDiff)) {
      this.boss = true;
      this.forceNextBoss = false;
      this.bossCreepTimer = BOSS_CREEP_FIRST; // hold the creep a beat after the boss lands
    }
  }

  /** Boss-creep cadence (T75 feedback): while a boss is up, the normal wave rhythm is
   *  paused — this lighter trickle keeps reinforcements coming (mostly gate spawns,
   *  the odd teleport-in) so the fight has pressure without a full horde burying the
   *  boss. Bounded by the concurrent cap (V8). */
  private stepBossCreep(
    pool: EnemyPool,
    rng: Rng,
    elapsed: number,
    dt: number,
    cap: number,
    fx?: FxQueue,
  ): void {
    if (pool.count >= cap) return;
    this.bossCreepTimer -= dt;
    if (this.bossCreepTimer > 0) return;
    // Phase-orchestrated (V42): each phase break quickens the cadence + adds a body,
    // so a boss under pressure floods more reinforcements (floored so it never spams).
    const phase = Math.max(0, this.bossPhase);
    this.bossCreepTimer = Math.max(2.4, BOSS_CREEP_PERIOD - phase * 0.8);
    const n = BOSS_CREEP_GROUP + phase + (elapsed > 100 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      if (pool.count >= cap) return;
      const type = this.pickType(rng, elapsed, 0, activeArena().act);
      this.spawnCluster(pool, rng, rng.int(0, GATE_COUNT - 1), type);
    }
    // Past the teleport unlock, occasionally blink one in so the interior isn't safe.
    if (elapsed >= TELE_AT && rng.next() < 0.5) this.spawnTeleporter(pool, rng, cap, fx);
  }

  /** Is ANY boss currently on the field (active or telegraphing)? Gates the next
   *  wave + the boss-sequence spawn (T75: any boss body, not just the Gatekeeper). */
  private bossOnField(pool: EnemyPool): boolean {
    for (let i = 0; i < pool.count; i++) {
      if (ENEMY_BY_VARIANT[pool.variant[i]!]?.boss) return true;
    }
    return false;
  }

  /** Real seconds until the next boss arrives, for the HUD countdown — `null` while
   *  a boss is on the field (the bar takes over) or the act roster is exhausted.
   *  Stage 0 reads the act's firstBossAt threshold (real time); later stages + the
   *  Overrun gauntlet read the breather timer. (Estimate: ignores the count<cap.) */
  timeToNextBoss(elapsed: number, pool: EnemyPool): number | null {
    if (this.bossOnField(pool)) return null;
    if (this.infinite) return Math.max(0, this.bossArmTimer);
    if (this.bossStage >= this.act.bosses.length) return null;
    if (this.bossStage === 0 && !this.boss) {
      return Math.max(0, this.act.firstBossAt * TIMELINE_STRETCH - elapsed);
    }
    return Math.max(0, this.bossArmTimer);
  }

  /** Spawn-time HP scale for fodder this step (run-phase escalation, T44). */
  private hpScale = 1;
  private teleTimer = TELE_PERIOD; // countdown to the next teleport wave (T33+)

  step(
    pool: EnemyPool,
    rng: Rng,
    elapsed: number,
    dt: number,
    adapt: Adaptation = NEUTRAL_ADAPT,
    hpScale = 1,
    fx?: FxQueue,
    capMul = 1, // sawtooth count multiplier (T44 power-tier thinning)
  ): void {
    this.hpScale = hpScale;
    // Stretch the escalation clock: every threshold below reads this slowed time,
    // so the run ramps over ~270s instead of ~90s (dt accrual stays real-time).
    elapsed = elapsed / TIMELINE_STRETCH;
    // HUD wave readout: a COARSE escalation-time tick, NOT the per-pulse spawn counter
    // (pulses fire every ~0.5–1.2s → it ballooned to ~200 by minute 2). One "wave" per
    // WAVE_DISPLAY_PERIOD of escalation time reads as steady, sane progression.
    this.waveNumber = Math.floor(elapsed / WAVE_DISPLAY_PERIOD) + 1;
    const b = budgetAt(elapsed);
    const pace = clamp(adapt.pace, PACE_MIN, PACE_MAX); // re-clamp: director owns bounds (V12)
    const houndBias = clamp(adapt.houndBias, 0, BIAS_MAX);
    // Act pace multiplier — higher Acts accrue threat faster AND raise the concurrent
    // cap, so the Crown fields more enemies, sooner (still V8-bounded by pool cap).
    const actPace = activeArena().paceMult * activeDifficulty().paceMult;
    this.bank += b.threatPoints * pace * actPace * dt;

    // Sawtooth thins the crowd at each power step (capMul), so the cap tracks player
    // progression, not just elapsed time → fewer, beefier enemies after a step.
    const cap = Math.min(Math.floor(b.maxConcurrentEnemies * actPace * capMul), pool.capacity);

    // Act boss sequence (T75, V36): field the act's bosses in order — Miniboss I →
    // Miniboss II → Final — each gated by its arrival timer + "no boss currently up".
    // The world advances the stage on a boss's death (advanceBossStage) and, once
    // the final falls, offers extract-or-Overrun. Overrun flips this to an endless
    // recurring-final gauntlet (V22 × N). Bosses spawn free (not from the bank).
    this.stepBoss(pool, rng, elapsed, dt, cap);

    // BOSS PHASE (T75 feedback): while a boss (mini or final) is on the field, PAUSE
    // the NORMAL wave cadence (themed bursts, gate pulses, teleport waves) and run a
    // SEPARATE, lighter boss-creep cadence instead — a steady trickle of reinforcements
    // through the gates + occasional teleport-ins — so the fight has pressure without
    // the full horde drowning the boss. The normal clocks freeze, so the breather
    // isn't "spent" mid-fight; they resume the instant the boss falls.
    const bossUp = this.bossOnField(pool);
    if (bossUp) {
      this.stepBossCreep(pool, rng, elapsed, dt, cap, fx);
    } else {
      // Themed milestone waves (T-themes): when the escalation clock crosses the next
      // scheduled theme, drop its scripted burst (FREE, surround) + flag a HUD banner.
      // Catches up if several thresholds passed in one big dt (while still ≤ capacity).
      while (this.themeIdx < this.themes.length && elapsed >= this.themes[this.themeIdx]!.at) {
        const t = this.themes[this.themeIdx]!;
        this.themeIdx++;
        this.spawnBurst(pool, rng, t.type, t.count);
        this.waveEvent = t.label;
        if (fx) fx.push('levelup', 0, 0); // a celebratory cue (no bespoke fx needed)
        // Authored schedule just emptied → arm the RECURRING phase from here.
        if (this.themeIdx >= this.themes.length) this.recurAt = t.at + RECUR_INTERVAL;
      }
      // RECURRING themed waves (post-schedule): keep the run punctuated past the last
      // milestone (and past boss 1 — runs continue). Cycle the act's pool with counts
      // that GROW each cycle, so late-game beats escalate rather than repeat flat.
      while (this.themes.length > 0 && elapsed >= this.recurAt) {
        const t = this.themes[this.recurCount % this.themes.length]!;
        const tier = 2 + Math.floor(this.recurCount / this.themes.length); // ×2, ×3, … per full cycle
        const count = Math.round(t.count * (1 + this.recurCount * 0.18));
        this.recurCount++;
        this.recurAt += RECUR_INTERVAL;
        this.spawnBurst(pool, rng, t.type, count);
        this.waveEvent = `${t.label} ×${tier}`;
        if (fx) fx.push('levelup', 0, 0);
      }

      // Wave rhythm: hold spawns between pulses (the breather), then release a
      // clustered burst from a growing subset of gates. The bank built up during
      // the breather is what funds the burst — so waves naturally scale with the
      // budget curve while the arena gets moments to breathe.
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.waveTimer = waveGap(elapsed);
        this.spawnWave(pool, rng, elapsed, houndBias, cap);
      }

      // Phase Stalkers: a separate cadence that IGNORES the gates and materializes
      // at interior points — so the player can't just watch the perimeter (V9 tell).
      if (elapsed >= TELE_AT) {
        this.teleTimer -= dt;
        if (this.teleTimer <= 0) {
          this.teleTimer = Math.max(6, TELE_PERIOD - (elapsed - TELE_AT) * 0.04);
          const n = elapsed > 130 ? 2 : 1;
          for (let k = 0; k < n; k++) this.spawnTeleporter(pool, rng, cap, fx);
        }
      }
    }

    // Clamp so a long breather can't accumulate an unbounded burst (V8 bounded).
    this.bank = Math.min(this.bank, b.threatPoints * 4 * actPace + CHEAPEST);
  }

  /** Release one wave: tight clustered groups from the gates a directional
   *  pattern selects (the pressure shape — single / pincer / sweep / surround). */
  private spawnWave(
    pool: EnemyPool,
    rng: Rng,
    elapsed: number,
    houndBias: number,
    cap: number,
  ): void {
    const gates = this.gatesFor(this.choosePattern(rng, elapsed), rng);
    const perGate = waveGroup(elapsed);
    // Round-robin across the chosen gates so a small early bank spreads to all
    // sides (2 units from 2 gates) instead of piling onto the first gate.
    for (let k = 0; k < perGate; k++) {
      for (const gate of gates) {
        if (pool.count >= cap || this.bank < CHEAPEST) return;
        const rolled = this.pickType(rng, elapsed, houndBias, activeArena().act);
        const type = this.bank >= rolled.threat ? rolled : RUST_MITE;
        if (this.bank < type.threat) return;
        if (!this.spawnCluster(pool, rng, gate, type)) return; // pool full
        this.bank -= type.threat;
      }
    }
  }

  /** A scripted THEMED burst: `count` of one type, telegraphed in from gates around
   *  the ring (surround), scaled by the run's live hpScale. FREE (not from the bank) —
   *  it's a milestone beat, not a budgeted wave. Bounded by pool capacity (V8). */
  private spawnBurst(pool: EnemyPool, rng: Rng, type: EnemyType, count: number): void {
    for (let k = 0; k < count; k++) {
      // Spread across all gates so the burst surrounds — a gate per enemy, rotating.
      const gate = k % GATE_COUNT;
      const p = gateOuterPoint(gate, rng.range(-1.4, 1.4), 2.5);
      if (pool.spawn(type, p.x, p.z, TELEGRAPH, this.phase++, this.hpScale) < 0) return; // pool full
    }
  }

  /** Choose this wave's pressure shape. The DEFAULT is ONE gate at a time
   *  (Single, or Sweep which is a single rotating gate) — so on average a wave
   *  comes from one direction and is leadable. Multi-gate shapes (Adjacent /
   *  Opposing / Surround) are occasional pressure SPIKES that grow over the run. */
  private choosePattern(rng: Rng, elapsed: number): Pattern {
    const r = rng.next();
    // Calm open: almost always a single gate, rare two-gate nudge.
    if (elapsed < 25) return r < 0.78 ? Pattern.Single : Pattern.Adjacent;
    if (elapsed < 60) {
      // Single-gate baseline (Single + Sweep ≈ 78%); occasional pincer.
      return r < 0.5
        ? Pattern.Single
        : r < 0.78
          ? Pattern.Sweep
          : r < 0.92
            ? Pattern.Adjacent
            : Pattern.Opposing;
    }
    // Late: single still the plurality (~64% via Single+Sweep), multi-gate spikes
    // more often, with a rare full Surround.
    return r < 0.4
      ? Pattern.Single
      : r < 0.64
        ? Pattern.Sweep
        : r < 0.82
          ? Pattern.Opposing
          : r < 0.93
            ? Pattern.Adjacent
            : Pattern.Surround;
  }

  /** Resolve a pattern to the gate indices it spawns from this wave. */
  private gatesFor(pattern: Pattern, rng: Rng): number[] {
    switch (pattern) {
      case Pattern.Single:
        return [rng.int(0, GATE_COUNT - 1)];
      case Pattern.Adjacent: {
        const g = rng.int(0, GATE_COUNT - 1);
        return [g, (g + 1) % GATE_COUNT];
      }
      case Pattern.Opposing: {
        const g = rng.int(0, 1); // 0&2 or 1&3 — directly opposed
        return [g, g + 2];
      }
      case Pattern.Sweep: {
        const g = this.sweepGate;
        this.sweepGate = (this.sweepGate + 1) % GATE_COUNT; // rotate clockwise
        return [g];
      }
      case Pattern.Surround:
        return [0, 1, 2, 3];
    }
  }

  /** Spawn one enemy tightly clustered at a single gate (small arc + depth jitter). */
  private spawnCluster(pool: EnemyPool, rng: Rng, gate: number, type: EnemyType): boolean {
    // Sentinels (beam turrets) read poorly bunched out ONE gate shooting from one
    // spot — so they OVERRIDE the wave's gate to a different one each time (avoid the
    // previous sentinel's gate) and use a WIDE along/depth jitter so each emerges from
    // its own spot. Other enemies keep the tight cluster at the wave's gate.
    let along = rng.range(-0.4, 0.4);
    let depth = 2.5 - rng.range(0, 1.5);
    if (type.attack?.kind === 'beam' && GATE_COUNT > 1) {
      let g = rng.int(0, GATE_COUNT - 1);
      let tries = 0;
      while (g === this.lastSentinelGate && tries++ < 4) g = rng.int(0, GATE_COUNT - 1);
      this.lastSentinelGate = g;
      gate = g;
      along = rng.range(-1, 1); // full edge spread
      depth = 2.5 + rng.range(0, 2.5); // staggered emergence depth
    }
    // The telegraph walk marches them out (shape-aware).
    const p = gateOuterPoint(gate, along, depth);
    return pool.spawn(type, p.x, p.z, TELEGRAPH, this.phase++, this.hpScale) >= 0;
  }

  /** Materialize a Phase Stalker at a random INTERIOR point (not a gate). The
   *  telegraph window + the render-side materialize FX make it dodgeable (V9). */
  private spawnTeleporter(pool: EnemyPool, rng: Rng, cap: number, fx?: FxQueue): void {
    if (pool.count >= cap) return;
    const p = interiorPoint(rng.next(), rng.next(), 0.3, 0.82); // interior, off the edge kite
    const x = p.x;
    const z = p.z;
    if (
      pool.spawn(
        PHASE_STALKER,
        x,
        z,
        TELE_TELEGRAPH,
        this.phase++,
        this.hpScale,
        SpawnKind.Teleport,
      ) >= 0
    ) {
      fx?.push('teleport', x, z);
    }
  }
}

// ── Power-tiered escalation (T44 rework) ─────────────────────────────────────
// The run must NOT scale by enemy COUNT alone — that drowns you in an uncapped mass
// of low-HP fodder the player one-shots. Instead enemy HP steps up HARD per "power
// tier" (which tracks the PLAYER's growing damage), and each step DROPS the
// concurrent count, which then recovers across the tier — a sawtooth. Net: fewer,
// beefier enemies that demand real damage, then more of them, then a chunkier step
// again. Strategic, not a swarm you delete on contact.
const TIER_SIZE = 5; // player levels per power tier (matches the milestone draft cadence)
const HP_STEP = 0.5; // +50% spawn HP per tier (compounding)
const COUNT_FLOOR = 0.6; // a fresh tier drops the cap to this fraction…
const COUNT_CEIL = 1.0; // …recovering to full by the tier's end (the sawtooth)

/** Run progress in "tier units": each player level is 1, each boss kill jumps a
 *  whole tier (a boss is a big power step). Single source for HP + count below. */
export function powerProgress(level: number, bossKills: number): number {
  return Math.max(0, level - 1) + Math.max(0, bossKills) * TIER_SIZE;
}

/** Spawn-HP multiplier — steps ×(1+HP_STEP) per tier so fodder HP keeps pace with
 *  the player's escalating per-upgrade damage. Spawn-only (live units keep birth HP,
 *  V12). Deterministic. T0 1× · T1 1.5× · T2 2.25× · T3 3.4× · T4 5.1× · T5 7.6×. */
export function hpScaleFor(level: number, bossKills: number): number {
  const tier = Math.floor(powerProgress(level, bossKills) / TIER_SIZE);
  return Math.pow(1 + HP_STEP, tier);
}

/** Concurrent-cap sawtooth: drops to COUNT_FLOOR the instant a new HP tier kicks in,
 *  climbs back to COUNT_CEIL across that tier's levels, then drops again at the next
 *  step. So a power step thins the crowd; you re-earn the density. */
export function countSawtooth(level: number, bossKills: number): number {
  const within = (powerProgress(level, bossKills) % TIER_SIZE) / TIER_SIZE; // 0→1 across a tier
  return COUNT_FLOOR + (COUNT_CEIL - COUNT_FLOOR) * within;
}

/** Seconds between waves — long at the open, shrinking to a floor. */
function waveGap(elapsed: number): number {
  return Math.max(WAVE_GAP_MIN, WAVE_GAP_START - elapsed * 0.035);
}

/** Max enemies per gate this wave — small groups that grow over the run. */
function waveGroup(elapsed: number): number {
  return 6 + Math.floor(elapsed / 7); // bigger opening waves + a faster climb per gate
}
