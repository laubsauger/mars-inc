// Status-reaction content (T54). Two layers per chain:
//  • PRIMERS apply a status on hit and carry its build-identity tag.
//  • CONVERTERS are tag-gated (T51 requiresAllTags) so they only appear once you
//    own BOTH primers, and they call effects.enableReaction() to switch the
//    chemistry on (T53 engine). This is what makes drafts branch: pick two
//    primers → the reaction converter surfaces → your build gains a new rule.
// Burn + Chill primers already exist (Incendiary / Cryo in advanced.ts); their
// `burn`/`chill` tags ARE the gate tags, so no duplicates here.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const REACTION_UPGRADES: UpgradeDefinition[] = [
  // ── New status primers ──────────────────────────────────────────────────
  {
    id: 'conductive-ammunition',
    name: 'Conductive Ammunition',
    description: 'Hits build Shock charge on enemies (primer).',
    tags: ['shock', 'status'],
    grantsTags: ['shock'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'shock', { duration: 3, stacks: 1 }),
      ),
  },
  {
    id: 'corrosive-rounds',
    name: 'Corrosive Rounds',
    description: 'Hits corrode armor — corroded enemies take more damage (primer).',
    tags: ['corrode', 'status'],
    grantsTags: ['corrode'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'corrode', { duration: 4, stacks: 1 }),
      ),
  },
  {
    id: 'serrated-rounds',
    name: 'Serrated Rounds',
    description: 'Hits cause stacking Bleed (primer).',
    tags: ['bleed', 'status'],
    grantsTags: ['bleed'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'bleed', { duration: 4, dps: 2, stacks: 1 }),
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
