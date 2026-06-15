// Authoritative simulation state (V2). Render reads this; never mutates it.
// System order is fixed and documented here (§14.3).

import { Rng } from '../core/rng';
import { type Player, createPlayer, stepPlayer } from './player';
import { EnemyPool } from './enemies';
import { EnemySystem } from './enemy-system';
import { Spawner } from './spawner';
import { WeaponSystem } from './combat/weapon-system';
import { equip } from './combat/weapon';
import { contractualSidearm } from '../content/weapons/contractual-sidearm';
import { ShardPool } from './xp';
import { emitShards, stepXp } from './xp-system';
import { type RunMods, defaultMods } from './progression/mods';
import {
  type UpgradeDefinition,
  type UpgradeLevels,
  rollDraft,
  applyUpgrade,
} from './progression/upgrades';
import { UPGRADES } from '../content/upgrades/index';
import type { InputSnapshot } from '../core/input';

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
  private readonly spawner: Spawner;
  input: InputSnapshot = ZERO_INPUT;
  paused = false;

  // Leveling / draft (T18). While `leveling`, the sim freezes for the choice.
  leveling = false;
  draft: UpgradeDefinition[] = [];
  draftId = 0; // bumps each time a draft opens (distinguishes back-to-back drafts)
  pendingLevelUps = 0;
  private readonly upgradeLevels: UpgradeLevels = {};

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.player = createPlayer();
    this.enemies = new EnemyPool();
    this.enemySystem = new EnemySystem(this.enemies, 2);
    this.weaponSystem = new WeaponSystem();
    this.weaponSystem.add(equip(contractualSidearm));
    this.shards = new ShardPool();
    this.mods = defaultMods();
    this.spawner = new Spawner();
  }

  get alive(): boolean {
    return this.player.health > 0;
  }

  step(dt: number): void {
    if (this.input.pause) this.paused = !this.paused;
    if (this.paused || this.leveling || !this.alive) return;

    this.tick++;
    this.elapsed += dt;

    // Fixed system order (§14.3): player → spawn → enemy AI/contact → weapons → XP.
    stepPlayer(this.player, this.input, dt);
    this.spawner.step(this.enemies, this.rng, this.elapsed, dt);
    this.enemySystem.step(this.player, this.tick, dt);
    this.weaponSystem.step(
      this.player,
      this.enemies,
      this.enemySystem.hash,
      this.mods,
      this.rng,
      dt,
    );
    emitShards(this.shards, this.weaponSystem.kills);
    this.pendingLevelUps += stepXp(this.shards, this.player, dt);

    if (this.pendingLevelUps > 0 && !this.leveling) this.openDraft();
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
    this.pendingLevelUps -= 1;
    this.draft = [];
    this.leveling = false;
    if (this.pendingLevelUps > 0) this.openDraft();
  }
}
