// T32: the perf benchmark must run the standard scenes and stay within the
// structural invariants — counts pooled & bounded (V5), and sim outcome
// independent of any quality tier (V17: the sim takes no tier input, so two runs
// of a scene on the same seed are identical). Absolute timing is recorded and
// logged for inspection, not asserted (CI hardware varies); only a gross
// heap-growth ceiling guards against an accidental per-frame allocation leak.

import { describe, it, expect } from 'vitest';
import { runScene, STANDARD_SCENES, formatReport, type SceneMetrics } from './scenes';
import { MAX_ENEMIES } from '../sim/enemies';
import { MAX_PROJECTILES } from '../sim/combat/projectiles';

describe('perf benchmark scenes (T32)', () => {
  it('runs every standard scene within pooled bounds and reports metrics', () => {
    const rows: SceneMetrics[] = STANDARD_SCENES.map(runScene);

    for (const m of rows) {
      expect(m.steps).toBeGreaterThan(0);
      expect(m.msPerStep).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(m.msPerStep)).toBe(true);
      // Pools never exceed their fixed capacity (V5).
      expect(m.endEnemies).toBeLessThanOrEqual(MAX_ENEMIES);
      expect(m.endProjectiles).toBeLessThanOrEqual(MAX_PROJECTILES);
      // GPU metrics are honestly absent headless.
      expect(m.drawCalls).toBeNull();
      expect(m.renderMs).toBeNull();
      // Gross-leak guard only — hot systems pool, so heap growth stays modest.
      expect(m.heapDeltaKb).toBeLessThan(100_000);
    }

    // Surface the numbers for `pnpm test` / manual perf tracking.

    console.log('\n' + formatReport(rows) + '\n');
  });

  it('sim outcome is tier-independent: same seed → identical end state (V17)', () => {
    const spec = STANDARD_SCENES[1]!; // crowd-1k
    const a = runScene(spec);
    const b = runScene(spec);
    expect(a.endEnemies).toBe(b.endEnemies);
    expect(a.endProjectiles).toBe(b.endProjectiles);
  });
});
