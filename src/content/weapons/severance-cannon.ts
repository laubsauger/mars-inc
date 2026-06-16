// Severance Cannon (explosive). A slow, heavy slug that hits like a truck —
// low fire rate, big projectile, brutal recoil. AoE-on-impact lands with the
// explosive-payload pass; for now it's a high single-target punch. (§18.)

import type { WeaponDefinition } from '../../sim/combat/weapon';

export const severanceCannon: WeaponDefinition = {
  id: 'severance-cannon',
  displayName: 'Severance Cannon',
  family: 'explosive',
  tier: 2,
  targeting: 'aim',
  range: 22,
  cooldown: 1.5,
  spread: 0.02,
  recoil: 24, // truck-stop kick on each slug; very slow fire keeps it controllable
  explosiveRadius: 4.0, // detonates on impact — AoE around the blast point
  projectile: { speed: 16, radius: 0.5, lifetime: 2.0, pierce: 0 },
  damage: {
    base: 34,
    additive: 0,
    multiplier: 1,
    critChance: 0.04,
    critMultiplier: 2,
    type: 'explosive',
  },
  visualProfile: 'heavy-slug-t2',
  audioProfile: 'cannon-thump-t2',
};
