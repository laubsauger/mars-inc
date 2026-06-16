// Rust Devil Minigun (rotary). A bullet hose — tiny per-shot damage at a furious
// fire rate, wide spray. TRADE-OFF: at this fire rate its recoil SHOVES you
// backward off your aim — hosing one direction continuously drives you the other
// way, so you fight your own gun for position. (§18 family example.)

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
  recoil: 26, // caps the per-shot kick; the fire rate makes it a continuous shove
  projectile: { speed: 28, radius: 0.16, lifetime: 1.0, pierce: 0 },
  damage: {
    base: 3,
    additive: 0,
    multiplier: 1,
    critChance: 0.03,
    critMultiplier: 2,
    type: 'kinetic',
  },
  visualProfile: 'rotary-tracer-t1',
  audioProfile: 'rotary-brap-t1',
};
