import { test, expect } from '@playwright/test';

type Hook = {
  save: {
    current: { settings: { masterVolume: number } };
    updateSettings: (p: { masterVolume: number }) => void;
    flush: () => Promise<boolean>;
  };
};

test('settings persist across a page refresh (T24, V14/V15)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  await page.waitForFunction(() => !!(window as unknown as { __MARS__?: Hook }).__MARS__?.save, {
    timeout: 15000,
  });

  // Change a persisted setting and flush to IndexedDB.
  await page.evaluate(async () => {
    const w = (window as unknown as { __MARS__: Hook }).__MARS__;
    w.save.updateSettings({ masterVolume: 0.33 });
    await w.save.flush();
  });

  // Reload — a fresh boot must restore it from storage.
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __MARS__?: Hook }).__MARS__?.save, {
    timeout: 15000,
  });

  const vol = await page.evaluate(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.save.current.settings.masterVolume,
  );
  expect(vol).toBe(0.33);
});
