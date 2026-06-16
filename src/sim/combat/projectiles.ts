// Projectile pool (T14). SoA, fixed capacity, swap-remove — pooled, no per-frame
// allocation (V5). Carries precomputed damage spec fields so a hit needs no
// lookup; the crit roll still happens at impact through the damage pipeline.

import type { WeaponDamageSpec } from './weapon';

export const MAX_PROJECTILES = 6000;

export class ProjectilePool {
  readonly capacity: number;
  count = 0;

  readonly posX: Float32Array;
  readonly posZ: Float32Array;
  readonly prevX: Float32Array;
  readonly prevZ: Float32Array;
  readonly velX: Float32Array;
  readonly velZ: Float32Array;
  readonly life: Float32Array;
  readonly radius: Float32Array;
  readonly pierce: Int16Array;

  // Damage spec per projectile (avoids an indirection at impact).
  readonly dmgBase: Float32Array;
  readonly dmgAdd: Float32Array;
  readonly dmgMult: Float32Array;
  readonly critChance: Float32Array;
  readonly critMult: Float32Array;
  /** Explosive blast radius; 0 = non-explosive (T33). */
  readonly blast: Float32Array;
  /** Impact visual profile (ImpactProfile) — drives the per-family hit FX (T37). */
  readonly profile: Uint8Array;
  /** Ricochet bounces remaining: on hit the projectile redirects to a new enemy
   *  instead of dying (distinct from instant chain arcs). 0 = no bounce. */
  readonly bounces: Int16Array;
  /** Brief park timer (s) at a bounce point so the redirect reads as a sequence. */
  readonly hold: Float32Array;
  /** Post-hit cooldown (s): a piercing projectile can't hit again until it has
   *  cleared the body it just struck, so pierce passes to the NEXT enemy instead
   *  of being eaten by re-hitting the same one every step. */
  readonly hitCd: Float32Array;
  /** Proc coefficient of the firing weapon (T69, V32): scales on-hit status/trigger
   *  strength when this projectile lands. 1 = reference. */
  readonly procCoef: Float32Array;
  /** 1 = this projectile inherits the build's GLOBAL on-hit mods (chain, knockback,
   *  status-on-hit triggers); 0 = a "dumb" bolt (drones) that does NOT, unless the
   *  Networked Munitions keystone is taken. Per-projectile so the pool stays shared. */
  readonly inherit: Uint8Array;
  /** Visual style index (weapon family) → the render picks shape/length/colour so
   *  guns read distinctly (sidearm bolt vs energy lance vs cannon shell). Cosmetic. */
  readonly style: Uint8Array;

  constructor(capacity: number = MAX_PROJECTILES) {
    this.capacity = capacity;
    this.posX = new Float32Array(capacity);
    this.posZ = new Float32Array(capacity);
    this.prevX = new Float32Array(capacity);
    this.prevZ = new Float32Array(capacity);
    this.velX = new Float32Array(capacity);
    this.velZ = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);
    this.pierce = new Int16Array(capacity);
    this.dmgBase = new Float32Array(capacity);
    this.dmgAdd = new Float32Array(capacity);
    this.dmgMult = new Float32Array(capacity);
    this.critChance = new Float32Array(capacity);
    this.critMult = new Float32Array(capacity);
    this.blast = new Float32Array(capacity);
    this.profile = new Uint8Array(capacity);
    this.bounces = new Int16Array(capacity);
    this.hold = new Float32Array(capacity);
    this.hitCd = new Float32Array(capacity);
    this.procCoef = new Float32Array(capacity);
    this.inherit = new Uint8Array(capacity);
    this.style = new Uint8Array(capacity);
  }

  spawn(
    x: number,
    z: number,
    vx: number,
    vz: number,
    radius: number,
    lifetime: number,
    pierce: number,
    dmg: WeaponDamageSpec,
    blast = 0,
    profile = 0,
    bounces = 0,
    procCoef = 1,
    inherit = 1,
    style = 0,
  ): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.prevX[i] = x;
    this.prevZ[i] = z;
    this.velX[i] = vx;
    this.velZ[i] = vz;
    this.life[i] = lifetime;
    this.radius[i] = radius;
    this.pierce[i] = pierce;
    this.dmgBase[i] = dmg.base;
    this.dmgAdd[i] = dmg.additive;
    this.dmgMult[i] = dmg.multiplier;
    this.critChance[i] = dmg.critChance;
    this.critMult[i] = dmg.critMultiplier;
    this.blast[i] = blast;
    this.profile[i] = profile;
    this.bounces[i] = bounces;
    this.hold[i] = 0;
    this.hitCd[i] = 0;
    this.procCoef[i] = procCoef;
    this.inherit[i] = inherit;
    this.style[i] = style;
    return i;
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
      this.life[i] = this.life[last]!;
      this.radius[i] = this.radius[last]!;
      this.pierce[i] = this.pierce[last]!;
      this.dmgBase[i] = this.dmgBase[last]!;
      this.dmgAdd[i] = this.dmgAdd[last]!;
      this.dmgMult[i] = this.dmgMult[last]!;
      this.critChance[i] = this.critChance[last]!;
      this.critMult[i] = this.critMult[last]!;
      this.blast[i] = this.blast[last]!;
      this.profile[i] = this.profile[last]!;
      this.bounces[i] = this.bounces[last]!;
      this.hold[i] = this.hold[last]!;
      this.hitCd[i] = this.hitCd[last]!;
      this.procCoef[i] = this.procCoef[last]!;
      this.inherit[i] = this.inherit[last]!;
      this.style[i] = this.style[last]!;
    }
  }
}
