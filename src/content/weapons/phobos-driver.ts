// Phobos Driver (orbital). A long-range mass driver: high projectile speed,
// long reach, solid punch-through, meaty recoil. The sniper of the set — keeps
// the whole arena in threat range. (§18 family example.)

import type { WeaponDefinition } from '../../sim/combat/weapon';

export const phobosDriver: WeaponDefinition = {
  id: 'phobos-driver',
  displayName: 'Phobos Driver',
  family: 'orbital',
  tier: 3,
  targeting: 'aim',
  range: 30,
  cooldown: 0.55,
  spread: 0.01,
  recoil: 11,
  projectile: { speed: 40, radius: 0.22, lifetime: 1.6, pierce: 1 },
  damage: {
    base: 16,
    additive: 0,
    multiplier: 1,
    critChance: 0.15,
    critMultiplier: 2.2,
    type: 'kinetic',
  },
  visualProfile: 'rail-streak-t3',
  audioProfile: 'rail-crack-t3',
};
