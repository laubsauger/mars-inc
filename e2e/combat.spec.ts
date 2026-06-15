import { test, expect } from '@playwright/test';
import { enterPit } from './helpers';

type Hook = {
  world: {
    enemies: { count: number };
    weaponSystem: { projectiles: { count: number } };
    player: { aim: { x: number; z: number; has: boolean } };
    stats: { kills: number };
  };
};

function hook(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as unknown as { __MARS__: Hook }).__MARS__);
}

test('mouse-aimed weapon fires projectiles and kills enemies (T14/T15)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await enterPit(page);

  // Move the mouse over the arena → ground aim resolves.
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2);
  await page.waitForFunction(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.player.aim.has === true,
    { timeout: 5000 },
  );

  // Projectiles get spawned by the auto-firing weapon.
  await page.waitForFunction(
    () =>
      (window as unknown as { __MARS__: Hook }).__MARS__.world.weaponSystem.projectiles.count > 0,
    { timeout: 5000 },
  );

  // Let combat run; the weapon racks up kills (cumulative — robust vs. the
  // instantaneous projectile count, which dips to 0 between shots).
  await page.waitForFunction(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.stats.kills > 0,
    { timeout: 15000 },
  );
  const after = await hook(page);
  expect(after.world.stats.kills).toBeGreaterThan(0);
  expect(after.world.enemies.count).toBeGreaterThan(0); // still spawning
});
