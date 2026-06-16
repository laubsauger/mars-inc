// Permanent (meta) upgrades bought with Martian Glory (T26, §9.5 Arsenal/Biology/
// Mobility). Data-driven; `apply` mutates the fresh run player / mod layer / build
// engine. Owned levels live in PlayerProfile.permanentUpgrades and are applied at
// run start. The Glory Tree UI (MainMenu) browses & buys them.
//
// Philosophy (§9.5): the tree unlocks POSSIBILITIES, not just raw numbers. Common
// nodes are stat tune-ups; RARE nodes hand you a mechanic (pierce, chain, a shield,
// a nova); LEGENDARY keystones are build-defining and cap at one level — they sit at
// the branch tips so a fully-grown branch ends in an identity, not a stat pile.

import type { Player } from '../../sim/player';
import type { RunMods } from '../../sim/progression/mods';
import type { BuildEffects } from '../../sim/progression/effects';

export type GloryRarity = 'common' | 'rare' | 'legendary';

export interface PermanentUpgrade {
  id: string;
  name: string;
  description: string;
  branch: 'arsenal' | 'biology' | 'mobility' | 'command' | 'arena' | 'infamy';
  rarity: GloryRarity;
  cost: number; // Martian Glory per level
  maxLevel: number;
  // `mods`/`effects` let a node SEED a build (start with a status primer, a drone,
  // recoil tuning…), not just buff a player stat. Plain stat nodes ignore the extras.
  apply: (player: Player, level: number, mods: RunMods, effects: BuildEffects) => void;
}

export const PERMANENT_UPGRADES: PermanentUpgrade[] = [
  // ══ MOBILITY (cyan) — speed, sprint, kinetic control ════════════════════════
  {
    id: 'fleet-footed',
    name: 'Fleet-Footed Clause',
    description: '+5% base move speed per level.',
    branch: 'mobility',
    rarity: 'common',
    cost: 80,
    maxLevel: 4,
    apply: (p, level) => {
      p.stats.moveSpeed *= 1 + 0.05 * level;
    },
  },
  {
    id: 'nimble-frame',
    name: 'Nimble Frame',
    description: '+8% acceleration per level — snappier starts and cuts.',
    branch: 'mobility',
    rarity: 'common',
    cost: 80,
    maxLevel: 4,
    apply: (p, level) => {
      p.stats.acceleration *= 1 + 0.08 * level;
    },
  },
  {
    id: 'jump-start',
    name: 'Jump-Start Contract',
    description: '+1 sprint charge per level.',
    branch: 'mobility',
    rarity: 'common',
    cost: 140,
    maxLevel: 2,
    apply: (p, level) => {
      p.stats.sprintCharges += level;
      p.sprint.maxCharges += level;
      p.sprint.charges += level;
    },
  },
  {
    id: 'redline-servos',
    name: 'Redline Servos',
    description: '-6% sprint cooldown per level.',
    branch: 'mobility',
    rarity: 'common',
    cost: 100,
    maxLevel: 4,
    apply: (p, level) => {
      p.stats.sprintCooldown *= Math.max(0.45, 1 - 0.06 * level);
    },
  },
  {
    id: 'afterburn-clause',
    name: 'Afterburn Clause',
    description: '+7% sprint duration per level.',
    branch: 'mobility',
    rarity: 'common',
    cost: 90,
    maxLevel: 3,
    apply: (p, level) => {
      p.stats.sprintDuration *= 1 + 0.07 * level;
    },
  },
  {
    id: 'kinetic-boots',
    name: 'Kinetic Boots',
    description: 'Sprinting emits a concussive shockwave that shoves enemies off you.',
    branch: 'mobility',
    rarity: 'rare',
    cost: 160,
    maxLevel: 2,
    apply: (p, level) => {
      p.dashShockForce += 7 * level;
      p.dashShockRadius = Math.max(p.dashShockRadius, 4);
    },
  },
  {
    id: 'repulsor-core',
    name: 'Repulsor Core',
    description: 'Start with a pulsing repulsor nova that knocks back and damages around you.',
    branch: 'mobility',
    rarity: 'rare',
    cost: 180,
    maxLevel: 2,
    apply: (p, level) => {
      p.novaInterval = Math.max(2.5, 5 - level); // faster pulse at level 2
    },
  },
  {
    id: 'phase-stride',
    name: 'Phase Stride',
    description: 'KEYSTONE: +1 sprint charge AND recoil recharges your sprint. Never stop moving.',
    branch: 'mobility',
    rarity: 'legendary',
    cost: 340,
    maxLevel: 1,
    apply: (p) => {
      p.stats.sprintCharges += 1;
      p.sprint.maxCharges += 1;
      p.sprint.charges += 1;
      p.recoilSprintRecharge = true;
    },
  },
  {
    id: 'singularity-engine',
    name: 'Singularity Engine',
    description:
      'KEYSTONE: your nova INVERTS — it pulls the swarm into a tight, hard-hitting knot.',
    branch: 'mobility',
    rarity: 'legendary',
    cost: 420,
    maxLevel: 1,
    apply: (p) => {
      p.novaInterval = Math.max(2.5, p.novaInterval || 3.5);
      p.novaPull = true;
      p.novaDamage += 5;
      p.novaRadius = Math.max(p.novaRadius, 4.2);
    },
  },

  // ══ BIOLOGY (toxic green) — survival, pickups, status seeds ══════════════════
  {
    id: 'reinforced-plating',
    name: 'Reinforced Plating',
    description: '+20 starting max health per level.',
    branch: 'biology',
    rarity: 'common',
    cost: 90,
    maxLevel: 5,
    apply: (p, level) => {
      const bonus = 20 * level;
      p.maxHealth += bonus;
      p.health += bonus;
    },
  },
  {
    id: 'organ-repo-insurance',
    name: 'Organ Repo Insurance',
    description: '+8 starting max health and +3% pickup radius per level.',
    branch: 'biology',
    rarity: 'common',
    cost: 75,
    maxLevel: 5,
    apply: (p, level) => {
      const hp = 8 * level;
      p.maxHealth += hp;
      p.health += hp;
      p.pickupRadius *= 1 + 0.03 * level;
    },
  },
  {
    id: 'magnetized-marrow',
    name: 'Magnetized Marrow',
    description: '+8% XP magnet radius per level.',
    branch: 'biology',
    rarity: 'common',
    cost: 95,
    maxLevel: 4,
    apply: (p, level) => {
      p.magnetRadius *= 1 + 0.08 * level;
    },
  },
  {
    id: 'adrenal-glut',
    name: 'Adrenal Glut',
    description: '+5% pickup radius per level — sweep drops without the detour.',
    branch: 'biology',
    rarity: 'common',
    cost: 80,
    maxLevel: 4,
    apply: (p, level) => {
      p.pickupRadius *= 1 + 0.05 * level;
    },
  },
  {
    id: 'thick-hide',
    name: 'Thick Hide',
    description: '+12% knockback resistance per level — the swarm shoves you less.',
    branch: 'biology',
    rarity: 'common',
    cost: 80,
    maxLevel: 4,
    apply: (p, level) => {
      p.stats.knockbackResistance += 0.12 * level;
    },
  },
  {
    id: 'last-stand',
    name: 'Last-Stand Clause',
    description: 'RULE: while below 40% health you deal +40% damage — cornered, not finished.',
    branch: 'infamy',
    rarity: 'rare',
    cost: 170,
    maxLevel: 2,
    apply: (_p, level, _mods, effects) => {
      const bonus = 1 + 0.4 * level;
      effects.addConditional((c) => (c.hpFrac < 0.4 ? { damageMult: bonus } : {}));
    },
  },
  {
    id: 'adrenal-flood',
    name: 'Adrenal Flood',
    description: 'RULE: below half health, your fire rate surges +20% — panic is a weapon.',
    branch: 'infamy',
    rarity: 'rare',
    cost: 160,
    maxLevel: 2,
    apply: (_p, level, _mods, effects) => {
      const bonus = 1 + 0.2 * level;
      effects.addConditional((c) => (c.hpFrac < 0.5 ? { fireRateMult: bonus } : {}));
    },
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    description: 'KEYSTONE: cheat death once per run — a lethal hit leaves you at 40% instead.',
    branch: 'biology',
    rarity: 'legendary',
    cost: 380,
    maxLevel: 1,
    apply: (p) => {
      p.reviveCharges += 1;
    },
  },
  {
    id: 'emergency-plating',
    name: 'Emergency Plating',
    description: 'Start with +1 shield charge per level — eats a hit, then recharges.',
    branch: 'biology',
    rarity: 'rare',
    cost: 200,
    maxLevel: 2,
    apply: (p, level) => {
      p.shieldMax += level;
      p.shieldCharges += level;
    },
  },
  {
    id: 'second-heart',
    name: 'Second Heart',
    description:
      'KEYSTONE: +1 shield charge that recharges far faster — a heartbeat between deaths.',
    branch: 'biology',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (p) => {
      p.shieldMax += 1;
      p.shieldCharges += 1;
      p.shieldRecharge = Math.min(p.shieldRecharge, 6);
    },
  },
  {
    id: 'toxic-bloom',
    name: 'Toxic Bloom',
    description: 'KEYSTONE: every kill bursts a toxic cloud, damaging the pack around the corpse.',
    branch: 'biology',
    rarity: 'legendary',
    cost: 400,
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      effects.on('kill', (c) => {
        c.dealArea(c.x, c.z, 3.5, 9);
      });
    },
  },

  // ══ ARSENAL (gold) — firepower, drafting, projectile mechanics ═══════════════
  {
    id: 'gyro-bracing',
    name: 'Gyro Bracing',
    description: '+10% recoil resistance per level.',
    branch: 'arsenal',
    rarity: 'common',
    cost: 85,
    maxLevel: 4,
    apply: (p, level) => {
      p.stats.recoilResistance += 0.1 * level;
    },
  },
  {
    id: 'overcharged-rounds',
    name: 'Overcharged Rounds',
    description: '+4% weapon damage per level.',
    branch: 'arsenal',
    rarity: 'common',
    cost: 90,
    maxLevel: 5,
    apply: (_p, level, mods) => {
      mods.damageMult += 0.04 * level;
    },
  },
  {
    id: 'quickdraw-clause',
    name: 'Quickdraw Clause',
    description: '+4% fire rate per level.',
    branch: 'arsenal',
    rarity: 'common',
    cost: 90,
    maxLevel: 5,
    apply: (_p, level, mods) => {
      mods.fireRateMult += 0.04 * level;
    },
  },
  {
    id: 'hairline-sights',
    name: 'Hairline Sights',
    description: '+2% crit chance per level.',
    branch: 'arsenal',
    rarity: 'common',
    cost: 95,
    maxLevel: 4,
    apply: (_p, level, mods) => {
      mods.critChanceAdd += 0.02 * level;
    },
  },
  {
    id: 'house-odds',
    name: 'House Odds',
    description: '+1 draft reroll each run per level.',
    branch: 'arena',
    rarity: 'common',
    cost: 110,
    maxLevel: 2,
    apply: (p, level) => {
      p.bonusRerolls += level;
    },
  },
  {
    id: 'blacklist-rights',
    name: 'Blacklist Rights',
    description: '+1 draft banish each run per level; at level 2, also +1 tag banish.',
    branch: 'arena',
    rarity: 'common',
    cost: 110,
    maxLevel: 2,
    apply: (p, level) => {
      p.bonusBanishes += level;
      // Tier 2 unlocks dropping a whole tag from the run pool (T71).
      p.bonusTagBanishes += Math.max(0, level - 1);
    },
  },
  {
    id: 'retainer-clause',
    name: 'Retainer Clause',
    description: '+1 draft lock each run per level — hold a card for the next level-up.',
    branch: 'arena',
    rarity: 'rare',
    cost: 130,
    maxLevel: 2,
    apply: (p, level) => {
      p.bonusLocks += level;
    },
  },
  {
    id: 'lucky-streak',
    name: 'Lucky Streak',
    description: 'Better odds of rare upgrades (+luck) per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 130,
    maxLevel: 3,
    apply: (p, level) => {
      p.luck += level;
    },
  },
  {
    id: 'sponsor-auditor',
    name: 'Sponsor Auditor',
    description: '+1 luck and +2% pickup radius per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 150,
    maxLevel: 3,
    apply: (p, level) => {
      p.luck += level;
      p.pickupRadius *= 1 + 0.02 * level;
    },
  },
  {
    id: 'splinter-rounds',
    name: 'Splinter Rounds',
    description: 'Start with +1 pierce per level — shots punch through the front rank.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.pierce += level;
    },
  },
  {
    id: 'ricochet-clause',
    name: 'Ricochet Clause',
    description: 'Start with +1 ricochet bounce per level — spent shots hunt a fresh target.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.ricochet += level;
    },
  },
  {
    id: 'arc-garnishment',
    name: 'Arc Garnishment',
    description: 'Start with +1 chain-lightning arc per level — hits leap to packed crowds.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 160,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.chainCount += level;
    },
  },
  {
    id: 'hollow-points',
    name: 'Hollow Points',
    description: 'AMPLIFY: +40% critical hit DAMAGE per level — pays off once you build crit.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 160,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.critDamageMult += 0.4 * level;
    },
  },
  {
    id: 'accelerant',
    name: 'Accelerant',
    description: 'AMPLIFY: +30% status (burn/bleed) damage per level — rewards a DoT build.',
    branch: 'arsenal',
    rarity: 'rare',
    cost: 170,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.statusDamageMult += 0.3 * level;
    },
  },
  {
    id: 'wider-contracts',
    name: 'Wider Contracts',
    description:
      'RULE: every level-up offers +1 upgrade choice — more shots at the build you want.',
    branch: 'arena',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (p) => {
      p.draftSize += 1;
    },
  },
  {
    id: 'wide-load',
    name: 'Wide Load',
    description: 'KEYSTONE: +1 projectile on every shot — double the lead downrange.',
    branch: 'arsenal',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.projectileCount += 1;
    },
  },
  {
    id: 'orbital-lease',
    name: 'Orbital Lease',
    description: 'KEYSTONE: every shot detonates on impact — trade precision for area.',
    branch: 'command',
    rarity: 'legendary',
    cost: 380,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.blastRadius += 2.2;
      mods.blastDamageMult = Math.max(mods.blastDamageMult, 0.6); // keystone splash actually bites
    },
  },
  {
    id: 'war-profiteering',
    name: 'War Profiteering',
    description: 'KEYSTONE: +1 projectile AND +1 pierce — the swarm is just inventory now.',
    branch: 'arsenal',
    rarity: 'legendary',
    cost: 440,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.projectileCount += 1;
      mods.pierce += 1;
    },
  },

  // ══ COMMAND (violet) — drones, orbital ordnance, automated firepower ═════════
  {
    id: 'hunter-protocol',
    name: 'Hunter Protocol',
    description: 'Start each run with +1 companion drone per level.',
    branch: 'command',
    rarity: 'rare',
    cost: 200,
    maxLevel: 2,
    apply: (p, level) => {
      p.droneCount += level;
    },
  },
  {
    id: 'drone-overclock',
    name: 'Drone Overclock',
    description: 'AMPLIFY: +35% drone damage per level — your swarm actually bites.',
    branch: 'command',
    rarity: 'rare',
    cost: 170,
    maxLevel: 2,
    apply: (p, level) => {
      p.droneDamageMult += 0.35 * level;
    },
  },
  {
    id: 'targeting-uplink',
    name: 'Targeting Uplink',
    description: 'AMPLIFY: +1 luck and +25% drone damage — better contracts, sharper drones.',
    branch: 'command',
    rarity: 'rare',
    cost: 190,
    maxLevel: 1,
    apply: (p) => {
      p.luck += 1;
      p.droneDamageMult += 0.25;
    },
  },
  {
    id: 'grey-goo-license',
    name: 'Grey Goo License',
    description: 'KEYSTONE: +2 drones and +60% drone damage — a self-running kill machine.',
    branch: 'command',
    rarity: 'legendary',
    cost: 400,
    maxLevel: 1,
    apply: (p) => {
      p.droneCount += 2;
      p.droneDamageMult += 0.6;
    },
  },

  // ══ ARENA (amber) — Glory economy, sponsors, crowd favor ═════════════════════
  {
    id: 'vendor-contacts',
    name: 'Vendor Contacts',
    description: '+6% pickup radius and +6% magnet per level — never miss a payout.',
    branch: 'arena',
    rarity: 'common',
    cost: 80,
    maxLevel: 4,
    apply: (p, level) => {
      p.pickupRadius *= 1 + 0.06 * level;
      p.magnetRadius *= 1 + 0.06 * level;
    },
  },
  {
    id: 'sponsorship-deal',
    name: 'Sponsorship Deal',
    description: 'ECONOMY: +12% Martian Glory earned from every run, per level.',
    branch: 'arena',
    rarity: 'rare',
    cost: 200,
    maxLevel: 3,
    apply: (p, level) => {
      p.gloryMult += 0.12 * level;
    },
  },
  {
    id: 'crowd-pleaser',
    name: 'Crowd-Pleaser',
    description: 'AMPLIFY: +2 luck — the crowd loves a rare contract.',
    branch: 'arena',
    rarity: 'rare',
    cost: 150,
    maxLevel: 2,
    apply: (p, level) => {
      p.luck += 2 * level;
    },
  },
  {
    id: 'high-roller',
    name: 'High Roller',
    description: 'RULE: +50% Glory earned, but you start every run with 25% less health.',
    branch: 'arena',
    rarity: 'legendary',
    cost: 340,
    maxLevel: 1,
    apply: (p) => {
      p.gloryMult += 0.5;
      p.maxHealth = Math.max(1, Math.round(p.maxHealth * 0.75));
      p.health = Math.min(p.health, p.maxHealth);
    },
  },

  // ══ INFAMY (bleed red) — rule-breaking risk: glass power, blood economy ═══════
  {
    id: 'berserk-doctrine',
    name: 'Berserk Doctrine',
    description: 'RULE: the lower your health, the harder you hit — up to +50% at death’s door.',
    branch: 'infamy',
    rarity: 'rare',
    cost: 190,
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      // Scales smoothly from +0% (full) to +50% (near death).
      effects.addConditional((c) => ({ damageMult: 1 + 0.5 * (1 - c.hpFrac) }));
    },
  },
  {
    id: 'overdrive-coils',
    name: 'Overdrive Coils',
    description: 'RULE: +80% crit damage, but recoil kicks 40% harder — ride the kick.',
    branch: 'infamy',
    rarity: 'rare',
    cost: 200,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.critDamageMult += 0.8;
      mods.recoilMult += 0.4;
    },
  },
  {
    id: 'blood-tax',
    name: 'Blood Tax',
    description: 'ECONOMY: +30% Glory earned, paid for with 30 starting max health.',
    branch: 'infamy',
    rarity: 'rare',
    cost: 180,
    maxLevel: 1,
    apply: (p) => {
      p.gloryMult += 0.3;
      p.maxHealth = Math.max(1, p.maxHealth - 30);
      p.health = Math.min(p.health, p.maxHealth);
    },
  },
  {
    id: 'glass-protocol',
    name: 'Glass Protocol',
    description: 'KEYSTONE: +60% damage, but your max health is HALVED. Win fast or die faster.',
    branch: 'infamy',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (p, _level, mods) => {
      mods.damageMult += 0.6;
      p.maxHealth = Math.max(1, Math.round(p.maxHealth * 0.5));
      p.health = Math.min(p.health, p.maxHealth);
    },
  },
  {
    id: 'the-house-always-wins',
    name: 'The House Always Wins',
    description: 'KEYSTONE: +40% Glory and +2 luck — notoriety compounds into fortune.',
    branch: 'infamy',
    rarity: 'legendary',
    cost: 420,
    maxLevel: 1,
    apply: (p) => {
      p.gloryMult += 0.4;
      p.luck += 2;
    },
  },
];

export function permanentById(id: string): PermanentUpgrade | undefined {
  return PERMANENT_UPGRADES.find((u) => u.id === id);
}
