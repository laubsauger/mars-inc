// Weapon definitions are data (§6.1, §I.data). Behavior is composed from shared
// systems — a weapon never implements its own damage or movement rules.

import type { DamageType } from './damage';

export type WeaponFamily = 'sidearm' | 'rotary' | 'explosive' | 'drone' | 'energy' | 'orbital';

export type TargetingRule = 'aim' | 'nearest' | 'nearest-to-aim' | 'lowest-health';

export interface ProjectileSpec {
  speed: number;
  radius: number;
  lifetime: number;
  pierce: number;
}

export interface WeaponDamageSpec {
  base: number;
  additive: number;
  multiplier: number;
  critChance: number;
  critMultiplier: number;
  type: DamageType;
}

export interface WeaponDefinition {
  id: string;
  displayName: string;
  family: WeaponFamily;
  tier: number;
  targeting: TargetingRule;
  range: number;
  cooldown: number;
  spread: number; // radians of random fire spread (single shot jitter)
  recoil: number; // impulse force on the player
  /** Innate pellets per shot (shotgun-style); default 1. Stacks with multishot. */
  pellets?: number;
  /** Fan width (radians) when firing multiple pellets; default = run-mod spreadArc. */
  spreadArc?: number;
  /** Explosive blast radius dealt on impact (V3-routed AoE); 0/absent = none. */
  explosiveRadius?: number;
  /** HITSCAN (T-laser): present → the weapon fires an INSTANT beam instead of a
   *  projectile. It damages every enemy within `width` of the aim line out to range
   *  (piercing up to projectile.pierce + mods.pierce), then draws a laser. */
  hitscan?: { width: number };
  /** Proc coefficient (T69, V32): scales on-hit status/trigger chance·duration·
   *  magnitude. Absent → the weapon's family default (`procCoefOf`, combat/proc.ts).
   *  Fast-spray families low (~0.5), slow-big-hit high (~2.5). */
  procCoef?: number;
  projectile: ProjectileSpec;
  damage: WeaponDamageSpec;
  visualProfile: string;
  audioProfile: string;
}

/** Live state for an equipped weapon. */
export interface WeaponInstance {
  def: WeaponDefinition;
  cooldownLeft: number;
}

export function equip(def: WeaponDefinition): WeaponInstance {
  return { def, cooldownLeft: 0 };
}
