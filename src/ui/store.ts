// App/UI store (Zustand). React screens/HUD subscribe to NARROW slices so a HUD
// tick never re-renders sibling chunks. The Three canvas lives in plain DOM,
// outside React — store updates never touch it. §14.1.

import { create } from 'zustand';

// View-shape types live in store-types.ts; re-exported here so the public import
// surface stays `./store`. Local `import type` brings them into scope for UiStore.
export type {
  Screen,
  MenuView,
  RecordRow,
  ProfileView,
  SettingsView,
  RunResultView,
  HudState,
  InspectView,
  AnnounceState,
  BossView,
  DraftOption,
  DraftState,
  BossRewardOption,
  BossRewardState,
  FloatingLabel,
  SheetView,
  PermanentView,
  PrestigeNodeView,
  MetaState,
  AchievementToast,
  DevBridge,
  EffectStatus,
} from './store-types';
import type {
  Screen,
  MenuView,
  ProfileView,
  SettingsView,
  RunResultView,
  HudState,
  InspectView,
  AnnounceState,
  BossView,
  DraftState,
  BossRewardState,
  ConclusionState,
  FloatingLabel,
  SheetView,
  MetaState,
  AchievementToast,
  DevBridge,
} from './store-types';

export interface UiStore {
  screen: Screen;
  menuView: MenuView;
  /** Dev control board (T74): open state + the boot-set action bridge. */
  devOpen: boolean;
  dev: DevBridge | null;
  hud: HudState;
  boss: BossView;
  announce: AnnounceState | null;
  /** Rich achievement-unlock toast (T-ach) — coexists with `announce`. */
  achievement: AchievementToast | null;
  inspect: InspectView | null;
  draft: DraftState;
  bossReward: BossRewardState;
  conclusion: ConclusionState;
  labels: FloatingLabel[];
  sheet: SheetView | null;
  result: RunResultView | null;
  meta: MetaState;
  profile: ProfileView;
  settings: SettingsView;
  /** Bridge to sim — set by boot glue, called by the upgrade screen. */
  chooseUpgrade: (index: number) => void;
  chooseBossReward: (index: number) => void;
  /** Bridge to sim — resolve the end-of-act conclusion: extract or Overrun (T75). */
  chooseConclusion: (extract: boolean) => void;
  /** Bridge to sim — surrender the run (honorable self-death, banks progress, T76). */
  surrenderRun: () => void;
  /** Bridge to sim — re-roll unlocked draft options (T41). */
  rerollDraft: (lockedIds: string[]) => void;
  /** Bridge to sim — banish a draft option for the run (T41). */
  banishOption: (index: number) => void;
  /** Bridge to sim — hold a draft option for the next level-up (T71). */
  lockCard: (index: number) => void;
  /** Bridge to sim — banish every card carrying a tag from the run pool (T71). */
  banishTag: (tag: string) => void;
  /** Bridge to sim — skip the draft for a heal (T41). */
  skipDraft: () => void;
  /** Bridge to sim — restart the run in place (no reload), set by boot glue. */
  restartRun: () => void;
  /** Bridge to sim — leave a finished run and return to the menu. */
  toMenu: () => void;
  /** Bridge to sim — enter the pit from the menu (start a fresh run). */
  enterPit: () => void;
  /** Bridge to sim — actually begin combat (countdown + spawns). Deferred until the
   *  player dismisses the field-briefing so nothing runs behind the instructions. */
  startCombat: () => void;
  /** Bridge to render — reset the orbit/zoom camera to the framed default. */
  resetView: () => void;
  /** Bridge to sim — toggle pause (used by the pause-menu Resume button). */
  togglePause: () => void;
  /** Bridge to save — buy a permanent upgrade with Martian Glory. */
  buyPermanent: (id: string) => void;
  /** Bridge to save — sacrifice the Glory tree for Red Dust (prestige, T72). */
  prestige: () => void;
  /** Bridge to save — buy a Red-Dust prestige node (T72). */
  buyPrestigeNode: (id: string) => void;
  /** Bridge to save — refund ALL spent Glory and clear the Glory Tree (respec). */
  resetPermanents: () => void;
  /** Bridge to save — wipe ALL persisted progress and reload to a fresh profile. */
  resetProgress: () => void;
  /** Bridge to save — change settings/accessibility (persists + applies live). */
  applySetting: (patch: Partial<SettingsView>) => void;
  setScreen: (s: Screen) => void;
  setMenuView: (v: MenuView) => void;
  setHud: (h: HudState) => void;
  setBoss: (b: BossView) => void;
  setAnnounce: (a: AnnounceState) => void;
  setAchievement: (a: AchievementToast) => void;
  setInspect: (v: InspectView | null) => void;
  setDraft: (d: DraftState) => void;
  setResult: (r: RunResultView | null) => void;
  setMeta: (m: MetaState) => void;
  setProfile: (p: ProfileView) => void;
  setSettings: (s: SettingsView) => void;
  setChooseUpgrade: (fn: (index: number) => void) => void;
  setBossReward: (b: BossRewardState) => void;
  setChooseBossReward: (fn: (index: number) => void) => void;
  setConclusion: (c: ConclusionState) => void;
  setChooseConclusion: (fn: (extract: boolean) => void) => void;
  setSurrenderRun: (fn: () => void) => void;
  setLabels: (l: FloatingLabel[]) => void;
  setSheet: (s: SheetView | null) => void;
  setRerollDraft: (fn: (lockedIds: string[]) => void) => void;
  setBanishOption: (fn: (index: number) => void) => void;
  setLockCard: (fn: (index: number) => void) => void;
  setBanishTag: (fn: (tag: string) => void) => void;
  setSkipDraft: (fn: () => void) => void;
  setRestartRun: (fn: () => void) => void;
  setToMenu: (fn: () => void) => void;
  setEnterPit: (fn: () => void) => void;
  setStartCombat: (fn: () => void) => void;
  setResetView: (fn: () => void) => void;
  setTogglePause: (fn: () => void) => void;
  setBuyPermanent: (fn: (id: string) => void) => void;
  setPrestige: (fn: () => void) => void;
  setBuyPrestigeNode: (fn: (id: string) => void) => void;
  setResetPermanents: (fn: () => void) => void;
  setResetProgress: (fn: () => void) => void;
  setApplySetting: (fn: (patch: Partial<SettingsView>) => void) => void;
  toggleDev: () => void;
  setDev: (dev: DevBridge) => void;
}

const INITIAL_HUD: HudState = {
  health: 100,
  maxHealth: 100,
  sprintCharges: 1,
  sprintCooldown01: 1,
  paused: false,
  elapsed: 0,
  wave: 0,
  level: 1,
  xp01: 0,
  countdown: 3,
  bossEta: null,
  enemiesAlive: 0,
  weapon: 'Contractual Sidearm',
  shieldCharges: 0,
  shieldMax: 0,
  sprintMax: 1,
  grenade01: 1,
  autoShoot: false,
  rage: 0,
  rageMax: 12,
  runGlory: 0,
  effects: [],
};

const INITIAL_DRAFT: DraftState = {
  open: false,
  level: 1,
  options: [],
  rerollsLeft: 0,
  banishesLeft: 0,
  locksLeft: 0,
  tagBanishesLeft: 0,
  lockedId: null,
};
const INITIAL_META: MetaState = {
  glory: 0,
  lastEarned: 0,
  permanents: [],
  redDust: 0,
  prestigeCount: 0,
  prestigeUnlocked: false,
  prestigeReady: 0,
  prestigeNodes: [],
};
const INITIAL_PROFILE: ProfileView = {
  bestTimeSec: 0,
  bossDefeated: false,
  difficultyUnlocked: false,
  discoveredWeapons: [],
  achievements: {},
  bestLevel: 0,
  mostKills: 0,
  runCount: 0,
  byCombo: [],
};
const INITIAL_SETTINGS: SettingsView = {
  masterVolume: 0.6,
  sfxVolume: 1,
  musicVolume: 0.7,
  screenShake: 1,
  reduceFlash: false,
  uiScale: 1,
  holdToSprint: false,
  pauseOnFocusLoss: true,
  enemyHealthbars: false,
  toonShading: false,
  ambientOcclusion: false,
  arenaId: 'cold-vault',
  difficulty: 0,
  showCountdown: false,
  cameraControls: false,
  showGrenadeRange: true,
  projectileLighting: true,
  musicInCombat: true,
  colorblind: 'off',
};

export const useUiStore = create<UiStore>((set) => ({
  screen: 'boot',
  menuView: 'root',
  devOpen: false,
  dev: null,
  hud: INITIAL_HUD,
  boss: { active: false, hp01: 0, phase: 0, phases: 3, name: '', tier: 'final' },
  announce: null,
  achievement: null,
  inspect: null,
  draft: INITIAL_DRAFT,
  bossReward: { open: false, id: 0, options: [] },
  conclusion: { open: false, id: 0 },
  labels: [],
  sheet: null,
  result: null,
  meta: INITIAL_META,
  profile: INITIAL_PROFILE,
  settings: INITIAL_SETTINGS,
  chooseUpgrade: () => {},
  chooseBossReward: () => {},
  chooseConclusion: () => {},
  surrenderRun: () => {},
  rerollDraft: () => {},
  banishOption: () => {},
  lockCard: () => {},
  banishTag: () => {},
  skipDraft: () => {},
  restartRun: () => {},
  toMenu: () => {},
  enterPit: () => {},
  startCombat: () => {},
  resetView: () => {},
  togglePause: () => {},
  buyPermanent: () => {},
  prestige: () => {},
  buyPrestigeNode: () => {},
  resetPermanents: () => {},
  resetProgress: () => {},
  applySetting: () => {},
  setScreen: (screen) => set({ screen }),
  setMenuView: (menuView) => set({ menuView }),
  setHud: (hud) => set({ hud }),
  setBoss: (boss) => set({ boss }),
  setAnnounce: (announce) => set({ announce }),
  setAchievement: (achievement) => set({ achievement }),
  setInspect: (inspect) => set({ inspect }),
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
  setConclusion: (conclusion) => set({ conclusion }),
  setChooseConclusion: (chooseConclusion) => set({ chooseConclusion }),
  setSurrenderRun: (surrenderRun) => set({ surrenderRun }),
  setRerollDraft: (rerollDraft) => set({ rerollDraft }),
  setBanishOption: (banishOption) => set({ banishOption }),
  setLockCard: (lockCard) => set({ lockCard }),
  setBanishTag: (banishTag) => set({ banishTag }),
  setSkipDraft: (skipDraft) => set({ skipDraft }),
  setRestartRun: (restartRun) => set({ restartRun }),
  setToMenu: (toMenu) => set({ toMenu }),
  setEnterPit: (enterPit) => set({ enterPit }),
  setStartCombat: (startCombat) => set({ startCombat }),
  setResetView: (resetView) => set({ resetView }),
  setTogglePause: (togglePause) => set({ togglePause }),
  setBuyPermanent: (buyPermanent) => set({ buyPermanent }),
  setPrestige: (prestige) => set({ prestige }),
  setBuyPrestigeNode: (buyPrestigeNode) => set({ buyPrestigeNode }),
  setResetPermanents: (resetPermanents) => set({ resetPermanents }),
  setResetProgress: (resetProgress) => set({ resetProgress }),
  setApplySetting: (applySetting) => set({ applySetting }),
  toggleDev: () => set((s) => ({ devOpen: !s.devOpen })),
  setDev: (dev) => set({ dev }),
}));

// Non-React accessors for the boot/sim glue (avoid importing hooks there).
export const uiActions = {
  setScreen: (s: Screen) => useUiStore.getState().setScreen(s),
  setMenuView: (v: MenuView) => useUiStore.getState().setMenuView(v),
  setHud: (h: HudState) => useUiStore.getState().setHud(h),
  setBoss: (b: BossView) => useUiStore.getState().setBoss(b),
  setAnnounce: (a: AnnounceState) => useUiStore.getState().setAnnounce(a),
  setAchievement: (a: AchievementToast) => useUiStore.getState().setAchievement(a),
  setInspect: (v: InspectView | null) => useUiStore.getState().setInspect(v),
  setDraft: (d: DraftState) => useUiStore.getState().setDraft(d),
  setBossReward: (b: BossRewardState) => useUiStore.getState().setBossReward(b),
  setLabels: (l: FloatingLabel[]) => useUiStore.getState().setLabels(l),
  setSheet: (sh: SheetView | null) => useUiStore.getState().setSheet(sh),
  setChooseBossReward: (fn: (i: number) => void) => useUiStore.getState().setChooseBossReward(fn),
  setConclusion: (c: ConclusionState) => useUiStore.getState().setConclusion(c),
  setChooseConclusion: (fn: (extract: boolean) => void) =>
    useUiStore.getState().setChooseConclusion(fn),
  setSurrenderRun: (fn: () => void) => useUiStore.getState().setSurrenderRun(fn),
  setResult: (r: RunResultView | null) => useUiStore.getState().setResult(r),
  setMeta: (m: MetaState) => useUiStore.getState().setMeta(m),
  setProfile: (p: ProfileView) => useUiStore.getState().setProfile(p),
  setSettings: (s: SettingsView) => useUiStore.getState().setSettings(s),
  setChooseUpgrade: (fn: (i: number) => void) => useUiStore.getState().setChooseUpgrade(fn),
  setRerollDraft: (fn: (ids: string[]) => void) => useUiStore.getState().setRerollDraft(fn),
  setBanishOption: (fn: (i: number) => void) => useUiStore.getState().setBanishOption(fn),
  setLockCard: (fn: (i: number) => void) => useUiStore.getState().setLockCard(fn),
  setBanishTag: (fn: (tag: string) => void) => useUiStore.getState().setBanishTag(fn),
  setSkipDraft: (fn: () => void) => useUiStore.getState().setSkipDraft(fn),
  setRestartRun: (fn: () => void) => useUiStore.getState().setRestartRun(fn),
  setToMenu: (fn: () => void) => useUiStore.getState().setToMenu(fn),
  setEnterPit: (fn: () => void) => useUiStore.getState().setEnterPit(fn),
  setStartCombat: (fn: () => void) => useUiStore.getState().setStartCombat(fn),
  setResetView: (fn: () => void) => useUiStore.getState().setResetView(fn),
  setTogglePause: (fn: () => void) => useUiStore.getState().setTogglePause(fn),
  setBuyPermanent: (fn: (id: string) => void) => useUiStore.getState().setBuyPermanent(fn),
  setPrestige: (fn: () => void) => useUiStore.getState().setPrestige(fn),
  setBuyPrestigeNode: (fn: (id: string) => void) => useUiStore.getState().setBuyPrestigeNode(fn),
  setResetPermanents: (fn: () => void) => useUiStore.getState().setResetPermanents(fn),
  setResetProgress: (fn: () => void) => useUiStore.getState().setResetProgress(fn),
  setApplySetting: (fn: (patch: Partial<SettingsView>) => void) =>
    useUiStore.getState().setApplySetting(fn),
  setDev: (dev: DevBridge) => useUiStore.getState().setDev(dev),
};
