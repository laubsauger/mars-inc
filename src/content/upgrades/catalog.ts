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
  // ── Recoil / knockback CONTROL — the answer to a kicking weapon. An unprepared
  // fighter gets shoved around by a minigun's recoil; these let you BUILD toward
  // wielding it planted and controlled. Surfaced harder for fire-rate / multishot
  // owners (the builds that generate the most kick).
  {
    id: 'counterweight-plating',
    name: 'Counterweight Plating',
    description: 'Brace against your own gun — −15% recoil shove per level.',
    tags: ['control', 'defense', 'recoil'],
    grantsTags: ['recoil'],
    rarity: 'common',
    maxLevel: 4,
    baseWeight: 8,
    synergyWeight: 3,
    weightRules: [{ whenTags: ['fire-rate', 'multishot'], multiplier: 3 }],
    apply: ({ player }) => {
      player.stats.recoilResistance = Math.min(0.85, player.stats.recoilResistance + 0.15);
    },
  },
  {
    id: 'gyro-stabilizers',
    name: 'Gyro Stabilizers',
    description: 'Planted stance: −18% recoil AND −15% enemy knockback per level.',
    tags: ['control', 'defense', 'recoil'],
    grantsTags: ['recoil'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 3,
    weightRules: [{ whenTags: ['fire-rate', 'multishot'], multiplier: 3 }],
    apply: ({ player }) => {
      player.stats.recoilResistance = Math.min(0.9, player.stats.recoilResistance + 0.18);
      player.stats.knockbackResistance = Math.min(0.9, player.stats.knockbackResistance + 0.15);
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
    // Capped at 3 (was 6) — a drone is a real damage source; six from one card line
    // (plus Glory-Tree drones) turned the screen into an auto-killing fleet.
    maxLevel: 3,
    baseWeight: 5,
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
      mods.knockback += 15; // a real shove that buys space, not a nudge
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
    description: '+10% weapon range per level.',
    tags: ['range'],
    rarity: 'common',
    maxLevel: 5,
    baseWeight: 12,
    synergyWeight: 3,
    apply: ({ mods }) => {
      mods.rangeMult += 0.1;
    },
  },
  {
    id: 'extended-barrel',
    name: 'Extended Barrel',
    description: '+15% weapon range and +3% damage per level.',
    tags: ['range', 'precision', 'damage'],
    grantsTags: ['range'],
    rarity: 'uncommon',
    maxLevel: 4,
    baseWeight: 8,
    synergyWeight: 4,
    apply: ({ mods }) => {
      mods.rangeMult += 0.15;
      mods.damageMult += 0.03;
    },
  },
  {
    id: 'recon-optics',
    name: 'Recon Optics',
    description: '+18% weapon range and +2% crit chance per level — pick targets from afar.',
    tags: ['range', 'precision', 'crit'],
    grantsTags: ['range'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 5,
    apply: ({ mods }) => {
      mods.rangeMult += 0.18;
      mods.critChanceAdd += 0.02;
    },
  },

  // ── Uncommon ──────────────────────────────────────────────────────────────
  {
    id: 'ricochet-rounds',
    name: 'Ricochet Rounds',
    description: 'Spent shots BOUNCE to a new enemy (+1 bounce/level). Bounces hit for a fraction.',
    tags: ['ricochet', 'kinetic'],
    rarity: 'uncommon',
    maxLevel: 4,
    baseWeight: 6,
    synergyWeight: 3,
    apply: ({ mods }) => {
      // BASIC bounce — adds hops but the bounce hits SOFT (modest retain). The
      // legendary Cascade is what turns ricochet into a real damage engine. Keeps a
      // clear tier gap: this is reach, the capstone is power + lightning.
      mods.ricochet += 1;
      mods.ricochetRange += 1;
      mods.ricochetRetain = Math.min(0.6, mods.ricochetRetain + 0.08);
    },
  },
  {
    id: 'heavy-barrel',
    name: 'Heavy Barrel',
    description: '+18% damage per level, but slightly slower fire rate.',
    tags: ['damage'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 6,
    synergyWeight: 2,
    apply: ({ mods }) => {
      mods.damageMult += 0.18;
      mods.fireRateMult = Math.max(0.3, mods.fireRateMult - 0.08);
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
    description: '+35% damage per level while the nearest enemy is beyond 9m — reward for kiting.',
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
    description: '+crit as the space around you clears — up to +30% with no enemies within 7m.',
    tags: ['conditional', 'crit'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 2,
    apply: ({ effects }) => {
      // SMOOTH finisher on the LOCAL crowd: full +30% when no one's near, fading to 0
      // at 8 nearby. Rewards kiting/carving space, not an all-or-nothing arena gate.
      effects.addConditional((ctx) => ({
        critAdd: Math.max(0, (8 - ctx.enemiesNearby) / 8) * 0.3,
      }));
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
      mods.chainChance = Math.min(1, mods.chainChance + 0.2); // legendary → big proc bump
      mods.chainCount += 2;
      mods.chainRange += 4;
      mods.chainFalloff = Math.min(0.85, mods.chainFalloff + 0.15);
    },
  },
  {
    id: 'singularity-protocol',
    name: 'Singularity Protocol',
    description: 'CAPSTONE: ~15% of kills collapse into a heavy implosion (24 dmg, 4m).',
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
    description: 'EXPERIMENTAL: +50% damage and +50% fire rate — but recoil kicks 70% harder.',
    tags: ['damage', 'fire-rate', 'risk'],
    rarity: 'prototype',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 2,
    // Was "+wild spread" via mods.spreadArc — DEAD: the weapon's own spreadArc wins
    // (weapon-system `?? mods.spreadArc`) and arc only fans MULTI-shot, so a single-shot
    // gun showed nothing. Recoil is a real, visible, numbered downside that fits the name.
    apply: ({ mods }) => {
      mods.damageMult += 0.5;
      mods.fireRateMult += 0.5;
      mods.recoilMult += 0.7;
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
