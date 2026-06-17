// Permanent (meta) upgrades — COMMAND branch. Data only; `apply` mutates the
// fresh-run player / mod layer / build engine. Split from index.ts by branch so
// content authors edit one branch without touching the others.
//
// Drone rebalance (T-Command): a standing drone is a SERIOUS, deep investment — you
// amplify the swarm first (cheap damage/utility tiers) and only far out does a node
// hand you an ACTUAL extra body, at a steep cost + maxLevel 1 (⊥ casual +1/+2 near
// the hub). Cost order drives tree depth, so the count nodes sit at the rim.

import type { PermanentUpgrade } from '../index';

export const COMMAND_PERMANENTS: PermanentUpgrade[] = [
  // ── Amplify / utility tiers (cheap, near the hub — no extra bodies) ──
  {
    id: 'drone-coolant',
    name: 'Drone Coolant',
    description: 'AMPLIFY: +12% drone damage per level — keep the barrels cool.',
    branch: 'command',
    rarity: 'common',
    cost: 90,
    maxLevel: 3,
    apply: (p, level) => {
      p.droneDamageMult += 0.12 * level;
    },
  },
  {
    id: 'drone-overclock',
    name: 'Drone Overclock',
    description: 'AMPLIFY: +20% drone damage per level — your swarm actually bites.',
    branch: 'command',
    rarity: 'common',
    cost: 150,
    maxLevel: 3,
    apply: (p, level) => {
      p.droneDamageMult += 0.2 * level;
    },
  },
  {
    id: 'munitions-cache',
    name: 'Munitions Cache',
    description: 'AMPLIFY: +16% drone damage per level — fuller magazines.',
    branch: 'command',
    rarity: 'common',
    cost: 160,
    maxLevel: 2,
    apply: (p, level) => {
      p.droneDamageMult += 0.16 * level;
    },
  },
  {
    id: 'targeting-uplink',
    name: 'Targeting Uplink',
    description: 'AMPLIFY: +1 luck and +20% drone damage — better contracts, sharper drones.',
    branch: 'command',
    rarity: 'rare',
    cost: 210,
    maxLevel: 1,
    apply: (p) => {
      p.luck += 1;
      p.droneDamageMult += 0.2;
    },
  },
  {
    id: 'swarm-tactics',
    name: 'Swarm Tactics',
    description: 'AMPLIFY: +30% drone damage and +1 luck.',
    branch: 'command',
    rarity: 'rare',
    cost: 230,
    maxLevel: 1,
    apply: (p) => {
      p.droneDamageMult += 0.3;
      p.luck += 1;
    },
  },
  // ── Ordnance utility (non-drone command nodes) ──
  {
    id: 'auto-loader',
    name: 'Auto-Loader',
    description: 'GRENADE: −12% cooldown and +0.3 radius per level.',
    branch: 'command',
    rarity: 'rare',
    cost: 160,
    maxLevel: 2,
    apply: (_p, level, mods) => {
      mods.grenadeCdMult *= Math.pow(0.88, level);
      mods.grenadeRadiusAdd += 0.3 * level;
    },
  },
  // ── Count nodes — DEEP + expensive, maxLevel 1. An extra body is earned. ──
  {
    id: 'hunter-protocol',
    name: 'Hunter Protocol',
    description: 'Commission your FIRST standing drone — start each run with +1 companion.',
    branch: 'command',
    rarity: 'rare',
    cost: 420, // deep + expensive: a permanent extra body is a real investment
    maxLevel: 1,
    apply: (p) => {
      p.droneCount += 1;
    },
  },
  // ── Keystones (legendary, branch tips) ──
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
    id: 'networked-munitions',
    name: 'Networked Munitions',
    description: 'KEYSTONE: drones inherit your build’s projectile mechanics + 30% damage.',
    branch: 'command',
    rarity: 'legendary',
    cost: 480,
    maxLevel: 1,
    apply: (p) => {
      p.droneInheritMods = true;
      p.droneDamageMult += 0.3;
    },
  },
  {
    id: 'grey-goo-license',
    name: 'Grey Goo License',
    description: 'KEYSTONE: +1 drone and +45% drone damage — the swarm runs itself.',
    branch: 'command',
    rarity: 'legendary',
    cost: 640, // deep count node — a private army is earned, not bought cheap
    maxLevel: 1,
    apply: (p) => {
      p.droneCount += 1;
      p.droneDamageMult += 0.45;
    },
  },
  {
    id: 'legion-protocol',
    name: 'Legion Protocol',
    description: 'KEYSTONE: +1 drone and +45% drone damage — the deepest count node.',
    branch: 'command',
    rarity: 'legendary',
    cost: 760, // the single most expensive Command node — the third (and last) body
    maxLevel: 1,
    apply: (p) => {
      p.droneCount += 1;
      p.droneDamageMult += 0.45;
    },
  },
];
