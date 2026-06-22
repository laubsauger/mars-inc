// Wildcard lane (T-variety). A batch of MECHANICALLY DISTINCT cards that lean on
// build-engine hooks the existing catalog underuses — sustained-fire ramps, the
// local-clear "breather", full wave-clears, recoil windows, kiting distance, and
// overkill spillover. Goal: widen the space of COOL builds the draft can surface,
// not add more "+10%" tunes. Everything routes the V3 pipeline + shared rng (V16/V21).

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

const heal = (player: { health: number; maxHealth: number }, amount: number): void => {
  player.health = Math.min(player.maxHealth, player.health + amount);
};

export const WILDCARD_UPGRADES: UpgradeDefinition[] = [
  // ══ KITING / SPACING — reward controlling distance ════════════════════════════
  {
    id: 'cold-precision',
    name: 'Cold Precision',
    description:
      'A clear field sharpens your aim: while no enemy is within 16m, +40% crit chance and +25% damage. Reward for kiting clean.',
    tags: ['crit', 'mobility'],
    grantsTags: ['mobility'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => (c.nearestDist > 16 ? { critAdd: 0.4, damageMult: 1.25 } : {})),
  },

  // ══ SUSTAINED FIRE — reward holding the trigger (firingRampSec) ════════════════
  {
    id: 'overflow-valve',
    name: 'Overflow Valve',
    description:
      'Your weapon spins up the longer you keep firing: fire rate ramps up to +45% over ~9s of sustained combat, resets when the field goes quiet.',
    tags: ['fire-rate'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ fireRateMult: 1 + Math.min(0.45, c.firingRampSec * 0.05) })),
  },
  {
    id: 'heat-soak',
    name: 'Heat Soak',
    description:
      'Damage climbs with sustained fire: +4% per second of continuous combat, up to +40%. Punishes letting up.',
    tags: ['damage'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ damageMult: 1 + Math.min(0.4, c.firingRampSec * 0.04) })),
  },

  // ══ RECOIL WINDOW — reward riding the kick (recoilActive) ══════════════════════
  {
    id: 'kinetic-bleed',
    name: 'Kinetic Bleed',
    description:
      'Every shot that shoves you back also sharpens the next: +30% crit chance while recoil is moving you. Lean into the kick.',
    tags: ['crit', 'recoil'],
    grantsTags: ['recoil'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) => effects.addConditional((c) => (c.recoilActive ? { critAdd: 0.3 } : {})),
  },

  // ══ LOCAL CLEAR — reward making space (breather trigger) ══════════════════════
  {
    id: 'eye-of-the-storm',
    name: 'Eye of the Storm',
    description:
      'Carve out breathing room and recover: clearing all enemies within ~7m heals 6 HP. Kite, clear, repeat.',
    tags: ['defense', 'mobility'],
    grantsTags: ['mobility'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    previewStats: (lvl) => [
      { label: 'Heal on local clear', from: `${6 * lvl} HP`, to: `${6 * (lvl + 1)} HP` },
    ],
    apply: ({ effects }) => effects.on('breather', (ctx) => heal(ctx.player, 6)),
  },

  // ══ FULL WAVE CLEAR — reward emptying the arena (waveClear trigger) ═══════════
  {
    id: 'clean-sweep',
    name: 'Clean Sweep',
    description:
      'Empty the arena and ride the high: clearing EVERY enemy on the field heals 25 HP and maxes your kill-streak. A rare, earned payoff.',
    tags: ['rage', 'defense'],
    grantsTags: ['rage'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('waveClear', (ctx) => {
        heal(ctx.player, 25);
        ctx.player.rage = 12;
        ctx.player.rageTimer = Math.max(ctx.player.rageTimer, 3);
      }),
  },

  // ══ OVERKILL SPILLOVER — reward big hits (overkill magnitude + dealArea) ═══════
  {
    id: 'spillover',
    name: 'Spillover',
    description:
      'Wasted damage finds new targets: when you overkill an enemy, the excess erupts as a 3m blast (60% of the overkill). Big hits chain into crowds.',
    tags: ['aoe', 'damage'],
    grantsTags: ['aoe'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 0,
    previewStats: (lvl) => [
      { label: 'Overkill blast', from: lvl === 0 ? '—' : `${60 * lvl}%`, to: `${60 * (lvl + 1)}%` },
      { label: 'Radius', from: lvl === 0 ? '—' : '3m', to: '3m' },
    ],
    apply: ({ effects }) =>
      effects.on('overkill', (ctx) => {
        if (ctx.magnitude <= 0) return;
        ctx.dealArea(ctx.x, ctx.z, 3, ctx.magnitude * 0.6);
        ctx.fx.push('impact', ctx.x, ctx.z);
      }),
  },
  {
    id: 'reapers-dividend',
    name: "Reaper's Dividend",
    description:
      'You feed on excess: overkilling an enemy heals you for 8% of the wasted damage (up to 6 HP a kill). Hit hard, stay topped up.',
    tags: ['defense'],
    grantsTags: ['lifesteal'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('overkill', (ctx) => heal(ctx.player, Math.min(6, ctx.magnitude * 0.08))),
  },

  // ══ ON-CRIT STATUS PRIMERS — alternate priming surfaces (crit, not every hit) ══
  {
    id: 'shatterpoint',
    name: 'Shatterpoint',
    description:
      'PRIMER: every CRIT adds 2 Bleed stacks (5s, 60% of the hit each over time). A crit build that doubles as a bleed engine.',
    tags: ['bleed', 'crit', 'status'],
    grantsTags: ['bleed'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('crit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'bleed', { duration: 5, dotCoef: 0.6, stacks: 2 }),
      ),
  },
  {
    id: 'arc-crit',
    name: 'Arc Charge',
    description:
      'PRIMER: every CRIT arms the target with 2 Shock stacks (3s, max 6). Shock deals no damage alone — pair with a reaction converter to detonate it.',
    tags: ['shock', 'crit', 'status'],
    grantsTags: ['shock'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('crit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'shock', { duration: 3, stacks: 2 }),
      ),
  },

  // ══ POSITIVE-HP TEMPO — reward staying healthy (opposite of the risk lane) ═════
  {
    id: 'full-throttle',
    name: 'Full Throttle',
    description:
      'Confidence at full health: while above 80% HP, +50% fire rate. Stay clean, stay fast — the anti-turtle aggression card.',
    tags: ['fire-rate'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => (c.hpFrac > 0.8 ? { fireRateMult: 1.5 } : {})),
  },
];
