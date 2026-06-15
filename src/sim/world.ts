// Authoritative simulation state (V2). Render reads this; never mutates it.
// System order is fixed and documented here (§14.3).

import { Rng } from '../core/rng';
import { type Player, createPlayer, stepPlayer, resetPlayer } from './player';
import { EnemyPool } from './enemies';
import { EnemySystem } from './enemy-system';
import { WaveDirector, computeAdaptation } from './director/wave-director';
import { WeaponSystem } from './combat/weapon-system';
import { equip } from './combat/weapon';
import { contractualSidearm } from '../content/weapons/contractual-sidearm';
import { ShardPool } from './xp';
import { emitShards, stepXp } from './xp-system';
import { FxQueue } from './fx';
import { type RunMods, defaultMods, resetMods } from './progression/mods';
import { type PermanentLevels, applyPermanents } from './progression/permanents';
import { type RunStats, type RunResult, newRunStats, resetRunStats, computeResult } from './run';
import {
  type UpgradeDefinition,
  type UpgradeLevels,
  rollDraft,
  applyUpgrade,
} from './progression/upgrades';
import { UPGRADES } from '../content/upgrades/index';
import type { InputSnapshot } from '../core/input';

const COUNTDOWN_SECONDS = 3;

const ZERO_INPUT: InputSnapshot = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  pause: false,
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
  readonly weaponSystem: WeaponSystem;
  readonly shards: ShardPool;
  readonly mods: RunMods;
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

  // Leveling / draft (T18). While `leveling`, the sim freezes for the choice.
  leveling = false;
  draft: UpgradeDefinition[] = [];
  draftId = 0; // bumps each time a draft opens (distinguishes back-to-back drafts)
  pendingLevelUps = 0;
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
      this.end();
      return;
    }
    if (this.input.pause) this.paused = !this.paused;
    if (this.paused || this.leveling) return;

    // Pre-combat countdown: player can orient; no spawns; run clock held at 0.
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - dt);
      stepPlayer(this.player, this.input, dt);
      return;
    }

    this.tick++;
    this.elapsed += dt;

    const healthBefore = this.player.health;

    // Fixed system order (§14.3): player → director → enemy AI/contact → weapons → XP.
    stepPlayer(this.player, this.input, dt);
    // Adapt composition/pace to the build (bounded, V12) — never per-enemy stats.
    this.director.step(this.enemies, this.rng, this.elapsed, dt, computeAdaptation(this.mods));
    this.enemySystem.step(this.player, this.tick, dt);
    this.weaponSystem.step(
      this.player,
      this.enemies,
      this.enemySystem.hash,
      this.mods,
      this.rng,
      dt,
      this.fx,
    );
    emitShards(this.shards, this.weaponSystem.kills);
    this.pendingLevelUps += stepXp(this.shards, this.player, dt);

    // Accumulate run stats from this step's authoritative events (V20).
    this.stats.kills += this.weaponSystem.kills.length;
    this.stats.damageDealt += this.weaponSystem.damageThisStep;
    // Health only drops from damage this step (heals/maxHP changes happen while
    // the sim is frozen for a draft), so the positive delta is damage taken.
    this.stats.damageTaken += Math.max(0, healthBefore - this.player.health);
    this.stats.timeSurvived = this.elapsed;
    this.stats.level = this.player.level;

    if (this.pendingLevelUps > 0 && !this.leveling) this.openDraft();

    // Death ends the run after the step that killed the player (V15 → result).
    if (!this.alive) this.end();
  }

  /** Latch the run as over and compute the post-game result once (T22, V20). */
  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.result = computeResult(this.stats);
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
    this.countdown = COUNTDOWN_SECONDS;
    this.started = false;
    for (const k of Object.keys(this.upgradeLevels)) delete this.upgradeLevels[k];

    resetPlayer(this.player);
    applyPermanents(this.player, this.permanents); // re-apply owned meta upgrades
    this.enemies.count = 0;
    this.shards.count = 0;
    this.fx.clear();
    resetMods(this.mods);
    this.director.reset();
    this.weaponSystem.reset();
    this.weaponSystem.add(equip(contractualSidearm));
    resetRunStats(this.stats);
  }

  private openDraft(): void {
    this.draft = rollDraft(UPGRADES, this.upgradeLevels, this.rng);
    if (this.draft.length === 0) {
      // Pool exhausted — nothing to offer; consume pending level-ups.
      this.pendingLevelUps = 0;
      this.leveling = false;
      return;
    }
    this.draftId += 1;
    this.leveling = true;
  }

  /** Apply the chosen draft option, then open the next draft or resume. */
  choose(index: number): void {
    if (!this.leveling) return;
    const def = this.draft[index];
    if (!def) return;
    applyUpgrade(def, { player: this.player, mods: this.mods }, this.upgradeLevels);
    this.stats.upgradesTaken += 1; // run stat (V20)
    this.pendingLevelUps -= 1;
    this.draft = [];
    this.leveling = false;
    if (this.pendingLevelUps > 0) this.openDraft();
  }
}
