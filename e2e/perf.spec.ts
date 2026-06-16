import { test } from '@playwright/test';
import { enterPit } from './helpers';

type Stress = { stress: (e?: number, m?: number, h?: number) => void };

async function measure(
  page: import('@playwright/test').Page,
  enemies: number,
  multishot: number,
): Promise<string> {
  // (Re)apply the load, then keep topping it up while we sample the overlay.
  const samples: { fps: number; sim: number; render: number; draws: number; en: number; pr: number }[] =
    await page.evaluate(
      async ([en, ms]) => {
        const w = (window as unknown as { __MARS__: Stress }).__MARS__;
        const overlay = document.querySelector('div[style*="ui-monospace"]') as HTMLElement | null;
        const parse = () => {
          const t = overlay?.textContent ?? '';
          const fps = +(t.match(/fps\s+([\d.]+)/)?.[1] ?? 0);
          const sim = +(t.match(/sim ([\d.]+)ms/)?.[1] ?? 0);
          const render = +(t.match(/render ([\d.]+)ms/)?.[1] ?? 0);
          const draws = +(t.match(/draws (\d+)/)?.[1] ?? 0);
          const enm = +(t.match(/enemies (\d+)/)?.[1] ?? 0);
          const pr = +(t.match(/proj (\d+)/)?.[1] ?? 0);
          return { fps, sim, render, draws, en: enm, pr };
        };
        const out: ReturnType<typeof parse>[] = [];
        w.stress(en as number, ms as number, 0.3);
        const frames = 180; // ~3s
        for (let f = 0; f < frames; f++) {
          await new Promise((r) => requestAnimationFrame(r));
          if (f % 20 === 0) w.stress(en as number, ms as number, 0.3); // top up attrition
          if (f > 60) out.push(parse()); // sample after warm-up
        }
        return out;
      },
      [enemies, multishot],
    );

  const avg = (k: 'fps' | 'sim' | 'render' | 'draws' | 'en' | 'pr') =>
    samples.reduce((a, s) => a + s[k], 0) / Math.max(1, samples.length);
  return `enemies~${avg('en').toFixed(0)} proj~${avg('pr').toFixed(0)} multishot=${multishot} | fps ${avg('fps').toFixed(0)} | sim ${avg('sim').toFixed(2)}ms render ${avg('render').toFixed(2)}ms | draws ${avg('draws').toFixed(0)}`;
}

test('perf profile', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?play');
  if (!(await page.evaluate(() => 'gpu' in navigator))) test.skip();
  await enterPit(page).catch(() => {});
  await page.waitForFunction(
    () => typeof (window as unknown as { __MARS__: Stress }).__MARS__.stress === 'function',
  );

  const lines: string[] = [];
  for (const [en, ms] of [
    [400, 4],
    [1000, 8],
    [2000, 12],
    [2000, 24],
  ] as const) {
    lines.push(await measure(page, en, ms));
  }
  console.log('\n=== PERF PROFILE ===\n' + lines.join('\n') + '\n');
});
