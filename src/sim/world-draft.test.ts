import { describe, it, expect } from 'vitest';
import { World } from './world';

// Drive a world to an open draft by injecting enough XP, then exercise the T41
// draft actions (reroll / banish / skip). Uses the public surface only.
function openDraft(w: World): void {
  w.start();
  // Past the countdown so the run is live.
  for (let i = 0; i < 200 && w.countdown > 0; i++) w.step(1 / 60);
  // Drop a fat shard on the player to force a level-up. The draft opens after the
  // LEVELUP_DELAY flourish window (~0.55s ≈ 33 steps), not immediately — step until
  // it actually opens (bounded) rather than assuming the next step.
  w.shards.spawn(0, 0, w.player.xpToNext + 1);
  for (let i = 0; i < 120 && !w.leveling; i++) w.step(1 / 60);
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

// T71: Lock (carry a card to the NEXT draft) + tag-banish (drop a whole tag).
/** Open a draft holding enough banked level-ups that picking one opens another. */
function openMultiLevel(w: World): void {
  w.start();
  for (let i = 0; i < 200 && w.countdown > 0; i++) w.step(1 / 60);
  w.shards.spawn(0, 0, 200); // spans several levels → multiple pending drafts
  for (let i = 0; i < 120 && !w.leveling; i++) w.step(1 / 60);
}

describe('World draft Lock + tag-banish (T71)', () => {
  it('starts each run with a lock and a tag-banish charge', () => {
    const w = new World(10);
    openDraft(w);
    expect(w.locksLeft).toBe(1);
    expect(w.tagBanishesLeft).toBe(1);
    expect(w.heldLock).toBeNull();
  });

  it('Lock holds a card and carries it into the NEXT draft, then releases', () => {
    const w = new World(11);
    openMultiLevel(w);
    expect(w.leveling).toBe(true);
    const heldId = w.draft[0]!.id;
    w.lockCard(0);
    expect(w.heldLock).toBe(heldId);
    expect(w.locksLeft).toBe(0); // charge consumed
    // Pick a DIFFERENT card so the held one isn't the one applied.
    const other = w.draft.findIndex((d) => d.id !== heldId);
    w.choose(other >= 0 ? other : 0);
    expect(w.leveling).toBe(true); // banked level-up opened the next draft
    expect(w.draft.some((d) => d.id === heldId)).toBe(true); // held card carried over
    expect(w.heldLock).toBeNull(); // released after being served
  });

  it('one lock held at a time — a second lock is a no-op', () => {
    const w = new World(13);
    openMultiLevel(w);
    const first = w.draft[0]!.id;
    w.lockCard(0);
    w.lockCard(1); // already holding → ignored
    expect(w.heldLock).toBe(first);
    expect(w.locksLeft).toBe(0);
  });

  it('tag-banish drops every card carrying the tag and refills the shown cards', () => {
    const w = new World(12);
    openMultiLevel(w);
    expect(w.tagBanishesLeft).toBe(1);
    w.banishTag('damage');
    expect(w.tagBanishesLeft).toBe(0);
    // No shown card carries the banished tag, now or across rerolls.
    expect(w.draft.every((d) => !d.tags.includes('damage'))).toBe(true);
    for (let i = 0; i < 5 && w.rerollsLeft > 0; i++) w.reroll([]);
    expect(w.draft.every((d) => !d.tags.includes('damage'))).toBe(true);
  });

  it('tag-banish with no matching cards is a no-op (keeps the charge)', () => {
    const w = new World(14);
    openMultiLevel(w);
    const before = w.tagBanishesLeft;
    w.banishTag('no-such-tag-zzz');
    expect(w.tagBanishesLeft).toBe(before);
  });

  it('Retainer Clause permanent adds lock charges to a fresh run', () => {
    const base = new World(15);
    base.start();
    const baseLocks = base.locksLeft;
    const boosted = new World(15, { 'retainer-clause': 2 });
    boosted.start();
    expect(boosted.locksLeft).toBe(baseLocks + 2);
  });
});
