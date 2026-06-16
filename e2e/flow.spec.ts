import { test, expect } from '@playwright/test';
import { enterPit } from './helpers';

type Hook = {
  world: {
    started: boolean;
    paused: boolean;
    elapsed: number;
    player: { health: number };
  };
};

const hook = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __MARS__: Hook }).__MARS__.world);

test('Escape pauses (freezes the run) and resumes (T31, §I.input)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  await enterPit(page);

  // Past the countdown so the run clock is live.
  await page.waitForFunction(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.elapsed > 0.5,
    { timeout: 8000 },
  );

  await page.keyboard.press('Escape');
  await expect(page.getByText('PAUSED')).toBeVisible({ timeout: 3000 });

  // Frozen: the run clock does not advance while paused.
  const e1 = (await hook(page)).elapsed;
  await page.waitForTimeout(400);
  const e2 = (await hook(page)).elapsed;
  expect(Math.abs(e2 - e1)).toBeLessThan(0.05);

  await page.keyboard.press('Escape');
  await expect(page.getByText('PAUSED')).toBeHidden({ timeout: 3000 });

  // Resumed: the clock advances again.
  const e3 = (await hook(page)).elapsed;
  await page.waitForTimeout(400);
  expect((await hook(page)).elapsed).toBeGreaterThan(e3 + 0.1);
});

test('death → game-over → restart runs in place, no page reload (T31, V15)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  await enterPit(page);
  await page.waitForFunction(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.elapsed > 0.5,
    { timeout: 8000 },
  );

  // A marker that only survives if the page is NOT reloaded.
  await page.evaluate(() => ((window as unknown as { __noReload?: number }).__noReload = 7));

  // Kill the player → game-over screen.
  await page.evaluate(() => {
    (window as unknown as { __MARS__: Hook }).__MARS__.world.player.health = 0;
  });
  await expect(page.getByRole('button', { name: 'RESTART' })).toBeVisible({ timeout: 6000 });

  await page.getByRole('button', { name: 'RESTART' }).click();

  // Fresh run in place: started, clock reset, and the marker survived (no reload).
  await page.waitForFunction(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.started,
    { timeout: 6000 },
  );
  const survived = await page.evaluate(
    () => (window as unknown as { __noReload?: number }).__noReload,
  );
  expect(survived).toBe(7);
});
