// Apply owned permanent upgrades to a fresh run player (T26). Pure given the
// owned-levels map; the map comes from PlayerProfile.permanentUpgrades. Applied
// once at run start (after the player is reset), so it stacks on the baseline,
// never on a previous run's bonuses.

import type { Player } from '../player';
import { PERMANENT_UPGRADES } from '../../content/permanent/index';

export type PermanentLevels = Record<string, number>;

export function applyPermanents(player: Player, owned: PermanentLevels): void {
  for (const def of PERMANENT_UPGRADES) {
    const level = owned[def.id] ?? 0;
    if (level > 0) def.apply(player, Math.min(level, def.maxLevel));
  }
}
