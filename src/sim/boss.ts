// Gatekeeper of Phobos — boss controller (T33). Turns the boss enemy from a
// damage sponge into a phased fight. Reads the boss out of the shared enemy pool
// and drives escalating, TELEGRAPHED attacks through the ranged framework
// (lobbed barrages, gun volleys, slam shockwaves) plus gate summons. Phase
// boundaries are HP fractions — crossing one "breaks" the boss (shockwave +
// adds), the readable beat RPG/action bosses use. Exposes a snapshot for the
// HUD health bar. Deterministic via the shared rng (V16).

import { type EnemyPool, EnemyState, RUST_MITE, BOSS_GATEKEEPER } from './enemies';
import type { Player } from './player';
import type { Rng } from '../core/rng';
import type { FxQueue } from './fx';
import type { EnemyAttackSystem } from './enemy-attacks';
import { ARENA_RADIUS } from './constants';

export const BOSS_NAME = 'Gatekeeper of Phobos';
export const BOSS_PHASES = 3;
const BOSS_VARIANT = BOSS_GATEKEEPER.variant;

export interface BossSnapshot {
  active: boolean;
  hp01: number;
  phase: number; // 0-based current phase
  phases: number;
  name: string;
}

export class BossController {
  active = false;
  hp01 = 0;
  /** True once the boss has been on the field and then killed (run win). */
  defeated = false;
  private everActive = false;
  private phase = 0;
  private timer = 0;

  reset(): void {
    this.active = false;
    this.hp01 = 0;
    this.defeated = false;
    this.everActive = false;
    this.phase = 0;
    this.timer = 0;
  }

  /** Drive the boss this step. No-op when no boss is on the field. */
  step(
    enemies: EnemyPool,
    player: Player,
    attacks: EnemyAttackSystem,
    rng: Rng,
    dt: number,
    fx: FxQueue,
  ): void {
    const b = this.findBoss(enemies);
    if (b < 0) {
      // Was on the field and now gone → killed (the run is won).
      if (this.everActive) this.defeated = true;
      this.active = false;
      this.hp01 = 0;
      return;
    }
    if (!this.active) {
      this.active = true;
      this.everActive = true;
      this.phase = 0;
      this.timer = this.cadence(0);
    }
    const hp = Math.max(0, enemies.health[b]!);
    this.hp01 = hp / BOSS_GATEKEEPER.maxHealth;

    // Phase break: crossing a threshold escalates + punishes with a shockwave/adds.
    const want = this.phaseFor(this.hp01);
    if (want > this.phase) {
      this.phase = want;
      this.onPhaseBreak(enemies, attacks, rng, fx, b);
    }

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cadence(this.phase);
      this.attack(enemies, player, attacks, rng, fx, b);
    }
  }

  snapshot(): BossSnapshot {
    return {
      active: this.active,
      hp01: this.hp01,
      phase: this.phase,
      phases: BOSS_PHASES,
      name: BOSS_NAME,
    };
  }

  private findBoss(enemies: EnemyPool): number {
    for (let i = 0; i < enemies.count; i++) {
      if (enemies.variant[i] === BOSS_VARIANT && enemies.state[i] === EnemyState.Active) return i;
    }
    return -1;
  }

  private phaseFor(frac: number): number {
    return frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
  }

  private cadence(phase: number): number {
    return phase <= 0 ? 2.6 : phase === 1 ? 1.8 : 1.2; // faster each phase
  }

  /** The active attack pattern for the current phase. All telegraphed (V9 spirit). */
  private attack(
    enemies: EnemyPool,
    player: Player,
    attacks: EnemyAttackSystem,
    rng: Rng,
    fx: FxQueue,
    b: number,
  ): void {
    const ex = enemies.posX[b]!;
    const ez = enemies.posZ[b]!;
    const px = player.pos.x;
    const pz = player.pos.z;

    if (this.phase === 0) {
      // Single heavy aimed lob — learnable opener.
      attacks.lobAt(ex, ez, px, pz, 12, 1.1, 3.6, 22);
    } else if (this.phase === 1) {
      // Ring barrage: cage the player with a circle of cook-offs.
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        attacks.lobAt(ex, ez, px + Math.cos(a) * 4, pz + Math.sin(a) * 4, 12, 1.1, 3.0, 18);
      }
    } else {
      // Frantic: wide ring barrage + a gun volley straight at the player.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        attacks.lobAt(ex, ez, px + Math.cos(a) * 5, pz + Math.sin(a) * 5, 13, 1.0, 3.2, 18);
      }
      for (let k = 0; k < 3; k++) attacks.gunShot(ex, ez, px, pz, 26, 10, 0.3, 40, rng);
    }
    fx.push('muzzle', ex, ez, 0, 0);
  }

  /** On a phase break: slam shockwave centered on the boss + gate summons. */
  private onPhaseBreak(
    enemies: EnemyPool,
    attacks: EnemyAttackSystem,
    rng: Rng,
    fx: FxQueue,
    b: number,
  ): void {
    const ex = enemies.posX[b]!;
    const ez = enemies.posZ[b]!;
    attacks.hazardAt(ex, ez, 8 + this.phase * 2, 1.3, 24); // big telegraphed slam
    const adds = 2 + this.phase;
    for (let k = 0; k < adds; k++) {
      const ang = rng.range(0, Math.PI * 2);
      const r = ARENA_RADIUS - 2;
      enemies.spawn(RUST_MITE, Math.cos(ang) * r, Math.sin(ang) * r, 0.6, k);
    }
    fx.push('death', ex, ez); // heavy break cue
  }
}
