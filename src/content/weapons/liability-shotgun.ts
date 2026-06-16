// Liability Shotgun (scatter). A fan of pellets per pull — devastating in the
// face, near-useless past a few metres. Short range + short pellet lifetime
// enforce the close-quarters identity. (§18 family example.)

import type { WeaponDefinition } from '../../sim/combat/weapon';

export const liabilityShotgun: WeaponDefinition = {
  id: 'liability-shotgun',
  displayName: 'Liability Shotgun',
  family: 'sidearm',
  tier: 1,
  targeting: 'aim',
  range: 13,
  cooldown: 0.85,
  spread: 0,
  pellets: 8,
  spreadArc: 0.5,
  recoil: 24, // a hard kick BACK per blast — but the slow fire lets you recover
  projectile: { speed: 22, radius: 0.18, lifetime: 0.55, pierce: 0 },
  damage: {
    base: 4,
    additive: 0,
    multiplier: 1,
    critChance: 0,
    critMultiplier: 2,
    type: 'kinetic',
  },
  visualProfile: 'scatter-slug-t1',
  audioProfile: 'shotgun-boom-t1',
};
