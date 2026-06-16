// Corpse / Overkill build family (T65, §V27). Kills that land with OVERKILL
// (damage past 0 hp) leave a pooled corpse holding that overkill as stored
// energy — a build then TRANSFORMS what the corpse does:
//   • Waste Not (primer)        — kills store overkill in a corpse.
//   • Violent Recycling (engine)— corpses fuse-detonate → AoE scaled by stored.
//   • Body Ballistics (converter)— corpses launch at the nearest enemy first.
//   • Chain of Evidence (liability)— a detonation seeds a fresh, decaying corpse
//        (bounded chain) AND can singe the player in its blast (telegraphed).
//   • Moonshot (catastrophe)    — a huge corpse calls a telegraphed orbital
//        meteor: a big delayed strike.
//
// Authoritative sim (V2): pooled SoA, swap-remove, capped (V5); all damage routes
// through `applyAreaDamage`/`hitPlayer` (V3); deterministic — randomness only via
// the shared rng and fixed iteration order (V16/V21). The render layer reads the
// pool and never mutates it.

import { EnemyPool, EnemyState, ENEMY_BY_VARIANT } from '../enemies';
import type { SpatialHash } from '../spatial-hash';
import type { Rng } from '../../core/rng';
import type { FxQueue } from '../fx';
import { type Player, hitPlayer } from '../player';
import { applyAreaDamage } from './aoe';
import type { KillEvent } from './weapon-system';

const MAX_CORPSES = 256; // hard pool cap (V5) — excess kills just don't leave a body
const STORE_CAP = 400; // ceiling on stored overkill per corpse (bounded scaling)
const FUSE = 0.85; // s a stationary corpse sits before it pops
const LAUNCH_SPEED = 17; // ballistics travel speed
const LAUNCH_MAX = 1.3; // s max flight before a launched corpse detonates anyway
const SEEK_RADIUS = 22; // how far ballistics looks for a target
const BLAST_BASE = 1.6; // min detonation radius
const BLAST_PER_STORE = 0.045; // radius growth per stored point
const BLAST_MAX = 6; // radius ceiling
const DMG_FRAC = 0.85; // detonation damage = stored × this
const CHAIN_FRAC = 0.55; // a chained child inherits this much of the parent's store
const CHAIN_FLOOR = 8; // chains stop once stored drops below this → terminates (V30)
const SELF_DMG_FRAC = 0.22; // liability: player takes this frac if it stands in a blast
const MOONSHOT_DELAY = 1.2; // telegraph time before the meteor lands
const MOONSHOT_RADIUS = 7; // meteor blast radius
const MOONSHOT_DMG_MULT = 2.2; // meteor hits harder than a normal pop

/** Corpse lifecycle state. */
const enum CState {
  Fresh = 0, // just spawned — behavior not yet chosen (default for a new slot)
  Idle = 1, // sitting on a fuse
  Launched = 2, // flying at a target (Body Ballistics)
  Meteor = 3, // telegraphing an incoming orbital strike (Moonshot)
}

/** Variant index → base radius (corpse visual + blast scale), mirroring the pool. */
function variantRadius(variant: number): number {
  return ENEMY_BY_VARIANT[variant]?.radius ?? 0.7;
}

export class CorpsePool {
  count = 0;
  readonly posX = new Float32Array(MAX_CORPSES);
  readonly posZ = new Float32Array(MAX_CORPSES);
  readonly prevX = new Float32Array(MAX_CORPSES);
  readonly prevZ = new Float32Array(MAX_CORPSES);
  readonly velX = new Float32Array(MAX_CORPSES);
  readonly velZ = new Float32Array(MAX_CORPSES);
  readonly stored = new Float32Array(MAX_CORPSES);
  readonly fuse = new Float32Array(MAX_CORPSES);
  readonly size = new Float32Array(MAX_CORPSES);
  readonly state = new Uint8Array(MAX_CORPSES);
  readonly variant = new Uint8Array(MAX_CORPSES);

  /** Spawn a corpse. Returns its index, or -1 if the pool is full (V5). */
  spawn(x: number, z: number, stored: number, size: number, variant: number): number {
    if (this.count >= MAX_CORPSES) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.prevX[i] = x;
    this.prevZ[i] = z;
    this.velX[i] = 0;
    this.velZ[i] = 0;
    this.stored[i] = Math.min(STORE_CAP, stored);
    this.fuse[i] = FUSE;
    this.size[i] = size;
    this.state[i] = CState.Fresh; // behavior picked on its first sim step
    this.variant[i] = variant & 0xff;
    return i;
  }

  /** Swap-remove slot `i` (V5 pooling). */
  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.posX[i] = this.posX[last]!;
      this.posZ[i] = this.posZ[last]!;
      this.prevX[i] = this.prevX[last]!;
      this.prevZ[i] = this.prevZ[last]!;
      this.velX[i] = this.velX[last]!;
      this.velZ[i] = this.velZ[last]!;
      this.stored[i] = this.stored[last]!;
      this.fuse[i] = this.fuse[last]!;
      this.size[i] = this.size[last]!;
      this.state[i] = this.state[last]!;
      this.variant[i] = this.variant[last]!;
    }
  }

  clear(): void {
    this.count = 0;
  }
}

export class CorpseSystem {
  readonly pool = new CorpsePool();
  private ids: number[] = [];

  /** Leave corpses for this step's overkilled kills (gated by Waste Not). */
  ingest(kills: readonly KillEvent[], player: Player): void {
    if (!player.corpseStore) return;
    for (const k of kills) {
      const over = k.overkill ?? 0;
      if (over <= 0) continue;
      this.pool.spawn(k.x, k.z, over, k.size ?? variantRadius(k.variant), k.variant);
    }
  }

  /** Advance every corpse: fuse, ballistics flight, detonation, chain, meteor.
   *  Returns total enemy health removed (folded into run stats, V20). */
  step(
    player: Player,
    enemies: EnemyPool,
    hash: SpatialHash,
    rng: Rng,
    fx: FxQueue,
    dt: number,
  ): number {
    const p = this.pool;
    let dealt = 0;
    // Iterate backwards — detonation swap-removes, and chained children are
    // appended past `count` so they wait for the next step (bounded, V8-style).
    for (let i = p.count - 1; i >= 0; i--) {
      p.prevX[i] = p.posX[i]!;
      p.prevZ[i] = p.posZ[i]!;

      // First touch: pick the corpse's behavior from the active build.
      if (p.state[i] === CState.Fresh) {
        p.state[i] = CState.Idle; // default — sit on the fuse
        if (player.corpseMeteorThreshold > 0 && p.stored[i]! >= player.corpseMeteorThreshold) {
          p.state[i] = CState.Meteor;
          p.fuse[i] = MOONSHOT_DELAY;
          fx.push('teleport', p.posX[i]!, p.posZ[i]!); // telegraph ring (V30)
        } else if (player.corpseBallistics) {
          const t = this.nearestEnemy(enemies, hash, p.posX[i]!, p.posZ[i]!);
          if (t >= 0) {
            const dx = enemies.posX[t]! - p.posX[i]!;
            const dz = enemies.posZ[t]! - p.posZ[i]!;
            const l = Math.hypot(dx, dz) || 1;
            p.velX[i] = (dx / l) * LAUNCH_SPEED;
            p.velZ[i] = (dz / l) * LAUNCH_SPEED;
            p.state[i] = CState.Launched;
            p.fuse[i] = LAUNCH_MAX;
          }
        }
      }

      p.fuse[i]! -= dt;

      if (p.state[i] === CState.Launched) {
        p.posX[i]! += p.velX[i]! * dt;
        p.posZ[i]! += p.velZ[i]! * dt;
        // Detonate on contact with any active enemy, or when the flight times out.
        const hit = this.nearestEnemy(enemies, hash, p.posX[i]!, p.posZ[i]!, p.size[i]! + 0.6);
        if (hit >= 0 || p.fuse[i]! <= 0) {
          dealt += this.detonate(i, player, enemies, hash, rng, fx, false);
          continue;
        }
        continue;
      }

      if (p.fuse[i]! <= 0) {
        const meteor = p.state[i] === CState.Meteor;
        dealt += this.detonate(i, player, enemies, hash, rng, fx, meteor);
      }
    }
    return dealt;
  }

  /** Resolve a detonation at corpse `i`: AoE (V3), optional self-singe + chain,
   *  then swap-remove the corpse. Returns enemy health removed. */
  private detonate(
    i: number,
    player: Player,
    enemies: EnemyPool,
    hash: SpatialHash,
    rng: Rng,
    fx: FxQueue,
    meteor: boolean,
  ): number {
    const p = this.pool;
    const x = p.posX[i]!;
    const z = p.posZ[i]!;
    const stored = p.stored[i]!;
    let dealt = 0;
    // Without the engine (Violent Recycling), a stored corpse just decays — the
    // primer creates the object, the engine makes it generate value (V27).
    if (player.corpseDetonate || meteor) {
      const radius = meteor
        ? MOONSHOT_RADIUS
        : Math.min(BLAST_MAX, BLAST_BASE + stored * BLAST_PER_STORE);
      const amount = stored * DMG_FRAC * (meteor ? MOONSHOT_DMG_MULT : 1);
      dealt = applyAreaDamage(enemies, hash, x, z, radius, { amount, damageType: 'explosive' }, rng);
      fx.push('impact', x, z, 0, 0, 4 /* ImpactProfile.Blast */);
      if (meteor) fx.push('death', x, z, 0, 0, p.variant[i]!); // extra punch

      // Liability danger (V30): the player takes a fraction if caught in the blast.
      if (player.corpsePlayerDanger) {
        const dpx = player.pos.x - x;
        const dpz = player.pos.z - z;
        if (dpx * dpx + dpz * dpz <= radius * radius) {
          hitPlayer(player, amount * SELF_DMG_FRAC);
        }
      }

      // Chain of Evidence: seed a decaying child corpse → a bounded chain (the
      // store geometric-decays past CHAIN_FLOOR so it always terminates, V30).
      if (player.corpseChain && dealt > 0 && stored * CHAIN_FRAC >= CHAIN_FLOOR) {
        this.pool.spawn(x, z, stored * CHAIN_FRAC, p.size[i]!, p.variant[i]!);
      }
    }
    p.kill(i);
    return dealt;
  }

  /** Nearest ACTIVE enemy to (x,z) within `radius` (default seek range), or -1. */
  private nearestEnemy(
    enemies: EnemyPool,
    hash: SpatialHash,
    x: number,
    z: number,
    radius: number = SEEK_RADIUS,
  ): number {
    const n = hash.queryCircle(x, z, radius, this.ids);
    let best = -1;
    let bestD2 = radius * radius;
    for (let k = 0; k < n; k++) {
      const e = this.ids[k]!;
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
