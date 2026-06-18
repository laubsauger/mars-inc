// Orbital blades (T-orbit). Persistent spinning bodies that circle the player and
// SLICE any enemy they sweep over — a passive, position-based damage source with
// no aiming and no projectiles. SoA + fixed cap, no per-frame alloc (V5/V6).
// Damage routes through the centralized AoE pipeline (V3) on a fixed tick cadence
// so a blade can't nuke the same body every frame. Deterministic (V16).

import type { Player } from '../player';
import type { EnemyPool } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Rng } from '../../core/rng';
import { type FxQueue, ImpactProfile } from '../fx';
import { applyAreaDamage } from './aoe';

const MAX_BLADES = 8;
const ORBIT_SPEED = 3.2; // rad/s — visibly faster than drones (they're a weapon, not escorts)
const BLADE_RADIUS = 1.3; // slice footprint per blade
const HIT_PERIOD = 0.3; // s between damage ticks (the blade "bites" ~3.3×/s as it sweeps)

export class OrbitalSystem {
  count = 0;
  readonly posX = new Float32Array(MAX_BLADES);
  readonly posZ = new Float32Array(MAX_BLADES);
  readonly prevX = new Float32Array(MAX_BLADES);
  readonly prevZ = new Float32Array(MAX_BLADES);
  private spin = 0;
  private hitCd = 0;

  setCount(n: number): void {
    this.count = Math.max(0, Math.min(MAX_BLADES, n));
  }

  reset(): void {
    this.count = 0;
    this.spin = 0;
    this.hitCd = 0;
  }

  /**
   * Spin the blades around the player and, on the tick cadence, slice every enemy
   * each blade overlaps. `hash` must be the enemy hash rebuilt THIS step. Returns
   * total health removed (run stats, V20). `dmgPerBlade` already folds the build's
   * damage scaling; `radius` is the orbit distance from the player.
   */
  step(
    player: Player,
    enemies: EnemyPool,
    hash: SpatialHash,
    dmgPerBlade: number,
    radius: number,
    dt: number,
    rng: Rng,
    fx: FxQueue,
  ): number {
    if (this.count === 0) return 0;
    this.spin += ORBIT_SPEED * dt;
    for (let i = 0; i < this.count; i++) {
      const a = this.spin + (i / this.count) * Math.PI * 2;
      this.prevX[i] = this.posX[i]!;
      this.prevZ[i] = this.posZ[i]!;
      this.posX[i] = player.pos.x + Math.cos(a) * radius;
      this.posZ[i] = player.pos.z + Math.sin(a) * radius;
    }

    this.hitCd -= dt;
    if (this.hitCd > 0) return 0;
    this.hitCd = HIT_PERIOD;

    let dealt = 0;
    for (let i = 0; i < this.count; i++) {
      dealt += applyAreaDamage(
        enemies,
        hash,
        this.posX[i]!,
        this.posZ[i]!,
        BLADE_RADIUS,
        {
          amount: dmgPerBlade,
          critChance: 0,
          critMultiplier: 1.5,
          damageType: 'kinetic',
          fx,
          hitFx: true,
        },
        rng,
      );
    }
    if (dealt > 0) fx.push('impact', player.pos.x, player.pos.z, 0, 0, ImpactProfile.Tick);
    return dealt;
  }
}
