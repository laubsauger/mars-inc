import { test, expect } from '@playwright/test';

// No-WebGPU device → the app must show a clear unsupported screen, never a
// broken/degraded render path (§C, §I.url). We stub away navigator.gpu before
// the app boots so the support check fails on a real GPU machine too.
test('no-WebGPU → unsupported screen (T31, §C)', async ({ page }) => {
  await page.addInitScript(() => {
    // The boot check is `'gpu' in navigator`, so a getter returning undefined is
    // NOT enough (the key still exists). Delete it from the instance AND the
    // Navigator prototype so the `in` test is genuinely false.
    try {
      delete (navigator as { gpu?: unknown }).gpu;
      const proto = Object.getPrototypeOf(navigator);
      if (proto && 'gpu' in proto) delete proto.gpu;
    } catch {
      /* best-effort */
    }
  });
  await page.goto('/');

  await expect(page.getByText('This game requires')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('WebGPU').first()).toBeVisible();
  // No combat canvas should be mounted on the unsupported path.
  await expect(page.locator('canvas')).toHaveCount(0);
});
