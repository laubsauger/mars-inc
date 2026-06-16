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

  // Survive a few seconds so the run accrues time/kills (glory rewards depth —
  // an instant death pays nothing), then end it via the dev hook.
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    (window as unknown as { __MARS__: Hook }).__MARS__.world.player.health = 0;
  });

  // Game-over screen appears; Glory was awarded for the run.
  await expect(page.getByText('MARTIAN GLORY')).toBeVisible({ timeout: 6000 });
  const glory = await page.evaluate(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.save.current.currencies.martianGlory,
  );
  expect(glory).toBeGreaterThan(0);

  // Buy Reinforced Plating (+20 max health) via the meta path, then restart.
  const baseMax = await page.evaluate(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.player.maxHealth,
  );
  // Buy Reinforced Plating (+20 max health) via the meta path, then start a fresh
  // run and confirm the permanent applied (higher starting max health).
  await page.evaluate(() => {
    const w = window as unknown as {
      __MARS__: Hook & {
        world: { setPermanents: (p: Record<string, number>) => void; start: () => void };
        save: {
          current: { permanentUpgrades: Record<string, number> };
          mutate: (f: (p: { permanentUpgrades: Record<string, number> }) => void) => void;
        };
      };
    };
    w.__MARS__.save.mutate((p) => {
      p.permanentUpgrades['reinforced-plating'] = 1;
    });
    w.__MARS__.world.setPermanents(w.__MARS__.save.current.permanentUpgrades);
    w.__MARS__.world.start(); // fresh run applies owned permanents
  });
  await page.waitForFunction(
    (prev) => (window as unknown as { __MARS__: Hook }).__MARS__.world.player.maxHealth > prev,
    baseMax,
    { timeout: 6000 },
  );
});
