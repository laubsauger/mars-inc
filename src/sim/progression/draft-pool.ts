// The run's full upgrade draft pool — base catalog plus every build-family content
// set, composed in one place. Split out of world.ts so content authors can add a
// family here without touching the sim orchestrator. The dev control board reads
// DEV_UPGRADE_CATALOG (flat read-only metadata, ⊥ the live defs).

import { type UpgradeDefinition } from './upgrades';
import { defaultMods } from './mods';
import { BuildEffects } from './effects';
import { createPlayer } from '../player';
import { UPGRADES } from '../../content/upgrades/index';
import { ADVANCED_UPGRADES } from '../../content/upgrades/advanced';
import { REACTION_UPGRADES } from '../../content/upgrades/reactions';
import { RECOIL_UPGRADES } from '../../content/upgrades/recoil';
import { CORPSE_UPGRADES } from '../../content/upgrades/corpse';
import { XP_RESOURCE_UPGRADES } from '../../content/upgrades/xp-resource';
import { SYNERGY_UPGRADES } from '../../content/upgrades/synergy';
import { NECRO_UPGRADES } from '../../content/upgrades/necro';
import { DIRECTION_UPGRADES } from '../../content/upgrades/directions';
import { SPICE_UPGRADES } from '../../content/upgrades/spice';
import { MECHANICS_UPGRADES } from '../../content/upgrades/mechanics';
import { MOMENTUM_UPGRADES } from '../../content/upgrades/momentum';
import { SYNERGY_UPGRADES as SYNERGY_FEEL_UPGRADES } from '../../content/upgrades/synergies';
import { ECONOMY_UPGRADES } from '../../content/upgrades/economy';
import { WILDCARD_UPGRADES } from '../../content/upgrades/wildcards';

/** Full draft pool: base catalog (T18/T33/T40) + engine-showcase set (T38) +
 *  status-reaction primers/converters (T54) + recoil build family (T55). */
export const DRAFT_POOL: UpgradeDefinition[] = [
  ...UPGRADES,
  ...ADVANCED_UPGRADES,
  ...REACTION_UPGRADES,
  ...RECOIL_UPGRADES,
  ...CORPSE_UPGRADES,
  ...XP_RESOURCE_UPGRADES,
  ...SYNERGY_UPGRADES,
  ...NECRO_UPGRADES,
  ...DIRECTION_UPGRADES,
  ...SPICE_UPGRADES,
  ...MECHANICS_UPGRADES,
  ...MOMENTUM_UPGRADES,
  ...SYNERGY_FEEL_UPGRADES,
  ...ECONOMY_UPGRADES,
  ...WILDCARD_UPGRADES,
];

// A plain STAT-FILLER changes ONLY these scalar knobs (and nothing else). Everything
// outside this allowlist — projectile routing, AoE, status priming, grenade rework,
// orbitals/drones/nova, corpse/xp economies, reactions — is a real MECHANIC. We
// classify by ALLOWLIST (not by listing mechanics) so a card touching ANY unknown
// field is treated as interesting, never damped (under-damp > over-damp for variety).
const BORING_MOD_KEYS = new Set<string>([
  'damageMult',
  'fireRateMult',
  'critChanceAdd',
  'critDamageMult',
  'rangeMult',
  'recoilMult',
]);
// Boring player/stat fields a flat defense/mobility tune touches. Any OTHER player
// field changing (orbitCount, droneCount, novaDamage, corpse/xp economy flags, …)
// marks the card mechanical.
const BORING_PLAYER_KEYS = new Set<string>(['health', 'maxHealth', 'magnetRadius', 'luck']);

/** Flatten the numeric/boolean leaves of a value one level deep (player + player.stats)
 *  so we can diff what an `apply` actually changed. Nested vectors (pos) are skipped. */
function flatLeaves(obj: Record<string, unknown>, prefix: string, out: Map<string, unknown>): void {
  for (const k in obj) {
    const v = obj[k];
    if (typeof v === 'number' || typeof v === 'boolean') out.set(`${prefix}${k}`, v);
  }
}
function snapshot(player: Record<string, unknown>, mods: object): Map<string, unknown> {
  const out = new Map<string, unknown>();
  flatLeaves(mods as Record<string, unknown>, 'mods.', out);
  flatLeaves(player, 'player.', out);
  const stats = player['stats'];
  if (stats && typeof stats === 'object')
    flatLeaves(stats as Record<string, unknown>, 'stats.', out);
  return out;
}
function isBoringKey(key: string): boolean {
  if (key.startsWith('mods.')) return BORING_MOD_KEYS.has(key.slice(5));
  if (key.startsWith('player.')) return BORING_PLAYER_KEYS.has(key.slice(7));
  if (key.startsWith('stats.')) return true; // all movement/sprint stat tunes are "boring"
  return false;
}

/** Ids classified as PLAIN STAT-FILLERS: a sandbox `apply` that registered NO dynamic
 *  effect (conditional/trigger/reaction) AND changed ONLY boring scalar knobs. Computed
 *  once at load — apply is pure given a throwaway player/mods/effects (trigger bodies
 *  don't run until fired). The draft damps these at common/uncommon so early hands stop
 *  being three near-identical "+10%" tunes; mechanical cards surface in their place. */
export const STAT_FILLER_IDS: ReadonlySet<string> = (() => {
  const ids = new Set<string>();
  for (const def of DRAFT_POOL) {
    const player = createPlayer();
    const mods = defaultMods();
    const effects = new BuildEffects();
    const before = snapshot(player as unknown as Record<string, unknown>, mods);
    try {
      def.apply({ player, mods, effects });
    } catch {
      continue; // needs more than the sandbox ctx → not a plain filler
    }
    if (effects.size > 0) continue; // conditional/trigger/reaction → mechanical
    const after = snapshot(player as unknown as Record<string, unknown>, mods);
    let changedAny = false;
    let onlyBoring = true;
    for (const [k, v] of after) {
      if (before.get(k) === v) continue;
      changedAny = true;
      if (!isBoringKey(k)) {
        onlyBoring = false;
        break;
      }
    }
    if (changedAny && onlyBoring) ids.add(def.id);
  }
  return ids;
})();

/** Flat upgrade list for the dev control board (T74): exactly the ids the run can
 *  grant (DRAFT_POOL), with display data. ⊥ the live defs — read-only metadata. */
export const DEV_UPGRADE_CATALOG: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  rarity: string;
  maxLevel: number;
  tags: readonly string[];
}> = DRAFT_POOL.map((u) => ({
  id: u.id,
  name: u.name,
  description: u.description, // feeds the dev card tooltip (single source ⊥ duplication)
  rarity: u.rarity,
  maxLevel: u.maxLevel,
  tags: u.tags,
}));
