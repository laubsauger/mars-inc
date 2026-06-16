// Bounty relics (contracts). At a fixed cadence a relic materializes somewhere on
// the map, AWAY from the player; walking onto it grants an upgrade draft (it feeds
// the same pendingLevelUps pipeline as a level-up, so reroll/banish/skip all work).
// This is a second, MOVEMENT-driven upgrade source on top of XP — you leave the
// safe lane to grab it, so positioning becomes a real decision. Pooled (V5),
// deterministic via the shared rng (V16). A pure view renders the beacon (V2).

import type { Player } from './player';
import type { Rng } from '../core/rng';
import type { FxQueue } from './fx';
import { clampPoint, arenaContains } from './arena';

export const MAX_BOUNTIES = 3; // concurrent cap — beacons, not clutter
const FIRST_AT = 10; // first relic after this many seconds
const INTERVAL = 15; // seconds between relic spawns
const MIN_SPAWN_DIST = 9; // must land at least this far from the player (go get it)
const PICKUP_RADIUS = 1.7;
/** Seconds a relic lingers before it decays (generous — plenty of time to fetch). */
export const BOUNTY_TTL = 40;
export const BOUNTY_FADE = 6; // last seconds: the view flashes a fade warning

export class BountyPool {
  count = 0;
  readonly posX = new Float32Array(MAX_BOUNTIES);
  readonly posZ = new Float32Array(MAX_BOUNTIES);
  readonly age = new Float32Array(MAX_BOUNTIES);

  spawn(x: number, z: number): number {
    if (this.count >= MAX_BOUNTIES) return -1;
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

export class BountySystem {
  readonly pool = new BountyPool();
  /** Bounties collected this step → world folds into pendingLevelUps (draft). */
  collectedThisStep = 0;
  private timer = FIRST_AT;

  reset(): void {
    this.pool.count = 0;
    this.collectedThisStep = 0;
    this.timer = FIRST_AT;
  }

  step(player: Player, rng: Rng, fx: FxQueue, dt: number): void {
    this.collectedThisStep = 0;

    // Spawn cadence — only while under the concurrent cap so ignored relics don't
    // let a backlog flood in all at once.
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.pool.count < MAX_BOUNTIES) this.spawn(player, rng, fx);
      this.timer = INTERVAL; // next relic regardless (skip a beat only when capped)
    }

    // Age out ignored relics so the floor stays readable.
    for (let i = this.pool.count - 1; i >= 0; i--) {
      this.pool.age[i]! += dt;
      if (this.pool.age[i]! >= BOUNTY_TTL) this.pool.kill(i);
    }

    // Collect on walk-over → grant a draft (world reads collectedThisStep).
    const pr = PICKUP_RADIUS + player.stats.collisionRadius;
    const pr2 = pr * pr;
    for (let i = this.pool.count - 1; i >= 0; i--) {
      const dx = this.pool.posX[i]! - player.pos.x;
      const dz = this.pool.posZ[i]! - player.pos.z;
      if (dx * dx + dz * dz > pr2) continue;
      this.collectedThisStep += 1;
      fx.push('bounty', this.pool.posX[i]!, this.pool.posZ[i]!);
      this.pool.kill(i);
    }
  }

  /** Place a relic on a ring AROUND the player (random angle, guaranteed distance),
   *  then clamp inside the arena. Ring placement can't land on the player — the old
   *  rejection sampler could accept a close point if every retry rolled near you. */
  private spawn(player: Player, rng: Rng, fx: FxQueue): void {
    const ang = rng.next() * Math.PI * 2;
    const dist = MIN_SPAWN_DIST + rng.next() * 14; // 9..23 units out from the player
    let x = player.pos.x + Math.cos(ang) * dist;
    let z = player.pos.z + Math.sin(ang) * dist;
    // Near a wall the outward point can fall outside → clamping would drag it back
    // ONTO the player. Flip to the opposite (inward) direction so it stays inside
    // AND on the far side from the player.
    if (!arenaContains(x, z)) {
      x = player.pos.x - Math.cos(ang) * dist;
      z = player.pos.z - Math.sin(ang) * dist;
    }
    const p = clampPoint(x, z, 2); // keep off the wall
    if (this.pool.spawn(p.x, p.z) >= 0) fx.push('teleport', p.x, p.z); // materialize blink-in
  }
}
