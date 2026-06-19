// T22 lifecycle: death ends the run with an accurate result (V20); restart
// resets in place with no reload and reseeds for determinism (V15, V16).

import { describe, it, expect } from 'vitest';
import { World } from './world';
import {
  EnemyState,
  RUST_MITE,
  BOSS_GATEKEEPER,
  FOREMAN_KRILL,
  REPO_SOVEREIGN,
  type EnemyType,
} from './enemies';

const DT = 1 / 60;

/** Drive a world to player death by planting an active enemy on the player each
 *  tick (guarantees a contact hit every i-frame window). Auto-picks the first
 *  draft option so a level-up freeze doesn't stall the run. Bounded. */
function runToDeath(w: World, cap = 20000): number {
  let steps = 0;
  while (!w.ended && steps < cap) {
    if (w.leveling) {
      w.choose(0);
      continue;
    }
    const i = w.enemies.spawn(RUST_MITE, w.player.pos.x, w.player.pos.z, 0, 0);
    if (i >= 0) w.enemies.state[i] = EnemyState.Active;
    w.step(DT);
    steps++;
  }
  return steps;
}

describe('World weapon drop', () => {
  it('dropping the current weapon reverts to the default sidearm (X)', async () => {
    const { WEAPONS } = await import('../content/weapons/index');
    const { contractualSidearm } = await import('../content/weapons/contractual-sidearm');
    const w = new World(7);
    w.start();
    w.weaponSystem.setPrimary(WEAPONS[1]!); // simulate picking up a non-sidearm weapon
    expect(w.weaponSystem.primaryId).not.toBe(contractualSidearm.id);
    w.input = { ...w.input, dropWeapon: true };
    w.step(DT);
    expect(w.weaponSystem.primaryId).toBe(contractualSidearm.id);
  });
});

describe('World death', () => {
  it('latches ended and computes a result on death (V20)', () => {
    const w = new World(123);
    const steps = runToDeath(w);
    expect(steps).toBeLessThan(20000);
    expect(w.ended).toBe(true);
    expect(w.player.health).toBe(0);
    expect(w.result).not.toBeNull();
    expect(w.result!.durationSec).toBeCloseTo(w.elapsed);
    expect(w.result!.level).toBe(w.player.level);
    expect(w.stats.kills).toBeGreaterThanOrEqual(0);
    // Damage taken is accumulated from real health loss (V20): the player went
    // from full to 0, so total taken must be at least starting health.
    expect(w.result!.damageTaken).toBeGreaterThanOrEqual(w.player.maxHealth);
  });

  it('freezes the sim once ended (no further steps advance time)', () => {
    const w = new World(123);
    runToDeath(w);
    const t = w.elapsed;
    w.step(DT);
    expect(w.elapsed).toBe(t);
  });
});

describe('boss reward (T43)', () => {
  it('defeating the boss opens a major reward and freezes the run, not ends it', () => {
    const w = new World(0x1234);
    w.start();
    w.countdown = 0;
    const bi = w.enemies.spawn(BOSS_GATEKEEPER, 6, 0, 0, 0);
    w.enemies.state[bi] = EnemyState.Active;
    w.step(DT);
    expect(w.boss.active).toBe(true);

    // Kill it; the boss compacts out, then after the savor-the-explosion delay
    // (T43, ~1.4s) the reward overlay opens. Step well past it.
    w.enemies.health[bi] = 0;
    for (let t = 0; t < 400 && !w.bossReward; t++) {
      if (w.leveling) {
        w.choose(0); // boss XP can pop a level-up — dismiss it so the delay ticks
        continue;
      }
      w.player.health = w.player.maxHealth; // don't let resumed waves kill us mid-test
      w.step(DT);
    }

    expect(w.ended).toBe(false); // a boss kill is a hinge, not the end of the run
    expect(w.bossReward).toBe(true); // 3-choice overlay is open
    expect(w.bossRewardChoices.length).toBeGreaterThan(0);

    // The frozen run holds until a reward is chosen.
    const tick = w.tick;
    w.step(DT);
    expect(w.tick).toBe(tick);

    // Choose one → resume.
    w.chooseBossReward(0);
    expect(w.bossReward).toBe(false);
    w.step(DT);
    expect(w.tick).toBe(tick + 1);
  });
});

describe('act conclusion + victory (T75, V36)', () => {
  // Spawn a boss body, kill it, and claim its reward (if any). Returns once the
  // boss-kill flow has settled (reward claimed or conclusion opened).
  function killBossAndClaim(w: World, type: EnemyType): void {
    const bi = w.enemies.spawn(type, 6, 0, 0, 0);
    w.enemies.state[bi] = EnemyState.Active;
    w.step(DT); // activate the controller
    for (let i = 0; i < w.enemies.count; i++) {
      if (w.enemies.variant[i] === type.variant) w.enemies.health[i] = 0;
    }
    // The reward overlay now opens after a savor-the-explosion delay (T43, ~1.4s), so
    // step through it. Keep the player topped up — resumed waves shouldn't kill us
    // mid-helper (this tests the boss flow, not survival).
    for (let t = 0; t < 400 && !w.bossReward && !w.conclusion; t++) {
      if (w.leveling) {
        w.choose(0); // boss XP can pop a level-up that freezes the sim — dismiss it
        continue;
      }
      w.player.health = w.player.maxHealth;
      w.step(DT);
    }
    if (w.bossReward) w.chooseBossReward(0);
  }

  it('clearing the act roster opens the conclusion; extract wins the run', () => {
    const w = new World(0xac7);
    w.start();
    w.countdown = 0;

    killBossAndClaim(w, FOREMAN_KRILL); // Miniboss I
    expect(w.conclusion).toBe(false);
    expect(w.ended).toBe(false);

    killBossAndClaim(w, REPO_SOVEREIGN); // Miniboss II
    expect(w.conclusion).toBe(false);

    killBossAndClaim(w, BOSS_GATEKEEPER); // Final → conclusion
    expect(w.conclusion).toBe(true);
    expect(w.ended).toBe(false); // frozen on the choice, not over yet

    w.chooseConclusion(true); // EXTRACT
    expect(w.conclusion).toBe(false);
    expect(w.ended).toBe(true);
    expect(w.result?.won).toBe(true);
  });

  it('a boss death enqueues the scaled blood-catastrophe FX (T77, V38)', () => {
    const w = new World(0xb10);
    w.start();
    w.countdown = 0;
    const bi = w.enemies.spawn(BOSS_GATEKEEPER, 6, 0, 0, 0);
    w.enemies.state[bi] = EnemyState.Active;
    w.step(DT); // activate
    w.fx.clear();
    for (let i = 0; i < w.enemies.count; i++) {
      if (w.enemies.variant[i] === BOSS_GATEKEEPER.variant) w.enemies.health[i] = 0;
    }
    w.step(DT); // kill compacts → bloodburst pushed
    const burst = w.fx.events.find((e) => e.kind === 'bloodburst');
    expect(burst).toBeDefined();
    expect(burst!.dx).toBeGreaterThan(1); // carries the boss radius for scaling
  });

  it('environmental hazards erupt only after a boss kill (T44/V23)', () => {
    // Tier 0: a single step at t≈0 arms no arena hazard (and no enemy has acted yet).
    const w0 = new World(0xf00);
    w0.start();
    w0.countdown = 0;
    w0.step(DT);
    expect(w0.enemyAttacks.hazards.count).toBe(0);

    // Tier 3: the run-phase hazard fires on the first eligible step (timer starts 0).
    const w3 = new World(0xf00);
    w3.start();
    w3.countdown = 0;
    w3.stats.bossKills = 3;
    w3.step(DT);
    expect(w3.enemyAttacks.hazards.count).toBeGreaterThan(0);
  });

  it('Overrun keeps the run going (no win) and flips the director endless', () => {
    const w = new World(0xac8);
    w.start();
    w.countdown = 0;
    killBossAndClaim(w, FOREMAN_KRILL);
    killBossAndClaim(w, REPO_SOVEREIGN);
    killBossAndClaim(w, BOSS_GATEKEEPER);
    expect(w.conclusion).toBe(true);

    w.chooseConclusion(false); // OVERRUN
    expect(w.conclusion).toBe(false);
    expect(w.ended).toBe(false);
    expect(w.infinite).toBe(true);
  });
});

describe('World reset', () => {
  it('restores a fresh-run baseline in place (V15)', () => {
    const w = new World(123);
    runToDeath(w);
    w.reset();
    expect(w.ended).toBe(false);
    expect(w.result).toBeNull();
    expect(w.elapsed).toBe(0);
    expect(w.tick).toBe(0);
    expect(w.player.health).toBe(100);
    expect(w.enemies.count).toBe(0);
    expect(w.shards.count).toBe(0);
    expect(w.weaponSystem.weapons.length).toBe(1);
    expect(w.weaponSystem.projectiles.count).toBe(0);
    expect(w.stats.kills).toBe(0);
    expect(w.stats.damageDealt).toBe(0);
    expect(w.stats.damageTaken).toBe(0);
    expect(w.stats.upgradesTaken).toBe(0);
  });
});

describe('determinism (V16)', () => {
  it('same seed → same sim outcome', () => {
    const a = new World(7);
    const b = new World(7);
    for (let i = 0; i < 400; i++) {
      a.step(DT);
      b.step(DT);
    }
    expect(a.enemies.count).toBe(b.enemies.count);
    expect(a.player.pos.x).toBe(b.player.pos.x);
    expect(a.player.pos.z).toBe(b.player.pos.z);
  });

  it('reset reseeds → a reused world matches a fresh one (V15+V16)', () => {
    const fresh = new World(7);
    for (let i = 0; i < 400; i++) fresh.step(DT);

    const reused = new World(7);
    for (let i = 0; i < 40; i++) reused.step(DT);
    reused.reset();
    for (let i = 0; i < 400; i++) reused.step(DT);

    expect(reused.enemies.count).toBe(fresh.enemies.count);
    expect(reused.player.pos.x).toBe(fresh.player.pos.x);
    expect(reused.player.pos.z).toBe(fresh.player.pos.z);
    expect(reused.elapsed).toBeCloseTo(fresh.elapsed);
  });
});
