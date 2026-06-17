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

  it('draft prerequisites / exclusions reference real cards', () => {
    const ids = new Set(DRAFT_POOL.map((u) => u.id));
    const missing: string[] = [];
    for (const u of DRAFT_POOL) {
      for (const r of u.prerequisites ?? []) if (!ids.has(r.id)) missing.push(`${u.id}→${r.id}`);
      for (const r of u.exclusions ?? []) if (!ids.has(r.id)) missing.push(`${u.id}⊥${r.id}`);
    }
    expect(missing).toEqual([]);
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
