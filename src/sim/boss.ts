// Gatekeeper of Phobos — boss controller (T33). Turns the boss enemy from a
// damage sponge into a phased fight. Reads the boss out of the shared enemy pool
// and drives escalating, TELEGRAPHED attacks through the ranged framework
// (lobbed barrages, gun volleys, slam shockwaves) plus gate summons. Phase
// boundaries are HP fractions — crossing one "breaks" the boss (shockwave +
// adds), the readable beat RPG/action bosses use. Exposes a snapshot for the
// HUD health bar. Deterministic via the shared rng (V16).

import { type EnemyPool, EnemyState, RUST_MITE, BOSS_GATEKEEPER } from './enemies';
import { type Player, hitPlayer } from './player';
import type { Rng } from '../core/rng';
import type { FxQueue } from './fx';
import type { EnemyAttackSystem } from './enemy-attacks';
import { interiorPoint, wallDistance } from './arena';

// Charge attack (T-boss): a brief telegraph (a danger LINE drawn by a damage-0 beam)
// then a snap-slide of the boss body along it — keep moving or get run over.
const CHARGE_TELE = 0.85; // telegraph window (you read the line + dodge off it)
const CHARGE_SLIDE = 0.26; // the snap-slide is FAST (a lunge, not a walk)
const CHARGE_DMG = 30; // a heavy hit if the slide catches you
const CHARGE_LANE = 1.5; // danger-line half-width (≈ the boss body)

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
  /** True once ANY boss has been slain (Act-2 unlock / run "won"). */
  defeated = false;
  /** Per-kill EDGE: true only the step a boss dies — the world grants one reward +
   *  counts the kill, then the controller re-arms for the next boss wave (V22 ×N). */
  justDefeated = false;
  private phase = 0;
  private timer = 0;
  // Charge state: 0 idle · 1 telegraph (line shown, boss braced) · 2 sliding.
  private chargeState = 0;
  private chargeT = 0;
  private dirX = 0;
  private dirZ = 0;
  private sx = 0; // slide start
  private sz = 0;
  private tx = 0; // slide target
  private tz = 0;
  private chargeHit = false; // contact already dealt this slide

  reset(): void {
    this.active = false;
    this.hp01 = 0;
    this.defeated = false;
    this.justDefeated = false;
    this.phase = 0;
    this.timer = 0;
    this.chargeState = 0;
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
      // Boss left the field. If one was active it just DIED this step → fire the
      // per-kill edge (world rewards + counts it) and re-arm for the next wave.
      this.justDefeated = this.active;
      if (this.active) this.defeated = true;
      this.active = false;
      this.hp01 = 0;
      return;
    }
    this.justDefeated = false;
    if (!this.active) {
      this.active = true;
      this.phase = 0;
      this.timer = this.cadence(0);
    }
    const hp = Math.max(0, enemies.health[b]!);
    // Per-instance max so the HP bar reads correctly for SCALED (escalating) bosses.
    this.hp01 = hp / Math.max(1, enemies.maxHp[b]! || BOSS_GATEKEEPER.maxHealth);

    // Phase break: crossing a threshold escalates + punishes with a shockwave/adds.
    const want = this.phaseFor(this.hp01);
    if (want > this.phase) {
      this.phase = want;
      this.onPhaseBreak(enemies, attacks, rng, fx, b);
    }

    // A charge OWNS the boss while it runs (telegraph + slide) — no other attacks
    // fire, and the boss body position is driven directly here, overriding steering.
    if (this.chargeState > 0) {
      this.driveCharge(enemies, player, fx, b, dt);
      return;
    }

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cadence(this.phase);
      // From phase 1 on, sometimes LUNGE instead of barraging — a movement check.
      if (this.phase >= 1 && rng.next() < 0.35) {
        this.startCharge(enemies, player, attacks, fx, b);
      } else {
        this.attack(enemies, player, attacks, rng, fx, b);
      }
    }
  }

  /** Begin a charge: lock the line toward the player, draw the danger telegraph (a
   *  damage-0 beam to the target), and brace. */
  private startCharge(
    enemies: EnemyPool,
    player: Player,
    attacks: EnemyAttackSystem,
    fx: FxQueue,
    b: number,
  ): void {
    const ex = enemies.posX[b]!;
    const ez = enemies.posZ[b]!;
    let dx = player.pos.x - ex;
    let dz = player.pos.z - ez;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Charge to just PAST the player, capped at the wall (minus the body so it
    // doesn't bury itself in the wall).
    const wall = wallDistance(ex, ez, dx, dz, 60) - enemies.radius[b]!;
    const dist = Math.min(wall, l + 4);
    this.dirX = dx;
    this.dirZ = dz;
    this.sx = ex;
    this.sz = ez;
    this.tx = ex + dx * dist;
    this.tz = ez + dz * dist;
    this.chargeState = 1;
    this.chargeT = CHARGE_TELE;
    this.chargeHit = false;
    // Danger line: a damage-0 telegraph beam (the render thickens it as it "charges",
    // and flashes when the boss launches) — reuses the laser-sentinel beam visual.
    attacks.beams.spawn(ex, ez, dx, dz, dist, CHARGE_LANE, CHARGE_TELE, 0);
    fx.push('muzzle', ex, ez, dx, dz);
  }

  /** Advance an in-progress charge: hold during the telegraph, then snap-slide the
   *  body along the line, running over the player for heavy contact. */
  private driveCharge(
    enemies: EnemyPool,
    player: Player,
    fx: FxQueue,
    b: number,
    dt: number,
  ): void {
    if (this.chargeState === 1) {
      // Telegraph: brace in place (override steering drift) until the line elapses.
      enemies.posX[b] = this.sx;
      enemies.posZ[b] = this.sz;
      enemies.velX[b] = 0;
      enemies.velZ[b] = 0;
      this.chargeT -= dt;
      if (this.chargeT <= 0) {
        this.chargeState = 2;
        this.chargeT = CHARGE_SLIDE;
        fx.push('muzzle', this.sx, this.sz, this.dirX, this.dirZ); // launch cue
      }
      return;
    }
    // Sliding: ease the body from start → target; deal one heavy contact hit if it
    // catches the player.
    this.chargeT -= dt;
    const p = Math.min(1, 1 - Math.max(0, this.chargeT) / CHARGE_SLIDE);
    const ease = p * (2 - p); // ease-out — a fast launch that settles
    const bx = this.sx + (this.tx - this.sx) * ease;
    const bz = this.sz + (this.tz - this.sz) * ease;
    enemies.posX[b] = bx;
    enemies.posZ[b] = bz;
    if (!this.chargeHit) {
      const ddx = player.pos.x - bx;
      const ddz = player.pos.z - bz;
      const rr = enemies.radius[b]! + player.stats.collisionRadius + 0.3;
      if (ddx * ddx + ddz * ddz <= rr * rr) {
        hitPlayer(player, CHARGE_DMG);
        this.chargeHit = true;
        fx.push('impact', bx, bz, this.dirX, this.dirZ);
      }
    }
    if (this.chargeT <= 0) {
      this.chargeState = 0;
      this.timer = this.cadence(this.phase); // resume normal cadence
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
      const p = interiorPoint(rng.next(), rng.next(), 0.7, 0.92); // near the walls
      enemies.spawn(RUST_MITE, p.x, p.z, 0.6, k);
    }
    fx.push('death', ex, ez); // heavy break cue
  }
}
