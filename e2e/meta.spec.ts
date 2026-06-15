import { test, expect } from '@playwright/test';
import { enterPit } from './helpers';

type Hook = {
  world: { player: { health: number; maxHealth: number }; result: unknown; reset: () => void };
  save: {
    current: { currencies: { martianGlory: number } };
    mutate: (f: (p: { currencies: { martianGlory: number } }) => void) => void;
  };
  refreshMeta: () => void;
};

test('die → earn Glory → buy permanent → next run applies it (T26)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  await enterPit(page);

  // Kill the player via the dev hook to end the run deterministically.
  await page.evaluate(() => {
    (window as unknown as { __MARS__: Hook }).__MARS__.world.player.health = 0;
  });

  // Game-over screen appears; Glory was awarded (level 1 alone gives > 0).
  await expect(page.getByText('MARTIAN GLORY')).toBeVisible({ timeout: 6000 });
  const glory = await page.evaluate(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.save.current.currencies.martianGlory,
  );
  expect(glory).toBeGreaterThan(0);

  // Grant enough Glory + buy Reinforced Plating (+20 max health), then restart.
  const baseMax = await page.evaluate(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.player.maxHealth,
  );
  await page.evaluate(() => {
    const w = (window as unknown as { __MARS__: Hook }).__MARS__;
    w.save.mutate((p) => {
      p.currencies.martianGlory += 1000;
    });
    w.refreshMeta(); // re-push the meta slice so the buy button enables
  });
  await page.getByRole('button', { name: /Reinforced Plating/ }).click();

  // Restart and confirm the permanent took effect (higher starting max health).
  await page.getByRole('button', { name: 'RESTART' }).click();
  await page.waitForFunction(
    (prev) => (window as unknown as { __MARS__: Hook }).__MARS__.world.player.maxHealth > prev,
    baseMax,
    { timeout: 6000 },
  );
});
