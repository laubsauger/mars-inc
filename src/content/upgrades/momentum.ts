// Run-and-gun card lanes (T-momentum). MARS PIT is a kiting shooter — you're always
// moving and always firing — so the fun build identities are MOBILITY and AGGRESSION,
// not "stand still and turtle". Two new conditional signals back these:
//   • movingSec  — ramps while you move (mirror of the stand-still stationarySec)
//   • rageStacks — kill-streak stacks (gained per kill, lost if the streak lapses)
// Plus a few trigger-driven synergy cards. All route the V3 pipeline + shared rng.
// Heavy on common/uncommon so the EARLY draft feels varied and exciting.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';
import { ImpactProfile } from '../../sim/fx';
import { ENEMY_BY_VARIANT } from '../../sim/enemies';

const heal = (player: { health: number; maxHealth: number }, amount: number): void => {
  player.health = Math.min(player.maxHealth, player.health + amount);
};

export const MOMENTUM_UPGRADES: UpgradeDefinition[] = [
  // ══ MOBILITY LANE — reward MOVING (the run-and-gun core) ════════════════════════
  {
    id: 'momentum',
    name: 'Momentum',
    description:
      'Keep moving, keep killing: damage ramps the longer you stay on the move (up to +35%).',
    tags: ['damage', 'mobility'],
    grantsTags: ['mobility'],
    rarity: 'common',
    maxLevel: 3,
    baseWeight: 9,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ damageMult: 1 + Math.min(0.35, c.movingSec * 0.05) })),
  },
  {
    id: 'hit-and-run',
    name: 'Hit & Run',
    description: '+12% crit chance while you are on the move — never stop strafing.',
    tags: ['crit', 'mobility'],
    grantsTags: ['mobility'],
    rarity: 'common',
    maxLevel: 3,
    baseWeight: 9,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) => effects.addConditional((c) => (c.moving ? { critAdd: 0.12 } : {})),
  },
  {
    id: 'roadrunner',
    name: 'Roadrunner',
    description:
      'Fire faster the longer you keep moving — sustained mobility ramps fire rate up to +30%.',
    tags: ['fire-rate', 'mobility'],
    requiresAnyTags: ['mobility'],
    grantsTags: ['mobility'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ fireRateMult: 1 + Math.min(0.3, c.movingSec * 0.04) })),
  },
  {
    id: 'glass-dancer',
    name: 'Glass Dancer',
    description:
      'CURSE: +55% damage while moving — but standing still leaves you exposed (−25% max HP).',
    tags: ['damage', 'mobility', 'risk'],
    grantsTags: ['mobility', 'glass'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'liability',
    riskTier: 1,
    apply: ({ effects, player }) => {
      player.maxHealth = Math.max(20, Math.round(player.maxHealth * 0.75));
      player.health = Math.min(player.health, player.maxHealth);
      effects.addConditional((c) => (c.moving ? { damageMult: 1.55 } : {}));
    },
  },

  // ══ RAGE LANE — reward CHAINING KILLS (streak snowball) ══════════════════════════
  {
    id: 'carnage-engine',
    name: 'Carnage Engine',
    description: 'Each kill stokes the fire: +2% damage per kill-streak stack (caps around +24%).',
    tags: ['damage', 'rage'],
    grantsTags: ['rage'],
    rarity: 'common',
    maxLevel: 3,
    baseWeight: 9,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ damageMult: 1 + c.rageStacks * 0.02 })),
  },
  {
    id: 'killing-edge',
    name: 'Killing Edge',
    description: '+1% crit chance per kill-streak stack — a chain of kills sharpens your aim.',
    tags: ['crit', 'rage'],
    grantsTags: ['rage'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) => effects.addConditional((c) => ({ critAdd: c.rageStacks * 0.01 })),
  },
  {
    id: 'frenzy',
    name: 'Frenzy',
    description:
      'Fire rate climbs with your kill-streak: +1.5% per stack — the more you kill, the faster you kill.',
    tags: ['fire-rate', 'rage'],
    requiresAnyTags: ['rage'],
    grantsTags: ['rage'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ fireRateMult: 1 + c.rageStacks * 0.015 })),
  },
  {
    id: 'berserkers-crown',
    name: "Berserker's Crown",
    description:
      'KEYSTONE: +4% damage AND +1% crit per kill-streak stack — a full streak makes you a monster.',
    tags: ['damage', 'crit', 'rage'],
    requiresAnyTags: ['rage'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 4,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({
        damageMult: 1 + c.rageStacks * 0.04,
        critAdd: c.rageStacks * 0.01,
      })),
  },

  // ══ SYNERGY / TRIGGER cards ══════════════════════════════════════════════════════
  {
    id: 'cull-the-weak',
    name: 'Cull the Weak',
    description:
      'Mowing down fodder sustains you: heal 2 HP whenever you kill a weak (low-threat) enemy.',
    tags: ['defense'],
    grantsTags: ['lifesteal'],
    rarity: 'common',
    maxLevel: 2,
    baseWeight: 8,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('kill', (ctx) => {
        if ((ENEMY_BY_VARIANT[ctx.variant]?.threat ?? 0) <= 3) heal(ctx.player, 2);
      }),
  },
  {
    id: 'trophy-hunter',
    name: 'Trophy Hunter',
    description:
      'Felling a TOUGH enemy (elite/brute) instantly banks 4 kill-streak stacks — keep the frenzy alive.',
    tags: ['rage'],
    grantsTags: ['rage'],
    rarity: 'uncommon',
    maxLevel: 1,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('kill', (ctx) => {
        if ((ENEMY_BY_VARIANT[ctx.variant]?.threat ?? 0) >= 8) {
          ctx.player.rage = Math.min(12, ctx.player.rage + 4);
          ctx.player.rageTimer = Math.max(ctx.player.rageTimer, 3);
        }
      }),
  },
  {
    id: 'powder-trail',
    name: 'Powder Trail',
    description: 'Sprinting ignites a wake: each dash erupts a 7m blast where you launch (24 dmg).',
    tags: ['aoe', 'mobility', 'explosive'],
    grantsTags: ['mobility'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'converter',
    riskTier: 0,
    // Two owned levels = two blasts per dash (handler per level) → damage doubles.
    previewStats: (lvl) => [
      { label: 'Radius', from: lvl === 0 ? '—' : '7m', to: '7m' },
      { label: 'Sprint blast', from: `${24 * lvl} dmg`, to: `${24 * (lvl + 1)} dmg` },
    ],
    apply: ({ effects }) =>
      effects.on('sprint', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 7, 24);
        ctx.fx.push('impact', ctx.x, ctx.z, 7, 0, ImpactProfile.Blast);
      }),
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    description:
      'On the brink, you EXPLODE into fury: dropping low heals 30 and instantly maxes your kill-streak.',
    tags: ['defense', 'rage'],
    grantsTags: ['rage', 'panic'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'liability',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.on('lowHp', (ctx) => {
        heal(ctx.player, 30); // was 25 + invuln; invuln removed (too strong), heal bumped slightly
        ctx.player.rage = 12;
        ctx.player.rageTimer = Math.max(ctx.player.rageTimer, 3);
      }),
  },
];
