// Cross-synergy + build-transform cards (T-synergy). The "feeling" pass: upgrades
// that are GREAT for one build and dead weight (or a real cost) for another — the
// pick-order, build-around tension that the genre's best games live on.
//
// Three archetypes, drawn from how other roguelites make upgrades feel:
//   1. CONVERSIONS (RoR2 / Nova Drift) — collapse one stat lane into another at a
//      profit. Read + rewrite the CURRENT mod layer in apply(), so pick ORDER matters
//      (snapshot semantics). Borks the lane they drain, supercharges the lane they feed.
//   2. INVERSE-SCALING (Brotato) — pay off the OPPOSITE of the obvious: more damage
//      the FEWER enemies are near, more crit the LOWER your HP. Live conditionals.
//   3. STATUS PAYOFFS (Last Epoch / PoE) — huge bonus vs afflicted enemies, status
//      SPREAD, multi-status detonation. Worthless with no status source; build-defining
//      next to a burn/chill/shock primer. Read enemy status off targetIndex on hit.
// Everything routes the V3 pipeline + shared rng (V16/V21).

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

// Small single-target bonus burst centred on the struck enemy (tight radius → ≈ the
// one target, reads as a flare). Pipeline-routed via ctx.dealArea.
const flare = (
  ctx: { dealArea: (x: number, z: number, r: number, a: number) => number },
  x: number,
  z: number,
  amount: number,
): void => {
  ctx.dealArea(x, z, 1.3, amount);
};

export const SYNERGY_UPGRADES: UpgradeDefinition[] = [
  // ══ CONVERSIONS — collapse a lane for a profit (pick order matters) ══════════════
  {
    id: 'heavy-slug',
    name: 'Heavy Slug Conversion',
    description:
      'CONVERT: collapse your multishot into ONE devastating slug — +60% damage per projectile given up, +2 pierce. (Multishot taken later returns.)',
    tags: ['damage', 'convert'],
    grantsTags: ['heavy'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 1,
    apply: ({ mods }) => {
      const removed = Math.max(0, mods.projectileCount - 1);
      mods.damageMult += 0.4 + removed * 0.6; // base power + per-projectile profit
      mods.projectileCount = 1;
      mods.pierce += 2; // a single heavy slug punches through bodies
    },
  },
  {
    id: 'marksmans-discipline',
    name: "Marksman's Discipline",
    description:
      'CONVERT: trade away half your bonus fire rate for heavy hits — slow, brutal, +160% of what you give up as damage (and a flat +20%).',
    tags: ['damage', 'convert'],
    grantsTags: ['heavy'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 1,
    apply: ({ mods }) => {
      const bonus = Math.max(0, mods.fireRateMult - 1);
      const moved = bonus * 0.5;
      mods.fireRateMult = Math.max(0.5, mods.fireRateMult - moved);
      mods.damageMult += 0.2 + moved * 1.6;
    },
  },
  {
    id: 'close-quarters',
    name: 'Close Quarters',
    description:
      'CONVERT: saw off your range for raw stopping power — −40% range, +45% damage, and your shots shove harder.',
    tags: ['damage', 'convert', 'control'],
    grantsTags: ['brawler'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'liability',
    riskTier: 1,
    apply: ({ mods }) => {
      mods.rangeMult = Math.max(0.4, mods.rangeMult - 0.4);
      mods.damageMult += 0.45;
      mods.knockback += 8;
    },
  },
  {
    id: 'all-in-loadout',
    name: 'All-In Loadout',
    description:
      'CURSE: +80% damage, but your rounds lose ALL pierce, chain, ricochet and blast — pure single-target. A boss-killer, a crowd-clear nightmare.',
    tags: ['damage', 'convert', 'risk'],
    grantsTags: ['heavy', 'glass'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 2,
    role: 'liability',
    riskTier: 2,
    apply: ({ mods }) => {
      mods.damageMult += 0.8;
      mods.pierce = 0;
      mods.chainCount = 0;
      mods.ricochet = 0;
      mods.blastRadius = 0;
    },
  },

  // ══ INVERSE-SCALING — reward the opposite of the obvious ═════════════════════════
  {
    id: 'lone-wolf',
    name: 'Lone Wolf',
    description:
      'Hunt alone: up to +36% damage when no enemies crowd you — falls off as they swarm in.',
    tags: ['damage', 'mobility'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ damageMult: 1 + Math.max(0, 2 - c.enemiesNearby) * 0.18 })),
  },
  {
    id: 'desperado',
    name: 'Desperado',
    description:
      'Crit chance climbs as your health falls — up to +35% at the brink. Live dangerously.',
    tags: ['crit', 'risk'],
    grantsTags: ['glass'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 1,
    apply: ({ effects }) => effects.addConditional((c) => ({ critAdd: (1 - c.hpFrac) * 0.35 })),
  },
  {
    id: 'adrenaline-engine',
    name: 'Adrenaline Engine',
    description: 'The hurt you are, the faster you fire — up to +35% fire rate at low health.',
    tags: ['fire-rate', 'risk'],
    grantsTags: ['glass'],
    rarity: 'common',
    maxLevel: 2,
    baseWeight: 8,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ fireRateMult: 1 + (1 - c.hpFrac) * 0.35 })),
  },

  // ══ STATUS PAYOFFS — dead weight alone, devastating next to a primer ═════════════
  {
    id: 'pyromaniac',
    name: 'Pyromaniac',
    description:
      'SYNERGY: your hits hammer BURNING enemies for +40% of the hit again. Bring a fire source.',
    tags: ['burn', 'status', 'damage'],
    requiresAnyTags: ['burn'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 4,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) => {
        const i = ctx.targetIndex;
        if (i < 0 || ctx.hitDamage <= 0) return;
        if (ctx.enemies.burnTime[i]! > 0)
          flare(ctx, ctx.enemies.posX[i]!, ctx.enemies.posZ[i]!, ctx.hitDamage * 0.4);
      }),
  },
  {
    id: 'permafrost',
    name: 'Permafrost',
    description:
      'SYNERGY: CHILLED enemies are brittle — your hits shatter them for +45% bonus damage.',
    tags: ['chill', 'status', 'damage'],
    requiresAnyTags: ['chill'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 4,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) => {
        const i = ctx.targetIndex;
        if (i < 0 || ctx.hitDamage <= 0) return;
        if (ctx.enemies.chillTime[i]! > 0)
          flare(ctx, ctx.enemies.posX[i]!, ctx.enemies.posZ[i]!, ctx.hitDamage * 0.45);
      }),
  },
  {
    id: 'plague-carrier',
    name: 'Plague Carrier',
    description:
      'SYNERGY: striking a BURNING enemy spreads the fire to up to 3 others nearby — turn one ember into a wildfire.',
    tags: ['burn', 'status', 'aoe'],
    requiresAnyTags: ['burn'],
    grantsTags: ['burn'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 4,
    role: 'converter',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) => {
        const i = ctx.targetIndex;
        if (i < 0 || ctx.enemies.burnTime[i]! <= 0) return;
        const ids: number[] = [];
        const n = ctx.hash.queryCircle(ctx.enemies.posX[i]!, ctx.enemies.posZ[i]!, 3, ids);
        let spread = 0;
        for (let k = 0; k < n && spread < 3; k++) {
          const e = ids[k]!;
          if (e === i || e >= ctx.enemies.count) continue;
          if (ctx.enemies.burnTime[e]! > 0) continue; // already lit
          ctx.applyStatus(e, 'burn', { duration: 2, dotCoef: 0.5 });
          spread++;
        }
      }),
  },
  {
    id: 'conduction',
    name: 'Conduction',
    description:
      'SYNERGY: hitting a SHOCKED enemy discharges an arc burst (35% of the hit, 3.5m). Pair with a shock primer.',
    tags: ['shock', 'status', 'chain', 'aoe'],
    requiresAnyTags: ['shock'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 4,
    role: 'converter',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) => {
        const i = ctx.targetIndex;
        if (i < 0 || ctx.hitDamage <= 0) return;
        if (ctx.enemies.shockStacks[i]! > 0) {
          ctx.dealArea(ctx.enemies.posX[i]!, ctx.enemies.posZ[i]!, 3.5, ctx.hitDamage * 0.35);
          ctx.fx.push('chain', ctx.enemies.posX[i]!, ctx.enemies.posZ[i]!);
        }
      }),
  },
  {
    id: 'apex-affliction',
    name: 'Apex Affliction',
    description:
      'KEYSTONE: every different status on the target stacks +12% bonus damage onto your hits — the ultimate hybrid-status payoff.',
    tags: ['status', 'damage'],
    requiresAnyTags: ['burn', 'chill', 'shock', 'bleed', 'corrode', 'mark'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 5,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) => {
        const i = ctx.targetIndex;
        if (i < 0 || ctx.hitDamage <= 0) return;
        const e = ctx.enemies;
        let types = 0;
        if (e.burnTime[i]! > 0) types++;
        if (e.chillTime[i]! > 0) types++;
        if (e.shockStacks[i]! > 0) types++;
        if (e.bleedStacks[i]! > 0) types++;
        if (e.corrodeStacks[i]! > 0) types++;
        if (e.markTime[i]! > 0) types++;
        if (types > 0) flare(ctx, e.posX[i]!, e.posZ[i]!, ctx.hitDamage * 0.12 * types);
      }),
  },
];
