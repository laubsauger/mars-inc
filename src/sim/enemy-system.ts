// Enemy simulation system (T11/T13). Rebuilds the spatial hash, steers active
// enemies at a staggered low frequency (§8.2), advances telegraph→active,
// integrates motion, and applies contact damage to the player.

import { EnemyPool, EnemyState, steerEnemy, DEFAULT_STEER } from './enemies';
import { SpatialHash } from './spatial-hash';
import { type Player, hitPlayer } from './player';
import { knockbackVelocity } from './movement';
import type { FxQueue } from './fx';
import { clampPoint, interiorPoint, arenaContains } from './arena';

const ACTIVATE_MARGIN = 1.4; // activate this far OUTSIDE the wall (in the gate) so the
// march→steer turn is hidden in the tunnel, not a jerk over the visible threshold
const ROAM_PERIOD = 280; // ticks (~4.7s) a roamer commits to one wander destination
/** Cheap deterministic 0..1 hash (no Math.random in sim, V16). */
function hash01(x: number): number {
  const s = Math.sin(x) * 43758.5453;
  return s - Math.floor(s);
}

const STEER_DIVISOR = 3; // re-steer each enemy every 3rd tick → ~20Hz
const MAX_NEIGHBORS = 48; // cap separation neighbors (bounded cost, V6)
// Player knockback on a body-check: base shove, scaled by the enemy's footprint
// (a brute/boss launches you far harder than fodder) and reduced by resistance.
// recoilVel is clamped after so a cluster contact can't fling you across the pit.
const CONTACT_KNOCKBACK = 15; // base impulse (u/s) for a baseline-size enemy — punchy
const KNOCKBACK_REF_RADIUS = 0.8; // enemy radius that maps to the base shove
const MAX_PLAYER_RECOIL = 26; // hard cap on the impulse channel (V10 spirit)
// Ceiling on an enemy's accumulated knockback impulse (u/s). radialPush ADDS, so
// overlapping kill-shockwaves / nova / blasts could stack into a launch — this keeps
// even a multi-blast pile-up a firm shove, not a rocket across the arena.
const MAX_ENEMY_KB = 30;

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
        // Go LIVE as it reaches the gate threshold (was a fixed timer that left it
        // intangible for a second+ after it had clearly walked in). Activate a touch
        // BEFORE the wall line (ACTIVATE_MARGIN, still in the gate tunnel) so the
        // march→steer velocity re-orient happens back in the gate, not as a visible
        // jerk over the step. The timer is a safety floor so anything that never
        // enters still activates.
        p.stateTimer[i]! -= dt;
        if (p.stateTimer[i]! <= 0 || arenaContains(p.posX[i]!, p.posZ[i]!, ACTIVATE_MARGIN)) {
          p.state[i] = EnemyState.Active;
        }
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
            // Wander toward a DESTINATION somewhere in the arena, re-picked every
            // ROAM_PERIOD ticks (staggered per enemy so they don't all turn at once).
            // Picking an interior point spreads roamers across the pit instead of
            // orbiting their spawn gate. Deterministic from id + tick (V16/V21).
            const epoch = Math.floor(tick / ROAM_PERIOD) + i;
            const u = hash01(i * 0.731 + epoch * 1.139);
            const v = hash01(i * 1.197 + epoch * 0.529 + 7.13);
            const pt = interiorPoint(u, v, 0, 0.92); // anywhere well inside the wall
            this.roam.x = pt.x;
            this.roam.z = pt.z;
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
      let kx = p.kbX[i]!;
      let kz = p.kbZ[i]!;
      if (kx !== 0 || kz !== 0) {
        // CLAMP the accumulated impulse: radialPush ADDS, so several shockwaves /
        // kill-blasts hitting one enemy in a step stacked into a launch-across-the-
        // arena shove. Cap the total so knockback stays a punch, never a rocket.
        const mag = Math.hypot(kx, kz);
        if (mag > MAX_ENEMY_KB) {
          const s = MAX_ENEMY_KB / mag;
          kx *= s;
          kz *= s;
        }
        p.posX[i]! += kx * dt;
        p.posZ[i]! += kz * dt;
        // Slow decay (~0.35s) → every shove pushes a long way for the same force,
        // so all enemy knockback (hits, nova, dash) really launches them (T42).
        const decay = Math.max(0, 1 - 2.8 * dt);
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
      const rr = p.radius[i]! * 1.35 + player.stats.collisionRadius + 0.25;
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
