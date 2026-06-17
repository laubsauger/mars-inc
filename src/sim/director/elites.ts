// Elite promotion + the baseline shield ladder (T-elite). Difficulty should escalate
// in KIND, not just count: as the run deepens, ordinary fodder starts arriving with
// shields (cheap tiers first, then up the ladder), and a small slice gets promoted
// to ELITES — beefier, harder-hitting, multi-shield, visibly bigger. Both decisions
// are made ONCE per spawn (the `evaluated` flag) and are deterministic via the run
// rng (V16). Kept out of wave-director.ts so the spawn-composition / HP-scaling work
// stays independent of the elite layer.

import type { EnemyPool } from '../enemies';
import { ENEMY_BY_VARIANT, BOSS_GATEKEEPER } from '../enemies';
import type { Rng } from '../../core/rng';

const ELITE_HP_MULT = 3.0; // an elite soaks ~3× a normal of its kind
const ELITE_CONTACT_MULT = 1.6; // and hits noticeably harder on touch
const ELITE_SHIELD = 2; // elites carry two absorb charges
const ELITE_CHANCE_CAP = 0.12; // never more than ~1-in-8 fodder is elite
const FODDER_THREAT = 8; // only cheap fodder (≤ this threat) can become elite

/** Run progress in "power tiers" — mirrors the director's level+boss clock without
 *  importing it (keeps this module independent). Each level = 1, each boss = 5. */
export function eliteProgress(level: number, bossKills: number): number {
  return Math.max(0, level - 1) + Math.max(0, bossKills) * 5;
}

/** Chance a freshly-spawned fodder unit is promoted to an elite — none early, then
 *  climbs with progress to a hard cap. */
function eliteChance(progress: number): number {
  return Math.min(ELITE_CHANCE_CAP, Math.max(0, progress - 4) * 0.012);
}

/** Baseline shield charges EVERY spawn of a given enemy gets for free at this
 *  progress — the "rust mites get shields, then tier-2 units, then…" ladder. Cheap
 *  (low-threat) variants gain their baseline shield first; tougher ones only deeper
 *  in, as the ladder's reach climbs ~one threat-step per power tier. */
function baselineShield(progress: number, threat: number): number {
  return threat <= (progress / 5) * 6 ? 1 : 0;
}

/** Apply baseline shields + roll elites over freshly-spawned, not-yet-evaluated
 *  enemies. Call once per step after the director has spawned. */
export function promoteSpawns(pool: EnemyPool, progress: number, rng: Rng): void {
  const ec = eliteChance(progress);
  for (let i = 0; i < pool.count; i++) {
    if (pool.evaluated[i]) continue;
    pool.evaluated[i] = 1;
    const variant = pool.variant[i]!;
    if (variant === BOSS_GATEKEEPER.variant) continue; // bosses are never touched
    const type = ENEMY_BY_VARIANT[variant];
    if (!type) continue;
    // Units with their OWN shield identity (e.g. the Lance Sentinel) keep it — the
    // ladder/elite layer only escalates ordinary enemies.
    if (type.shield) continue;
    // Baseline shield ladder — every qualifying spawn at this progress.
    const base = baselineShield(progress, type.threat);
    if (base > pool.shield[i]!) pool.shield[i] = base;
    // Elite roll — fodder only, so specials/ranged stay their distinct selves.
    if (type.threat <= FODDER_THREAT && rng.next() < ec) {
      pool.promote(i, ELITE_HP_MULT, ELITE_CONTACT_MULT, Math.max(pool.shield[i]!, ELITE_SHIELD));
    }
  }
}
