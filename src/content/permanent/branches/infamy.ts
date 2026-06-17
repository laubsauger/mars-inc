// Permanent (meta) upgrades — INFAMY branch. Data only; `apply` mutates the
// fresh-run player / mod layer / build engine. Split from index.ts by branch so
// content authors edit one branch without touching the others.

import type { PermanentUpgrade } from '../index';

export const INFAMY_PERMANENTS: PermanentUpgrade[] = [
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
  {
    id: 'martyrdom',
    name: 'Martyrdom',
    description: 'RULE: while below 40% health you fire 30% faster — go down swinging.',
    branch: 'infamy',
    rarity: 'rare',
    cost: 160,
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      effects.addConditional((c) => (c.hpFrac < 0.4 ? { fireRateMult: 1.3 } : {}));
    },
  },
  {
    id: 'notorious',
    name: 'Notorious',
    description: '+15% Glory earned and +10% damage — fame has its perks.',
    branch: 'infamy',
    rarity: 'rare',
    cost: 170,
    maxLevel: 1,
    apply: (p, _level, mods) => {
      p.gloryMult += 0.15;
      mods.damageMult += 0.1;
    },
  },
  {
    id: 'pact-of-ruin',
    name: 'Pact of Ruin',
    description: 'KEYSTONE: +50% damage and +50% crit damage, paid with 40 max health.',
    branch: 'infamy',
    rarity: 'legendary',
    cost: 400,
    maxLevel: 1,
    apply: (p, _level, mods) => {
      mods.damageMult += 0.5;
      mods.critDamageMult += 0.5;
      p.maxHealth = Math.max(1, p.maxHealth - 40);
      p.health = Math.min(p.health, p.maxHealth);
    },
  },
  {
    id: 'apex-predator',
    name: 'Apex Predator',
    description:
      'KEYSTONE: damage scales up to +80% as your health drops, AND you cheat death once.',
    branch: 'infamy',
    rarity: 'legendary',
    cost: 480,
    maxLevel: 1,
    apply: (p, _level, _mods, effects) => {
      p.reviveCharges += 1;
      effects.addConditional((c) => ({ damageMult: 1 + 0.8 * (1 - c.hpFrac) }));
    },
  },
  {
    id: 'daisy-cutter',
    name: 'Daisy Cutter',
    description: 'KEYSTONE: a huge fiery blast — +2.5 radius, +50% damage, and Molotov burn.',
    branch: 'infamy',
    rarity: 'legendary',
    cost: 400,
    maxLevel: 1,
    apply: (_p, _level, mods) => {
      mods.grenadeRadiusAdd += 2.5;
      mods.grenadeDamageMult += 0.5;
      mods.grenadeMolotov = true;
    },
  },
];
