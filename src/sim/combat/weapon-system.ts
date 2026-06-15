// Weapon + projectile system (T14). Resolves a target per the weapon's targeting
// rule (mouse-aim for the starter sidearm; nearest / lowest-health kept for other
// weapons & upgrades), fires on cooldown into the pooled projectiles, then moves
// projectiles and resolves collisions through the centralized damage pipeline
// (V3). Dead enemies are flagged (health ≤ 0) and compacted after this system so
// hash indices stay valid during the collide loop.

import type { EnemyPool } from '../enemies';
import { EnemyState } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Player } from '../player';
import { applyRecoil } from '../movement';
import type { Rng } from '../../core/rng';
import { ProjectilePool } from './projectiles';
import { type WeaponInstance, type WeaponDamageSpec } from './weapon';
import { makePacket, computeOutgoing, applyMitigation } from './damage';
import type { RunMods } from '../progression/mods';
import type { FxQueue } from '../fx';

export interface KillEvent {
  x: number;
  z: number;
  variant: number;
}

const RECOIL_CAP = 0.4; // max per-shot velocity kick (V10)

export class WeaponSystem {
  readonly projectiles = new ProjectilePool();
  readonly weapons: WeaponInstance[] = [];
  /** On-kill events this step (XP drops consume these at T17). */
  readonly kills: KillEvent[] = [];
  /** Damage applied to enemy health this step (T22 run stats, V20). */
  damageThisStep = 0;
  private query: number[] = [];

  add(w: WeaponInstance): void {
    this.weapons.push(w);
  }

  /** Reset to a fresh-run baseline in place (T22 restart, no reload). */
  reset(): void {
    this.weapons.length = 0;
    this.projectiles.count = 0;
    this.kills.length = 0;
    this.damageThisStep = 0;
  }

  step(
    player: Player,
    enemies: EnemyPool,
    hash: SpatialHash,
    mods: RunMods,
    rng: Rng,
    dt: number,
    fx: FxQueue,
  ): void {
    this.kills.length = 0;
    this.damageThisStep = 0;
    this.fire(player, enemies, mods, rng, dt, fx);
    this.advanceProjectiles(enemies, hash, mods, rng, dt, fx);
    compactDead(enemies, this.kills, fx);
  }

  private fire(
    player: Player,
    enemies: EnemyPool,
    mods: RunMods,
    rng: Rng,
    dt: number,
    fx: FxQueue,
  ): void {
    for (const w of this.weapons) {
      w.cooldownLeft -= dt;
      if (w.cooldownLeft > 0) continue;

      const aim = resolveAim(w, player, enemies);
      if (!aim) continue; // nothing to shoot at and no cursor aim

      w.cooldownLeft = w.def.cooldown / Math.max(0.01, mods.fireRateMult);

      // Damage spec with run mods folded in (still resolved via the pipeline).
      const dmg: WeaponDamageSpec = {
        ...w.def.damage,
        multiplier: w.def.damage.multiplier * mods.damageMult,
        critChance: Math.min(1, w.def.damage.critChance + mods.critChanceAdd),
      };

      const p = w.def.projectile;
      const muzzle = player.stats.collisionRadius + 0.3;
      const aimAngle = Math.atan2(aim.x, aim.z);
      const shots = Math.max(1, mods.projectileCount);
      const pierce = p.pierce + Math.max(0, Math.floor(mods.pierce)); // run-mod pierce
      // Fan multishot evenly across spreadArc; single shot gets random jitter.
      for (let s = 0; s < shots; s++) {
        const fan = shots > 1 ? (s / (shots - 1) - 0.5) * mods.spreadArc : 0;
        const jitter = shots > 1 ? 0 : (rng.next() - 0.5) * w.def.spread;
        const a = aimAngle + fan + jitter;
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        this.projectiles.spawn(
          player.pos.x + dx * muzzle,
          player.pos.z + dz * muzzle,
          dx * p.speed,
          dz * p.speed,
          p.radius,
          p.lifetime,
          pierce,
          dmg,
        );
      }

      // Muzzle FX once per shot at the muzzle, aimed along fire direction.
      fx.push('muzzle', player.pos.x + aim.x * muzzle, player.pos.z + aim.z * muzzle, aim.x, aim.z);

      player.facing = Math.atan2(-aim.x, -aim.z); // match player-view nose convention
      player.vel = applyRecoil(
        player.vel,
        -aim.x,
        -aim.z,
        w.def.recoil,
        player.stats.recoilResistance,
        dt,
        RECOIL_CAP,
      );
    }
  }

  private advanceProjectiles(
    enemies: EnemyPool,
    hash: SpatialHash,
    rng: Rng,
    dt: number,
    fx: FxQueue,
  ): void {
    const pr = this.projectiles;
    for (let i = pr.count - 1; i >= 0; i--) {
      pr.prevX[i] = pr.posX[i]!;
      pr.prevZ[i] = pr.posZ[i]!;
      pr.posX[i]! += pr.velX[i]! * dt;
      pr.posZ[i]! += pr.velZ[i]! * dt;
      pr.life[i]! -= dt;

      let dead = pr.life[i]! <= 0;

      if (!dead) {
        const r = pr.radius[i]!;
        const n = hash.queryCircle(pr.posX[i]!, pr.posZ[i]!, r + 1, this.query);
        for (let k = 0; k < n; k++) {
          const e = this.query[k]!;
          if (e >= enemies.count || enemies.health[e]! <= 0) continue;
          if (enemies.state[e] !== EnemyState.Active) continue; // telegraph = invulnerable
          const rr = r + enemies.radius[e]!;
          const ex = pr.posX[i]! - enemies.posX[e]!;
          const ez = pr.posZ[i]! - enemies.posZ[e]!;
          if (ex * ex + ez * ez > rr * rr) continue;

          // Centralized damage pipeline (V3).
          const packet = makePacket({
            weaponId: 'projectile',
            baseDamage: pr.dmgBase[i]!,
            additive: pr.dmgAdd[i]!,
            multiplier: pr.dmgMult[i]!,
            critChance: pr.critChance[i]!,
            critMultiplier: pr.critMult[i]!,
          });
          const out = computeOutgoing(packet, rng);
          const mit = applyMitigation(out.amount, 0, 0); // enemies: no armor/shield yet
          // Count effective damage (clamp to remaining health, no overkill) for
          // run stats — must match what the sim actually removed (V20).
          this.damageThisStep += Math.min(mit.toHealth, enemies.health[e]!);
          enemies.health[e]! -= mit.toHealth;
          fx.push('impact', pr.posX[i]!, pr.posZ[i]!);

          if (pr.pierce[i]! <= 0) {
            dead = true;
            break;
          }
          pr.pierce[i]!--;
        }
      }

      if (dead) pr.kill(i);
    }
  }
}

/** Returns a unit aim direction (x,z) for the weapon, or null if no target.
 *  Exported for target-selection unit tests (T30, V19). */
export function resolveAim(
  w: WeaponInstance,
  player: Player,
  enemies: EnemyPool,
): { x: number; z: number } | null {
  const rule = w.def.targeting;

  // Mouse-directed: fire toward the ground cursor; soft-snap to the enemy
  // nearest the cursor when one is in range, else straight at the cursor.
  if (rule === 'aim' || rule === 'nearest-to-aim') {
    if (player.aim.has) {
      const ax = player.aim.x - player.pos.x;
      const az = player.aim.z - player.pos.z;
      if (rule === 'nearest-to-aim') {
        const snap = nearestToPoint(player, enemies, player.aim.x, player.aim.z, w.def.range);
        if (snap) return snap;
      }
      const l = Math.hypot(ax, az);
      if (l > 1e-6) return { x: ax / l, z: az / l };
    }
    // Fall back to nearest enemy when there's no cursor (e.g. keyboard-only).
    return nearestToPoint(player, enemies, player.pos.x, player.pos.z, w.def.range);
  }

  if (rule === 'lowest-health') return lowestHealth(player, enemies, w.def.range);
  return nearestToPoint(player, enemies, player.pos.x, player.pos.z, w.def.range);
}

function nearestToPoint(
  player: Player,
  enemies: EnemyPool,
  qx: number,
  qz: number,
  range: number,
): { x: number; z: number } | null {
  let best = -1;
  let bestD = range * range;
  for (let e = 0; e < enemies.count; e++) {
    if (enemies.state[e] !== EnemyState.Active) continue;
    // In-range from the player, ranked by distance to the query point.
    const px = enemies.posX[e]! - player.pos.x;
    const pz = enemies.posZ[e]! - player.pos.z;
    if (px * px + pz * pz > range * range) continue;
    const dx = enemies.posX[e]! - qx;
    const dz = enemies.posZ[e]! - qz;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return aimAt(player, enemies, best);
}

function lowestHealth(
  player: Player,
  enemies: EnemyPool,
  range: number,
): { x: number; z: number } | null {
  let best = -1;
  let bestHp = Infinity;
  for (let e = 0; e < enemies.count; e++) {
    if (enemies.state[e] !== EnemyState.Active) continue;
    const px = enemies.posX[e]! - player.pos.x;
    const pz = enemies.posZ[e]! - player.pos.z;
    if (px * px + pz * pz > range * range) continue;
    if (enemies.health[e]! < bestHp) {
      bestHp = enemies.health[e]!;
      best = e;
    }
  }
  return aimAt(player, enemies, best);
}

function aimAt(player: Player, enemies: EnemyPool, e: number): { x: number; z: number } | null {
  if (e < 0) return null;
  const dx = enemies.posX[e]! - player.pos.x;
  const dz = enemies.posZ[e]! - player.pos.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return { x: 1, z: 0 };
  return { x: dx / l, z: dz / l };
}

/** Swap-remove all dead enemies, emitting on-kill events (V5 pooling) + death FX. */
function compactDead(enemies: EnemyPool, kills: KillEvent[], fx: FxQueue): void {
  for (let i = enemies.count - 1; i >= 0; i--) {
    if (enemies.health[i]! <= 0) {
      const x = enemies.posX[i]!;
      const z = enemies.posZ[i]!;
      const variant = enemies.variant[i]!;
      kills.push({ x, z, variant });
      fx.push('death', x, z, 0, 0, variant);
      enemies.kill(i);
    }
  }
}
