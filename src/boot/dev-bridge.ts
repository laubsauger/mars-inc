// Dev control board bridge (T74). Every action routes through the real sim/save
// APIs (world.devXxx / save.mutate) — ⊥ a bespoke pipeline (V35). Live grants flag
// world.cheated so the run never banks. Permanents/Glory honour a PERSIST flag:
// persist → write the profile (a real grant); else → run-only. Split from main.ts.

import type { DevBridge } from '../ui/store-types';
import type { World } from '../sim/world';
import { DEV_UPGRADE_CATALOG } from '../sim/world';
import type { SaveManager } from '../save/save-manager';
import { WEAPONS } from '../content/weapons/index';
import { PERMANENT_UPGRADES } from '../content/permanent/index';
import { ENEMY_BY_VARIANT, ENEMY_DISPLAY_NAME } from '../sim/enemies';

/** Build the dev board bridge. `pushMeta` re-syncs the Glory/meta store slice
 *  after a currency/permanent mutation. */
export function createDevBridge(world: World, save: SaveManager, pushMeta: () => void): DevBridge {
  const dev: DevBridge = {
    upgrades: DEV_UPGRADE_CATALOG,
    weapons: WEAPONS.map((w) => ({ id: w.id, name: w.displayName })),
    permanents: PERMANENT_UPGRADES.map((p) => ({
      id: p.id,
      name: p.name,
      branch: p.branch,
      maxLevel: p.maxLevel,
    })),
    enemies: ENEMY_BY_VARIANT.flatMap((t, v) =>
      t ? [{ variant: v, name: ENEMY_DISPLAY_NAME[v] ?? `Variant ${v}` }] : [],
    ),
    grantUpgrade: (id: string) => world.devGrantUpgrade(id),
    upgradeLevelOf: (id: string) => world.upgradeLevelOf(id),
    setWeapon: (id: string) => world.devSetWeapon(id),
    evolve: () => world.devTryEvolve(),
    addLevels: (n: number) => world.devAddLevels(n),
    heal: () => world.devHeal(),
    toggleGodmode: () => world.devToggleGodmode(),
    godmode: () => world.devGodmode,
    spawn: (variant: number, count: number) => world.devSpawn(variant, count),
    forceBoss: () => world.devForceBoss(),
    clearEnemies: () => world.devClearEnemies(),
    openBossReward: () => world.devOpenBossReward(),
    weaponId: () => world.weaponSystem.primaryId ?? '',
    glory: () => save.current.currencies.martianGlory,
    ownedPermanent: (id: string) => save.current.permanentUpgrades[id] ?? 0,
    grantGlory: (amount: number) => {
      save.mutate((p) => {
        p.currencies.martianGlory = Math.max(0, p.currencies.martianGlory + amount);
      });
      pushMeta();
    },
    setPermanent: (id: string, level: number, persist: boolean) => {
      const lvl = Math.max(0, Math.floor(level));
      if (persist) {
        save.mutate((p) => {
          if (lvl <= 0) delete p.permanentUpgrades[id];
          else p.permanentUpgrades[id] = lvl;
        });
        world.setPermanents(save.current.permanentUpgrades);
      } else {
        // Run-only: a throwaway level map applied at the NEXT run start (Enter Pit /
        // restart) — doesn't touch the profile.
        const ephemeral = { ...save.current.permanentUpgrades };
        if (lvl <= 0) delete ephemeral[id];
        else ephemeral[id] = lvl;
        world.setPermanents(ephemeral);
      }
      pushMeta();
    },
    // Scenario = a portable snapshot of a build setup (weapon + owned card levels +
    // permanent-tree levels). Export to share / version / drive automated tests;
    // import to reconstruct it instantly (T74 scenario presets).
    exportScenario: (): string => {
      const upgrades: Record<string, number> = {};
      for (const u of DEV_UPGRADE_CATALOG) {
        const lvl = world.upgradeLevelOf(u.id);
        if (lvl > 0) upgrades[u.id] = lvl;
      }
      return JSON.stringify(
        {
          weapon: world.weaponSystem.primaryId ?? null,
          upgrades,
          permanents: { ...save.current.permanentUpgrades },
        },
        null,
        2,
      );
    },
    applyScenario: (text: string, persist: boolean): string | null => {
      let s: { weapon?: unknown; upgrades?: unknown; permanents?: unknown };
      try {
        s = JSON.parse(text) as typeof s;
      } catch {
        return 'invalid JSON';
      }
      if (typeof s !== 'object' || s === null) return 'not a scenario object';
      if (typeof s.weapon === 'string') world.devSetWeapon(s.weapon);
      if (s.permanents && typeof s.permanents === 'object') {
        for (const [id, lvl] of Object.entries(s.permanents as Record<string, unknown>)) {
          if (typeof lvl === 'number') dev.setPermanent(id, lvl, persist);
        }
      }
      if (s.upgrades && typeof s.upgrades === 'object') {
        // Raise each card to its target level (grants are additive +1 per call).
        for (const [id, target] of Object.entries(s.upgrades as Record<string, unknown>)) {
          if (typeof target !== 'number') continue;
          for (let cur = world.upgradeLevelOf(id); cur < target; cur++) {
            if (!world.devGrantUpgrade(id)) break; // unknown id → stop that card
          }
        }
      }
      pushMeta();
      return null; // ok
    },
  };
  return dev;
}
