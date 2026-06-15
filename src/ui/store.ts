// App/UI store (Zustand). React screens/HUD subscribe to NARROW slices so a HUD
// tick never re-renders sibling chunks. The Three canvas lives in plain DOM,
// outside React — store updates never touch it. §14.1.

import { create } from 'zustand';

export type Screen = 'boot' | 'unsupported' | 'arena';

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

export interface UiStore {
  screen: Screen;
  hud: HudState;
  draft: DraftState;
  /** Bridge to sim — set by boot glue, called by the upgrade screen. */
  chooseUpgrade: (index: number) => void;
  setScreen: (s: Screen) => void;
  setHud: (h: HudState) => void;
  setDraft: (d: DraftState) => void;
  setChooseUpgrade: (fn: (index: number) => void) => void;
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
};

const INITIAL_DRAFT: DraftState = { open: false, level: 1, options: [] };

export const useUiStore = create<UiStore>((set) => ({
  screen: 'boot',
  hud: INITIAL_HUD,
  draft: INITIAL_DRAFT,
  chooseUpgrade: () => {},
  setScreen: (screen) => set({ screen }),
  setHud: (hud) => set({ hud }),
  setDraft: (draft) => set({ draft }),
  setChooseUpgrade: (chooseUpgrade) => set({ chooseUpgrade }),
}));

// Non-React accessors for the boot/sim glue (avoid importing hooks there).
export const uiActions = {
  setScreen: (s: Screen) => useUiStore.getState().setScreen(s),
  setHud: (h: HudState) => useUiStore.getState().setHud(h),
  setDraft: (d: DraftState) => useUiStore.getState().setDraft(d),
  setChooseUpgrade: (fn: (i: number) => void) => useUiStore.getState().setChooseUpgrade(fn),
};
