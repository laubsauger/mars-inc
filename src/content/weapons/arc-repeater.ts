// Arc Repeater (energy). Fast energy bolts that punch through a couple of bodies
// — strong into lined-up crowds, soft single-target. Innate pierce is its
// identity (mods/upgrades stack on top). (§18 family example.)

import type { WeaponDefinition } from '../../sim/combat/weapon';

export const arcRepeater: WeaponDefinition = {
  id: 'arc-repeater',
  displayName: 'Arc Repeater',
  family: 'energy',
  tier: 2,
  targeting: 'nearest-to-aim',
  range: 20,
  cooldown: 0.28,
  spread: 0.05,
  recoil: 2, // near-recoilless: the energy family's comfort PRO — plant + kite freely
  projectile: { speed: 34, radius: 0.16, lifetime: 1.2, pierce: 2 },
  damage: {
    base: 9,
    additive: 0,
    multiplier: 1,
    critChance: 0,
    critMultiplier: 2,
    type: 'energy',
  },
  visualProfile: 'arc-bolt-t2',
  audioProfile: 'energy-zap-t2',
};
