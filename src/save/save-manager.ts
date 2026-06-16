// Save manager (T24). Owns the in-memory profile, loads it on boot (falling back
// to a fresh default when absent or unreadable), and persists with a short debounce
// so frequent setting tweaks coalesce into one write. Deeper migration/corruption
// recovery + export/import land at T25.

import {
  type PlayerProfile,
  type SettingsData,
  type AccessibilityData,
  createDefaultProfile,
  normalizeProfile,
  serializeProfile,
  deserializeProfile,
} from './profile';
import {
  idbGet,
  idbPut,
  idbBackup,
  idbQuarantine,
  idbClear,
  setBootPointer,
  hasBootPointer,
} from './storage';

const SAVE_DEBOUNCE_MS = 400;

export class SaveManager {
  private profile: PlayerProfile = createDefaultProfile();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  get current(): PlayerProfile {
    return this.profile;
  }

  /** True if a prior save was flagged (cheap, synchronous boot hint). */
  hasSave(): boolean {
    return hasBootPointer();
  }

  /**
   * Load the profile from IndexedDB, migrating old schemas and recovering from
   * corruption. Always resolves (V14): missing → fresh default; present but
   * unreadable → quarantine the bad data and start fresh. ⊥ crash, ⊥ silent loss.
   */
  async load(): Promise<PlayerProfile> {
    const raw = await idbGet<unknown>();
    const normalized = normalizeProfile(raw); // runs migrations internally
    if (raw !== null && normalized === null) {
      await idbQuarantine(raw); // present but corrupt — keep a copy, don't destroy
    }
    this.profile = normalized ?? createDefaultProfile();
    this.loaded = true;
    return this.profile;
  }

  /** Export the current profile as a portable text blob (§I.save). */
  exportText(): string {
    return serializeProfile(this.profile);
  }

  /**
   * Import a profile from an exported blob. Validates first; on malformed input
   * the existing save is untouched and `false` is returned (⊥ destructive).
   */
  async importText(text: string): Promise<boolean> {
    const incoming = deserializeProfile(text);
    if (!incoming) return false;
    this.profile = incoming;
    this.loaded = true;
    return this.flush();
  }

  /** Mutate settings and schedule a persist. */
  updateSettings(patch: Partial<SettingsData>): void {
    this.profile.settings = { ...this.profile.settings, ...patch };
    this.scheduleSave();
  }

  /** Mutate accessibility options and schedule a persist (T36). */
  updateAccessibility(patch: Partial<AccessibilityData>): void {
    this.profile.accessibility = { ...this.profile.accessibility, ...patch };
    this.scheduleSave();
  }

  /**
   * Hard reset: wipe ALL persisted progress (profile + backups + quarantine +
   * boot pointer) and replace the in-memory profile with a fresh default.
   * Cancels any pending debounced flush so the wiped profile can't be rewritten.
   * Caller is expected to reload the app afterward for a clean rebuild.
   */
  async reset(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ok = await idbClear();
    this.profile = createDefaultProfile();
    this.loaded = true;
    return ok;
  }

  /** Apply an arbitrary mutation to the profile then persist (currencies, records…). */
  mutate(fn: (p: PlayerProfile) => void): void {
    fn(this.profile);
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  /** Persist immediately (e.g. on run end / before unload). */
  async flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.loaded) return false;
    const ok = await idbPut(this.profile);
    if (ok) {
      setBootPointer(true);
      // Timestamped rolling backup (storage prunes to the last few).
      await idbBackup(this.profile, this.now());
    }
    return ok;
  }

  /** Injectable clock so tests stay deterministic; storage is not sim. */
  now: () => number = () => Date.now();
}
