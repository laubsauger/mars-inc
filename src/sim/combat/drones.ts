// Companion drones (T40/T42 drone family). Orbit the player and auto-hunt the
// nearest enemy, firing energy bolts into the SHARED projectile pool so they
// route through the centralized damage pipeline (V3), collide, and trigger
// on-hit effects exactly like the player's own shots — no special-case combat.
// SoA + fixed cap, no per-frame alloc (V5/V6). Deterministic (V16): no rng.

import type { Player } from '../player';
import { EnemyState, type EnemyPool } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { ProjectilePool } from './projectiles';
import type { WeaponDamageSpec } from './weapon';
import type { RunMods } from '../progression/mods';

const MAX_DRONES = 16;
const ORBIT_RADIUS = 2.8;
const ORBIT_SPEED = 1.7; // rad/s
const DRONE_RANGE = 15; // target acquisition radius
const FIRE_INTERVAL = 0.95; // s between a drone shot — slow; drones supplement, not a main gun
const PROJ_SPEED = 28;
const PROJ_RADIUS = 0.12; // smaller than the player's bolts (0.16+) so drones read as minor fire
const PROJ_LIFETIME = 0.9;

const DRONE_DMG: WeaponDamageSpec = {
  base: 2.5, // low — a companion chip, not a second primary (T35 drone tuning)
  additive: 0,
  multiplier: 1,
  critChance: 0, // no base crit — crit is earned entirely through upgrades
  critMultiplier: 1.5,
  type: 'energy',
};

export class DroneSystem {
  count = 0;
  readonly posX = new Float32Array(MAX_DRONES);
  readonly posZ = new Float32Array(MAX_DRONES);
  readonly prevX = new Float32Array(MAX_DRONES);
  readonly prevZ = new Float32Array(MAX_DRONES);
  private readonly cd = new Float32Array(MAX_DRONES);
  private spin = 0;
  private readonly ids: number[] = [];

  /** Match the active drone count to the player's drafted drones. */
  setCount(n: number): void {
    this.count = Math.max(0, Math.min(MAX_DRONES, n));
  }

  reset(): void {
    this.count = 0;
    this.spin = 0;
    this.cd.fill(0);
  }

  /**
   * Orbit + fire. `hash` must be the enemy spatial hash rebuilt THIS step (call
   * after the enemy system). `dmgMult` lets drones scale with the build's damage.
   */
  step(
    player: Player,
    enemies: EnemyPool,
    hash: SpatialHash,
    projectiles: ProjectilePool,
    dt: number,
    dmgMult: number,
    // The build's run mods — drones inherit the player's SCALAR stats (damage via
    // dmgMult, plus range + fire rate) so they scale with your whole build instead
    // of needing a separate drone skill branch.
    mods: RunMods,
    // Mechanic inheritance (blast/pierce/ricochet + global on-hit mods) is OPT-IN
    // via the Networked Munitions keystone — off by default (drones stay dumb bolts).
    inheritMechanics = false,
  ): void {
    if (this.count === 0) return;
    // Drones inherit the player's reach + fire cadence from the build.
    const range = DRONE_RANGE * mods.rangeMult;
    const fireInterval = FIRE_INTERVAL / Math.max(0.05, mods.fireRateMult);
    this.spin += ORBIT_SPEED * dt;
    for (let i = 0; i < this.count; i++) {
      const a = this.spin + (i / this.count) * Math.PI * 2;
      this.prevX[i] = this.posX[i]!;
      this.prevZ[i] = this.posZ[i]!;
      const dx0 = player.pos.x + Math.cos(a) * ORBIT_RADIUS;
      const dz0 = player.pos.z + Math.sin(a) * ORBIT_RADIUS;
      this.posX[i] = dx0;
      this.posZ[i] = dz0;

      this.cd[i] = Math.max(0, this.cd[i]! - dt);
      if (this.cd[i]! > 0) continue;

      // Nearest ACTIVE enemy within range (broad-phase, no per-enemy raycast V6).
      const n = hash.queryCircle(dx0, dz0, range, this.ids);
      let best = -1;
      let bestD2 = range * range;
      for (let k = 0; k < n; k++) {
        const e = this.ids[k]!;
        if (enemies.state[e] !== EnemyState.Active) continue;
        const ex = enemies.posX[e]! - dx0;
        const ez = enemies.posZ[e]! - dz0;
        const d2 = ex * ex + ez * ez;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = e;
        }
      }
      if (best < 0) continue;

      const ex = enemies.posX[best]! - dx0;
      const ez = enemies.posZ[best]! - dz0;
      const d = Math.hypot(ex, ez) || 1;
      const dmg: WeaponDamageSpec = { ...DRONE_DMG, multiplier: DRONE_DMG.multiplier * dmgMult };
      // Dumb bolt by default (no blast/pierce/ricochet, inherit OFF). With Networked
      // Munitions the drone carries the build's projectile mods + inherits on-hit.
      const blast = inheritMechanics ? mods.blastRadius : 0;
      const pierce = inheritMechanics ? Math.max(0, Math.floor(mods.pierce)) : 0;
      const bounces = inheritMechanics ? Math.max(0, Math.floor(mods.ricochet)) : 0;
      projectiles.spawn(
        dx0,
        dz0,
        (ex / d) * PROJ_SPEED,
        (ez / d) * PROJ_SPEED,
        PROJ_RADIUS,
        PROJ_LIFETIME,
        pierce,
        dmg,
        blast,
        0, // profile
        bounces,
        1, // procCoef
        inheritMechanics ? 1 : 0, // inherit global on-hit mods?
      );
      this.cd[i] = fireInterval;
    }
  }
}
