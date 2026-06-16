// Enemy simulation system (T11/T13). Rebuilds the spatial hash, steers active
// enemies at a staggered low frequency (§8.2), advances telegraph→active,
// integrates motion, and applies contact damage to the player.

import { EnemyPool, EnemyState, steerEnemy, DEFAULT_STEER } from './enemies';
import { SpatialHash } from './spatial-hash';
import { type Player, hitPlayer } from './player';
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

  step(player: Player, tick: number, dt: number): void {
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
      if (dx * dx + dz * dz <= rr * rr) hitPlayer(player, p.contactDmg[i]!);
    }
  }
}
