import { test, expect } from '@playwright/test';

test('batch1 direction cards register + fire', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mars:controls-seen', '1'));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__MARS__, { timeout: 15000 });
  await page.getByRole('button', { name: /Enter the Pit/i }).click();
  await page.waitForFunction(() => (window as any).__MARS__.world.started, { timeout: 5000 });

  // New cards are in the dev catalog (→ in DRAFT_POOL).
  const ids = await page.evaluate(() =>
    (window as any).__MARS__.dev.upgrades.map((u: { id: string }) => u.id),
  );
  for (const id of ['killing-spree', 'adrenaline-dump', 'breather', 'slipstream-rounds', 'blood-engine', 'phoenix-protocol']) {
    expect(ids).toContain(id);
  }

  // Slipstream Rounds: grant it, spawn a cluster, sprint → the burst deals damage
  // (the sprint trigger fires). Verify enemy count drops or damage accrues.
  const dealt = await page.evaluate(async () => {
    const w = (window as any).__MARS__.world;
    (window as any).__MARS__.dev.grantUpgrade('slipstream-rounds');
    (window as any).__MARS__.dev.spawn(0, 12); // mites around the player
    const before = w.stats.damageDealt;
    // Drive a sprint rising edge through the input snapshot for a few steps.
    w.input = { ...w.input, moveX: 1, sprint: true };
    for (let i = 0; i < 10; i++) w.step(1 / 60);
    return w.stats.damageDealt - before;
  });
  expect(dealt).toBeGreaterThan(0);
});
