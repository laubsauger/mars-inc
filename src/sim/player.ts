// Player entity (T6). Concrete struct for now; folds into ECS at T9 when enemies
// add a second use case (avoid speculative abstraction — execution rule 7).

import {
  type Vec2,
  type MovementStats,
  type SprintState,
  normalizeInput,
  integrateVelocity,
  updateSprint,
  newSprintState,
} from './movement';
import type { InputSnapshot } from '../core/input';
import { clampToArena } from './arena';
import { xpRequired } from '../content/balance/xp-curve';

// Recoil impulse decay rate (per second). Slower now (~0.45s) so the kick PUSHES
// you a real distance — recoil is a movement/strategy factor, not a flicker. Still
// decays fully so it never makes you uncontrollable (V10).
const RECOIL_DECAY = 3.2;

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
  vel: Vec2; // movement velocity (steered by input each step)
  recoilVel: Vec2; // separate recoil impulse — decays, added on top of vel (T55/V10)
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
  /** Glory-Tree reweave run modifiers (T35/T67). Set by permanents at run start. */
  draftSize: number; // draft options shown per level-up (default 3; ARSENAL widens it)
  reviveCharges: number; // survive a lethal hit, then consume one (BIOLOGY)
  droneDamageMult: number; // COMMAND: scales companion-drone damage
  gloryMult: number; // ARENA/INFAMY: multiplies Glory earned from this run
  /** Chill (slow) from enemy frost effects (T33): time left + speed multiplier. */
  chillTime: number;
  chillMult: number;
  /** Extra per-run draft rerolls / banishes / locks / tag-banishes from permanents (T35/T71). */
  bonusRerolls: number;
  bonusBanishes: number;
  bonusLocks: number;
  bonusTagBanishes: number;
  /** Recharging shield (T40 defensive): absorbs one instance of damage, then
   *  recharges after `shieldRecharge`s without breaking. `shieldMax` charges. */
  shieldMax: number;
  shieldCharges: number;
  shieldRecharge: number; // seconds to regenerate one broken charge
  shieldTimer: number; // countdown to the next regen (0 = idle/full)
  /** Companion drones orbiting the player that auto-hunt enemies (T40/T42). */
  droneCount: number;
  /** Networked Munitions keystone: when true, drone bolts INHERIT the build's
   *  global on-hit mods (chain/knockback/status) + blast/pierce/ricochet. Off by
   *  default — drones are dumb bolts unless you pay for the synergy. */
  droneInheritMods: boolean;
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
  /** Recoil build (T55): seconds since the last shot's recoil (>0 = "recoil is
   *  moving the player"). Set on fire, decays here. Read by recoil conditionals. */
  recoilTimer: number;
  /** Backblast Harness: while firing, recoil feeds the sprint recharge (T55). */
  recoilSprintRecharge: boolean;
  /** Corpse / overkill build (T65). Off until the family's cards are drafted. */
  corpseStore: boolean; // Waste Not: overkilled kills leave a corpse storing overkill
  corpseDetonate: boolean; // Violent Recycling: corpses detonate → AoE by stored
  corpseBallistics: boolean; // Body Ballistics: corpses launch at the nearest enemy
  corpseChain: boolean; // Chain of Evidence: detonations seed a decaying child corpse
  corpsePlayerDanger: boolean; // liability downside: blasts can singe the player
  corpseMeteorThreshold: number; // Moonshot: stored ≥ this → telegraphed orbital strike (0 = off)
  /** Gravedigger build: chance [0..1] that a slain enemy RISES as a pet that fights
   *  for you and decays. 0 = off. `necroPower` scales pet HP + damage. */
  necroChance: number;
  necroPower: number;
  /** XP-as-resource build (T58). Off until the family's cards are drafted. */
  xpInterestRate: number; // Compound Interest: loose shards gain this frac/s (0 = off)
  xpMagnetar: boolean; // Magnetar: loose shards orbit the player and zap enemies
  xpLiquidation: number; // Liquidation: shards fired as projectiles per sprint (0 = off)
  xpMarginCall: boolean; // liability: fatter interest, but old loose shards crash (decay)
  xpMarketCrash: boolean; // catastrophe: periodic collapse of all loose shards → AoE + mega-pickup
}

export function createPlayer(stats: MovementStats = LILU_STATS): Player {
  // Clone stats: upgrades mutate player.stats in-run; must never touch the
  // shared LILU_STATS constant (would leak across runs).
  const own = { ...stats };
  return {
    pos: { x: 0, z: 0 },
    prevPos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    recoilVel: { x: 0, z: 0 },
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
    draftSize: 3,
    reviveCharges: 0,
    droneDamageMult: 1,
    gloryMult: 1,
    bonusRerolls: 0,
    bonusBanishes: 0,
    bonusLocks: 0,
    bonusTagBanishes: 0,
    chillTime: 0,
    chillMult: 1,
    shieldMax: 0, // off until a Shield upgrade is drafted
    shieldCharges: 0,
    shieldRecharge: 10,
    shieldTimer: 0,
    droneCount: 0,
    droneInheritMods: false,
    novaInterval: 0,
    novaTimer: 0,
    novaRadius: 3.4, // T44 nerf: was 6 — far too wide on the first level
    novaForce: 16,
    novaDamage: 6, // T44 nerf: was 8
    novaPull: false,
    dashShockForce: 0,
    dashShockRadius: 5,
    recoilTimer: 0,
    recoilSprintRecharge: false,
    corpseStore: false,
    corpseDetonate: false,
    corpseBallistics: false,
    corpseChain: false,
    corpsePlayerDanger: false,
    corpseMeteorThreshold: 0,
    necroChance: 0,
    necroPower: 1,
    xpInterestRate: 0,
    xpMagnetar: false,
    xpLiquidation: 0,
    xpMarginCall: false,
    xpMarketCrash: false,
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
  p.recoilVel.x = 0;
  p.recoilVel.z = 0;
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
  p.draftSize = 3;
  p.reviveCharges = 0;
  p.droneDamageMult = 1;
  p.gloryMult = 1;
  p.bonusRerolls = 0;
  p.bonusBanishes = 0;
  p.bonusLocks = 0;
  p.bonusTagBanishes = 0;
  p.chillTime = 0;
  p.chillMult = 1;
  p.shieldMax = 0;
  p.shieldCharges = 0;
  p.shieldRecharge = 10;
  p.shieldTimer = 0;
  p.droneCount = 0;
  p.droneInheritMods = false;
  p.novaInterval = 0;
  p.novaTimer = 0;
  p.novaRadius = 3.4;
  p.novaForce = 16;
  p.novaDamage = 6;
  p.novaPull = false;
  p.dashShockForce = 0;
  p.dashShockRadius = 5;
  p.recoilTimer = 0;
  p.recoilSprintRecharge = false;
  p.corpseStore = false;
  p.corpseDetonate = false;
  p.corpseBallistics = false;
  p.corpseChain = false;
  p.corpsePlayerDanger = false;
  p.corpseMeteorThreshold = 0;
  p.necroChance = 0;
  p.necroPower = 1;
  p.xpInterestRate = 0;
  p.xpMagnetar = false;
  p.xpLiquidation = 0;
  p.xpMarginCall = false;
  p.xpMarketCrash = false;
}

/** Advance the player one fixed step. */
export function stepPlayer(p: Player, input: InputSnapshot, dt: number): void {
  p.prevPos.x = p.pos.x;
  p.prevPos.z = p.pos.z;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);

  p.aim.x = input.aimX;
  p.aim.z = input.aimZ;
  p.aim.has = input.hasAim;

  // Recoil decay (T55). While recent recoil is "moving" the player, Backblast
  // Harness feeds the sprint recharge.
  if (p.recoilTimer > 0) p.recoilTimer = Math.max(0, p.recoilTimer - dt);
  const sprintBoost = p.recoilSprintRecharge && p.recoilTimer > 0 ? dt * 2 : 0;
  p.sprint = updateSprint(p.sprint, input.sprint, p.stats, dt, sprintBoost);

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

  // Recoil impulse decays on its own timescale and is added ON TOP of movement,
  // so a held WASD input can't instantly steer it away (the recoil-as-mobility
  // build actually reads, T55) — but it's capped + fades, so never uncontrollable
  // (V10). ~0.35s to settle.
  const rdecay = Math.max(0, 1 - RECOIL_DECAY * dt);
  p.recoilVel.x *= rdecay;
  p.recoilVel.z *= rdecay;
  if (Math.abs(p.recoilVel.x) < 1e-3) p.recoilVel.x = 0;
  if (Math.abs(p.recoilVel.z) < 1e-3) p.recoilVel.z = 0;

  p.pos.x += (p.vel.x + p.recoilVel.x) * dt;
  p.pos.z += (p.vel.z + p.recoilVel.z) * dt;

  // pos already includes the recoil shove, so clamping it keeps recoil from
  // pushing through the wall; slide on the movement velocity as before.
  const clamped = clampToArena(p.pos, p.vel, p.stats.collisionRadius);
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
  // Revive charge (BIOLOGY keystone, T35): a lethal hit is survived once, not fatal.
  if (p.health <= 0 && p.reviveCharges > 0) {
    p.reviveCharges -= 1;
    p.health = Math.max(1, Math.round(p.maxHealth * 0.4));
    p.invuln = 2; // longer mercy window after a revive
  }
  return true;
}
