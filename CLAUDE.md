# MARS PIT

Browser-native, fixed-arena survivors-like shooter. Top-down circular Martian colosseum. Direct WASD movement, auto-targeting weapons, roguelite upgrade drafting, permanent prestige progression. Comic-book sci-fi art direction.

**`SPEC.md` is the source of truth.** Goal, constraints, interfaces, invariants (§V), and the task table (§T) live there in cavekit format. Read it before working. Update §T status via `/build`; change spec only via `/spec`.

## Stack

- **Vite + TypeScript (strict)** — build, dev server, typecheck (`tsc --noEmit`).
- **Three.js `WebGPURenderer`** (`three/webgpu`) — WebGPU-only, no WebGL2 fallback. No-WebGPU device shows an unsupported screen.
- **React 19 + Tailwind v4** — menus/screens/HUD only. Never for combat entities. Tailwind utility classes only, no `.css` files beyond `src/ui/index.css` (the `@import 'tailwindcss'` + theme tokens). Install shadcn/ui via its CLI, never hand-rolled.
- **Zustand** — app/UI state. Widgets subscribe to narrow primitive slices so a HUD tick never re-renders siblings or the canvas.
- **Vitest** — unit tests for sim/math. **Playwright** — e2e against real Chrome with WebGPU flags.

## Architecture

Hard split: **simulation owns authoritative state, rendering is a pure view.**

```
src/
  core/     loop (fixed timestep), input, rng (seeded)
  sim/      world, player, movement, constants — authoritative, no Three imports
  render/   renderer, camera, arena, player-view, quality — reads sim, never mutates
  ui/       store (zustand), ui-root, screens/, Hud — React + Tailwind
  dev/      overlay (dev metrics)
content/    data-driven defs (weapons/enemies/upgrades/...) — added as tasks land
e2e/        playwright specs
```

Rules that are easy to violate:

- **Sim never imports Three; render never writes sim.** A rendered thing is a _view_ of a sim entity (§V2).
- **Fixed timestep `1/60`.** `core/loop.ts` accumulates real time and steps the sim a whole number of times; render interpolates by `alpha` between `prevPos` and `pos`. Never tie sim to frame rate (§V1).
- **Gameplay is 2D on `x,z`.** `y` is visual height only, never affects sim (§V4).
- **Pure math, then wire it.** Movement/sprint/recoil/damage math live as pure functions (e.g. `sim/movement.ts`) so they unit-test without a DOM. Each core math system gets tests (§V19).
- **Pool repeated entities; no per-frame allocation in hot sim systems** (§V5/V6). Enemies are a struct-of-arrays pool (`sim/enemies.ts`) with swap-remove; the spatial hash reuses caller arrays. Crowds render through one `InstancedMesh` (`render/enemy-view.ts`) — one material, per-instance color.
- **Determinism.** All sim randomness flows through one `Rng` (seeded mulberry32). Same seed → same run (§V16). Never `Math.random()` in sim.

## Conventions

- **Strict TS**, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Optional fields that may hold `undefined` must type it explicitly (`x?: number | undefined`).
- ESLint flat config; core `no-undef` is off (TS resolves identifiers). Prettier: single quotes, trailing commas, width 100.
- Concrete structs over premature abstraction. The player is a plain struct today; it folds into an ECS at T9 when enemies provide the second use case. Don't build ECS/registries before two real consumers exist.
- **No convenience fallbacks for core systems.** Fix the real path or add a failing test — brittle fallbacks confuse later work.
- Temporary dev hooks (e.g. `window.__MARS__`) are marked as such and exist for debugging/e2e of invisible state.
- **Art direction:** `docs/art-direction.md` ("Martian Pulp Brutalism") is the style/asset/effect plan for T37. Render-side colors come from `render/art/palette.ts` (the single source); Tailwind mirrors the base/accent hues in `src/ui/index.css @theme`. Don't reintroduce ad-hoc hex in views. Keep the arena low-contrast so saturated combat accents (gold/cyan/red) win readability — don't let the screen go all-orange.

## Commands

```bash
pnpm dev        # vite dev server (http://localhost:5173)
pnpm build      # tsc --noEmit && vite build
pnpm test       # vitest unit
pnpm lint       # eslint + prettier --check
pnpm e2e        # playwright (real Chrome + WebGPU)
pnpm format     # prettier --write
```

A task is done only when `pnpm test && pnpm build && pnpm lint` pass and (for visible behavior) the relevant e2e is green. Every milestone must leave the app browser-playable.

## Testing with WebGPU

Headless Chromium has no GPU, so `playwright.config.ts` uses `channel: 'chrome'` with `--enable-unsafe-webgpu`. e2e specs branch on `'gpu' in navigator`: real-GPU asserts the arena renders; absent asserts the unsupported screen. For a visual check, launch `pnpm dev` and screenshot via a Chrome instance with the same flags.

## Status

In: fixed loop, WebGPU renderer, framed camera (whole arena visible, §V7), Rust Crown arena, player (accel movement / sprint / boundary slide / i-frames), enemy crowd (SoA pool, spatial hash, seek+separation steering, gate spawn + telegraph, instanced render, contact damage), weapons (mouse-aim with ground cursor + nearest/lowest-hp modes, pooled projectiles, capped recoil), centralized damage pipeline, **the full roguelite loop** (pooled XP shards → magnet/pickup → level curve → 3-choice upgrade draft that freezes the sim → run-mod layer → 8 upgrades), dev overlay, Zustand HUD. No boss, run-end/stats, save, or menu yet — see §T in `SPEC.md`.

Status effects (T39): per-enemy status lives in the `EnemyPool` SoA (burn/chill/mark; swap-removed in `kill()`). `sim/combat/status.ts` `applyStatus`/`tickStatus` — burn deals DoT through the V3 pipeline, mark amplifies it, chill multiplies enemy movement (applied in enemy-system). Ticked once per step in world (status step, §5.4), deterministic (V21). Statuses apply **on-hit** via the weapon-system `onHit(enemy, crit)` callback (fires at hit time, before compaction, so the index is valid) → world's `hit`/`crit` triggers, whose handlers call `ctx.applyStatus`. Enemy-view tints burn/chill for readability. `onHit` is only wired when the build has a hit/crit handler (zero cost otherwise).

Build engine (T38): builds have a **static** layer (`RunMods` scalars: damage/fireRate/multishot/pierce/chain…) and a **dynamic** layer (`sim/progression/effects.ts` `BuildEffects`). `BuildEffects` holds CONDITIONAL modifiers (evaluated each step in `world.evalConditionals` against live context → transient damage/crit folded into weapon fire) and TRIGGER handlers fired on combat events (`world.fireKillTriggers` does kill/overkill; other events have surfaces ready). Triggers deal damage via `combat/aoe.ts applyAreaDamage` — pipeline-routed (V3), pooled, deterministic (V21). Upgrades register via `UpgradeContext.effects`; showcase set in `content/upgrades/advanced.ts` (kept separate from the base catalog so engine and content evolve independently). The current upgrade catalog is still a thin slice — real depth/rarities/status are T39–T42.

Progression: upgrades are data (`content/upgrades/`) whose `apply` mutates a per-run mod layer (`sim/progression/mods.ts`), player stats, or the build engine (`effects`) — never the immutable content defs. The weapon system reads mods on top of the weapon def. `world.choose(i)` applies a draft pick; the React `UpgradeScreen` reaches it via the store's `chooseUpgrade` bridge set in boot. Drafts are seed-deterministic and weighted by base + tag-synergy + **rarity** (`rarityWeight` scales rarer tiers up with run level + `player.luck`, T41). The draft has per-run resources: **reroll** (`world.reroll(lockedIds)` keeps locked cards), **banish** (`world.banish(i)` removes an upgrade from the run's pool — `available()` filters `banished`), and **skip** (`world.skipDraft()` heals instead). `rollDraft(registry, levels, rng, params)` takes a single `DraftParams` (count/level/luck/banished) — no positional/legacy overloads. (Player stats are cloned per-run in `createPlayer`/`resetPlayer` so stat upgrades never leak into the shared `MARA_STATS` constant.)

FX/audio: the sim pushes ephemeral visual/audio cues to `world.fx` (`sim/fx.ts`); the render layer drains it once per frame into pooled instanced effects (`render/effects.ts` — muzzle/impact/death/sprint) and the capped-voice synth `AudioBus` (`audio/audio.ts`, master + sfx buses). FX carry no authority and never feed back into sim (V2). **WebGPU gotcha (§B1):** instanced FX use **solid additive geometry** (`CircleGeometry`/`RingGeometry`) + a **pre-created `instanceColor`** — `CanvasTexture` maps don't bind and lazy `setColorAt` is unreliable under the WebGPU backend, so textured-plane effects render invisibly. Match the projectile/enemy view pattern for any new instanced glow. Camera shake (`render/camera-shake.ts`) is FX-driven, setting-scaled, and offsets from the framed base position (stays within V7).

Settings/accessibility (T36): `profile.settings` + `profile.accessibility` persist via `SaveManager.updateSettings`/`updateAccessibility`. The store `settings` slice mirrors them; `applySetting(patch)` (bridge in boot) persists + re-applies live through `applyAllSettings()` (audio volumes, `effects.reduceFlash`, `shake.intensity`, root font-size for UI scale, focus-pause flag). Settings panel lives in `MainMenu.tsx`. Rebind/controller/colorblind/hold-to-sprint behavior are still TODO.

Spawning: a 3s countdown holds the run clock at 0 (player can move). The `WaveDirector` (`sim/director/wave-director.ts`) accrues a threat-point bank per `budgetAt(elapsed)` and spends it on gate spawns with telegraphs; the concurrent cap is a hard ceiling (V8) and the bank is clamped. `computeAdaptation(mods)` nudges pace + enemy mix to the build — bounded/clamped, never per-enemy stat scaling (V12).

App flow (T27): boot → **main menu** (`ui/screens/MainMenu.tsx`) rendered over the live empty arena; `world.started` stays false and the **main loop only calls `world.step()` while started** (the gate is at the driver, not inside `World.step` — keeps `step()` headless-runnable for sim tests). "Enter the Pit" calls `world.start()`; game-over offers Restart (new run) / Menu (`toMenu`). Records + Settings(volume) are live from the profile; Arsenal/Glory Tree/Challenges are coherent placeholders. **Dev shortcut:** append `?play` to the URL in a dev build to skip the menu and drop straight into a run (fast hot-reload iteration).

Meta loop (T26/T35): on death `gloryFor(result)` awards Martian Glory into the profile (+ records/runHistory). Permanent upgrades (`content/permanent/`, branches arsenal/biology/mobility) are browsed/bought in the **Glory Tree** menu (`MainMenu.tsx` GloryTree) or the game-over Glory panel — both via the `buyPermanent` store bridge. `applyPermanents` stacks owned levels onto the fresh-run player at run start (`World(seed, permanents)` / `world.setPermanents` before `reset`); they mutate the run player only — never content defs or `MARA_STATS`. Draft-resource permanents (House Odds/Blacklist Rights) set `player.bonusRerolls`/`bonusBanishes`, which `world.reset` folds into the run's reroll/banish counts after `applyPermanents`.

Save (`src/save/`): `profile.ts` is the versioned `PlayerProfile` schema + `normalizeProfile` (runs migrations then fills missing fields, never throws on partial) + `runMigrations` (chained, loop-guarded) + serialize/deserialize for export/import. `storage.ts` wraps IndexedDB (primary) + localStorage boot pointer + rolling timestamped backups + corrupt-data quarantine; all I/O best-effort (failures → null/false, no crash). `SaveManager` loads-or-defaults (quarantining corrupt data), debounce-flushes with a backup, and does non-destructive export/import. A future schema bump = one entry in `MIGRATIONS`.

Combat note: aim is mouse-directed by default (`targeting: 'aim'`) with a ground-projected reticle (`render/cursor-view.ts`); the render layer owns the camera so it resolves the screen→ground aim point (`screenToGround`) and writes it into the input snapshot before the sim reads it. Player/projectile facing uses `atan2(-dx,-dz)` to match the view's -z nose.

## Hard rules

- Never commit, checkout, or reset git unless explicitly asked.
- Keep the production path playable; don't leave game-loop transitions as placeholders.
- Missing art → coherent placeholder, never broken content.
