// App/UI store (Zustand). React screens/HUD subscribe to NARROW slices so a HUD
// tick never re-renders sibling chunks. The Three canvas lives in plain DOM,
// outside React — store updates never touch it. §14.1.

import { create } from 'zustand';

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
export interface ProfileView {
  bestTimeSec: number;
  bestLevel: number;
  mostKills: number;
  runCount: number;
}

/** Settings + accessibility, mirrored from the profile and editable (T36). */
export interface SettingsView {
  masterVolume: number;
  sfxVolume: number;
  screenShake: number;
  reduceFlash: boolean;
  uiScale: number;
  holdToSprint: boolean;
  pauseOnFocusLoss: boolean;
  enemyHealthbars: boolean;
  toonShading: boolean;
  ambientOcclusion: boolean;
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
  level: number;
  xp01: number; // 0..1 progress to next level
  countdown: number; // > 0 → pre-combat countdown showing (T20)
  enemiesAlive: number;
  weapon: string; // current primary weapon display name (T33)
  shieldCharges: number; // current recharging-shield charges (T40)
  shieldMax: number; // 0 = no shield drafted yet
}

/** Transient combat announcement (T33): boss warning / new-enemy intro. The
 *  `id` bumps per event so the HUD can re-trigger + auto-dismiss. */
export interface AnnounceState {
  id: number;
  kind: 'boss' | 'enemy';
  text: string;
}

/** Boss health-bar slice (T33). Shown only while a boss is active. */
export interface BossView {
  active: boolean;
  hp01: number;
  phase: number;
  phases: number;
  name: string;
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
  prompt?: boolean;
  active?: boolean;
}

/** Reusable character/build sheet (T43) — end screen, pause, warrior panel. */
export interface SheetView {
  level: number;
  weapon: string;
  attributes: { label: string; value: string }[];
  upgrades: { name: string; level: number }[];
}

/** Permanent (meta) upgrade as shown on the game-over Glory panel (T26). */
export interface PermanentView {
  id: string;
  name: string;
  description: string;
  branch: string;
  cost: number;
  owned: number;
  maxLevel: number;
  affordable: boolean;
}

/** Meta-progression slice (Martian Glory + permanent upgrades). */
export interface MetaState {
  glory: number;
  lastEarned: number;
  permanents: PermanentView[];
}

export interface UiStore {
  screen: Screen;
  menuView: MenuView;
  hud: HudState;
  boss: BossView;
  announce: AnnounceState | null;
  draft: DraftState;
  bossReward: BossRewardState;
  labels: FloatingLabel[];
  sheet: SheetView | null;
  result: RunResultView | null;
  meta: MetaState;
  profile: ProfileView;
  settings: SettingsView;
  /** Bridge to sim — set by boot glue, called by the upgrade screen. */
  chooseUpgrade: (index: number) => void;
  chooseBossReward: (index: number) => void;
  /** Bridge to sim — re-roll unlocked draft options (T41). */
  rerollDraft: (lockedIds: string[]) => void;
  /** Bridge to sim — banish a draft option for the run (T41). */
  banishOption: (index: number) => void;
  /** Bridge to sim — skip the draft for a heal (T41). */
  skipDraft: () => void;
  /** Bridge to sim — restart the run in place (no reload), set by boot glue. */
  restartRun: () => void;
  /** Bridge to sim — leave a finished run and return to the menu. */
  toMenu: () => void;
  /** Bridge to sim — enter the pit from the menu (start a fresh run). */
  enterPit: () => void;
  /** Bridge to render — reset the orbit/zoom camera to the framed default. */
  resetView: () => void;
  /** Bridge to sim — toggle pause (used by the pause-menu Resume button). */
  togglePause: () => void;
  /** Bridge to save — buy a permanent upgrade with Martian Glory. */
  buyPermanent: (id: string) => void;
  /** Bridge to save — change settings/accessibility (persists + applies live). */
  applySetting: (patch: Partial<SettingsView>) => void;
  setScreen: (s: Screen) => void;
  setMenuView: (v: MenuView) => void;
  setHud: (h: HudState) => void;
  setBoss: (b: BossView) => void;
  setAnnounce: (a: AnnounceState) => void;
  setDraft: (d: DraftState) => void;
  setResult: (r: RunResultView | null) => void;
  setMeta: (m: MetaState) => void;
  setProfile: (p: ProfileView) => void;
  setSettings: (s: SettingsView) => void;
  setChooseUpgrade: (fn: (index: number) => void) => void;
  setBossReward: (b: BossRewardState) => void;
  setChooseBossReward: (fn: (index: number) => void) => void;
  setLabels: (l: FloatingLabel[]) => void;
  setSheet: (s: SheetView | null) => void;
  setRerollDraft: (fn: (lockedIds: string[]) => void) => void;
  setBanishOption: (fn: (index: number) => void) => void;
  setSkipDraft: (fn: () => void) => void;
  setRestartRun: (fn: () => void) => void;
  setToMenu: (fn: () => void) => void;
  setEnterPit: (fn: () => void) => void;
  setResetView: (fn: () => void) => void;
  setTogglePause: (fn: () => void) => void;
  setBuyPermanent: (fn: (id: string) => void) => void;
  setApplySetting: (fn: (patch: Partial<SettingsView>) => void) => void;
}

const INITIAL_HUD: HudState = {
  health: 100,
  maxHealth: 100,
  sprintCharges: 1,
  sprintCooldown01: 1,
  paused: false,
  elapsed: 0,
  level: 1,
  xp01: 0,
  countdown: 3,
  enemiesAlive: 0,
  weapon: 'Contractual Sidearm',
  shieldCharges: 0,
  shieldMax: 0,
};

const INITIAL_DRAFT: DraftState = {
  open: false,
  level: 1,
  options: [],
  rerollsLeft: 0,
  banishesLeft: 0,
};
const INITIAL_META: MetaState = { glory: 0, lastEarned: 0, permanents: [] };
const INITIAL_PROFILE: ProfileView = {
  bestTimeSec: 0,
  bestLevel: 0,
  mostKills: 0,
  runCount: 0,
};
const INITIAL_SETTINGS: SettingsView = {
  masterVolume: 0.6,
  sfxVolume: 1,
  screenShake: 1,
  reduceFlash: false,
  uiScale: 1,
  holdToSprint: false,
  pauseOnFocusLoss: true,
  enemyHealthbars: false,
  toonShading: false,
  ambientOcclusion: false,
  colorblind: 'off',
};

export const useUiStore = create<UiStore>((set) => ({
  screen: 'boot',
  menuView: 'root',
  hud: INITIAL_HUD,
  boss: { active: false, hp01: 0, phase: 0, phases: 3, name: '' },
  announce: null,
  draft: INITIAL_DRAFT,
  bossReward: { open: false, id: 0, options: [] },
  labels: [],
  sheet: null,
  result: null,
  meta: INITIAL_META,
  profile: INITIAL_PROFILE,
  settings: INITIAL_SETTINGS,
  chooseUpgrade: () => {},
  chooseBossReward: () => {},
  rerollDraft: () => {},
  banishOption: () => {},
  skipDraft: () => {},
  restartRun: () => {},
  toMenu: () => {},
  enterPit: () => {},
  resetView: () => {},
  togglePause: () => {},
  buyPermanent: () => {},
  applySetting: () => {},
  setScreen: (screen) => set({ screen }),
  setMenuView: (menuView) => set({ menuView }),
  setHud: (hud) => set({ hud }),
  setBoss: (boss) => set({ boss }),
  setAnnounce: (announce) => set({ announce }),
  setDraft: (draft) => set({ draft }),
  setResult: (result) => set({ result }),
  setMeta: (meta) => set({ meta }),
  setProfile: (profile) => set({ profile }),
  setSettings: (settings) => set({ settings }),
  setChooseUpgrade: (chooseUpgrade) => set({ chooseUpgrade }),
  setBossReward: (bossReward) => set({ bossReward }),
  setLabels: (labels) => set({ labels }),
  setSheet: (sheet) => set({ sheet }),
  setChooseBossReward: (chooseBossReward) => set({ chooseBossReward }),
  setRerollDraft: (rerollDraft) => set({ rerollDraft }),
  setBanishOption: (banishOption) => set({ banishOption }),
  setSkipDraft: (skipDraft) => set({ skipDraft }),
  setRestartRun: (restartRun) => set({ restartRun }),
  setToMenu: (toMenu) => set({ toMenu }),
  setEnterPit: (enterPit) => set({ enterPit }),
  setResetView: (resetView) => set({ resetView }),
  setTogglePause: (togglePause) => set({ togglePause }),
  setBuyPermanent: (buyPermanent) => set({ buyPermanent }),
  setApplySetting: (applySetting) => set({ applySetting }),
}));

// Non-React accessors for the boot/sim glue (avoid importing hooks there).
export const uiActions = {
  setScreen: (s: Screen) => useUiStore.getState().setScreen(s),
  setMenuView: (v: MenuView) => useUiStore.getState().setMenuView(v),
  setHud: (h: HudState) => useUiStore.getState().setHud(h),
  setBoss: (b: BossView) => useUiStore.getState().setBoss(b),
  setAnnounce: (a: AnnounceState) => useUiStore.getState().setAnnounce(a),
  setDraft: (d: DraftState) => useUiStore.getState().setDraft(d),
  setBossReward: (b: BossRewardState) => useUiStore.getState().setBossReward(b),
  setLabels: (l: FloatingLabel[]) => useUiStore.getState().setLabels(l),
  setSheet: (sh: SheetView | null) => useUiStore.getState().setSheet(sh),
  setChooseBossReward: (fn: (i: number) => void) => useUiStore.getState().setChooseBossReward(fn),
  setResult: (r: RunResultView | null) => useUiStore.getState().setResult(r),
  setMeta: (m: MetaState) => useUiStore.getState().setMeta(m),
  setProfile: (p: ProfileView) => useUiStore.getState().setProfile(p),
  setSettings: (s: SettingsView) => useUiStore.getState().setSettings(s),
  setChooseUpgrade: (fn: (i: number) => void) => useUiStore.getState().setChooseUpgrade(fn),
  setRerollDraft: (fn: (ids: string[]) => void) => useUiStore.getState().setRerollDraft(fn),
  setBanishOption: (fn: (i: number) => void) => useUiStore.getState().setBanishOption(fn),
  setSkipDraft: (fn: () => void) => useUiStore.getState().setSkipDraft(fn),
  setRestartRun: (fn: () => void) => useUiStore.getState().setRestartRun(fn),
  setToMenu: (fn: () => void) => useUiStore.getState().setToMenu(fn),
  setEnterPit: (fn: () => void) => useUiStore.getState().setEnterPit(fn),
  setResetView: (fn: () => void) => useUiStore.getState().setResetView(fn),
  setTogglePause: (fn: () => void) => useUiStore.getState().setTogglePause(fn),
  setBuyPermanent: (fn: (id: string) => void) => useUiStore.getState().setBuyPermanent(fn),
  setApplySetting: (fn: (patch: Partial<SettingsView>) => void) =>
    useUiStore.getState().setApplySetting(fn),
};
