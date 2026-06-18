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
import { type Player, hitPlayer, applyChill } from './player';
import type { Rng } from '../core/rng';
import type { FxQueue } from './fx';
import { wallDistance } from './arena';

export const MAX_ENEMY_PROJECTILES = 512;
export const MAX_HAZARDS = 256;
export const MAX_BEAMS = 16; // laser sentinels are rare → a small pool suffices (V5)

/** Beam attack lifecycle (T-beam). Charging = telegraph (line thickens); Firing =
 *  the lethal flash along the locked line. Render reads this to draw the tell. */
export const enum BeamState {
  Charging = 0,
  Firing = 1,
}

/** Telegraphed-danger-lane look (render picks a colour set per style). The BeamPool
 *  is the GENERIC telegraph primitive — any heavy "get off this line" attack spawns
 *  a beam; `style` only tweaks appearance, all charge/lock/fire logic is shared. */
export const enum BeamStyle {
  Sentinel = 0, // hot crimson laser
  Charge = 1, // heavy amber lunge lane (boss charge)
}

const enum ProjKind {
  Lob = 0,
  Gun = 1,
}

/** True if the segment muzzle(ox,oz) → player has NO other Active enemy body sitting on
 *  it within `maxT` (the beam shooter only fires through a clear lane, not its allies). */
function hasClearShot(
  enemies: EnemyPool,
  self: number,
  ox: number,
  oz: number,
  dirX: number,
  dirZ: number,
  maxT: number,
): boolean {
  const PAD = 0.2; // a little slack so a body grazing the lane still blocks
  for (let j = 0; j < enemies.count; j++) {
    if (j === self || enemies.state[j] !== EnemyState.Active) continue;
    const rx = enemies.posX[j]! - ox;
    const rz = enemies.posZ[j]! - oz;
    const t = rx * dirX + rz * dirZ; // distance along the lane
    if (t <= 0 || t >= maxT) continue; // behind the muzzle or past the player
    const perp2 = rx * rx + rz * rz - t * t; // squared perpendicular distance to the lane
    const block = enemies.radius[j]! + PAD;
    if (perp2 < block * block) return false; // an ally body is in the way
  }
  return true;
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
  readonly frost = new Uint8Array(MAX_ENEMY_PROJECTILES); // 1 = lands a frost hazard
  readonly ownerVariant = new Uint8Array(MAX_ENEMY_PROJECTILES); // firing enemy (255 = unknown)

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
      this.frost[i] = this.frost[last]!;
      this.ownerVariant[i] = this.ownerVariant[last]!;
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
  /** 0 = explosive blast, 1 = frost (chills the player) — distinct telegraph. */
  readonly kind = new Uint8Array(MAX_HAZARDS);
  readonly ownerVariant = new Uint8Array(MAX_HAZARDS); // enemy that armed it (255 = unknown)

  spawn(
    x: number,
    z: number,
    radius: number,
    fuse: number,
    damage: number,
    kind = 0,
    ownerVariant = 255,
  ): number {
    if (this.count >= MAX_HAZARDS) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.radius[i] = radius;
    this.fuse[i] = fuse;
    this.fuseTotal[i] = fuse;
    this.damage[i] = damage;
    this.kind[i] = kind;
    this.ownerVariant[i] = ownerVariant;
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
      this.kind[i] = this.kind[last]!;
      this.ownerVariant[i] = this.ownerVariant[last]!;
    }
  }
}

/** Active laser beams (charging telegraph → lethal flash). SoA + swap-remove (V5).
 *  Origin/direction LOCK at charge start so the player can dodge off the line. */
export class BeamPool {
  count = 0;
  readonly ox = new Float32Array(MAX_BEAMS); // locked origin
  readonly oz = new Float32Array(MAX_BEAMS);
  readonly dirX = new Float32Array(MAX_BEAMS); // locked unit direction
  readonly dirZ = new Float32Array(MAX_BEAMS);
  readonly len = new Float32Array(MAX_BEAMS); // distance to the wall along dir
  readonly width = new Float32Array(MAX_BEAMS); // half-width that hits the player
  readonly timer = new Float32Array(MAX_BEAMS); // remaining time in the current state
  readonly total = new Float32Array(MAX_BEAMS); // charge duration (render progress)
  readonly damage = new Float32Array(MAX_BEAMS);
  readonly state = new Uint8Array(MAX_BEAMS);
  readonly style = new Uint8Array(MAX_BEAMS); // BeamStyle — render-only appearance tweak
  // Owner link so a CHARGING beam tracks the unit (knockback / shove moves the line
  // with the body until it fires). -1 = unowned (fixed, e.g. boss charge braces).
  readonly owner = new Int32Array(MAX_BEAMS);
  readonly ownerVariant = new Uint8Array(MAX_BEAMS); // validates the index wasn't reused

  spawn(
    ox: number,
    oz: number,
    dirX: number,
    dirZ: number,
    len: number,
    width: number,
    charge: number,
    damage: number,
    style: number = BeamStyle.Sentinel,
    owner = -1,
    ownerVariant = 0,
  ): number {
    if (this.count >= MAX_BEAMS) return -1;
    const i = this.count++;
    this.ox[i] = ox;
    this.oz[i] = oz;
    this.dirX[i] = dirX;
    this.dirZ[i] = dirZ;
    this.len[i] = len;
    this.width[i] = width;
    this.timer[i] = charge;
    this.total[i] = charge;
    this.damage[i] = damage;
    this.state[i] = BeamState.Charging;
    this.style[i] = style;
    this.owner[i] = owner;
    this.ownerVariant[i] = ownerVariant;
    return i;
  }

  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.ox[i] = this.ox[last]!;
      this.oz[i] = this.oz[last]!;
      this.dirX[i] = this.dirX[last]!;
      this.dirZ[i] = this.dirZ[last]!;
      this.len[i] = this.len[last]!;
      this.width[i] = this.width[last]!;
      this.timer[i] = this.timer[last]!;
      this.total[i] = this.total[last]!;
      this.damage[i] = this.damage[last]!;
      this.state[i] = this.state[last]!;
      this.style[i] = this.style[last]!;
      this.owner[i] = this.owner[last]!;
      this.ownerVariant[i] = this.ownerVariant[last]!;
    }
  }

  /** Charge progress 0..1 (0 = just started, 1 = about to fire) — the render reads
   *  this to thicken the telegraph line. Firing beams report 1. */
  chargeT(i: number): number {
    if (this.state[i] === BeamState.Firing) return 1;
    const t = this.total[i]!;
    return t > 0 ? 1 - this.timer[i]! / t : 1;
  }
}

export class EnemyAttackSystem {
  readonly projectiles = new EnemyProjectilePool();
  readonly hazards = new HazardPool();
  readonly beams = new BeamPool();

  reset(): void {
    this.projectiles.count = 0;
    this.hazards.count = 0;
    this.beams.count = 0;
  }

  step(enemies: EnemyPool, player: Player, rng: Rng, dt: number, fx: FxQueue): void {
    this.initiate(enemies, player, rng, dt, fx);
    this.followCharging(enemies); // charging beams track their (possibly shoved) owner
    this.advanceProjectiles(player, dt, fx);
    this.stepHazards(player, dt, fx);
    this.stepBeams(player, dt, fx);
  }

  /** While a beam is CHARGING, keep its origin on the owner's CURRENT position (a
   *  knockback shove drags the telegraph line with the body). The locked DIRECTION
   *  stays (you still dodge off the committed line); only the origin + length follow.
   *  Fired beams are locked. Validates the owner index wasn't reused by a swap-remove. */
  private followCharging(enemies: EnemyPool): void {
    const b = this.beams;
    // Backward so a CANCEL (swap-remove) doesn't skip a beam.
    for (let i = b.count - 1; i >= 0; i--) {
      if (b.state[i] !== BeamState.Charging) continue;
      const o = b.owner[i]!;
      if (o < 0) continue; // unowned fixed beam (boss-charge telegraph) — never auto-cancel
      const alive =
        o < enemies.count &&
        enemies.variant[o] === b.ownerVariant[i] &&
        enemies.state[o] === EnemyState.Active;
      if (!alive) {
        // The charging unit died (or was removed) mid-charge → CANCEL the attack
        // outright: no lock, no flash, no damage. Killing it before it can reach the
        // Firing state in stepBeams.
        b.kill(i);
        continue;
      }
      const muzzle = enemies.radius[o]! + 0.2; // emit from the hull edge
      const ox = enemies.posX[o]! + b.dirX[i]! * muzzle;
      const oz = enemies.posZ[o]! + b.dirZ[i]! * muzzle;
      b.ox[i] = ox;
      b.oz[i] = oz;
      b.len[i] = wallDistance(ox, oz, b.dirX[i]!, b.dirZ[i]!, 120);
    }
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

      const ax = dx / (dist || 1);
      const az = dz / (dist || 1);
      if (attack.kind === 'beam') {
        // Emit from the HULL EDGE (centre + dir × radius), not the centre — else the
        // beam starts inside the saucer and paints over the whole body. Lock the line
        // to the wall from there; hold the cooldown over the full charge + flash.
        const muzzle = enemies.radius[e]! + 0.2;
        const ox = ex + ax * muzzle;
        const oz = ez + az * muzzle;
        // Only fire with a CLEAR LANE to the player — don't charge a laser through a
        // crowd of its own allies (reads as friendly-fire / wasted telegraph). Blocked →
        // hold a short retry and wait for the lane to open.
        if (!hasClearShot(enemies, e, ox, oz, ax, az, dist - muzzle)) {
          enemies.attackCd[e] = 0.4;
          continue;
        }
        const len = wallDistance(ox, oz, ax, az, 120);
        this.beams.spawn(
          ox,
          oz,
          ax,
          az,
          len,
          attack.width,
          attack.charge,
          attack.damage,
          BeamStyle.Sentinel,
          e, // owner → the charging line tracks the body if it gets shoved
          enemies.variant[e]!,
        );
        enemies.attackCd[e] = attack.cooldown + attack.charge + attack.beamLife;
        // PLANT while it aims + fires (stop → aim → shoot → move). Knockback still
        // applies, so a shove can still slide it — and the beam follows (above).
        enemies.anchorTime[e] = attack.charge + attack.beamLife;
        fx.push('muzzle', ox, oz, ax, az); // charge tell at the muzzle
        continue;
      }
      enemies.attackCd[e] = attack.cooldown;
      fx.push('muzzle', ex + ax * 0.6, ez + az * 0.6, ax, az); // shot tell (V9 spirit)
      const ov = enemies.variant[e]!;
      if (attack.kind === 'lob') this.lob(ex, ez, player, attack, rng, ov);
      else if (attack.kind === 'gun') this.gun(ex, ez, player, attack, rng, ov);
    }
  }

  /** Charge → fire laser beams. On fire, one hitscan check: the player takes the
   *  hit if within `width` of the locked line segment (hitPlayer = i-frame aware). */
  private stepBeams(player: Player, dt: number, fx: FxQueue): void {
    const b = this.beams;
    for (let i = b.count - 1; i >= 0; i--) {
      b.timer[i]! -= dt;
      if (b.timer[i]! > 0) continue;
      if (b.state[i] === BeamState.Charging) {
        // Telegraph elapsed → FIRE. Resolve the hitscan once at the fire instant.
        b.state[i] = BeamState.Firing;
        b.timer[i] = 0.22; // lethal flash window (matches the def's beamLife feel)
        const ox = b.ox[i]!;
        const oz = b.oz[i]!;
        const dxp = player.pos.x - ox;
        const dzp = player.pos.z - oz;
        const t = Math.max(0, Math.min(b.len[i]!, dxp * b.dirX[i]! + dzp * b.dirZ[i]!));
        const cx = ox + b.dirX[i]! * t;
        const cz = oz + b.dirZ[i]! * t;
        // damage 0 = a pure telegraph beam (e.g. the boss charge danger-line) — it
        // flashes but never hits; the charging body deals the damage.
        if (
          b.damage[i]! > 0 &&
          Math.hypot(player.pos.x - cx, player.pos.z - cz) <=
            b.width[i]! + player.stats.collisionRadius
        ) {
          hitPlayer(player, b.damage[i]!, { variant: b.ownerVariant[i]!, kind: 'laser' });
        }
        fx.push('impact', cx, cz, b.dirX[i]!, b.dirZ[i]!); // beam scorch where it lands
      } else {
        b.kill(i); // flash done
      }
    }
  }

  private gun(
    ex: number,
    ez: number,
    player: Player,
    a: { range: number; speed: number; damage: number; spread: number; burst?: number },
    rng: Rng,
    ownerVariant = 255,
  ): void {
    const pellets = Math.max(1, a.burst ?? 1);
    for (let b = 0; b < pellets; b++) {
      this.gunShot(
        ex,
        ez,
        player.pos.x,
        player.pos.z,
        a.speed,
        a.damage,
        a.spread,
        a.range,
        rng,
        ownerVariant,
      );
    }
  }

  private lob(
    ex: number,
    ez: number,
    player: Player,
    a: { speed: number; fuse: number; blastRadius: number; damage: number; freeze?: boolean },
    rng: Rng,
    ownerVariant = 255,
  ): void {
    // Aim at the player's ground point with a little scatter so it's dodgeable.
    const tx = player.pos.x + (rng.next() - 0.5) * 2;
    const tz = player.pos.z + (rng.next() - 0.5) * 2;
    this.lobAt(ex, ez, tx, tz, a.speed, a.fuse, a.blastRadius, a.damage, a.freeze, ownerVariant);
  }

  // ---- Public spawn primitives (shared by initiate + the boss, T33) ----------

  /** Lob a grenade from (ex,ez) to ground point (tx,tz); cooks off into AoE.
   *  `freeze` arms a frost hazard (chills the player) instead of a blast. */
  lobAt(
    ex: number,
    ez: number,
    tx: number,
    tz: number,
    speed: number,
    fuse: number,
    blastRadius: number,
    damage: number,
    freeze = false,
    ownerVariant = 255,
  ): void {
    const pr = this.projectiles;
    if (pr.count >= MAX_ENEMY_PROJECTILES) return;
    const dist = Math.hypot(tx - ex, tz - ez) || 1e-3;
    const i = pr.count++;
    pr.posX[i] = ex;
    pr.posZ[i] = ez;
    pr.prevX[i] = ex;
    pr.prevZ[i] = ez;
    pr.velX[i] = ((tx - ex) / dist) * speed;
    pr.velZ[i] = ((tz - ez) / dist) * speed;
    pr.startX[i] = ex;
    pr.startZ[i] = ez;
    pr.elapsed[i] = 0;
    pr.flightTime[i] = dist / speed;
    pr.kind[i] = ProjKind.Lob;
    pr.damage[i] = damage;
    pr.blastRadius[i] = blastRadius;
    pr.fuse[i] = fuse;
    pr.frost[i] = freeze ? 1 : 0;
    pr.ownerVariant[i] = ownerVariant;
  }

  /** Fire one straight round from (ex,ez) toward (tx,tz) with a spread cone. */
  gunShot(
    ex: number,
    ez: number,
    tx: number,
    tz: number,
    speed: number,
    damage: number,
    spread: number,
    range: number,
    rng: Rng,
    ownerVariant = 255,
  ): void {
    const pr = this.projectiles;
    if (pr.count >= MAX_ENEMY_PROJECTILES) return;
    const angle = Math.atan2(tx - ex, tz - ez) + (rng.next() - 0.5) * spread;
    const i = pr.count++;
    pr.posX[i] = ex;
    pr.posZ[i] = ez;
    pr.prevX[i] = ex;
    pr.prevZ[i] = ez;
    pr.velX[i] = Math.sin(angle) * speed;
    pr.velZ[i] = Math.cos(angle) * speed;
    pr.startX[i] = ex;
    pr.startZ[i] = ez;
    pr.elapsed[i] = 0;
    pr.flightTime[i] = range / speed;
    pr.kind[i] = ProjKind.Gun;
    pr.damage[i] = damage;
    pr.blastRadius[i] = 0;
    pr.fuse[i] = 0;
    pr.ownerVariant[i] = ownerVariant;
  }

  /** Arm a ground hazard directly (the boss slam shockwave). */
  hazardAt(
    x: number,
    z: number,
    radius: number,
    fuse: number,
    damage: number,
    ownerVariant = 255,
  ): void {
    this.hazards.spawn(x, z, radius, fuse, damage, 0, ownerVariant);
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
          if (
            hitPlayer(player, pr.damage[i]!, { variant: pr.ownerVariant[i]!, kind: 'projectile' })
          ) {
            fx.push('dmg', player.pos.x, player.pos.z, pr.damage[i]!, 0, 2);
          }
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
          pr.frost[i]!,
          pr.ownerVariant[i]!,
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
      // Detonate. Inside the (telegraphed) radius: a blast hurts; a frost zone
      // chills the player (slow) instead, with only a light bite.
      const dx = player.pos.x - hz.posX[i]!;
      const dz = player.pos.z - hz.posZ[i]!;
      const r = hz.radius[i]!;
      const inside = dx * dx + dz * dz <= r * r;
      if (inside) {
        if (hz.kind[i] === 1) {
          applyChill(player, 2.5, 0.5); // 50% slow for 2.5s
          if (hitPlayer(player, hz.damage[i]!, { variant: hz.ownerVariant[i]!, kind: 'frost' })) {
            fx.push('dmg', player.pos.x, player.pos.z, hz.damage[i]!, 0, 2);
          }
        } else if (
          hitPlayer(player, hz.damage[i]!, { variant: hz.ownerVariant[i]!, kind: 'blast' })
        ) {
          fx.push('dmg', player.pos.x, player.pos.z, hz.damage[i]!, 0, 2);
        }
      }
      fx.push('impact', hz.posX[i]!, hz.posZ[i]!);
      hz.kill(i);
    }
  }
}
