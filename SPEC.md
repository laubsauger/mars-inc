# SPEC

Codename: MARS PIT. Browser fixed-arena survivors-like shooter. Direct movement, auto-fire weapon escalation, roguelite draft, permanent prestige.

## §G GOAL

Ship browser top-down circular-arena shooter: WASD move + sprint, auto-targeting weapons, XP draft upgrades, escalating wave director, boss, death→stats→permanent currency→meta unlock→restart. First milestone = playable vertical slice "The Rust Crown". Companion art-direction notes for T37 live in `docs/art-direction.md`; progression design math (proc coef / DoT-as-%-of-hit / Glory curve / prestige cost) in `docs/progression-design.md`; SPEC remains authoritative.

Bosses are the progression HINGE, not bonus currency: normal combat → levels within a run; a boss kill grants ONE major in-run power jump + advances the run to a higher power tier; permanently, bosses gate WHICH Glory upgrades the player may access. (Boss-progression epic: §V22-26, §T43-50.)

ACT-RUN epic (§V36-41, §T75-80): default path = FINITE single playthrough. Run = ordered ACTS; each act arc = wave-block → Miniboss I → waves → Miniboss II → waves → Final Boss. ∀ act distinct miniboss+final-boss roster + hazards. FINITE is the intended shape (balance/pacing target the finite arc); INFINITE = opt-in gimmick AFTER an act's final boss (Overrun, T50). Pause-menu SURRENDER = honorable self-death: banks Glory + unlocks like normal death → ONE exit, ⊥ separate Quit. Unlocks/trophies/boss-kills persist AT KILL TIME so surrender/quit keeps progress. Boss kill → massively scaled blood-spray ground catastrophe; on-hit spray scales to target size. Final boss = distinct announce + healthbar vs miniboss. Dev menu forces arena/act/unlock bypass.

BUILD-MACHINE epic (§V27-31, §T51-68): upgrades ⊥ isolated bonuses — each CHANGES THE MEANING of another mechanic. Spine per build family: Primer (creates a status/resource/object/behavior) → Engine (generates value from it) → Converter (consumes/transforms it) → Liability (↑power + danger) → Catastrophe (boss-gated, run-defining culmination). Ordinary upgrades (burn/fire-rate/multishot/hp/speed/splash) stay relevant as INGREDIENTS. Statuses react chemically (⊥ just tick simultaneously). Skill tree gates WHICH RULES a build may break (⊥ +5%). Card pool is build-aware. Risky builds can fail but ⊥ become silently unwinnable (safety/recovery nodes). Target: player builds a dangerous machine out of interacting rules, not a pile of stat bonuses.

## §C CONSTRAINTS

- Stack locked: Vite + strict TypeScript + Three.js `WebGPURenderer`. WebGPU-only — ⊥ WebGL2 fallback. No-WebGPU device → clear unsupported message, ⊥ degraded render path.
- React + Tailwind (+ shadcn/ui via CLI) ! menus/screens only. ⊥ React for combat entities. ⊥ ad-hoc CSS files — Tailwind utility classes, no CSS chaos.
- Zustand store for app/UI state. HUD/screens subscribe to NARROW slices → ⊥ re-render canvas chunk or sibling widgets on slice change. Sim pushes HUD slice render-side, ⊥ from sim hot path.
- Sim authoritative & decoupled from render. ⊥ combat logic inside Three.js objects. Rendered entity = view of sim entity.
- Content defs (weapons/enemies/upgrades/waves/bosses/arenas) data-driven, typed, separate from systems.
- Fixed sim timestep `FIXED_DT = 1/60`, accumulator loop, render interpolates by `alpha`.
- Sim 2D: gameplay on `x,z`; `y` = visual height only.
- Deterministic seeded runs where feasible.
- Perf hot-path rules: ⊥ per-frame array alloc, ⊥ per-enemy raycast, ⊥ DOM per entity, ⊥ unique material per enemy, ⊥ dynamic light per projectile, ⊥ physics engine for crowd, ⊥ sync asset load mid-run. Cap audio voices. Pool repeated entities. Aggregate damage numbers.
- Quality tiers High/Med/Low. Threat sim equal across tiers; visual projectiles ? aggregated but damage sim correct.
- Save: IndexedDB primary + localStorage boot pointer. Versioned migrations. ⊥ trust client save for leaderboards.
- Camera fixed: whole arena always visible. ⊥ tracking / gameplay rotation / threat-hiding zoom. ? subtle recoil/shake/pulse only.
- Accessibility from start (rebind, controller, shake slider, flash reduction, colorblind, UI scale, separate volumes, pause-on-focus-loss).
- Tooling: Vitest, Playwright, ESLint, Prettier. glTF+KTX2+Meshopt pipeline.
- Every milestone ends browser-playable. ⊥ placeholder game-loop transitions. Missing art → coherent placeholder, ⊥ broken.
- No fallback convenience hacks for core systems; fix or throw test (global rule).
- Build composition (§T51-68): ordinary stat upgrades are INGREDIENTS, not the depth. Depth = upgrades that transform OTHER upgrades' mechanics. Every catalog card classified by `role` {primer|engine|converter|liability|catastrophe} + `riskTier` 0-3. Liabilities/catastrophes (riskTier≥2) carry a TELEGRAPHED danger + a reachable counterplay — ⊥ silent self-loss. Skill tree decides which rules a build may break (availability/weight/safety), ⊥ flat boosts.

## §I INTERFACES

- url: load app from normal web URL → boot → main menu. No-WebGPU → unsupported screen.
- menu: items {Enter Pit, Warrior, Arsenal, Glory Tree, Challenges, Records, Settings, Credits}.
- input: WASD move; `Shift` sprint; mouse aim/menu (?); Space|mouse active ability (?); `Escape` pause.
- data: `WeaponDefinition` {id,displayName,family,tier,fireMode,targeting,projectile?,cooldown,burst?,spread,recoil,heat?,effects,evolutionRequirements?,visualProfile,audioProfile,procCoef?}. `procCoef` (default 1) = weapon-family identity scalar: scales on-hit status/trigger `chance·duration·magnitude` (V32). fast-spray families low (~0.5), slow-big-hit high (~3).
- data: `UpgradeDefinition` {id,tags,prerequisites,exclusions,baseWeight,dynamicWeightRules,maxLevel,apply}.
- data: `UpgradeDefinition` extended (T51): + `grantsTags` (build-identity tags it contributes), `requiresAllTags?`/`requiresAnyTags?`/`excludesTags?` (own-tag gates), `requiredStatusEffects?`/`consumesStatusEffects?`, `treeGate?`/`bossGate?` (unlock keys), `riskTier 0|1|2|3`, `role primer|engine|converter|liability|catastrophe`, `weightRules[]` (build-aware appearance odds). "Own a tag" = any taken upgrade lists it in tags|grantsTags.
- data: `StatusReaction` (T53) {a,b status pair, consume (stacks removed atomically), effect (burst/AoE/vuln/boss-stagger via V3), riskTier}. e.g. Burn+Freeze→Thermal Shock, Burn+Shock→Plasma Bloom, Corrosion+Shock→Rust Lightning, Bleed+Freeze→Blood Crystal, Corrosion+Burn→Acid Fog.
- data: `DamagePacket` {sourceEntity,targetEntity,weaponId,baseDamage,damageType,critChance,critMultiplier,armorPenetration,knockback,stagger,tags}.
- data: `SpawnBudget` {threatPoints,maxConcurrentEnemies,eliteBudget,rangedBudget,hazardBudget}.
- data: `MovementStats` {moveSpeed,acceleration,deceleration,turnResponsiveness,collisionRadius,sprintMultiplier,sprintDuration,sprintCooldown,sprintCharges,knockbackResistance,recoilResistance}.
- save: `PlayerProfile` {schemaVersion,settings,accessibility,currencies,unlocks,permanentUpgrades,characterProgress[],weaponProgress[],records,achievements,runHistory[],prestigeState}. Export/import text+file. Corruption recovery. Timestamped backups.
- api: `SpatialHash` {insert,remove,update,queryCircle}.
- curve: `xpRequired(level) = 4 + level*3 + floor(level^1.7)` — loaded from balance data (`balance/xp-curve.ts`), ⊥ hardcoded in systems. (was `8+level*4+floor(level^1.55)` — drifted from code, realigned §B2.)
- curve: damaging-ailment dps = `COEF × inflicting-hit dmg / duration` (burn COEF~0.9/4s, bleed~0.7/5s, ×3 cap while target moves) — balance data, ⊥ flat dps in systems (V33).
- curve: Glory award = `floor(GLORY_K · RunScore^GLORY_P)`, `GLORY_P < 1` (sub-linear → frequent-run pace); `RunScore = survivalSec + kills·KILL_W + bossKills·BOSS_W + difficulty·DIFF_W`. Pacing dial = `GLORY_P` (V34).
- curve: permanent cost = `base·COST_GROWTH^(n-1) × (1 + max(0, totalBought − INFLATION_FREE)·INFLATION_STEP)` — geometric per-level × bounded global "Labor Costs" inflation. Red Dust buys cap-lifts (V34).
- dev overlay: FPS, frame/sim/render time, enemy/projectile/particle count, draw calls, hash occupancy, spawn budget, player DPS, incoming DPS, XP/min, upgrade history, seed. Controls: spawn enemy/boss, add XP, select/evolve, set speed, toggle invuln/AI, clear arena, benchmark, force tier, export log.
- dev: low-profile DEV MENU (overlay tab, `~` surface) collecting dev-only controls; compiled in ALL builds for now, restrict/remove later. Hosts the CONTROL BOARD (T74): grant any upgrade-card by id @level (applyUpgrade vs live mods/player/effects/upgradeLevels, ⊥ draft) +/- owned level; swap/force-evolve primary weapon (weaponSystem.setPrimary / availableEvolution); set any permanent node level + grant Glory (world.setPermanents+applyPermanents / save.mutate); set level / add-XP / heal / invuln / luck / draftSize; force-spawn variant (count/pos) / boss / clear-arena; force boss-reward draft; scenario presets. Each grant RUN-ONLY default + per-action PERSIST toggle (writes save). Routes thru real sim/save APIs only (⊥ bespoke bypass). EXTENDS+subsumes T4 control list (T4 stays metrics).
- data: `ActDefinition` {id,index,displayName,waveBlocks[],minibosses[bossId×2],finalBossId,hazardSet,arenaShiftPhase}. Run = ordered acts; default finite arc ends at last act's final boss → infinite opt-in (T50).
- data: boss `tier` {miniboss|final} drives announce-banner + healthbar style (V39).
- input: pause menu adds `Surrender` (= self-death, confirm prompt), subsumes standalone Quit (V37).
- fx: `bloodSpray(scale)` cue + pooled ground-splatter decals (V5); boss kill = max-scale catastrophe, on-hit spray scaled by target size (V38). reduce-flash honored (§C).
- save: progression unlocks bank AT KILL/UNLOCK TIME (boss-killed / first-kill / arena), ⊥ deferred to run-end (V40).
- dev: control board gains arena/act/boss UNLOCK + restriction-bypass + gate-reset controls thru real save/sim APIs (V41, extends T74).
- currency: Martian Glory (meta), Red Dust (prestige).
- economy hierarchy (3 layers, non-competing): **Martian Glory** = universal permanent upgrade currency (earned survival/kills/boss/difficulty/challenge/extraction; spent skill-tree/slots/rerolls/loadout/economy). **Boss Trophies** = tracked COUNTS (achievement/progression keys; ⊥ spendable wallet, ⊥ shown as a balance) that GATE boss-themed nodes which Glory pays for. **Red Dust** = prestige / rule-change. ⊥ per-boss spendable currency. Rule: normal combat makes Glory; bosses gate which Glory upgrades are accessible; prestige → Red Dust.

## §V INVARIANTS

V1: sim step fixed `1/60`; render decoupled, interpolates by `alpha`. ⊥ sim coupled to frame rate.
V2: ⊥ combat logic in Three.js objects; render reads sim, never mutates sim authority.
V3: ∀ damage → single centralized pipeline, fixed order (base→additive→mult→crit→element→armor→shield→health→knockback→stagger→status→on-hit→on-kill→stats). ⊥ weapon bypasses pipeline.
V4: gameplay coords = `x,z` only; `y` ⊥ affects sim.
V5: ∀ repeated combat entity (enemy/projectile/pickup/dmg-number/effect/decal/drone/light/audio) → pooled. ⊥ per-frame alloc in hot systems.
V6: ⊥ per-enemy raycast, ⊥ DOM per entity, ⊥ unique material per enemy, ⊥ dynamic light per projectile, ⊥ physics engine for crowd.
V7: camera always shows whole arena. ⊥ tracking/gameplay-rotation/threat-hiding zoom.
V8: enemy count ≤ `SpawnBudget.maxConcurrentEnemies`; director spend ≤ budget. ∀ seeded run → bounded & terminates.
V9: ∀ spawn → readable telegraph before enemy active. ⊥ pop at arena edge.
V10: recoil impulse capped; player ⊥ uncontrollable from recoil.
V11: upgrade draft pool never empty; ⊥ offer invalid combo (respect prerequisites/exclusions).
V12: director adapts composition not raw per-enemy stats to player damage; adaptation bounded.
V13: `xpRequired` from balance data; ⊥ hardcoded in gameplay system.
V14: save versioned; load old schema → migrate; corrupt save → recover, ⊥ crash.
V15: app survives refresh → restores save. Run restarts ⊥ page reload.
V16: same seed → same sim outcome (determinism where feasible).
V17: threat sim identical across quality tiers; only visuals degrade.
V18: weapon evolution gated by combo requirements, ⊥ level-5 alone.
V19: ∀ core math system (damage/upgrade-stack/xp/spawn-budget/drop/prestige/target-select/status-timing/evo-req) → unit test.
V20: post-game stats accurately describe run (counts/damage/time match sim events).
V21: build effects/triggers/conditionals/status (T38/T39) resolve via the V3 pipeline in fixed order, pooled (V5), deterministic under seed (V16). ⊥ an upgrade bypassing the pipeline or adding nondeterminism.
V22: boss kill → exactly ONE in-run major reward from {weapon-evolution, system-expansion (weapon/passive/drone/sprint/ultimate slot), character-mutation (run-defining ability), boss-artifact (power + drawback)}. ⊥ zero, ⊥ silent.
V23: boss kill ALWAYS advances the run phase (↑roster / new hazard / ↑elite-freq / arena light-geo shift / ↑drops / ↑upgrade-rarity unlocked) — the build graduates to the next power tier.
V24: boss trophies + first-kill unlocks bank IMMEDIATELY (⊥ require surviving the run). A secured portion of boss Glory banks immediately; the rest → a run-pot with an extraction multiplier, partially lost on death.
V25: a boss-gated node requires (trophy mastery threshold + Glory cost + ? achievement). Trophies GATE, Glory PAYS. ⊥ trophies-as-cash.
V26: boss mastery = feat-based (defeat / fast / no-damage / specific-weapon-family / enraged / arena-modifier), ⊥ health-scaling padding.
V27: every non-base upgrade CREATES (primer) or TRANSFORMS (engine/converter/liability/catastrophe) an existing mechanic; classified by `role` + `riskTier`. ⊥ isolated +x% as the only path to build depth.
V28: status reactions resolve via the V3 pipeline, pooled (V5), deterministic (V16/V21); a reaction CONSUMES its trigger stacks atomically before applying its effect. ⊥ double-spend, ⊥ bypass pipeline, ⊥ nondeterministic reaction.
V29: card-pool selection is build-aware — honors tag gates (requiresAll/Any/excludes) + boss/tree gates + status requirements + risk weighting; pool still never empty (V11). Coherent builds draw bounded adaptive counters (V12).
V30: ∀ Liability/Catastrophe (riskTier ≥ 2) → a TELEGRAPHED danger AND a reachable counterplay; recovery/safety nodes exist so a risky build can FAIL but ⊥ become silently unwinnable.
V31: skill tree gates WHICH RULES a build may break (availability/weight/safety) + reveals boss-gated ecosystems; ⊥ flat stat boosts as its primary role. Red Dust changes foundational rules. (3-layer economy §I unchanged.)
V32: ∀ on-hit status/trigger application scales by `weapon.procCoef` (default 1) → effective `chance·duration·magnitude`; fast-spray families low coef, slow-big-hit high. Proc chains depth-bounded ≤ `MAX_PROC_DEPTH`, triggered effects inherit a reduced coef (geometric decay). Resolves V3 pipeline, pooled (V5), deterministic (V21). ⊥ proc strength independent of weapon, ⊥ unbounded chain recursion.
V33: damaging-ailment dps = `COEF × inflicting-hit dmg / duration` (burn/bleed track weapon dmg, scale with the run) — ⊥ flat hardcoded dps in systems. ∀ status declares a stacking rule {independent (concurrent instances, rewards fire-rate) | strongest-applies (rewards burst) | count-capped (steady ramp)}. Modifier ailments (chill/shock/brittle/sap/scorch) magnitude-capped, scaled by hit. Routes V3, deterministic (V21).
V34: Glory award = `floor(GLORY_K · RunScore^GLORY_P)`, `GLORY_P < 1` (sub-linear pacing dial). Permanent cost = geometric per-level × bounded global "Labor Costs" inflation (free tier then capped step) — ⊥ linear permanent cost. Red Dust raises node caps + breaks rules (extends V31). ∀ progression curve (xp/glory/cost/prestige) lives in balance data (extends V13). ⊥ hardcoded progression curve in a system.
V35: dev tools (control board, T74) mutate state ONLY thru real sim/save APIs (applyUpgrade / weaponSystem.setPrimary / world.setPermanents+applyPermanents / save.mutate / enemies.spawn / chooseBossReward) — ⊥ bespoke path bypassing V3 pipeline / pooling (V5) / determinism (V16). Grants RUN-SCOPED by default; per-action PERSIST toggle is the only path that writes the profile. A tampered run is FLAGGED cheated → ⊥ banks records / Glory / runHistory (extends "⊥ trust client save", §C). Closed board ⊥ affects production flow; surface is dev-only + removable.
V36: run default = FINITE act arc: [wave-block → Miniboss I → wave-block → Miniboss II → wave-block → Final Boss] per ACT. ∀ act → distinct miniboss+final-boss roster + hazard set. Infinite = opt-in ONLY after an act's final boss (T50). Balance/pacing target the finite arc; ⊥ assume endless as default.
V37: pause-menu SURRENDER = self-death → routes the normal death path (Glory + unlocks banked, run-end stats). ONE exit (surrender subsumes Quit; ⊥ both). Irreversible → confirm before. ⊥ surrender silently discards earned progress.
V38: boss kill → exaggerated scaled blood-spray ground catastrophe (pooled decals+FX, V5; FX-queue routed, ⊥ sim authority V2); spray magnitude scales with boss size. ∀ on-hit blood spray scales with target size (big enemy → big spray). reduce-flash/accessibility honored (§C).
V39: final/end boss → DISTINCT announcement + healthbar treatment vs miniboss (boss tier readable); per-act boss identity. ⊥ identical UI for miniboss vs final.
V40: in-run progression unlocks (boss-killed flags / first-kill / trophies / arena unlocks) PERSIST AT KILL/UNLOCK TIME, ⊥ deferred to run-end; surrender/quit/death after → progress kept (reinforces V24 immediate-bank; cheated-run flag V35 still gates).
V41: dev menu may FORCE unlock/restriction bypass (arena/act/boss gates, reset locks) thru real save/sim APIs ONLY (extends V35); such mutation flags the run cheated → ⊥ banks records/Glory (V35). ⊥ bespoke bypass path.
V42: while ANY boss (mini/final) is on the field the NORMAL wave cadence (themed bursts, gate pulses, teleport waves) PAUSES — those clocks freeze (breather ⊥ spent mid-fight) — and a SEPARATE bounded boss-creep cadence runs instead (gated/teleported reinforcements, ? phase-orchestrated). The fight = the boss + its summons + the creep. ⊥ full normal horde during a boss; ⊥ a hard zero-spawn block. Cap-bounded (V8). Resumes the instant the boss falls.
V43: boss presence VISIBLY escalates the arena — a readable persistent cue (tier-distinct, ⊥ a momentary flash) signals "boss on field". Accessibility-safe: ⊥ fast pulse / large blinking; honours reduce-flash (§C). Pure view (V2).
V44: ∀ combat announcement (final-boss / miniboss / themed-wave / weapon-evolution / new-enemy) carries its OWN kind → correct text + styling. ⊥ one banner kind overloaded across unrelated events (the "FINAL BOSS: <wave>" mislabel, B3). Boss tier label comes from the event, ⊥ a live slice that may be stale/default.

## §T TASKS

id|status|task|cites
T1|x|scaffold Vite+strict TS+ESLint+Prettier+Vitest+Playwright|§C
T2|x|Three.js WebGPURenderer init + WebGPU support detect → unsupported screen if absent|§C,§I.url
T3|x|render loop + fixed sim loop (accumulator, alpha) + resize|V1,V4
T4|~|quality tier detect + dev overlay (metrics+controls)|V17,§I
T5|x|circular floor + collision boundary + fixed cam + lighting/shadows + 4 gates + floor material + basic outline. art refs: `docs/art-direction.md` arena/texture/shadow direction|V7,§I.url
T6|x|player: load placeholder, WASD accel move, boundary response, health, anim state. art refs: `docs/art-direction.md` Lilu Tubs + player health plate|§I.input,V4
T7|x|sprint: charge/duration/cooldown/multiplier + collision forgiveness + recharge UI (pips). thruster-trail visual → T37; art refs: `docs/art-direction.md` sprint trail/HUD|§I.input
T8|x|recoil impulse capped (applyRecoil + tests). weapon wiring → T14|V10
T9|x|entity model: SoA archetype pool (EnemyPool) + documented system order. generic ECS deferred (rule 7)|V2
T10|x|spatial hash (insert/clear/queryCircle, reused arrays)|§I.api,V6
T11|x|enemy seek steering + separation + staggered low-freq (~20Hz) update|V8
T12|x|enemy instancing (single InstancedMesh, per-instance color/variant). flash/dissolve/health read → T16/T37; art refs: `docs/art-direction.md` enemy health/model briefs|V6
T13|x|gate spawn + telegraph state + swap-remove pools. on-kill wired at T14/T15 weapons; art refs: `docs/art-direction.md` gate telegraph direction|V9,V5
T14|x|weapon: targeting modes (default mouse-aim + ground cursor; nearest/lowest-hp/nearest-to-aim kept) + cooldown + pooled projectiles + collision + recoil. art refs: `docs/art-direction.md` weapon visual briefs|V5,V10,§I.data
T15|x|centralized damage pipeline (computeOutgoing base..element + applyMitigation armor/shield); all weapons route through it|V3,§I.data
T16|x|sim→render FX queue + pooled effects (muzzle star / impact ring / death dust / cyan sprint trail, additive cards, ⊥ per-shot light) + capped-voice synth audio. follows docs/art-direction.md Effects Plan|V5,V6
T17|x|XP shards (pooled) + magnet/pickup collection + level curve from balance data + leveling. art refs: `docs/art-direction.md` XP shard/HUD style|V13,§I.curve
T18|x|3-choice draft overlay (freezes sim) + run-mod layer + 8 upgrades (dmg/fire-rate/multishot/sprint-cd/crit/speed/magnet/hp) + synergy-weighted roll. SHALLOW PLACEHOLDER → real depth in T38-T41. art refs: `docs/art-direction.md` upgrade draft cards|V11,§I.data
T19|x|UpgradeDefinition apply + tag synergy weighting + prerequisites/exclusions (gated evolution + mutually-exclusive pair) + tests. effect model still flat → T38|V11,§I.data
T20|x|run state: 3s countdown (HUD), timer, budgeted WaveDirector (threat accrual + concurrent cap + gate telegraph, bounded bank) replacing placeholder spawner, pause. enemy threat costs|V8,§I.data
T21|x|adaptive director: computeAdaptation(build) → bounded pace + hound-bias (offense accelerates schedule, multishot → tankier mix). composition not per-enemy stats; hard-clamped, cap still honored|V12
T22|x|player death + result calc + restart (no reload) + menu transition|V15,V20
T23|x|post-game stats page (counts/damage/derived). art refs: `docs/art-direction.md` post-game invoice style|V20
T24|x|save: versioned PlayerProfile schema + normalizeProfile (forward-compat, ⊥ throw) + IndexedDB store + localStorage boot pointer + SaveManager (debounced flush, load-fallback) + settings persist. e2e: survives refresh|V14,§I.save
T25|x|versioned migration runner (chained, loop-guarded) + corruption recovery (quarantine bad data, fresh default, ⊥ crash) + export/import text + rolling timestamped backups (pruned)|V14
T26|x|award Martian Glory on death (gloryFor) + records/runHistory + 2 permanent upgrades (data) applied at run start + buy panel on game-over → next run applies. closes the §25 meta loop|V15,§I.save
T27|x|main menu over live arena (8 signage items) + Warrior(Lilu Tubs)/Records/Settings(volume) live, Arsenal/GloryTree/Challenges coming-soon, Credits. run starts on Enter-the-Pit (world.started gated at driver, step() stays headless), game-over → Restart/Menu. dev `?play` autostart. art refs: `docs/art-direction.md` HUD/menu direction|§I.menu
T28|x|determinism: seeded RNG threaded through sim|V16
T29|x|headless sim tests: bounded counts, runs terminate, boss spawns, pool ⊥ empty, dmg bands|V8,V19
T30|~|unit tests: damage/upgrade-stack/xp/spawn-budget/drop/target-select/status/evo-req|V19
T31|x|Playwright: boot→menu→run→move→pause→upgrade→death→restart→save persist→no-WebGPU unsupported screen→viewport→focus-loss|V15
T32|x|perf benchmark scenes 500/1k/2k enemies + projectile storm + crowd; record sim/render/draws/alloc (sim+alloc headless; render/draws → T31 GPU bench)|V5,V17
T33|.|slice content: arena Rust Crown, char Lilu Tubs, 6 weapons, 8 enemies, boss Gatekeeper of Phobos, 34 upgrades. art refs: `docs/art-direction.md` model/weapon/humor briefs|§I.data,V18
T34|x|weapon evolution combo gating: data-driven EVOLUTIONS (base weapon id → evolved def behind upgrade-combo requirements) + availableEvolution checker; world.choose auto-evolves the primary when the combo completes (⊥ weapon level alone); evolved Rust Devil Apex / Tesla Cascade; HUD evolution banner. art refs: `docs/art-direction.md` weapon evolution read|V18
T35|x|Glory Tree menu (3 branches Arsenal/Biology/Mobility, buy w/ Glory) + Arsenal(House Odds reroll, Blacklist Rights banish, Lucky Streak luck) + Mobility(Fleet-Footed speed) permanents. draft-resource bonuses (player.bonusRerolls/Banishes) flow into world.reset. art refs: `docs/art-direction.md` menu/contract UI|§I.menu,§I.save
T36|~|accessibility pass. DONE: settings panel (master/sfx volume, screen-shake, UI-scale sliders + reduce-flash/hold-to-sprint/auto-pause toggles) persisted via save; wired master+sfx volume, camera shake (`render/camera-shake.ts`, FX-driven, setting-scaled, V7-bounded), reduce-flash (effects), UI-scale (root font), pause-on-focus-loss. TODO: key rebind, controller, colorblind palettes, hold-to-sprint behavior. art refs: `docs/art-direction.md` flash/shake/health readability|§C
T37|~|art direction (Martian Pulp Brutalism, `docs/art-direction.md`). DONE: render-side art tokens (`render/art/palette.ts`) + recolor all views to palette + in-world enemy naming. TODO: TSL toon/ink material, atlases, pooled particles (after T16), contact/grounding shadow polish, reactive arena, accent discipline.|§C

# DEPTH DEBT — progression is a SHALLOW PLACEHOLDER (T18/T19/T26 = thin vertical slice).

# Current: 1 weapon, flat RunMods (dmg/fireRate/multishot/spread/crit), 3 rarities used, ~10

# linear upgrades, no triggers/conditionals/status/projectile-behaviors, no build directions.

# Target: a deep build system where many distinct archetypes + directions emerge. Open scope.

T38|x|BUILD-DEPTH ENGINE — `BuildEffects` (sim/progression/effects.ts): CONDITIONAL modifiers (eval per-step vs enemies-on-screen/nearest-dist/firing-ramp/hp-frac → transient dmg+crit, folded into weapon fire) + TRIGGER hooks (kill/overkill wired; hit/crit/shot/lowHp/sprint/waveClear surfaces ready) firing pooled `applyAreaDamage` (V3-routed). UpgradeContext gains `effects`; ADVANCED_UPGRADES showcase set proves directions (risk/ramp/crowd conditionals, executioner/legendary-nova triggers). Projectile-behavior flags (pierce/chain) live in RunMods+weapon-system (T33 lane). recentCrit/on-shot/on-hit + full catalog → T39/T40/T41.|V3,V11,V21,§I.data
T39|x|STATUS EFFECTS — per-enemy status component in EnemyPool SoA (burn/chill/mark live; corrode/infection/shock framework-ready). `combat/status.ts` applyStatus + tickStatus (burn DoT via V3 pipeline, mark amplifies, chill slows movement in enemy-system; ticked in §5.4 status step, deterministic V21). Applied on-hit via weapon-system `onHit` callback → effects `hit`/`crit` triggers (completes T38 surface). Enemy-view status tint (burn=hot, chill=cyan). Demo upgrades: Incendiary/Cryo/Focusing Optics. corrode→armor, infection→death-hook, shock=T33 chain.|V3,V5,§I.data
T40|x|UPGRADE CATALOG DEPTH — replace shallow T18 set. Wide catalog across ALL 6 rarities (common/uncommon/rare/legendary/corrupted/prototype) producing DISTINCT directions: ballistic-crit, rotary heat/recoil-mobility, explosive cluster/chain, drone swarm, energy beam-geometry, orbital strike, infection/spore, shield/overkill, glass-cannon, bruiser/tank, summoner, economy/greed. Curses (corrupted: big upside + real downside), capstones (legendary), experimental (prototype). Anti-synergy/exclusivity webs. Diverging scaling (additive vs mult vs threshold-unlock). ≥80 upgrades.|V11,§I.data
T41|x|DRAFT DEPTH — rarity-weighted roll (`rarityWeight` by level+player.luck, rarer tiers lift late); reroll (keeps locked) / banish (per-run, never reoffered) / skip→heal, each a bounded per-run resource; UpgradeScreen rarity-colored cards + lock/banish/reroll/skip + keyboard. omen/evolution-offers → later. |V11,§13.5
T42|.|WEAPON-FAMILY MECHANICS DEPTH — give the 6 families distinct identity systems (rotary spin-up+heat+recoil-mobility; explosive min-safe-distance+chain; drone formation/interception; energy overheat/refraction; orbital telegraph-strike) so weapons PLAY differently, not stat reskins. Ties T33/T34.|§I.data,V18
T43|x|BOSS REWARD — boss kill now opens a 3-choice major reward (sim-freeze overlay) + applies it, then the run CONTINUES (no auto-win; that's T50). Rewards: Field Evolution / Munitions Bay + Overclocked Servos (system) / Volatile Crits + Adrenal Surge (mutation) / Phobos Reactor Heart (artifact, power+drawback). `sim/boss-rewards.ts` + BossRewardScreen + store slice + main bridge. End-screen redesigned (T23): rich one-page run summary (spoils: glory earned/bosses felled/level; survival/offense; loadout; build = upgrades taken; kills-by-type) — Glory buying moved to the menu Glory Tree.|V22,§I.data
T44|x|RUN-PHASE ESCALATION — per-boss-kill tier bump: stronger roster, new environmental hazard, ↑elite-freq, arena lighting/geometry shift, ↑resource drops, ↑upgrade-rarity unlocked. Director + arena read current tier. Deps: T20/T21 director, T33|V23,V43,V8
T45|x|BOSS TROPHIES + BANKING — PlayerProfile tracked trophy counts per boss; banking/extraction economy: secured Glory (immediate) vs run-pot Glory (extraction multiplier, death partial-loss); trophies+first-kill bank immediately. Deps: T24/T26 save+Glory|V24,§I.save
T46|x|BOSS MASTERY TRACKS — per-boss feat track (defeat / fast / no-damage / specific-weapon-family / enraged / arena-modifier); progress in PlayerProfile; ⊥ health-scaling padding. Deps: T45|V26,§I.save
T47|x|BOSS-GATED GLORY-TREE BRANCHES — boss victory reveals themed Glory-tree section; nodes require (mastery threshold + Glory cost + ? achievement). e.g. Gatekeeper Arsenal: rotary unlock, recoil→proj-dmg, Gatekeeper Cannon evo. Deps: T35 Glory Tree, T45/T46|V25,§I.menu,§I.save
T48|x|FIRST-KILL UNLOCKS — first boss victory unlocks BREADTH (weapon family / character / arena / upgrade category / challenge mode / new tree branch), banked immediately. Deps: T45|V24,§I.save
T49|~|DIFFICULTY-MILESTONE REWARDS — table: 1st-kill→major content, D2→artifact, D4→weapon-evo, D6→char-mutation, no-damage-kill→special upgrade, timed-kill→challenge modifier, max-diff→prestige node/cosmetic. Deps: T44/T46|V22,§I.save
T50|.|FINAL-BOSS CONCLUSION — per-act final-boss run-end choice {Extract (bank all) / Overrun endless = the opt-in infinite gimmick (↑currency-mult, ↑enemies, ↓heal, unbanked-at-risk) / Sacrifice build→research blueprint (remember-upgrade / boost-synergy-rate / echo-warrior / prestige-by-dominant-tags)}. Finite arc is the default (V36); Overrun is the explicit infinite path. Deps: T45 banking, T75 acts, prestige|V24,V36,§G

# BUILD-MACHINE EPIC (§T51-68) — upgrades that change the meaning of other mechanics. T51 = FOUNDATION (build everything else on it). T52-66 = build families (each a primer→engine→converter→liability→catastrophe chain). T67-68 = skill-tree reweave + safety. Most are content+system; sequence respects deps.

T51|x|CARD-POOL DATA MODEL (FOUNDATION) — extend UpgradeDefinition (grantsTags, requiresAllTags/Any/excludesTags, requiredStatusEffects, consumesStatusEffects, treeGate, bossGate, riskTier, role, weightRules) + ownedTags(tags∪grantsTags) computation + build-aware `available()` (tag/status/boss/tree gates) + build-aware weighting (owned-tag boost, risk weighting). backward-compatible (all new fields optional). tests.|V27,V29,V11,§I.data
T52|x|STATUS SUBSTRATE EXPANSION — add Shock, Corrosion, Bleed to EnemyPool SoA beside burn/chill/mark; stack model (count + duration per status); applyStatus/tickStatus handle them (corrode→armor shred, shock→chain primer, bleed→DoT scaling on hits); enemy-view tints. extends T39.|V3,V5,§I.data
T53|x|STATUS-REACTION ENGINE — `StatusReaction` registry + resolver: a status pair on one enemy CONSUMES both stack-sets atomically → burst/AoE/vuln/boss-stagger via V3 pipeline, pooled, deterministic. plug into status application (on apply, check for a primed reaction). cross-upgrades: Feedback Loop (reaction→brief cooldown cut), Conservation of Violence (consumed duration→nearest unaffected), Unstable Equilibrium (dmg per distinct active status), Bad Chemistry (chance of wrong-but-stronger reaction).|V28,V21,§I.data
T54|x|REACTION CHAINS (content) — the 5 status pairs as primer→…→catastrophe card chains: Thermal Shock (Burn+Freeze: Brittle Accounting→Temperature Fraud→Thermal Shock→Continental Fracture), Plasma Bloom (Burn+Shock), Rust Lightning (Corrosion+Shock), Blood Crystal (Bleed+Freeze), Acid Fog (Corrosion+Burn). each card sets role+riskTier+tag gates. Deps: T51-T53|V27,V28
T55|x|RECOIL BUILD FAMILY — recoil-recharges-sprint (Backblast Harness) → recoil-movement buffs dmg+pierce (Brass Surfing) → shockwave (Countermass) → fire-rate ramp while target exists (Kinetic Overdraft) → continuous push + periodic radial blast (God-Kicker). cross: burn-trail / shock-wall / sprint-ramming. ties V10 recoil cap (Infamy node removes it).|V27,V10
T56|.|UNEXPLODED ORDNANCE — duds as pooled persistent objects (missed rockets→mines), explosion-relaunch, fuse-inheritance (dud copies modifiers), sprint-detonate, chain-amplify, replication catastrophe (The Whole Floor Is Ammunition). telegraphed blast zones (V30).|V27,V5,V30
T57|.|DRONE BUILD DEPTH — drones consume XP to self-improve / cannibalize dead drones / replicate (Grey Goo, no cap) competing with player leveling; Receiver Override (sprint recall→XP+heal+blast). combinations: static-swarm/incendiary-nesting/drone-burial/bad-parenting. Deps: drone system (T40/T42)|V27,V5
T58|x|XP-AS-RESOURCE — uncollected XP gains value (Compound Interest), harvester-bait enemies, magnetar orbit (orbiting shards damage), liquidation (sprint fires shards, lost), Market Crash (mass collapse→AoE+megapickup). Deps: T17 XP|V27,V13
T59|.|PAIN / DEATH-DEBT — wound-reactor (damage charges weapon), scar-tissue, pain-dividend (<40% hp kills drop dmg orbs), Death Deferred (lethal→5s visible debt: ↑dmg/↑speed/no-heal/kills-reduce), Too-Angry-To-Die. biology safety nodes (Auxiliary Heart).|V27,V30
T60|.|SPRINT / NEAR-MISS — near-miss telemetry→Adrenaline (crit+proj-speed), slipstream-harvest (XP extends sprint), afterimage-ambush, Redline Doctrine (cd only recharges toward enemies), Do-Not-Stop-Running (standstill drains). Deps: T7 sprint|V27,V10
T61|.|CROWD FAVOR — in-run Favor meter (rises: close kills/multikills/near-miss/long-chains/boss-stagger/env-elite-kills/holding-liabilities; falls: avoidance/repeat-damage/same-safe-attack/leftover-enemies). Crowd-Pleaser (↑rarity), Sponsor Drop, Booed-Off (favor 0→elite), Encore (max-favor boss→mutated phase+↑Glory). ties Glory (§I economy). Deps: T26 Glory|V27,§I.menu
T62|.|ENEMY ADAPTATION — Viral Payload (status spreads on death), Selective Pressure (10s survival→resistance + more XP), Arms Race (resistant enemies gain a status-themed attack), Catalyst Harvesting, Mutual Escalation (enemy resistance ↑player matching status). Deps: T52 statuses, T21 director|V27,V12
T63|.|MARKING / POSSESSION — Spotlight (arena marks one enemy), Celebrity Death (kill→Favor+hp-explosion), Passing-the-Crown, Royal Procession (formation), King of the Pit (mark→miniboss+loot), Hostile Takeover (kill King→steal abilities for the wave). Deps: T39 mark|V27
T64|.|WEAPON MALFUNCTION — Loose Capacitor (20th shot random), Productive Misfire (fail→close blast), Runaway Chamber, Parts-Left-Over (malfunction↑fire-rate↓accuracy), Warranty Void (random unlocked behavior per volley: beam/rocket/ricochet/shotgun/drone/mine/shock). Deps: T42 weapon families|V27,V18
T65|x|CORPSE / OVERKILL — Waste Not (overkill stored in corpse), Violent Recycling (corpse explodes by stored), Body Ballistics (launch corpses), Chain of Evidence (inheriting overkill), Mass Casualty (overkill→Glory fragments), Moonshot (big corpse→orbital meteor return). Deps: V3 overkill surface|V27,V3
T66|.|CROSS-BUILD SHARED UPGRADES — connectors between families: Critical Mass (distinct active build-tags→explosion radius + self-knockback), Sympathetic Failure (one system overload→all overloaded systems fire), plus Feedback Loop/Conservation/Unstable-Equilibrium/Bad-Chemistry (from T53). riskTier 2-3.|V27,V30
T67|.|SKILL-TREE REWEAVE — 6 branches gate WHICH RULES break, ⊥ flat boosts: Arsenal (converters/malfunctions/duds/catastrophe cards/evo slots), Biology (self-status/death-debt/dmg→resource/infection), Mobility (recoil-steer/sprint-reactions/near-miss/ramming/momentum), Command (drone-replication/XP-drones/orbital/recalls), Arena (crowd-favor/sponsor/env-reactions/hazards/Glory-risk-mult), Infamy (uncapped scaling/self-damage/enemy-adaptation/hidden-telegraphs/↑Glory-mult). boss-gated nodes reveal catastrophe ecosystems; Glory pays. Deps: T35 Glory Tree, T47 boss-gated branches|V31,V25,§I.menu
T68|.|SAFETY / RECOVERY NODES — risky builds fail without becoming silently unwinnable: Field Retrofit (post-boss swap a card by tags), Emergency Stabilizer (negate first self-catastrophe), Salvage Doctrine (dead-end→generic levels), Research Memory (seed a discovered Primer early), Controlled Failure (first backfire→invuln+Favor), Cross-Discipline Lab (2 incompatible converters), No Going Back (disable removal, +25% Glory). Deps: T67|V30,V31

# PROGRESSION MATH PASS (§T69-73) — research-backed (`docs/progression-design.md`): proc identity, scaling DoT, draft+, Glory/prestige curves, stacking discipline. Tunes existing systems; ⊥ new epics.

T69|x|PROC COEFFICIENT — `WeaponDefinition.procCoef` (default 1); route on-hit status/trigger via `chance·duration·magnitude × procCoef`; family coefs (rotary~0.5 … ballistic 1.0 … orbital~3.0). Proc chains depth-guarded (`MAX_PROC_DEPTH`, inherited reduced coef `PROC_CHAIN_INHERIT`), single-Rng deterministic. Thread `depth`+`procCoef` through `effects.ts` TriggerCtx. ties T42|V32,V21,V3,§I.data
T70|x|DOT-AS-%-OF-HIT — damaging-ailment dps = `COEF × hitDamage / duration` (burn/bleed scale w/ weapon, replaces flat `3 dps`); per-status stacking rule {independent|strongest|count-capped}; modifier ailments capped (shock→+dmg-taken ≤0.5, brittle→+crit ≤0.06, sap/scorch). mark amp folds in. extends T39/T52|V33,V3
T71|x|DRAFT RESOURCES+ — Lock (carry an offered card to next draft, survives reroll) + tag-banish (drop all cards w/ a tag, ⊥ empty pool V11); each bounded per-run; permanent sources (Retainer Clause→lock, Blacklist Rights tier-2→tag-banish). ? tier-first rarity roll (`50/25/12/5/4/1` then in-tier synergy pick) once pools wide enough. extends T41|V11,§I.data
T72|x|GLORY+PRESTIGE ECONOMY MATH — `RunScore` (survival/kills/boss/difficulty) → `Glory=floor(GLORY_K·RunScore^GLORY_P)`, P<1; permanent cost geometric `COST_GROWTH^(n-1)` × bounded Labor-Costs inflation (surcharge shown in buy UI); Red Dust cap-lift nodes (extends V31). all curves → balance data. ties T45/T50/T67|V34,V13,§I.save
T73|.|STACKING DISCIPLINE — classify each catalog card `stackMode {additive|multiplicative}`; additive-within-stat (one bucket, dilutes → soft cap), multiplicative-across-stat (builds compound); audit existing 54 upgrades + test (V19). ties T40|V19,§I.data

# DEV TOOLING (§T74) — author test scenarios instantly; reaching corpse/capstone/meteor/evolution content by play takes 10+ min. Dev-only surface, routes thru real APIs, ⊥ pollutes records.

T74|x|DEV SANDBOX / CONTROL BOARD — low-profile dev menu (overlay `~` tab, all builds for now, restrict later) to BUILD scenarios on demand: grant any upgrade-card from DRAFT_POOL by id @level (applyUpgrade vs live mods/player/effects/upgradeLevels, ⊥ draft) +/- owned level; swap primary weapon by id + force-evolve (weaponSystem.setPrimary / availableEvolution); set any permanent node level + grant Martian Glory (world.setPermanents+applyPermanents, optional save write); set level / add-XP / set-heal / toggle invuln / luck / draftSize; force-spawn chosen variant (count/pos) / force boss now / clear arena; force boss-reward draft; ? scenario presets. Per-action RUN-ONLY|PERSIST toggle (persist writes save via SaveManager). Cheated-run flag → skip records/Glory/runHistory banking. EXTENDS+subsumes the partial T4 control list (T4 stays the metrics overlay). Deps: T4 overlay surface, T26 save/Glory, T35 Glory Tree, T43 boss-reward|V35,V16,§I.dev

# ACT-RUN EPIC (§T75-80) — finite single-playthrough is the default intended path; infinite = opt-in gimmick. Acts with distinct miniboss/final-boss rosters, surrender=death, scaled boss-blood catastrophe, distinct final-boss UI, mid-run unlock persistence, dev unlock bypass.

T75|x|ACT STRUCTURE (finite default) — run = ordered ACTS, each arc [wave-block→Miniboss I→waves→Miniboss II→waves→Final Boss]; `ActDefinition` data (per-act miniboss×2 + final-boss roster + hazard set + arena-shift phase); WaveDirector drives the phase sequence + boss gates; finite arc is the intended/default path, infinite is opt-in post-final-boss (T50). Deps: T20/T21 director, T44 escalation, T50 conclusion|V36,V23,§I.data
T76|x|SURRENDER = DEATH — pause-menu `Surrender` (confirm prompt) routes the normal death path (Glory + unlocks banked, stats screen); removes the redundant Quit (one exit). Deps: T22 death, T27 menu|V37
T77|x|BOSS BLOOD CATASTROPHE FX — boss kill → massively scaled blood-spray ground-splatter explosion (pooled decals + FX queue, V5/V2); on-hit blood spray scales with target size (boss-size hit → big spray); reduce-flash honored (§C). Deps: T16 FX, T37 art|V38,V5,V2
T78|x|BOSS-TIER UI — distinct final/end-boss announcement banner + healthbar treatment vs miniboss; per-act boss identity/naming (`tier` {miniboss|final}). Deps: T43 boss-reward, Hud|V39
T79|x|MID-RUN UNLOCK PERSISTENCE — bank boss-killed flags / first-kill unlocks / arena unlocks / trophies AT KILL TIME (⊥ run-end); surrender/quit/death after keeps progress. Deps: T24/T26 save, T45 banking, T48 first-kill|V40,V24,§I.save
T80|x|DEV UNLOCK BYPASS — extend control board (T74): force arena/act/boss unlocks, reset gates, toggle restrictions thru real save/sim APIs; cheated-run flag applies. Deps: T74 control board|V41,V35,§I.dev

## §B BUGS

id|date|cause|fix
B1|2026-06-16|pooled effects (muzzle/impact/death/sprint) never visible — `CanvasTexture` map ⊥ bind under WebGPU backend; also lazy `setColorAt` unreliable. fx count >0 but nothing drew|swap textured plane → solid additive `CircleGeometry`/`RingGeometry` + pre-created `instanceColor` (like projectile/enemy views). depthTest:false + renderOrder so floor inlays ⊥ occlude. ∴ ⊥ CanvasTexture for instanced FX under WebGPU
B2|2026-06-16|SPEC §I xpRequired curve drifted from running code (`balance/xp-curve.ts`): spec said `8+level*4+floor(level^1.55)`, code is `4+level*3+floor(level^1.7)`. V13 = curve lives in balance data ∴ code authoritative; spec text stale|realigned §I curve line to code; ∀ progression curve now §V34 (xp/glory/cost/prestige in balance data, ⊥ hardcoded). ? confirm 1.7 is intended shape vs 1.55|V13,V34
B3|2026-06-17|announcement banner overloaded ONE kind ('boss') for actual bosses + themed waves + weapon-evolutions; T78 then styled that kind by boss tier (defaulting 'final') → Act-1 themed wave showed "FINAL BOSS: MITE SWARM"|widened `AnnounceState.kind` to boss\|miniboss\|wave\|evolution\|enemy; each gets own text+style; boss tier from the EVENT ⊥ live slice. ∴ V44|V44
