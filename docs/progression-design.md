# MARS PIT — Progression Design Compilation

> Research-backed design notes mapping proven roguelike / incremental patterns onto MARS PIT's
> **actual current systems**. Every number here is tuned against what's in code today (see citations).
> This is a design doc, NOT the spec. Fold the parts you like into `SPEC.md` via `/spec`.
>
> Sources (deep-research, 24 verified claims): Soulstone Survivors, Vampire Survivors, Risk of Rain 2,
> Path of Exile (PoE1), Brotato, Rogue Legacy 2, Cookie Clicker, Realm Grinder, Egg Inc,
> Kongregate "Math of Idle Games" (Pecorella).

---

## 0. TL;DR — what to steal, ranked by payoff

| # | Pattern | Source | MARS PIT gap it fills | Effort |
|---|---------|--------|-----------------------|--------|
| 1 | **Proc coefficient per weapon** | RoR2 | Statuses apply flat — no weapon identity in proc strength. Fast spray vs slow hammer feel identical for on-hit | Low |
| 2 | **DoT = % of hit damage** | PoE1 | Burn is flat `3 dps` — doesn't scale, dead by minute 8 | Low |
| 3 | **Rarity-first roll + Lock** | Soulstone | Draft has reroll/banish/skip but no Lock; rarity is a continuous fudge not a clean tier roll | Low |
| 4 | **Glory = root(run score)** | Cookie Clicker / Egg Inc | `gloryFor` curve undefined as a pacing dial | Med |
| 5 | **Geometric permanent cost + Labor Costs inflation** | RL2 | Permanents are *linear* per level → no anti-snowball brake, late nodes trivial | Med |
| 6 | **Cap-raising 2nd prestige layer (Red Dust)** | RL2 Soul Shop | Red Dust defined in §I economy but unbuilt; no cap-lifting mechanic | Med |
| 7 | **Additive-within / multiplicative-across discipline** | Cookie Clicker | Catalog mixes the two ad-hoc; some "+25% dmg" cards dilute, some multiply | Audit |
| 8 | **Poison-style independent stacking fork** | PoE1 | All statuses currently MAX-refresh; no build that rewards fire-rate via stacking | Low |

---

## 1. Draft 2.0 — rarity-first roll, Lock, category banish

### 1a. Current vs proposed rarity roll

**Today** (`progression/upgrades.ts:141-161`): one continuous weighted pool. `rarityWeight` multiplies a base
per rarity by `1 + (level*0.035 + luck*0.12) * RARITY_BOOST`. Works, but rarity odds are entangled with
synergy weight and tag gates in a single `weightOf` — hard to reason about "what % chance is a legendary."

**Proposed** (Soulstone model — *roll the tier first, then pick within tier*):

```
TIER_WEIGHT = { common: 50, uncommon: 25, rare: 12, corrupted: 5, prototype: 4, legendary: 1 }
// late-game + luck lift the rare end:
lift(tier, level, luck) = TIER_WEIGHT[tier] * (1 + RARITY_BOOST[tier] * (level*0.03 + luck*0.10))
```

Roll tier ∝ `lift(...)`, then inside the chosen tier do the existing synergy/tag-weighted pick. Two clean knobs:
the **tier curve** (how often legendaries show) and the **in-tier weight** (which legendary, given build).

Normalized base odds (level 0, luck 0): common 51.5% · uncommon 25.8% · rare 12.4% · corrupted 5.2% · prototype 4.1% · legendary 1.0%.
At level 15, luck 3 the legendary slice roughly triples (still <4%) — keeps capstones special.

> **Decision:** keep the continuous model (simpler, fewer empty-tier edge cases with our small pools) OR
> move to tier-first (cleaner mental model, matches how players read odds). Recommend tier-first **only after**
> the catalog is wide enough that every tier reliably has ≥2 eligible cards post-gating (V11 risk otherwise).

### 1b. Lock (the missing draft resource)

Soulstone offers Reroll + Banish + **Lock** (carry one offered card to the next level-up). We have reroll/banish/skip.
Add Lock:

- `world.lockCard(i)` marks an offered upgrade; next `rollDraft` seeds the locked card into slot 0, rolls the rest.
- Bounded per-run resource like the others. Permanent source: an Arsenal node `Retainer Clause` (+1 lock/run).
- Interaction with reroll: locked cards survive reroll (already the established semantics — reroll "keeps locked").
  So Lock + Reroll = "hold this rare, gamble the other two." Strong, cheap depth.

### 1c. Category banish (Brotato New Dawn)

Brotato bans by **mechanical category** (lifesteal / dodge / elemental), not single items — 8 ban tokens.
We banish single upgrade ids. Add an optional **tag-banish**: `world.banishTag(tag)` removes every upgrade
that lists the tag from the run pool. Lets a player say "no drone cards this run" in one action.

- Gate it behind a permanent (`Blacklist Rights` already gives banishes — make tier-2 grant 1 tag-banish).
- Respect V11: refuse a tag-banish that would empty the pool; surface "would leave too few cards" instead.

---

## 2. Proc coefficient — weapon identity for on-hit effects

**The single highest-leverage steal.** RoR2: every attack carries one scalar `procCoef` that multiplies
on-hit trigger **chance AND duration AND magnitude**. Same status item feels different per weapon.

### Model

Add `procCoef: number` to `WeaponDefinition` (default `1.0`). Route ALL on-hit status/trigger application through it:

```
effectiveChance   = baseChance   * weapon.procCoef
effectiveDuration = baseDuration * weapon.procCoef
effectiveStacks   = max(1, round(baseStacks * weapon.procCoef))   // for stacking statuses
```

Suggested family coefficients (tune against fire rate — fast weapons get low coef so DPS-of-procs stays flat):

| Weapon family | Fire cadence | `procCoef` | Rationale |
|---------------|--------------|-----------|-----------|
| Rotary / SMG | very fast | 0.4–0.6 | many hits, each weak proc (RoR2 Nailgun = 0.6) |
| Ballistic rifle | medium | 1.0 | the reference |
| Explosive / cannon | slow, hits many | 0.7 (per target) | AoE already multi-applies |
| Beam / energy | continuous tick | 0.25–0.4 per tick | ticks constantly |
| Orbital / sniper | very slow, huge hit | 2.0–3.0 | rare big hits → long burns (RoR2 Railgunner = 3.0) |

Worked example (PoE-style bleed primer at base `10% / 3s / 1 stack`):
- on the rotary (0.5): `5% / 1.5s` per hit — but 10 hits/s ⇒ frequent short bleeds
- on the orbital (3.0): `30% / 9s / 3 stacks` per hit — rare, massive bleeds

### Proc chains (with a determinism guard)

RoR2's emergent payoff: a proc that deals damage can itself roll further on-hit effects → cascades.
We already route triggers through `BuildEffects.fire` + `applyAreaDamage`. To allow chaining safely under
V16/V21 (determinism) and V5 (no hot-path alloc / no runaway):

```
MAX_PROC_DEPTH = 1          // one re-entry; triggered effects carry procCoef < 1 so it decays anyway
procCtx.depth                // thread depth through TriggerCtx; refuse fire() when depth > MAX_PROC_DEPTH
```

- Triggered area damage fires at a **reduced** coefficient (e.g. inherit `0.2`, RoR2-style) so a depth-1 chain
  can't equal the primary hit.
- All rolls stay on the single seeded `Rng` (V16). Depth bound = no recursion blowup (V5/V8 spirit).

> Maps directly to `effects.ts` `TriggerCtx` — add `depth` + `procCoef` fields; gate `fire()`.

---

## 3. Status rework — DoT scales with the hit (PoE1)

**Problem:** `incendiary-rounds` applies burn `3 dps / 3s` flat (`advanced.ts`). At minute 1 that's meaningful;
at minute 10 with a 400-damage hit it's noise. Burn should scale with the weapon that lit it.

**PoE1 damaging-ailment math** (anchor PoE1, *not* PoE2 — PoE2 ignite is 20% vs PoE1 90%):

| Ailment | Magnitude (% of inflicting hit's matching dmg/s) | Base duration |
|---------|--------------------------------------------------|---------------|
| Ignite (burn) | 90% fire dmg/s | 4s |
| Bleed | 70% phys dmg/s (×3 while target moves) | 5s |
| Poison | 30% (phys+chaos) dmg/s | 2s |

### Portable formula

```
burnDps  = BURN_COEF  * hitDamage / BURN_DURATION    // BURN_COEF ≈ 0.9, dur 4s  → ~90% of hit over 4s
bleedDps = BLEED_COEF * hitDamage / BLEED_DURATION    // BLEED_COEF ≈ 0.7, dur 5s
// bleed movement amplifier: while enemy is seeking/moving, ×(1 + BLEED_MOVE_BONUS), cap ~3x
```

Keep our existing `markMult` amplifier folded in (mark already multiplies burn/bleed DoT by 1.5×).
Net: a status build's damage **tracks the player's hit damage automatically** — burn upgrades stay relevant
because the weapon got stronger. This is the fix for "statuses fall off."

### Stacking fork — the build-differentiator (PoE1)

Right now burn/chill/mark MAX-refresh; shock/corrode/bleed count-stack (`status.ts:50-88`). Formalize the fork
as a **deliberate design axis**:

| Stacking rule | Rewards | Use for |
|---------------|---------|---------|
| **Independent stacks** (poison-style: each application is its own concurrent instance) | **fire rate / multishot** (more hits = more stacks) | bleed, poison-analog |
| **Strongest-applies** (only the single biggest instance ticks) | **burst / big crits** | ignite/burn, mark |
| **Count-capped stacks** (N stacks, each adds a fixed %) | steady ramp | corrode (armor shred), shock (chain primer) |

This makes "rotary + bleed" and "sniper + burn" genuinely different builds rather than reskins.

### Non-damaging ailments = build amplifiers (PoE1 caps)

Reserve a second class of statuses as **modifiers**, magnitude-capped, scaled by hit (already half-built: chill, mark):

| Ailment | Effect | Cap (PoE1 reference) |
|---------|--------|----------------------|
| Chill | enemy slow | up to 30% (we use 40–60% — fine, our pace is faster) |
| Shock | enemy takes +% damage | up to +50% |
| Brittle | +crit chance vs target | up to +6% base (was +15%, nerfed — start low) |
| Sap | enemy deals −% damage | up to −20% |
| Scorch | −% elemental resist | up to −30% |

We have `shock` as a chain-primer today; giving it the **+damage-taken** identity (RoR2/PoE convergence)
makes it a universal amplifier worth drafting in any build. Strong candidate.

---

## 4. Reaction engine — already strong, two cheap additions

T53/T54 already ship the 5 reactions (Thermal Shock, Plasma Bloom, Rust Lightning, Blood Crystal, Acid Fog)
with atomic stack consumption (V28). Soulstone adds two ideas worth grafting:

1. **Source-count escalation.** In Soulstone, the Nth *source* of a status upgrades its behavior:
   1 source = apply on hit · 2 = also apply on crit · 3 = instant damage / faster tick.
   Map to our system: count how many owned upgrades grant a given status (`grantsTags`/status tags); at 2+,
   unlock on-crit application; at 3+, +tick-rate or an instant chunk. Pure content/weight logic on existing data.

2. **Cyclic combo chain.** Soulstone's `Burn→Slow→Disarray→Bleed→Poison→Doom→Burn`: two sources of status A
   *unlock the next status in the ring*. Our reactions are pairwise; a **ring** gives long-term build identity
   (a "status cycler" archetype). Optional — only if we want a dedicated ailment-stacking lane.

---

## 5. Prestige math — Glory curve, cost inflation, Red Dust cap-lift

### 5a. Why runs must end (the incremental theorem)

Kongregate/Pecorella, verified: cost grows **exponentially**, production grows **polynomially**, so
`lim x^k / n^x = 0` — any single power tier eventually stalls. **Justification** for MARS PIT's structure:
per-run power must plateau and feed a *separate* permanent multiplier layer rather than scaling unbounded in-run.
We already do this (RunMods plateau → Glory permanents). Keep it; don't let any single in-run stat go unbounded
without a soft cap.

### 5b. Glory award curve = the pacing dial (root of run score)

Prestige currency keys off a **root** of lifetime/run earnings; the exponent IS the pace knob (verified):

| Game | Exponent | "double prestige needs…" | Feel |
|------|----------|--------------------------|------|
| Cookie Clicker | cube root (1/3) | 8× score | frequent, satisfying |
| Realm Grinder | sqrt (1/2) | 4× score | very frequent |
| Egg Inc | ~1/7 | 128× score | grindy, active-play |

Define a **RunScore**, then Glory as a sub-linear function of it:

```
RunScore = survivalSeconds
         + kills * KILL_W                      // KILL_W ≈ 0.3
         + bossKills * BOSS_W                   // BOSS_W ≈ 120
         + difficultyTier * DIFF_W              // DIFF_W ≈ 60
Glory    = floor(GLORY_K * RunScore ^ GLORY_P)  // GLORY_K ≈ 2.5, GLORY_P ≈ 0.7
```

- `GLORY_P < 1` ⇒ **diminishing returns on a single long run** → rewards *more frequent* runs (Cookie-Clicker pacing).
  Lower it toward 0.6 if early runs feel too rewarding; raise toward 0.85 to reward pushing deep.
- Boss term is additive-pre-root, so a boss kill is a meaningful score jump but still passes through the root.
- This is the lever for "how grindy is the Glory Tree." Pick one number, tune live.

Sample (`K=2.5, P=0.7`): RunScore 200 → 96 Glory · 600 → 214 · 1500 → 425 · 3000 → 690.
(Doubling score 1500→3000 gives ×1.62 Glory — sub-linear, as intended.)

### 5c. Permanent cost curve — geometric + Labor Costs inflation

**Today** permanents are **linear** (`cost` flat per level, `permanent/index.ts`). That means a 4-level node at
cost 80 = 80/160/240/320 — late levels are trivially cheap relative to your Glory income late game. No brake.

**Proposed** geometric per-level + a global anti-snowball inflation (RL2 "Labor Costs"):

```
levelCost(node, n)  = node.baseCost * COST_GROWTH ^ (n-1)        // COST_GROWTH ≈ 1.55
globalMult(bought)  = 1 + max(0, bought - INFLATION_FREE) * INFLATION_STEP
// INFLATION_FREE ≈ 25 (first 25 purchases uninflated), INFLATION_STEP ≈ 0.02
finalCost           = ceil(levelCost(node, n) * globalMult(totalPurchasesAcrossTree))
```

- Geometric per-level keeps maxing a single node a real decision (level 4 of an 80-base node at growth 1.55 ≈ 298, not 320 — but level 6 ≈ 715).
- "Labor Costs" makes *breadth* cost more as you snowball: after 50 total purchases, everything costs ×1.5.
  Deliberate brake (RL2 triggers it at Manor Lv30). Bounded, telegraphed in the buy UI ("Labor surcharge: +50%").
- Tune `COST_GROWTH` 1.5–1.6, `INFLATION_STEP` 0.015–0.025. Verify against the Glory curve (5b) so total
  tree completion takes the intended number of runs.

### 5d. Red Dust = cap-raising second layer (RL2 Soul Shop / Cosmic Overload)

§I already reserves **Red Dust** as prestige / rule-change currency. RL2's two-layer model is the template:
Manor nodes have a rank cap; a separate Soul Shop prestige layer **raises the caps** (Strength 10 → 30 → 130
via "Cosmic Overload"). Apply:

- Glory buys node *levels* up to a base cap. **Red Dust buys cap increases** (and rule-breaks per V31).
- E.g. `Overcharged Rounds` caps at +4% dmg ×5 levels with Glory; a Red Dust node lifts the cap to ×8, then ×12.
- Keeps Glory meaningful run-to-run while Red Dust is the long-horizon "break the ceiling" layer.
- Pairs with V31 ("Red Dust changes foundational rules") — cap-lift is the *numeric* half, rule-break the *qualitative* half.

---

## 6. In-run stacking discipline (Cookie Clicker)

Verified: incremental power stacks **additively within a category, multiplicatively across categories**
(Cookie Clicker kittens ×1.36 × flavored cookies ×12373… → huge from many small %). Design rule for our catalog:

| Layer | Rule | Why |
|-------|------|-----|
| **Within a stat** (e.g. all +dmg% cards) | **additive**, then applied once | each card dilutes the last → soft cap, no single-stat infinite |
| **Across stats** (dmg × fireRate × crit × multishot) | **multiplicative** | builds compound; many small cards stay meaningful |

**Audit action:** our `damageMult` is "additive per card, multiplied in pipeline" (`mods.ts`) — correct.
But verify catalog cards labelled "+X% damage" all feed the *same additive bucket* (so 5× `overcharge` = +125%,
not ×1.25^5), while distinct multipliers (heavy-barrel's ×1.35, glass-cannon ×1.8) stay as separate
**multiplicative** factors. Tag each card `stackMode: 'additive' | 'multiplicative'` to make this explicit and
testable (V19). Distinguishing the two is what stops "+5% dmg" cards from being either useless or broken.

---

## 7. Concrete new cards (fills gaps, uses existing engine surfaces)

All slot into existing `UpgradeDefinition` + `BuildEffects` — no new systems beyond §2/§3 hooks.

| id | rarity | role | effect | needs |
|----|--------|------|--------|-------|
| `volatile-conduction` | rare | converter | shock now adds +25% damage-taken (PoE shock identity) instead of pure chain-primer | §3 shock rework |
| `hairline-fracture` | uncommon | primer | on-crit apply brittle: +4% crit vs target, 3s | brittle status |
| `arterial-spray` | rare | engine | bleed uses independent stacking; +1 max bleed stack/level | §3 stacking fork |
| `slow-burn` | uncommon | engine | burn duration ×1.5, burnDps ×0.7 (longer, gentler — strongest-applies synergy) | §3 DoT rework |
| `overpressure-primer` | rare | primer | weapon gains +1.0 procCoef (turns a spray gun into a status applicator) | §2 procCoef |
| `cascade-failure` | legendary | catastrophe | proc chains gain +1 depth (MAX_PROC_DEPTH 1→2), self-stagger on big chains (riskTier 3) | §2 chain depth |
| `compound-bleed` | corrupted | liability | +100% bleed dps, you also bleed when hit (telegraphed, counterplay = lifesteal node) | V30 |
| `retainer-clause` | uncommon | — | +1 draft Lock per run | §1b |
| `actuarial-tables` | rare | — | +15% Glory from this run per boss killed (greed/economy) | §5b score |
| `union-dues` | corrupted | liability | enemies drop +50% XP but gain +1 status resistance over time (Selective Pressure tie, T62) | T62 |

(Names lean into the Martian-corporate-brutalism voice already in the catalog: "clause", "dues", "writ", "audit".)

---

## 8. Tuning constants — one table to bring into balance data

Centralize so V13-style "no hardcoded curves in systems" applies to progression too:

```
// draft
TIER_WEIGHT        = {common:50, uncommon:25, rare:12, corrupted:5, prototype:4, legendary:1}
TIER_LIFT_LEVEL    = 0.03      // per run level, ×RARITY_BOOST
TIER_LIFT_LUCK     = 0.10      // per luck point, ×RARITY_BOOST

// proc
PROC_DEFAULT       = 1.0
PROC_CHAIN_INHERIT = 0.2       // coef triggered effects carry
MAX_PROC_DEPTH     = 1

// status DoT (PoE1-anchored)
BURN_COEF  = 0.9 ; BURN_DURATION  = 4
BLEED_COEF = 0.7 ; BLEED_DURATION = 5 ; BLEED_MOVE_BONUS = 2.0 (cap ×3)
SHOCK_DMG_TAKEN_MAX = 0.50
BRITTLE_CRIT_MAX    = 0.06
CORRODE_PER_STACK   = 0.06     // (already in code)

// glory / prestige
KILL_W=0.3 ; BOSS_W=120 ; DIFF_W=60
GLORY_K=2.5 ; GLORY_P=0.7      // P<1 = frequent-run pacing
COST_GROWTH=1.55
INFLATION_FREE=25 ; INFLATION_STEP=0.02
```

---

## 9. Drifts found while writing this (fix separately)

- **xp curve drift:** code `xpRequired = 4 + level*3 + floor(level^1.7)` (`balance/xp-curve.ts`) ≠ SPEC §I
  `8 + level*4 + floor(level^1.55)`. Pick one, update the other (V13 says curve lives in balance data — so
  amend SPEC §I to match code, or change code to match SPEC). Decide deliberately.

---

## 10. Suggested SPEC follow-ups (via `/spec`)

If adopting, these become new invariants / task edits:

- **§V (new):** proc application = `chance·duration·magnitude × weapon.procCoef`; chain depth ≤ `MAX_PROC_DEPTH`;
  deterministic (extends V21).
- **§V (new):** damaging-ailment dps = `COEF × hitDamage / duration` (scales with hit; no flat DoT in systems).
- **§V (new):** Glory award = `floor(K · RunScore^P)`, `P<1`; permanent cost geometric + bounded global inflation;
  Red Dust raises caps (extends V31). All progression curves in balance data (extends V13).
- **§T:** add Lock + tag-banish to draft (extends T41); procCoef pass on weapon families (ties T42);
  DoT-as-%-of-hit rework (extends T39/T52); Glory/Red-Dust economy build-out (ties T45/T50/T67).
