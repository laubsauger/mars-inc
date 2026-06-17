// Health pickups (T33+). Kills occasionally drop a medkit; walking over it heals
// the player. Pooled (V5), deterministic via the shared rng (V16). Auto-collected
// (unlike weapon crates, which are a deliberate E-press swap) so a hurt player
// just scoops them mid-fight. A pure view renders them as a red cross (V2).

import type { Player } from './player';
import type { Rng } from '../core/rng';
import type { FxQueue } from './fx';
import type { KillEvent } from './combat/weapon-system';

export const MAX_HEALTH_DROPS = 24;

const DROP_CHANCE = 0.02; // per ordinary kill
const HEAL = 25; // flat heal per pickup (clamped to maxHealth)
const PICKUP_RADIUS = 1.8;
/** Seconds a medkit lingers before it decays. */
export const HEALTH_TTL = 16;
export const HEALTH_FADE = 4; // last seconds: the view flashes a fade warning

export class HealthDropPool {
  count = 0;
  readonly posX = new Float32Array(MAX_HEALTH_DROPS);
  readonly posZ = new Float32Array(MAX_HEALTH_DROPS);
  readonly age = new Float32Array(MAX_HEALTH_DROPS);

  spawn(x: number, z: number): number {
    if (this.count >= MAX_HEALTH_DROPS) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.age[i] = 0;
    return i;
  }

  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.posX[i] = this.posX[last]!;
      this.posZ[i] = this.posZ[last]!;
      this.age[i] = this.age[last]!;
    }
  }
}

export class HealthDropSystem {
  readonly pool = new HealthDropPool();
  /** Hp restored this step (for FX / run feedback); 0 most steps. */
  healedThisStep = 0;

  reset(): void {
    this.pool.count = 0;
    this.healedThisStep = 0;
  }

  step(player: Player, kills: readonly KillEvent[], rng: Rng, fx: FxQueue, dt: number): void {
    this.healedThisStep = 0;

    // Drop medkits from this step's kills (chance-gated, bounded pool).
    for (const k of kills) {
      if (rng.next() < DROP_CHANCE) this.pool.spawn(k.x, k.z);
    }

    // Age out ignored kits so the floor stays clean.
    for (let i = this.pool.count - 1; i >= 0; i--) {
      this.pool.age[i]! += dt;
      if (this.pool.age[i]! >= HEALTH_TTL) this.pool.kill(i);
    }

    // Auto-collect on walk-over → heal (clamped). No-op visual still consumes it.
    const pr = PICKUP_RADIUS + player.stats.collisionRadius;
    const pr2 = pr * pr;
    for (let i = this.pool.count - 1; i >= 0; i--) {
      const dx = this.pool.posX[i]! - player.pos.x;
      const dz = this.pool.posZ[i]! - player.pos.z;
      if (dx * dx + dz * dz > pr2) continue;
      const healed = Math.min(HEAL, player.maxHealth - player.health);
      player.health = Math.min(player.maxHealth, player.health + HEAL);
      this.healedThisStep += Math.max(0, healed);
      fx.push('impact', this.pool.posX[i]!, this.pool.posZ[i]!);
      this.pool.kill(i);
    }
  }
}
