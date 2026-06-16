import { test, expect } from '@playwright/test';
import { enterPit } from './helpers';

type Hook = { world: { elapsed: number } };
const elapsed = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __MARS__: Hook }).__MARS__.world.elapsed);

test('canvas tracks the viewport across resizes (T31, V7)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15000 });

  for (const [w, h] of [
    [800, 1200], // tall portrait
    [1600, 600], // wide letterbox
    [1024, 768], // back to a normal box
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    // The render surface fills the window at every aspect (whole arena stays framed).
    expect(box!.width).toBeGreaterThan(w * 0.9);
    expect(box!.height).toBeGreaterThan(h * 0.9);
  }
});

test('auto-pause on focus loss freezes the run clock (T31, T36)', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'gpu' in navigator)), 'no WebGPU in this browser');
  await enterPit(page);
  await page.waitForFunction(
    () => (window as unknown as { __MARS__: Hook }).__MARS__.world.elapsed > 0.5,
    { timeout: 8000 },
  );

  // Simulate the tab going hidden (pauseOnFocusLoss defaults on).
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const e1 = await elapsed(page);
  await page.waitForTimeout(400);
  const e2 = await elapsed(page);
  expect(Math.abs(e2 - e1)).toBeLessThan(0.05); // frozen while hidden

  // Tab returns → the run resumes.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const e3 = await elapsed(page);
  await page.waitForTimeout(400);
  expect(await elapsed(page)).toBeGreaterThan(e3 + 0.1);
});
