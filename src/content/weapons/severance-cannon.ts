// Severance Cannon (explosive). A rhythmic CROWD-CLEARER — every shot lobs a fat
// slug that DETONATES a wide blast on impact, so its job is wiping clusters, not
// single-target plinking. Reworked from the old 1.5s "feels like a downgrade"
// sluggard: a responsive ~1s boom cadence, a wider blast, and a faster slug so it
// lands where you aim. Niche vs. the sidearm (single-target) and minigun (spray) is
// AREA — it doesn't out-DPS them one-on-one, it deletes packs. Heavy recoil makes
// each boom a kiting shove (a CC dimension the others lack).

import type { WeaponDefinition } from '../../sim/combat/weapon';

export const severanceCannon: WeaponDefinition = {
  id: 'severance-cannon',
  displayName: 'Severance Cannon',
  family: 'explosive',
  tier: 2,
  targeting: 'aim',
  range: 22,
  cooldown: 0.95, // heavy but RESPONSIVE boom every ~1s (was 1.5 — felt dead)
  spread: 0.02,
  recoil: 16, // still a real shove (kiting CC), tamed so the faster cadence is usable
  explosiveRadius: 4.5, // wide blast — the whole point is clearing a cluster
  procCoef: 1.6, // a big AoE hit primes status across the pack (T69)
  projectile: { speed: 22, radius: 0.5, lifetime: 2.0, pierce: 0 }, // faster slug → lands cleanly
  damage: {
    base: 28, // lower per-hit than the old 34, but lands far more often + as AoE
    additive: 0,
    multiplier: 1,
    critChance: 0,
    critMultiplier: 2,
    type: 'explosive',
  },
  visualProfile: 'heavy-slug-t2',
  audioProfile: 'cannon-thump-t2',
};
