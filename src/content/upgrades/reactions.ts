// Status-reaction content (T54). Two layers per chain:
//  • PRIMERS apply a status on hit and carry its build-identity tag.
//  • CONVERTERS are tag-gated (T51 requiresAllTags) so they only appear once you
//    own BOTH primers, and they call effects.enableReaction() to switch the
//    chemistry on (T53 engine). This is what makes drafts branch: pick two
//    primers → the reaction converter surfaces → your build gains a new rule.
// Burn + Chill primers already exist (Incendiary / Cryo in advanced.ts); their
// `burn`/`chill` tags ARE the gate tags, so no duplicates here.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

// Primers register one on-hit application PER LEVEL; the COUNT-CAPPED statuses
// (shock/corrode/bleed) add a stack/hit per owned level. Show the real before→after
// (owned `lvl` → lvl+1) so repeat picks read as an upgrade, not a flat "—".
const stacksOf = (n: number) => `+${n} stack${n === 1 ? '' : 's'}/hit`;
const stackRow = (label: string, lvl: number) => ({
  label,
  from: lvl === 0 ? '—' : stacksOf(lvl),
  to: stacksOf(lvl + 1),
});
// A constant per-stack FACT (unchanged by level): show it on both sides once owned.
const factRow = (label: string, val: string, lvl: number) => ({
  label,
  from: lvl === 0 ? '—' : val,
  to: val,
});

export const REACTION_UPGRADES: UpgradeDefinition[] = [
  // ── New status primers ──────────────────────────────────────────────────
  {
    id: 'conductive-ammunition',
    name: 'Conductive Ammunition',
    description:
      'PRIMER: each hit applies 1 Shock stack (3s, max 6). Shock deals NO damage by itself — it ARMS the target. Pair it with a reaction converter (e.g. with Burn/Chill) to detonate it.',
    tags: ['shock', 'status'],
    grantsTags: ['shock'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    previewStats: (lvl) => [
      stackRow('Shock stacks/hit', lvl),
      factRow('Per stack', 'arms target — no dmg (3s, max 6)', lvl),
    ],
    apply: ({ effects }) =>
      effects.on('hit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'shock', { duration: 3, stacks: 1 }),
      ),
  },
  {
    id: 'corrosive-rounds',
    name: 'Corrosive Rounds',
    description:
      'PRIMER: each hit applies 1 Corrode stack (4s, max 6). A corroded enemy takes +6% damage per stack — up to +36% — from ALL your sources. Works on its own; stacks faster with high fire rate.',
    tags: ['corrode', 'status'],
    grantsTags: ['corrode'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    previewStats: (lvl) => [
      stackRow('Corrode stacks/hit', lvl),
      factRow('Per stack', '+6% dmg taken, 4s (max +36%)', lvl),
    ],
    apply: ({ effects }) =>
      effects.on('hit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'corrode', { duration: 4, stacks: 1 }),
      ),
  },
  {
    id: 'serrated-rounds',
    name: 'Serrated Rounds',
    description:
      'PRIMER: each hit adds 1 Bleed stack (4s). Bleed is a damage-over-time: each stack deals 70% of the triggering hit, spread over 4s. Stacks add up — great with high fire rate. Works on its own.',
    tags: ['bleed', 'status'],
    grantsTags: ['bleed'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    previewStats: (lvl) => [
      stackRow('Bleed stacks/hit', lvl),
      factRow('DoT per stack', '70% of hit over 4s', lvl),
    ],
    // Bleed DoT scales with the hit (T70, V33): dps = 0.7 × hitDamage / 4s per stack.
    apply: ({ effects }) =>
      effects.on('hit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'bleed', { duration: 4, dotCoef: 0.7, stacks: 1 }),
      ),
  },

  // ── Converters — tag-gated, enable a reaction (T53) ─────────────────────
  {
    id: 'thermal-shock',
    name: 'Thermal Shock',
    description:
      'CONVERTER: Burn + Freeze on one enemy detonate — shrapnel blast + brief weakness.',
    tags: ['converter', 'reaction'],
    requiresAllTags: ['burn', 'chill'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 2,
    weightRules: [{ whenTags: ['burn', 'chill'], all: true, multiplier: 5 }],
    apply: ({ effects }) => effects.enableReaction('thermalShock'),
  },
  {
    id: 'plasma-bloom',
    name: 'Plasma Bloom',
    description: 'CONVERTER: Burning + Shocked enemies erupt into a plasma burst.',
    tags: ['converter', 'reaction'],
    requiresAllTags: ['burn', 'shock'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 2,
    weightRules: [{ whenTags: ['burn', 'shock'], all: true, multiplier: 5 }],
    apply: ({ effects }) => effects.enableReaction('plasmaBloom'),
  },
  {
    id: 'rust-lightning',
    name: 'Rust Lightning',
    description: 'CONVERTER: Corroded + Shocked enemies discharge lightning.',
    tags: ['converter', 'reaction'],
    requiresAllTags: ['corrode', 'shock'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 2,
    weightRules: [{ whenTags: ['corrode', 'shock'], all: true, multiplier: 5 }],
    apply: ({ effects }) => effects.enableReaction('rustLightning'),
  },
  {
    id: 'blood-crystal',
    name: 'Blood Crystal',
    description: 'CONVERTER: Shattering a frozen, bleeding enemy bursts red crystal.',
    tags: ['converter', 'reaction'],
    requiresAllTags: ['bleed', 'chill'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 2,
    weightRules: [{ whenTags: ['bleed', 'chill'], all: true, multiplier: 5 }],
    apply: ({ effects }) => effects.enableReaction('bloodCrystal'),
  },
  {
    id: 'acid-fog',
    name: 'Acid Fog',
    description: 'CONVERTER: Burning a corroded enemy blooms a toxic blast.',
    tags: ['converter', 'reaction'],
    requiresAllTags: ['corrode', 'burn'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 2,
    weightRules: [{ whenTags: ['corrode', 'burn'], all: true, multiplier: 5 }],
    apply: ({ effects }) => effects.enableReaction('acidFog'),
  },
];
