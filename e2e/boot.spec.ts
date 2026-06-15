import { test, expect } from '@playwright/test';

// Foundation smoke (T31 partial). Runs in real Chrome with WebGPU enabled.
test('boots, initializes WebGPU, renders the arena canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');

  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);

  if (hasWebGpu) {
    // Real GPU path: canvas mounts, unsupported screen must NOT show.
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('requires')).toHaveCount(0);
    // Renderer actually drew (drawCalls > 0 exposed via dev overlay text).
    await expect(page.getByText(/draws \d+/)).toBeVisible({ timeout: 15000 });
  } else {
    // No WebGPU: unsupported screen is the correct, non-broken outcome.
    await expect(page.getByText('requires')).toBeVisible({ timeout: 15000 });
  }

  expect(errors, errors.join('\n')).toHaveLength(0);
});
