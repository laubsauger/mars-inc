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
    cost: 480, // a run-defining rule-break — priced as a real legendary, not a rare
    maxLevel: 1,
    // GATED: the glass-cannon rule-breaks are an earned power fantasy — clear Act 1 first.
    gate: { unlock: 'act:rust-crown', requirement: 'Defeat the Gatekeeper (Act 1)' },
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
    cost: 460,
    maxLevel: 1,
    gate: { unlock: 'act:rust-crown', requirement: 'Defeat the Gatekeeper (Act 1)' },
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
    cost: 620, // revive + low-HP scaling = the apex of the risk lane; the deepest sink here
    maxLevel: 1,
    // GATED: a second revive in the meta — earned by reaching Act 2 (the Magma Notary).
    gate: { unlock: 'tree:biology-magma', requirement: 'Defeat the Magma Notary (Act 2)' },
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
  // ── Marquee glass keystone (Batch 2) — the priciest crazy thing in the tree ──
  {
    id: 'glass-reactor',
    name: 'Glass Reactor',
    description:
      'KEYSTONE: −35 max health, but the lower your health the harder you hit — up to +70%.',
    branch: 'infamy',
    rarity: 'legendary',
    cost: 520, // a run-defining gamble → one of the steepest nodes in the tree
    maxLevel: 1,
    gate: { unlock: 'act:rust-crown', requirement: 'Defeat the Gatekeeper (Act 1)' },
    apply: (p, _level, _mods, effects) => {
      p.maxHealth = Math.max(1, p.maxHealth - 35);
      p.health = Math.min(p.health, p.maxHealth);
      effects.addConditional((c) => ({ damageMult: 1 + (1 - c.hpFrac) * 0.7 }));
    },
  },
  {
    id: 'killer-instinct',
    name: 'Killer Instinct',
    description:
      'KEYSTONE: +20% fire rate and +12% damage for 1.5s after a critical hit, plus +4% base crit chance.',
    branch: 'infamy',
    rarity: 'legendary',
    cost: 500, // marquee crit-momentum keystone — seeds the frenzy loop from run start
    maxLevel: 1,
    apply: (_p, _level, mods, effects) => {
      mods.critChanceAdd += 0.04; // a little base crit so the loop can ignite
      effects.addConditional((c) => (c.recentCrit ? { fireRateMult: 1.2, damageMult: 1.12 } : {}));
    },
  },
  // ── RULE-BREAKER keystones (Infamy = bend the rules; opposing tradeoffs that force
  //    a real commitment — you can't have the all-defense AND the all-offense build). ──
  {
    id: 'berserkers-pact',
    name: "Berserker's Pact",
    description: 'KEYSTONE: +40% damage dealt — but you take +25% damage too. Pure aggression.',
    branch: 'infamy',
    rarity: 'legendary',
    cost: 480,
    maxLevel: 1,
    apply: (p, _level, mods) => {
      mods.damageMult += 0.4;
      p.damageTakenMult += 0.25; // the opposing pick to the Biology tank keystones
    },
  },
  {
    id: 'blood-money',
    name: 'Blood Money',
    description: 'CURSE: +30% Glory earned and +2 luck, but start each run with 15% less health.',
    branch: 'infamy',
    rarity: 'rare',
    cost: 180,
    maxLevel: 2,
    apply: (p, level) => {
      p.gloryMult += 0.3 * level;
      p.luck += 2 * level;
      const cut = Math.round(p.maxHealth * 0.15 * level);
      p.maxHealth = Math.max(1, p.maxHealth - cut);
      p.health = Math.min(p.health, p.maxHealth);
    },
  },
  // ── Creative addition: spite/thorns rule-breaker ────────────────────────────
  {
    id: 'spite-engine',
    name: 'Spite Engine',
    description:
      'KEYSTONE: getting HIT detonates a retaliation blast — 1.5× the damage you took, dumped on everything within 5m. Make them pay for the bite.',
    branch: 'infamy',
    rarity: 'legendary',
    cost: 460,
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      // `hurt` fires the step the player took damage; magnitude = damage taken (V3).
      effects.on('hurt', (c) => {
        if (c.magnitude > 0) c.dealArea(c.x, c.z, 5, c.magnitude * 1.5);
        c.fx.push('impact', c.x, c.z);
      });
    },
  },
];
