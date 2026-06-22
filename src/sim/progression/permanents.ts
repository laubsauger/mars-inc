// Apply owned permanent upgrades to a fresh run player (T26). Pure given the
// owned-levels map; the map comes from PlayerProfile.permanentUpgrades. Applied
// once at run start (after the player is reset), so it stacks on the baseline,
// never on a previous run's bonuses.

import type { Player } from '../player';
import { type RunMods, defaultMods } from './mods';
import { BuildEffects } from './effects';
import { PERMANENT_UPGRADES } from '../../content/permanent/index';

export type PermanentLevels = Record<string, number>;

/** `mods`/`effects` default to throwaways so plain stat callers can omit them;
 *  build-seeding nodes need the real run layers passed in (T35+). */
export function applyPermanents(
  player: Player,
  owned: PermanentLevels,
  mods: RunMods = defaultMods(),
  effects: BuildEffects = new BuildEffects(),
): void {
  for (const def of PERMANENT_UPGRADES) {
    const level = owned[def.id] ?? 0;
    if (level === 0) continue;
    // Attribute any conditional/trigger a node SEEDS to the node, so it shows on the
    // HUD effect strip like a drafted card (branch → an archetype tag for the icon).
    effects.beginSource({ id: def.id, label: def.name, tags: [BRANCH_TAG[def.branch]] });
    def.apply(player, Math.min(level, def.maxLevel), mods, effects);
    effects.endSource();
  }
}

/** Map a permanent's branch to the archetype tag the HUD strip uses for its glyph. */
const BRANCH_TAG: Record<(typeof PERMANENT_UPGRADES)[number]['branch'], string> = {
  arsenal: 'damage',
  biology: 'defense',
  mobility: 'mobility',
  command: 'crit',
  arena: 'aoe',
  infamy: 'risk',
};
