import { describe, it, expect } from 'vitest';
import {
  rollDraft,
  rarityWeight,
  applyUpgrade,
  available,
  ownedTags,
  taken,
  isOffense,
  OFFENSE_TAGS,
  type UpgradeDefinition,
  type UpgradeLevels,
} from './upgrades';
import { defaultMods } from './mods';
import { BuildEffects } from './effects';
import { createPlayer } from '../player';
import { UPGRADES } from '../../content/upgrades/index';
import { Rng } from '../../core/rng';

function byId(id: string): UpgradeDefinition {
  return UPGRADES.find((u) => u.id === id)!;
}

describe('rollDraft (V11 pool never empty, no invalid combo)', () => {
  it('returns 3 distinct options from a fresh pool', () => {
    const draft = rollDraft(UPGRADES, {}, new Rng(1));
    expect(draft).toHaveLength(3);
    expect(new Set(draft.map((d) => d.id)).size).toBe(3);
  });

  it('deterministic for a fixed seed (V16)', () => {
    const a = rollDraft(UPGRADES, {}, new Rng(42)).map((d) => d.id);
    const b = rollDraft(UPGRADES, {}, new Rng(42)).map((d) => d.id);
    expect(a).toEqual(b);
  });

  it('never offers an upgrade at maxLevel', () => {
    const levels: UpgradeLevels = {};
    const first = UPGRADES[0]!;
    levels[first.id] = first.maxLevel; // maxed
    for (let s = 0; s < 50; s++) {
      const draft = rollDraft(UPGRADES, levels, new Rng(s));
      expect(draft.find((d) => d.id === first.id)).toBeUndefined();
    }
  });

  it('returns fewer than 3 only when the pool is that small', () => {
    // Leave exactly two UNGATED upgrades unmaxed; max everything else. Both must be
    // draftable, so the roll returns 2 (the pool-size clamp — not a gating accident,
    // e.g. a capstone whose prerequisite was maxed-or-absent).
    const ungated = UPGRADES.filter(
      (u) => !u.requiresAnyTags && !u.requiresAllTags && !u.prerequisites,
    );
    const keep = new Set([ungated[0]!.id, ungated[1]!.id]);
    const levels: UpgradeLevels = {};
    for (const u of UPGRADES) if (!keep.has(u.id)) levels[u.id] = u.maxLevel;
    expect(rollDraft(UPGRADES, levels, new Rng(1))).toHaveLength(2);
  });

  it('non-empty while any upgrade remains under maxLevel', () => {
    const draft = rollDraft(UPGRADES, {}, new Rng(7));
    expect(draft.length).toBeGreaterThan(0);
  });
});

describe('rarity weighting (T41)', () => {
  it('rarer tiers get more likely as level + luck rise', () => {
    expect(rarityWeight('legendary', 30, 5)).toBeGreaterThan(rarityWeight('legendary', 1, 0));
    expect(rarityWeight('common', 30, 5)).toBeGreaterThan(rarityWeight('legendary', 30, 5));
  });

  it('banished upgrades are filtered out of the pool', () => {
    const banished = new Set([UPGRADES[0]!.id]);
    const ids = available(UPGRADES, {}, banished).map((u) => u.id);
    expect(ids).not.toContain(UPGRADES[0]!.id);
  });

  it('rollDraft never offers banished ids', () => {
    const banished = new Set([UPGRADES[0]!.id]);
    for (let s = 0; s < 40; s++) {
      const draft = rollDraft(UPGRADES, {}, new Rng(s), { level: 10, luck: 2, banished });
      expect(draft.find((d) => d.id === UPGRADES[0]!.id)).toBeUndefined();
    }
  });

  it('count param limits how many options are rolled', () => {
    expect(rollDraft(UPGRADES, {}, new Rng(1), { count: 2 })).toHaveLength(2);
  });
});

describe('foundation pity (T-pity offence boost)', () => {
  // Fraction of single-card draws that surface ANY offensive option, over many seeds.
  const offenceRate = (boost?: { tags: ReadonlySet<string>; mult: number }): number => {
    let hits = 0;
    const N = 400;
    for (let s = 0; s < N; s++) {
      const draft = rollDraft(UPGRADES, {}, new Rng(s), { count: 1, level: 3, boost });
      if (draft.some(isOffense)) hits++;
    }
    return hits / N;
  };

  it('boosting OFFENSE_TAGS raises how often offence appears', () => {
    const base = offenceRate();
    const boosted = offenceRate({ tags: OFFENSE_TAGS, mult: 5 });
    expect(boosted).toBeGreaterThan(base);
  });

  it('does not guarantee offence — utility can still appear (no spoon-feeding)', () => {
    // With a strong boost, some single-card draws still land on non-offence cards.
    let nonOffence = 0;
    for (let s = 0; s < 200; s++) {
      const draft = rollDraft(UPGRADES, {}, new Rng(s), {
        count: 1,
        level: 3,
        boost: { tags: OFFENSE_TAGS, mult: 5 },
      });
      if (draft.length && !draft.some(isOffense)) nonOffence++;
    }
    expect(nonOffence).toBeGreaterThan(0);
  });

  it('is deterministic with the boost applied (V16)', () => {
    const boost = { tags: OFFENSE_TAGS, mult: 4 };
    const a = rollDraft(UPGRADES, {}, new Rng(99), { level: 3, boost }).map((d) => d.id);
    const b = rollDraft(UPGRADES, {}, new Rng(99), { level: 3, boost }).map((d) => d.id);
    expect(a).toEqual(b);
  });
});

describe('prerequisites + exclusions (T19, V11 no invalid combo)', () => {
  it('a prereq-gated upgrade is hidden until its requirement is met', () => {
    const ids = available(UPGRADES, {}).map((u) => u.id);
    expect(ids).not.toContain('shotgun-clause'); // needs split-shipment >= 2

    const ok = available(UPGRADES, { 'split-shipment': 2 }).map((u) => u.id);
    expect(ok).toContain('shotgun-clause');
  });

  it('prereq not satisfied at lower level', () => {
    const ids = available(UPGRADES, { 'split-shipment': 1 }).map((u) => u.id);
    expect(ids).not.toContain('shotgun-clause');
  });

  it('taking one of a mutually-exclusive pair removes the other', () => {
    const beforeIds = available(UPGRADES, {}).map((u) => u.id);
    expect(beforeIds).toContain('glass-runner');
    expect(beforeIds).toContain('iron-stance');

    const afterIds = available(UPGRADES, { 'glass-runner': 1 }).map((u) => u.id);
    expect(afterIds).not.toContain('iron-stance');
  });

  it('rollDraft never offers an excluded or unmet-prereq upgrade', () => {
    const levels: UpgradeLevels = { 'glass-runner': 1 };
    for (let s = 0; s < 60; s++) {
      const draft = rollDraft(UPGRADES, levels, new Rng(s));
      expect(draft.find((d) => d.id === 'iron-stance')).toBeUndefined();
      expect(draft.find((d) => d.id === 'shotgun-clause')).toBeUndefined();
    }
  });

  it('applying the gated upgrade works once unlocked', () => {
    const levels: UpgradeLevels = { 'split-shipment': 2 };
    const mods = defaultMods();
    mods.projectileCount = 3; // from split-shipment x2
    applyUpgrade(
      byId('shotgun-clause'),
      { player: createPlayer(), mods, effects: new BuildEffects() },
      levels,
    );
    expect(mods.projectileCount).toBe(5);
    expect(taken(levels, 'shotgun-clause')).toBe(1);
  });
});

describe('applyUpgrade (T18 effects + level tracking)', () => {
  it('applies the effect and increments the taken level', () => {
    const levels: UpgradeLevels = {};
    const mods = defaultMods();
    const player = createPlayer();
    const dmg = UPGRADES.find((u) => u.id === 'overcharge')!;
    applyUpgrade(dmg, { player, mods, effects: new BuildEffects() }, levels);
    expect(taken(levels, 'overcharge')).toBe(1);
    expect(mods.damageMult).toBeCloseTo(1.25, 6);
  });

  it('stacks across repeated picks up to maxLevel', () => {
    const levels: UpgradeLevels = {};
    const mods = defaultMods();
    const player = createPlayer();
    const ms = UPGRADES.find((u) => u.id === 'split-shipment')!;
    applyUpgrade(ms, { player, mods, effects: new BuildEffects() }, levels);
    applyUpgrade(ms, { player, mods, effects: new BuildEffects() }, levels);
    expect(mods.projectileCount).toBe(3); // 1 + 2
    expect(available(UPGRADES, levels).find((u) => u.id === 'split-shipment')).toBeDefined();
  });
});

// ── T51: build-aware card pool (V27/V29) ────────────────────────────────────
describe('build-aware card pool (T51)', () => {
  // Synthetic mini-catalog so the gates are exercised in isolation of content.
  const noop = () => {};
  const REG: UpgradeDefinition[] = [
    {
      id: 'primer-burn',
      name: 'Primer Burn',
      description: 'grants heat',
      tags: ['status'],
      grantsTags: ['heat'],
      rarity: 'common',
      maxLevel: 3,
      baseWeight: 10,
      synergyWeight: 2,
      role: 'primer',
      riskTier: 0,
      apply: noop,
    },
    {
      id: 'primer-shock',
      name: 'Primer Shock',
      description: 'grants shock',
      tags: ['status'],
      grantsTags: ['shock'],
      rarity: 'common',
      maxLevel: 3,
      baseWeight: 10,
      synergyWeight: 2,
      apply: noop,
    },
    {
      id: 'plasma-bloom',
      name: 'Plasma Bloom',
      description: 'needs heat + shock',
      tags: ['converter'],
      rarity: 'rare',
      maxLevel: 1,
      baseWeight: 5,
      synergyWeight: 4,
      requiresAllTags: ['heat', 'shock'],
      role: 'catastrophe',
      riskTier: 3,
      weightRules: [{ whenTags: ['heat', 'shock'], all: true, multiplier: 4 }],
      apply: noop,
    },
    {
      id: 'boss-cannon',
      name: 'Gatekeeper Cannon',
      description: 'boss-gated',
      tags: ['weapon'],
      rarity: 'legendary',
      maxLevel: 1,
      baseWeight: 6,
      synergyWeight: 1,
      bossGate: 'gatekeeper',
      apply: noop,
    },
  ];

  it('ownedTags unions tags and grantsTags from taken cards', () => {
    const owned = ownedTags(REG, { 'primer-burn': 2 });
    expect(owned.get('heat')).toBe(2); // from grantsTags ×2 levels
    expect(owned.get('status')).toBe(2); // from tags
    expect(owned.has('shock')).toBe(false);
  });

  it('requiresAllTags hides a converter until BOTH primers are owned', () => {
    expect(available(REG, {}).some((u) => u.id === 'plasma-bloom')).toBe(false);
    expect(available(REG, { 'primer-burn': 1 }).some((u) => u.id === 'plasma-bloom')).toBe(false);
    const both = available(REG, { 'primer-burn': 1, 'primer-shock': 1 });
    expect(both.some((u) => u.id === 'plasma-bloom')).toBe(true);
  });

  it('boss-gated card stays out until its gate key is unlocked', () => {
    expect(available(REG, {}).some((u) => u.id === 'boss-cannon')).toBe(false);
    const unlocked = available(REG, {}, undefined, new Set(['gatekeeper']));
    expect(unlocked.some((u) => u.id === 'boss-cannon')).toBe(true);
  });

  it('owning the required tags weights the converter up (build-aware odds)', () => {
    // With both primers owned, Plasma Bloom is unlocked and heavily weighted, so a
    // small draft reliably surfaces it; the synthetic pool has nothing else rare.
    const levels: UpgradeLevels = { 'primer-burn': 2, 'primer-shock': 2 };
    let seen = 0;
    for (let s = 0; s < 20; s++) {
      const ids = rollDraft(REG, levels, new Rng(s), { count: 2, level: 6 }).map((d) => d.id);
      if (ids.includes('plasma-bloom')) seen++;
    }
    expect(seen).toBeGreaterThan(10); // appears often once the build supports it
  });

  it('plain cards (no new fields) behave exactly as before', () => {
    // Real catalog has no gated cards → availability count unchanged by gates arg.
    const a = available(UPGRADES, {}).length;
    const b = available(UPGRADES, {}, undefined, new Set(['anything'])).length;
    expect(a).toBe(b);
  });
});

describe('draft variety levers (T-variety)', () => {
  const mk = (
    id: string,
    tags: string[],
    baseWeight: number,
    synergyWeight = 0,
  ): UpgradeDefinition => ({
    id,
    name: id,
    description: '',
    tags,
    rarity: 'common',
    maxLevel: 1,
    baseWeight,
    synergyWeight,
    apply: () => {},
  });

  it('statFiller damp suppresses flagged ids (damp 0 → never offered)', () => {
    const REG = [mk('fill', ['a'], 10), mk('mech', ['b'], 10)];
    let withDamp = 0;
    let plain = 0;
    for (let s = 0; s < 200; s++) {
      const damped = rollDraft(REG, {}, new Rng(s), {
        count: 1,
        statFiller: { ids: new Set(['fill']), damp: 0 },
      });
      if (damped[0]!.id === 'fill') withDamp++;
      const base = rollDraft(REG, {}, new Rng(s), { count: 1 });
      if (base[0]!.id === 'fill') plain++;
    }
    expect(withDamp).toBe(0); // damp 0 zeroes its weight
    expect(plain).toBeGreaterThan(50); // unflagged, it shows ~half the time
  });

  it('wildcard slot ignores synergy → off-archetype card surfaces despite a deep build', () => {
    // Own tag 'x' (via a taken card) so the x-synergy card snowballs; 'b' is off-build.
    const REG = [mk('seed', ['x'], 1), mk('a', ['x'], 1, 100), mk('b', ['y'], 1)];
    const levels = { seed: 1 };
    const freq = (wildcardSlots: number): number => {
      let b = 0;
      for (let s = 0; s < 200; s++) {
        const [pick] = rollDraft(REG, levels, new Rng(s), { count: 1, level: 5, wildcardSlots });
        if (pick!.id === 'b') b++;
      }
      return b;
    };
    expect(freq(1)).toBeGreaterThan(freq(0) + 40); // synergy-free slot lifts the off-build card
  });

  it('hand diversity (damp 0) never offers two cards of the same lane together', () => {
    const REG = [mk('a1', ['x'], 10), mk('a2', ['x'], 10), mk('b', ['y'], 10)];
    for (let s = 0; s < 200; s++) {
      const ids = rollDraft(REG, {}, new Rng(s), { count: 2, diversityDamp: 0 }).map((d) => d.id);
      const bothX = ids.includes('a1') && ids.includes('a2');
      expect(bothX).toBe(false);
    }
  });
});
