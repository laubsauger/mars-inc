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
  spread: number; // radians of random fire spread
  recoil: number; // impulse force on the player
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
