import { describe, it, expect } from 'vitest';
import { stepGargantuans } from './gargantuan';
import { EnemyPool, EnemyState, GARGANTUAN, RUST_MITE, AUDIT_BRUTE } from './enemies';
import { EnemyAttackSystem } from './enemy-attacks';
import { FxQueue } from './fx';

function active(pool: EnemyPool, i: number): number {
  pool.state[i] = EnemyState.Active;
  return i;
}

describe('Gargantuan (T-garg eat-and-grow)', () => {
  it('devours an overlapping fodder unit and grows from it', () => {
    const pool = new EnemyPool();
    const g = active(pool, pool.spawn(GARGANTUAN, 0, 0, 0, 0));
    active(pool, pool.spawn(RUST_MITE, 0.5, 0, 0, 1)); // inside the bite reach
    const r0 = pool.radius[g]!;
    const hp0 = pool.maxHp[g]!;
    const dmg0 = pool.contactDmg[g]!;

    stepGargantuans(pool, new EnemyAttackSystem(), 1 / 60, new FxQueue());

    expect(pool.count).toBe(1); // the mite was swallowed
    expect(pool.radius[g]!).toBeGreaterThan(r0);
    expect(pool.maxHp[g]!).toBeGreaterThan(hp0);
    expect(pool.contactDmg[g]!).toBeGreaterThan(dmg0);
  });

  it('will not eat a non-fodder special (too tough to swallow)', () => {
    const pool = new EnemyPool();
    active(pool, pool.spawn(GARGANTUAN, 0, 0, 0, 0));
    active(pool, pool.spawn(AUDIT_BRUTE, 0.5, 0, 0, 1));
    stepGargantuans(pool, new EnemyAttackSystem(), 1 / 60, new FxQueue());
    expect(pool.count).toBe(2); // both still standing
  });

  it('stops growing at the cap no matter how much it eats', () => {
    const pool = new EnemyPool();
    const g = active(pool, pool.spawn(GARGANTUAN, 0, 0, 0, 0));
    for (let i = 0; i < 60; i++) active(pool, pool.spawn(RUST_MITE, 0, 0, 0, i + 1));
    for (let t = 0; t < 30; t++)
      stepGargantuans(pool, new EnemyAttackSystem(), 1 / 60, new FxQueue());
    expect(pool.radius[g]!).toBeLessThanOrEqual(2.3 + 1e-6);
  });

  it('a GROWN one slams a size-scaled telegraphed blast; a fresh one does not', () => {
    // Fresh gargantuan, cooldown ready → no slam (hasn't fed past the threshold).
    const fresh = new EnemyPool();
    const gf = active(fresh, fresh.spawn(GARGANTUAN, 0, 0, 0, 0));
    fresh.attackCd[gf] = 0;
    const aFresh = new EnemyAttackSystem();
    stepGargantuans(fresh, aFresh, 1 / 60, new FxQueue());
    expect(aFresh.hazards.count).toBe(0);

    // Grown gargantuan (radius bumped), cooldown ready → a hazard zone drops.
    const big = new EnemyPool();
    const gb = active(big, big.spawn(GARGANTUAN, 0, 0, 0, 0));
    big.radius[gb] = 2.0; // well past the slam threshold
    big.attackCd[gb] = 0;
    const aBig = new EnemyAttackSystem();
    stepGargantuans(big, aBig, 1 / 60, new FxQueue());
    expect(aBig.hazards.count).toBe(1);
    expect(aBig.hazards.radius[0]!).toBeGreaterThan(2.0); // zone scales with the body
  });
});
