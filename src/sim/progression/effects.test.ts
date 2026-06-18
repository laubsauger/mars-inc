import { describe, it, expect } from 'vitest';
import { BuildEffects, type ConditionalCtx, type TriggerCtx } from './effects';

const CTX: ConditionalCtx = {
  enemiesOnScreen: 5,
  enemiesNearby: 5,
  nearestDist: 8,
  firingRampSec: 0,
  hpFrac: 1,
  recentCrit: false,
  recoilActive: false,
  stationarySec: 0,
  moving: false,
  movingSec: 0,
  rageStacks: 0,
};

describe('BuildEffects conditionals (T38)', () => {
  it('no conditionals → neutral result', () => {
    const e = new BuildEffects();
    expect(e.evalConditionals(CTX)).toEqual({ damageMult: 1, critAdd: 0, fireRateMult: 1 });
  });

  it('combines damage multiplicatively, crit additively', () => {
    const e = new BuildEffects();
    e.addConditional(() => ({ damageMult: 1.5 }));
    e.addConditional(() => ({ damageMult: 2, critAdd: 0.1 }));
    e.addConditional(() => ({ critAdd: 0.05 }));
    const r = e.evalConditionals(CTX);
    expect(r.damageMult).toBeCloseTo(3, 6); // 1.5 * 2
    expect(r.critAdd).toBeCloseTo(0.15, 6);
  });

  it('reads context — low-hp conditional only applies below threshold', () => {
    const e = new BuildEffects();
    e.addConditional((c) => (c.hpFrac < 0.35 ? { damageMult: 1.6 } : {}));
    expect(e.evalConditionals({ ...CTX, hpFrac: 1 }).damageMult).toBe(1);
    expect(e.evalConditionals({ ...CTX, hpFrac: 0.2 }).damageMult).toBeCloseTo(1.6, 6);
  });

  it('ramp conditional scales with sustained fire', () => {
    const e = new BuildEffects();
    e.addConditional((c) => ({ damageMult: 1 + Math.min(0.5, c.firingRampSec * 0.05) }));
    expect(e.evalConditionals({ ...CTX, firingRampSec: 0 }).damageMult).toBe(1);
    expect(e.evalConditionals({ ...CTX, firingRampSec: 4 }).damageMult).toBeCloseTo(1.2, 6);
    expect(e.evalConditionals({ ...CTX, firingRampSec: 100 }).damageMult).toBeCloseTo(1.5, 6); // capped
  });
});

function makeTriggerCtx(over: Partial<TriggerCtx> = {}): TriggerCtx {
  return {
    x: 1,
    z: 2,
    player: {} as TriggerCtx['player'],
    enemies: {} as TriggerCtx['enemies'],
    hash: {} as TriggerCtx['hash'],
    rng: {} as TriggerCtx['rng'],
    fx: { push: () => {} } as unknown as TriggerCtx['fx'],
    variant: 0,
    magnitude: 0,
    targetIndex: -1,
    procCoef: 1,
    hitDamage: 0,
    depth: 0,
    dealArea: (_x, _z, _r, amount) => amount,
    applyStatus: () => {},
    ...over,
  };
}

describe('BuildEffects triggers (T38)', () => {
  it('has() reflects registered events', () => {
    const e = new BuildEffects();
    expect(e.has('kill')).toBe(false);
    e.on('kill', () => {});
    expect(e.has('kill')).toBe(true);
    expect(e.has('overkill')).toBe(false);
  });

  it('fire invokes all handlers for an event with the context', () => {
    const e = new BuildEffects();
    let calls = 0;
    let total = 0;
    e.on('kill', (ctx) => {
      calls++;
      total += ctx.dealArea(ctx.x, ctx.z, 2, 5);
    });
    e.on('kill', (ctx) => {
      calls++;
      total += ctx.dealArea(ctx.x, ctx.z, 2, 3);
    });
    e.fire('kill', makeTriggerCtx());
    expect(calls).toBe(2);
    expect(total).toBe(8);
  });

  it('firing an event with no handlers is a no-op', () => {
    const e = new BuildEffects();
    expect(() => e.fire('waveClear', makeTriggerCtx())).not.toThrow();
  });

  it('reset clears conditionals and triggers', () => {
    const e = new BuildEffects();
    e.addConditional(() => ({ damageMult: 2 }));
    e.on('kill', () => {});
    e.reset();
    expect(e.has('kill')).toBe(false);
    expect(e.evalConditionals(CTX).damageMult).toBe(1);
  });
});
