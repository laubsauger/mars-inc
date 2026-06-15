// Player entity (T6). Concrete struct for now; folds into ECS at T9 when enemies
// add a second use case (avoid speculative abstraction — execution rule 7).

import {
  type Vec2,
  type MovementStats,
  type SprintState,
  normalizeInput,
  integrateVelocity,
  clampToArena,
  updateSprint,
  newSprintState,
} from './movement';
import type { InputSnapshot } from '../core/input';
import { ARENA_RADIUS } from './constants';
import { xpRequired } from '../content/balance/xp-curve';

// Mara Vex, Human Scrapper — balanced (§22).
export const MARA_STATS: MovementStats = {
  moveSpeed: 8, // slower base; speed upgrades + sprint earn the mobility back
  acceleration: 14,
  deceleration: 22,
  turnResponsiveness: 1,
  collisionRadius: 0.7,
  sprintMultiplier: 1.8,
  sprintDuration: 0.8,
  sprintCooldown: 5,
  sprintCharges: 1,
  knockbackResistance: 0,
  recoilResistance: 0,
};

export interface Player {
  pos: Vec2;
  prevPos: Vec2; // for render interpolation (V1)
  vel: Vec2;
  facing: number; // radians on x,z plane
  health: number;
  maxHealth: number;
  invuln: number; // i-frames remaining (s) after a hit (§5.5)
  aim: { x: number; z: number; has: boolean }; // world-space cursor target
  stats: MovementStats;
  sprint: SprintState;
  // Leveling (T17).
  level: number;
  xp: number;
  xpToNext: number;
  pickupRadius: number;
  magnetRadius: number;
}

export function createPlayer(stats: MovementStats = MARA_STATS): Player {
  // Clone stats: upgrades mutate player.stats in-run; must never touch the
  // shared MARA_STATS constant (would leak across runs).
  const own = { ...stats };
  return {
    pos: { x: 0, z: 0 },
    prevPos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    facing: 0,
    health: 100,
    maxHealth: 100,
    invuln: 0,
    aim: { x: 0, z: 0, has: false },
    stats: own,
    sprint: newSprintState(own),
    level: 1,
    xp: 0,
    xpToNext: xpRequired(1),
    pickupRadius: 1.6,
    magnetRadius: 5,
  };
}

/** Reset a player to a fresh-run baseline in place (T22 restart, no reload).
 *  Mutates the existing object so render views holding the reference stay valid. */
export function resetPlayer(p: Player, stats: MovementStats = MARA_STATS): void {
  p.pos.x = 0;
  p.pos.z = 0;
  p.prevPos.x = 0;
  p.prevPos.z = 0;
  p.vel.x = 0;
  p.vel.z = 0;
  p.facing = 0;
  p.health = 100;
  p.maxHealth = 100;
  p.invuln = 0;
  p.aim.x = 0;
  p.aim.z = 0;
  p.aim.has = false;
  p.stats = { ...stats }; // clone — upgrades mutate this, not the shared constant
  p.sprint = newSprintState(p.stats);
  p.level = 1;
  p.xp = 0;
  p.xpToNext = xpRequired(1);
  p.pickupRadius = 1.6;
  p.magnetRadius = 5;
}

/** Advance the player one fixed step. */
export function stepPlayer(p: Player, input: InputSnapshot, dt: number): void {
  p.prevPos.x = p.pos.x;
  p.prevPos.z = p.pos.z;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);

  p.aim.x = input.aimX;
  p.aim.z = input.aimZ;
  p.aim.has = input.hasAim;

  p.sprint = updateSprint(p.sprint, input.sprint, p.stats, dt);

  const dir = normalizeInput(input.moveX, input.moveZ);
  const maxSpeed = p.stats.moveSpeed * (p.sprint.active ? p.stats.sprintMultiplier : 1);
  p.vel = integrateVelocity(p.vel, dir, maxSpeed, p.stats.acceleration, p.stats.deceleration, dt);

  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;

  const clamped = clampToArena(p.pos, p.vel, ARENA_RADIUS, p.stats.collisionRadius);
  p.pos = clamped.pos;
  p.vel = clamped.vel;

  // Face the cursor when aiming, else face movement direction.
  // facing = atan2(-dx,-dz): the view's nose sits on local -z, so this maps it
  // onto the world aim vector (see player-view). Earlier convention pointed it
  // 180° off → felt mirrored.
  if (p.aim.has) {
    p.facing = Math.atan2(-(p.aim.x - p.pos.x), -(p.aim.z - p.pos.z));
  } else if (dir.x !== 0 || dir.z !== 0) {
    p.facing = Math.atan2(-dir.x, -dir.z);
  }
}

export const HIT_IFRAMES = 0.6; // short invuln after damage (§5.5)

/**
 * Apply contact damage to the player. No-op during i-frames or sprint
 * collision-forgiveness (§5.3). Returns true if the hit landed.
 */
export function hitPlayer(p: Player, amount: number): boolean {
  if (p.invuln > 0 || p.sprint.forgiveness > 0) return false;
  p.health = Math.max(0, p.health - amount);
  p.invuln = HIT_IFRAMES;
  return true;
}
