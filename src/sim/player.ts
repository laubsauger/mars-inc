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

// Lilu Tubs, Human Scrapper — balanced (§22).
export const LILU_STATS: MovementStats = {
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
  /** Raises the odds of rarer upgrades in the draft (T41). */
  luck: number;
  /** Chill (slow) from enemy frost effects (T33): time left + speed multiplier. */
  chillTime: number;
  chillMult: number;
  /** Extra per-run draft rerolls / banishes granted by permanents (T35). */
  bonusRerolls: number;
  bonusBanishes: number;
  /** Recharging shield (T40 defensive): absorbs one instance of damage, then
   *  recharges after `shieldRecharge`s without breaking. `shieldMax` charges. */
  shieldMax: number;
  shieldCharges: number;
  shieldRecharge: number; // seconds to regenerate one broken charge
  shieldTimer: number; // countdown to the next regen (0 = idle/full)
  /** Companion drones orbiting the player that auto-hunt enemies (T40/T42). */
  droneCount: number;
  /** Repulsor nova (CC, T42): periodic radial push + light AoE. 0 interval = off. */
  novaInterval: number;
  novaTimer: number;
  novaRadius: number;
  novaForce: number;
  novaDamage: number;
  novaPull: boolean; // Singularity mutation: the pulse PULLS enemies in, not out
  /** Kinetic Boots: a radial shockwave push emitted when a sprint starts (0 = off). */
  dashShockForce: number;
  dashShockRadius: number;
}

export function createPlayer(stats: MovementStats = LILU_STATS): Player {
  // Clone stats: upgrades mutate player.stats in-run; must never touch the
  // shared LILU_STATS constant (would leak across runs).
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
    luck: 0,
    bonusRerolls: 0,
    bonusBanishes: 0,
    chillTime: 0,
    chillMult: 1,
    shieldMax: 0, // off until a Shield upgrade is drafted
    shieldCharges: 0,
    shieldRecharge: 10,
    shieldTimer: 0,
    droneCount: 0,
    novaInterval: 0,
    novaTimer: 0,
    novaRadius: 6,
    novaForce: 16,
    novaDamage: 8,
    novaPull: false,
    dashShockForce: 0,
    dashShockRadius: 5,
  };
}

/** Reset a player to a fresh-run baseline in place (T22 restart, no reload).
 *  Mutates the existing object so render views holding the reference stay valid. */
export function resetPlayer(p: Player, stats: MovementStats = LILU_STATS): void {
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
  p.luck = 0;
  p.bonusRerolls = 0;
  p.bonusBanishes = 0;
  p.chillTime = 0;
  p.chillMult = 1;
  p.shieldMax = 0;
  p.shieldCharges = 0;
  p.shieldRecharge = 10;
  p.shieldTimer = 0;
  p.droneCount = 0;
  p.novaInterval = 0;
  p.novaTimer = 0;
  p.novaRadius = 6;
  p.novaForce = 16;
  p.novaDamage = 8;
  p.novaPull = false;
  p.dashShockForce = 0;
  p.dashShockRadius = 5;
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

  // Chill (enemy frost) slows the player until it expires.
  if (p.chillTime > 0) {
    p.chillTime = Math.max(0, p.chillTime - dt);
    if (p.chillTime === 0) p.chillMult = 1;
  }

  // Shield recharge: regenerate a broken charge after the cooldown elapses.
  if (p.shieldCharges < p.shieldMax) {
    p.shieldTimer -= dt;
    if (p.shieldTimer <= 0) {
      p.shieldCharges = Math.min(p.shieldMax, p.shieldCharges + 1);
      p.shieldTimer = p.shieldCharges < p.shieldMax ? p.shieldRecharge : 0;
    }
  }

  const dir = normalizeInput(input.moveX, input.moveZ);
  const maxSpeed =
    p.stats.moveSpeed * (p.sprint.active ? p.stats.sprintMultiplier : 1) * p.chillMult;
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

/** Apply (or refresh) a chill slow on the player — takes the stronger slow and
 *  the longer duration (no infinite stacking). */
export function applyChill(p: Player, duration: number, slowMult: number): void {
  p.chillTime = Math.max(p.chillTime, duration);
  p.chillMult = Math.min(p.chillMult, slowMult);
}

export const HIT_IFRAMES = 0.6; // short invuln after damage (§5.5)

/**
 * Apply contact damage to the player. No-op during i-frames or sprint
 * collision-forgiveness (§5.3). Returns true if the hit landed.
 */
export function hitPlayer(p: Player, amount: number): boolean {
  if (p.invuln > 0 || p.sprint.forgiveness > 0) return false;
  // Shield absorbs the whole instance, then breaks and starts its recharge. Still
  // grants i-frames so a crowd can't strip every charge in one tick.
  if (p.shieldCharges > 0) {
    p.shieldCharges -= 1;
    p.shieldTimer = p.shieldRecharge;
    p.invuln = HIT_IFRAMES;
    return false; // no health lost → callers see "no damage landed"
  }
  p.health = Math.max(0, p.health - amount);
  p.invuln = HIT_IFRAMES;
  return true;
}
