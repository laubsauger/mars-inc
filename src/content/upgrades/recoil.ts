// Recoil build family (T55). Recoil stops being a cosmetic kick and becomes an
// engine: it recharges sprint, buffs shots while it's moving you, ramps fire
// rate, and eventually pushes you around the arena. Entry card grants the
// `recoil` tag; the rest are tag-gated (T51) so they appear once you commit.
// Recoil impulse is still V10-capped — `recoilMult` only firms up the kick.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const RECOIL_UPGRADES: UpgradeDefinition[] = [
  // PRIMER — recoil works both ways: it firms the kick into real mobility AND your
  // shots physically SHOVE enemies back. Always useful (crowd control on every hit),
  // and the entry that grants the `recoil` tag for the rest of the family.
  {
    id: 'counterthrust-rig',
    name: 'Counterthrust Rig',
    description:
      'Newton bites both ways: your shots SHOVE enemies back and the kick drives you harder.',
    tags: ['recoil', 'mobility', 'control'],
    grantsTags: ['recoil'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ mods }) => {
      mods.knockback += 8; // every hit nudges the target back — real space-buying CC
      mods.recoilMult += 0.25; // firmer kick → recoil becomes a mobility tool
    },
  },
  // ENGINE — shots hit harder + pierce while recoil is moving you.
  {
    id: 'brass-surfing',
    name: 'Brass Surfing',
    description: '+1 Pierce, and +30% damage while recoil is moving you.',
    tags: ['recoil', 'damage'],
    requiresAnyTags: ['recoil'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 1,
    apply: ({ mods, effects }) => {
      mods.pierce += 1;
      effects.addConditional((c) => (c.recoilActive ? { damageMult: 1.3 } : {}));
    },
  },
  // CONVERTER — each shot vents a shockwave around you (crowd-parting).
  {
    id: 'countermass-failure',
    name: 'Countermass Failure',
    description: 'Every shot vents a small shockwave around you (8 dmg, 3m).',
    tags: ['recoil', 'control', 'kinetic'],
    requiresAnyTags: ['recoil'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.on('shot', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 3, 8);
        ctx.fx.push('impact', ctx.x, ctx.z);
      }),
  },
  // LIABILITY — overdraw the gun: flat fire-rate gain paid for in recoil kick. No
  // ramp/hold mechanic (we perma-fire — a "while you hold a target" ramp was always-on
  // and meaningless). Straight trade: you fire faster, the gun fights you harder.
  {
    id: 'kinetic-overdraft',
    name: 'Kinetic Overdraft',
    description: 'LIABILITY: +35% fire rate, but recoil kicks 45% harder — overdraw the gun.',
    tags: ['recoil', 'fire-rate', 'risk'],
    requiresAnyTags: ['recoil'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 3,
    role: 'liability',
    riskTier: 2,
    apply: ({ mods }) => {
      mods.fireRateMult += 0.35;
      mods.recoilMult += 0.45;
    },
  },
  // CATASTROPHE — recoil hauls you across the arena; every 100th shot erupts.
  {
    id: 'god-kicker-assembly',
    name: 'God-Kicker Assembly',
    description:
      'CATASTROPHE: max recoil shoves you across the pit; every 100th shot erupts (60 dmg, 6m).',
    tags: ['recoil', 'kinetic', 'risk'],
    requiresAnyTags: ['recoil'],
    prerequisites: [{ id: 'kinetic-overdraft' }],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 3,
    role: 'catastrophe',
    riskTier: 3,
    apply: ({ mods, effects }) => {
      mods.recoilMult += 0.7;
      let shots = 0;
      effects.on('shot', (ctx) => {
        shots += 1;
        if (shots % 100 === 0) {
          ctx.dealArea(ctx.x, ctx.z, 6, 60);
          ctx.fx.push('impact', ctx.x, ctx.z);
        }
      });
    },
  },
];
