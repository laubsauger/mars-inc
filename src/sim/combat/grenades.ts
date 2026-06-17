// Player grenade (T-grenade). Right-mouse lobs a grenade that ARCS to the cursor
// and detonates on landing: pipeline-routed AoE (V3) + a radial knockback to part
// the horde. Pooled SoA, swap-remove, no per-frame alloc (V5). Deterministic (V16).

import type { EnemyPool } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Rng } from '../../core/rng';
import { type FxQueue, ImpactProfile } from '../fx';
import { applyAreaDamage } from './aoe';
import { radialPush, directionalPush } from './knockback';
import { applyStatus } from './status';

const MAX_GRENADES = 8;
/** Max lob distance (world units). Exported so the aim overlay can draw the
 *  grenade's reach — its range is decoupled from weapon range, which confuses. */
export const GRENADE_MAX_THROW = 15;
const SLING_SPEED = 15; // world units/s — constant, so a longer lob takes LONGER
const MIN_FLIGHT = 0.14; // floor so a point-blank toss still arcs a touch
const ARC_HEIGHT = 2.6; // visual lob height (y only — never affects sim, V4)
const FALLOFF = 0.7; // blast damage drops to 30% at the rim — crowd splash, not one-shot
const FORWARD_BIAS = 0.65; // knockback lean toward the throw direction (grenade-launcher feel)

export class GrenadeSystem {
  count = 0;
  readonly srcX = new Float32Array(MAX_GRENADES);
  readonly srcZ = new Float32Array(MAX_GRENADES);
  readonly tgtX = new Float32Array(MAX_GRENADES);
  readonly tgtZ = new Float32Array(MAX_GRENADES);
  private readonly t = new Float32Array(MAX_GRENADES); // 0..1 flight progress
  private readonly dur = new Float32Array(MAX_GRENADES); // flight seconds (distance/SLING_SPEED)
  // Interpolated pose for the render layer (read-only view, V2).
  readonly posX = new Float32Array(MAX_GRENADES);
  readonly posZ = new Float32Array(MAX_GRENADES);
  readonly posY = new Float32Array(MAX_GRENADES);
  private damage = 18;
  private radius = 3.6;
  private knockback = 30; // strong shove so it carves a path through reps
  private molotov = false; // leaves the blast area on fire (burn)
  private ids: number[] = []; // scratch for the molotov radius query (V5)

  /** Current blast radius (for the render reticle). */
  get blastRadius(): number {
    return this.radius;
  }

  reset(): void {
    this.count = 0;
  }

  /** Power the grenade from the build (mods drive damage / radius / knockback /
   *  molotov, T-grenade progression). Read at throw time. */
  configure(damage: number, radius: number, knockback: number, molotov: boolean): void {
    this.damage = damage;
    this.radius = radius;
    this.knockback = knockback;
    this.molotov = molotov;
  }

  /** Lob a grenade from `(sx,sz)` toward `(tx,tz)`. No-op when the pool is full. */
  throwAt(sx: number, sz: number, tx: number, tz: number): void {
    if (this.count >= MAX_GRENADES) return;
    const i = this.count++;
    this.srcX[i] = sx;
    this.srcZ[i] = sz;
    this.tgtX[i] = tx;
    this.tgtZ[i] = tz;
    this.t[i] = 0;
    // Constant sling SPEED → flight time scales with distance (far = slower).
    const dist = Math.hypot(tx - sx, tz - sz);
    this.dur[i] = Math.max(MIN_FLIGHT, dist / SLING_SPEED);
    this.posX[i] = sx;
    this.posZ[i] = sz;
    this.posY[i] = 0.4;
  }

  /** Advance flights; detonate on landing (AoE + radial knockback). Returns dmg. */
  step(enemies: EnemyPool, hash: SpatialHash, rng: Rng, fx: FxQueue, dt: number): number {
    let dealt = 0;
    for (let i = this.count - 1; i >= 0; i--) {
      this.t[i]! += dt / this.dur[i]!;
      const k = Math.min(1, this.t[i]!);
      const sx = this.srcX[i]!;
      const sz = this.srcZ[i]!;
      const tx = this.tgtX[i]!;
      const tz = this.tgtZ[i]!;
      this.posX[i] = sx + (tx - sx) * k;
      this.posZ[i] = sz + (tz - sz) * k;
      this.posY[i] = Math.sin(k * Math.PI) * ARC_HEIGHT + 0.4; // up then down

      if (this.t[i]! >= 1) {
        // Land → detonate at the target point regardless of what's between.
        dealt += applyAreaDamage(
          enemies,
          hash,
          tx,
          tz,
          this.radius,
          { amount: this.damage, damageType: 'explosive', falloff: FALLOFF, fx, hitFx: true },
          rng,
        );
        // Knockback. A grenade LAUNCHER punches downrange, so the outward shove is
        // biased toward the throw direction — near-side enemies get blown away from
        // the thrower instead of back into their lap. The Vacuum Charge PULL
        // (negative force) stays purely radial (a clean gather).
        if (this.knockback >= 0) {
          const fdx = tx - sx;
          const fdz = tz - sz;
          const fl = Math.hypot(fdx, fdz);
          if (fl > 1e-3) {
            directionalPush(
              enemies,
              hash,
              tx,
              tz,
              this.radius,
              this.knockback,
              fdx / fl,
              fdz / fl,
              FORWARD_BIAS,
            );
          } else {
            radialPush(enemies, hash, tx, tz, this.radius, this.knockback); // point-blank → radial
          }
        } else {
          radialPush(enemies, hash, tx, tz, this.radius, this.knockback);
        }
        if (this.molotov) {
          // Set the area alight — burn everything caught in the blast (T-grenade).
          const n = hash.queryCircle(tx, tz, this.radius, this.ids);
          for (let k = 0; k < n; k++) {
            const e = this.ids[k]!;
            if (e < enemies.count) {
              applyStatus(enemies, e, 'burn', { duration: 3, dps: this.damage * 0.3 });
            }
          }
        }
        // Explosion: blast RADIUS rides in dx so the render shockwave expands to
        // the true damage zone (visualizes the area that just got hit).
        fx.push('impact', tx, tz, this.radius, 0, ImpactProfile.Blast);
        const last = --this.count;
        if (i !== last) {
          this.srcX[i] = this.srcX[last]!;
          this.srcZ[i] = this.srcZ[last]!;
          this.tgtX[i] = this.tgtX[last]!;
          this.tgtZ[i] = this.tgtZ[last]!;
          this.t[i] = this.t[last]!;
          this.dur[i] = this.dur[last]!;
          this.posX[i] = this.posX[last]!;
          this.posZ[i] = this.posZ[last]!;
          this.posY[i] = this.posY[last]!;
        }
      }
    }
    return dealt;
  }
}
