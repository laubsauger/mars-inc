// Enemy simulation system (T11/T13). Rebuilds the spatial hash, steers active
// enemies at a staggered low frequency (§8.2), advances telegraph→active,
// integrates motion, and applies contact damage to the player.

import { EnemyPool, EnemyState, steerEnemy, DEFAULT_STEER } from './enemies';
import { SpatialHash } from './spatial-hash';
import { type Player, hitPlayer } from './player';
import type { FxQueue } from './fx';
import { ARENA_RADIUS } from './constants';

const STEER_DIVISOR = 3; // re-steer each enemy every 3rd tick → ~20Hz
const MAX_NEIGHBORS = 48; // cap separation neighbors (bounded cost, V6)

export class EnemySystem {
  readonly pool: EnemyPool;
  readonly hash: SpatialHash;
  private ids: number[] = [];
  private nbrX = new Float32Array(MAX_NEIGHBORS);
  private nbrZ = new Float32Array(MAX_NEIGHBORS);

  constructor(pool: EnemyPool, cellSize: number) {
    this.pool = pool;
    this.hash = new SpatialHash(cellSize);
  }

  step(player: Player, tick: number, dt: number, fx?: FxQueue): void {
    const p = this.pool;

    // Rebuild broad-phase over all live enemies.
    this.hash.clear();
    for (let i = 0; i < p.count; i++) this.hash.insert(i, p.posX[i]!, p.posZ[i]!);

    const target = player.pos;
    const limit = ARENA_RADIUS - 1;

    for (let i = 0; i < p.count; i++) {
      if (p.state[i] === EnemyState.Telegraph) {
        p.prevX[i] = p.posX[i]!;
        p.prevZ[i] = p.posZ[i]!;
        // Walk in: during the telegraph the enemy marches inward from inside the
        // portal tunnel, through the opening doors, into the arena — so it reads
        // as walking out of the gate rather than popping in (T40). Full speed so
        // it clears the wall before going active (no clamp-snap). Intangible.
        const d = Math.hypot(p.posX[i]!, p.posZ[i]!);
        if (d > 1e-3) {
          const inSpeed = p.speed[i]!;
          p.posX[i]! -= (p.posX[i]! / d) * inSpeed * dt;
          p.posZ[i]! -= (p.posZ[i]! / d) * inSpeed * dt;
        }
        p.stateTimer[i]! -= dt;
        if (p.stateTimer[i]! <= 0) p.state[i] = EnemyState.Active;
        continue;
      }

      // Low-frequency steering, staggered by per-enemy phase.
      if ((tick + p.steerPhase[i]!) % STEER_DIVISOR === 0) {
        const n = this.hash.queryCircle(p.posX[i]!, p.posZ[i]!, p.radius[i]! * 4, this.ids);
        let m = 0;
        for (let k = 0; k < n && m < MAX_NEIGHBORS; k++) {
          const j = this.ids[k]!;
          if (j === i) continue;
          this.nbrX[m] = p.posX[j]!;
          this.nbrZ[m] = p.posZ[j]!;
          m++;
        }
        const v = steerEnemy(
          p.posX[i]!,
          p.posZ[i]!,
          target,
          p.speed[i]!,
          p.sepWeight[i]!,
          this.nbrX,
          this.nbrZ,
          m,
          p.radius[i]!,
          DEFAULT_STEER,
        );
        p.velX[i] = v.x;
        p.velZ[i] = v.z;
      }

      // Integrate (chill slows movement — status effect, T39).
      const chill = p.chillMult[i]!;
      p.prevX[i] = p.posX[i]!;
      p.prevZ[i] = p.posZ[i]!;
      p.posX[i]! += p.velX[i]! * chill * dt;
      p.posZ[i]! += p.velZ[i]! * chill * dt;

      // Knockback impulse (crowd control, T42): added on top of steering and
      // decayed exponentially so a shove reads as a quick punch, not a slide.
      const kx = p.kbX[i]!;
      const kz = p.kbZ[i]!;
      if (kx !== 0 || kz !== 0) {
        p.posX[i]! += kx * dt;
        p.posZ[i]! += kz * dt;
        const decay = Math.max(0, 1 - 9 * dt); // ~0.11s to fade
        p.kbX[i] = kx * decay;
        p.kbZ[i] = kz * decay;
        if (Math.abs(p.kbX[i]!) < 0.05) p.kbX[i] = 0;
        if (Math.abs(p.kbZ[i]!) < 0.05) p.kbZ[i] = 0;
      }

      // Keep inside the arena.
      const d = Math.hypot(p.posX[i]!, p.posZ[i]!);
      if (d > limit && d > 1e-6) {
        p.posX[i] = (p.posX[i]! / d) * limit;
        p.posZ[i] = (p.posZ[i]! / d) * limit;
      }

      // Contact damage.
      const dx = p.posX[i]! - target.x;
      const dz = p.posZ[i]! - target.z;
      const rr = p.radius[i]! + player.stats.collisionRadius;
      if (dx * dx + dz * dz <= rr * rr && hitPlayer(player, p.contactDmg[i]!)) {
        fx?.push('dmg', player.pos.x, player.pos.z, p.contactDmg[i]!, 0, 2);
      }
    }
  }
}
