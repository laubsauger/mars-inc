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

Progression: upgrades are data (`content/upgrades/`) whose `apply` mutates a per-run mod layer (`sim/progression/mods.ts`) or player stats — never the immutable content defs. The weapon system reads mods on top of the weapon def. `world.choose(i)` applies a draft pick; the React `UpgradeScreen` reaches it via the store's `chooseUpgrade` bridge set in boot. Drafts are seed-deterministic and synergy-weighted.

Combat note: aim is mouse-directed by default (`targeting: 'aim'`) with a ground-projected reticle (`render/cursor-view.ts`); the render layer owns the camera so it resolves the screen→ground aim point (`screenToGround`) and writes it into the input snapshot before the sim reads it. Player/projectile facing uses `atan2(-dx,-dz)` to match the view's -z nose.

## Hard rules

- Never commit, checkout, or reset git unless explicitly asked.
- Keep the production path playable; don't leave game-loop transitions as placeholders.
- Missing art → coherent placeholder, never broken content.
