import { describe, it, expect } from 'vitest';
import { DraftController } from './draft-controller';
import { defaultMods } from './mods';
import { BuildEffects } from './effects';
import { createPlayer } from '../player';
import { newRunStats } from '../run';
import { Rng } from '../../core/rng';

function ctl(seed = 1): DraftController {
  const c = new DraftController({
    player: createPlayer(),
    rng: new Rng(seed),
    mods: defaultMods(),
    effects: new BuildEffects(),
    stats: newRunStats(),
    afterApply: () => {},
  });
  c.reset();
  return c;
}

/** Queue a level + tick past the flourish delay until the draft opens. */
function openDraft(c: DraftController): void {
  c.queueLevelUp(1);
  c.update(0.6); // first tick decrements the 0.55s flourish delay
  c.update(0.6); // second tick opens the draft
}

describe('DraftController (T18/T41 lifecycle)', () => {
  it('holds the draft closed during the flourish delay, then opens it', () => {
    const c = ctl();
    c.queueLevelUp(1);
    expect(c.leveling).toBe(false); // still in the flourish window
    c.update(0.6);
    c.update(0.6);
    expect(c.leveling).toBe(true);
    expect(c.draft.length).toBeGreaterThan(0);
  });

  it('choose() applies the pick and closes the draft', () => {
    const c = ctl();
    openDraft(c);
    const id = c.draft[0]!.id;
    c.choose(0);
    expect(c.leveling).toBe(false);
    expect(c.pendingLevelUps).toBe(0);
    expect(c.upgradeLevelOf(id)).toBe(1);
  });

  it('is deterministic for a fixed seed (V16)', () => {
    const a = ctl(7);
    const b = ctl(7);
    openDraft(a);
    openDraft(b);
    expect(a.draft.map((d) => d.id)).toEqual(b.draft.map((d) => d.id));
  });

  it('reroll consumes a resource and refreshes the options', () => {
    const c = ctl();
    openDraft(c);
    const before = c.rerollsLeft;
    const id0 = c.draftId;
    c.reroll();
    expect(c.rerollsLeft).toBe(before - 1);
    expect(c.draftId).toBeGreaterThan(id0);
  });

  it('banish removes an option from the run and replaces it', () => {
    const c = ctl();
    openDraft(c);
    const banished = c.draft[0]!.id;
    c.banish(0);
    // The banished id never appears again across subsequent rolls.
    c.reroll();
    expect(c.draft.some((d) => d.id === banished)).toBe(false);
  });

  it('skipDraft closes the draft without applying an upgrade', () => {
    const c = ctl();
    openDraft(c);
    c.skipDraft();
    expect(c.leveling).toBe(false);
    expect(Object.keys(c.upgradeLevels).length).toBe(0); // nothing applied
  });

  it('a milestone level (every 5th) guarantees an interesting (uncommon+) option', () => {
    const player = createPlayer();
    player.level = 5; // milestone
    const c = new DraftController({
      player,
      rng: new Rng(1),
      mods: defaultMods(),
      effects: new BuildEffects(),
      stats: newRunStats(),
      afterApply: () => {},
    });
    c.reset();
    openDraft(c);
    expect(c.draft.some((d) => d.rarity !== 'common')).toBe(true);
  });

  it('a non-milestone level is NOT forced to include an interesting option', () => {
    const player = createPlayer();
    player.level = 4; // not a multiple of 5 → no guarantee
    const c = new DraftController({
      player,
      rng: new Rng(1),
      mods: defaultMods(),
      effects: new BuildEffects(),
      stats: newRunStats(),
      afterApply: () => {},
    });
    c.reset();
    openDraft(c);
    expect(c.draft.length).toBeGreaterThan(0); // draft still rolls; no milestone constraint
  });
});
