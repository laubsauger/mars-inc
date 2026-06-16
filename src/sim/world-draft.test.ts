import { describe, it, expect } from 'vitest';
import { World } from './world';

// Drive a world to an open draft by injecting enough XP, then exercise the T41
// draft actions (reroll / banish / skip). Uses the public surface only.
function openDraft(w: World): void {
  w.start();
  // Past the countdown so the run is live.
  for (let i = 0; i < 200 && w.countdown > 0; i++) w.step(1 / 60);
  // Drop a fat shard on the player to force a level-up next step.
  w.shards.spawn(0, 0, w.player.xpToNext + 1);
  for (let i = 0; i < 5 && !w.leveling; i++) w.step(1 / 60);
}

describe('World draft actions (T41)', () => {
  it('opens a draft with reroll + banish resources', () => {
    const w = new World(1);
    openDraft(w);
    expect(w.leveling).toBe(true);
    expect(w.draft.length).toBeGreaterThan(0);
    expect(w.rerollsLeft).toBeGreaterThan(0);
    expect(w.banishesLeft).toBeGreaterThan(0);
  });

  it('reroll consumes a charge, keeps locked options, bumps draftId', () => {
    const w = new World(2);
    openDraft(w);
    const lockId = w.draft[0]!.id;
    const beforeId = w.draftId;
    const rerolls = w.rerollsLeft;
    w.reroll([lockId]);
    expect(w.rerollsLeft).toBe(rerolls - 1);
    expect(w.draftId).toBe(beforeId + 1);
    expect(w.draft.some((d) => d.id === lockId)).toBe(true); // locked kept
  });

  it('reroll past the limit is a no-op', () => {
    const w = new World(3);
    openDraft(w);
    while (w.rerollsLeft > 0) w.reroll([]);
    const draftId = w.draftId;
    w.reroll([]);
    expect(w.draftId).toBe(draftId); // unchanged
  });

  it('banish removes the option from the run and refills the slot', () => {
    const w = new World(4);
    openDraft(w);
    const banishedId = w.draft[0]!.id;
    const banishes = w.banishesLeft;
    w.banish(0);
    expect(w.banishesLeft).toBe(banishes - 1);
    expect(w.draft.length).toBe(3);
    // The banished upgrade never reappears across future rerolls.
    for (let i = 0; i < 5 && w.rerollsLeft > 0; i++) w.reroll([]);
    expect(w.draft.some((d) => d.id === banishedId)).toBe(false);
  });

  it('skip heals the player and closes the draft', () => {
    const w = new World(5);
    openDraft(w);
    w.player.health = 1;
    const before = w.player.health;
    w.skipDraft();
    expect(w.player.health).toBeGreaterThan(before);
    expect(w.leveling).toBe(false);
  });

  it('permanent House Odds adds reroll charges to a fresh run (T35)', () => {
    const base = new World(6);
    base.start();
    const baseRerolls = base.rerollsLeft;

    const boosted = new World(6, { 'house-odds': 2 });
    boosted.start();
    expect(boosted.rerollsLeft).toBe(baseRerolls + 2);
  });
});
