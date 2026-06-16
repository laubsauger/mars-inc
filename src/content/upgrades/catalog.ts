// Upgrade catalog depth (T33/T40). A wide draft set across every rarity that
// produces DISTINCT build directions — crit, chain, explosive, status, ramp/
// conditional, glass-cannon — by composing the run-mod layer, the dynamic
// effect engine (conditionals + triggers, T38), and status application (T39).
// Curses (corrupted) carry a real downside; capstones (legendary) and
// experiments (prototype) are rare, swingy payoffs. Anti-synergy via exclusions.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

export const CATALOG_UPGRADES: UpgradeDefinition[] = [
  // ── Common ────────────────────────────────────────────────────────────────
  {
    id: 'sharpshooter',
    name: 'Sharpshooter Clause',
    description: '+4% crit chance.',
    tags: ['crit'],
    rarity: 'common',
    maxLevel: 5,
    baseWeight: 10,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.critChanceAdd += 0.04;
    },
  },
  {
    id: 'scrap-plating',
    name: 'Scrap Plating',
    description: '+20 max health.',
    tags: ['defense'],
    rarity: 'common',
    maxLevel: 5,
    baseWeight: 10,
    synergyWeight: 2,
    apply: ({ player }) => {
      player.maxHealth += 20;
      player.health += 20;
    },
  },
  {
    id: 'deflector-array',
    name: 'Deflector Array',
    description: '+1 shield (absorbs one hit, recharges); each level also speeds recharge.',
    tags: ['defense', 'shield'],
    rarity: 'uncommon',
    maxLevel: 4,
    baseWeight: 8,
    synergyWeight: 3,
    apply: ({ player }) => {
      player.shieldMax += 1;
      player.shieldCharges = player.shieldMax; // grant the new charge immediately
      player.shieldRecharge = Math.max(4, player.shieldRecharge - 1.5); // faster regen
    },
  },
  {
    id: 'hunter-killer-drone',
    name: 'Hunter-Killer Drone',
    description: '+1 companion drone that orbits you and shoots enemies on its own.',
    tags: ['drone', 'summon'],
    rarity: 'rare',
    maxLevel: 6,
    baseWeight: 6,
    synergyWeight: 4,
    apply: ({ player }) => {
      player.droneCount += 1;
    },
  },
  {
    id: 'repulsor-pulse',
    name: 'Repulsor Pulse',
    description:
      'Periodic shockwave shoves nearby enemies back (+light damage); levels speed it up.',
    tags: ['defense', 'control', 'kinetic'],
    rarity: 'uncommon',
    maxLevel: 5,
    baseWeight: 8,
    synergyWeight: 3,
    apply: ({ player }) => {
      if (player.novaInterval === 0) {
        player.novaInterval = 4.5; // first level enables it
        player.novaTimer = 1.5; // fire soon after taking it
      } else {
        // Slower growth so it ramps over the run instead of dominating early.
        player.novaInterval = Math.max(2.2, player.novaInterval - 0.5);
        player.novaRadius += 0.6;
        player.novaForce += 4;
        player.novaDamage += 4;
      }
    },
  },
  {
    id: 'concussive-rounds',
    name: 'Concussive Rounds',
    description: 'Your shots knock enemies back on hit — punch a channel through the swarm.',
    tags: ['control', 'kinetic'],
    rarity: 'uncommon',
    maxLevel: 4,
    baseWeight: 8,
    synergyWeight: 3,
    apply: ({ mods }) => {
      mods.knockback += 7;
    },
  },
  {
    id: 'singularity-core',
    name: 'Singularity Core',
    description: 'MUTATION: your Repulsor Pulse now PULLS enemies in, then crunches them harder.',
    tags: ['control', 'aoe'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 4,
    prerequisites: [{ id: 'repulsor-pulse', minLevel: 1 }],
    apply: ({ player }) => {
      player.novaPull = true;
      player.novaDamage += 12; // pulled-in cluster eats a bigger crunch
      player.novaRadius += 1;
    },
  },
  {
    id: 'kinetic-boots',
    name: 'Kinetic Boots',
    description:
      'Starting a sprint emits a shockwave that shoves enemies back — dash to part a blob.',
    tags: ['control', 'movement'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 8,
    synergyWeight: 3,
    apply: ({ player }) => {
      player.dashShockForce += 18;
      player.dashShockRadius += 0.6;
    },
  },
  {
    id: 'long-arm',
    name: 'Long-Arm Clause',
    description: '+15% weapon range.',
    tags: ['range'],
    rarity: 'common',
    maxLevel: 5,
    baseWeight: 12,
    synergyWeight: 3,
    apply: ({ mods }) => {
      mods.rangeMult += 0.15;
    },
  },
  {
    id: 'extended-barrel',
    name: 'Extended Barrel',
    description: '+28% weapon range and +4% damage — reach out and touch them.',
    tags: ['range', 'precision', 'damage'],
    grantsTags: ['range'],
    rarity: 'uncommon',
    maxLevel: 4,
    baseWeight: 8,
    synergyWeight: 4,
    apply: ({ mods }) => {
      mods.rangeMult += 0.28;
      mods.damageMult += 0.04;
    },
  },
  {
    id: 'recon-optics',
    name: 'Recon Optics',
    description: '+45% weapon range and +3% crit chance — pick targets from afar.',
    tags: ['range', 'precision', 'crit'],
    grantsTags: ['range'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 5,
    apply: ({ mods }) => {
      mods.rangeMult += 0.45;
      mods.critChanceAdd += 0.03;
    },
  },

  // ── Uncommon ──────────────────────────────────────────────────────────────
  {
    id: 'ricochet-rounds',
    name: 'Ricochet Rounds',
    description: 'Spent shots BOUNCE far to a new enemy, one at a time (starts 2, +1/level).',
    tags: ['ricochet', 'kinetic'],
    rarity: 'uncommon',
    maxLevel: 4,
    baseWeight: 6,
    synergyWeight: 3,
    apply: ({ mods }) => {
      // First pick gives a couple of bounces; later levels add reach + bounces,
      // and pump the retained damage up from its weak base toward full strength.
      mods.ricochet = mods.ricochet === 0 ? 2 : mods.ricochet + 1;
      mods.ricochetRange += 1.5;
      mods.ricochetRetain = Math.min(0.9, mods.ricochetRetain + 0.16);
    },
  },
  {
    id: 'heavy-barrel',
    name: 'Heavy Barrel',
    description: '+35% damage, but slower fire rate.',
    tags: ['damage'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.damageMult += 0.35;
      mods.fireRateMult = Math.max(0.3, mods.fireRateMult - 0.12);
    },
  },

  // ── Rare ──────────────────────────────────────────────────────────────────
  {
    id: 'overpressure',
    name: 'Overpressure Mandate',
    description: 'Every shot detonates in a small blast.',
    tags: ['explosive', 'aoe'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 4,
    synergyWeight: 3,
    apply: ({ mods }) => {
      mods.blastRadius += 1.5;
      mods.blastDamageMult = Math.min(1.1, mods.blastDamageMult + 0.22); // splash bites harder
    },
  },
  {
    id: 'restraining-order',
    name: 'Restraining Order',
    description: '+35% damage to enemies kept beyond arm’s reach.',
    tags: ['conditional', 'damage', 'precision'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 2,
    // Rewards spacing / kiting: the bonus is live only while the nearest enemy is
    // at distance — auto-fire means uptime is your footwork, not a trigger.
    apply: ({ effects }) => {
      effects.addConditional((ctx) => ({ damageMult: ctx.nearestDist > 9 ? 1.35 : 1 }));
    },
  },
  {
    id: 'apex-hunter',
    name: 'Apex Hunter',
    description: '+25% crit when 3 or fewer enemies remain.',
    tags: ['conditional', 'crit'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 2,
    apply: ({ effects }) => {
      effects.addConditional((ctx) => ({ critAdd: ctx.enemiesOnScreen <= 3 ? 0.25 : 0 }));
    },
  },

  // ── Legendary (capstones) ─────────────────────────────────────────────────
  {
    id: 'rust-devil-protocol',
    name: 'Rust Devil Protocol',
    description: 'CAPSTONE: +50% fire rate, +1 projectile, wider spray.',
    tags: ['fire-rate', 'multishot'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 3,
    prerequisites: [{ id: 'rapid-billing', minLevel: 3 }],
    apply: ({ mods }) => {
      mods.fireRateMult += 0.5;
      mods.projectileCount += 1;
      mods.spreadArc += 0.1;
    },
  },
  {
    id: 'chain-reaction',
    name: 'Chain Reaction',
    description: 'CAPSTONE: +2 arcs, much longer reach, barely weaker.',
    tags: ['chain'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 3,
    prerequisites: [{ id: 'arc-garnishment', minLevel: 2 }],
    apply: ({ mods }) => {
      mods.chainCount += 2;
      mods.chainRange += 4;
      mods.chainFalloff = Math.min(0.85, mods.chainFalloff + 0.15);
    },
  },
  {
    id: 'singularity-protocol',
    name: 'Singularity Protocol',
    description: 'CAPSTONE: kills sometimes collapse into a heavy implosion.',
    tags: ['aoe', 'explosive'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    apply: ({ effects }) => {
      // T44 nerf: was 6m / 40 dmg / 20% — chain-cleared whole crowds. Still a
      // strong capstone payoff, no longer an arena wipe.
      effects.on('kill', (c) => {
        if (c.rng.next() < 0.15) c.dealArea(c.x, c.z, 4, 24);
      });
    },
  },

  // ── Corrupted (curses: big upside, real downside) ─────────────────────────
  {
    id: 'glass-cannon-pact',
    name: 'Glass Cannon Pact',
    description: 'CURSE: +80% damage, but HALVE your max health.',
    tags: ['damage', 'risk'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    exclusions: [{ id: 'iron-stance' }],
    apply: ({ mods, player }) => {
      mods.damageMult += 0.8;
      player.maxHealth = Math.max(1, Math.round(player.maxHealth * 0.5));
      player.health = Math.min(player.health, player.maxHealth);
    },
  },
  {
    id: 'berserkers-bargain',
    name: "Berserker's Bargain",
    description: 'CURSE: +60% fire rate, but −15% move speed.',
    tags: ['fire-rate', 'risk'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    apply: ({ mods, player }) => {
      mods.fireRateMult += 0.6;
      player.stats.moveSpeed *= 0.85;
    },
  },
  {
    id: 'blood-pact',
    name: 'Blood Pact',
    description: 'CURSE: +30% crit chance, but −40 max health.',
    tags: ['crit', 'risk'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    apply: ({ mods, player }) => {
      mods.critChanceAdd += 0.3;
      player.maxHealth = Math.max(1, player.maxHealth - 40);
      player.health = Math.min(player.health, player.maxHealth);
    },
  },

  // ── Prototype (experimental, swingy) ──────────────────────────────────────
  {
    id: 'unstable-overclock',
    name: 'Unstable Overclock',
    description: 'EXPERIMENTAL: +50% damage & fire rate, wild spread.',
    tags: ['damage', 'fire-rate', 'risk'],
    rarity: 'prototype',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.damageMult += 0.5;
      mods.fireRateMult += 0.25;
      mods.spreadArc += 0.25;
    },
  },
  {
    id: 'quantum-split',
    name: 'Quantum Split',
    description: 'EXPERIMENTAL: +2 projectiles, each a little weaker.',
    tags: ['multishot'],
    rarity: 'prototype',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.projectileCount += 2;
      mods.damageMult = Math.max(0.3, mods.damageMult - 0.2);
    },
  },
];
