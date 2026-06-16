// In-run boss rewards (T43, V22). A boss kill is the progression hinge: it grants
// ONE major power jump chosen from three, then the run continues (harder). Reward
// kinds: weapon evolution / system expansion / character mutation / boss artifact
// (power + drawback). Data-driven; each reward mutates the run via the same
// surfaces upgrades use (mods / player / effects / weapon system).

import type { Player } from './player';
import type { RunMods } from './progression/mods';
import type { BuildEffects } from './progression/effects';
import type { WeaponSystem } from './combat/weapon-system';
import type { Rng } from '../core/rng';
import { EVOLUTIONS } from '../content/weapons/evolutions';

export type BossRewardKind = 'evolution' | 'system' | 'mutation' | 'artifact';

export interface RewardCtx {
  player: Player;
  mods: RunMods;
  effects: BuildEffects;
  weapons: WeaponSystem;
}

export interface BossReward {
  id: string;
  name: string;
  description: string;
  kind: BossRewardKind;
  /** Only offered when this returns true (e.g. evolution needs an eligible weapon). */
  available?: (c: RewardCtx) => boolean;
  apply: (c: RewardCtx) => void;
}

export const BOSS_REWARDS: readonly BossReward[] = [
  {
    id: 'field-evolution',
    name: 'Field Evolution',
    description: 'Evolve your current weapon into its advanced form.',
    kind: 'evolution',
    available: (c) => EVOLUTIONS.some((e) => e.baseId === c.weapons.primaryId),
    apply: (c) => {
      const e = EVOLUTIONS.find((ev) => ev.baseId === c.weapons.primaryId);
      if (e) c.weapons.setPrimary(e.evolved);
    },
  },
  {
    id: 'reactor-heart',
    name: 'Phobos Reactor Heart',
    description: '+40% damage, but −12% move speed.',
    kind: 'artifact',
    apply: (c) => {
      c.mods.damageMult += 0.4;
      c.player.stats.moveSpeed *= 0.88;
    },
  },
  {
    id: 'munitions-bay',
    name: 'Munitions Bay',
    description: '+1 projectile per shot.',
    kind: 'system',
    apply: (c) => {
      c.mods.projectileCount += 1;
    },
  },
  {
    id: 'overclocked-servos',
    name: 'Overclocked Servos',
    description: '+1 sprint charge.',
    kind: 'system',
    apply: (c) => {
      c.player.stats.sprintCharges += 1;
      c.player.sprint.maxCharges += 1;
      c.player.sprint.charges += 1;
    },
  },
  {
    id: 'volatile-crits',
    name: 'Volatile Crits',
    description: 'Critical hits detonate a small blast.',
    kind: 'mutation',
    apply: (c) => {
      c.effects.on('crit', (t) => {
        t.dealArea(t.x, t.z, 2.5, 12);
      });
    },
  },
  {
    id: 'adrenal-surge',
    name: 'Adrenal Surge',
    description: '+25% fire rate and +15% move speed.',
    kind: 'mutation',
    apply: (c) => {
      c.mods.fireRateMult += 0.25;
      c.player.stats.moveSpeed *= 1.15;
    },
  },
];

/** Roll up to three distinct available rewards (seed-deterministic, V16). */
export function rollBossRewards(c: RewardCtx, rng: Rng): BossReward[] {
  const pool = BOSS_REWARDS.filter((r) => !r.available || r.available(c));
  for (let i = 0; i < pool.length; i++) {
    const j = i + rng.int(0, pool.length - 1 - i);
    const t = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = t;
  }
  return pool.slice(0, Math.min(3, pool.length));
}
