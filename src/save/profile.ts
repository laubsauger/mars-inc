// Player profile schema + defaults (T24, §16, §I.save). Versioned (V14). The
// shape is intentionally complete now so later systems (currencies, unlocks,
// records, prestige) have a stable home; migrations land at T25.

import type { ArenaId } from '../sim/arena';

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
  arenaId: ArenaId; // which pit to play (circle Rust Crown / rect Cold Vault)
  difficulty: number; // global difficulty tier index (0 = Standard); unlocked after Act-2 boss

  showCountdown: boolean; // pre-combat 3s countdown (default off — saves dev time)
  cameraControls: boolean; // opt-in orbit/zoom camera (default off — players nudged it by accident)
  showGrenadeRange: boolean; // grenade max-range cross marker on the aim line (default on)
  projectileLighting: boolean; // bolts spill light onto floor/walls via the light buffer (default on)
  musicInCombat: boolean; // keep the menu music playing into the fight (default off — combat is quiet)
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
  /** Best runs per (arena × character) PAIR — both matter (arena difficulty/roster
   *  interacts with the fighter). Keyed `"<arenaId>|<characterId>"`; missing key =
   *  no run for that combo. Additive — old saves normalize to {}. */
  recordsByArenaCharacter: Record<string, RecordData>;
  runHistory: RunSummary[];
  /** Per-boss lifetime kill counts (T79, trophy substrate for V25/T45). Keyed by
   *  BossDef id. Banked AT KILL TIME (V40) so surrender/quit keeps the progress.
   *  Additive — old saves normalize to {}. */
  bossKills: Record<string, number>;
  /** Per-boss FEAT mastery (T46, V26): the set of feat keys earned vs each boss —
   *  defeat / fast / flawless / family:<weapon-family>. Feat-based, ⊥ HP-padding.
   *  Banked at kill time; gates boss-themed Glory-tree nodes (T47). Keyed by BossDef
   *  id → unique feat keys. Additive — old saves normalize to {}. */
  bossMastery: Record<string, string[]>;
  /** Prestige state (T72, V31): how many times the player has sacrificed the Glory
   *  tree for Red Dust, and the owned Red-Dust prestige-node levels. Additive. */
  prestige: { count: number; nodes: Record<string, number> };
  /** Achievements earned → unlock timestamp (epoch ms, stamped by the caller; the
   *  value's only used for sort/recency, presence = earned). Additive (old saves → {}). */
  achievements: Record<string, number>;
}

/** Compose the (arena × character) record-bucket key. */
export function arenaCharacterKey(arenaId: string, characterId: string): string {
  return `${arenaId}|${characterId}`;
}

/** Empty record bucket (a fresh best-of for an arena/character). */
export function emptyRecord(): RecordData {
  return { bestTimeSec: 0, bestLevel: 0, mostKills: 0, highestSingleHit: 0 };
}

/** Coerce an unknown record-map into clean RecordData entries (never throws). */
function coerceRecordMap(raw: unknown): Record<string, RecordData> {
  const out: Record<string, RecordData> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = { ...emptyRecord(), ...(typeof v === 'object' && v ? v : {}) };
  }
  return out;
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
    arenaId: 'cold-vault',
    difficulty: 0,
    showCountdown: false,
    cameraControls: false,
    showGrenadeRange: true,
    projectileLighting: true,
    musicInCombat: true, // default ON — keep the music going; players can opt out in settings
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
    recordsByArenaCharacter: {},
    runHistory: [],
    bossKills: {},
    bossMastery: {},
    prestige: { count: 0, nodes: {} },
    achievements: {},
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
    recordsByArenaCharacter: coerceRecordMap(migrated.recordsByArenaCharacter),
    runHistory: Array.isArray(migrated.runHistory) ? migrated.runHistory.slice(0, 50) : [],
    bossKills: coerceCountMap(migrated.bossKills),
    bossMastery: coerceStringArrayMap(migrated.bossMastery),
    prestige: coercePrestige(migrated.prestige),
    achievements: coerceCountMap(migrated.achievements),
  };
}

/** Coerce the prestige slice (old saves / corrupt → fresh). Count ≥ 0, nodes = a
 *  clean count-map. */
function coercePrestige(raw: unknown): { count: number; nodes: Record<string, number> } {
  const r = (typeof raw === 'object' && raw ? raw : {}) as Record<string, unknown>;
  const count = typeof r.count === 'number' && r.count >= 0 ? Math.floor(r.count) : 0;
  return { count, nodes: coerceCountMap(r.nodes) };
}

/** Coerce an unknown value into a `Record<string, string[]>` (old saves / corrupt →
 *  {}); each entry's array is filtered to unique strings. Used for boss mastery (T46). */
function coerceStringArrayMap(raw: unknown): Record<string, string[]> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v))
      out[k] = [...new Set(v.filter((s): s is string => typeof s === 'string'))];
  }
  return out;
}

/** Coerce an unknown value into a `Record<string, number>` of non-negative counts
 *  (old saves / corrupt data → {}). Used for the per-boss kill tally (T79). */
function coerceCountMap(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
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
