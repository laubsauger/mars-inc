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

/** Records + settings shown in the menu, mirrored from the saved profile. */
export interface ProfileView {
  bestTimeSec: number;
  bestLevel: number;
  mostKills: number;
  runCount: number;
  masterVolume: number;
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
}

export interface DraftOption {
  id: string;
  name: string;
  description: string;
  rarity: string;
  tags: readonly string[];
}

export interface DraftState {
  open: boolean;
  level: number;
  options: DraftOption[];
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
  draft: DraftState;
  result: RunResultView | null;
  meta: MetaState;
  profile: ProfileView;
  /** Bridge to sim — set by boot glue, called by the upgrade screen. */
  chooseUpgrade: (index: number) => void;
  /** Bridge to sim — restart the run in place (no reload), set by boot glue. */
  restartRun: () => void;
  /** Bridge to sim — leave a finished run and return to the menu. */
  toMenu: () => void;
  /** Bridge to sim — enter the pit from the menu (start a fresh run). */
  enterPit: () => void;
  /** Bridge to save — buy a permanent upgrade with Martian Glory. */
  buyPermanent: (id: string) => void;
  /** Bridge to save — change master volume (persists + applies live). */
  setMasterVolume: (v: number) => void;
  setScreen: (s: Screen) => void;
  setMenuView: (v: MenuView) => void;
  setHud: (h: HudState) => void;
  setDraft: (d: DraftState) => void;
  setResult: (r: RunResultView | null) => void;
  setMeta: (m: MetaState) => void;
  setProfile: (p: ProfileView) => void;
  setChooseUpgrade: (fn: (index: number) => void) => void;
  setRestartRun: (fn: () => void) => void;
  setToMenu: (fn: () => void) => void;
  setEnterPit: (fn: () => void) => void;
  setBuyPermanent: (fn: (id: string) => void) => void;
  setMasterVolumeBridge: (fn: (v: number) => void) => void;
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
};

const INITIAL_DRAFT: DraftState = { open: false, level: 1, options: [] };
const INITIAL_META: MetaState = { glory: 0, lastEarned: 0, permanents: [] };
const INITIAL_PROFILE: ProfileView = {
  bestTimeSec: 0,
  bestLevel: 0,
  mostKills: 0,
  runCount: 0,
  masterVolume: 0.6,
};

export const useUiStore = create<UiStore>((set) => ({
  screen: 'boot',
  menuView: 'root',
  hud: INITIAL_HUD,
  draft: INITIAL_DRAFT,
  result: null,
  meta: INITIAL_META,
  profile: INITIAL_PROFILE,
  chooseUpgrade: () => {},
  restartRun: () => {},
  toMenu: () => {},
  enterPit: () => {},
  buyPermanent: () => {},
  setMasterVolume: () => {},
  setScreen: (screen) => set({ screen }),
  setMenuView: (menuView) => set({ menuView }),
  setHud: (hud) => set({ hud }),
  setDraft: (draft) => set({ draft }),
  setResult: (result) => set({ result }),
  setMeta: (meta) => set({ meta }),
  setProfile: (profile) => set({ profile }),
  setChooseUpgrade: (chooseUpgrade) => set({ chooseUpgrade }),
  setRestartRun: (restartRun) => set({ restartRun }),
  setToMenu: (toMenu) => set({ toMenu }),
  setEnterPit: (enterPit) => set({ enterPit }),
  setBuyPermanent: (buyPermanent) => set({ buyPermanent }),
  setMasterVolumeBridge: (setMasterVolume) => set({ setMasterVolume }),
}));

// Non-React accessors for the boot/sim glue (avoid importing hooks there).
export const uiActions = {
  setScreen: (s: Screen) => useUiStore.getState().setScreen(s),
  setMenuView: (v: MenuView) => useUiStore.getState().setMenuView(v),
  setHud: (h: HudState) => useUiStore.getState().setHud(h),
  setDraft: (d: DraftState) => useUiStore.getState().setDraft(d),
  setResult: (r: RunResultView | null) => useUiStore.getState().setResult(r),
  setMeta: (m: MetaState) => useUiStore.getState().setMeta(m),
  setProfile: (p: ProfileView) => useUiStore.getState().setProfile(p),
  setChooseUpgrade: (fn: (i: number) => void) => useUiStore.getState().setChooseUpgrade(fn),
  setRestartRun: (fn: () => void) => useUiStore.getState().setRestartRun(fn),
  setToMenu: (fn: () => void) => useUiStore.getState().setToMenu(fn),
  setEnterPit: (fn: () => void) => useUiStore.getState().setEnterPit(fn),
  setBuyPermanent: (fn: (id: string) => void) => useUiStore.getState().setBuyPermanent(fn),
  setMasterVolumeBridge: (fn: (v: number) => void) =>
    useUiStore.getState().setMasterVolumeBridge(fn),
};
