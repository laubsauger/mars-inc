// Authoritative simulation state (V2). Render reads this; never mutates it.
// System order is fixed and documented here (§14.3).

import { Rng } from '../core/rng';
import { type Player, createPlayer, stepPlayer, resetPlayer } from './player';
import { EnemyPool, ENEMY_DISPLAY_NAME, ENEMY_BY_VARIANT, splitOnDeath } from './enemies';
import { EnemySystem } from './enemy-system';
import { EnemyAttackSystem } from './enemy-attacks';
import { BossController } from './boss';
import { WeaponDropSystem } from './weapon-drops';
import { HealthDropSystem } from './health-drops';
import { BountySystem } from './bounty-system';
import { availableEvolution } from '../content/weapons/evolutions';
import { type BossReward, type RewardCtx, rollBossRewards } from './boss-rewards';
import {
  WaveDirector,
  computeAdaptation,
  hpScaleFor,
  countSawtooth,
} from './director/wave-director';
import { WeaponSystem } from './combat/weapon-system';
import { DroneSystem } from './combat/drones';
import { OrbitalSystem } from './combat/orbitals';
import { CorpseSystem } from './combat/corpses';
import { GrenadeSystem, GRENADE_MAX_THROW } from './combat/grenades';
import { PetSystem } from './combat/pets';
import { radialPush } from './combat/knockback';
import { equip } from './combat/weapon';
import { contractualSidearm } from '../content/weapons/contractual-sidearm';
import { weaponById } from '../content/weapons/index';
import { ShardPool } from './xp';
import { emitShards, stepXp } from './xp-system';
import { stepXpResource } from './xp-resource';
import { FxQueue, ImpactProfile } from './fx';
import { type RunMods, defaultMods, resetMods } from './progression/mods';
import { type PermanentLevels, applyPermanents } from './progression/permanents';
import { type PrestigeLevels, applyPrestige } from '../content/prestige-nodes';
import {
  BuildEffects,
  type ConditionalResult,
  type TriggerCtx,
  type TriggerEvent,
} from './progression/effects';
import { promoteSpawns, eliteProgress } from './director/elites';
import { stepGargantuans } from './gargantuan';
import { activeArena, activeDifficulty, interiorPoint } from './arena';
import { applyAreaDamage } from './combat/aoe';
import { applyStatus, tickStatus } from './combat/status';
import { applyStatusScaled, MAX_PROC_DEPTH, PROC_CHAIN_INHERIT } from './combat/proc';
import { resolveReactions } from './combat/reactions';
import { type RunStats, type RunResult, newRunStats, resetRunStats, computeResult } from './run';
import { type UpgradeDefinition } from './progression/upgrades';
import { DRAFT_POOL, DEV_UPGRADE_CATALOG } from './progression/draft-pool';
import { type CharacterSheet, buildCharacterSheet } from './progression/character-sheet';
import { DraftController } from './progression/draft-controller';
import type { InputSnapshot } from '../core/input';

export { DEV_UPGRADE_CATALOG }; // re-exported for the dev board (imported via ./sim/world)
export type { CharacterSheet }; // re-exported for consumers importing via ./sim/world

/** Rich post-game summary (T23) — what the run actually became. */
export interface RunSummary {
  weapon: string;
  bossKills: number;
  killsByType: { name: string; count: number }[];
  upgrades: { name: string; level: number }[];
  /** What dealt the killing blow (death only) — unit + attack label + damage. */
  fatalBlow: { unit: string; attack: string; damage: number } | null;
}

/** Player-damage `kind` → readable attack label for the game-over cause-of-death. */
const ATTACK_LABEL: Record<string, string> = {
  contact: 'Collision',
  charge: 'Charge Slam',
  laser: 'Ion Beam',
  projectile: 'Gunfire',
  blast: 'Mortar Blast',
  frost: 'Frost Blast',
  unknown: 'Unknown',
};

const COUNTDOWN_SECONDS = 3;
/** Beat between a boss dying and its reward overlay rising — lets the player watch the
 *  blood catastrophe play out in the (otherwise quiet) scene before the freeze (T43). */
const BOSS_REWARD_DELAY = 1.4;
const RECENT_CRIT_WINDOW = 1.5; // s a crit keeps the `recentCrit` conditional live
const LOCAL_CROWD_RADIUS = 10; // m around the player counted as "nearby" for crowd/breather cards (was 7, then 9 — too tight; widened so proximity effects actually trigger)
const STATIONARY_MOVE_DECAY = 2; // hold-ground ramp BLEEDS this× build-rate while moving
const DOT_INTERVAL = 0.5; // s between damage-over-time ticks (2/s) — chunky integer ticks,
// not 60 sub-1 ticks/s that the damage-number layer rounds up to a spam of "1"s.
const LOW_HP_FRAC = 0.25; // health fraction below which the `lowHp` trigger fires (was 0.4 — too high; only fire when genuinely in danger)
// Refractory cooldowns so heal/invuln triggers can't re-fire the instant they push you
// back over the line → no accidental immortality. lowHp is a real panic button (long);
// breather is a kite-reward (shorter, but still gated so in/out kiting can't spam it).
const LOW_HP_REFRACTORY = 20; // s before lowHp can fire again (× player.panicCooldownMult; upgradeable)
const BREATHER_REFRACTORY = 6; // s before breather can fire again
const TIME_WARP_MULT = 0.4; // enemy dt scale while Time Dilation is active (you keep full speed)
const RAGE_CAP = 12; // max kill-streak stacks (rage/frenzy cards)
const RAGE_WINDOW = 3; // seconds since the last kill before the whole streak breaks

const ZERO_INPUT: InputSnapshot = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  pause: false,
  pickup: false,
  fire: false,
  grenade: false,
  grenadeHeld: false,
  toggleAuto: false,
  mouseX: -1,
  mouseY: -1,
  mouseInside: true, // headless/default = cursor PRESENT; real input sends false only on
  // an actual mouse-leave (so auto-fire works in tests + before the first real input).
  aimX: 0,
  aimZ: 0,
  hasAim: false,
};

export class World {
  readonly rng: Rng;
  readonly seed: number;
  tick = 0;
  elapsed = 0;
  readonly player: Player;
  readonly enemies: EnemyPool;
  readonly enemySystem: EnemySystem;
  /** Enemy ranged attacks: lobbed hazards now, guns later (T33). */
  readonly enemyAttacks = new EnemyAttackSystem();
  /** Weapon-crate drops + pickup → primary-weapon swap (T33). */
  readonly weaponDrops = new WeaponDropSystem();
  /** Occasional medkit drops; auto-collected to heal (T33+). */
  readonly healthDrops = new HealthDropSystem();
  /** Timed bounty relics — a movement-driven second upgrade source (draft on pickup). */
  readonly bounties = new BountySystem();
  /** Gatekeeper boss fight controller — phases + telegraphed attacks (T33). */
  readonly boss = new BossController();
  /** Set to the evolved weapon's name the step it evolves (T34); HUD announces. */
  justEvolved: string | null = null;
  readonly weaponSystem: WeaponSystem;
  /** Companion drones orbiting the player, auto-hunting enemies (T40/T42). */
  readonly drones = new DroneSystem();
  /** Orbital blades — spinning melee bodies that slice the swarm (T-orbit). */
  readonly orbitals = new OrbitalSystem();
  /** Overkill corpses: detonate/launch/chain/meteor build family (T65). */
  readonly corpses = new CorpseSystem();
  /** Player grenades: right-mouse AoE+knockback lobs (crowd-parting tool). */
  readonly grenades = new GrenadeSystem();
  /** Gravedigger pets: slain enemies rise to fight for you, then decay (T-necro). */
  readonly pets = new PetSystem();
  readonly shards: ShardPool;
  readonly mods: RunMods;
  /** Dynamic build engine (T38): conditional modifiers + triggers. */
  readonly effects = new BuildEffects();
  /** Sustained-combat ramp (s) for ramp-while-firing conditionals (T38). */
  private firingRampSec = 0;
  /** Stand-still ramp (s): grows while the player holds position, resets on move. */
  private stationarySec = 0;
  /** Mobility ramp (s): grows while the player moves, bleeds when still (run-and-gun). */
  private movingSec = 0;
  /** Damage dealt by on-hit triggers this step (T39, folded into run stats). */
  private hitTriggerDamage = 0;
  /** Damage dealt by the repulsor nova this step (T42, folded into run stats). */
  private novaDamageThisStep = 0;
  /** Sprint active last step — edge-detects the Kinetic Boots dash shockwave. */
  private prevSprintActive = false;
  /** Recent-crit window (s): set on a crit, decays; feeds the `recentCrit` build
   *  conditional (crit-chain cards, Batch 1). */
  private recentCritTimer = 0;
  /** Edge state for the low-HP trigger (fires once each time you DROP below the
   *  threshold, not every step you're under it). */
  private wasLowHp = false;
  /** Refractory timers (s) so heal/invuln triggers can't re-fire the instant they
   *  push you back over the threshold (no accidental immortality). */
  private lowHpCooldown = 0;
  private breatherCooldown = 0;
  /** Were there enemies last step? → edge-detects a wave clear (all dead). */
  private hadEnemies = false;
  /** Enemies within LOCAL_CROWD_RADIUS last eval — edge-detects a local-clear (breather). */
  private lastNearby = 0;
  /** Offense-conditional intensity 0..1 (render-only aura cue; V2 — render never writes it). */
  buffGlow = 0;
  /** Accumulates real time until a DoT tick fires (DOT_INTERVAL) — chunky burn/bleed. */
  private dotTimer = 0;
  /** Countdown to the next run-phase environmental hazard eruption (T44). */
  private arenaHazardTimer = 0;
  /** Were enemies near you last step? → edge-detects "breathing room" (no one within 7m). */
  private hadNearby = false;
  /** Render-facing FX events; the render layer drains this each frame. */
  readonly fx = new FxQueue();
  readonly director: WaveDirector;
  /** When false, runs start with no countdown (dev/testing time-saver, default off). */
  countdownEnabled = false;
  /** Pre-combat countdown (T20). Player can move; no spawns; timer held at 0. Init
   *  matches reset() so a fresh world == a reset world (determinism, V15/V16). */
  countdown = this.countdownEnabled ? COUNTDOWN_SECONDS : 0;
  /** False until the player enters the pit from the menu (T27). Sim idles. */
  started = false;
  input: InputSnapshot = ZERO_INPUT;
  /** Persistent auto-fire (toggled by Space). Off by default — the player holds
   *  left-mouse to fire; Space flips this on for hands-free fire. */
  autoShoot = false;
  /** Cooldown (s) until the next grenade can be thrown (right mouse, T-grenade). */
  private grenadeCd = 0;
  private grenadeCdMax = 1.2; // last throw's full cooldown (for the HUD radial)
  /** Grenade cooldown progress 0..1 (1 = ready to throw) — for the ability hotbar. */
  get grenadeCharge01(): number {
    return this.grenadeCdMax > 0 ? Math.min(1, 1 - this.grenadeCd / this.grenadeCdMax) : 1;
  }
  /** Effective max grenade throw distance (base + range upgrades). The render aim
   *  marker reads this so the reticle reflects throw-range upgrades. */
  get grenadeMaxThrow(): number {
    return GRENADE_MAX_THROW + this.mods.grenadeRangeAdd;
  }
  paused = false;

  // Run lifecycle (T22). `ended` latches on death; `result` is computed once.
  readonly stats: RunStats = newRunStats();
  ended = false;
  result: RunResult | null = null;

  // Boss reward (T43, V22). While `bossReward`, the sim freezes for the 3-choice.
  bossReward = false;
  bossRewardChoices: BossReward[] = [];
  bossRewardId = 0; // bumps when the overlay opens (UI refresh key)
  /** Countdown (s) after a boss dies before its reward overlay rises — the "savor the
   *  explosion" beat (T43). 0 = idle. The sim runs during it so the scene plays the FX. */
  private bossRewardDelay = 0;

  // Act conclusion (T75/T50, V36). After the FINAL boss of the act falls (and its
  // reward is claimed) the run freezes on a two-choice prompt: Extract (bank the
  // win, run over) or Overrun (opt into the endless gauntlet). `pendingConclusion`
  // bridges the gap while the final boss reward overlay is still open.
  conclusion = false;
  conclusionId = 0;
  private pendingConclusion = false;
  /** True once the player chose Overrun — the finite act is done; endless from here. */
  infinite = false;

  /** Level-up → upgrade-draft lifecycle (T18/T41/T71). Owns the pending-level queue,
   *  rolled options, per-run draft resources, banished set, lock, and upgradeLevels.
   *  The public draft API is delegated to it below so the UI surface is unchanged. */
  readonly draftCtl: DraftController;

  /** Owned permanent (meta) upgrade levels, applied to the player at run start. */
  private permanents: PermanentLevels;
  /** Owned Red-Dust prestige nodes (T72) — applied at run start after permanents. */
  private prestigeNodes: PrestigeLevels = {};
  /** Dev control board (T74): set true the moment any dev grant touches this run —
   *  main gates record/Glory banking on it (V35: a tampered run never banks). */
  cheated = false;
  /** Dev godmode (T74): while set, the step keeps the player invulnerable. */
  devGodmode = false;

  constructor(seed: number, permanents: PermanentLevels = {}) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.permanents = permanents;
    this.player = createPlayer();
    this.enemies = new EnemyPool();
    this.enemySystem = new EnemySystem(this.enemies, 2);
    this.weaponSystem = new WeaponSystem();
    this.weaponSystem.add(equip(contractualSidearm));
    this.shards = new ShardPool();
    this.mods = defaultMods();
    this.director = new WaveDirector();
    this.draftCtl = new DraftController({
      player: this.player,
      rng: this.rng,
      mods: this.mods,
      effects: this.effects,
      stats: this.stats,
      afterApply: () => this.maybeEvolve(), // a pick may complete a weapon-evolution combo
    });
    applyPermanents(this.player, this.permanents, this.mods, this.effects);
  }

  // ── Draft API — delegated to the DraftController (UI surface unchanged) ───────
  get leveling(): boolean {
    return this.draftCtl.leveling;
  }
  get draft(): UpgradeDefinition[] {
    return this.draftCtl.draft;
  }
  get draftId(): number {
    return this.draftCtl.draftId;
  }
  get rerollsLeft(): number {
    return this.draftCtl.rerollsLeft;
  }
  get banishesLeft(): number {
    return this.draftCtl.banishesLeft;
  }
  get locksLeft(): number {
    return this.draftCtl.locksLeft;
  }
  get tagBanishesLeft(): number {
    return this.draftCtl.tagBanishesLeft;
  }
  get heldLock(): string | null {
    return this.draftCtl.heldLock;
  }
  upgradeInfo(def: UpgradeDefinition): ReturnType<DraftController['upgradeInfo']> {
    return this.draftCtl.upgradeInfo(def, this.currentConditional());
  }

  /** Live conditional contribution active right now (read-only — no firingRamp/buffGlow
   *  mutation, unlike evalConditionals). Lets the draft preview show the SAME current
   *  damage/crit/fire-rate the pause sheet shows, so a card's baseline matches. */
  private currentConditional(): ConditionalResult {
    const e = this.enemies;
    let nearest = Infinity;
    let nearby = 0;
    const nearR2 = LOCAL_CROWD_RADIUS * LOCAL_CROWD_RADIUS;
    for (let i = 0; i < e.count; i++) {
      const dx = e.posX[i]! - this.player.pos.x;
      const dz = e.posZ[i]! - this.player.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearest) nearest = d2;
      if (d2 <= nearR2) nearby++;
    }
    return this.effects.evalConditionals({
      enemiesOnScreen: e.count,
      enemiesNearby: nearby,
      nearestDist: nearest === Infinity ? Infinity : Math.sqrt(nearest),
      firingRampSec: this.firingRampSec,
      hpFrac: this.player.maxHealth > 0 ? this.player.health / this.player.maxHealth : 0,
      recentCrit: this.recentCritTimer > 0,
      recoilActive: this.player.recoilTimer > 0,
      stationarySec: this.stationarySec,
      moving: this.movingSec > 0,
      movingSec: this.movingSec,
      rageStacks: this.player.rage,
    });
  }
  choose(index: number): void {
    this.draftCtl.choose(index);
  }
  reroll(lockedIds: readonly string[] = []): void {
    this.draftCtl.reroll(lockedIds);
  }
  banish(index: number): void {
    this.draftCtl.banish(index);
  }
  banishTag(tag: string): void {
    this.draftCtl.banishTag(tag);
  }
  lockCard(index: number): void {
    this.draftCtl.lockCard(index);
  }
  skipDraft(): void {
    this.draftCtl.skipDraft();
  }

  /** Update owned permanents (e.g. after a Glory purchase); next run applies them. */
  setPermanents(permanents: PermanentLevels): void {
    this.permanents = permanents;
  }

  /** Update owned prestige nodes (T72); next run applies their run-start seeds. */
  setPrestige(nodes: PrestigeLevels): void {
    this.prestigeNodes = nodes;
  }

  get alive(): boolean {
    return this.player.health > 0;
  }

  /** Real seconds until the next boss (HUD countdown); null while one is on the field. */
  bossEta(): number | null {
    return this.director.timeToNextBoss(this.elapsed, this.enemies);
  }

  /** Begin combat from the menu: fresh run, countdown starts (T27). The driver
   *  (main loop) only calls step() while `started`; step() itself stays runnable
   *  headless so sim tests can drive a world directly without the menu gate. */
  start(): void {
    this.reset();
    this.started = true;
  }

  step(dt: number): void {
    if (this.ended) return;
    // Any death (in-step damage or external) latches the run as over (V20).
    if (!this.alive) {
      this.end(false);
      return;
    }
    if (this.input.pause) this.paused = !this.paused;
    if (this.paused || this.leveling || this.bossReward || this.conclusion) return;

    // Pre-combat countdown: player can orient; no spawns; run clock held at 0.
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - dt);
      stepPlayer(this.player, this.input, dt);
      return;
    }

    this.tick++;
    this.elapsed += dt;

    // Dev godmode (T74): hold the player invulnerable each step (uses the existing
    // i-frame channel → the damage pipeline already honours it, V3).
    if (this.devGodmode) this.player.invuln = Math.max(this.player.invuln, 0.5);

    const healthBefore = this.player.health;

    // Fixed system order (§14.3): player → director → enemy AI/contact → weapons → triggers → XP.
    stepPlayer(this.player, this.input, dt);
    // Capture the sprint rising edge before the dash-shock block consumes
    // `prevSprintActive` — XP Liquidation (T58) fires on the same edge.
    const sprintRising = this.player.sprint.active && !this.prevSprintActive;
    // Time Dilation (T-timewarp): while active, every ENEMY system steps at a slice
    // of dt — slowed movement, attacks, and in-flight enemy projectiles — while the
    // player keeps full speed. Decays in real time. Triggers (e.g. lowHp) set it.
    let enemyDt = dt;
    if (this.player.timeWarp > 0) {
      this.player.timeWarp = Math.max(0, this.player.timeWarp - dt);
      enemyDt = dt * TIME_WARP_MULT;
    }
    // Orchestrate boss-creep cadence by the active boss's phase (T44/V42): a boss
    // deeper into its phases floods more reinforcements. (One-step lag is fine — the
    // boss controller updates phase later this step.)
    this.director.bossPhase = this.boss.active ? this.boss.currentPhase : 0;
    // Adapt composition/pace to the build (bounded, V12) — never per-enemy stats.
    this.director.step(
      this.enemies,
      this.rng,
      this.elapsed,
      dt,
      computeAdaptation(this.mods),
      // Spawn-time HP scale (never re-scales live units, V12). Steps HARD per power
      // tier (player level + boss kills) × the Act's base difficulty, so fodder HP
      // tracks the player's escalating damage instead of the run scaling by count.
      hpScaleFor(this.player.level, this.stats.bossKills) *
        activeArena().difficultyMult *
        activeDifficulty().hpMult,
      this.fx,
      // Sawtooth: each HP step thins the crowd, density re-earned across the tier.
      countSawtooth(this.player.level, this.stats.bossKills),
    );
    // Escalate difficulty in KIND, not just count (T-elite): freshly-spawned fodder
    // gains baseline shields as the run deepens + a slice promotes to elites.
    promoteSpawns(this.enemies, eliteProgress(this.player.level, this.stats.bossKills), this.rng);
    this.enemySystem.step(this.player, this.tick, enemyDt, this.fx);
    // Gargantuans devour overlapping fodder + grow, and SLAM a size-scaled blast
    // (after steering → current positions). A fat one carves a huge lethal zone.
    stepGargantuans(this.enemies, this.enemyAttacks, enemyDt, this.fx);
    // Companion drones hunt + fire into the shared projectile pool (V3 pipeline).
    // After the enemy system so the spatial hash is current; before the weapon
    // system so their bolts are stepped/collided this frame too.
    this.drones.setCount(this.player.droneCount);
    this.drones.step(
      this.player,
      this.enemies,
      this.enemySystem.hash,
      this.weaponSystem.projectiles,
      dt,
      this.mods.damageMult * this.player.droneDamageMult, // COMMAND drone amp (T35)
      // Drones inherit your SCALAR stats (range/fire rate) from the build always;
      // the projectile MECHANICS (blast/pierce/ricochet/on-hit) only with the keystone.
      this.mods,
      this.player.droneInheritMods,
    );
    // Repulsor nova (CC, T42): on its interval, shove every nearby enemy outward
    // and deal light AoE through the pipeline (V3) — cuts space in a blob.
    this.novaDamageThisStep = 0;
    if (this.player.novaInterval > 0) {
      this.player.novaTimer -= dt;
      if (this.player.novaTimer <= 0) {
        this.player.novaTimer = this.player.novaInterval;
        const px = this.player.pos.x;
        const pz = this.player.pos.z;
        // Singularity mutation pulls inward (negative force) instead of out.
        radialPush(
          this.enemies,
          this.enemySystem.hash,
          px,
          pz,
          this.player.novaRadius,
          this.player.novaPull ? -this.player.novaForce : this.player.novaForce,
        );
        this.novaDamageThisStep = applyAreaDamage(
          this.enemies,
          this.enemySystem.hash,
          px,
          pz,
          this.player.novaRadius,
          {
            amount: this.player.novaDamage * this.mods.damageMult,
            damageType: 'kinetic',
            fx: this.fx,
          },
          this.rng,
        );
        // Shockwave ring sized to the FULL nova radius (Blast profile) so the player
        // SEES the wave's reach — it was an invisible, range-less pop before.
        this.fx.push('impact', px, pz, this.player.novaRadius, 0, 4 /* ImpactProfile.Blast */);
      }
    }
    // Kinetic Boots (CC mobility, T42): dashing carves a CHANNEL through the
    // crowd. A strong burst the instant the sprint starts (dash INTO a blob to
    // blow it open), then a sustained outward shove every step WHILE sprinting,
    // applied at the player's CURRENT position — so the cleared lane follows the
    // whole dash PATH, not just the launch point.
    if (this.player.dashShockForce > 0 && this.player.sprint.active) {
      const rising = !this.prevSprintActive;
      // Launch = full impulse; sustain = dt-scaled rate (frame-independent, V1)
      // so it shoves enemies aside as the player sweeps through without the
      // per-step `+=` runaway.
      const force = rising ? this.player.dashShockForce : this.player.dashShockForce * dt * 15;
      radialPush(
        this.enemies,
        this.enemySystem.hash,
        this.player.pos.x,
        this.player.pos.z,
        this.player.dashShockRadius,
        force,
      );
      // On the launch edge, draw a full-size blast ring scaled to the shock radius so
      // the shove READS (not a tiny spark at the feet).
      if (rising) {
        this.fx.push(
          'impact',
          this.player.pos.x,
          this.player.pos.z,
          this.player.dashShockRadius,
          0,
          ImpactProfile.Blast,
        );
      }
    }
    this.prevSprintActive = this.player.sprint.active;
    // Orbital blades (T-orbit): spin around the player + slice the swarm on their
    // tick cadence (pipeline-routed, V3). Runs BEFORE the weapon system so blade
    // kills compact + drop XP this step exactly like a bullet hit.
    this.orbitals.setCount(this.player.orbitCount);
    const orbitalDmg = this.orbitals.step(
      this.player,
      this.enemies,
      this.enemySystem.hash,
      this.player.orbitDamage * this.mods.damageMult,
      this.player.orbitRadius,
      dt,
      this.rng,
      this.fx,
    );
    // Boss queues its phased attacks into the shared FX pools BEFORE they advance.
    this.boss.step(this.enemies, this.player, this.enemyAttacks, this.rng, enemyDt, this.fx);
    // Run-phase environmental hazard (T44/V23): each boss kill graduates the pit to a
    // deadlier state — telegraphed ground eruptions start at tier 1 and quicken with
    // each kill. Queued BEFORE enemyAttacks.step so they tick + telegraph this step.
    this.stepArenaHazards(dt);
    // Enemy ranged attacks: lob grenades that cook off into telegraphed AoE (T33).
    this.enemyAttacks.step(this.enemies, this.player, this.rng, enemyDt, this.fx);

    // Dynamic build conditionals (T38): evaluate against live combat context.
    const cond = this.evalConditionals(dt);
    // Offense-buff glow (render aura): how "hot" your conditionals are right now, 0..1.
    // Render reads this to pulse a gold aura so an active buff is legible at a glance.
    this.buffGlow = Math.min(
      1,
      Math.max(0, cond.damageMult - 1) + cond.critAdd + Math.max(0, cond.fireRateMult - 1),
    );
    // Fire control (T-input): hold left-mouse to fire; Space toggles persistent
    // auto-fire. Default is manual so the player paces their own shots.
    if (this.input.toggleAuto) this.autoShoot = !this.autoShoot;
    // Auto-fire only holds while the cursor is in the window. Otherwise leaving the
    // window with auto-fire on would keep auto-TARGETING + firing forever, letting a
    // player idle-farm. Held left-mouse always fires (you're clicking = mouse inside).
    // (Dev builds force `mouseInside` true in the boot glue so idle-testing still works.)
    const firing = this.input.fire || (this.autoShoot && this.input.mouseInside);
    // On-hit hook (T38 hit/crit triggers + T39 on-hit status) only when needed.
    this.hitTriggerDamage = 0;
    const onHit =
      this.effects.has('hit') || this.effects.has('crit')
        ? (e: number, crit: boolean, coef: number, dmg: number): void =>
            this.fireHitTrigger(e, crit, coef, dmg)
        : undefined;
    this.weaponSystem.step(
      this.player,
      this.enemies,
      this.enemySystem.hash,
      this.mods,
      this.rng,
      dt,
      this.fx,
      cond,
      onHit,
      firing,
    );
    // Grenade (T-grenade): right-mouse lobs an AoE+knockback grenade at the cursor,
    // on a cooldown — a crowd-parting tool. Reuses the pipeline (V3) + radial push.
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);
    // Throw on the right-click EDGE (instant) or while right-mouse is HELD (auto-throw
    // every time the cooldown refreshes). Needs a live aim (mouse in window).
    if (
      (this.input.grenade || this.input.grenadeHeld) &&
      this.grenadeCd <= 0 &&
      this.player.aim.has
    ) {
      this.throwGrenade();
    }
    const grenadeDmg = this.grenades.step(
      this.enemies,
      this.enemySystem.hash,
      this.rng,
      this.fx,
      dt,
    );
    // On-shot trigger (T55 recoil family: Countermass shockwave, God-Kicker).
    if (this.weaponSystem.firedThisStep && this.effects.has('shot')) this.fireShotTrigger();
    // On-kill / overkill triggers fire after combat resolves (T38, V21 pipeline).
    const triggerDmg = this.fireKillTriggers();
    // Status step (§5.4): burn DoT, chill/mark decay (T39). DoT DAMAGE is gated to
    // ~2/s ticks (dotDt = the accumulated interval, 0 between ticks) so each burn hit
    // is one chunky integer number, not 60 sub-1 ticks/s; status DURATIONS still count
    // down every step (real dt) for correct timing.
    this.dotTimer += dt;
    let dotDt = 0;
    if (this.dotTimer >= DOT_INTERVAL) {
      dotDt = this.dotTimer;
      this.dotTimer = 0;
    }
    const statusDmg = tickStatus(
      this.enemies,
      this.rng,
      dt,
      this.fx,
      this.mods.statusDamageMult,
      dotDt,
    );
    // Status reactions (T53): primed status pairs consume + burst (V28). Off
    // until an upgrade enables one, so this is free in the base game.
    const reactionDmg = this.resolveReactions();
    this.enemies.decayHitFlash(dt); // cosmetic hit-flash fade (T40, view tints it)
    emitShards(this.shards, this.weaponSystem.kills);
    // Weapon crates drop from kills; collecting one swaps the primary weapon (T33).
    this.weaponDrops.step(
      this.player,
      this.weaponSystem.kills,
      this.weaponSystem,
      this.rng,
      this.fx,
      dt,
      this.input.pickup,
    );
    // Medkits drop from kills + auto-heal on walk-over (T33+). Run-phase: each boss
    // kill raises the drop rate so survivability keeps pace with the escalation (T44).
    const dropMult = 1 + Math.min(4, this.stats.bossKills) * 0.3;
    this.healthDrops.step(this.player, this.weaponSystem.kills, this.rng, this.fx, dt, dropMult);
    // Bounty relics: timed map pickups that grant an upgrade draft (move-to-collect,
    // a second upgrade source on top of XP). Feeds the level-up draft pipeline.
    this.bounties.step(this.player, this.rng, this.fx, dt);
    if (this.bounties.collectedThisStep > 0) {
      this.draftCtl.queueLevelUp(this.bounties.collectedThisStep);
      // Same ascension flourish as an XP level-up — the draft opens either way, so
      // the player gets the same "why did the card screen pop?" cue (T-levelfx).
      this.fx.push('levelup', this.player.pos.x, this.player.pos.z);
    }
    // Corpse / overkill builds (T65): overkilled kills leave bodies; corpses
    // detonate / launch / chain / call meteors (pipeline-routed, V3/V21).
    this.corpses.ingest(this.weaponSystem.kills, this.player, this.fx);
    const corpseDmg = this.corpses.step(
      this.player,
      this.enemies,
      this.enemySystem.hash,
      this.rng,
      this.fx,
      dt,
    );
    // Gravedigger pets hunt + claw the swarm, then decay (T-necro, pipeline-routed).
    const petDmg = this.pets.step(
      this.player,
      this.enemies,
      this.enemySystem.hash,
      this.rng,
      this.fx,
      dt,
    );
    // Pet kills drop XP + count toward stats, but DELIBERATELY skip the player's
    // on-kill build (fireKillTriggers/corpse.ingest) and necro re-raise — pets are
    // autonomous minions, not your weapon, so they don't set off your explosions or
    // snowball into more pets (T-necro balance).
    if (this.pets.kills.length > 0) {
      emitShards(this.shards, this.pets.kills);
      this.stats.kills += this.pets.kills.length;
      for (const k of this.pets.kills) {
        this.stats.killsByVariant[k.variant] = (this.stats.killsByVariant[k.variant] ?? 0) + 1;
        splitOnDeath(this.enemies, k.variant, k.x, k.z, this.rng); // blobs still rupture
      }
    }
    const leveled = stepXp(this.shards, this.player, dt);
    // XP-as-resource builds (T58): interest/magnetar/liquidation/crash over the
    // loose shard pool (pipeline-routed, V3/V21). Free until a card is taken.
    const xpResDmg = stepXpResource(
      this.shards,
      this.player,
      this.enemies,
      this.enemySystem.hash,
      this.rng,
      this.fx,
      dt,
      sprintRising,
    );
    if (leveled > 0) {
      // Flourish around the player, then hold the draft briefly so it shows.
      this.fx.push('levelup', this.player.pos.x, this.player.pos.z);
    }
    this.draftCtl.queueLevelUp(leveled);

    // Accumulate run stats from this step's authoritative events (V20).
    this.stats.kills += this.weaponSystem.kills.length;
    // Kill-streak rage: each kill this step adds a stack (capped) + refreshes the
    // streak window. Read by frenzy/bloodlust conditional cards.
    if (this.weaponSystem.kills.length > 0) {
      this.player.rage = Math.min(RAGE_CAP, this.player.rage + this.weaponSystem.kills.length);
      this.player.rageTimer = RAGE_WINDOW;
    }
    for (const k of this.weaponSystem.kills) {
      const v = k.variant;
      this.stats.killsByVariant[v] = (this.stats.killsByVariant[v] ?? 0) + 1;
      // Splitter (blob): rupture into smaller children at the death site (V9
      // telegraphed pop). Children are a terminal variant — no further splits.
      splitOnDeath(this.enemies, v, k.x, k.z, this.rng);
      // Gravedigger: a slain enemy may RISE as a pet that fights for you (T-necro).
      if (this.player.necroChance > 0 && this.rng.next() < this.player.necroChance) {
        this.pets.raise(k.x, k.z, v, k.size ?? 0.7, this.player.necroPower, this.fx);
      }
    }
    this.stats.damageDealt +=
      this.weaponSystem.damageThisStep +
      triggerDmg +
      this.hitTriggerDamage +
      statusDmg +
      reactionDmg +
      this.novaDamageThisStep +
      corpseDmg +
      petDmg +
      xpResDmg +
      grenadeDmg +
      orbitalDmg;
    // Health only drops from damage this step (heals/maxHP changes happen while
    // the sim is frozen for a draft), so the positive delta is damage taken.
    const tookDamage = Math.max(0, healthBefore - this.player.health);
    this.stats.damageTaken += tookDamage;
    // Hurt trigger (thorns / retaliate): fire once per step the player lost health.
    if (tookDamage > 0 && this.effects.has('hurt')) this.firePlayerTrigger('hurt', tookDamage);
    this.stats.timeSurvived = this.elapsed;
    this.stats.level = this.player.level;

    // ── Edge-triggered player events (Batch 1) ──────────────────────────────
    // recentCrit window: decay, refresh on any crit this step → feeds the build
    // conditional next step (crit-chain cards). Tracked from the weapon system so
    // it works even without a crit TRIGGER registered.
    if (this.recentCritTimer > 0) this.recentCritTimer = Math.max(0, this.recentCritTimer - dt);
    if (this.weaponSystem.critThisStep) this.recentCritTimer = RECENT_CRIT_WINDOW;
    // sprint: fire once on the dash rising edge (momentum builds).
    if (sprintRising && this.effects.has('sprint')) this.firePlayerTrigger('sprint');
    // lowHp: fire ONCE each time health drops below the threshold (panic builds),
    // re-armed only after climbing back above it.
    const lowNow =
      this.player.maxHealth > 0 && this.player.health / this.player.maxHealth < LOW_HP_FRAC;
    if (this.lowHpCooldown > 0) this.lowHpCooldown -= dt;
    if (lowNow && !this.wasLowHp && this.lowHpCooldown <= 0 && this.effects.has('lowHp')) {
      this.firePlayerTrigger('lowHp');
      // Substantial — panic button, not immortality. Upgrades shorten it (panicCooldownMult).
      this.lowHpCooldown = LOW_HP_REFRACTORY * this.player.panicCooldownMult;
    }
    this.wasLowHp = lowNow;
    // waveClear: fire when the last enemy dies (clear-the-room payoffs). Checked
    // after splitters have spawned their children so a blob pop isn't a false clear.
    const enemiesNow = this.enemies.count > 0;
    if (!enemiesNow && this.hadEnemies && this.effects.has('waveClear')) {
      this.firePlayerTrigger('waveClear');
    }
    this.hadEnemies = enemiesNow;
    // breather: fire when your LOCAL space clears (no enemy within 7m) — the
    // achievable "breathing room" payoff in a design where a full arena clear isn't.
    const nearbyNow = this.lastNearby > 0;
    if (this.breatherCooldown > 0) this.breatherCooldown -= dt;
    if (
      !nearbyNow &&
      this.hadNearby &&
      this.breatherCooldown <= 0 &&
      this.effects.has('breather')
    ) {
      this.firePlayerTrigger('breather');
      this.breatherCooldown = BREATHER_REFRACTORY;
    }
    this.hadNearby = nearbyNow;

    this.draftCtl.update(dt); // tick the flourish delay → open the draft when due

    // Boss-reward delay (savor the kill): after a boss dies the sim keeps running for
    // a beat so the player SEES the blood catastrophe explode in the otherwise-quiet
    // scene, THEN the reward overlay rises + freezes (T43 polish). Ticks while active.
    if (this.bossRewardDelay > 0) {
      this.bossRewardDelay -= dt;
      if (this.bossRewardDelay <= 0) this.openBossRewardOverlay();
    }

    // Death ends the run (loss). EACH boss kill is a progression hinge: it queues a
    // major in-run reward (after the savor beat) and the run continues — until the
    // act's FINAL boss falls, which then offers extract-or-Overrun (T75).
    if (!this.alive) this.end(false);
    else if (this.boss.justDefeated) this.onBossKilled();
  }

  /** A boss fell this step. Count it + advance the act sequence NOW (so kill-time
   *  banking/escalation fire immediately), but DELAY the reward overlay a beat so the
   *  death FX gets to play in the running scene (T43 polish). */
  private onBossKilled(): void {
    this.stats.bossKills += 1;
    this.director.advanceBossStage();
    this.pendingConclusion = this.director.actComplete();
    this.bossRewardDelay = BOSS_REWARD_DELAY;
  }

  /** Roll + raise the boss-reward overlay (freezes the sim). If the pool is empty,
   *  skip straight to the conclusion when the act is complete. */
  private openBossRewardOverlay(): void {
    this.bossRewardDelay = 0;
    this.bossRewardChoices = rollBossRewards(this.rewardCtx(), this.rng);
    if (this.bossRewardChoices.length === 0) {
      if (this.pendingConclusion) this.openConclusion();
      return;
    }
    this.bossRewardId += 1;
    this.bossReward = true;
  }

  /** Open the end-of-act conclusion prompt (freezes the sim like the boss reward). */
  private openConclusion(): void {
    this.pendingConclusion = false;
    this.conclusion = true;
    this.conclusionId += 1;
  }

  /** Run-phase environmental hazard (T44/V23): telegraphed ground eruptions whose
   *  pace + spread grow with each boss kill — the pit itself escalates. Off at tier 0,
   *  on from the first boss kill. Routes the shared hazard pool (telegraph → V9, V3
   *  pipeline damage), deterministic via the run rng (V16). */
  private stepArenaHazards(dt: number): void {
    const tier = this.stats.bossKills;
    if (tier <= 0) return;
    this.arenaHazardTimer -= dt;
    if (this.arenaHazardTimer > 0) return;
    // Faster cadence each tier, floored so it never machine-guns the floor.
    this.arenaHazardTimer = Math.max(2.4, 6.0 - tier * 0.7);
    const count = 1 + (tier >= 3 ? 1 : 0);
    const radius = 3.4 + Math.min(2, tier * 0.4);
    const damage = (16 + tier * 4) * activeDifficulty().hpMult; // dodgeable (telegraphed)
    for (let k = 0; k < count; k++) {
      const p = interiorPoint(this.rng.next(), this.rng.next(), 0.2, 0.85);
      this.enemyAttacks.hazardAt(p.x, p.z, radius, 1.4, damage);
    }
  }

  /** Build the conditional context for this step and combine all modifiers (T38). */
  private evalConditionals(dt: number): ConditionalResult {
    const e = this.enemies;
    const n = e.count;
    this.firingRampSec = n > 0 ? Math.min(12, this.firingRampSec + dt) : 0;
    // Hold-ground ramp (Entrenchment): builds while you hold position, BLEEDS while
    // you walk (so light repositioning costs a little, sustained running clears it),
    // and a SPRINT/DASH hard-cancels it — sprint is the explicit "I'm relocating" verb.
    // This is a movement game: a hard reset on any step makes the ramp unusable, so
    // walking only decays it ~2× build-rate. Tracks INPUT INTENT, not velocity, so
    // recoil drift never costs you (V4).
    const moving = Math.hypot(this.input.moveX, this.input.moveZ) > 0.1;
    if (this.player.sprint.active) {
      this.stationarySec = 0; // sprint/dash → instant cancel
    } else {
      this.stationarySec = moving
        ? Math.max(0, this.stationarySec - dt * STATIONARY_MOVE_DECAY)
        : Math.min(12, this.stationarySec + dt);
    }
    // Mobility ramp (run-and-gun lane): grows while moving (sprint counts), bleeds
    // when you stop — the mirror of stationarySec, rewarding kiting over turtling.
    this.movingSec =
      moving || this.player.sprint.active
        ? Math.min(12, this.movingSec + dt)
        : Math.max(0, this.movingSec - dt * STATIONARY_MOVE_DECAY);
    // Kill-streak rage decay: stacks gained on kill (in the kill loop); the whole
    // streak drops if RAGE_WINDOW elapses without a fresh kill (reward sustained
    // aggression, not a permanent buff).
    if (this.player.rage > 0) {
      this.player.rageTimer -= dt;
      if (this.player.rageTimer <= 0) this.player.rage = 0;
    }

    let nearest = Infinity;
    let nearby = 0;
    const nearR2 = LOCAL_CROWD_RADIUS * LOCAL_CROWD_RADIUS;
    for (let i = 0; i < n; i++) {
      const dx = e.posX[i]! - this.player.pos.x;
      const dz = e.posZ[i]! - this.player.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearest) nearest = d2;
      if (d2 <= nearR2) nearby++;
    }
    this.lastNearby = nearby;
    return this.effects.evalConditionals({
      enemiesOnScreen: n,
      enemiesNearby: nearby,
      nearestDist: nearest === Infinity ? Infinity : Math.sqrt(nearest),
      firingRampSec: this.firingRampSec,
      hpFrac: this.player.maxHealth > 0 ? this.player.health / this.player.maxHealth : 0,
      recentCrit: this.recentCritTimer > 0, // crit-chain cards (Batch 1)
      recoilActive: this.player.recoilTimer > 0, // recoil builds (T55)
      stationarySec: this.stationarySec,
      moving,
      movingSec: this.movingSec,
      rageStacks: this.player.rage,
    });
  }

  /** Fire on-hit / on-crit triggers for one projectile hit (T38/T39). Runs at hit
   *  time (enemy index still valid). On-hit status + magnitude scale by the firing
   *  weapon's proc coefficient (T69, V32); `procChain` re-enters at a reduced coef,
   *  depth-bounded so chains terminate (V32, deterministic V16/V21). */
  private fireHitTrigger(
    e: number,
    crit: boolean,
    procCoef: number,
    hitDamage: number,
    depth = 0,
  ): void {
    if (depth > MAX_PROC_DEPTH) return; // bound proc-chain recursion (V32)
    const ctx: TriggerCtx = {
      x: this.enemies.posX[e]!,
      z: this.enemies.posZ[e]!,
      player: this.player,
      enemies: this.enemies,
      hash: this.enemySystem.hash,
      rng: this.rng,
      fx: this.fx,
      variant: this.enemies.variant[e]!,
      magnitude: 0,
      targetIndex: e,
      procCoef,
      hitDamage,
      depth,
      procChain: (index, c) =>
        this.fireHitTrigger(index, c, procCoef * PROC_CHAIN_INHERIT, hitDamage, depth + 1),
      dealArea: (x, z, radius, amount) => {
        const d = applyAreaDamage(
          this.enemies,
          this.enemySystem.hash,
          x,
          z,
          radius,
          // magnitude scales by coef (V32); hitFx + shove so trigger blasts (Singularity
          // etc.) read as real explosions, not silent damage.
          { amount: amount * procCoef, fx: this.fx, hitFx: true, knockback: 10, falloff: 0.75 },
          this.rng,
        );
        this.hitTriggerDamage += d;
        return d;
      },
      // On-hit status: a `dotCoef` opt becomes hit-scaled dps (T70, V33); proc
      // coefficient then scales duration/stacks/chance (T69, V32).
      applyStatus: (index, type, opts) => {
        const o =
          opts.dotCoef !== undefined
            ? { ...opts, dps: (opts.dotCoef * hitDamage) / opts.duration }
            : opts;
        applyStatusScaled(this.enemies, index, type, o, procCoef, this.rng);
      },
    };
    this.effects.fire('hit', ctx);
    if (crit) this.effects.fire('crit', ctx);
  }

  /** Lob a grenade at the aim point (T-grenade). Damage scales modestly with the
   *  build; radius picks up explosive blast mods. Sets the throw cooldown. */
  private throwGrenade(): void {
    const m = this.mods;
    // Baseline is a CROWD-CONTROLLER: modest centre damage with hard falloff to the
    // rim (aoe.ts), big knockback. Tuned so it does NOT one-hit every Rust Mite (6 HP)
    // in the radius by default — only the inner core; the outer ring survives. Damage
    // upgrades grow it into a real dealer.
    const dmg = (4 + 4 * m.damageMult) * m.grenadeDamageMult;
    const radius = 3.6 + Math.min(2, m.blastRadius) + m.grenadeRadiusAdd;
    // Vacuum Charge inverts the shove into a PULL (negative force → radialPush
    // sucks enemies toward the blast — a gather tool instead of a scatter).
    const knockback = 28 * m.grenadeKnockbackMult * (m.grenadePull ? -1 : 1);
    this.grenades.configure(dmg, radius, knockback, m.grenadeMolotov);
    // Clamp the throw to a max range (no infinite-distance lobs); constant sling
    // speed means a longer throw also takes longer to land (GrenadeSystem).
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    let tx = this.player.aim.x;
    let tz = this.player.aim.z;
    const ddx = tx - px;
    const ddz = tz - pz;
    const d = Math.hypot(ddx, ddz);
    const maxThrow = this.grenadeMaxThrow;
    if (d > maxThrow) {
      tx = px + (ddx / d) * maxThrow;
      tz = pz + (ddz / d) * maxThrow;
    }
    this.grenades.throwAt(px, pz, tx, tz);
    this.grenadeCd = 1.2 * m.grenadeCdMult;
    this.grenadeCdMax = this.grenadeCd;
    this.fx.push(
      'muzzle',
      this.player.pos.x,
      this.player.pos.z,
      this.player.aim.x - this.player.pos.x,
      this.player.aim.z - this.player.pos.z,
    );
  }

  /** Fire the on-shot trigger once per step the player fired (T55). `x,z` is the
   *  player; handlers compute "behind" from `player.facing`. */
  private fireShotTrigger(): void {
    this.firePlayerTrigger('shot');
  }

  /** Fire a PLAYER-CENTERED trigger (shot / sprint / lowHp / waveClear) — events
   *  with no specific enemy target. AoE routes through the V3 pipeline like the
   *  other triggers; status falls on the nearest hit. Batch 1 wires sprint/lowHp/
   *  waveClear so cards can hook movement, panic, and clear-the-room moments. */
  private firePlayerTrigger(event: TriggerEvent, magnitude = 0): void {
    this.effects.fire(event, {
      x: this.player.pos.x,
      z: this.player.pos.z,
      player: this.player,
      enemies: this.enemies,
      hash: this.enemySystem.hash,
      rng: this.rng,
      fx: this.fx,
      variant: 0,
      magnitude,
      targetIndex: -1,
      procCoef: 1,
      hitDamage: 0,
      depth: 0,
      dealArea: (x, z, radius, amount) => {
        const d = applyAreaDamage(
          this.enemies,
          this.enemySystem.hash,
          x,
          z,
          radius,
          { amount, fx: this.fx, hitFx: true, knockback: 10, falloff: 0.75 },
          this.rng,
        );
        this.hitTriggerDamage += d;
        return d;
      },
      applyStatus: (index, type, opts) => applyStatus(this.enemies, index, type, opts),
    });
  }

  /** Resolve status reactions for this step (T53). Off-cost when no reaction is
   *  enabled. Fires a `reaction` trigger per reaction so cross-upgrades (Feedback
   *  Loop etc, T54) can hook them. Returns reaction-dealt damage for run stats. */
  private resolveReactions(): number {
    const enabled = this.effects.enabledReactions;
    if (enabled.size === 0) return 0;
    const fireTrigger = this.effects.has('reaction');
    const res = resolveReactions(
      this.enemies,
      this.enemySystem.hash,
      this.rng,
      this.fx,
      enabled,
      fireTrigger
        ? (_r, x, z, dealt) => {
            this.effects.fire('reaction', {
              x,
              z,
              player: this.player,
              enemies: this.enemies,
              hash: this.enemySystem.hash,
              rng: this.rng,
              fx: this.fx,
              variant: 0,
              magnitude: dealt,
              targetIndex: -1,
              procCoef: 1, // reaction burst is not a weapon hit → full-strength (V32)
              hitDamage: 0,
              depth: 0,
              dealArea: (ax, az, radius, amount) => {
                const d = applyAreaDamage(
                  this.enemies,
                  this.enemySystem.hash,
                  ax,
                  az,
                  radius,
                  { amount, fx: this.fx, hitFx: true, knockback: 10, falloff: 0.75 },
                  this.rng,
                );
                this.hitTriggerDamage += d;
                return d;
              },
              applyStatus: (index, type, opts) => applyStatus(this.enemies, index, type, opts),
            });
          }
        : undefined,
    );
    return res.dealt;
  }

  /** Fire on-kill / on-overkill triggers for this step's kills (T38). Returns
   *  trigger-dealt damage to fold into run stats. */
  private fireKillTriggers(): number {
    const kills = this.weaponSystem.kills;
    if (kills.length === 0 || (!this.effects.has('kill') && !this.effects.has('overkill'))) {
      return 0;
    }
    let dealt = 0;
    const ctx: TriggerCtx = {
      x: 0,
      z: 0,
      player: this.player,
      enemies: this.enemies,
      hash: this.enemySystem.hash,
      rng: this.rng,
      fx: this.fx,
      variant: 0,
      magnitude: 0,
      targetIndex: -1, // enemy already removed by the time kill triggers fire
      procCoef: 1, // kill triggers are not a weapon hit → full-strength proc (V32)
      hitDamage: 0,
      depth: 0,
      dealArea: (x, z, radius, amount) => {
        const d = applyAreaDamage(
          this.enemies,
          this.enemySystem.hash,
          x,
          z,
          radius,
          { amount, fx: this.fx, hitFx: true, knockback: 10, falloff: 0.75 },
          this.rng,
        );
        dealt += d;
        return d;
      },
      applyStatus: (index, type, opts) => applyStatus(this.enemies, index, type, opts),
    };
    for (const k of kills) {
      ctx.x = k.x;
      ctx.z = k.z;
      ctx.variant = k.variant;
      this.effects.fire('kill', ctx);
      this.effects.fire('overkill', ctx);
    }
    return dealt;
  }

  /** Latch the run as over and compute the post-game result once (T22, V20).
   *  `won` = the boss was defeated (vs. player death). */
  private end(won: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.result = computeResult(this.stats, won);
  }

  /** Restart in place — no page reload (V15). Reseed for determinism (V16). */
  reset(): void {
    this.rng.restore(this.seed);
    this.tick = 0;
    this.elapsed = 0;
    this.paused = false;
    this.ended = false;
    this.result = null;
    this.bossReward = false;
    this.bossRewardChoices = [];
    this.bossRewardDelay = 0;
    this.conclusion = false;
    this.pendingConclusion = false;
    this.infinite = false;
    this.arenaHazardTimer = 0;
    this.cheated = false; // a fresh run is clean until a dev grant touches it (T74/V35)
    this.devGodmode = false;
    this.countdown = this.countdownEnabled ? COUNTDOWN_SECONDS : 0;
    this.started = false;

    resetPlayer(this.player);
    // Reset the build layers BEFORE permanents so build-seeding nodes (Live Wire,
    // Frostbrand, Hair-Trigger…) register onto a clean slate (T35+).
    resetMods(this.mods);
    this.effects.reset();
    this.recentCritTimer = 0;
    this.wasLowHp = false;
    this.lowHpCooldown = 0;
    this.breatherCooldown = 0;
    this.hadEnemies = false;
    this.hadNearby = false;
    this.lastNearby = 0;
    this.dotTimer = 0;
    this.prevSprintActive = false;
    applyPermanents(this.player, this.permanents, this.mods, this.effects);
    // Prestige seeds (Red Dust nodes, T72) stack on top of permanents at run start.
    applyPrestige(this.player, this.prestigeNodes, this.mods, this.effects);
    // Draft resources read the permanent bonuses applied above (T35), so reset the
    // draft controller AFTER permanents.
    this.draftCtl.reset();
    this.enemies.count = 0;
    this.enemyAttacks.reset();
    this.weaponDrops.reset();
    this.healthDrops.reset();
    this.bounties.reset();
    this.boss.reset();
    this.justEvolved = null;
    this.shards.count = 0;
    this.fx.clear();
    this.firingRampSec = 0;
    this.stationarySec = 0;
    this.movingSec = 0;
    this.director.reset();
    this.drones.reset();
    this.orbitals.reset();
    this.grenades.reset();
    this.grenadeCd = 0;
    this.autoShoot = false;
    this.corpses.pool.clear();
    this.pets.reset();
    this.prevSprintActive = false;
    this.weaponSystem.reset();
    this.weaponSystem.add(equip(contractualSidearm));
    resetRunStats(this.stats);
  }

  /** If the just-applied upgrade completes the primary weapon's evolution combo,
   *  transform it (V18: gated by the combo, never weapon level alone). */
  private maybeEvolve(): void {
    const id = this.weaponSystem.primaryId;
    if (!id) return;
    const evo = availableEvolution(id, this.draftCtl.upgradeLevels);
    if (!evo) return;
    this.weaponSystem.setPrimary(evo.evolved);
    this.justEvolved = evo.evolved.displayName;
  }

  private rewardCtx(): RewardCtx {
    return {
      player: this.player,
      mods: this.mods,
      effects: this.effects,
      weapons: this.weaponSystem,
    };
  }

  // ── Dev control board (T74) ──────────────────────────────────────────────
  // Every grant routes through the SAME real APIs the run uses (applyUpgrade /
  // weaponSystem.setPrimary / enemies.spawn / openBossReward) and flags the run
  // `cheated` so main never banks records or Glory (V35). ⊥ a bespoke pipeline.

  /** Owned level of an upgrade — the board shows the current stack. */
  upgradeLevelOf(id: string): number {
    return this.draftCtl.upgradeLevelOf(id);
  }

  /** Apply an upgrade by id at +1 level (bypasses the draft). False if id unknown. */
  devGrantUpgrade(id: string): boolean {
    if (!this.draftCtl.grant(id)) return false; // routes through applyUpgrade + maybeEvolve
    this.cheated = true;
    return true;
  }

  /** Swap the primary weapon by id. False if id unknown. */
  devSetWeapon(id: string): boolean {
    const def = weaponById(id);
    if (!def) return false;
    this.weaponSystem.setPrimary(def);
    this.cheated = true;
    return true;
  }

  /** Force the primary weapon's evolution if its combo is available. False if none. */
  devTryEvolve(): boolean {
    const id = this.weaponSystem.primaryId;
    if (!id) return false;
    const evo = availableEvolution(id, this.draftCtl.upgradeLevels);
    if (!evo) return false;
    this.weaponSystem.setPrimary(evo.evolved);
    this.justEvolved = evo.evolved.displayName;
    this.cheated = true;
    return true;
  }

  /** Queue N level-ups → the normal draft flow opens next step. */
  devAddLevels(n: number): void {
    this.draftCtl.queueLevelUp(Math.max(0, Math.floor(n)));
    this.cheated = true;
  }

  /** Full heal. */
  devHeal(): void {
    this.player.health = this.player.maxHealth;
    this.cheated = true;
  }

  /** Toggle godmode (held invulnerable each step). Returns the new state. */
  devToggleGodmode(): boolean {
    this.devGodmode = !this.devGodmode;
    if (this.devGodmode) this.cheated = true;
    return this.devGodmode;
  }

  /** Spawn `count` of an enemy variant at telegraphed points around the player. */
  devSpawn(variant: number, count: number): void {
    const type = ENEMY_BY_VARIANT[variant];
    if (!type) return;
    const n = Math.max(1, Math.min(64, Math.floor(count)));
    for (let k = 0; k < n; k++) {
      const ang = this.rng.next() * Math.PI * 2;
      const dist = 5 + this.rng.next() * 4;
      const x = this.player.pos.x + Math.cos(ang) * dist;
      const z = this.player.pos.z + Math.sin(ang) * dist;
      this.enemies.spawn(type, x, z, 0.6, this.tick + k);
    }
    this.cheated = true;
  }

  /** Make the wave director field a boss on the next step (respects its scaling). */
  devForceBoss(): void {
    this.director.forceBossNow();
    this.cheated = true;
  }

  /** Wipe every active enemy + reset the boss controller. */
  devClearEnemies(): void {
    this.enemies.count = 0;
    this.boss.reset();
    this.cheated = true;
  }

  /** Force-open the boss-reward draft (test the major-reward flow without a kill).
   *  Dev counts the kill itself, then opens immediately (no savor delay). */
  devOpenBossReward(): void {
    this.cheated = true;
    this.stats.bossKills += 1;
    this.openBossRewardOverlay();
  }

  /** Rich post-game summary for the end screen (T23): final weapon, the build
   *  (upgrades taken), kills broken down by enemy type, bosses slain. */
  runSummary(): RunSummary {
    const killsByType = this.stats.killsByVariant
      .map((count, v) => ({ name: ENEMY_DISPLAY_NAME[v] ?? `Variant ${v}`, count: count ?? 0 }))
      .filter((k) => k.count > 0)
      .sort((a, b) => b.count - a.count);
    const upgrades = Object.entries(this.draftCtl.upgradeLevels)
      .map(([id, level]) => ({ name: DRAFT_POOL.find((u) => u.id === id)?.name ?? id, level }))
      .sort((a, b) => b.level - a.level);
    // Cause of death — the last landed blow (death runs only; a win leaves health > 0).
    const ld = this.player.lastDamage;
    const fatalBlow =
      this.player.health <= 0 && ld
        ? {
            unit: ENEMY_DISPLAY_NAME[ld.variant] ?? 'Unknown',
            attack: ATTACK_LABEL[ld.kind] ?? 'Unknown',
            damage: ld.amount,
          }
        : null;
    return {
      weapon: this.weaponSystem.weapons[0]?.def.displayName ?? '—',
      bossKills: this.stats.bossKills,
      killsByType,
      upgrades,
      fatalBlow,
    };
  }

  /** Live character/build sheet — reused by the end screen, pause menu, warrior
   *  panel (T43). Reads the run-mod layer + player stats into readable rows. */
  characterSheet(): CharacterSheet {
    return buildCharacterSheet({
      mods: this.mods,
      player: this.player,
      enemies: this.enemies,
      effects: this.effects,
      firingRampSec: this.firingRampSec,
      stationarySec: this.stationarySec,
      movingSec: this.movingSec,
      recentCrit: this.recentCritTimer > 0,
      upgradeLevels: this.draftCtl.upgradeLevels,
      weaponSystem: this.weaponSystem,
    });
  }

  /** Apply the chosen boss reward and resume the run (harder). */
  chooseBossReward(index: number): void {
    if (!this.bossReward) return;
    const r = this.bossRewardChoices[index];
    if (!r) return;
    r.apply(this.rewardCtx());
    this.justEvolved =
      r.kind === 'evolution'
        ? (this.weaponSystem.weapons[0]?.def.displayName ?? null)
        : this.justEvolved;
    this.bossRewardChoices = [];
    this.bossReward = false;
    // The act's final boss reward just closed → open the extract/Overrun prompt.
    if (this.pendingConclusion) this.openConclusion();
  }

  /** Surrender (T76, V37): end the run NOW as an honorable self-death. Routes the
   *  normal death path (a loss), so main banks Glory + unlocks exactly like dying —
   *  one exit, no separate Quit. ⊥ discards earned progress. */
  surrender(): void {
    this.end(false);
  }

  /** Resolve the end-of-act conclusion (T75/T50). `extract` banks the win and ends
   *  the run; otherwise opt into the endless Overrun gauntlet and resume, harder. */
  chooseConclusion(extract: boolean): void {
    if (!this.conclusion) return;
    this.conclusion = false;
    if (extract) {
      this.end(true); // won the act → bank everything, run over
    } else {
      this.infinite = true;
      this.director.enterInfinite();
    }
  }
}
