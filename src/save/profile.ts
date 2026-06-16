// Player profile schema + defaults (T24, §16, §I.save). Versioned (V14). The
// shape is intentionally complete now so later systems (currencies, unlocks,
// records, prestige) have a stable home; migrations land at T25.

export const SCHEMA_VERSION = 1;

export interface SettingsData {
  masterVolume: number; // 0..1
  sfxVolume: number;
  musicVolume: number;
  screenShake: number; // 0..1
  reduceFlash: boolean;
  uiScale: number; // 0.8..1.4
  pauseOnFocusLoss: boolean;
  enemyHealthbars: boolean; // show HP bars over enemies (T36 opt-in)
  ambientOcclusion: boolean; // GTAO post-process (T37 opt-in)
  toonShading: boolean; // banded toon/ink look on characters (T37 opt-in)
}

export interface AccessibilityData {
  holdToSprint: boolean;
  highContrastPickups: boolean;
  colorblindPalette: 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

export interface CurrencyData {
  martianGlory: number;
  redDust: number;
}

export interface RecordData {
  bestTimeSec: number;
  bestLevel: number;
  mostKills: number;
  highestSingleHit: number;
}

export interface RunSummary {
  at: number; // epoch ms (stamped by caller — sim has no clock)
  durationSec: number;
  level: number;
  kills: number;
}

export interface PlayerProfile {
  schemaVersion: number;
  settings: SettingsData;
  accessibility: AccessibilityData;
  currencies: CurrencyData;
  unlocks: Record<string, boolean>;
  permanentUpgrades: Record<string, number>;
  records: RecordData;
  runHistory: RunSummary[];
}

// Versioned migrations (T25, V14). Each entry transforms a profile FROM the keyed
// version TO the next. The runner applies them in order until `schemaVersion`
// reaches CURRENT. Empty today (we're at v1); the framework is here so a future
// bump only adds one entry — no scattered version checks.
export type Migration = (p: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  // 1: (p) => ({ ...p, schemaVersion: 2, /* moved/renamed fields */ }),
};

/** Apply migrations in sequence from p.schemaVersion up to `target`. Pure. */
export function runMigrations(
  raw: Record<string, unknown>,
  migrations: Record<number, Migration>,
  target: number,
): Record<string, unknown> {
  let p = raw;
  let guard = 0;
  let v = typeof p.schemaVersion === 'number' ? p.schemaVersion : target;
  while (v < target && migrations[v] && guard++ < 100) {
    p = migrations[v]!(p);
    const next = typeof p.schemaVersion === 'number' ? p.schemaVersion : v + 1;
    if (next <= v) break; // migration didn't advance the version — stop, don't loop
    v = next;
  }
  return p;
}

export function defaultSettings(): SettingsData {
  return {
    masterVolume: 0.6,
    sfxVolume: 1,
    musicVolume: 0.7,
    screenShake: 1,
    reduceFlash: false,
    uiScale: 1,
    pauseOnFocusLoss: true,
    enemyHealthbars: false,
    ambientOcclusion: false,
    toonShading: false,
  };
}

export function createDefaultProfile(): PlayerProfile {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: defaultSettings(),
    accessibility: {
      holdToSprint: false,
      highContrastPickups: false,
      colorblindPalette: 'off',
    },
    currencies: { martianGlory: 0, redDust: 0 },
    unlocks: {},
    permanentUpgrades: {},
    records: { bestTimeSec: 0, bestLevel: 0, mostKills: 0, highestSingleHit: 0 },
    runHistory: [],
  };
}

/**
 * Coerce an unknown parsed value into a valid profile, filling missing fields
 * from defaults (forward-compatible reads). Returns null only if the input is
 * not an object at all — caller then falls back to a fresh profile (T25 handles
 * deeper corruption recovery). ⊥ throwing on partial data (V14).
 */
export function normalizeProfile(raw: unknown): PlayerProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  // Migrate first (old schema → current), then fill any still-missing fields.
  const migrated = runMigrations(
    raw as Record<string, unknown>,
    MIGRATIONS,
    SCHEMA_VERSION,
  ) as Partial<PlayerProfile>;
  const base = createDefaultProfile();
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...base.settings, ...(migrated.settings ?? {}) },
    accessibility: { ...base.accessibility, ...(migrated.accessibility ?? {}) },
    currencies: { ...base.currencies, ...(migrated.currencies ?? {}) },
    unlocks: { ...(migrated.unlocks ?? {}) },
    permanentUpgrades: { ...(migrated.permanentUpgrades ?? {}) },
    records: { ...base.records, ...(migrated.records ?? {}) },
    runHistory: Array.isArray(migrated.runHistory) ? migrated.runHistory.slice(0, 50) : [],
  };
}

/** Serialize the profile to a portable text blob (export, §I.save). */
export function serializeProfile(p: PlayerProfile): string {
  return JSON.stringify(p);
}

/**
 * Parse an exported blob back into a valid profile. Returns null on malformed
 * JSON or non-profile data — caller keeps the existing save (⊥ destructive import).
 */
export function deserializeProfile(text: string): PlayerProfile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return normalizeProfile(parsed);
}
