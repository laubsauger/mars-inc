// The run's full upgrade draft pool — base catalog plus every build-family content
// set, composed in one place. Split out of world.ts so content authors can add a
// family here without touching the sim orchestrator. The dev control board reads
// DEV_UPGRADE_CATALOG (flat read-only metadata, ⊥ the live defs).

import { type UpgradeDefinition } from './upgrades';
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
];

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
