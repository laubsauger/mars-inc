// New-mechanic cards (T-mechanics). Unlike the spice set (which rides existing
// hooks), each of these is backed by a NEW sim primitive added for it:
//   • Smart Rounds   → projectile homing (mods.homingTurn → weapon-system steer)
//   • Whirling Edges → orbital blades (player.orbit* → OrbitalSystem)
//   • Chrono Dash    → time dilation (player.timeWarp → world enemy-dt scale)
//   • Reactive Plating / Retort → the `hurt` trigger (fired by world on damage taken)
// Everything still routes the V3 pipeline + shared rng (V16/V21).

import type { UpgradeDefinition } from '../../sim/progression/upgrades';
import { ImpactProfile } from '../../sim/fx';

export const MECHANICS_UPGRADES: UpgradeDefinition[] = [
  // ── Homing ────────────────────────────────────────────────────────────────────
  {
    id: 'smart-rounds',
    name: 'Smart Rounds',
    description: 'Your bullets steer themselves — they curve toward nearby enemies in flight.',
    tags: ['precision', 'damage'],
    grantsTags: ['homing'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ mods }) => {
      // Each level tightens the turn (rad/s). L1 lazy curve, L3 near-seeking.
      mods.homingTurn += 3.5;
    },
  },

  // ── Orbital blades ──────────────────────────────────────────────────────────────
  {
    id: 'whirling-edges',
    name: 'Whirling Edges',
    description:
      'A spinning energy blade orbits you, slicing anything it sweeps. +1 blade per level.',
    tags: ['aoe', 'defense'],
    grantsTags: ['orbital'],
    rarity: 'uncommon',
    maxLevel: 4,
    baseWeight: 7,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ player }) => {
      player.orbitCount += 1;
    },
  },
  {
    id: 'blade-storm',
    name: 'Blade Storm',
    description:
      'KEYSTONE: +2 orbital blades, a wider orbit, and they cut MUCH deeper (heavier slices).',
    tags: ['aoe', 'defense'],
    grantsTags: ['orbital'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 4,
    role: 'engine',
    riskTier: 0,
    apply: ({ player }) => {
      player.orbitCount += 2;
      player.orbitRadius += 2;
      player.orbitDamage += 14;
    },
  },

  // ── Time dilation ────────────────────────────────────────────────────────────────
  {
    id: 'chrono-dash',
    name: 'Chrono Dash',
    description: 'Sprinting warps time: for 2.5s the whole arena crawls while you move full speed.',
    tags: ['mobility', 'control'],
    grantsTags: ['timewarp'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('sprint', (ctx) => {
        ctx.player.timeWarp = Math.max(ctx.player.timeWarp, 2.5);
      }),
  },

  // ── Retaliation (hurt trigger) ────────────────────────────────────────────────────
  {
    id: 'reactive-plating',
    name: 'Reactive Plating',
    description:
      'Getting hit BLASTS back: take damage → a 7m retaliation nova (scales with the hit).',
    tags: ['defense', 'aoe'],
    grantsTags: ['thorns'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'converter',
    riskTier: 0,
    // A handler per level → N retaliation novas per hit (damage scales with levels).
    previewStats: (lvl) => [
      { label: 'Radius', from: lvl === 0 ? '—' : '7m', to: '7m' },
      { label: 'Retaliation novas', from: lvl === 0 ? '—' : `${lvl}`, to: `${lvl + 1}` },
    ],
    apply: ({ effects }) =>
      effects.on('hurt', (ctx) => {
        // The wave hits back harder the bigger the blow you took (magnitude = dmg).
        const dmg = 12 + ctx.magnitude * 1.5;
        ctx.dealArea(ctx.x, ctx.z, 7, dmg);
        ctx.fx.push('impact', ctx.x, ctx.z, 7, 0, ImpactProfile.Blast);
      }),
  },
  {
    id: 'spite-engine',
    name: 'Spite Engine',
    description: 'KEYSTONE: every hit you take SHOCKS and shoves the whole crowd around you (7m).',
    tags: ['defense', 'aoe', 'control'],
    grantsTags: ['thorns', 'shock'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 0,
    previewStats: (lvl) => [
      { label: 'Radius', from: lvl === 0 ? '—' : '7m', to: '7m' },
      { label: 'Retaliation', from: lvl === 0 ? '—' : '20+ dmg + shove', to: '20+ dmg + shove' },
    ],
    apply: ({ effects }) =>
      effects.on('hurt', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 7, 20 + ctx.magnitude);
        ctx.fx.push('impact', ctx.x, ctx.z, 7, 0, ImpactProfile.Blast);
      }),
  },
];
