// Upgrade catalog integrity (T33/T40, V11/§I.data). The FULL draft pool (base +
// catalog + advanced — what the world actually drafts from) must be deep, have
// unique ids, span every rarity, and carry NO duplicate effects (each upgrade is
// a distinct direction; identical descriptions = an obvious dupe). Every `apply`
// must be safe against a fresh context.

import { describe, it, expect } from 'vitest';
import { UPGRADES } from './index';
import { CATALOG_UPGRADES } from './catalog';
import { ADVANCED_UPGRADES } from './advanced';
import type { Rarity } from '../../sim/progression/upgrades';
import { defaultMods } from '../../sim/progression/mods';
import { BuildEffects } from '../../sim/progression/effects';
import { createPlayer } from '../../sim/player';

// The actual draftable pool (mirrors world.ts DRAFT_POOL).
const POOL = [...UPGRADES, ...ADVANCED_UPGRADES];

describe('upgrade catalog', () => {
  it('gives a deep draft pool with unique ids', () => {
    expect(POOL.length).toBeGreaterThanOrEqual(34); // T33 target
    const ids = new Set(POOL.map((u) => u.id));
    expect(ids.size).toBe(POOL.length); // no duplicate ids
  });

  it('has no duplicate effects (no two upgrades share a description)', () => {
    const seen = new Map<string, string>();
    for (const u of POOL) {
      const prev = seen.get(u.description);
      expect(prev, `"${u.description}" used by both ${prev} and ${u.id}`).toBeUndefined();
      seen.set(u.description, u.id);
    }
  });

  it('spans every rarity', () => {
    const rarities = new Set<Rarity>(POOL.map((u) => u.rarity));
    for (const r of [
      'common',
      'uncommon',
      'rare',
      'legendary',
      'corrupted',
      'prototype',
    ] as const) {
      expect(rarities.has(r)).toBe(true);
    }
  });

  it('every apply runs without throwing against a fresh context', () => {
    for (const u of POOL) {
      const ctx = { player: createPlayer(), mods: defaultMods(), effects: new BuildEffects() };
      expect(() => u.apply(ctx)).not.toThrow();
    }
  });

  it('a curse (corrupted) imposes a real downside', () => {
    const glass = CATALOG_UPGRADES.find((u) => u.id === 'glass-cannon-pact')!;
    const player = createPlayer();
    const mods = defaultMods();
    const before = player.maxHealth;
    glass.apply({ player, mods, effects: new BuildEffects() });
    expect(mods.damageMult).toBeGreaterThan(1);
    expect(player.maxHealth).toBeLessThan(before);
    expect(player.health).toBeLessThanOrEqual(player.maxHealth);
  });

  it('Overpressure makes every shot explosive', () => {
    const op = CATALOG_UPGRADES.find((u) => u.id === 'overpressure')!;
    const mods = defaultMods();
    op.apply({ player: createPlayer(), mods, effects: new BuildEffects() });
    expect(mods.blastRadius).toBeGreaterThan(0);
  });
});
