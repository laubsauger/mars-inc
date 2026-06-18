// Content integrity (Batch 1/2 — the catalogs now span many files). Guards against
// copy-paste id collisions across the split branch/upgrade files, and that every
// prerequisite/exclusion reference points at a real card. A duplicate id would make
// one definition silently shadow another in draft/tree lookups.

import { describe, it, expect } from 'vitest';
import { DRAFT_POOL } from '../sim/progression/draft-pool';
import { PERMANENT_UPGRADES } from './permanent/index';

describe('content integrity', () => {
  it('every draft upgrade id is unique', () => {
    const ids = DRAFT_POOL.map((u) => u.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('every permanent (Glory Tree) node id is unique', () => {
    const ids = PERMANENT_UPGRADES.map((p) => p.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('every draft upgrade NAME is unique (no duplicate cards under one name)', () => {
    // A shared display name = two cards that read as the same upgrade but stack as
    // separate effects (the Phoenix Protocol bug). Same concept → one card with a
    // level / rarity-tier ladder, not a copy. Guards that going forward.
    const names = DRAFT_POOL.map((u) => u.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it('rarityTiers (rarity-upgrade ladder) matches the card maxLevel', () => {
    const bad: string[] = [];
    for (const u of DRAFT_POOL) {
      if (u.rarityTiers && u.rarityTiers.length !== u.maxLevel) {
        bad.push(`${u.id}: ${u.rarityTiers.length} tiers vs maxLevel ${u.maxLevel}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('draft prerequisites / exclusions reference real cards', () => {
    const ids = new Set(DRAFT_POOL.map((u) => u.id));
    const missing: string[] = [];
    for (const u of DRAFT_POOL) {
      for (const r of u.prerequisites ?? []) if (!ids.has(r.id)) missing.push(`${u.id}→${r.id}`);
      for (const r of u.exclusions ?? []) if (!ids.has(r.id)) missing.push(`${u.id}⊥${r.id}`);
    }
    expect(missing).toEqual([]);
  });

  it('no card is gated behind a tag nothing else provides (no dead gates)', () => {
    // A tag gate (requiresAnyTags / requiresAllTags) only opens when SOME OTHER card
    // the player owns provides that tag (in tags ∪ grantsTags). If no other card
    // provides it, the gated card can never enter the pool — a dead gate. This is the
    // dependency system's safety net: build-around payoffs stay out of the early pool,
    // but every gate is guaranteed reachable from a primer/source.
    const provide = (t: string): boolean =>
      DRAFT_POOL.some((v) => v.tags.includes(t) || (v.grantsTags?.includes(t) ?? false));
    const dead: string[] = [];
    for (const u of DRAFT_POOL) {
      const req = [...(u.requiresAnyTags ?? []), ...(u.requiresAllTags ?? [])];
      for (const t of req) {
        // Provided by some card OTHER than u (u can't open its own gate).
        const byOther = DRAFT_POOL.some(
          (v) => v.id !== u.id && (v.tags.includes(t) || (v.grantsTags?.includes(t) ?? false)),
        );
        if (!byOther) dead.push(`${u.id} needs '${t}' (provided elsewhere: ${provide(t)})`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('every upgrade + node has a non-empty name and description', () => {
    for (const u of DRAFT_POOL) {
      expect(u.name.length, u.id).toBeGreaterThan(0);
      expect(u.description.length, u.id).toBeGreaterThan(0);
    }
    for (const p of PERMANENT_UPGRADES) {
      expect(p.name.length, p.id).toBeGreaterThan(0);
      expect(p.description.length, p.id).toBeGreaterThan(0);
    }
  });
});
