// Arsenal expansion (T40). Variety pass: replaces the old pile of near-duplicate
// stat-sticks with cards that DO something — conditionals, on-hit/crit/kill
// triggers, hit-scaled status (T70), proc-coefficient (T69), executes, lifesteal,
// economy/greed, and a risk web of curses/capstones. Every card composes existing
// systems (run mods + the dynamic effect engine), never bespoke logic.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';
import { EnemyState } from '../../sim/enemies';

// Reused scratch for on-kill area queries — pooled, no per-call alloc (V5).
const scratch: number[] = [];

export const ARSENAL_UPGRADES: UpgradeDefinition[] = [
  // ── Uncommon ──────────────────────────────────────────────────────────────
  {
    id: 'entrenchment',
    name: 'Entrenchment',
    description: 'Dig in: damage ramps the longer you STAND STILL (up to +60%), resets on move.',
    tags: ['ramp', 'damage', 'conditional'],
    grantsTags: ['ramp'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ damageMult: 1 + Math.min(0.6, c.stationarySec * 0.06) })),
  },
  {
    id: 'adrenaline-account',
    name: 'Adrenaline Account',
    description: '+25% fire rate while below half health — fight harder when cornered.',
    tags: ['fire-rate', 'risk', 'conditional'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.addConditional((c) => (c.hpFrac < 0.5 ? { fireRateMult: 1.25 } : {})),
  },
  {
    id: 'severance-dividend',
    name: 'Severance Dividend',
    description: 'Every kill pays out 2 health — attrition sustain for grinder builds.',
    tags: ['lifesteal', 'defense'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 2,
    role: 'converter',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('kill', (c) => {
        c.player.health = Math.min(c.player.maxHealth, c.player.health + 2);
      }),
  },
  {
    id: 'dividend-reinvestment',
    name: 'Dividend Reinvestment',
    description: '+25% pickup radius and +20% magnet — sweep the floor without chasing.',
    tags: ['economy'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ player }) => {
      player.pickupRadius *= 1.25;
      player.magnetRadius *= 1.2;
    },
  },
  {
    id: 'bounty-marker',
    name: 'Bounty Marker',
    description: 'Hits have a chance to MARK the target: +50% status damage on it.',
    tags: ['mark', 'status'],
    grantsTags: ['mark'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 3,
    role: 'primer',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (c) => {
        if (c.targetIndex >= 0 && c.rng.next() < 0.25) {
          c.applyStatus(c.targetIndex, 'mark', { duration: 4, amplify: 1.5 });
        }
      }),
  },
  {
    id: 'riot-insurance',
    name: 'Riot Insurance',
    description: '+1 shield charge and you shrug off knockback — hold the line.',
    tags: ['defense', 'shield'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ player }) => {
      player.shieldMax += 1;
      player.shieldCharges = player.shieldMax;
      player.stats.knockbackResistance = Math.min(0.9, player.stats.knockbackResistance + 0.25);
    },
  },

  // ── Rare ──────────────────────────────────────────────────────────────────
  {
    id: 'killing-floor',
    name: 'Killing Floor',
    description: '+2% crit chance for every enemy on screen (capped) — thrive in the swarm.',
    tags: ['crit', 'crowd', 'conditional'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ critAdd: Math.min(0.3, c.enemiesOnScreen * 0.02) })),
  },
  {
    id: 'red-ledger',
    name: 'Red Ledger',
    description: 'Critical hits drain 1 health back to you — crit builds drink blood.',
    tags: ['crit', 'lifesteal'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('crit', (c) => {
        c.player.health = Math.min(c.player.maxHealth, c.player.health + 1);
      }),
  },
  {
    id: 'executioners-writ',
    name: "Executioner's Writ",
    description: 'Hits on enemies below 25% health detonate them for a 14-dmg blast (2m).',
    tags: ['execute', 'damage', 'aoe'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 4,
    synergyWeight: 2,
    role: 'converter',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('hit', (c) => {
        const i = c.targetIndex;
        if (i < 0) return;
        if (c.enemies.health[i]! / Math.max(1, c.enemies.maxHp[i]!) < 0.25) {
          c.dealArea(c.x, c.z, 2, 14);
        }
      }),
  },
  {
    id: 'overwhelming-force',
    name: 'Overwhelming Force',
    description:
      'CONVERTER: your knockback shots ALSO burst a 4-dmg concussive blast (1.6m) on impact (needs a knockback card).',
    tags: ['explosive', 'aoe', 'control'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 0,
    // Gate behind an existing knockback build (kinetic tag) so it reads as the
    // CONVERTER it is — adding AoE on top — not a second parallel knockback card.
    // No `mods.knockback` bump here; Concussive Rounds owns the knockback stat.
    requiresAnyTags: ['kinetic'],
    apply: ({ effects }) => {
      effects.on('hit', (c) => {
        c.dealArea(c.x, c.z, 1.6, 4);
      });
    },
  },
  {
    id: 'pressure-couplings',
    name: 'Pressure Couplings',
    description: 'STATUS ENGINE: +0.75 proc coefficient — every weapon applies ailments harder.',
    tags: ['status', 'proc'],
    grantsTags: ['proc'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'engine',
    riskTier: 0,
    apply: ({ mods }) => {
      mods.procCoefBonus += 0.75;
    },
  },
  {
    id: 'railgun-mandate',
    name: 'Railgun Mandate',
    description: '+1 pierce, +12% range, +10% damage per level — punch a hole down the lane.',
    tags: ['pierce', 'precision', 'range', 'damage'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 4,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.pierce += 1;
      mods.rangeMult += 0.12;
      mods.damageMult += 0.1;
    },
  },
  {
    id: 'insider-trading',
    name: 'Insider Trading',
    description: '+2 luck — better odds, rarer cards, fatter drops.',
    tags: ['economy', 'luck'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 2,
    apply: ({ player }) => {
      player.luck += 2;
    },
  },

  // ── Corrupted (curses: big upside, real downside) ─────────────────────────
  {
    id: 'cook-off',
    name: 'Cook-Off',
    description: 'CURSE: +60% fire rate, but the recoil kicks 50% harder.',
    tags: ['fire-rate', 'risk'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    role: 'liability',
    riskTier: 2,
    apply: ({ mods }) => {
      mods.fireRateMult += 0.6;
      mods.recoilMult += 0.5;
    },
  },
  {
    id: 'all-or-nothing',
    name: 'All or Nothing',
    description: 'CURSE: +90% damage per shot, but HALF the fire rate — make each one count.',
    tags: ['damage', 'risk'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    role: 'liability',
    riskTier: 2,
    apply: ({ mods }) => {
      mods.damageMult += 0.9;
      mods.fireRateMult = Math.max(0.3, mods.fireRateMult - 0.5);
    },
  },
  {
    id: 'blood-money',
    name: 'Blood Money',
    description: 'CURSE: −50 max health, but hits siphon life back — live on the edge.',
    tags: ['lifesteal', 'risk'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    role: 'liability',
    riskTier: 2,
    apply: ({ player, effects }) => {
      player.maxHealth = Math.max(1, player.maxHealth - 50);
      player.health = Math.min(player.health, player.maxHealth);
      effects.on('hit', (c) => {
        if (c.rng.next() < 0.15) {
          c.player.health = Math.min(c.player.maxHealth, c.player.health + 1);
        }
      });
    },
  },

  // ── Legendary (capstones) ─────────────────────────────────────────────────
  {
    id: 'golden-parachute',
    name: 'Golden Parachute',
    description: 'CAPSTONE: ~10% of kills pay out — heal 6 HP and a parting blast (10 dmg, 3.5m).',
    tags: ['lifesteal', 'aoe'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    role: 'converter',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.on('kill', (c) => {
        if (c.rng.next() < 0.1) {
          c.player.health = Math.min(c.player.maxHealth, c.player.health + 6);
          c.dealArea(c.x, c.z, 3.5, 10);
          c.fx.push('death', c.x, c.z, 0, 0, c.variant);
        }
      }),
  },
  {
    id: 'white-phosphorus',
    name: 'White Phosphorus',
    description:
      'CAPSTONE: a burning enemy that dies ignites everything within 3m (viral burn, 5 dps/2s).',
    tags: ['burn', 'aoe', 'status'],
    requiresAllTags: ['burn'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 3,
    role: 'catastrophe',
    riskTier: 1,
    apply: ({ effects }) =>
      effects.on('kill', (c) => {
        const n = c.hash.queryCircle(c.x, c.z, 3, scratch);
        for (let k = 0; k < n; k++) {
          const e = scratch[k]!;
          if (e >= c.enemies.count || c.enemies.health[e]! <= 0) continue;
          if (c.enemies.state[e] !== EnemyState.Active) continue;
          c.applyStatus(e, 'burn', { duration: 2, dps: 5 });
        }
        c.fx.push('impact', c.x, c.z);
      }),
  },
  {
    id: 'ricochet-cascade',
    name: 'Ricochet Cascade',
    description: 'CAPSTONE: bounces gain reach AND each bounce arcs lightning to the crowd.',
    tags: ['ricochet', 'chain', 'energy'],
    requiresAnyTags: ['ricochet', 'chain'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 0,
    apply: ({ mods }) => {
      mods.ricochet = mods.ricochet === 0 ? 2 : mods.ricochet + 1;
      mods.chainCount = mods.chainCount === 0 ? 1 : mods.chainCount + 1;
      mods.ricochetRange += 2;
      mods.ricochetRetain = Math.min(0.9, mods.ricochetRetain + 0.25); // bounces hit far harder
    },
  },
  {
    id: 'executive-override',
    name: 'Executive Override',
    description: 'CAPSTONE: +50% damage when 2 or fewer enemies remain — a boss-melting finisher.',
    tags: ['conditional', 'damage', 'precision'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    role: 'engine',
    riskTier: 0,
    apply: ({ effects }) =>
      effects.addConditional((c) => (c.enemiesOnScreen <= 2 ? { damageMult: 1.5 } : {})),
  },

  // ── Prototype (experimental, swingy) ──────────────────────────────────────
  {
    id: 'tunneling-rounds',
    name: 'Tunneling Rounds',
    description: 'EXPERIMENTAL: +5 pierce, but each shot hits a little softer.',
    tags: ['pierce', 'risk'],
    rarity: 'prototype',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.pierce += 5;
      mods.damageMult = Math.max(0.3, mods.damageMult - 0.2);
    },
  },
  // ── Grenade (right-mouse secondary) — its own progression lane ──────────────
  {
    id: 'cluster-munitions',
    name: 'Cluster Munitions',
    description: 'GRENADE: -25% grenade cooldown per level — lob them faster.',
    tags: ['grenade', 'explosive', 'aoe'],
    grantsTags: ['grenade'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.grenadeCdMult *= 0.75;
    },
  },
  {
    id: 'long-fuse',
    name: 'Long Fuse',
    description: 'GRENADE: +4m throw range per level — reach the back line.',
    tags: ['grenade', 'explosive', 'range'],
    grantsTags: ['grenade'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.grenadeRangeAdd += 4;
    },
  },
  {
    id: 'heavy-ordnance',
    name: 'Heavy Ordnance',
    description: 'GRENADE: +50% grenade damage and +1 blast radius per level.',
    tags: ['grenade', 'explosive', 'aoe', 'damage'],
    grantsTags: ['grenade'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 3,
    apply: ({ mods }) => {
      mods.grenadeDamageMult += 0.5;
      mods.grenadeRadiusAdd += 1;
    },
  },
  {
    id: 'concussion-charge',
    name: 'Concussion Charge',
    description: 'GRENADE: +25% grenade knockback per level — blow a lane through the horde.',
    tags: ['grenade', 'kinetic', 'control'],
    grantsTags: ['grenade'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.grenadeKnockbackMult += 0.25;
    },
  },
  {
    id: 'molotov-cocktail',
    name: 'Molotov Cocktail',
    description: 'GRENADE: your grenades set the blast zone on FIRE (burn).',
    tags: ['grenade', 'burn', 'status', 'aoe'],
    grantsTags: ['grenade', 'burn'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    role: 'converter',
    riskTier: 0,
    apply: ({ mods }) => {
      mods.grenadeMolotov = true;
    },
  },
  {
    id: 'napalm-doctrine',
    name: 'Napalm Doctrine',
    description: 'CAPSTONE: grenades become a wide WALL OF FIRE — +radius, +damage, molotov burn.',
    tags: ['grenade', 'burn', 'aoe', 'explosive'],
    grantsTags: ['grenade', 'burn'],
    requiresAnyTags: ['grenade'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 3,
    role: 'catastrophe',
    riskTier: 1,
    apply: ({ mods }) => {
      mods.grenadeMolotov = true;
      mods.grenadeDamageMult += 0.6;
      mods.grenadeRadiusAdd += 2;
      mods.grenadeCdMult *= 0.85;
    },
  },
];
