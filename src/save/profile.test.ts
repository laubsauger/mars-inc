import { describe, it, expect } from 'vitest';
import { createDefaultProfile, normalizeProfile, SCHEMA_VERSION, defaultSettings } from './profile';

describe('profile defaults', () => {
  it('fresh profile carries the current schema version', () => {
    expect(createDefaultProfile().schemaVersion).toBe(SCHEMA_VERSION);
  });
  it('starts with zero currencies and empty history', () => {
    const p = createDefaultProfile();
    expect(p.currencies.martianGlory).toBe(0);
    expect(p.runHistory).toHaveLength(0);
  });
});

describe('normalizeProfile (V14 forward-compatible, ⊥ throw on partial)', () => {
  it('returns null for non-object input', () => {
    expect(normalizeProfile(null)).toBeNull();
    expect(normalizeProfile(42)).toBeNull();
    expect(normalizeProfile('nope')).toBeNull();
  });

  it('fills missing fields from defaults', () => {
    const p = normalizeProfile({ schemaVersion: 1, currencies: { martianGlory: 5 } })!;
    expect(p.currencies.martianGlory).toBe(5);
    expect(p.currencies.redDust).toBe(0); // filled
    expect(p.settings).toEqual(defaultSettings()); // filled
    expect(p.records.bestLevel).toBe(0); // filled
  });

  it('fills + coerces the (arena × character) record bucket', () => {
    // Old save with no bucket → empty map (additive, no migration needed).
    const fresh = normalizeProfile({ schemaVersion: 1 })!;
    expect(fresh.recordsByArenaCharacter).toEqual({});
    // Existing combo entries survive, partial ones get missing fields filled.
    const p = normalizeProfile({
      recordsByArenaCharacter: { 'rust-crown|lilu-tubs': { bestLevel: 7 } },
    })!;
    expect(p.recordsByArenaCharacter['rust-crown|lilu-tubs']!.bestLevel).toBe(7);
    expect(p.recordsByArenaCharacter['rust-crown|lilu-tubs']!.mostKills).toBe(0); // filled
  });

  it('merges partial settings without dropping known keys', () => {
    const p = normalizeProfile({ settings: { masterVolume: 0.1 } })!;
    expect(p.settings.masterVolume).toBe(0.1);
    expect(p.settings.sfxVolume).toBe(defaultSettings().sfxVolume);
  });

  it('caps run history length', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      at: i,
      durationSec: 1,
      level: 1,
      kills: 0,
    }));
    const p = normalizeProfile({ runHistory: many })!;
    expect(p.runHistory.length).toBeLessThanOrEqual(50);
  });

  it('ignores a non-array runHistory rather than crashing', () => {
    const p = normalizeProfile({ runHistory: 'corrupt' })!;
    expect(p.runHistory).toEqual([]);
  });
});
