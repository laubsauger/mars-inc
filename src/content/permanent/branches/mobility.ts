// Permanent (meta) upgrades — MOBILITY branch. Data only; `apply` mutates the
// fresh-run player / mod layer / build engine. Split from index.ts by branch so
// content authors edit one branch without touching the others.

import type { PermanentUpgrade } from '../index';

export const MOBILITY_PERMANENTS: PermanentUpgrade[] = [
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
  {
    id: 'thrust-vectoring',
    name: 'Thrust Vectoring',
    description: '+6% acceleration and +3% move speed per level.',
    branch: 'mobility',
    rarity: 'rare',
    cost: 130,
    maxLevel: 3,
    apply: (p, level) => {
      p.stats.acceleration *= 1 + 0.06 * level;
      p.stats.moveSpeed *= 1 + 0.03 * level;
    },
  },
  {
    id: 'slipstream',
    name: 'Slipstream',
    description: 'RULE: while a shot’s recoil is still carrying you, you deal +20% damage.',
    branch: 'mobility',
    rarity: 'rare',
    cost: 160,
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      effects.addConditional((c) => (c.recoilActive ? { damageMult: 1.2 } : {}));
    },
  },
  {
    id: 'overland-engine',
    name: 'Overland Engine',
    description: 'KEYSTONE: +1 sprint charge, +12% move speed, and a heavier dash shockwave.',
    branch: 'mobility',
    rarity: 'legendary',
    cost: 400,
    maxLevel: 1,
    apply: (p) => {
      p.stats.sprintCharges += 1;
      p.sprint.maxCharges += 1;
      p.sprint.charges += 1;
      p.stats.moveSpeed *= 1.12;
      p.dashShockForce += 12;
      p.dashShockRadius = Math.max(p.dashShockRadius, 4);
    },
  },
  {
    id: 'vacuum-charge',
    name: 'Vacuum Charge',
    description:
      'KEYSTONE: grenades IMPLODE — they suck the horde into a tight knot (then it burns).',
    branch: 'mobility',
    rarity: 'legendary',
    cost: 360,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.grenadePull = true;
      mods.grenadeRadiusAdd += 1;
    },
  },
  // ── Sprint scaffolding (redesign) — tunes the BASELINE dash everyone has, rather
  //    than seeding the sprint-burst draft card's effect at run start. ──
  {
    id: 'kinetic-reserves',
    name: 'Kinetic Reserves',
    description: '+1 sprint charge and +10% sprint duration per level.',
    branch: 'mobility',
    rarity: 'rare',
    cost: 200,
    maxLevel: 2,
    apply: (p, level) => {
      p.stats.sprintCharges += level;
      p.sprint.maxCharges += level;
      p.sprint.charges += level;
      p.stats.sprintDuration *= 1 + 0.1 * level;
    },
  },
  {
    id: 'slipstream-protocol',
    name: 'Slipstream Protocol',
    description: '+12% damage per level while recoil is still carrying you — fight on the move.',
    branch: 'mobility',
    rarity: 'rare',
    cost: 180,
    maxLevel: 2,
    apply: (_p, level, _mods, effects) => {
      const mult = 1 + 0.12 * level;
      effects.addConditional((c) => (c.recoilActive ? { damageMult: mult } : {}));
    },
  },
];
