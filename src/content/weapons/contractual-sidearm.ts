// Tier-0 starter weapon (§18 example). "This pistol is pathetic." — by design.

import type { WeaponDefinition } from '../../sim/combat/weapon';

export const contractualSidearm: WeaponDefinition = {
  id: 'contractual-sidearm',
  displayName: 'Contractual Sidearm',
  family: 'sidearm',
  tier: 0,
  targeting: 'aim',
  range: 15, // modest opening reach — still rewards range upgrades, less cramped early (T33)
  cooldown: 0.62,
  spread: 0.015,
  recoil: 6,
  projectile: { speed: 24, radius: 0.18, lifetime: 1.4, pierce: 0 },
  damage: {
    base: 6,
    additive: 0,
    multiplier: 1,
    critChance: 0,
    critMultiplier: 2,
    type: 'energy',
  },
  visualProfile: 'plasma-pistol-t0',
  audioProfile: 'plasma-pistol-t0',
};
