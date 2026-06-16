// Weapon + projectile system (T14). Resolves a target per the weapon's targeting
// rule (mouse-aim for the starter sidearm; nearest / lowest-health kept for other
// weapons & upgrades), fires on cooldown into the pooled projectiles, then moves
// projectiles and resolves collisions through the centralized damage pipeline
// (V3). Dead enemies are flagged (health ≤ 0) and compacted after this system so
// hash indices stay valid during the collide loop.

import type { EnemyPool } from '../enemies';
import { EnemyState, ENEMY_BY_VARIANT } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Player } from '../player';
import { applyRecoil } from '../movement';
import type { Rng } from '../../core/rng';
import { ProjectilePool } from './projectiles';
import {
  type WeaponInstance,
  type WeaponDamageSpec,
  type WeaponDefinition,
  type WeaponFamily,
  equip,
} from './weapon';
import { makePacket, computeOutgoing, applyMitigation } from './damage';
import { applyAreaDamage } from './aoe';
import { knockbackFrom } from './knockback';
import type { RunMods } from '../progression/mods';
import type { ConditionalResult } from '../progression/effects';
import { type FxQueue, ImpactProfile } from '../fx';

/** Weapon family → its hit-FX profile (art doc: each family reads distinctly). */
function impactProfile(family: WeaponFamily): ImpactProfile {
  switch (family) {
    case 'sidearm':
    case 'drone':
      return ImpactProfile.Tick;
    case 'rotary':
      return ImpactProfile.Stitch;
    case 'explosive':
    case 'orbital':
      return ImpactProfile.Blast;
    case 'energy':
      return ImpactProfile.Arc;
  }
}

const NO_COND: ConditionalResult = { damageMult: 1, critAdd: 0 };

export interface KillEvent {
  x: number;
  z: number;
  variant: number;
}

/** Called at hit time (before compaction) so the enemy index is still valid —
 *  on-hit triggers + status application hang off this (T38/T39). */
export type OnHit = (enemy: number, crit: boolean) => void;

const RECOIL_CAP = 0.4; // max per-shot velocity kick (V10)
const RICOCHET_RETAIN = 0.8; // damage kept per ricochet bounce
const RICOCHET_HOLD = 0.05; // seconds a projectile parks at a bounce point

export class WeaponSystem {
  readonly projectiles = new ProjectilePool();
  readonly weapons: WeaponInstance[] = [];
  /** On-kill events this step (XP drops consume these at T17). */
  readonly kills: KillEvent[] = [];
  /** Damage applied to enemy health this step (T22 run stats, V20). */
  damageThisStep = 0;
  private query: number[] = [];
  private chainQuery: number[] = []; // scratch for chain-lightning arc lookup
  private chainVisited: number[] = []; // enemies already hit this chain (no repeats)

  add(w: WeaponInstance): void {
    this.weapons.push(w);
  }

  /** Swap the player's primary weapon (T33 weapon drops). Replaces slot 0. */
  setPrimary(def: WeaponDefinition): void {
    this.weapons[0] = equip(def);
  }

  /** Current primary weapon id (HUD / drop-dedup). */
  get primaryId(): string | undefined {
    return this.weapons[0]?.def.id;
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
    cond: ConditionalResult = NO_COND,
    onHit?: OnHit,
  ): void {
    this.kills.length = 0;
    this.damageThisStep = 0;
    this.fire(player, enemies, mods, rng, dt, fx, cond);
    this.advanceProjectiles(enemies, hash, mods, rng, dt, fx, onHit);
    compactDead(enemies, this.kills, fx);
  }

  private fire(
    player: Player,
    enemies: EnemyPool,
    mods: RunMods,
    rng: Rng,
    dt: number,
    fx: FxQueue,
    cond: ConditionalResult,
  ): void {
    for (const w of this.weapons) {
      w.cooldownLeft -= dt;
      if (w.cooldownLeft > 0) continue;

      const aim = resolveAim(w, player, enemies, mods.rangeMult);
      if (!aim) continue; // nothing to shoot at and no cursor aim

      w.cooldownLeft = w.def.cooldown / Math.max(0.01, mods.fireRateMult);

      // Damage spec with run mods + dynamic conditionals folded in (T38), still
      // resolved through the pipeline (V3).
      const dmg: WeaponDamageSpec = {
        ...w.def.damage,
        multiplier: w.def.damage.multiplier * mods.damageMult * cond.damageMult,
        critChance: Math.min(1, w.def.damage.critChance + mods.critChanceAdd + cond.critAdd),
      };

      const p = w.def.projectile;
      // Range is an authoritative reach attribute (progression, T33): the bullet
      // expires once it has flown the effective range, so `range` + rangeMult
      // actually limit how far you can shoot in aim mode (not just auto-target
      // acquisition). The def lifetime still caps it shorter for fast-fizzle
      // weapons (e.g. shotgun pellets). Hitscan/laser families can opt out later.
      const effRange = w.def.range * mods.rangeMult;
      const reachLifetime = effRange / Math.max(1e-3, p.speed);
      const life = Math.min(p.lifetime, reachLifetime);
      const muzzle = player.stats.collisionRadius + 0.3;
      const aimAngle = Math.atan2(aim.x, aim.z);
      // Total projectiles = the weapon's innate pellets × multishot stacks.
      const shots = Math.max(1, (w.def.pellets ?? 1) * mods.projectileCount);
      const arc = w.def.spreadArc ?? mods.spreadArc;
      const pierce = p.pierce + Math.max(0, Math.floor(mods.pierce)); // run-mod pierce
      const profile = impactProfile(w.def.family); // per-family hit FX (T37)
      // Fan multishot evenly across the arc; single shot gets random jitter.
      for (let s = 0; s < shots; s++) {
        const fan = shots > 1 ? (s / (shots - 1) - 0.5) * arc : 0;
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
          life,
          pierce,
          dmg,
          Math.max(w.def.explosiveRadius ?? 0, mods.blastRadius),
          profile,
          Math.max(0, Math.floor(mods.ricochet)),
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
    mods: RunMods,
    rng: Rng,
    dt: number,
    fx: FxQueue,
    onHit?: OnHit,
  ): void {
    const pr = this.projectiles;
    for (let i = pr.count - 1; i >= 0; i--) {
      // Bounce park (ricochet): the projectile dwells a few frames at the hit
      // point before launching at the next enemy, so the redirect reads as a
      // hit→hit sequence rather than a teleport. Frozen, no collision, still ages.
      if (pr.hold[i]! > 0) {
        pr.hold[i]! -= dt;
        pr.prevX[i] = pr.posX[i]!;
        pr.prevZ[i] = pr.posZ[i]!;
        pr.life[i]! -= dt;
        if (pr.life[i]! <= 0) pr.kill(i);
        continue;
      }
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
          // Concussive knockback: shove the enemy along the shot line (T42 CC).
          if (mods.knockback > 0) {
            knockbackFrom(enemies, e, pr.posX[i]!, pr.posZ[i]!, mods.knockback);
          }
          {
            const l = Math.hypot(pr.velX[i]!, pr.velZ[i]!) || 1;
            fx.push(
              'impact',
              pr.posX[i]!,
              pr.posZ[i]!,
              pr.velX[i]! / l,
              pr.velZ[i]! / l,
              pr.profile[i]!,
            );
          }
          // Blood spurt on biological hits, thrown along the projectile's travel
          // direction (art doc: matter exits away from the hit face).
          emitBlood(fx, enemies, e, pr.velX[i]!, pr.velZ[i]!);
          // Floating damage number at the enemy (amount in dx, crit flag in variant).
          fx.push('dmg', enemies.posX[e]!, enemies.posZ[e]!, mit.toHealth, 0, out.crit ? 1 : 0);
          // On-hit hook (before compaction → index valid): triggers + status (T38/T39).
          if (onHit) onHit(e, out.crit);

          // Chain lightning: arc reduced damage to nearby enemies (Arc Garnishment).
          if (mods.chainCount > 0) {
            this.chainLightning(enemies, hash, e, pr, i, mods, rng, fx);
          }

          // Explosive payload: detonate AoE on impact (V3-routed), then die —
          // overrides pierce. The direct-hit enemy is excluded (already damaged).
          if (pr.blast[i]! > 0) {
            const blastDealt = applyAreaDamage(
              enemies,
              hash,
              pr.posX[i]!,
              pr.posZ[i]!,
              pr.blast[i]!,
              {
                amount: pr.dmgBase[i]! * pr.dmgMult[i]!,
                critChance: pr.critChance[i]!,
                critMultiplier: pr.critMult[i]!,
                damageType: 'explosive',
                exclude: e,
              },
              rng,
            );
            this.damageThisStep += blastDealt;
            fx.push('impact', pr.posX[i]!, pr.posZ[i]!, 0, 0, ImpactProfile.Blast);
            // One aggregated number at the blast centre for the splash.
            if (blastDealt > 0) fx.push('dmg', pr.posX[i]!, pr.posZ[i]!, blastDealt, 0, 0);
            dead = true;
            break;
          }

          if (pr.pierce[i]! > 0) {
            pr.pierce[i]!--;
            continue; // pass through to the next enemy this step
          }
          // Out of pierce: ricochet to a fresh enemy if able, else die. The
          // redirected projectile is a VISIBLE bounce (own travel), unlike the
          // instant chain arc.
          if (pr.bounces[i]! > 0 && this.ricochetTo(enemies, hash, e, pr, i, mods, fx)) {
            dead = false;
            break;
          }
          dead = true;
          break;
        }
      }

      if (dead) pr.kill(i);
    }
  }

  /**
   * Redirect a projectile toward the nearest fresh enemy within `ricochetRange`
   * (a real bounce — the projectile keeps flying, distinct from the instant chain
   * arc). Preserves speed, weakens the hit a touch per bounce, and parks the
   * projectile briefly so the redirect reads as a sequence. Returns false (→ die)
   * when no target is in range. Deterministic: nearest-by-distance, no rng.
   */
  private ricochetTo(
    enemies: EnemyPool,
    hash: SpatialHash,
    fromE: number,
    pr: ProjectilePool,
    i: number,
    mods: RunMods,
    fx: FxQueue,
  ): boolean {
    const ox = pr.posX[i]!;
    const oz = pr.posZ[i]!;
    const n = hash.queryCircle(ox, oz, mods.ricochetRange, this.chainQuery);
    let bestE = -1;
    let bestD2 = mods.ricochetRange * mods.ricochetRange;
    for (let k = 0; k < n; k++) {
      const e = this.chainQuery[k]!;
      if (e === fromE || e >= enemies.count) continue;
      if (enemies.health[e]! <= 0 || enemies.state[e] !== EnemyState.Active) continue;
      const dx = enemies.posX[e]! - ox;
      const dz = enemies.posZ[e]! - oz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestE = e;
      }
    }
    if (bestE < 0) return false;

    const speed = Math.hypot(pr.velX[i]!, pr.velZ[i]!) || 1;
    const dx = enemies.posX[bestE]! - ox;
    const dz = enemies.posZ[bestE]! - oz;
    const l = Math.hypot(dx, dz) || 1;
    pr.velX[i] = (dx / l) * speed;
    pr.velZ[i] = (dz / l) * speed;
    // Step the projectile clear of the enemy it just hit (along the new heading)
    // so it doesn't immediately re-collide with the source and waste the bounce.
    const clear = enemies.radius[fromE]! + pr.radius[i]! + 0.1;
    pr.posX[i]! += (dx / l) * clear;
    pr.posZ[i]! += (dz / l) * clear;
    pr.dmgMult[i]! *= RICOCHET_RETAIN; // each bounce a bit weaker
    pr.bounces[i]!--;
    pr.hold[i] = RICOCHET_HOLD; // brief dwell → reads as a hit→hit sequence
    fx.push('muzzle', ox, oz, dx / l, dz / l); // small pop at the bounce point
    return true;
  }

  /**
   * Chain lightning: a TRAVELLING arc that hops struck-enemy → nearest unhit
   * neighbour → next, up to `mods.chainCount` jumps, each within `mods.chainRange`
   * of the PREVIOUS hop (a real chain, not a star from the origin) and weaker by
   * `mods.chainFalloff`. Emits a bolt per segment so it reads as lightning leaping
   * body to body. Pipeline-routed (V3), deterministic (nearest-by-distance, V16).
   */
  private chainLightning(
    enemies: EnemyPool,
    hash: SpatialHash,
    fromE: number,
    pr: ProjectilePool,
    i: number,
    mods: RunMods,
    rng: Rng,
    fx: FxQueue,
  ): void {
    let curX = enemies.posX[fromE]!;
    let curZ = enemies.posZ[fromE]!;
    let mult = pr.dmgMult[i]! * mods.chainFalloff;
    const visited = this.chainVisited;
    visited.length = 0;
    visited.push(fromE);

    for (let hop = 0; hop < mods.chainCount; hop++) {
      const n = hash.queryCircle(curX, curZ, mods.chainRange, this.chainQuery);
      let best = -1;
      let bestD2 = mods.chainRange * mods.chainRange;
      for (let k = 0; k < n; k++) {
        const e = this.chainQuery[k]!;
        if (e >= enemies.count || enemies.health[e]! <= 0) continue;
        if (enemies.state[e] !== EnemyState.Active) continue;
        if (visited.includes(e)) continue;
        const dx = enemies.posX[e]! - curX;
        const dz = enemies.posZ[e]! - curZ;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = e;
        }
      }
      if (best < 0) break; // chain dies out when no neighbour is in hop range

      const packet = makePacket({
        weaponId: 'chain',
        baseDamage: pr.dmgBase[i]!,
        additive: pr.dmgAdd[i]!,
        multiplier: mult,
        critChance: pr.critChance[i]!,
        critMultiplier: pr.critMult[i]!,
      });
      const out = computeOutgoing(packet, rng);
      const mit = applyMitigation(out.amount, 0, 0);
      this.damageThisStep += Math.min(mit.toHealth, enemies.health[best]!);
      enemies.health[best]! -= mit.toHealth;
      const bx = enemies.posX[best]!;
      const bz = enemies.posZ[best]!;
      fx.push('impact', bx, bz, 0, 0, ImpactProfile.Arc);
      emitBlood(fx, enemies, best, bx - curX, bz - curZ);
      fx.push('dmg', bx, bz, mit.toHealth, 0, out.crit ? 1 : 0);
      // Bolt for THIS segment: previous hop → this enemy (from x,z; to dx,dz).
      fx.push('chain', curX, curZ, bx, bz);
      visited.push(best);
      curX = bx;
      curZ = bz;
      mult *= mods.chainFalloff;
    }
  }
}

/** Push a blood-spray FX for a biological enemy hit. `hx,hz` = incoming travel
 *  direction (un-normalized ok); the render layer throws spurts that way and
 *  drops a directional floor decal. Mechanical enemies (no `gore`) spray nothing
 *  — their death dust covers it. Carries the enemy variant for blood vs ichor. */
function emitBlood(fx: FxQueue, enemies: EnemyPool, e: number, hx: number, hz: number): void {
  const v = enemies.variant[e]!;
  if (!ENEMY_BY_VARIANT[v]?.gore) return;
  const l = Math.hypot(hx, hz) || 1;
  fx.push('blood', enemies.posX[e]!, enemies.posZ[e]!, hx / l, hz / l, v);
}

/** Returns a unit aim direction (x,z) for the weapon, or null if no target.
 *  Exported for target-selection unit tests (T30, V19). */
export function resolveAim(
  w: WeaponInstance,
  player: Player,
  enemies: EnemyPool,
  rangeMult = 1,
): { x: number; z: number } | null {
  const rule = w.def.targeting;
  const range = w.def.range * rangeMult; // effective range (progression attribute)

  // Mouse-directed: fire toward the ground cursor; soft-snap to the enemy
  // nearest the cursor when one is in range, else straight at the cursor.
  if (rule === 'aim' || rule === 'nearest-to-aim') {
    if (player.aim.has) {
      const ax = player.aim.x - player.pos.x;
      const az = player.aim.z - player.pos.z;
      if (rule === 'nearest-to-aim') {
        const snap = nearestToPoint(player, enemies, player.aim.x, player.aim.z, range);
        if (snap) return snap;
      }
      const l = Math.hypot(ax, az);
      if (l > 1e-6) return { x: ax / l, z: az / l };
    }
    // Fall back to nearest enemy when there's no cursor (e.g. keyboard-only).
    return nearestToPoint(player, enemies, player.pos.x, player.pos.z, range);
  }

  if (rule === 'lowest-health') return lowestHealth(player, enemies, range);
  return nearestToPoint(player, enemies, player.pos.x, player.pos.z, range);
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
