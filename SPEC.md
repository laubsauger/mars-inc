# SPEC

Codename: MARS PIT. Browser fixed-arena survivors-like shooter. Direct movement, auto-fire weapon escalation, roguelite draft, permanent prestige.

## §G GOAL

Ship browser top-down circular-arena shooter: WASD move + sprint, auto-targeting weapons, XP draft upgrades, escalating wave director, boss, death→stats→permanent currency→meta unlock→restart. First milestone = playable vertical slice "The Rust Crown". Companion art-direction notes for T37 live in `docs/art-direction.md`; SPEC remains authoritative.

Bosses are the progression HINGE, not bonus currency: normal combat → levels within a run; a boss kill grants ONE major in-run power jump + advances the run to a higher power tier; permanently, bosses gate WHICH Glory upgrades the player may access. (Boss-progression epic: §V22-26, §T43-50.)

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

## §I INTERFACES

- url: load app from normal web URL → boot → main menu. No-WebGPU → unsupported screen.
- menu: items {Enter Pit, Warrior, Arsenal, Glory Tree, Challenges, Records, Settings, Credits}.
- input: WASD move; `Shift` sprint; mouse aim/menu (?); Space|mouse active ability (?); `Escape` pause.
- data: `WeaponDefinition` {id,displayName,family,tier,fireMode,targeting,projectile?,cooldown,burst?,spread,recoil,heat?,effects,evolutionRequirements?,visualProfile,audioProfile}.
- data: `UpgradeDefinition` {id,tags,prerequisites,exclusions,baseWeight,dynamicWeightRules,maxLevel,apply}.
- data: `DamagePacket` {sourceEntity,targetEntity,weaponId,baseDamage,damageType,critChance,critMultiplier,armorPenetration,knockback,stagger,tags}.
- data: `SpawnBudget` {threatPoints,maxConcurrentEnemies,eliteBudget,rangedBudget,hazardBudget}.
- data: `MovementStats` {moveSpeed,acceleration,deceleration,turnResponsiveness,collisionRadius,sprintMultiplier,sprintDuration,sprintCooldown,sprintCharges,knockbackResistance,recoilResistance}.
- save: `PlayerProfile` {schemaVersion,settings,accessibility,currencies,unlocks,permanentUpgrades,characterProgress[],weaponProgress[],records,achievements,runHistory[],prestigeState}. Export/import text+file. Corruption recovery. Timestamped backups.
- api: `SpatialHash` {insert,remove,update,queryCircle}.
- curve: `xpRequired(level) = 8 + level*4 + floor(level^1.55)` — loaded from balance data, ⊥ hardcoded in systems.
- dev overlay: FPS, frame/sim/render time, enemy/projectile/particle count, draw calls, hash occupancy, spawn budget, player DPS, incoming DPS, XP/min, upgrade history, seed. Controls: spawn enemy/boss, add XP, select/evolve, set speed, toggle invuln/AI, clear arena, benchmark, force tier, export log.
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
T40|.|UPGRADE CATALOG DEPTH — replace shallow T18 set. Wide catalog across ALL 6 rarities (common/uncommon/rare/legendary/corrupted/prototype) producing DISTINCT directions: ballistic-crit, rotary heat/recoil-mobility, explosive cluster/chain, drone swarm, energy beam-geometry, orbital strike, infection/spore, shield/overkill, glass-cannon, bruiser/tank, summoner, economy/greed. Curses (corrupted: big upside + real downside), capstones (legendary), experimental (prototype). Anti-synergy/exclusivity webs. Diverging scaling (additive vs mult vs threshold-unlock). ≥80 upgrades.|V11,§I.data
T41|x|DRAFT DEPTH — rarity-weighted roll (`rarityWeight` by level+player.luck, rarer tiers lift late); reroll (keeps locked) / banish (per-run, never reoffered) / skip→heal, each a bounded per-run resource; UpgradeScreen rarity-colored cards + lock/banish/reroll/skip + keyboard. omen/evolution-offers → later. |V11,§13.5
T42|.|WEAPON-FAMILY MECHANICS DEPTH — give the 6 families distinct identity systems (rotary spin-up+heat+recoil-mobility; explosive min-safe-distance+chain; drone formation/interception; energy overheat/refraction; orbital telegraph-strike) so weapons PLAY differently, not stat reskins. Ties T33/T34.|§I.data,V18
T43|x|BOSS REWARD — boss kill now opens a 3-choice major reward (sim-freeze overlay) + applies it, then the run CONTINUES (no auto-win; that's T50). Rewards: Field Evolution / Munitions Bay + Overclocked Servos (system) / Volatile Crits + Adrenal Surge (mutation) / Phobos Reactor Heart (artifact, power+drawback). `sim/boss-rewards.ts` + BossRewardScreen + store slice + main bridge. End-screen redesigned (T23): rich one-page run summary (spoils: glory earned/bosses felled/level; survival/offense; loadout; build = upgrades taken; kills-by-type) — Glory buying moved to the menu Glory Tree.|V22,§I.data
T44|.|RUN-PHASE ESCALATION — per-boss-kill tier bump: stronger roster, new environmental hazard, ↑elite-freq, arena lighting/geometry shift, ↑resource drops, ↑upgrade-rarity unlocked. Director + arena read current tier. Deps: T20/T21 director, T33|V23,V8
T45|.|BOSS TROPHIES + BANKING — PlayerProfile tracked trophy counts per boss; banking/extraction economy: secured Glory (immediate) vs run-pot Glory (extraction multiplier, death partial-loss); trophies+first-kill bank immediately. Deps: T24/T26 save+Glory|V24,§I.save
T46|.|BOSS MASTERY TRACKS — per-boss feat track (defeat / fast / no-damage / specific-weapon-family / enraged / arena-modifier); progress in PlayerProfile; ⊥ health-scaling padding. Deps: T45|V26,§I.save
T47|.|BOSS-GATED GLORY-TREE BRANCHES — boss victory reveals themed Glory-tree section; nodes require (mastery threshold + Glory cost + ? achievement). e.g. Gatekeeper Arsenal: rotary unlock, recoil→proj-dmg, Gatekeeper Cannon evo. Deps: T35 Glory Tree, T45/T46|V25,§I.menu,§I.save
T48|.|FIRST-KILL UNLOCKS — first boss victory unlocks BREADTH (weapon family / character / arena / upgrade category / challenge mode / new tree branch), banked immediately. Deps: T45|V24,§I.save
T49|.|DIFFICULTY-MILESTONE REWARDS — table: 1st-kill→major content, D2→artifact, D4→weapon-evo, D6→char-mutation, no-damage-kill→special upgrade, timed-kill→challenge modifier, max-diff→prestige node/cosmetic. Deps: T44/T46|V22,§I.save
T50|.|FINAL-BOSS CONCLUSION — run-end choice {Extract (bank all) / Overrun endless (↑currency-mult, ↑enemies, ↓heal, unbanked-at-risk) / Sacrifice build→research blueprint (remember-upgrade / boost-synergy-rate / echo-warrior / prestige-by-dominant-tags)}. Deps: T45 banking, prestige|V24,§G

## §B BUGS

id|date|cause|fix
B1|2026-06-16|pooled effects (muzzle/impact/death/sprint) never visible — `CanvasTexture` map ⊥ bind under WebGPU backend; also lazy `setColorAt` unreliable. fx count >0 but nothing drew|swap textured plane → solid additive `CircleGeometry`/`RingGeometry` + pre-created `instanceColor` (like projectile/enemy views). depthTest:false + renderOrder so floor inlays ⊥ occlude. ∴ ⊥ CanvasTexture for instanced FX under WebGPU
