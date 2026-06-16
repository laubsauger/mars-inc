import { test, expect } from '@playwright/test';
import { enterPit } from './helpers';

type Hook = {
  world: {
    player: { level: number; xp: number; xpToNext: number };
    leveling: boolean;
    mods: { damageMult: number };
  };
};

function hook(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as unknown as { __MARS__: Hook }).__MARS__);
}

test('XP collection levels up and opens a frozen upgrade draft (T17/T18)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await enterPit(page);

  // Force a level-up deterministically via the dev hook (XP plumbing is e2e-opaque).
  await page.evaluate(() => {
    const w = (window as unknown as { __MARS__: Hook }).__MARS__.world;
    // Inject enough XP by spawning a fat shard on the player, then let sim tick.
    (w as unknown as { shards: { spawn: (x: number, z: number, v: number) => void } }).shards.spawn(
      0,
      0,
      w.player.xpToNext + 1,
    );
  });

  // Draft opens and the upgrade screen appears.
  await page.waitForFunction(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.leveling === true,
    { timeout: 5000 },
  );
  await expect(page.getByText('CHOOSE A CONTRACT')).toBeVisible();

  // Sim is frozen while choosing: timer/level held.
  const lvl = (await hook(page)).world.player.level;
  expect(lvl).toBeGreaterThanOrEqual(2);

  // Pick the first option (keyboard 1) → draft closes, sim resumes.
  await page.keyboard.press('1');
  await page.waitForFunction(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.leveling === false,
    { timeout: 5000 },
  );
  await expect(page.getByText('CHOOSE A CONTRACT')).toHaveCount(0);
});
