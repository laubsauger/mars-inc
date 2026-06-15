import type { Page } from '@playwright/test';

/** Wait for boot, then start a run from the main menu (T27). */
export async function enterPit(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { __MARS__?: unknown }).__MARS__, {
    timeout: 15000,
  });
  await page.getByRole('button', { name: /Enter the Pit/i }).click();
  await page.waitForFunction(
    () =>
      (window as unknown as { __MARS__: { world: { started: boolean } } }).__MARS__.world.started,
    { timeout: 5000 },
  );
}
