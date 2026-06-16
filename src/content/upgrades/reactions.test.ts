// Reaction chains (T54): primers apply statuses + carry gate tags; converters are
// tag-gated and switch a reaction on. Proves the draft branches via T51 gating.

import { describe, it, expect } from 'vitest';
import { REACTION_UPGRADES } from './reactions';
import { ADVANCED_UPGRADES } from './advanced';
import { available, applyUpgrade, type UpgradeDefinition } from '../../sim/progression/upgrades';
import { BuildEffects } from '../../sim/progression/effects';
import { defaultMods } from '../../sim/progression/mods';
import { createPlayer } from '../../sim/player';

const POOL: UpgradeDefinition[] = [...ADVANCED_UPGRADES, ...REACTION_UPGRADES];
const byId = (id: string) => POOL.find((u) => u.id === id)!;

function apply(id: string, levels: Record<string, number>, effects: BuildEffects) {
  applyUpgrade(byId(id), { player: createPlayer(), mods: defaultMods(), effects }, levels);
}

describe('reaction chains (T54)', () => {
  it('Thermal Shock converter is hidden until both Burn + Chill primers are owned', () => {
    expect(available(POOL, {}).some((u) => u.id === 'thermal-shock')).toBe(false);
    // Own only the burn primer → still gated.
    expect(available(POOL, { 'incendiary-rounds': 1 }).some((u) => u.id === 'thermal-shock')).toBe(
      false,
    );
    // Own both burn + chill primers → it surfaces.
    const lv = { 'incendiary-rounds': 1, 'cryo-rounds': 1 };
    expect(available(POOL, lv).some((u) => u.id === 'thermal-shock')).toBe(true);
  });

  it('taking a converter enables its reaction in the build engine', () => {
    const effects = new BuildEffects();
    expect(effects.enabledReactions.has('plasmaBloom')).toBe(false);
    apply('plasma-bloom', {}, effects);
    expect(effects.enabledReactions.has('plasmaBloom')).toBe(true);
  });

  it('every converter requires two status tags and enables exactly one reaction', () => {
    const converters = REACTION_UPGRADES.filter((u) => u.role === 'converter');
    expect(converters.length).toBe(5);
    for (const c of converters) {
      expect(c.requiresAllTags?.length).toBe(2);
      const effects = new BuildEffects();
      applyUpgrade(c, { player: createPlayer(), mods: defaultMods(), effects }, {});
      expect(effects.enabledReactions.size).toBe(1);
    }
  });

  it('new status primers carry their build-identity tag', () => {
    expect(byId('conductive-ammunition').grantsTags).toContain('shock');
    expect(byId('corrosive-rounds').grantsTags).toContain('corrode');
    expect(byId('serrated-rounds').grantsTags).toContain('bleed');
  });
});
