// Projects the saved profile into the UI store's read-only ProfileView +
// SettingsView slices. Pure (reads SaveManager, returns plain view objects) — split
// from main.ts so the projection lives next to the view shapes and stays easy to
// extend when a setting/record is added.

import type { ProfileView, SettingsView } from './store-types';
import type { SaveManager } from '../save/save-manager';
import { ARENAS } from '../sim/arena';
import { arenaCharacterKey, emptyRecord } from '../save/profile';

/** Records + unlock-derived profile view. `character` is the active fighter (records
 *  bucket by arena × character). */
export function buildProfileView(
  save: SaveManager,
  character: { id: string; name: string },
): ProfileView {
  const r = save.current.records;
  // One row per (arena × character) combo — both are tracked together.
  const byCombo = Object.values(ARENAS).flatMap((a) =>
    [character].map((c) => {
      const rec =
        save.current.recordsByArenaCharacter[arenaCharacterKey(a.id, c.id)] ?? emptyRecord();
      return {
        id: `${a.id}|${c.id}`,
        arena: a.name,
        character: c.name,
        bestTimeSec: rec.bestTimeSec,
        bestLevel: rec.bestLevel,
        mostKills: rec.mostKills,
      };
    }),
  );
  return {
    bestTimeSec: r.bestTimeSec,
    bestLevel: r.bestLevel,
    mostKills: r.mostKills,
    runCount: save.current.runHistory.length,
    byCombo,
    bossDefeated: !!save.current.unlocks['boss-beaten'],
    discoveredWeapons: Object.keys(save.current.unlocks)
      .filter((k) => k.startsWith('weapon:') && save.current.unlocks[k])
      .map((k) => k.slice('weapon:'.length)),
  };
}

/** Settings + accessibility flattened into the editable store slice. */
export function buildSettingsView(save: SaveManager): SettingsView {
  const s = save.current.settings;
  return {
    masterVolume: s.masterVolume,
    sfxVolume: s.sfxVolume,
    musicVolume: s.musicVolume,
    screenShake: s.screenShake,
    reduceFlash: s.reduceFlash,
    uiScale: s.uiScale,
    holdToSprint: save.current.accessibility.holdToSprint,
    pauseOnFocusLoss: s.pauseOnFocusLoss,
    enemyHealthbars: s.enemyHealthbars,
    toonShading: s.toonShading,
    arenaId: s.arenaId,
    showCountdown: s.showCountdown,
    cameraControls: s.cameraControls,
    showGrenadeRange: s.showGrenadeRange,
    projectileLighting: s.projectileLighting,
    ambientOcclusion: s.ambientOcclusion,
    colorblind: save.current.accessibility.colorblindPalette,
  };
}
