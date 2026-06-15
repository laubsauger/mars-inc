// Boot. WebGPU detect → unsupported screen (§C, §I.url). Wires input + sim + render.

import { Scene } from 'three';
import { isWebGpuSupported, createRenderer } from './render/renderer';
import { createCamera, frameArena, screenToGround } from './render/camera';
import { buildArena } from './render/arena';
import { PlayerView } from './render/player-view';
import { EnemyView } from './render/enemy-view';
import { ProjectileView } from './render/projectile-view';
import { ShardView } from './render/shard-view';
import { CursorView } from './render/cursor-view';
import { ARENA_RADIUS } from './sim/constants';
import { detectTier, readDeviceHints, TIER_BUDGETS } from './render/quality';
import { createLoop } from './core/loop';
import { Input } from './core/input';
import { World } from './sim/world';
import { DevOverlay, type OverlayMetrics } from './dev/overlay';
import { mountUi } from './ui/ui-root';
import { uiActions } from './ui/store';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

async function boot(parent: HTMLElement): Promise<void> {
  mountUi(parent);

  if (!isWebGpuSupported()) {
    uiActions.setScreen('unsupported');
    return;
  }

  const seed = 0x4d415253; // "MARS" — fixed for now (daily/seeded runs later, T28)
  const tier = detectTier(readDeviceHints());
  const budget = TIER_BUDGETS[tier];

  const canvas = document.createElement('canvas');
  parent.appendChild(canvas);

  let renderer;
  try {
    renderer = await createRenderer(canvas, budget);
  } catch (err) {
    console.error('WebGPU init failed', err);
    canvas.remove();
    uiActions.setScreen('unsupported');
    return;
  }

  const scene = new Scene();
  const camera = createCamera(window.innerWidth / window.innerHeight);
  buildArena(scene);

  const world = new World(seed);
  const playerView = new PlayerView(scene, world.player);
  const enemyView = new EnemyView(scene);
  const projectileView = new ProjectileView(scene);
  const shardView = new ShardView(scene);
  const cursorView = new CursorView(scene);
  const input = new Input();
  input.attach();
  const overlay = new DevOverlay(parent);
  uiActions.setScreen('arena');

  // Bridge upgrade picks from the React draft screen into the sim.
  uiActions.setChooseUpgrade((i) => world.choose(i));
  let draftShownFor = -1; // de-dupe store pushes while a draft is open

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    frameArena(camera, window.innerWidth / window.innerHeight);
  });

  let lastT = performance.now();
  let fps = 0;
  let simMs = 0;
  let renderMs = 0;

  const loop = createLoop({
    step(dt) {
      const snap = input.sample();
      // Render layer owns the camera → resolve the ground aim point here.
      if (snap.mouseInside) {
        const g = screenToGround(
          camera,
          snap.mouseX,
          snap.mouseY,
          window.innerWidth,
          window.innerHeight,
        );
        if (g && Math.hypot(g.x, g.z) <= ARENA_RADIUS + 4) {
          snap.aimX = g.x;
          snap.aimZ = g.z;
          snap.hasAim = true;
        }
      }
      world.input = snap;
      const t0 = performance.now();
      world.step(dt);
      simMs = performance.now() - t0;
    },
    render(alpha) {
      const now = performance.now();
      const frameMs = now - lastT;
      lastT = now;
      fps = fps * 0.9 + (1000 / Math.max(frameMs, 0.001)) * 0.1;

      playerView.sync(world.player, alpha);
      enemyView.sync(world.enemies, alpha);
      projectileView.sync(world.weaponSystem.projectiles, alpha);
      shardView.sync(world.shards, alpha);
      cursorView.sync(world.player);

      const r0 = performance.now();
      void renderer.renderAsync(scene, camera);
      renderMs = performance.now() - r0;

      // Push HUD slice to the store (selectors re-render only changed widgets).
      const sp = world.player.sprint;
      uiActions.setHud({
        health: world.player.health,
        maxHealth: world.player.maxHealth,
        sprintCharges: sp.charges,
        sprintCooldown01:
          sp.charges >= sp.maxCharges
            ? 1
            : 1 - Math.max(0, sp.cooldown) / world.player.stats.sprintCooldown,
        paused: world.paused,
        elapsed: world.elapsed,
        level: world.player.level,
        xp01: world.player.xp / world.player.xpToNext,
      });

      // Draft slice: push once per opened draft (draftId distinguishes back-to-
      // back level-ups at the same level); clear when it closes.
      if (world.leveling && draftShownFor !== world.draftId) {
        draftShownFor = world.draftId;
        uiActions.setDraft({
          open: true,
          level: world.player.level,
          options: world.draft.map((d) => ({
            id: d.id,
            name: d.name,
            description: d.description,
            rarity: d.rarity,
            tags: d.tags,
          })),
        });
      } else if (!world.leveling && draftShownFor !== -1) {
        draftShownFor = -1;
        uiActions.setDraft({ open: false, level: world.player.level, options: [] });
      }

      const metrics: OverlayMetrics = {
        fps,
        frameMs,
        simMs,
        renderMs,
        enemies: world.enemies.count,
        projectiles: world.weaponSystem.projectiles.count,
        drawCalls: renderer.info.render.drawCalls,
        tier,
        seed,
      };
      overlay.update(metrics);
    },
  });
  loop.start();

  document.addEventListener('visibilitychange', () => {
    loop.setTimeScale(document.hidden ? 0 : 1);
  });

  // Dev hook for e2e / debugging invisible sim state (execution rule 11). Temp.
  (window as unknown as { __MARS__: unknown }).__MARS__ = { world };
}

void boot(app);
