// T74: the dev control board must grant via the real APIs and flag the run cheated
// (V35), and a fresh run must start clean (no leaked cheat state). Determinism of
// the step math is unaffected by the flags (V16).

import { describe, it, expect } from 'vitest';
import { World } from './world';
import { RUST_MITE } from './enemies';

const mite = RUST_MITE.variant;

describe('dev control board (T74)', () => {
  it('grants an upgrade by id → raises owned level + mods, flags cheated', () => {
    const w = new World(1);
    w.start();
    const crit0 = w.mods.critChanceAdd;
    expect(w.devGrantUpgrade('sharpshooter')).toBe(true);
    expect(w.upgradeLevelOf('sharpshooter')).toBe(1);
    expect(w.mods.critChanceAdd).toBeGreaterThan(crit0);
    expect(w.cheated).toBe(true);
  });

  it('unknown upgrade id → false, no cheat flag', () => {
    const w = new World(1);
    w.start();
    expect(w.devGrantUpgrade('does-not-exist')).toBe(false);
    expect(w.cheated).toBe(false);
  });

  it('devSpawn adds the requested count of a variant', () => {
    const w = new World(1);
    w.start();
    const before = w.enemies.count;
    w.devSpawn(mite, 4);
    expect(w.enemies.count).toBe(before + 4);
    expect(w.cheated).toBe(true);
  });

  it('godmode holds the player invulnerable across a step', () => {
    const w = new World(1);
    w.start();
    expect(w.devToggleGodmode()).toBe(true);
    w.step(1 / 60);
    expect(w.player.invuln).toBeGreaterThan(0);
  });

  it('devSetWeapon swaps the primary; unknown id is a no-op false', () => {
    const w = new World(1);
    w.start();
    expect(w.devSetWeapon('nope')).toBe(false);
    // A real weapon id swaps (uses the first non-current weapon from the registry).
    expect(w.devSetWeapon('rust-devil-minigun')).toBe(true);
    expect(w.weaponSystem.primaryId).toBe('rust-devil-minigun');
  });

  it('reset() clears cheat state — a fresh run is clean (V35)', () => {
    const w = new World(1);
    w.start();
    w.devGrantUpgrade('sharpshooter');
    w.devToggleGodmode();
    expect(w.cheated).toBe(true);
    w.reset();
    expect(w.cheated).toBe(false);
    expect(w.devGodmode).toBe(false);
  });
});
