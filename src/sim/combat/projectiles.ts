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
    }
  }
}
