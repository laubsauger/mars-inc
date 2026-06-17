// Gatekeeper boss fight (T33). Phased controller: it reads the boss from the
// pool, escalates by HP threshold, telegraphs attacks through the ranged
// framework, and summons adds on a phase break. Deterministic (V16).

import { describe, it, expect } from 'vitest';
import { BossController, BOSS_PHASES } from './boss';
import { EnemyPool, EnemyState, BOSS_GATEKEEPER } from './enemies';
import { EnemyAttackSystem } from './enemy-attacks';
import { createPlayer } from './player';
import { Rng } from '../core/rng';
import { FxQueue } from './fx';

const DT = 1 / 60;

function withBoss(): { pool: EnemyPool; bi: number } {
  const pool = new EnemyPool();
  const bi = pool.spawn(BOSS_GATEKEEPER, 12, 0, 0, 0);
  pool.state[bi] = EnemyState.Active;
  return { pool, bi };
}

describe('boss controller', () => {
  it('activates and reports full health when the boss is on the field', () => {
    const { pool } = withBoss();
    const boss = new BossController();
    boss.step(pool, createPlayer(), new EnemyAttackSystem(), new Rng(1), DT, new FxQueue());
    const s = boss.snapshot();
    expect(s.active).toBe(true);
    expect(s.hp01).toBeCloseTo(1);
    expect(s.phases).toBe(BOSS_PHASES);
  });

  it('is inactive when no boss is present', () => {
    const boss = new BossController();
    boss.step(
      new EnemyPool(),
      createPlayer(),
      new EnemyAttackSystem(),
      new Rng(1),
      DT,
      new FxQueue(),
    );
    expect(boss.snapshot().active).toBe(false);
  });

  it('telegraphs attacks over time (queues projectiles/hazards)', () => {
    const { pool } = withBoss();
    const boss = new BossController();
    const attacks = new EnemyAttackSystem();
    const rng = new Rng(1);
    const fx = new FxQueue();
    for (let t = 0; t < 360; t++) boss.step(pool, createPlayer(), attacks, rng, DT, fx);
    expect(attacks.projectiles.count).toBeGreaterThan(0); // it attacked
  });

  it('escalates phase as health drops, and a break summons adds', () => {
    const { pool, bi } = withBoss();
    const boss = new BossController();
    const attacks = new EnemyAttackSystem();
    const rng = new Rng(1);
    const fx = new FxQueue();
    const player = createPlayer();

    boss.step(pool, player, attacks, rng, DT, fx);
    expect(boss.snapshot().phase).toBe(0);

    // Drop to ~50% → phase 1 + a break (shockwave hazard + summoned adds).
    pool.health[bi] = BOSS_GATEKEEPER.maxHealth * 0.5;
    const enemiesBefore = pool.count;
    boss.step(pool, player, attacks, rng, DT, fx);
    expect(boss.snapshot().phase).toBe(1);
    expect(pool.count).toBeGreaterThan(enemiesBefore); // adds summoned
    expect(attacks.hazards.count).toBeGreaterThan(0); // slam shockwave armed
    expect(attacks.beams.count).toBeGreaterThan(0); // final boss break fires a laser star (T44)

    // Drop to ~20% → final phase.
    pool.health[bi] = BOSS_GATEKEEPER.maxHealth * 0.2;
    boss.step(pool, player, attacks, rng, DT, fx);
    expect(boss.snapshot().phase).toBe(2);
  });

  it('boss body-checks hit hard (contact damage override)', () => {
    expect(BOSS_GATEKEEPER.contactDamage).toBe(22);
  });

  it('marks defeated once the boss leaves the field after being active', () => {
    const { pool, bi } = withBoss();
    const boss = new BossController();
    const attacks = new EnemyAttackSystem();
    boss.step(pool, createPlayer(), attacks, new Rng(1), DT, new FxQueue());
    expect(boss.defeated).toBe(false);
    pool.kill(bi); // boss killed → removed from the pool
    boss.step(pool, createPlayer(), attacks, new Rng(1), DT, new FxQueue());
    expect(boss.defeated).toBe(true);
  });
});
