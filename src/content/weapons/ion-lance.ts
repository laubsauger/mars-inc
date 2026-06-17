// Ion Lance (energy / HITSCAN). The first true laser: instead of a travelling bolt
// it fires an INSTANT beam down your aim line — damaging every enemy it passes
// through to the wall (piercing a couple bodies), then drawing the lance. Slow,
// deliberate, long-reach, heavy per-hit (so it applies status well, T69). The
// trade-off vs. the bullet families: no projectile travel = no lead/arc, but the
// long cooldown means you must place each shot. (§6.1 data-driven; the weapon never
// implements its own rules — `hitscan` flips the shared beam path in weapon-system.)

import type { WeaponDefinition } from '../../sim/combat/weapon';

export const ionLance: WeaponDefinition = {
  id: 'ion-lance',
  displayName: 'Ion Lance',
  family: 'energy',
  tier: 1,
  targeting: 'aim',
  range: 26, // long reach — a sniper beam across the pit
  cooldown: 0.5, // slow, deliberate cadence (place every shot)
  spread: 0,
  recoil: 6,
  procCoef: 1.4, // one heavy hit → strong on-hit status (T69)
  hitscan: { width: 0.35 }, // beam half-width that catches a body
  // Hitscan ignores speed/radius/lifetime; `pierce` = bodies the beam passes through.
  projectile: { speed: 0, radius: 0, lifetime: 0, pierce: 2 },
  damage: {
    base: 16,
    additive: 0,
    multiplier: 1,
    critChance: 0.1,
    critMultiplier: 2.2,
    type: 'energy',
  },
  visualProfile: 'energy-lance-t1',
  audioProfile: 'energy-zap-t1',
};
