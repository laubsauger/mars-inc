// New build DIRECTIONS (Batch 1 — replayability pass). Each card opens a distinct
// playstyle lane the old catalog never touched, built on sim levers that were wired
// but unused: the `recentCrit` conditional, and the `lowHp` / `sprint` / `waveClear`
// triggers (all fired by World as of Batch 1). Goal: builds that aren't "+projectile
// again" — crit-momentum, panic/low-HP, kite-and-clear, sprint-offense, glass-scaling.
//
// All effects route through the existing engine (effects.addConditional / .on(event)
// → ctx.dealArea/applyStatus, all V3-pipelined) — no new sim primitives. Tags are
// chosen so synergy weighting + future tag gates branch these into real archetypes.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const DIRECTION_UPGRADES: UpgradeDefinition[] = [
  // ══ CRIT-MOMENTUM — land crits to stay "hot", which makes you crit/kill more ═══
  {
    id: 'killing-spree',
    name: 'Killing Spree',
    description: '+6% fire rate per level for 1.5s after a critical hit (refreshes on each crit).',
    tags: ['crit', 'fire-rate', 'tempo'],
    grantsTags: ['tempo'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => (c.recentCrit ? { fireRateMult: 1.06 } : {})),
  },
  {
    id: 'bloodlust',
    name: 'Bloodlust',
    description: '+8% damage per level for 1.5s after a critical hit, plus +2% base crit chance.',
    tags: ['crit', 'tempo'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 4,
    requiresAnyTags: ['crit'],
    role: 'engine',
    riskTier: 0,
    apply: ({ mods, effects }) => {
      mods.critChanceAdd += 0.02; // a little base crit so the loop can start
      effects.addConditional((c) => (c.recentCrit ? { damageMult: 1.08 } : {}));
    },
  },
  {
    id: 'critical-cascade',
    name: 'Critical Cascade',
    description:
      'Critical hits splash 40% of the hit as damage to enemies within 2.2m of the victim.',
    tags: ['crit', 'aoe'],
    grantsTags: ['aoe'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    requiresAnyTags: ['crit'],
    role: 'converter',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.on('crit', (ctx) => {
        if (ctx.hitDamage > 0) ctx.dealArea(ctx.x, ctx.z, 2.2, ctx.hitDamage * 0.4);
      }),
  },

  // ══ PANIC / LOW-HP — dropping into the red is a TRIGGER, not just a debuff ══════
  {
    id: 'adrenaline-dump',
    name: 'Adrenaline Dump',
    description:
      'Dropping below 40% health blasts a 4.5m shockwave (12 damage + heavy knockback) to clear space.',
    tags: ['control', 'risk', 'panic'],
    grantsTags: ['panic'],
    rarity: 'uncommon',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.on('lowHp', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 4.5, 12); // shove + light damage (knockback in the spec)
        ctx.fx.push('impact', ctx.x, ctx.z);
      }),
  },
  {
    id: 'last-ditch-protocol',
    name: 'Last-Ditch Protocol',
    description:
      'Dropping below 40% health vents a 40-damage nova (5.5m) and heals you for 10% max HP.',
    tags: ['risk', 'panic', 'explosive'],
    grantsTags: ['panic'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    requiresAnyTags: ['panic', 'risk'],
    role: 'converter',
    riskTier: 2,
    apply: ({ effects }) =>
      effects.on('lowHp', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 5.5, 40);
        ctx.player.health = Math.min(
          ctx.player.maxHealth,
          ctx.player.health + ctx.player.maxHealth * 0.1,
        );
        ctx.fx.push('death', ctx.x, ctx.z, 1, 0, 0);
      }),
  },

  // ══ KITE & CLEAR — wiping the field is the payoff (rewards full clears) ═════════
  {
    id: 'breather',
    name: 'Breather',
    description: 'Clearing every enemy patches you for 8% max health.',
    tags: ['sustain', 'defense'],
    grantsTags: ['sustain'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('waveClear', (ctx) => {
        ctx.player.health = Math.min(
          ctx.player.maxHealth,
          ctx.player.health + ctx.player.maxHealth * 0.08,
        );
      }),
  },
  {
    id: 'overtime-bonus',
    name: 'Overtime Bonus',
    description: 'Clearing every enemy grants 0.8s of invulnerability — a breather between waves.',
    tags: ['sustain', 'tempo'],
    grantsTags: ['sustain'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 2,
    requiresAnyTags: ['sustain'],
    role: 'converter',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('waveClear', (ctx) => {
        ctx.player.invuln = Math.max(ctx.player.invuln, 0.8); // brief breathing room
      }),
  },

  // ══ SPRINT-OFFENSE — movement IS a weapon (the dash becomes a strike) ══════════
  {
    id: 'slipstream-rounds',
    name: 'Slipstream Rounds',
    description: 'Starting a sprint discharges a 14-damage burst in a 3.5m ring per level.',
    tags: ['movement', 'aoe', 'tempo'],
    grantsTags: ['sprint-build'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('sprint', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 3.5, 14);
        ctx.fx.push('impact', ctx.x, ctx.z);
      }),
  },
  {
    id: 'detonation-dash',
    name: 'Detonation Dash',
    description: 'Each sprint detonates a heavy 36-damage concussive blast in a 5.5m radius.',
    tags: ['movement', 'aoe', 'explosive'],
    grantsTags: ['sprint-build'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    requiresAnyTags: ['sprint-build', 'movement'],
    role: 'converter',
    riskTier: 1,
    // A single big burst per sprint (the player-trigger dealArea shoves via the
    // pipeline knockback) — distinct from Slipstream's light, stackable chip.
    apply: ({ effects }) =>
      effects.on('sprint', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 5.5, 36);
        ctx.fx.push('impact', ctx.x, ctx.z);
      }),
  },

  // ══ GLASS / SACRIFICE — trade survivability for scaling offense (corrupted) ═════
  {
    id: 'blood-engine',
    name: 'Blood Engine',
    description:
      'CURSE: −25 max health, but the lower your health, the harder you hit (up to +60%).',
    tags: ['risk', 'damage', 'glass'],
    grantsTags: ['glass'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 2,
    role: 'liability',
    riskTier: 2,
    apply: ({ player, effects }) => {
      player.maxHealth = Math.max(1, player.maxHealth - 25);
      player.health = Math.min(player.health, player.maxHealth);
      // Smooth scaling: full HP → +0%, empty → +60% (missing-health-as-power).
      effects.addConditional((c) => ({ damageMult: 1 + (1 - c.hpFrac) * 0.6 }));
    },
  },
  {
    id: 'redline-reactor',
    name: 'Redline Reactor',
    description: 'CURSE: −20% max health, +35% fire rate while above half health — run it hot.',
    tags: ['risk', 'fire-rate', 'glass'],
    grantsTags: ['glass'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 2,
    role: 'liability',
    riskTier: 2,
    apply: ({ player, effects }) => {
      const cut = Math.round(player.maxHealth * 0.2);
      player.maxHealth = Math.max(1, player.maxHealth - cut);
      player.health = Math.min(player.health, player.maxHealth);
      effects.addConditional((c) => (c.hpFrac >= 0.5 ? { fireRateMult: 1.35 } : {}));
    },
  },

  // ══ LEGENDARY capstones for the new lanes ══════════════════════════════════════
  {
    id: 'apex-instinct',
    name: 'Apex Instinct',
    description:
      'CAPSTONE: +25% fire rate for 1.5s after a crit, +40% crit damage always, and crits splash 50% of the hit nearby.',
    tags: ['crit', 'tempo', 'fire-rate'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 4,
    requiresAnyTags: ['crit', 'tempo'],
    role: 'catastrophe',
    riskTier: 1,
    apply: ({ mods, effects }) => {
      mods.critChanceAdd += 0.05;
      effects.addConditional((c) => (c.recentCrit ? { fireRateMult: 1.25 } : {}));
      effects.on('crit', (ctx) => {
        if (ctx.hitDamage > 0) ctx.dealArea(ctx.x, ctx.z, 2.6, ctx.hitDamage * 0.5);
      });
      mods.critDamageMult += 0.4;
    },
  },
  {
    id: 'phoenix-protocol',
    name: 'Phoenix Protocol',
    description:
      'CAPSTONE: at low health you ERUPT — huge nova, a 25% heal, and a second of invulnerability.',
    tags: ['risk', 'panic', 'explosive'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 4,
    requiresAnyTags: ['panic', 'risk', 'glass'],
    role: 'catastrophe',
    riskTier: 3,
    apply: ({ effects }) =>
      effects.on('lowHp', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 7, 90);
        ctx.player.health = Math.min(
          ctx.player.maxHealth,
          ctx.player.health + ctx.player.maxHealth * 0.25,
        );
        ctx.player.invuln = Math.max(ctx.player.invuln, 1);
        ctx.fx.push('death', ctx.x, ctx.z, 2, 0, 0);
      }),
  },
];
