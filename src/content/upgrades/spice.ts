// Spice pass — a wide batch of COOL/FUN cards across every rarity (variety push).
// All built on the existing dynamic engine (effects.on triggers + addConditional +
// ctx.dealArea/applyStatus + closures for counters) and the run-mod layer — so they
// need NO new sim primitives, yet introduce genuinely new BEHAVIOURS: lifesteal,
// execute, on-crit/overkill bursts, every-Nth-shot vents, a kill-counter detonation,
// random-status chaos, and a panic nova. Each routes the V3 pipeline (V3/V21),
// deterministic under the shared rng (V16).

import type { UpgradeDefinition } from '../../sim/progression/upgrades';
import { ImpactProfile } from '../../sim/fx';
import { ENEMY_BY_VARIANT } from '../../sim/enemies';

const heal = (player: { health: number; maxHealth: number }, amount: number): void => {
  player.health = Math.min(player.maxHealth, player.health + amount);
};

export const SPICE_UPGRADES: UpgradeDefinition[] = [
  // ── Common ──────────────────────────────────────────────────────────────────
  {
    id: 'field-medic',
    name: 'Field Medic',
    description:
      'Patch up as you work: heal 1 HP per kill. Re-pick to UPGRADE (Common → Uncommon → Rare; +1 HP/kill each, up to 3).',
    tags: ['defense'],
    grantsTags: ['lifesteal'],
    // RARITY-UPGRADE: merges Field Medic + Vampiric Rounds into one lifesteal ladder
    // that climbs Common → Uncommon → Rare (heal stacks 1 → 2 → 3 per kill). Small per
    // kill ON PURPOSE — kill rates are high, so even 1/kill is strong sustain.
    rarity: 'common',
    rarityTiers: ['common', 'uncommon', 'rare'],
    maxLevel: 3,
    baseWeight: 9,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    previewStats: (lvl) => [{ label: 'Heal per kill', from: `${lvl} HP`, to: `${lvl + 1} HP` }],
    apply: ({ effects }) => effects.on('kill', (ctx) => heal(ctx.player, 1)),
  },
  {
    id: 'hot-brass',
    name: 'Hot Brass',
    description: 'Every critical hit spits a little 7-dmg spark burst around the target.',
    tags: ['crit', 'aoe'],
    rarity: 'common',
    maxLevel: 3,
    baseWeight: 9,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    previewStats: (lvl) => [
      {
        label: 'Spark burst',
        from: lvl === 0 ? '—' : `${7 * lvl} dmg`,
        to: `${7 * (lvl + 1)} dmg`,
      },
    ],
    apply: ({ effects }) =>
      effects.on('crit', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 2.4, 7);
        ctx.fx.push('impact', ctx.x, ctx.z, 2.4, 0, ImpactProfile.Blast);
      }),
  },

  // ── Uncommon ────────────────────────────────────────────────────────────────
  // (Removed 'vampiric-rounds' — merged into Field Medic's Common→Uncommon→Rare ladder.)
  {
    id: 'corpse-bomb',
    name: 'Corpse Bomb',
    description: 'OVERKILL detonates the body — wasted damage becomes a 3m blast on the corpse.',
    tags: ['aoe', 'explosive'],
    grantsTags: ['overkill'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 0,
    previewStats: (lvl) => [
      {
        label: 'Corpse blast',
        from: lvl === 0 ? '—' : `${8 * lvl}+ dmg`,
        to: `${8 * (lvl + 1)}+ dmg`,
      },
    ],
    apply: ({ effects }) =>
      effects.on('overkill', (ctx) => {
        const dmg = 8 + Math.min(50, ctx.magnitude * 0.6); // bigger overkill → bigger pop
        ctx.dealArea(ctx.x, ctx.z, 3, dmg);
        ctx.fx.push('impact', ctx.x, ctx.z, 3, 0, ImpactProfile.Blast);
      }),
  },
  {
    id: 'overpressure-vents',
    name: 'Overpressure Vents',
    description: 'Every 6th shot vents a 7m concussive shockwave around you (16 dmg).',
    tags: ['aoe', 'tempo'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    // A vent per level → fires that many times more often (each level adds a counter).
    previewStats: (lvl) => [
      { label: 'Radius', from: lvl === 0 ? '—' : '7m', to: '7m' },
      { label: 'Vents / 6 shots', from: lvl === 0 ? '—' : `${lvl}`, to: `${lvl + 1}` },
    ],
    apply: ({ effects }) => {
      let shots = 0;
      effects.on('shot', (ctx) => {
        if (++shots % 6 !== 0) return;
        ctx.dealArea(ctx.x, ctx.z, 7, 16);
        ctx.fx.push('impact', ctx.x, ctx.z, 7, 0, ImpactProfile.Blast);
      });
    },
  },
  {
    id: 'live-rounds',
    name: 'Live Rounds',
    description: '25% of hits jolt the target with SHOCK (a chain-reaction primer).',
    tags: ['chain', 'status'],
    grantsTags: ['shock'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) => {
        if (ctx.targetIndex < 0 || ctx.rng.next() >= 0.25) return;
        ctx.applyStatus(ctx.targetIndex, 'shock', { duration: 3, stacks: 2 });
      }),
  },
  {
    id: 'berserkers-rage',
    name: "Berserker's Rage",
    description: 'The closer to death, the harder you hit — up to +60% damage near zero HP.',
    tags: ['damage'],
    grantsTags: ['glass'],
    rarity: 'uncommon',
    maxLevel: 1,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'liability',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ damageMult: 1 + (1 - c.hpFrac) * 0.6 })),
  },

  // ── Rare ────────────────────────────────────────────────────────────────────
  {
    id: 'executioners-mark',
    name: "Executioner's Mark",
    description: 'Your hits INSTANTLY execute any non-boss enemy already under 14% health.',
    tags: ['damage'],
    grantsTags: ['execute'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) => {
        const i = ctx.targetIndex;
        if (i < 0) return;
        const e = ctx.enemies;
        if (ENEMY_BY_VARIANT[e.variant[i]!]?.boss) return; // bosses are immune to execute
        if (e.health[i]! > 0 && e.health[i]! < e.maxHp[i]! * 0.14) e.health[i] = 0;
      }),
  },
  {
    id: 'thunderstruck',
    name: 'Thunderstruck',
    description: 'Crits call the storm: SHOCK the target + a 3.5m arc burst (10 dmg).',
    tags: ['crit', 'chain', 'aoe'],
    grantsTags: ['shock'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    previewStats: (lvl) => [
      {
        label: 'Arc burst',
        from: lvl === 0 ? '—' : `${10 * lvl} dmg`,
        to: `${10 * (lvl + 1)} dmg`,
      },
    ],
    apply: ({ effects }) =>
      effects.on('crit', (ctx) => {
        if (ctx.targetIndex >= 0)
          ctx.applyStatus(ctx.targetIndex, 'shock', { duration: 3, stacks: 3 });
        ctx.dealArea(ctx.x, ctx.z, 3.5, 10);
        ctx.fx.push('chain', ctx.x, ctx.z);
      }),
  },
  // (Removed 'last-rites' — it was a weaker duplicate of the legendary Phoenix Protocol
  //  panic nova in directions.ts. Same concept = one card, not two.)

  // ── Legendary ───────────────────────────────────────────────────────────────
  {
    id: 'apex-predator',
    name: 'Apex Predator',
    description:
      'KEYSTONE: every kill heals 3 HP AND pops a 16-dmg burst on the corpse — snowball.',
    tags: ['aoe', 'defense'],
    grantsTags: ['lifesteal', 'on-kill'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 4,
    role: 'engine',
    riskTier: 0,
    previewStats: () => [
      { label: 'Heal per kill', from: '—', to: '3 HP' },
      { label: 'Corpse burst', from: '—', to: '16 dmg' },
    ],
    apply: ({ effects }) =>
      effects.on('kill', (ctx) => {
        heal(ctx.player, 3);
        ctx.dealArea(ctx.x, ctx.z, 3, 16);
      }),
  },
  {
    id: 'meltdown-core',
    name: 'Meltdown Core',
    description: 'KEYSTONE: every 12th kill triggers a CATASTROPHIC 8m, 60-dmg detonation.',
    tags: ['aoe', 'explosive'],
    grantsTags: ['on-kill'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 3,
    role: 'catastrophe',
    riskTier: 1,
    previewStats: (lvl) => [{ label: 'Radius', from: lvl === 0 ? '—' : '8m', to: '8m' }],
    apply: ({ effects }) => {
      let kills = 0;
      effects.on('kill', (ctx) => {
        if (++kills % 12 !== 0) return;
        ctx.dealArea(ctx.x, ctx.z, 8, 60);
        ctx.fx.push('impact', ctx.x, ctx.z, 8, 0, ImpactProfile.Blast);
      });
    },
  },

  // ── Corrupted (a real downside) ───────────────────────────────────────────────
  {
    id: 'glass-pact',
    name: 'Glass Pact',
    description: 'CURSE: +70% weapon damage, but your max HP is slashed by 40%.',
    tags: ['damage'],
    grantsTags: ['glass'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 2,
    role: 'liability',
    riskTier: 2,
    apply: ({ player, mods }) => {
      mods.damageMult += 0.7;
      player.maxHealth = Math.max(20, Math.round(player.maxHealth * 0.6));
      player.health = Math.min(player.health, player.maxHealth);
    },
  },
  {
    id: 'overdraft',
    name: 'Overdraft Clause',
    description: 'CURSE: +40% damage AND +40% fire rate — but your range is cut by 25%.',
    tags: ['damage', 'fire-rate'],
    grantsTags: ['glass'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 2,
    role: 'liability',
    riskTier: 2,
    apply: ({ mods }) => {
      mods.damageMult += 0.4;
      mods.fireRateMult += 0.4;
      mods.rangeMult = Math.max(0.4, mods.rangeMult - 0.25);
    },
  },

  // ── Prototype (swingy / chaotic) ──────────────────────────────────────────────
  {
    id: 'unstable-rounds',
    name: 'Unstable Rounds',
    description:
      'EXPERIMENTAL: 18% of hits inflict a RANDOM status — burn, shock, bleed, or chill.',
    tags: ['status', 'chain'],
    grantsTags: ['burn', 'shock', 'bleed'],
    rarity: 'prototype',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.on('hit', (ctx) => {
        if (ctx.targetIndex < 0 || ctx.rng.next() >= 0.18) return;
        const r = ctx.rng.next();
        if (r < 0.25) ctx.applyStatus(ctx.targetIndex, 'burn', { duration: 3, dotCoef: 0.7 });
        else if (r < 0.5) ctx.applyStatus(ctx.targetIndex, 'shock', { duration: 3, stacks: 2 });
        else if (r < 0.75)
          ctx.applyStatus(ctx.targetIndex, 'bleed', { duration: 4, dotCoef: 0.6, stacks: 2 });
        else ctx.applyStatus(ctx.targetIndex, 'chill', { duration: 3, slowMult: 0.55 });
      }),
  },

  // ══ POSITIONAL / STATE conditionals — reward HOW you fight, not whether you hold
  //    fire (you always do). Evaluate live, no buildup. ════════════════════════════
  {
    id: 'overwhelm',
    name: 'Overwhelm',
    description: 'The more the merrier: +1.2% damage per enemy on screen (up to +45%).',
    tags: ['damage'],
    rarity: 'uncommon',
    maxLevel: 1,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({
        damageMult: 1 + Math.min(0.45, c.enemiesOnScreen * 0.012),
      })),
  },
  {
    id: 'marksman',
    name: 'Marksman',
    description: '+30% damage to anything more than 10m away — reward the kiter.',
    tags: ['damage', 'precision'],
    grantsTags: ['range'],
    rarity: 'uncommon',
    maxLevel: 1,
    baseWeight: 6,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => (c.nearestDist > 10 ? { damageMult: 1.3 } : {})),
  },
  {
    id: 'adrenaline-high',
    name: 'Adrenaline High',
    description: '+12% crit chance while above 75% HP — stay clean, hit hard.',
    tags: ['crit'],
    rarity: 'common',
    maxLevel: 2,
    baseWeight: 9,
    synergyWeight: 2,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => (c.hpFrac > 0.75 ? { critAdd: 0.12 } : {})),
  },

  // ══ ON-HIT RHYTHM + TARGET-AWARE — you fire constantly, so these pay constantly
  //    (count HITS, not shots; key off the enemy you struck). ══════════════════════
  {
    id: 'pressure-cooker',
    name: 'Pressure Cooker',
    description: 'Every 8th hit OVERLOADS the target — a 3m detonation (18 dmg per level).',
    tags: ['aoe', 'explosive'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    previewStats: (lvl) => [
      {
        label: 'Detonation',
        from: lvl === 0 ? '—' : `${18 * lvl} dmg`,
        to: `${18 * (lvl + 1)} dmg`,
      },
    ],
    apply: ({ effects }) => {
      let hits = 0;
      effects.on('hit', (ctx) => {
        if (ctx.targetIndex < 0 || ++hits % 8 !== 0) return;
        ctx.dealArea(ctx.x, ctx.z, 3, 18);
        ctx.fx.push('impact', ctx.x, ctx.z, 3, 0, ImpactProfile.Blast);
      });
    },
  },
  {
    id: 'headhunter',
    name: 'Headhunter',
    description: 'Felling a TOUGH unit (elite/ranged/brute) heals 4 HP + pops a 14-dmg burst.',
    tags: ['defense', 'aoe'],
    grantsTags: ['lifesteal'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    previewStats: () => [
      { label: 'Heal (tough kill)', from: '—', to: '4 HP' },
      { label: 'Burst', from: '—', to: '14 dmg' },
    ],
    apply: ({ effects }) =>
      effects.on('kill', (ctx) => {
        if ((ENEMY_BY_VARIANT[ctx.variant]?.threat ?? 0) < 8) return; // only real targets
        heal(ctx.player, 4);
        ctx.dealArea(ctx.x, ctx.z, 3, 14);
      }),
  },
  {
    id: 'giant-slayer',
    name: 'Giant Slayer',
    description: 'Your hits tear into BOSSES for +50% bonus damage — built for the big fights.',
    tags: ['damage'],
    grantsTags: ['boss-dmg'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    previewStats: (lvl) => [
      { label: 'Bonus vs bosses', from: `+${50 * lvl}%`, to: `+${50 * (lvl + 1)}%` },
    ],
    apply: ({ effects }) =>
      effects.on('hit', (ctx) => {
        const i = ctx.targetIndex;
        if (i < 0 || ctx.hitDamage <= 0) return;
        if (!ENEMY_BY_VARIANT[ctx.enemies.variant[i]!]?.boss) return;
        ctx.dealArea(ctx.x, ctx.z, 1.4, ctx.hitDamage * 0.5); // bonus bite, boss-only
      }),
  },
];
