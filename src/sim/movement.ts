// Pure player physics math. Gameplay on x,z only (V4). All unit-tested (V19).

export interface Vec2 {
  x: number;
  z: number;
}

export interface MovementStats {
  moveSpeed: number;
  acceleration: number;
  deceleration: number;
  turnResponsiveness: number;
  collisionRadius: number;
  sprintMultiplier: number;
  sprintDuration: number;
  sprintCooldown: number;
  sprintCharges: number;
  knockbackResistance: number;
  recoilResistance: number;
}

/** Normalize raw input so diagonals are not faster (§5.2). Zero stays zero. */
export function normalizeInput(x: number, z: number): Vec2 {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 0 };
  const s = Math.min(len, 1) / len;
  return { x: x * s, z: z * s };
}

/**
 * Integrate velocity toward a desired direction with acceleration, with a
 * deceleration tail when input releases. Returns new velocity. `maxSpeed`
 * already folds in sprint multiplier.
 */
export function integrateVelocity(
  vel: Vec2,
  dir: Vec2,
  maxSpeed: number,
  accel: number,
  decel: number,
  dt: number,
): Vec2 {
  const hasInput = dir.x !== 0 || dir.z !== 0;
  let vx = vel.x;
  let vz = vel.z;

  if (hasInput) {
    const targetX = dir.x * maxSpeed;
    const targetZ = dir.z * maxSpeed;
    vx += (targetX - vx) * Math.min(1, accel * dt);
    vz += (targetZ - vz) * Math.min(1, accel * dt);
  } else {
    // Decel tail toward zero.
    const speed = Math.hypot(vx, vz);
    if (speed > 1e-6) {
      const drop = decel * dt;
      const scale = Math.max(0, speed - drop) / speed;
      vx *= scale;
      vz *= scale;
    }
  }

  // Hard clamp to max speed (overshoot guard).
  const sp = Math.hypot(vx, vz);
  if (sp > maxSpeed && sp > 1e-6) {
    const k = maxSpeed / sp;
    vx *= k;
    vz *= k;
  }
  return { x: vx, z: vz };
}

/**
 * Clamp position inside the arena (circle of `arenaRadius`). On contact, zero
 * the outward radial velocity component so the player slides along the wall.
 */
export function clampToArena(
  pos: Vec2,
  vel: Vec2,
  arenaRadius: number,
  collisionRadius: number,
): { pos: Vec2; vel: Vec2 } {
  const limit = arenaRadius - collisionRadius;
  const dist = Math.hypot(pos.x, pos.z);
  if (dist <= limit || dist < 1e-6) return { pos, vel };

  const nx = pos.x / dist;
  const nz = pos.z / dist;
  const outward = vel.x * nx + vel.z * nz;
  const vx = outward > 0 ? vel.x - outward * nx : vel.x;
  const vz = outward > 0 ? vel.z - outward * nz : vel.z;
  return { pos: { x: nx * limit, z: nz * limit }, vel: { x: vx, z: vz } };
}

export interface SprintState {
  charges: number; // whole charges currently available
  maxCharges: number;
  active: boolean;
  timeLeft: number; // remaining active duration
  cooldown: number; // time until next charge refills
  forgiveness: number; // collision-forgiveness window remaining (§5.3)
}

export const SPRINT_FORGIVENESS = 0.2; // 200ms i-frames on sprint start

export function newSprintState(stats: MovementStats): SprintState {
  return {
    charges: stats.sprintCharges,
    maxCharges: stats.sprintCharges,
    active: false,
    timeLeft: 0,
    cooldown: 0,
    forgiveness: 0,
  };
}

/**
 * Advance sprint resource. `want` = sprint key held. Consumes a charge on a
 * rising edge when one is available. Recharges one charge per cooldown.
 */
export function updateSprint(
  s: SprintState,
  want: boolean,
  stats: MovementStats,
  dt: number,
  /** Extra seconds of recharge progress this step (Backblast Harness: recoil
   *  feeds the sprint cooldown, T55). 0 = normal. */
  extraRecharge = 0,
): SprintState {
  let { charges, active, timeLeft, cooldown, forgiveness } = s;

  if (active) {
    timeLeft -= dt;
    forgiveness = Math.max(0, forgiveness - dt);
    if (timeLeft <= 0) {
      active = false;
      timeLeft = 0;
    }
  }

  if (!active && want && charges > 0) {
    active = true;
    timeLeft = stats.sprintDuration;
    forgiveness = SPRINT_FORGIVENESS;
    charges -= 1;
    if (cooldown <= 0) cooldown = stats.sprintCooldown;
  }

  if (charges < s.maxCharges) {
    cooldown -= dt + extraRecharge;
    if (cooldown <= 0) {
      charges += 1;
      cooldown = charges < s.maxCharges ? stats.sprintCooldown : 0;
    }
  }

  return { ...s, charges, active, timeLeft, cooldown, forgiveness };
}

/**
 * Apply a recoil impulse to velocity, capped so recoil never makes the player
 * uncontrollable (V10). `resistance` ∈ [0,1] scales the impulse down.
 */
export function applyRecoil(
  vel: Vec2,
  dirX: number,
  dirZ: number,
  force: number,
  resistance: number,
  dt: number,
  maxKick: number,
): Vec2 {
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-6 || force <= 0) return vel;
  const mag = Math.min(force * (1 - resistance) * dt, maxKick);
  return { x: vel.x + (dirX / len) * mag, z: vel.z + (dirZ / len) * mag };
}
