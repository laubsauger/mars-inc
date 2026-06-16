// Gravedigger pets (T-necro). A slain enemy can RISE as a pet that fights for you:
// it hunts the nearest enemy, claws it through the centralized damage pipeline (V3),
// and DECAYS — reanimation is temporary, and fighting wears it down faster, so pets
// "fight and die for us". Pooled SoA, swap-remove, capped (V5); deterministic via the
// shared rng (V16/V21). Pure sim (V2) — the view tints them friendly + adds HP bars.

import type { EnemyPool } from '../enemies';
import { EnemyState } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Rng } from '../../core/rng';
import type { FxQueue } from '../fx';
import { applyAreaDamage } from './aoe';
import { clampPoint } from '../arena';

export const MAX_PETS = 48;
const SEEK_RANGE = 18; // how far a pet looks for prey
const SPEED = 6.5; // pet move speed (faster than fodder so it can hunt)
const ATTACK_RANGE = 1.4; // claw reach beyond the combined radii
const ATTACK_CD = 0.4; // s between claws
const DECAY = 3.5; // passive HP loss/s (reanimation fades)
const COMBAT_DRAIN = 3; // extra HP lost per claw (fighting wears it down)
const ATTACK_RADIUS = 1.1; // pipeline AoE radius of a claw

export class PetPool {
  count = 0;
  readonly posX = new Float32Array(MAX_PETS);
  readonly posZ = new Float32Array(MAX_PETS);
  readonly prevX = new Float32Array(MAX_PETS);
  readonly prevZ = new Float32Array(MAX_PETS);
  readonly velX = new Float32Array(MAX_PETS);
  readonly velZ = new Float32Array(MAX_PETS);
  readonly hp = new Float32Array(MAX_PETS);
  readonly maxHp = new Float32Array(MAX_PETS);
  readonly dmg = new Float32Array(MAX_PETS);
  readonly size = new Float32Array(MAX_PETS);
  readonly atkCd = new Float32Array(MAX_PETS);
  readonly variant = new Uint8Array(MAX_PETS);

  spawn(x: number, z: number, variant: number, size: number, hp: number, dmg: number): number {
    if (this.count >= MAX_PETS) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.prevX[i] = x;
    this.prevZ[i] = z;
    this.velX[i] = 0;
    this.velZ[i] = 0;
    this.hp[i] = hp;
    this.maxHp[i] = hp;
    this.dmg[i] = dmg;
    this.size[i] = size;
    this.atkCd[i] = 0;
    this.variant[i] = variant & 0xff;
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
      this.hp[i] = this.hp[last]!;
      this.maxHp[i] = this.maxHp[last]!;
      this.dmg[i] = this.dmg[last]!;
      this.size[i] = this.size[last]!;
      this.atkCd[i] = this.atkCd[last]!;
      this.variant[i] = this.variant[last]!;
    }
  }

  clear(): void {
    this.count = 0;
  }
}

export class PetSystem {
  readonly pool = new PetPool();
  /** Damage pets dealt this step (folded into run stats, V20). */
  dealtThisStep = 0;
  private query: number[] = [];

  reset(): void {
    this.pool.clear();
    this.dealtThisStep = 0;
  }

  /** Try to raise a pet from a slain enemy (caller rolls necroChance). Pet power
   *  scales with `power`; variant drives the view's silhouette. */
  raise(x: number, z: number, variant: number, size: number, power: number, fx: FxQueue): void {
    const hp = 26 * power;
    const dmg = 9 * power;
    if (this.pool.spawn(x, z, variant, Math.max(0.55, size), hp, dmg) >= 0) {
      fx.push('teleport', x, z); // green-ish materialize: it rises to your side
    }
  }

  step(
    player: { pos: { x: number; z: number } },
    enemies: EnemyPool,
    hash: SpatialHash,
    rng: Rng,
    fx: FxQueue,
    dt: number,
  ): number {
    void player;
    this.dealtThisStep = 0;
    const p = this.pool;
    for (let i = p.count - 1; i >= 0; i--) {
      p.prevX[i] = p.posX[i]!;
      p.prevZ[i] = p.posZ[i]!;
      p.hp[i]! -= DECAY * dt; // reanimation fades
      if (p.atkCd[i]! > 0) p.atkCd[i]! -= dt;

      // Hunt the nearest active enemy in range.
      const t = this.nearestEnemy(enemies, hash, p.posX[i]!, p.posZ[i]!);
      if (t >= 0) {
        const dx = enemies.posX[t]! - p.posX[i]!;
        const dz = enemies.posZ[t]! - p.posZ[i]!;
        const d = Math.hypot(dx, dz) || 1;
        const reach = p.size[i]! + enemies.radius[t]! + ATTACK_RANGE;
        if (d > reach) {
          // Close in.
          p.velX[i] = (dx / d) * SPEED;
          p.velZ[i] = (dz / d) * SPEED;
          p.posX[i]! += p.velX[i]! * dt;
          p.posZ[i]! += p.velZ[i]! * dt;
        } else if (p.atkCd[i]! <= 0) {
          // Claw — pipeline-routed (V3), pushes a damage number on the victim.
          const dealt = applyAreaDamage(
            enemies,
            hash,
            enemies.posX[t]!,
            enemies.posZ[t]!,
            ATTACK_RADIUS,
            { amount: p.dmg[i]!, damageType: 'kinetic', fx },
            rng,
          );
          this.dealtThisStep += dealt;
          p.atkCd[i] = ATTACK_CD;
          p.hp[i]! -= COMBAT_DRAIN; // fighting wears it down → it dies FOR you
          fx.push('impact', p.posX[i]!, p.posZ[i]!);
        }
      }

      const c = clampPoint(p.posX[i]!, p.posZ[i]!, 0.6);
      p.posX[i] = c.x;
      p.posZ[i] = c.z;

      if (p.hp[i]! <= 0) {
        fx.push('death', p.posX[i]!, p.posZ[i]!, 0, 0, p.variant[i]!); // crumbles back to dust
        p.kill(i);
      }
    }
    return this.dealtThisStep;
  }

  /** Nearest active enemy within SEEK_RANGE, or -1. */
  private nearestEnemy(enemies: EnemyPool, hash: SpatialHash, x: number, z: number): number {
    const n = hash.queryCircle(x, z, SEEK_RANGE, this.query);
    let best = -1;
    let bestD2 = Infinity;
    for (let k = 0; k < n; k++) {
      const e = this.query[k]!;
      if (e >= enemies.count || enemies.health[e]! <= 0) continue;
      if (enemies.state[e] !== EnemyState.Active) continue;
      const dx = enemies.posX[e]! - x;
      const dz = enemies.posZ[e]! - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }
}
