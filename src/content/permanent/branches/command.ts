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
  // CENTER node (cheapest → sits at the hub). Deliberately NOT drone-damage: amping
  // a drone you don't own yet reads wrong as the first Command pick. This opener is
  // pure called-ordnance (grenade) utility, useful from the first run with zero drones.
  {
    id: 'munitions-prep',
    name: 'Munitions Prep',
    description: 'ORDNANCE: +10% grenade damage and +0.3 blast radius per level.',
    branch: 'command',
    rarity: 'common',
    cost: 60,
    maxLevel: 3,
    apply: (_p, level, mods) => {
      mods.grenadeDamageMult += 0.1 * level;
      mods.grenadeRadiusAdd += 0.3 * level;
    },
  },
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
    description:
      'KEYSTONE: +60% blast damage AND explosive/AoE cards are offered ×2 more often — the run brings the boom, this magnifies it.',
    branch: 'command',
    rarity: 'legendary',
    cost: 380,
    maxLevel: 1,
    apply: (p, _level, mods) => {
      mods.blastDamageMult = Math.min(1.2, mods.blastDamageMult + 0.6); // amplify (needs drafted AoE)
      for (const t of ['explosive', 'aoe']) p.draftTagBias[t] = (p.draftTagBias[t] ?? 1) * 2;
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
  // ── ORDNANCE lane (Batch 2) — Command isn't only drones: it's called firepower.
  //    Trigger-driven strikes that don't need a drone body, so Command has a second
  //    identity (automated artillery) instead of nine flavours of +drone-damage. ──
  // ── AMPLIFIERS / META (redesign) — these BUFF firepower you bring, they don't hand
  //    you a draft card's on-kill strike at run start. A drone/grenade build pays off;
  //    nothing happens until you actually field the ordnance. ──
  {
    id: 'fire-control-array',
    name: 'Fire-Control Array',
    description: 'AMPLIFY: +18% drone damage and +18% grenade damage per level.',
    branch: 'command',
    rarity: 'rare',
    cost: 200,
    maxLevel: 2,
    apply: (p, level, mods) => {
      p.droneDamageMult += 0.18 * level;
      mods.grenadeDamageMult += 0.18 * level;
    },
  },
  {
    id: 'logistics-network',
    name: 'Logistics Network',
    description: 'AMPLIFY: −14% grenade cooldown and +15% drone damage per level.',
    branch: 'command',
    rarity: 'rare',
    cost: 240,
    maxLevel: 2,
    apply: (p, level, mods) => {
      mods.grenadeCdMult *= Math.pow(0.86, level);
      p.droneDamageMult += 0.15 * level;
    },
  },
  {
    id: 'war-room',
    name: 'War Room',
    description: 'KEYSTONE: +40% drone damage and +1 draft reroll every run.',
    branch: 'command',
    rarity: 'legendary',
    cost: 560, // marquee Command keystone — firepower amp + a permanent draft edge
    maxLevel: 1,
    apply: (p) => {
      p.droneDamageMult += 0.4;
      p.bonusRerolls += 1; // a reroll, not an extra card on screen
    },
  },
];
