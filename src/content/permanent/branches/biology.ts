// Permanent (meta) upgrades — BIOLOGY branch. Data only; `apply` mutates the
// fresh-run player / mod layer / build engine. Split from index.ts by branch so
// content authors edit one branch without touching the others.

import type { PermanentUpgrade } from '../index';

export const BIOLOGY_PERMANENTS: PermanentUpgrade[] = [
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
    // A from-start shield is one of the strongest defensive picks → priced as a deep,
    // late-game grind (×3.4 legendary mult → ~1240 Glory), not a mid-layer pickup.
    cost: 520,
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
    description:
      'KEYSTONE: +40% status (DoT) damage AND status cards are offered ×2 more often — a deep toxin specialist (the RUN supplies the poison, this sharpens it).',
    branch: 'biology',
    rarity: 'legendary',
    cost: 400,
    maxLevel: 1,
    apply: (p, _level, mods) => {
      mods.statusDamageMult += 0.4; // amplify — only bites once you draft DoT/status cards
      for (const t of ['status', 'burn', 'bleed', 'corrode', 'chill', 'shock']) {
        p.draftTagBias[t] = (p.draftTagBias[t] ?? 1) * 2;
      }
    },
  },
  {
    id: 'armor-lattice',
    name: 'Armor Lattice',
    description: '+25 max health and +10% knockback resistance per level.',
    branch: 'biology',
    rarity: 'rare',
    cost: 140,
    maxLevel: 2,
    apply: (p, level) => {
      const hp = 25 * level;
      p.maxHealth += hp;
      p.health += hp;
      p.stats.knockbackResistance += 0.1 * level;
    },
  },
  {
    id: 'juggernaut-frame',
    name: 'Juggernaut Frame',
    description: 'KEYSTONE: +120 max health and near-immunity to knockback — an immovable wall.',
    branch: 'biology',
    rarity: 'legendary',
    cost: 420,
    maxLevel: 1,
    apply: (p) => {
      p.maxHealth += 120;
      p.health += 120;
      p.stats.knockbackResistance = Math.min(0.95, p.stats.knockbackResistance + 0.5);
    },
  },
  // ── Sustain via the clear-the-room lever (Batch 2) ──────────────────────────
  {
    id: 'regen-mesh',
    name: 'Regenerative Mesh',
    description: 'Open up space (no enemy within 7m) to patch 3% of your max health per level.',
    branch: 'biology',
    rarity: 'rare',
    cost: 200,
    maxLevel: 2,
    apply: (_p, level, _mods, effects) => {
      const frac = 0.03 * level;
      effects.on('breather', (c) => {
        c.player.health = Math.min(c.player.maxHealth, c.player.health + c.player.maxHealth * frac);
      });
    },
  },
  {
    id: 'adrenal-reflex',
    name: 'Adrenal Reflex',
    description:
      'KEYSTONE: the moment you drop below 40% health, gain 1.5s of invulnerability + a panic shove (once per dip).',
    branch: 'biology',
    rarity: 'legendary',
    cost: 460,
    maxLevel: 1,
    apply: (_p, _level, _mods, effects) => {
      // Pure SURVIVAL safety-net (a Hades Death-Defiance-style passive), NOT a damage
      // nova — the shove is knockback-only (0 damage) to buy space, no offense effect.
      effects.on('lowHp', (c) => {
        c.dealArea(c.x, c.z, 5, 0); // 0 damage → just the pipeline knockback shove
        c.player.invuln = Math.max(c.player.invuln, 1.5);
        c.fx.push('impact', c.x, c.z);
      });
    },
  },
  {
    id: 'hemo-recovery',
    name: 'Hemo-Recovery',
    description: 'Kills knit you back together — heal 1.5 HP per level on each kill.',
    branch: 'biology',
    rarity: 'rare',
    cost: 210,
    maxLevel: 2,
    apply: (_p, level, _mods, effects) => {
      const heal = 1.5 * level;
      effects.on('kill', (c) => {
        c.player.health = Math.min(c.player.maxHealth, c.player.health + heal);
      });
    },
  },
];
