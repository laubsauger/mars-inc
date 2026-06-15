import { test, expect } from '@playwright/test';

type MarsHook = { world: { player: { pos: { x: number; z: number } } } };

async function playerPos(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __MARS__?: MarsHook };
    return w.__MARS__ ? { ...w.__MARS__.world.player.pos } : null;
  });
}

test('WASD moves the player on x,z (T6)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => !!(window as unknown as { __MARS__?: unknown }).__MARS__, {
    timeout: 15000,
  });

  const start = await playerPos(page);
  expect(start).not.toBeNull();

  // Hold D (move +x) then S (move +z).
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(200);

  const end = await playerPos(page);
  expect(end!.x).toBeGreaterThan(start!.x + 1);
  expect(end!.z).toBeGreaterThan(start!.z + 1);
});
