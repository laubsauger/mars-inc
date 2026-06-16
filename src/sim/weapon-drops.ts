// Weapon drops (T33, Borderlands-style). Kills occasionally drop a weapon crate;
// the boss always does. Walk over a crate to swap your primary weapon to it. The
// crates are pooled (V5), deterministic via the shared rng (V16), and damage
// nothing — pure pickups. A pure view renders them (V2).

import type { Player } from './player';
import type { Rng } from '../core/rng';
import type { FxQueue } from './fx';
import type { KillEvent } from './combat/weapon-system';
import type { WeaponSystem } from './combat/weapon-system';
import { WEAPONS } from '../content/weapons/index';

export const MAX_WEAPON_DROPS = 32;

const BOSS_VARIANT = 2;
const DROP_CHANCE = 0.015; // per ordinary kill
const PICKUP_RADIUS = 1.4;
// Droppable pool excludes the starter sidearm (index 0) — drops feel like finds.
const DROP_POOL_START = 1;

export class WeaponDropPool {
  count = 0;
  readonly posX = new Float32Array(MAX_WEAPON_DROPS);
  readonly posZ = new Float32Array(MAX_WEAPON_DROPS);
  /** Index into WEAPONS. */
  readonly weapon = new Uint8Array(MAX_WEAPON_DROPS);

  spawn(x: number, z: number, weapon: number): number {
    if (this.count >= MAX_WEAPON_DROPS) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.weapon[i] = weapon;
    return i;
  }

  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.posX[i] = this.posX[last]!;
      this.posZ[i] = this.posZ[last]!;
      this.weapon[i] = this.weapon[last]!;
    }
  }
}

export class WeaponDropSystem {
  readonly pool = new WeaponDropPool();
  /** Set when the player swaps weapons this step (HUD can react). */
  justPicked: string | null = null;

  reset(): void {
    this.pool.count = 0;
    this.justPicked = null;
  }

  private rollWeapon(rng: Rng): number {
    return DROP_POOL_START + rng.int(0, WEAPONS.length - 1 - DROP_POOL_START);
  }

  step(
    player: Player,
    kills: readonly KillEvent[],
    weapons: WeaponSystem,
    rng: Rng,
    fx: FxQueue,
  ): void {
    this.justPicked = null;

    // Drop crates from this step's kills (boss guaranteed, others by chance).
    for (const k of kills) {
      const guaranteed = k.variant === BOSS_VARIANT;
      if (guaranteed || rng.next() < DROP_CHANCE) {
        this.pool.spawn(k.x, k.z, this.rollWeapon(rng));
        fx.push('impact', k.x, k.z);
      }
    }

    // Collect crates the player walks over → swap primary weapon.
    const pr = PICKUP_RADIUS + player.stats.collisionRadius;
    for (let i = this.pool.count - 1; i >= 0; i--) {
      const dx = this.pool.posX[i]! - player.pos.x;
      const dz = this.pool.posZ[i]! - player.pos.z;
      if (dx * dx + dz * dz > pr * pr) continue;
      const def = WEAPONS[this.pool.weapon[i]!]!;
      if (weapons.primaryId !== def.id) {
        weapons.setPrimary(def);
        this.justPicked = def.id;
      }
      fx.push('impact', this.pool.posX[i]!, this.pool.posZ[i]!);
      this.pool.kill(i);
    }
  }
}
