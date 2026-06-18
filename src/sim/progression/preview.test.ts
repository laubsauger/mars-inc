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
    expect(changes).toContainEqual({ label: 'Crit Chance', from: '0%', to: '7%' });
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

  it('surfaces a CONDITIONAL card peak (situational damage) as from→to', () => {
    // Restraining Order: +35% damage while the nearest enemy is far → a peak the
    // static-field diff misses. Level 0→1 stacks on nothing yet.
    const changes = previewUpgrade(find('restraining-order'), defaultMods(), createPlayer());
    expect(changes.find((c) => c.label === 'Damage (peak)')).toEqual({
      label: 'Damage (peak)',
      from: '×1.00',
      to: '×1.35',
    });
  });

  it('CONDITIONAL peak STACKS on owned levels (the Lv1→2 case)', () => {
    // One level already owned (live effects hold its conditional) → the next level
    // multiplies on top: ×1.35 → ×1.82.
    const live = new BuildEffects();
    find('restraining-order').apply({
      mods: defaultMods(),
      player: createPlayer(),
      effects: live,
    });
    const changes = previewUpgrade(find('restraining-order'), defaultMods(), createPlayer(), live);
    expect(changes.find((c) => c.label === 'Damage (peak)')).toEqual({
      label: 'Damage (peak)',
      from: '×1.35',
      to: '×1.82',
    });
  });

  it('returns empty for pure TRIGGER cards (on-kill AoE — no preview-able number)', () => {
    // Singularity Protocol only registers an on-kill area-damage trigger.
    expect(previewUpgrade(find('singularity-protocol'), defaultMods(), createPlayer())).toEqual([]);
  });
});
