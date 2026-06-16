// Enemy ranged-attack framework (T33). Faction-separated from the player weapon
// system: enemies fire their OWN projectiles and drop ground hazards, all of
// which damage the PLAYER. Two attack kinds share the plumbing:
//   - `lob`: arc a grenade to the player's ground point; it cooks off on a fuse,
//     telegraphing its blast radius (a ground ring) before detonating (AoE).
//   - `gun`: a straight fast projectile that hits the player on contact. Not yet
//     fielded by any enemy — the path exists so future enemy firearms slot in.
// Pools are SoA + swap-remove (V5); damage to the player goes through hitPlayer
// (i-frames/sprint forgiveness apply, so blasts are dodgeable). Determinism via
// the shared rng (V16). See [[ranged-enemy-framework]].

import { type EnemyPool, EnemyState, ENEMY_BY_VARIANT } from './enemies';
import { type Player, hitPlayer } from './player';
import type { Rng } from '../core/rng';
import type { FxQueue } from './fx';

export const MAX_ENEMY_PROJECTILES = 512;
export const MAX_HAZARDS = 256;

const enum ProjKind {
  Lob = 0,
  Gun = 1,
}

/** Lobbed grenades / gun rounds in flight (enemy faction). */
export class EnemyProjectilePool {
  count = 0;
  readonly posX = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly posZ = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly prevX = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly prevZ = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly velX = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly velZ = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly startX = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly startZ = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly elapsed = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly flightTime = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly kind = new Uint8Array(MAX_ENEMY_PROJECTILES);
  // Payload delivered on landing (lob) / contact (gun).
  readonly damage = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly blastRadius = new Float32Array(MAX_ENEMY_PROJECTILES);
  readonly fuse = new Float32Array(MAX_ENEMY_PROJECTILES);

  /** Render-only arc height (visual `y`, never sim — V4). 0 at ends, peak mid.
   *  Gun rounds fly flat (no arc) — they're straight tracers. */
  height(i: number, alpha: number): number {
    if (this.kind[i] === ProjKind.Gun) return 0;
    const t = (this.elapsed[i]! + alpha * (1 / 60)) / Math.max(1e-3, this.flightTime[i]!);
    const p = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = this.posX[i]! - this.startX[i]!;
    const dz = this.posZ[i]! - this.startZ[i]!;
    const peak = Math.min(6, Math.hypot(dx, dz) * 0.25 + 1);
    return Math.sin(p * Math.PI) * peak;
  }

  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.posX[i] = this.posX[last]!;
      this.posZ[i] = this.posZ[last]!;
      this.prevX[i] = this.prevX[last]!;
      this.prevZ[i] = this.prevZ[last]!;
      this.velX[i] = this.velX[last]!;
      this.velZ[i] = this.velZ[last]!;
      this.startX[i] = this.startX[last]!;
      this.startZ[i] = this.startZ[last]!;
      this.elapsed[i] = this.elapsed[last]!;
      this.flightTime[i] = this.flightTime[last]!;
      this.kind[i] = this.kind[last]!;
      this.damage[i] = this.damage[last]!;
      this.blastRadius[i] = this.blastRadius[last]!;
      this.fuse[i] = this.fuse[last]!;
    }
  }
}

/** Ground hazards: armed blast zones cooking off on a fuse (telegraph ring). */
export class HazardPool {
  count = 0;
  readonly posX = new Float32Array(MAX_HAZARDS);
  readonly posZ = new Float32Array(MAX_HAZARDS);
  readonly radius = new Float32Array(MAX_HAZARDS);
  readonly fuse = new Float32Array(MAX_HAZARDS);
  readonly fuseTotal = new Float32Array(MAX_HAZARDS);
  readonly damage = new Float32Array(MAX_HAZARDS);

  spawn(x: number, z: number, radius: number, fuse: number, damage: number): number {
    if (this.count >= MAX_HAZARDS) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.radius[i] = radius;
    this.fuse[i] = fuse;
    this.fuseTotal[i] = fuse;
    this.damage[i] = damage;
    return i;
  }

  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.posX[i] = this.posX[last]!;
      this.posZ[i] = this.posZ[last]!;
      this.radius[i] = this.radius[last]!;
      this.fuse[i] = this.fuse[last]!;
      this.fuseTotal[i] = this.fuseTotal[last]!;
      this.damage[i] = this.damage[last]!;
    }
  }
}

export class EnemyAttackSystem {
  readonly projectiles = new EnemyProjectilePool();
  readonly hazards = new HazardPool();

  reset(): void {
    this.projectiles.count = 0;
    this.hazards.count = 0;
  }

  step(enemies: EnemyPool, player: Player, rng: Rng, dt: number, fx: FxQueue): void {
    this.initiate(enemies, player, rng, dt, fx);
    this.advanceProjectiles(player, dt, fx);
    this.stepHazards(player, dt, fx);
  }

  /** Active enemies with a ranged profile fire when in range + off cooldown. */
  private initiate(enemies: EnemyPool, player: Player, rng: Rng, dt: number, fx: FxQueue): void {
    for (let e = 0; e < enemies.count; e++) {
      if (enemies.state[e] !== EnemyState.Active) continue;
      if (enemies.attackCd[e]! > 0) {
        enemies.attackCd[e]! -= dt;
        continue;
      }
      const attack = ENEMY_BY_VARIANT[enemies.variant[e]!]?.attack;
      if (!attack) continue;

      const ex = enemies.posX[e]!;
      const ez = enemies.posZ[e]!;
      const dx = player.pos.x - ex;
      const dz = player.pos.z - ez;
      const dist = Math.hypot(dx, dz);
      if (dist > attack.range) continue;

      enemies.attackCd[e] = attack.cooldown;
      const ax = dx / (dist || 1);
      const az = dz / (dist || 1);
      fx.push('muzzle', ex + ax * 0.6, ez + az * 0.6, ax, az); // shot tell (V9 spirit)
      if (attack.kind === 'lob') this.lob(ex, ez, player, attack, rng);
      else if (attack.kind === 'gun') this.gun(ex, ez, player, attack, rng);
    }
  }

  private gun(
    ex: number,
    ez: number,
    player: Player,
    a: { range: number; speed: number; damage: number; spread: number; burst?: number },
    rng: Rng,
  ): void {
    const pr = this.projectiles;
    // Straight shot(s) at the player; a spread cone (and burst) so a moving
    // target can slip the volley. burst > 1 = a shotgun-style spray.
    const baseAngle = Math.atan2(player.pos.x - ex, player.pos.z - ez);
    const pellets = Math.max(1, a.burst ?? 1);
    for (let b = 0; b < pellets; b++) {
      if (pr.count >= MAX_ENEMY_PROJECTILES) return;
      const angle = baseAngle + (rng.next() - 0.5) * a.spread;
      const dx = Math.sin(angle);
      const dz = Math.cos(angle);
      const i = pr.count++;
      pr.posX[i] = ex;
      pr.posZ[i] = ez;
      pr.prevX[i] = ex;
      pr.prevZ[i] = ez;
      pr.velX[i] = dx * a.speed;
      pr.velZ[i] = dz * a.speed;
      pr.startX[i] = ex;
      pr.startZ[i] = ez;
      pr.elapsed[i] = 0;
      pr.flightTime[i] = a.range / a.speed; // travel time to max range, then expire
      pr.kind[i] = ProjKind.Gun;
      pr.damage[i] = a.damage;
      pr.blastRadius[i] = 0;
      pr.fuse[i] = 0;
    }
  }

  private lob(
    ex: number,
    ez: number,
    player: Player,
    a: { speed: number; fuse: number; blastRadius: number; damage: number },
    rng: Rng,
  ): void {
    const pr = this.projectiles;
    if (pr.count >= MAX_ENEMY_PROJECTILES) return;
    // Aim at the player's ground point with a little scatter so it's dodgeable.
    const tx = player.pos.x + (rng.next() - 0.5) * 2;
    const tz = player.pos.z + (rng.next() - 0.5) * 2;
    const dist = Math.hypot(tx - ex, tz - ez) || 1e-3;
    const flight = dist / a.speed;
    const i = pr.count++;
    pr.posX[i] = ex;
    pr.posZ[i] = ez;
    pr.prevX[i] = ex;
    pr.prevZ[i] = ez;
    pr.velX[i] = ((tx - ex) / dist) * a.speed;
    pr.velZ[i] = ((tz - ez) / dist) * a.speed;
    pr.startX[i] = ex;
    pr.startZ[i] = ez;
    pr.elapsed[i] = 0;
    pr.flightTime[i] = flight;
    pr.kind[i] = ProjKind.Lob;
    pr.damage[i] = a.damage;
    pr.blastRadius[i] = a.blastRadius;
    pr.fuse[i] = a.fuse;
  }

  private advanceProjectiles(player: Player, dt: number, fx: FxQueue): void {
    const pr = this.projectiles;
    const hitR = player.stats.collisionRadius + 0.3; // gun-round hit radius
    for (let i = pr.count - 1; i >= 0; i--) {
      pr.prevX[i] = pr.posX[i]!;
      pr.prevZ[i] = pr.posZ[i]!;
      pr.posX[i]! += pr.velX[i]! * dt;
      pr.posZ[i]! += pr.velZ[i]! * dt;
      pr.elapsed[i]! += dt;

      if (pr.kind[i] === ProjKind.Gun) {
        // Straight round: hit the player on contact, else expire at max range.
        const dx = pr.posX[i]! - player.pos.x;
        const dz = pr.posZ[i]! - player.pos.z;
        if (dx * dx + dz * dz <= hitR * hitR) {
          hitPlayer(player, pr.damage[i]!);
          fx.push('impact', pr.posX[i]!, pr.posZ[i]!);
          pr.kill(i);
        } else if (pr.elapsed[i]! >= pr.flightTime[i]!) {
          pr.kill(i);
        }
        continue;
      }

      if (pr.elapsed[i]! >= pr.flightTime[i]!) {
        // Lob landed → arm a ground hazard at the impact point (telegraph → AoE).
        this.hazards.spawn(
          pr.posX[i]!,
          pr.posZ[i]!,
          pr.blastRadius[i]!,
          pr.fuse[i]!,
          pr.damage[i]!,
        );
        fx.push('impact', pr.posX[i]!, pr.posZ[i]!);
        pr.kill(i);
      }
    }
  }

  private stepHazards(player: Player, dt: number, fx: FxQueue): void {
    const hz = this.hazards;
    for (let i = hz.count - 1; i >= 0; i--) {
      hz.fuse[i]! -= dt;
      if (hz.fuse[i]! > 0) continue;
      // Detonate: AoE damage if the player is inside the (telegraphed) radius.
      const dx = player.pos.x - hz.posX[i]!;
      const dz = player.pos.z - hz.posZ[i]!;
      const r = hz.radius[i]!;
      if (dx * dx + dz * dz <= r * r) hitPlayer(player, hz.damage[i]!);
      fx.push('impact', hz.posX[i]!, hz.posZ[i]!);
      hz.kill(i);
    }
  }
}
