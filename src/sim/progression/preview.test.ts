// T51: the draft must SHOW the real resulting values for every stacking pick.
// Regression guard — fields like pulse/spread/blast/ricochet-retain were missing
// from the preview, so level-up cards showed only prose. Walk a few catalog cards
// and assert their tracked fields surface as {from, to}.

import { describe, it, expect } from 'vitest';
import { previewUpgrade } from './preview';
import { defaultMods } from './mods';
import { BuildEffects } from './effects';
import { createPlayer } from '../player';
import { CATALOG_UPGRADES } from '../../content/upgrades/catalog';
import type { UpgradeDefinition } from './upgrades';

const find = (id: string): UpgradeDefinition => {
  const def = CATALOG_UPGRADES.find((u) => u.id === id);
  if (!def) throw new Error(`missing upgrade ${id}`);
  return def;
};

describe('previewUpgrade', () => {
  it('surfaces simple mod deltas as from→to', () => {
    const changes = previewUpgrade(find('sharpshooter'), defaultMods(), createPlayer());
    expect(changes).toContainEqual({ label: 'Crit Chance', from: '0%', to: '4%' });
  });

  it('surfaces player-stat upgrades (Max HP)', () => {
    const changes = previewUpgrade(find('scrap-plating'), defaultMods(), createPlayer());
    expect(changes.some((c) => c.label === 'Max HP' && c.to === '120')).toBe(true);
  });

  it('surfaces pulse fields the old hardcoded list dropped', () => {
    // Repulsor Pulse level >0 moves novaInterval/Radius/Force/Damage — none were
    // tracked before, so the card showed nothing. Enable it once, then preview the
    // next level against the enabled state.
    const mods = defaultMods();
    const player = createPlayer();
    find('repulsor-pulse').apply({ mods, player, effects: new BuildEffects() });
    const labels = previewUpgrade(find('repulsor-pulse'), mods, player).map((c) => c.label);
    expect(labels).toContain('Pulse Radius');
    expect(labels).toContain('Pulse Damage');
  });

  it('returns empty for pure effect-engine cards (no tracked delta)', () => {
    expect(previewUpgrade(find('apex-hunter'), defaultMods(), createPlayer())).toEqual([]);
  });
});
