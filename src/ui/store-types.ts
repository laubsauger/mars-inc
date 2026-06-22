// UI store data shapes (Zustand). Pure type/interface declarations split out of
// store.ts so screens/HUD can import view types without depending on the store
// implementation — and so multiple agents can edit shapes vs. logic independently.
// Re-exported by store.ts, so `import { X } from './store'` keeps working.
import type { EffectStatus } from '../sim/progression/effects';

export type { EffectStatus };

export type Screen = 'boot' | 'unsupported' | 'menu' | 'arena' | 'gameover';

/** Which main-menu panel is open (T27). 'root' = the signage list. */
export type MenuView =
  | 'root'
  | 'warrior'
  | 'arsenal'
  | 'glory'
  | 'challenges'
  | 'records'
  | 'settings'
  | 'credits';

/** Records shown in the menu, mirrored from the saved profile. */
/** One best-of row for an (arena × character) combo (records breakdown). */
export interface RecordRow {
  id: string;
  arena: string;
  character: string;
  bestTimeSec: number;
  bestLevel: number;
  mostKills: number;
}

export interface ProfileView {
  bestTimeSec: number;
  bestLevel: number;
  mostKills: number;
  runCount: number;
  byCombo: RecordRow[];
  /** True once the player has ever slain the Gatekeeper — gates Act 2 (T-Act). */
  bossDefeated: boolean;
  /** True once the Act-2 boss has fallen — unlocks the global difficulty selector. */
  difficultyUnlocked: boolean;
  /** Weapon ids DISCOVERED (started with or picked up in a run); the Arsenal shows
   *  ??? for the rest until found (discovery progression). */
  discoveredWeapons: string[];
  /** Earned achievement ids → unlock timestamp (presence = earned). */
  achievements: Record<string, number>;
}

/** Rich achievement-unlock toast (T-ach). `id` bumps per unlock so the HUD/menu
 *  overlay re-triggers + auto-dismisses, queueing if several land together. */
export interface AchievementToast {
  id: number;
  name: string;
  desc: string;
  icon: string;
  tier: 'expected' | 'hard' | 'weird';
}

/** Settings + accessibility, mirrored from the profile and editable (T36). */
export interface SettingsView {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  screenShake: number;
  reduceFlash: boolean;
  uiScale: number;
  holdToSprint: boolean;
  pauseOnFocusLoss: boolean;
  enemyHealthbars: boolean;
  toonShading: boolean;
  ambientOcclusion: boolean;
  arenaId: 'cold-vault' | 'rust-crown';
  difficulty: number; // global difficulty tier index (0 = Standard)
  showCountdown: boolean;
  cameraControls: boolean;
  showGrenadeRange: boolean;
  projectileLighting: boolean;
  musicInCombat: boolean;
  colorblind: 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

/** Post-game result summary (T22, V20). Mirrors sim `RunResult`. */
export interface RunResultView {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  durationSec: number;
  level: number;
  upgradesTaken: number;
  dps: number;
  killsPerMin: number;
  won: boolean;
  // Rich run summary (T23 redesign).
  weapon: string;
  bossKills: number;
  gloryEarned: number;
  killsByType: { name: string; count: number }[];
  upgrades: { name: string; level: number }[];
  /** Cause of death (death runs only): the unit, attack, and damage of the fatal blow. */
  fatalBlow: { unit: string; attack: string; damage: number } | null;
}

/** HUD slice — pushed from the sim each frame (or throttled). Combat-hot values
 *  kept flat & primitive so selector equality is cheap. */
export interface HudState {
  health: number;
  maxHealth: number;
  sprintCharges: number;
  sprintCooldown01: number; // 0..1 recharge progress of next charge
  paused: boolean;
  elapsed: number;
  wave: number; // current wave-pulse number (HUD readout)
  level: number;
  xp01: number; // 0..1 progress to next level
  countdown: number; // > 0 → pre-combat countdown showing (T20)
  bossEta: number | null; // real seconds to the next boss; null = boss on field / n/a
  enemiesAlive: number;
  weapon: string; // current primary weapon display name (T33)
  shieldCharges: number; // current recharging-shield charges (T40)
  shieldMax: number; // 0 = no shield drafted yet
  // Ability hotbar (ARPG-style): radial cooldown + ready state per slot.
  sprintMax: number; // max sprint charges (slot pips)
  grenade01: number; // 0..1 grenade cooldown progress (1 = ready to throw)
  autoShoot: boolean; // persistent auto-fire toggle state (Ctrl)
  rage: number; // current kill-streak stacks (0 = no streak)
  rageMax: number; // streak cap (for the meter)
  runGlory: number; // Martian Glory this run would bank SO FAR (live estimate)
  effects: EffectStatus[]; // live build-effect strip: drafted conditionals/triggers + on/off state
}

/** Hovered-enemy inspect panel (mini character sheet). Computed render-side from
 *  the enemy nearest the ground cursor; null when nothing is hovered. */
export interface InspectView {
  name: string;
  variant: number; // drives the silhouette colour chip
  hp: number;
  maxHp: number;
  contactDamage: number;
  speed: number;
  isBoss: boolean;
  splitter: boolean;
  ranged: { kind: string; damage: number; range: number } | null;
  statuses: string[]; // active status labels (Burn/Chill/Shock/…)
}

/** Transient combat announcement (T33/T75). Each kind has its OWN banner text +
 *  styling — they were once all shoved through 'boss' which mislabelled themed waves
 *  and evolutions as "FINAL BOSS". `id` bumps per event so the HUD re-triggers +
 *  auto-dismisses. `text` is the subject (boss/enemy/upgrade name, or wave label). */
export interface AnnounceState {
  id: number;
  kind: 'boss' | 'miniboss' | 'wave' | 'evolution' | 'enemy' | 'unlock';
  text: string;
}

/** Boss health-bar slice (T33). Shown only while a boss is active. */
export interface BossView {
  active: boolean;
  hp01: number;
  phase: number;
  phases: number;
  name: string;
  /** Boss tier — drives the distinct miniboss vs final HUD treatment (T78, V39). */
  tier: 'miniboss' | 'final';
}

/** End-of-act conclusion prompt (T75/T50). Open after the act's final boss falls:
 *  the player extracts (banks the win) or opts into the endless Overrun gauntlet. */
export interface ConclusionState {
  open: boolean;
  id: number;
}

export interface DraftOption {
  id: string;
  name: string;
  description: string;
  rarity: string;
  tags: readonly string[];
  /** Levels already owned (0 = new card); maxLevel for "n/max" + MAX state. */
  level: number;
  maxLevel: number;
  /** Numeric build changes this pick makes (empty = effect-only → show desc). */
  changes: { label: string; from: string; to: string }[];
}

export interface DraftState {
  open: boolean;
  level: number;
  options: DraftOption[];
  rerollsLeft: number;
  banishesLeft: number;
  locksLeft: number;
  tagBanishesLeft: number;
  /** Id of the card held by Lock for the next draft (T71), or null. */
  lockedId: string | null;
}

/** Boss-reward overlay (T43). Three major picks shown on a boss kill. */
export interface BossRewardOption {
  id: string;
  name: string;
  description: string;
  kind: string; // evolution | system | mutation | artifact
}
export interface BossRewardState {
  open: boolean;
  id: number;
  options: BossRewardOption[];
}

/** World-anchored screen-space label (T33): damage numbers + pickup names. */
export interface FloatingLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  opacity: number;
  kind: 'dmg' | 'pickup';
  crit?: boolean;
  dot?: boolean;
  prompt?: boolean;
  active?: boolean;
}

/** Reusable character/build sheet (T43) — end screen, pause, warrior panel. */
export interface SheetView {
  level: number;
  weapon: string;
  attributes: { label: string; value: string }[];
  /** Conditional buffs active right now (shown in the pause sheet). */
  activeBuffs: { label: string; value: string }[];
  upgrades: {
    name: string;
    level: number;
    maxLevel: number;
    rarity: string;
    description: string;
  }[];
}

/** Permanent (meta) upgrade as shown on the game-over Glory panel (T26). */
export interface PermanentView {
  id: string;
  name: string;
  description: string;
  branch: string;
  rarity: string; // 'common' | 'rare' | 'legendary' — drives Glory Tree node visuals
  cost: number; // cost of the NEXT level (escalates per level)
  spent: number; // total Glory already sunk into this node (for the respec refund)
  owned: number;
  maxLevel: number;
  affordable: boolean;
  /** Boss-gated node not yet unlocked (T47) — shown locked, unbuyable. */
  locked?: boolean;
  /** Why it's locked (e.g. "Defeat Foreman Krill"), shown on the locked node. */
  lockLabel?: string;
}

/** A Red-Dust prestige node as shown in the prestige panel (T72). */
export interface PrestigeNodeView {
  id: string;
  name: string;
  description: string;
  cost: number; // Red Dust for the next level
  owned: number;
  maxLevel: number;
  affordable: boolean;
}

/** Meta-progression slice (Martian Glory + permanents + Red Dust prestige). */
export interface MetaState {
  glory: number;
  lastEarned: number;
  permanents: PermanentView[];
  /** Prestige (T72): Red Dust balance, prestige count, and the Red-Dust node shop. */
  redDust: number;
  prestigeCount: number;
  /** True once the optional end-game prestige is available (last act cleared). */
  prestigeUnlocked: boolean;
  /** Glory the player would mint as Red Dust if they prestiged right now (0 = none). */
  prestigeReady: number;
  prestigeNodes: PrestigeNodeView[];
}

/** Dev control board bridge (T74) — set by boot glue. All actions route through
 *  the real sim/save APIs (world.devXxx / save.mutate); the board just calls them.
 *  Static lists (`upgrades`/`weapons`/`permanents`/`enemies`) are read-only metadata. */
export interface DevBridge {
  upgrades: ReadonlyArray<{
    id: string;
    name: string;
    description: string;
    rarity: string;
    maxLevel: number;
    tags: readonly string[];
  }>;
  weapons: ReadonlyArray<{ id: string; name: string }>;
  permanents: ReadonlyArray<{ id: string; name: string; branch: string; maxLevel: number }>;
  enemies: ReadonlyArray<{ variant: number; name: string }>;
  grantUpgrade: (id: string) => boolean;
  upgradeLevelOf: (id: string) => number;
  setWeapon: (id: string) => boolean;
  evolve: () => boolean;
  addLevels: (n: number) => void;
  heal: () => void;
  toggleGodmode: () => boolean;
  godmode: () => boolean;
  spawn: (variant: number, count: number) => void;
  forceBoss: () => void;
  clearEnemies: () => void;
  openBossReward: () => void;
  weaponId: () => string;
  glory: () => number;
  ownedPermanent: (id: string) => number;
  grantGlory: (amount: number) => void;
  /** Dev: grant/deduct Red Dust (prestige currency) for testing prestige nodes. */
  grantRedDust: (amount: number) => void;
  setPermanent: (id: string, level: number, persist: boolean) => void;
  /** Progression-gate unlocks (acts/arenas/difficulty). `isUnlocked` reads the live
   *  save flag; `setUnlock` persists it so the menu's Act-2 / difficulty gates open. */
  isUnlocked: (key: string) => boolean;
  setUnlock: (key: string, on: boolean) => void;
  /** Serialize the current weapon + card levels + permanents to a portable JSON. */
  exportScenario: () => string;
  /** Reconstruct a scenario from JSON. Returns an error string, or null on success. */
  applyScenario: (text: string, persist: boolean) => string | null;
}
