import { test, expect } from '@playwright/test';
import { enterPit } from './helpers';

type Hook = {
  world: {
    enemies: { count: number; posX: Float32Array; posZ: Float32Array };
    player: { pos: { x: number; z: number } };
  };
};

test('enemies spawn through gates and converge on the player (T11-T13)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await enterPit(page);

  // Let the spawner run; enemies stream in.
  await page.waitForFunction(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.enemies.count > 10,
    { timeout: 10000 },
  );

  // Steering pulls at least one enemy close to the player (seek works).
  await page.waitForFunction(
    () => {
      const w = (window as unknown as { __MARS__: Hook }).__MARS__.world;
      let min = Infinity;
      for (let i = 0; i < w.enemies.count; i++) {
        const dx = w.enemies.posX[i] - w.player.pos.x;
        const dz = w.enemies.posZ[i] - w.player.pos.z;
        min = Math.min(min, Math.hypot(dx, dz));
      }
      // Spawn at the rim (~r 33). Crossing deep inside proves seek steering,
      // independent of the auto-weapon thinning the closest ones (range ~16).
      return min < 14;
    },
    { timeout: 12000 },
  );
});
