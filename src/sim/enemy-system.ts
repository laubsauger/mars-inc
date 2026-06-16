// Enemy simulation system (T11/T13). Rebuilds the spatial hash, steers active
// enemies at a staggered low frequency (§8.2), advances telegraph→active,
// integrates motion, and applies contact damage to the player.

import { EnemyPool, EnemyState, steerEnemy, DEFAULT_STEER } from './enemies';
import { SpatialHash } from './spatial-hash';
import { type Player, hitPlayer } from './player';
import { knockbackVelocity } from './movement';
import type { FxQueue } from './fx';
import { clampPoint } from './arena';

const STEER_DIVISOR = 3; // re-steer each enemy every 3rd tick → ~20Hz
const MAX_NEIGHBORS = 48; // cap separation neighbors (bounded cost, V6)
// Player knockback on a body-check: base shove, scaled by the enemy's footprint
// (a brute/boss launches you far harder than fodder) and reduced by resistance.
// recoilVel is clamped after so a cluster contact can't fling you across the pit.
const CONTACT_KNOCKBACK = 9; // base impulse (u/s) for a baseline-size enemy
const KNOCKBACK_REF_RADIUS = 0.8; // enemy radius that maps to the base shove
const MAX_PLAYER_RECOIL = 16; // hard cap on the impulse channel (V10 spirit)

export class EnemySystem {
  readonly pool: EnemyPool;
  readonly hash: SpatialHash;
  private ids: number[] = [];
  private nbrX = new Float32Array(MAX_NEIGHBORS);
  private nbrZ = new Float32Array(MAX_NEIGHBORS);
  /** Reused wander target for roaming (aggro-gated) enemies — no per-frame alloc. */
  private roam = { x: 0, z: 0 };

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
          // Set the velocity (not just position) to the inward march direction so
          // the render view orients the mesh FORWARD — it walks out of the gate
          // facing the arena, then steering takes over smoothly (no snap-turn).
          p.velX[i] = (-p.posX[i]! / d) * inSpeed;
          p.velZ[i] = (-p.posZ[i]! / d) * inSpeed;
          p.posX[i]! += p.velX[i]! * dt;
          p.posZ[i]! += p.velZ[i]! * dt;
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
        // Hold at the contact ring (footprint + a small gap) so the crowd circles
        // the player instead of converging on the centre point and jiggling.
        const stopDist = player.stats.collisionRadius + p.radius[i]! + 0.12;
        // Aggro gate (T-roam): a lurker outside its engagement radius ROAMS (slow
        // wander toward a drifting point) instead of homing the player — it only
        // locks on once you close in. Deterministic from id + tick (V16/V21).
        let seekTarget = target;
        let moveSpeed = p.speed[i]!;
        const aggro = p.aggroRange[i]!;
        if (aggro > 0) {
          const adx = target.x - p.posX[i]!;
          const adz = target.z - p.posZ[i]!;
          if (adx * adx + adz * adz > aggro * aggro) {
            const ang = i * 1.7 + p.steerPhase[i]! + tick * 0.02;
            this.roam.x = p.posX[i]! + Math.cos(ang) * 6;
            this.roam.z = p.posZ[i]! + Math.sin(ang) * 6;
            seekTarget = this.roam;
            moveSpeed = p.speed[i]! * 0.45; // amble while patrolling
          }
        }
        const v = steerEnemy(
          p.posX[i]!,
          p.posZ[i]!,
          seekTarget,
          moveSpeed,
          p.sepWeight[i]!,
          this.nbrX,
          this.nbrZ,
          m,
          p.radius[i]!,
          DEFAULT_STEER,
          stopDist,
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

      // Keep inside the arena (shape-aware).
      const c = clampPoint(p.posX[i]!, p.posZ[i]!, 1);
      p.posX[i] = c.x;
      p.posZ[i] = c.z;

      // Contact damage: triggers when the enemy reaches the player's FOOTPRINT
      // ring. Reach scales with the enemy's OWN size (×1.35) so a big brute can
      // body-check THROUGH a rank of small fodder that rings the player — without
      // the size term, tiny enemies pack the contact ring and "shield" you from
      // the big hitters parked just behind them.
      const dx = p.posX[i]! - target.x;
      const dz = p.posZ[i]! - target.z;
      const rr = p.radius[i]! * 1.35 + player.stats.collisionRadius + 0.4;
      if (dx * dx + dz * dz <= rr * rr && hitPlayer(player, p.contactDmg[i]!)) {
        fx?.push('dmg', player.pos.x, player.pos.z, p.contactDmg[i]!, 0, 2);
        // Body-check shoves the player AWAY from the enemy (enemy → player dir is
        // -dx,-dz), scaled by the enemy's size, through the recoil-impulse channel.
        const force = CONTACT_KNOCKBACK * (p.radius[i]! / KNOCKBACK_REF_RADIUS);
        const kb = knockbackVelocity(-dx, -dz, force, player.stats.knockbackResistance);
        player.recoilVel.x += kb.x;
        player.recoilVel.z += kb.z;
        const mag = Math.hypot(player.recoilVel.x, player.recoilVel.z);
        if (mag > MAX_PLAYER_RECOIL) {
          const k = MAX_PLAYER_RECOIL / mag;
          player.recoilVel.x *= k;
          player.recoilVel.z *= k;
        }
      }
    }
  }
}
