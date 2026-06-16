// Weapon evolutions (T34, V18). A weapon transforms into an advanced form only
// when a COMBO requirement is met — specific support upgrades at level — never by
// the weapon reaching some level alone. Data-driven: an evolution links a base
// weapon id to an evolved WeaponDefinition behind a list of upgrade requirements.

import type { WeaponDefinition } from '../../sim/combat/weapon';
import type { UpgradeLevels } from '../../sim/progression/upgrades';

// Rust Devil Minigun → its overclocked apex form: even faster, now punches
// through a body. Earned by maxing fire rate AND stacking damage (the combo).
export const rustDevilApex: WeaponDefinition = {
  id: 'rust-devil-apex',
  displayName: 'Rust Devil Apex',
  family: 'rotary',
  tier: 3,
  targeting: 'aim',
  range: 20,
  cooldown: 0.045,
  spread: 0.12,
  recoil: 7,
  projectile: { speed: 32, radius: 0.18, lifetime: 1.1, pierce: 1 },
  damage: {
    base: 6,
    additive: 0,
    multiplier: 1,
    critChance: 0.14,
    critMultiplier: 2,
    type: 'kinetic',
  },
  visualProfile: 'rotary-tracer-t3',
  audioProfile: 'rotary-brap-t3',
};

// Arc Repeater → chained energy cannon, earned by investing in arcing.
export const teslaCascade: WeaponDefinition = {
  id: 'tesla-cascade',
  displayName: 'Tesla Cascade',
  family: 'energy',
  tier: 3,
  targeting: 'nearest-to-aim',
  range: 22,
  cooldown: 0.22,
  spread: 0.04,
  recoil: 4,
  projectile: { speed: 38, radius: 0.18, lifetime: 1.3, pierce: 3 },
  damage: {
    base: 12,
    additive: 0,
    multiplier: 1,
    critChance: 0.16,
    critMultiplier: 2,
    type: 'energy',
  },
  visualProfile: 'arc-bolt-t3',
  audioProfile: 'energy-zap-t3',
};

export interface EvolutionReq {
  upgradeId: string;
  minLevel: number;
}

export interface WeaponEvolution {
  baseId: string; // weapon that evolves
  evolved: WeaponDefinition; // what it becomes
  requires: readonly EvolutionReq[]; // the COMBO gate (V18: ⊥ weapon level alone)
}

export const EVOLUTIONS: readonly WeaponEvolution[] = [
  {
    baseId: 'rust-devil-minigun',
    evolved: rustDevilApex,
    requires: [
      { upgradeId: 'rapid-billing', minLevel: 5 },
      { upgradeId: 'overcharge', minLevel: 3 },
    ],
  },
  {
    baseId: 'arc-repeater',
    evolved: teslaCascade,
    requires: [{ upgradeId: 'arc-garnishment', minLevel: 2 }],
  },
];

/** The evolution available for `baseId` given owned upgrade levels, or undefined.
 *  ALL requirements must be met — the combo gate (V18). */
export function availableEvolution(
  baseId: string,
  levels: UpgradeLevels,
): WeaponEvolution | undefined {
  return EVOLUTIONS.find(
    (e) => e.baseId === baseId && e.requires.every((r) => (levels[r.upgradeId] ?? 0) >= r.minLevel),
  );
}
