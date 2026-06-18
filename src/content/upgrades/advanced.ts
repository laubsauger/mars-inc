// Engine-showcase upgrades (T38). These prove the conditional + trigger engine
// produces real build directions; the full catalog across 6 rarities is T40.
// Kept in a separate registry from the base set so content (T33/T40) and the
// engine (T38) evolve without stepping on each other.

import type { UpgradeDefinition } from '../../sim/progression/upgrades';

/** Point-Blank Clause: the nearest-enemy distance (m) under which the bonus applies.
 *  Shared by the conditional + the floor-ring visual so they never drift apart. */
const POINT_BLANK_RANGE = 8; // was 5 — too tight to the body to ever matter at this camera

export const ADVANCED_UPGRADES: UpgradeDefinition[] = [
  // CONDITIONAL — risk build: huge damage while near death (corrupted curse vibe).
  {
    id: 'last-contract',
    name: 'Last Contract',
    description: '+60% damage while below 35% health.',
    tags: ['risk', 'damage'],
    rarity: 'corrupted',
    maxLevel: 1,
    baseWeight: 3,
    synergyWeight: 2,
    apply: ({ effects }) =>
      effects.addConditional((c) => (c.hpFrac < 0.35 ? { damageMult: 1.6 } : {})),
  },
  // CONDITIONAL — brawler build: reward fighting up close (the risk lane,
  // opposite of the kiting-reward Restraining Order). Auto-fire means uptime is
  // your positioning, not a trigger.
  {
    id: 'point-blank-clause',
    name: 'Point-Blank Clause',
    description: '+50% damage while the nearest enemy is within 8m (the red ring on the floor).',
    tags: ['conditional', 'damage', 'risk'],
    rarity: 'rare',
    maxLevel: 2,
    baseWeight: 4,
    synergyWeight: 2,
    apply: ({ effects, player }) => {
      player.pointBlankRange = POINT_BLANK_RANGE; // drives the floor-ring visual
      effects.addConditional((c) => (c.nearestDist < POINT_BLANK_RANGE ? { damageMult: 1.5 } : {}));
    },
  },
  // CONDITIONAL — crowd build: crit harder against swarms.
  {
    id: 'crowd-clause',
    name: 'Crowd Control Clause',
    description:
      'The more they swarm you, the deadlier: +4% crit per nearby enemy (within 10m), up to +24%.',
    tags: ['crit', 'crowd'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    // Ramps from the FIRST nearby enemy instead of a hard 8+ wall — useful in a
    // modest cluster, scaling toward the cap in a real swarm (the old threshold was
    // near-impossible to hit at 7m). Reads off the widened LOCAL_CROWD_RADIUS.
    apply: ({ effects }) =>
      effects.addConditional((c) => ({ critAdd: Math.min(0.24, c.enemiesNearby * 0.04) })),
  },
  // TRIGGER — on-kill shockwave (executioner / explosive direction).
  {
    id: 'severance-package',
    name: 'Severance Package',
    description: 'Kills detonate a small shockwave (5 dmg, 2.4m).',
    tags: ['explosive', 'overkill'],
    rarity: 'rare',
    maxLevel: 3,
    baseWeight: 4,
    synergyWeight: 2,
    apply: ({ effects }) =>
      effects.on('kill', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 2.4, 5);
        ctx.fx.push('impact', ctx.x, ctx.z);
      }),
  },
  // STATUS — on-hit burn (DoT direction, T39).
  {
    id: 'incendiary-rounds',
    name: 'Incendiary Rounds',
    description: 'Hits set enemies on fire — Burn deals 90% of the hit as damage over 3s.',
    tags: ['burn', 'status'],
    rarity: 'uncommon',
    maxLevel: 3,
    baseWeight: 5,
    synergyWeight: 2,
    previewStats: () => [{ label: 'Burn on hit', from: '—', to: '90% of hit over 3s' }],
    // DoT scales with the hit (T70, V33): dps = 0.9 × hitDamage / 3s.
    apply: ({ effects }) =>
      effects.on('hit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'burn', { duration: 3, dotCoef: 0.9 }),
      ),
  },
  // STATUS — on-hit chill (control direction, T39).
  {
    id: 'cryo-rounds',
    name: 'Cryo Rounds',
    description: 'Hits Chill enemies — 40% movement slow for 2s.',
    tags: ['chill', 'status', 'control'],
    rarity: 'uncommon',
    maxLevel: 2,
    baseWeight: 5,
    synergyWeight: 2,
    previewStats: () => [{ label: 'Chill on hit', from: '—', to: '40% slow, 2s' }],
    apply: ({ effects }) =>
      effects.on('hit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'chill', { duration: 2, slowMult: 0.6 }),
      ),
  },
  // STATUS — on-crit mark amplifies subsequent DoT (crit+status synergy, T39).
  {
    id: 'focusing-optics',
    name: 'Focusing Optics',
    description: 'Critical hits mark enemies: +50% status damage for 4s.',
    tags: ['mark', 'crit', 'status'],
    rarity: 'rare',
    maxLevel: 1,
    baseWeight: 4,
    synergyWeight: 3,
    apply: ({ effects }) =>
      effects.on('crit', (ctx) =>
        ctx.applyStatus(ctx.targetIndex, 'mark', { duration: 4, amplify: 1.5 }),
      ),
  },
  // TRIGGER (legendary capstone) — overkill erupts a damaging nova.
  {
    id: 'hostile-takeover',
    name: 'Hostile Takeover',
    description: 'Overkilling an enemy erupts a damaging nova (4.5m).',
    tags: ['overkill', 'explosive'],
    rarity: 'legendary',
    maxLevel: 1,
    baseWeight: 2,
    synergyWeight: 3,
    apply: ({ effects }) =>
      effects.on('overkill', (ctx) => {
        ctx.dealArea(ctx.x, ctx.z, 4.5, 8 + ctx.magnitude * 0.5);
        ctx.fx.push('death', ctx.x, ctx.z, 0, 0, ctx.variant);
      }),
  },
];
