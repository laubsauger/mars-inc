import { describe, it, expect } from 'vitest';
import {
  runMigrations,
  serializeProfile,
  deserializeProfile,
  normalizeProfile,
  createDefaultProfile,
  SCHEMA_VERSION,
  type Migration,
} from './profile';

describe('runMigrations (T25, V14)', () => {
  it('no-op when already at target', () => {
    const p = { schemaVersion: SCHEMA_VERSION, x: 1 };
    expect(runMigrations(p, {}, SCHEMA_VERSION)).toEqual(p);
  });

  it('applies chained migrations in order up to target', () => {
    const migrations: Record<number, Migration> = {
      1: (p) => ({ ...p, schemaVersion: 2, a: true }),
      2: (p) => ({ ...p, schemaVersion: 3, b: true }),
    };
    const out = runMigrations({ schemaVersion: 1 }, migrations, 3);
    expect(out).toMatchObject({ schemaVersion: 3, a: true, b: true });
  });

  it('stops (no infinite loop) if a migration fails to advance the version', () => {
    const migrations: Record<number, Migration> = {
      1: (p) => ({ ...p, schemaVersion: 1 }), // bad: doesn't advance
    };
    const out = runMigrations({ schemaVersion: 1 }, migrations, 5);
    expect(out.schemaVersion).toBe(1);
  });

  it('normalizeProfile stamps the current schema version after migrating', () => {
    const p = normalizeProfile({ schemaVersion: 0, currencies: { martianGlory: 9 } })!;
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.currencies.martianGlory).toBe(9);
  });
});

describe('export / import (T25, §I.save)', () => {
  it('round-trips a profile through text', () => {
    const p = createDefaultProfile();
    p.currencies.martianGlory = 123;
    const restored = deserializeProfile(serializeProfile(p))!;
    expect(restored.currencies.martianGlory).toBe(123);
  });

  it('rejects malformed JSON (⊥ destructive import)', () => {
    expect(deserializeProfile('{not json')).toBeNull();
  });

  it('rejects non-profile JSON', () => {
    expect(deserializeProfile('42')).toBeNull();
    expect(deserializeProfile('"hello"')).toBeNull();
  });

  it('fills missing fields on import of a partial blob', () => {
    const restored = deserializeProfile('{"currencies":{"redDust":7}}')!;
    expect(restored.currencies.redDust).toBe(7);
    expect(restored.currencies.martianGlory).toBe(0);
  });
});
