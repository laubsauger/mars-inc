import { describe, it, expect } from 'vitest';
import {
  WaveDirector,
  budgetAt,
  computeAdaptation,
  hpScaleFor,
  countSawtooth,
  powerProgress,
  NEUTRAL_ADAPT,
} from './wave-director';
import {
  EnemyPool,
  RUST_MITE,
  PHASE_STALKER,
  FOREMAN_KRILL,
  SpawnKind,
  ENEMY_BY_VARIANT,
} from '../enemies';
import { Rng } from '../../core/rng';
import { FxQueue } from '../fx';
import { arenaContains } from '../arena';

describe('Phase Stalker teleporter (T33+)', () => {
  it('materializes at interior points (not gates) after the unlock time, with FX', () => {
    const d = new WaveDirector();
    d.reset();
    // Boss fights PAUSE normal emission (T75), and by the teleport-unlock time a boss
    // would be up — so clear the act roster first to isolate the inter-boss state.
    d.advanceBossStage();
    d.advanceBossStage();
    d.advanceBossStage();
    const pool = new EnemyPool();
    const rng = new Rng(3);
    const fx = new FxQueue();
    // Teleport unlock is stretched: TELE_AT 60 × TIMELINE_STRETCH 2 = 120s real.
    // Step ~40s of run time starting past that so a teleport wave fires.
    // Count teleporters as they spawn, then CLEAR the pool each step — without deaths
    // the gate waves would fill the concurrent cap and (correctly) block the teleporter,
    // which never happens in real play where the player mows the crowd down.
    let teleporters = 0;
    for (let t = 0; t < 40; t += 1 / 60) {
      d.step(pool, rng, 185 + t, 1 / 60, NEUTRAL_ADAPT, 1, fx);
      for (let i = 0; i < pool.count; i++) {
        if (pool.variant[i] === PHASE_STALKER.variant) {
          teleporters++;
          expect(pool.spawnKind[i]).toBe(SpawnKind.Teleport);
          // Interior of the arena, not out past a gate wall.
          expect(arenaContains(pool.posX[i]!, pool.posZ[i]!)).toBe(true);
        }
      }
      pool.count = 0; // simulate the field being cleared so the cap never gates spawns
    }
    expect(teleporters).toBeGreaterThan(0);
    expect(fx.events.some((e) => e.kind === 'teleport')).toBe(true);
  });

  it('does not teleport before the unlock time', () => {
    const d = new WaveDirector();
    const pool = new EnemyPool();
    const fx = new FxQueue();
    for (let t = 0; t < 40; t += 1 / 60) d.step(pool, new Rng(1), t, 1 / 60, NEUTRAL_ADAPT, 1, fx);
    expect(fx.events.some((e) => e.kind === 'teleport')).toBe(false);
  });
});

describe('power-tiered escalation (T44 rework — HP steps, count sawtooth)', () => {
  it('HP holds ×1 through the first tier, then steps HARD per tier', () => {
    expect(hpScaleFor(1, 0)).toBe(1); // L1, tier 0
    expect(hpScaleFor(5, 0)).toBe(1); // still tier 0 (L1–5)
    expect(hpScaleFor(6, 0)).toBeCloseTo(1.5); // tier 1
    expect(hpScaleFor(11, 0)).toBeCloseTo(2.25); // tier 2
    expect(hpScaleFor(16, 0)).toBeCloseTo(3.375); // tier 3 — fodder genuinely chunky
  });

  it('a boss kill jumps a whole power tier (big HP step)', () => {
    expect(hpScaleFor(1, 1)).toBeCloseTo(1.5); // +1 boss = +1 tier even at L1
    expect(hpScaleFor(6, 1)).toBeCloseTo(2.25); // tier 1 (level) + 1 (boss) = tier 2
  });

  it('count sawtooth drops at each tier and recovers across it', () => {
    expect(countSawtooth(1, 0)).toBeCloseTo(0.6); // fresh tier → thinned crowd (COUNT_FLOOR)
    expect(countSawtooth(5, 0)).toBeGreaterThan(countSawtooth(1, 0)); // recovers within tier
    // New tier RESETS the density (the sawtooth tooth): L6 (tier 1 start) < L5 peak.
    expect(countSawtooth(6, 0)).toBeLessThan(countSawtooth(5, 0));
  });

  it('powerProgress folds level + boss kills into one tier clock', () => {
    expect(powerProgress(1, 0)).toBe(0);
    expect(powerProgress(6, 0)).toBe(5);
    expect(powerProgress(1, 1)).toBe(5); // a boss = a full tier of progress
  });

  it('DAMPENS the HP scale for cheap fodder, applies it near-full to tanky units', () => {
    const pool = new EnemyPool();
    pool.spawn(RUST_MITE, 0, 0, 0, 0, 3); // 3× nominal scale
    // A mite (6 HP) barely scales — it stays meltable (upgrades shouldn't feel fake).
    expect(pool.maxHp[0]!).toBeGreaterThan(RUST_MITE.maxHealth); // still scales SOME
    expect(pool.maxHp[0]!).toBeLessThan(RUST_MITE.maxHealth * 3 * 0.6); // well under full 3×
    // A tanky unit (FOREMAN_KRILL, 80+ HP) takes nearly the full curve.
    pool.spawn(FOREMAN_KRILL, 0, 0, 0, 0, 3);
    expect(pool.maxHp[1]!).toBeGreaterThan(FOREMAN_KRILL.maxHealth * 3 * 0.9);
  });
});

describe('computeAdaptation (T21/V12 bounded, composition not raw stats)', () => {
  it('neutral build → ~neutral adaptation', () => {
    const a = computeAdaptation({ damageMult: 1, fireRateMult: 1, projectileCount: 1 });
    expect(a.pace).toBeCloseTo(1, 6);
    expect(a.houndBias).toBe(0);
  });

  it('strong offense accelerates pace but stays clamped ≤ 1.4', () => {
    const a = computeAdaptation({ damageMult: 5, fireRateMult: 5, projectileCount: 1 });
    expect(a.pace).toBeGreaterThan(1);
    expect(a.pace).toBeLessThanOrEqual(1.4);
  });

  it('weak offense never drops pace below 0.8', () => {
    const a = computeAdaptation({ damageMult: 0.1, fireRateMult: 0.1, projectileCount: 1 });
    expect(a.pace).toBeGreaterThanOrEqual(0.8);
  });

  it('multishot biases toward tankier targets, clamped ≤ 0.3', () => {
    const a = computeAdaptation({ damageMult: 1, fireRateMult: 1, projectileCount: 10 });
    expect(a.houndBias).toBeGreaterThan(0);
    expect(a.houndBias).toBeLessThanOrEqual(0.3);
  });
});

describe('budgetAt (T20 SpawnBudget curve)', () => {
  it('threat accrual and concurrent cap grow with time', () => {
    const early = budgetAt(0);
    const late = budgetAt(120);
    expect(late.threatPoints).toBeGreaterThan(early.threatPoints);
    expect(late.maxConcurrentEnemies).toBeGreaterThan(early.maxConcurrentEnemies);
  });
});

describe('WaveDirector (V8 bounded spawns)', () => {
  function simulate(seconds: number, pool: EnemyPool): WaveDirector {
    const d = new WaveDirector();
    const rng = new Rng(1);
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) d.step(pool, rng, t, dt);
    return d;
  }

  it('never exceeds the concurrent cap for the elapsed time', () => {
    const pool = new EnemyPool();
    const d = new WaveDirector();
    const rng = new Rng(3);
    const dt = 1 / 60;
    for (let t = 0; t < 60; t += dt) {
      d.step(pool, rng, t, dt);
      expect(pool.count).toBeLessThanOrEqual(budgetAt(t).maxConcurrentEnemies);
    }
  });

  it('actually spawns enemies over time', () => {
    const pool = new EnemyPool();
    simulate(10, pool);
    expect(pool.count).toBeGreaterThan(0);
  });

  it('bank is clamped — no unbounded hoard while pool is full', () => {
    // Tiny pool so it fills; the bank must not grow without bound.
    const pool = new EnemyPool(5);
    const d = simulate(30, pool);
    expect(pool.count).toBe(5);
    expect(d.banked).toBeLessThan(budgetAt(30).threatPoints * 5);
  });

  it('deterministic for a fixed seed (V16)', () => {
    const a = new EnemyPool();
    const b = new EnemyPool();
    simulate(8, a);
    simulate(8, b);
    expect(a.count).toBe(b.count);
    expect(Array.from(a.posX.slice(0, a.count))).toEqual(Array.from(b.posX.slice(0, b.count)));
  });

  it('reset reseeds the bank to its opening seed', () => {
    const pool = new EnemyPool();
    const d = simulate(10, pool);
    d.reset();
    expect(d.banked).toBe(16); // INITIAL_BANK — funds the first wave so the open isn't empty
  });

  it('faster pace fields more enemies than neutral over the same window', () => {
    const fast = new EnemyPool();
    const neutral = new EnemyPool();
    const df = new WaveDirector();
    const dn = new WaveDirector();
    const dt = 1 / 60;
    for (let t = 0; t < 20; t += dt) {
      df.step(fast, new Rng(1), t, dt, { pace: 1.4, houndBias: 0 });
      dn.step(neutral, new Rng(1), t, dt, NEUTRAL_ADAPT);
    }
    expect(fast.count).toBeGreaterThanOrEqual(neutral.count);
  });

  it('adaptation still respects the concurrent cap (V8 bounded)', () => {
    const pool = new EnemyPool();
    const d = new WaveDirector();
    const rng = new Rng(2);
    const dt = 1 / 60;
    for (let t = 0; t < 40; t += dt) {
      d.step(pool, rng, t, dt, { pace: 1.4, houndBias: 0.3 });
      expect(pool.count).toBeLessThanOrEqual(budgetAt(t).maxConcurrentEnemies);
    }
  });
});

describe('act boss sequence (T75, V36)', () => {
  it('fields the act roster in order, advancing only on a kill', () => {
    const d = new WaveDirector();
    d.reset(); // default arena = cold-vault → Act 1
    expect(d.nextBossDef()?.id).toBe('foreman-krill');
    expect(d.nextBossDef()?.tier).toBe('miniboss');
    d.advanceBossStage();
    expect(d.nextBossDef()?.id).toBe('repo-sovereign');
    d.advanceBossStage();
    expect(d.nextBossDef()?.tier).toBe('final'); // Gatekeeper
    expect(d.actComplete()).toBe(false);
    d.advanceBossStage();
    expect(d.actComplete()).toBe(true); // final down → act cleared
    expect(d.nextBossDef()).toBe(null);
  });

  it('Overrun flips the cleared act into an endless final-boss gauntlet (T50)', () => {
    const d = new WaveDirector();
    d.reset();
    d.advanceBossStage();
    d.advanceBossStage();
    d.advanceBossStage();
    expect(d.actComplete()).toBe(true);
    d.enterInfinite();
    expect(d.isInfinite).toBe(true);
    expect(d.actComplete()).toBe(false); // endless: never "complete"
    expect(d.nextBossDef()?.tier).toBe('final'); // recurs the final body
  });

  it('pauses the NORMAL wave cadence during a boss, running a lighter creep (T75)', () => {
    const dt = 1 / 60;
    const rng = () => new Rng(11);
    // Reference: a normal 40s window with NO boss fields a full set of waves.
    const normalPool = new EnemyPool();
    const dn = new WaveDirector();
    dn.reset();
    dn.advanceBossStage(); // clear the roster so no boss spawns in the window
    dn.advanceBossStage();
    dn.advanceBossStage();
    for (let t = 200; t < 240; t += dt) dn.step(normalPool, rng(), t, dt, NEUTRAL_ADAPT, 1);

    // With a boss on the field the SAME window fields only the creep trickle.
    const bossPool = new EnemyPool();
    const db = new WaveDirector();
    db.reset();
    bossPool.spawn(FOREMAN_KRILL, 0, 0, 0, 0);
    for (let t = 200; t < 240; t += dt) db.step(bossPool, rng(), t, dt, NEUTRAL_ADAPT, 1);

    const creep = bossPool.count - 1; // minus the boss body
    expect(creep).toBeGreaterThan(0); // reinforcements DO trickle in (not a hard block)
    expect(creep).toBeLessThan(normalPool.count); // …but far fewer than normal waves
  });

  it('the first miniboss arrives only after the act firstBossAt (not before)', () => {
    const d = new WaveDirector();
    d.reset();
    const pool = new EnemyPool();
    const rng = new Rng(7);
    const dt = 1 / 60;
    const countBosses = (): number => {
      let n = 0;
      for (let i = 0; i < pool.count; i++) if (ENEMY_BY_VARIANT[pool.variant[i]!]?.boss) n++;
      return n;
    };
    let t = 0;
    // firstBossAt 55 escalation × TIMELINE_STRETCH 2 = 110s real. Before that → none.
    for (; t < 100; t += dt) d.step(pool, rng, t, dt);
    expect(countBosses()).toBe(0);
    for (; t < 140; t += dt) d.step(pool, rng, t, dt);
    expect(countBosses()).toBe(1); // exactly the first miniboss, no kill → holds
  });
});

describe('themed milestone waves (T-themes)', () => {
  it('drops a scripted burst + a HUD banner once when the milestone is crossed', () => {
    const d = new WaveDirector();
    d.reset(); // builds the Act-1 (default cold-vault) theme schedule
    const pool = new EnemyPool();
    const rng = new Rng(5);
    const fx = new FxQueue();
    // First Act-1 theme is MITE SWARM at escalation 30s → real 30 × TIMELINE_STRETCH.
    // Step a window straddling it; assert the banner fires + a big burst lands.
    let banner: string | null = null;
    const before = pool.count;
    for (let t = 55; t < 75; t += 1 / 60) {
      d.step(pool, rng, t, 1 / 60, NEUTRAL_ADAPT, 1, fx);
      if (d.waveEvent) banner = d.waveEvent;
    }
    expect(banner).toBe('MITE SWARM');
    expect(pool.count - before).toBeGreaterThan(15); // the ~22-mite swarm landed
  });

  it('only fires each theme once (cursor advances, no repeat)', () => {
    const d = new WaveDirector();
    d.reset();
    const pool = new EnemyPool();
    const rng = new Rng(6);
    let fires = 0;
    let last: string | null = null;
    for (let t = 55; t < 75; t += 1 / 60) {
      d.step(pool, rng, t, 1 / 60, NEUTRAL_ADAPT, 1);
      if (d.waveEvent && d.waveEvent !== last) fires++;
      last = d.waveEvent;
    }
    expect(fires).toBe(1); // MITE SWARM fires exactly once across the window
  });
});
