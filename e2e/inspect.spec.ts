import { test } from '@playwright/test';
import { enterPit } from './helpers';

test('inspect center meshes', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?play');
  if (!(await page.evaluate(() => 'gpu' in navigator))) test.skip();
  await enterPit(page).catch(() => {});
  await page.waitForTimeout(1500); // let a frame render so views sync

  const hits = await page.evaluate(() => {
    type Obj = {
      type: string;
      visible: boolean;
      name: string;
      geometry?: { type: string; parameters?: Record<string, number> };
      material?: { color?: { getHexString: () => string } };
      getWorldPosition: (v: { x: number; y: number; z: number }) => { x: number; y: number; z: number };
      isMesh?: boolean;
      count?: number;
    };
    const scene = (window as unknown as { __MARS__: { scene: { traverse: (cb: (o: Obj) => void) => void } } })
      .__MARS__.scene;
    const out: string[] = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const p = o.getWorldPosition({ x: 0, y: 0, z: 0 });
      const distXZ = Math.hypot(p.x, p.z);
      // Near the arena centre, lifted off the ground (vertical thing, not floor).
      if (distXZ > 5 || p.y < 0.4) return;
      const g = o.geometry;
      const col = o.material?.color?.getHexString?.() ?? '?';
      out.push(
        `${g?.type ?? '?'} ${JSON.stringify(g?.parameters ?? {})} col=#${col} pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) count=${o.count ?? '-'}`,
      );
    });
    return out;
  });
  console.log('\n=== CENTER MESHES (distXZ<5, y>0.4) ===\n' + hits.join('\n') + '\n');
});
