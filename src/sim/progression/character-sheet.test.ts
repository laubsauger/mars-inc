import { describe, it, expect } from 'vitest';
import { buildCharacterSheet, type SheetContext } from './character-sheet';
import { defaultMods } from './mods';
import { BuildEffects } from './effects';
import { createPlayer } from '../player';
import { EnemyPool } from '../enemies';
import type { WeaponSystem } from '../combat/weapon-system';

// Minimal stub — buildCharacterSheet only reads weapons[0]?.def.displayName.
function ctx(over: Partial<SheetContext> = {}): SheetContext {
  return {
    mods: defaultMods(),
    player: createPlayer(),
    enemies: new EnemyPool(),
    effects: new BuildEffects(),
    firingRampSec: 0,
    stationarySec: 0,
    upgradeLevels: {},
    weaponSystem: { weapons: [] } as unknown as WeaponSystem,
    ...over,
  };
}

const attr = (sheet: ReturnType<typeof buildCharacterSheet>, label: string): string | undefined =>
  sheet.attributes.find((a) => a.label === label)?.value;

describe('buildCharacterSheet (T43 build readout)', () => {
  it('lists the core attribute rows', () => {
    const s = buildCharacterSheet(ctx());
    for (const label of ['Health', 'Damage', 'Fire rate', 'Crit chance', 'Crit damage', 'Magnet']) {
      expect(s.attributes.some((a) => a.label === label)).toBe(true);
    }
  });

  it('reflects static mods in the attribute values', () => {
    const mods = defaultMods();
    mods.damageMult = 2;
    mods.critChanceAdd = 0.25;
    const s = buildCharacterSheet(ctx({ mods }));
    expect(attr(s, 'Damage')).toBe('×2.00');
    expect(attr(s, 'Crit chance')).toBe('+25%');
  });

  it('shows "(up to …)" only when a conditional can raise the value', () => {
    const effects = new BuildEffects();
    // +100% damage when 12+ enemies are present (a conditional, off at 0 enemies).
    effects.addConditional((c) => (c.enemiesOnScreen >= 12 ? { damageMult: 2 } : {}));
    const s = buildCharacterSheet(ctx({ effects }));
    expect(attr(s, 'Damage')).toBe('×1.00 (up to ×2.00)');
  });

  it('lists owned upgrades sorted by level (highest first)', () => {
    const s = buildCharacterSheet(ctx({ upgradeLevels: { 'heavy-barrel': 1, sharpshooter: 3 } }));
    expect(s.upgrades.length).toBe(2);
    expect(s.upgrades[0]!.level).toBe(3); // highest level leads
  });

  it('falls back to — when no weapon is equipped', () => {
    expect(buildCharacterSheet(ctx()).weapon).toBe('—');
  });
});
