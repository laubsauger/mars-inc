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
import { ImpactProfile } from '../../sim/fx';

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
    description: '+8% damage per level for 1.5s after a critical hit, plus +4% base crit chance.',
    tags: ['crit', 'tempo'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 4,
    requiresAnyTags: ['crit'],
    role: 'engine',
    riskTier: 0,
    apply: ({ mods, effects }) => {
      mods.critChanceAdd += 0.04; // a little base crit so the loop can start
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
    previewStats: (lvl) => [
      { label: 'Radius', from: lvl === 0 ? '—' : '2.2m', to: '2.2m' },
      { label: 'Crit splash', from: `${40 * lvl}% of hit`, to: `${40 * (lvl + 1)}% of hit` },
    ],
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
      'Dropping below 25% health blasts a 7m shockwave (12 damage + heavy knockback) to clear space.',
    tags: ['control', 'risk', 'panic'],
    grantsTags: ['panic'],
    rarity: 'uncommon',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 1,
    previewStats: (lvl) => [
      { label: 'Radius', from: lvl === 0 ? '—' : '7m', to: '7m' },
      {
        label: 'Panic shockwave',
        from: lvl === 0 ? '—' : '12 dmg + knockback',
        to: '12 dmg + knockback',
      },
    ],
    apply: ({ effects }) =>
      effects.on('lowHp', (ctx) => {
        const r = 7;
        ctx.dealArea(ctx.x, ctx.z, r, 12); // shove + light damage (knockback in the spec)
        ctx.fx.push('impact', ctx.x, ctx.z, r, 0, ImpactProfile.Blast);
      }),
  },
  {
    id: 'last-ditch-protocol',
    name: 'Last-Ditch Protocol',
    description:
      'Dropping below 25% health vents a 40-damage nova (7m) and heals you for 10% max HP.',
    tags: ['risk', 'panic', 'explosive'],
    grantsTags: ['panic'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    requiresAnyTags: ['panic', 'risk'],
    role: 'converter',
    riskTier: 2,
    previewStats: (lvl) => [
      { label: 'Radius', from: lvl === 0 ? '—' : '7m', to: '7m' },
      { label: 'Low-HP nova', from: lvl === 0 ? '—' : '40 dmg', to: '40 dmg' },
      { label: 'Heal', from: lvl === 0 ? '—' : '10% max HP', to: '10% max HP' },
    ],
    apply: ({ effects }) =>
      effects.on('lowHp', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 7, 40);
        ctx.player.health = Math.min(
          ctx.player.maxHealth,
          ctx.player.health + ctx.player.maxHealth * 0.1,
        );
        ctx.fx.push('death', ctx.x, ctx.z, 1, 0, 0);
      }),
  },

  // ══ KITE & CLEAR — open up LOCAL space (no enemy within 10m) for a payoff. Full
  //    arena clears almost never happen here, so these reward good kiting instead. ══
  {
    id: 'breather',
    name: 'Breather',
    description:
      'Open up space (no enemy within 10m) to patch 4% max health per level — reward for kiting.',
    tags: ['sustain', 'defense'],
    grantsTags: ['sustain'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    previewStats: (lvl) => [
      {
        label: 'Heal on clearing space',
        from: `${4 * lvl}% max HP`,
        to: `${4 * (lvl + 1)}% max HP`,
      },
    ],
    apply: ({ effects }) =>
      effects.on('breather', (ctx) => {
        ctx.player.health = Math.min(
          ctx.player.maxHealth,
          ctx.player.health + ctx.player.maxHealth * 0.04,
        );
      }),
  },
  {
    id: 'overtime-bonus',
    name: 'Overtime Bonus',
    description:
      'Opening up space (no enemy within 10m) patches a big 10% of max health — kite to recover hard.',
    tags: ['sustain', 'defense'],
    grantsTags: ['sustain'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 2,
    requiresAnyTags: ['sustain'],
    role: 'converter',
    riskTier: 0,
    previewStats: () => [{ label: 'Heal on clearing space', from: '—', to: '10% max HP' }],
    apply: ({ effects }) =>
      effects.on('breather', (ctx) => {
        ctx.player.health = Math.min(
          ctx.player.maxHealth,
          ctx.player.health + ctx.player.maxHealth * 0.1,
        );
      }),
  },

  // ══ SPRINT-OFFENSE — movement IS a weapon (the dash becomes a strike) ══════════
  {
    id: 'slipstream-rounds',
    name: 'Slipstream Rounds',
    description: 'Starting a sprint discharges a 14-damage burst in a 7m ring per level.',
    tags: ['movement', 'aoe', 'tempo'],
    grantsTags: ['sprint-build'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'primer',
    riskTier: 0,
    previewStats: (lvl) => [
      { label: 'Radius', from: lvl === 0 ? '—' : '7m', to: '7m' },
      { label: 'Sprint burst', from: `${14 * lvl} dmg`, to: `${14 * (lvl + 1)} dmg` },
    ],
    apply: ({ effects }) =>
      effects.on('sprint', (ctx) => {
        const r = 7;
        ctx.dealArea(ctx.x, ctx.z, r, 14);
        // Scaled blast ring so the burst's reach is VISIBLE (dx = radius, Blast profile).
        ctx.fx.push('impact', ctx.x, ctx.z, r, 0, ImpactProfile.Blast);
      }),
  },
  {
    id: 'detonation-dash',
    name: 'Detonation Dash',
    description: 'Each sprint detonates a heavy 36-damage concussive blast in a 6.5m radius.',
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
    previewStats: (lvl) => [
      { label: 'Radius', from: lvl === 0 ? '—' : '6.5m', to: '6.5m' },
      { label: 'Sprint blast', from: lvl === 0 ? '—' : '36 dmg', to: '36 dmg' },
    ],
    apply: ({ effects }) =>
      effects.on('sprint', (ctx) => {
        const r = 6.5;
        ctx.dealArea(ctx.x, ctx.z, r, 36);
        ctx.fx.push('impact', ctx.x, ctx.z, r, 0, ImpactProfile.Blast);
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
    previewStats: (lvl) => [{ label: 'Radius', from: lvl === 0 ? '—' : '2.6m', to: '2.6m' }],
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
      'When you DROP below 25% health you ERUPT — a 7m nova + heal. Pick it again to UPGRADE it (Rare → Legendary: bigger blast, fatter heal). Re-arms on a cooldown (≈20s, shortened by recovery upgrades).',
    tags: ['risk', 'panic', 'explosive'],
    // RARITY-UPGRADE card: first pick is a Rare, the second elevates it to Legendary
    // (the effect stacks). One identity, not two duplicate cards.
    rarity: 'rare',
    rarityTiers: ['rare', 'legendary'],
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 4,
    requiresAnyTags: ['panic', 'risk', 'glass'],
    role: 'catastrophe',
    riskTier: 3,
    previewStats: (lvl) => [
      {
        label: 'Low-HP nova',
        from: lvl === 0 ? '—' : `${50 * lvl} dmg`,
        to: `${50 * (lvl + 1)} dmg`,
      },
      {
        label: 'Heal',
        from: lvl === 0 ? '—' : `${13 * lvl}% max HP`,
        to: `${13 * (lvl + 1)}% max HP`,
      },
    ],
    apply: ({ effects }) =>
      effects.on('lowHp', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 7, 50);
        ctx.player.health = Math.min(
          ctx.player.maxHealth,
          ctx.player.health + ctx.player.maxHealth * 0.13,
        );
        ctx.fx.push('death', ctx.x, ctx.z, 2, 0, 0);
      }),
  },
  // PANIC SUPPORT — shorten the low-HP panic cooldown so the panic button recharges
  // sooner. Gated behind owning a panic card (a dead pick without one).
  {
    id: 'combat-stims',
    name: 'Combat Stims',
    description:
      'Your panic reflex recharges 30% faster per level — get your low-HP eruption back online sooner.',
    tags: ['panic', 'sustain'],
    requiresAnyTags: ['panic'],
    grantsTags: ['panic'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    previewStats: (lvl) => [
      {
        label: 'Panic cooldown',
        from: `×${Math.max(0.4, 1 - lvl * 0.3).toFixed(2)}`,
        to: `×${Math.max(0.4, 1 - (lvl + 1) * 0.3).toFixed(2)}`,
      },
    ],
    apply: ({ player }) => {
      player.panicCooldownMult = Math.max(0.4, player.panicCooldownMult - 0.3);
    },
  },
];
