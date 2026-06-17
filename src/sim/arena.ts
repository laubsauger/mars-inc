// Arena shape (gameplay geometry, V4/V7). The Rust Crown circle is now ONE
// variant; the active arena is a 16:9 RECTANGLE that fills widescreen space.
// All boundary/spawn/camera math goes through these shape-aware helpers so a new
// arena is just a new `ArenaDef` — no per-system geometry assumptions.

import type { Vec2 } from './movement';
import { clampToArena as clampCircle } from './movement';

export type ArenaShape =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect'; readonly halfW: number; readonly halfZ: number };

export interface ArenaDef {
  readonly id: string;
  readonly name: string;
  readonly shape: ArenaShape;
  /** Highlight/rim hex — gives each arena a distinct visual identity. */
  readonly accent: string;
  /** Act number — the arena doubles as a difficulty/Act selector (T-Act). */
  readonly act: number;
  /** One-line pitch shown on the menu Act selector. */
  readonly tagline: string;
  /** Enemy HP multiplier for this Act (1 = baseline). */
  readonly difficultyMult: number;
  /** Spawn pace + concurrent-cap multiplier — higher Acts field MORE enemies, faster. */
  readonly paceMult: number;
  /** Martian Glory reward multiplier — harder Acts pay more (the growth outlet). */
  readonly gloryMult: number;
}

/** Act 1 — the widescreen 16:9 rectangle, blue-lit. The standard proving contract. */
export const COLD_VAULT: ArenaDef = {
  id: 'cold-vault',
  name: 'Cold Vault',
  shape: { kind: 'rect', halfW: 56, halfZ: 31.5 },
  accent: '#32d7ff', // shield cyan / blue
  act: 1,
  tagline: 'Standard contract for freshmen.',
  difficultyMult: 1,
  paceMult: 1,
  gloryMult: 1,
};

/** Act 2 — the circular Rust Crown, warm-lit. Tougher hosts, fatter Glory payouts;
 *  the arena you grow INTO once the Glory Tree has teeth. */
export const RUST_CROWN: ArenaDef = {
  id: 'rust-crown',
  name: 'Rust Crown',
  shape: { kind: 'circle', radius: 35 },
  accent: '#f0c879', // warm sun highlight
  act: 2,
  tagline: 'A heavier fight from the first bell — brutes, gunners + splitters from the open.',
  // Act 2 is a different FLOW, not Act 1 × force-multiplier: its roster cadence is
  // shoved forward (the mid-game composition lands immediately — see pickType) and it
  // carries a MODEST base bump. The big stat ladder now lives in the global difficulty
  // selector, so Act 1 stays relevant and Act 2 doesn't obsolete it at 3.5× HP.
  difficultyMult: 1.3, // modest base — difficulty TIERS provide the climb
  paceMult: 1.25, // a touch denser; the composition shift is the real pressure
  // Act 2 pays MORE, but modestly — its pace already floods kills (the kills term in
  // gloryFor rewards that). A fat mult on top double-dipped (a long FAIL paid ~3500).
  gloryMult: 1.3,
};

/** Selectable arenas (settings). */
export const ARENAS = { 'cold-vault': COLD_VAULT, 'rust-crown': RUST_CROWN } as const;
export type ArenaId = keyof typeof ARENAS;

// The ACTIVE arena. Set at boot from the saved setting; sim helpers read it live.
let active: ArenaDef = COLD_VAULT;
export function setActiveArena(id: ArenaId): void {
  active = ARENAS[id] ?? COLD_VAULT;
}
export function activeArena(): ArenaDef {
  return active;
}

// ── Global DIFFICULTY ladder (T-Act). Decoupled from the arena: a tier multiplies
//    enemy HP / pace / Glory on TOP of the arena's own base, applying to EVERY arena.
//    Unlocked after the first Act-2 boss kill, so Act 1 stays relevant (replay it on
//    Brutal) and progression is a clear ladder, not "the old arena is now useless".
export interface DifficultyTier {
  readonly id: string;
  readonly name: string;
  readonly hpMult: number;
  readonly paceMult: number;
  readonly gloryMult: number;
}
export const DIFFICULTIES: readonly DifficultyTier[] = [
  { id: 'standard', name: 'Standard', hpMult: 1, paceMult: 1, gloryMult: 1 },
  { id: 'veteran', name: 'Veteran', hpMult: 1.5, paceMult: 1.2, gloryMult: 1.4 },
  { id: 'brutal', name: 'Brutal', hpMult: 2.2, paceMult: 1.45, gloryMult: 1.9 },
  { id: 'nightmare', name: 'Nightmare', hpMult: 3.2, paceMult: 1.7, gloryMult: 2.6 },
];

let activeDiff = 0;
export function setActiveDifficulty(tier: number): void {
  activeDiff = tier < 0 ? 0 : tier >= DIFFICULTIES.length ? DIFFICULTIES.length - 1 : tier;
}
export function activeDifficulty(): DifficultyTier {
  return DIFFICULTIES[activeDiff]!;
}

/** Half-extents on x,z (a circle is square-bounded by its radius). */
export function arenaExtent(shape: ArenaShape = active.shape): { halfW: number; halfZ: number } {
  return shape.kind === 'circle'
    ? { halfW: shape.radius, halfZ: shape.radius }
    : { halfW: shape.halfW, halfZ: shape.halfZ };
}

/** Is a point inside the arena (optionally with an outward margin)? */
export function arenaContains(
  x: number,
  z: number,
  margin = 0,
  shape: ArenaShape = active.shape,
): boolean {
  if (shape.kind === 'circle') return Math.hypot(x, z) <= shape.radius + margin;
  return Math.abs(x) <= shape.halfW + margin && Math.abs(z) <= shape.halfZ + margin;
}

/** Clamp a moving point to inside the arena, killing the outward velocity
 *  component on any crossed wall (slide along walls). Shape-aware (V4). */
export function clampToArena(
  pos: Vec2,
  vel: Vec2,
  collisionRadius: number,
  shape: ArenaShape = active.shape,
): { pos: Vec2; vel: Vec2 } {
  if (shape.kind === 'circle') return clampCircle(pos, vel, shape.radius, collisionRadius);
  const lx = shape.halfW - collisionRadius;
  const lz = shape.halfZ - collisionRadius;
  let { x, z } = pos;
  let vx = vel.x;
  let vz = vel.z;
  if (x > lx) {
    x = lx;
    if (vx > 0) vx = 0;
  } else if (x < -lx) {
    x = -lx;
    if (vx < 0) vx = 0;
  }
  if (z > lz) {
    z = lz;
    if (vz > 0) vz = 0;
  } else if (z < -lz) {
    z = -lz;
    if (vz < 0) vz = 0;
  }
  return { pos: { x, z }, vel: { x: vx, z: vz } };
}

/** Hard-clamp a position inside the arena (for enemies kept in bounds; no vel). */
export function clampPoint(
  x: number,
  z: number,
  inset = 0,
  shape: ArenaShape = active.shape,
): Vec2 {
  if (shape.kind === 'circle') {
    const limit = shape.radius - inset;
    const d = Math.hypot(x, z);
    if (d <= limit || d < 1e-6) return { x, z };
    return { x: (x / d) * limit, z: (z / d) * limit };
  }
  const lx = shape.halfW - inset;
  const lz = shape.halfZ - inset;
  return { x: Math.max(-lx, Math.min(lx, x)), z: Math.max(-lz, Math.min(lz, z)) };
}

/**
 * A spawn point just OUTSIDE one of the 4 gates, for the telegraph walk-in.
 * `gate` 0..3, `along` ∈ [-1,1] jitters along the gate's edge, `out` pushes it
 * beyond the boundary. Circle gates sit on the rim by angle; rect gates sit at
 * the midpoint of each side (+x, +z, −x, −z).
 */
export function gateOuterPoint(
  gate: number,
  along: number,
  out: number,
  shape: ArenaShape = active.shape,
): Vec2 {
  if (shape.kind === 'circle') {
    const angle = (gate / 4) * Math.PI * 2 + along * 0.12;
    const r = shape.radius + out;
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  }
  const { halfW, halfZ } = shape;
  // Tight spread along the side — stays within the gate opening (≈ ±6), so a wave
  // reads as a cluster at one gate, not spread across the whole wall.
  const spanW = along * 6;
  const spanZ = along * 6;
  switch (gate & 3) {
    case 0:
      return { x: halfW + out, z: spanZ }; // +x wall
    case 1:
      return { x: spanW, z: halfZ + out }; // +z wall
    case 2:
      return { x: -halfW - out, z: spanZ }; // −x wall
    default:
      return { x: spanW, z: -halfZ - out }; // −z wall
  }
}

/** Distance along a unit ray from (px,pz) to the arena wall, capped at maxRange. */
export function wallDistance(
  px: number,
  pz: number,
  dx: number,
  dz: number,
  maxRange: number,
  shape: ArenaShape = active.shape,
): number {
  if (shape.kind === 'circle') {
    const pd = px * dx + pz * dz;
    const disc = pd * pd - (px * px + pz * pz - shape.radius * shape.radius);
    const tWall = disc > 0 ? -pd + Math.sqrt(disc) : maxRange;
    return Math.min(maxRange, tWall);
  }
  let t = maxRange;
  if (dx > 1e-9) t = Math.min(t, (shape.halfW - px) / dx);
  else if (dx < -1e-9) t = Math.min(t, (-shape.halfW - px) / dx);
  if (dz > 1e-9) t = Math.min(t, (shape.halfZ - pz) / dz);
  else if (dz < -1e-9) t = Math.min(t, (-shape.halfZ - pz) / dz);
  return t < 0 ? maxRange : t;
}

/** A random interior point (teleport materialize). `lo`/`hi` are fractions of the
 *  half-extents so spawns avoid the dead centre and the very edge. */
export function interiorPoint(
  rx: number,
  rz: number,
  lo: number,
  hi: number,
  shape: ArenaShape = active.shape,
): Vec2 {
  const sign = (r: number) => (r < 0.5 ? -1 : 1);
  if (shape.kind === 'circle') {
    const angle = rx * Math.PI * 2;
    const r = shape.radius * (lo + (hi - lo) * rz);
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  }
  const fx = lo + (hi - lo) * ((rx * 2) % 1);
  const fz = lo + (hi - lo) * ((rz * 2) % 1);
  return { x: sign(rx) * shape.halfW * fx, z: sign(rz) * shape.halfZ * fz };
}
