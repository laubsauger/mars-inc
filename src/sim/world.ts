// Authoritative simulation state (V2). Render reads this; never mutates it.
// System order is fixed and documented here (§14.3).

import { Rng } from '../core/rng';
import { type Player, createPlayer, stepPlayer, resetPlayer } from './player';
import { EnemyPool, ENEMY_DISPLAY_NAME, splitOnDeath } from './enemies';
import { EnemySystem } from './enemy-system';
import { EnemyAttackSystem } from './enemy-attacks';
import { BossController } from './boss';
import { WeaponDropSystem } from './weapon-drops';
import { availableEvolution } from '../content/weapons/evolutions';
import { type BossReward, type RewardCtx, rollBossRewards } from './boss-rewards';
import { WaveDirector, computeAdaptation } from './director/wave-director';
import { WeaponSystem } from './combat/weapon-system';
import { DroneSystem } from './combat/drones';
import { radialPush } from './combat/knockback';
import { equip } from './combat/weapon';
import { contractualSidearm } from '../content/weapons/contractual-sidearm';
import { ShardPool } from './xp';
import { emitShards, stepXp } from './xp-system';
import { FxQueue } from './fx';
import { type RunMods, defaultMods, resetMods } from './progression/mods';
import { type PermanentLevels, applyPermanents } from './progression/permanents';
import { BuildEffects, type ConditionalResult, type TriggerCtx } from './progression/effects';
import { applyAreaDamage } from './combat/aoe';
import { applyStatus, tickStatus } from './combat/status';
import { type RunStats, type RunResult, newRunStats, resetRunStats, computeResult } from './run';
import {
  type UpgradeDefinition,
  type UpgradeLevels,
  rollDraft,
  applyUpgrade,
} from './progression/upgrades';
import { UPGRADES } from '../content/upgrades/index';
import { ADVANCED_UPGRADES } from '../content/upgrades/advanced';
import type { InputSnapshot } from '../core/input';

/** Full draft pool: base catalog (T18/T33/T40) + engine-showcase set (T38). */
const DRAFT_POOL: UpgradeDefinition[] = [...UPGRADES, ...ADVANCED_UPGRADES];

/** Rich post-game summary (T23) — what the run actually became. */
export interface RunSummary {
  weapon: string;
  bossKills: number;
  killsByType: { name: string; count: number }[];
  upgrades: { name: string; level: number }[];
}

/** A reusable character/build sheet (T43) — shown on the end screen, the pause
 *  menu, and the warrior panel. Derived live from player + mods. */
export interface CharacterSheet {
  level: number;
  weapon: string;
  attributes: { label: string; value: string }[];
  upgrades: { name: string; level: number }[];
}

const COUNTDOWN_SECONDS = 3;
const STARTING_REROLLS = 2; // per-run draft rerolls (T41)
const STARTING_BANISHES = 2; // per-run upgrade banishes (T41)
const SKIP_HEAL_FRAC = 0.15; // skipping a draft heals this fraction of max HP

const ZERO_INPUT: InputSnapshot = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  pause: false,
  pickup: false,
  mouseX: -1,
  mouseY: -1,
  mouseInside: false,
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
  /** Gatekeeper boss fight controller — phases + telegraphed attacks (T33). */
  readonly boss = new BossController();
  /** Set to the evolved weapon's name the step it evolves (T34); HUD announces. */
  justEvolved: string | null = null;
  readonly weaponSystem: WeaponSystem;
  /** Companion drones orbiting the player, auto-hunting enemies (T40/T42). */
  readonly drones = new DroneSystem();
  readonly shards: ShardPool;
  readonly mods: RunMods;
  /** Dynamic build engine (T38): conditional modifiers + triggers. */
  readonly effects = new BuildEffects();
  /** Sustained-combat ramp (s) for ramp-while-firing conditionals (T38). */
  private firingRampSec = 0;
  /** Damage dealt by on-hit triggers this step (T39, folded into run stats). */
  private hitTriggerDamage = 0;
  /** Damage dealt by the repulsor nova this step (T42, folded into run stats). */
  private novaDamageThisStep = 0;
  /** Sprint active last step — edge-detects the Kinetic Boots dash shockwave. */
  private prevSprintActive = false;
  /** Render-facing FX events; the render layer drains this each frame. */
  readonly fx = new FxQueue();
  readonly director: WaveDirector;
  /** Pre-combat countdown (T20). Player can move; no spawns; timer held at 0. */
  countdown = COUNTDOWN_SECONDS;
  /** False until the player enters the pit from the menu (T27). Sim idles. */
  started = false;
  input: InputSnapshot = ZERO_INPUT;
  paused = false;

  // Run lifecycle (T22). `ended` latches on death; `result` is computed once.
  readonly stats: RunStats = newRunStats();
  ended = false;
  result: RunResult | null = null;

  // Leveling / draft (T18/T41). While `leveling`, the sim freezes for the choice.
  leveling = false;
  draft: UpgradeDefinition[] = [];
  draftId = 0; // bumps each time a draft opens / re-rolls (UI refresh key)
  pendingLevelUps = 0;

  // Boss reward (T43, V22). While `bossReward`, the sim freezes for the 3-choice.
  bossReward = false;
  bossRewardChoices: BossReward[] = [];
  bossRewardId = 0; // bumps when the overlay opens (UI refresh key)
  private bossRewarded = false; // a kill grants its reward once
  rerollsLeft = STARTING_REROLLS;
  banishesLeft = STARTING_BANISHES;
  private readonly banished = new Set<string>();
  private readonly upgradeLevels: UpgradeLevels = {};
  /** Owned permanent (meta) upgrade levels, applied to the player at run start. */
  private permanents: PermanentLevels;

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
    applyPermanents(this.player, this.permanents);
  }

  /** Update owned permanents (e.g. after a Glory purchase); next run applies them. */
  setPermanents(permanents: PermanentLevels): void {
    this.permanents = permanents;
  }

  get alive(): boolean {
    return this.player.health > 0;
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
    if (this.paused || this.leveling || this.bossReward) return;

    // Pre-combat countdown: player can orient; no spawns; run clock held at 0.
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - dt);
      stepPlayer(this.player, this.input, dt);
      return;
    }

    this.tick++;
    this.elapsed += dt;

    const healthBefore = this.player.health;

    // Fixed system order (§14.3): player → director → enemy AI/contact → weapons → triggers → XP.
    stepPlayer(this.player, this.input, dt);
    // Adapt composition/pace to the build (bounded, V12) — never per-enemy stats.
    this.director.step(this.enemies, this.rng, this.elapsed, dt, computeAdaptation(this.mods));
    this.enemySystem.step(this.player, this.tick, dt, this.fx);
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
      this.mods.damageMult,
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
          { amount: this.player.novaDamage * this.mods.damageMult, damageType: 'kinetic' },
          this.rng,
        );
        this.fx.push('impact', px, pz); // shockwave ring
      }
    }
    // Kinetic Boots (CC mobility, T42): a radial shove the instant a sprint
    // starts — dash INTO a blob to blast a channel open.
    if (this.player.dashShockForce > 0 && this.player.sprint.active && !this.prevSprintActive) {
      radialPush(
        this.enemies,
        this.enemySystem.hash,
        this.player.pos.x,
        this.player.pos.z,
        this.player.dashShockRadius,
        this.player.dashShockForce,
      );
      this.fx.push('impact', this.player.pos.x, this.player.pos.z);
    }
    this.prevSprintActive = this.player.sprint.active;
    // Boss queues its phased attacks into the shared FX pools BEFORE they advance.
    this.boss.step(this.enemies, this.player, this.enemyAttacks, this.rng, dt, this.fx);
    // Enemy ranged attacks: lob grenades that cook off into telegraphed AoE (T33).
    this.enemyAttacks.step(this.enemies, this.player, this.rng, dt, this.fx);

    // Dynamic build conditionals (T38): evaluate against live combat context.
    const cond = this.evalConditionals(dt);
    // On-hit hook (T38 hit/crit triggers + T39 on-hit status) only when needed.
    this.hitTriggerDamage = 0;
    const onHit =
      this.effects.has('hit') || this.effects.has('crit')
        ? (e: number, crit: boolean): void => this.fireHitTrigger(e, crit)
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
    );
    // On-kill / overkill triggers fire after combat resolves (T38, V21 pipeline).
    const triggerDmg = this.fireKillTriggers();
    // Status step (§5.4): burn DoT, chill/mark decay (T39).
    const statusDmg = tickStatus(this.enemies, this.rng, dt, this.fx);
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
    this.pendingLevelUps += stepXp(this.shards, this.player, dt);

    // Accumulate run stats from this step's authoritative events (V20).
    this.stats.kills += this.weaponSystem.kills.length;
    for (const k of this.weaponSystem.kills) {
      const v = k.variant;
      this.stats.killsByVariant[v] = (this.stats.killsByVariant[v] ?? 0) + 1;
      // Splitter (blob): rupture into smaller children at the death site (V9
      // telegraphed pop). Children are a terminal variant — no further splits.
      splitOnDeath(this.enemies, v, k.x, k.z, this.rng);
    }
    this.stats.damageDealt +=
      this.weaponSystem.damageThisStep +
      triggerDmg +
      this.hitTriggerDamage +
      statusDmg +
      this.novaDamageThisStep;
    // Health only drops from damage this step (heals/maxHP changes happen while
    // the sim is frozen for a draft), so the positive delta is damage taken.
    this.stats.damageTaken += Math.max(0, healthBefore - this.player.health);
    this.stats.timeSurvived = this.elapsed;
    this.stats.level = this.player.level;

    if (this.pendingLevelUps > 0 && !this.leveling) this.openDraft();

    // Death ends the run (loss). A boss kill is the progression hinge: it opens a
    // major in-run reward (freezes the sim) and the run continues, harder (V22).
    if (!this.alive) this.end(false);
    else if (this.boss.defeated && !this.bossRewarded) this.openBossReward();
  }

  /** Build the conditional context for this step and combine all modifiers (T38). */
  private evalConditionals(dt: number): ConditionalResult {
    const e = this.enemies;
    const n = e.count;
    this.firingRampSec = n > 0 ? Math.min(12, this.firingRampSec + dt) : 0;

    let nearest = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = e.posX[i]! - this.player.pos.x;
      const dz = e.posZ[i]! - this.player.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearest) nearest = d2;
    }
    return this.effects.evalConditionals({
      enemiesOnScreen: n,
      nearestDist: nearest === Infinity ? Infinity : Math.sqrt(nearest),
      firingRampSec: this.firingRampSec,
      hpFrac: this.player.maxHealth > 0 ? this.player.health / this.player.maxHealth : 0,
      recentCrit: false, // wired when the weapon system reports crits (T40)
    });
  }

  /** Fire on-hit / on-crit triggers for one projectile hit (T38/T39). Runs at
   *  hit time (enemy index still valid). On-hit status is applied via the ctx. */
  private fireHitTrigger(e: number, crit: boolean): void {
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
      dealArea: (x, z, radius, amount) => {
        const d = applyAreaDamage(
          this.enemies,
          this.enemySystem.hash,
          x,
          z,
          radius,
          { amount },
          this.rng,
        );
        this.hitTriggerDamage += d;
        return d;
      },
      applyStatus: (index, type, opts) => applyStatus(this.enemies, index, type, opts),
    };
    this.effects.fire('hit', ctx);
    if (crit) this.effects.fire('crit', ctx);
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
      dealArea: (x, z, radius, amount) => {
        const d = applyAreaDamage(
          this.enemies,
          this.enemySystem.hash,
          x,
          z,
          radius,
          { amount },
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
    this.leveling = false;
    this.draft = [];
    this.pendingLevelUps = 0;
    this.bossReward = false;
    this.bossRewardChoices = [];
    this.bossRewarded = false;
    this.banished.clear();
    this.countdown = COUNTDOWN_SECONDS;
    this.started = false;
    for (const k of Object.keys(this.upgradeLevels)) delete this.upgradeLevels[k];

    resetPlayer(this.player);
    applyPermanents(this.player, this.permanents); // re-apply owned meta upgrades
    // Draft resources include permanent bonuses applied above (T35).
    this.rerollsLeft = STARTING_REROLLS + this.player.bonusRerolls;
    this.banishesLeft = STARTING_BANISHES + this.player.bonusBanishes;
    this.enemies.count = 0;
    this.enemyAttacks.reset();
    this.weaponDrops.reset();
    this.boss.reset();
    this.justEvolved = null;
    this.shards.count = 0;
    this.fx.clear();
    resetMods(this.mods);
    this.effects.reset();
    this.firingRampSec = 0;
    this.director.reset();
    this.drones.reset();
    this.prevSprintActive = false;
    this.weaponSystem.reset();
    this.weaponSystem.add(equip(contractualSidearm));
    resetRunStats(this.stats);
  }

  /** Roll a fresh draft, keeping any locked entries (T41). `keep` = upgrade ids
   *  to preserve in place (for reroll); empty for a new level-up draft. */
  private rollInto(keep: ReadonlySet<string>): UpgradeDefinition[] {
    const kept = this.draft.filter((d) => keep.has(d.id));
    const need = 3 - kept.length;
    if (need <= 0) return kept.slice(0, 3);
    // Exclude already-kept ids so the reroll brings genuinely new options.
    const exclude = new Set(this.banished);
    for (const d of kept) exclude.add(d.id);
    const fresh = rollDraft(DRAFT_POOL, this.upgradeLevels, this.rng, {
      count: need,
      level: this.player.level,
      luck: this.player.luck,
      banished: exclude,
    });
    return [...kept, ...fresh];
  }

  private openDraft(): void {
    this.draft = this.rollInto(new Set());
    if (this.draft.length === 0) {
      // Pool exhausted — nothing to offer; consume pending level-ups.
      this.pendingLevelUps = 0;
      this.leveling = false;
      return;
    }
    this.draftId += 1;
    this.leveling = true;
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
    // Keep the other two, roll one replacement that isn't banished/shown.
    const keep = new Set(this.draft.filter((_, i) => i !== index).map((d) => d.id));
    this.draft = this.rollInto(keep);
    this.draftId += 1;
  }

  /** Skip the draft for a heal instead of an upgrade (T41). */
  skipDraft(): void {
    if (!this.leveling) return;
    this.player.health = Math.min(
      this.player.maxHealth,
      this.player.health + this.player.maxHealth * SKIP_HEAL_FRAC,
    );
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
    applyUpgrade(
      def,
      { player: this.player, mods: this.mods, effects: this.effects },
      this.upgradeLevels,
    );
    this.stats.upgradesTaken += 1; // run stat (V20)
    this.maybeEvolve(); // a pick may complete a weapon-evolution combo (T34, V18)
    this.pendingLevelUps -= 1;
    this.draft = [];
    this.leveling = false;
    if (this.pendingLevelUps > 0) this.openDraft();
  }

  /** If the just-applied upgrade completes the primary weapon's evolution combo,
   *  transform it (V18: gated by the combo, never weapon level alone). */
  private maybeEvolve(): void {
    const id = this.weaponSystem.primaryId;
    if (!id) return;
    const evo = availableEvolution(id, this.upgradeLevels);
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

  /** Boss kill → open the 3-choice major reward and freeze the sim (T43, V22). */
  private openBossReward(): void {
    this.bossRewarded = true;
    this.stats.bossKills += 1;
    this.bossRewardChoices = rollBossRewards(this.rewardCtx(), this.rng);
    if (this.bossRewardChoices.length === 0) return; // nothing to offer → run continues
    this.bossRewardId += 1;
    this.bossReward = true;
  }

  /** Rich post-game summary for the end screen (T23): final weapon, the build
   *  (upgrades taken), kills broken down by enemy type, bosses felled. */
  runSummary(): RunSummary {
    const killsByType = this.stats.killsByVariant
      .map((count, v) => ({ name: ENEMY_DISPLAY_NAME[v] ?? `Variant ${v}`, count: count ?? 0 }))
      .filter((k) => k.count > 0)
      .sort((a, b) => b.count - a.count);
    const upgrades = Object.entries(this.upgradeLevels)
      .map(([id, level]) => ({ name: DRAFT_POOL.find((u) => u.id === id)?.name ?? id, level }))
      .sort((a, b) => b.level - a.level);
    return {
      weapon: this.weaponSystem.weapons[0]?.def.displayName ?? '—',
      bossKills: this.stats.bossKills,
      killsByType,
      upgrades,
    };
  }

  /** Live character/build sheet — reused by the end screen, pause menu, warrior
   *  panel (T43). Reads the run-mod layer + player stats into readable rows. */
  characterSheet(): CharacterSheet {
    const m = this.mods;
    const s = this.player.stats;
    const p = this.player;
    const pct = (x: number): string => `${Math.round(x * 100)}%`;
    const attributes = [
      { label: 'Health', value: `${Math.round(p.health)} / ${Math.round(p.maxHealth)}` },
      { label: 'Damage', value: `×${m.damageMult.toFixed(2)}` },
      { label: 'Fire rate', value: `×${m.fireRateMult.toFixed(2)}` },
      { label: 'Crit bonus', value: `+${pct(m.critChanceAdd)}` },
      { label: 'Range', value: `×${m.rangeMult.toFixed(2)}` },
      { label: 'Projectiles', value: `${m.projectileCount}` },
      { label: 'Pierce', value: m.pierce > 0 ? `+${m.pierce}` : '—' },
      {
        label: 'Chain',
        value: m.chainCount > 0 ? `${m.chainCount} arc${m.chainCount > 1 ? 's' : ''}` : '—',
      },
      { label: 'Blast', value: m.blastRadius > 0 ? `${m.blastRadius.toFixed(1)} m` : '—' },
      { label: 'Move speed', value: s.moveSpeed.toFixed(1) },
      { label: 'Sprint', value: `${s.sprintCharges}× · ${s.sprintCooldown.toFixed(1)}s` },
      { label: 'Magnet', value: `${p.magnetRadius.toFixed(1)} m` },
    ];
    return {
      level: p.level,
      weapon: this.weaponSystem.weapons[0]?.def.displayName ?? '—',
      attributes,
      upgrades: this.runSummary().upgrades,
    };
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
  }
}
