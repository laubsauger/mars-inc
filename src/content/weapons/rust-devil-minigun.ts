// Rust Devil Minigun (rotary). A bullet hose — tiny per-shot damage at a furious
// fire rate, wide spray, heavy recoil. Rewards staying on target; punishes
// trigger discipline with kickback. (§18 family example.)

import type { WeaponDefinition } from '../../sim/combat/weapon';

export const rustDevilMinigun: WeaponDefinition = {
  id: 'rust-devil-minigun',
  displayName: 'Rust Devil Minigun',
  family: 'rotary',
  tier: 1,
  targeting: 'aim',
  range: 18,
  cooldown: 0.07,
  spread: 0.16,
  recoil: 9,
  projectile: { speed: 28, radius: 0.16, lifetime: 1.0, pierce: 0 },
  damage: {
    base: 3,
    additive: 0,
    multiplier: 1,
    critChance: 0.08,
    critMultiplier: 2,
    type: 'kinetic',
  },
  visualProfile: 'rotary-tracer-t1',
  audioProfile: 'rotary-brap-t1',
};
