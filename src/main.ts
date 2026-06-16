// Boot. WebGPU detect → unsupported screen (§C, §I.url). Wires input + sim + render.

import { Scene, FogExp2 } from 'three';
import { isWebGpuSupported, createRenderer } from './render/renderer';
import { createPostProcessing } from './render/post';
import { createCamera, screenToGround, frameArena } from './render/camera';
import { createControls } from './render/controls';
import { ArenaView } from './render/arena';
import { PlayerView } from './render/player-view';
import { EnemyView } from './render/enemy-view';
import { StatusMarkerView } from './render/status-marker-view';
import { GroundShadowView } from './render/ground-shadow-view';
import { EnemyHealthbarView } from './render/enemy-healthbar-view';
import { ProjectileView } from './render/projectile-view';
import { EnemyProjectileView } from './render/enemy-projectile-view';
import { HazardView } from './render/hazard-view';
import { ThrowMarkerView } from './render/throw-marker-view';
import { WeaponDropView } from './render/weapon-drop-view';
import { HealthDropView } from './render/health-drop-view';
import { BountyView } from './render/bounty-view';
import { ShardView } from './render/shard-view';
import { CursorView } from './render/cursor-view';
import { DroneView } from './render/drone-view';
import { CorpseView } from './render/corpse-view';
import { AimLineView } from './render/aim-line-view';
import { Effects } from './render/effects';
import { FloorReflectionView } from './render/floor-reflection-view';
import { FloatingText } from './render/floating-text';
import { ChainView } from './render/chain-view';
import { BloodView } from './render/blood-view';
import { CameraShake } from './render/camera-shake';
import { AudioBus } from './audio/audio';
import { budgetAt, TIMELINE_STRETCH } from './sim/director/wave-director';
import { gloryFor } from './sim/run';
import { PERMANENT_UPGRADES, permanentById } from './content/permanent/index';
import { SaveManager } from './save/save-manager';
import type { PermanentView, InspectView } from './ui/store';
import { arenaContains, setActiveArena, ARENAS } from './sim/arena';
import { emptyRecord, arenaCharacterKey, type RecordData } from './save/profile';
import { detectTier, readDeviceHints, TIER_BUDGETS } from './render/quality';
import { createLoop } from './core/loop';
import { Input } from './core/input';
import { World } from './sim/world';
import { EnemyState, ENEMY_DISPLAY_NAME, ENEMY_BY_VARIANT, BOSS_GATEKEEPER } from './sim/enemies';
import { DevOverlay, type OverlayMetrics } from './dev/overlay';
import { mountUi } from './ui/ui-root';
import { uiActions } from './ui/store';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

// The only warrior in the slice (T27). Records bucket by character id so adding
// fighters later just adds keys — no schema change.
const ACTIVE_CHARACTER = { id: 'lilu-tubs', name: 'Lilu Tubs' } as const;

/** Mini character sheet for the enemy nearest the ground cursor (hover inspect).
 *  Render-only (V2): reads sim state, never mutates it. null when nothing hovered. */
function computeInspect(world: World): InspectView | null {
  const aim = world.player.aim;
  if (!aim.has) return null;
  const en = world.enemies;
  let best = -1;
  let bestD2 = Infinity;
  for (let i = 0; i < en.count; i++) {
    if (en.state[i] !== EnemyState.Active) continue;
    const dx = en.posX[i]! - aim.x;
    const dz = en.posZ[i]! - aim.z;
    const reach = en.radius[i]! + 1.0;
    const d2 = dx * dx + dz * dz;
    if (d2 <= reach * reach && d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  if (best < 0) return null;
  const v = en.variant[best]!;
  const def = ENEMY_BY_VARIANT[v];
  const statuses: string[] = [];
  if (en.burnTime[best]! > 0) statuses.push('Burn');
  if (en.chillTime[best]! > 0) statuses.push('Chill');
  if (en.shockTime[best]! > 0) statuses.push('Shock');
  if (en.corrodeTime[best]! > 0) statuses.push('Corrode');
  if (en.bleedTime[best]! > 0) statuses.push('Bleed');
  if (en.markTime[best]! > 0) statuses.push('Marked');
  const atk = def?.attack;
  return {
    name: ENEMY_DISPLAY_NAME[v] ?? 'Hostile',
    variant: v,
    hp: Math.max(0, Math.ceil(en.health[best]!)),
    maxHp: Math.ceil(en.maxHp[best]! || def?.maxHealth || 1),
    contactDamage: Math.round(en.contactDmg[best]!),
    speed: Math.round((def?.speed ?? en.speed[best]!) * 10) / 10,
    isBoss: v === BOSS_GATEKEEPER.variant,
    splitter: !!def?.splitInto,
    ranged: atk ? { kind: atk.kind, damage: atk.damage, range: atk.range } : null,
    statuses,
  };
}

/** Fade out + remove the inline boot splash (index.html) once the app is live. */
function hideBootSplash(): void {
  const s = document.getElementById('boot-splash');
  if (!s) return;
  s.classList.add('hidden');
  setTimeout(() => s.remove(), 500);
}

async function boot(parent: HTMLElement): Promise<void> {
  mountUi(parent);

  if (!isWebGpuSupported()) {
    uiActions.setScreen('unsupported');
    hideBootSplash();
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
    hideBootSplash();
    return;
  }

  // Load the saved profile (or a fresh default) before building the run so
  // persisted settings + owned permanent upgrades apply from the first frame.
  const save = new SaveManager();
  await save.load();
  // Select the arena BEFORE building camera/arena/world — they read the active
  // arena's shape for framing, boundary, and spawns.
  setActiveArena(save.current.settings.arenaId);

  const scene = new Scene();
  // Warm haze for rim depth only — kept FAINT so it doesn't grey out the whole
  // arena (and dim the emissives before bloom sees them) at the default far
  // camera distance. Just a touch of atmosphere toward the spectator dark.
  scene.fog = new FogExp2(0x140c08, 0.0038);
  const camera = createCamera(window.innerWidth / window.innerHeight);
  let arena = new ArenaView(scene);

  const world = new World(seed, save.current.permanentUpgrades);
  const playerView = new PlayerView(scene, world.player);
  const enemyView = new EnemyView(scene);
  const statusMarkers = new StatusMarkerView(scene);
  const groundShadowView = new GroundShadowView(scene);
  const enemyHealthbars = new EnemyHealthbarView(scene);
  const projectileView = new ProjectileView(scene);
  const enemyProjectileView = new EnemyProjectileView(scene);
  const hazardView = new HazardView(scene);
  const throwMarkerView = new ThrowMarkerView(scene);
  const weaponDropView = new WeaponDropView(scene);
  const healthDropView = new HealthDropView(scene);
  const bountyView = new BountyView(scene);
  const shardView = new ShardView(scene);
  const cursorView = new CursorView(scene);
  const droneView = new DroneView(scene);
  const corpseView = new CorpseView(scene);
  const aimLine = new AimLineView(scene, window.innerWidth, window.innerHeight);
  const aimDirs = new Float32Array(64); // reused per frame (multishot fan)
  const effects = new Effects(scene);
  const floorReflect = new FloorReflectionView(scene);
  const floating = new FloatingText();
  const chainView = new ChainView(scene);
  const bloodView = new BloodView(scene);
  bloodView.setPlayer(playerView.group, world.player); // accumulating body gore (T39)
  const shake = new CameraShake();
  // Optional orbit/zoom (right-drag + wheel) with a reset; shake rides on top.
  const arenaControls = createControls(camera, canvas, window.innerWidth / window.innerHeight);
  const post = createPostProcessing(
    renderer,
    scene,
    camera,
    save.current.settings.ambientOcclusion,
  ); // bloom (+ optional GTAO)
  let lastShakeX = 0;
  let lastShakeZ = 0;
  const audio = new AudioBus();

  const input = new Input();
  input.attach();

  // AudioContext needs a user gesture to start (autoplay policy).
  const resumeAudio = (): void => audio.resume();
  window.addEventListener('keydown', resumeAudio, { once: true });
  window.addEventListener('pointerdown', resumeAudio, { once: true });
  const overlay = new DevOverlay(parent);

  // Push records/settings to the menu from the saved profile.
  const pushProfile = (): void => {
    const r = save.current.records;
    // One row per (arena × character) combo — both are tracked together.
    const byCombo = Object.values(ARENAS).flatMap((a) =>
      [ACTIVE_CHARACTER].map((c) => {
        const rec =
          save.current.recordsByArenaCharacter[arenaCharacterKey(a.id, c.id)] ?? emptyRecord();
        return {
          id: `${a.id}|${c.id}`,
          arena: a.name,
          character: c.name,
          bestTimeSec: rec.bestTimeSec,
          bestLevel: rec.bestLevel,
          mostKills: rec.mostKills,
        };
      }),
    );
    uiActions.setProfile({
      bestTimeSec: r.bestTimeSec,
      bestLevel: r.bestLevel,
      mostKills: r.mostKills,
      runCount: save.current.runHistory.length,
      byCombo,
    });
    uiActions.setSettings({
      masterVolume: save.current.settings.masterVolume,
      sfxVolume: save.current.settings.sfxVolume,
      screenShake: save.current.settings.screenShake,
      reduceFlash: save.current.settings.reduceFlash,
      uiScale: save.current.settings.uiScale,
      holdToSprint: save.current.accessibility.holdToSprint,
      pauseOnFocusLoss: save.current.settings.pauseOnFocusLoss,
      enemyHealthbars: save.current.settings.enemyHealthbars,
      toonShading: save.current.settings.toonShading,
      arenaId: save.current.settings.arenaId,
      showCountdown: save.current.settings.showCountdown,
      ambientOcclusion: save.current.settings.ambientOcclusion,
      colorblind: save.current.accessibility.colorblindPalette,
    });
  };
  pushProfile();

  // Boot lands on the main menu over the rendered empty arena (§13.4).
  // Dev shortcut: `?play` (in dev builds) skips the menu and drops straight into
  // a run — fast iteration with hot reload, no clicking through the menu.
  const autostart = import.meta.env.DEV && new URLSearchParams(location.search).has('play');
  if (autostart) {
    world.start();
    uiActions.setScreen('arena');
  } else {
    uiActions.setScreen('menu');
    uiActions.setMenuView('root');
  }

  // Reset the orbit/zoom camera back to the framed default (HUD button).
  uiActions.setResetView(() => arenaControls.reset());
  // Pause-menu Resume button toggles the sim pause directly (V-safe: paused is a
  // render-agnostic flag the loop already honours).
  uiActions.setTogglePause(() => {
    world.paused = !world.paused;
  });

  // Bridge upgrade picks + draft actions from the React draft screen into the sim.
  uiActions.setChooseUpgrade((i) => world.choose(i));
  uiActions.setRerollDraft((ids) => world.reroll(ids));
  uiActions.setBanishOption((i) => world.banish(i));
  uiActions.setSkipDraft(() => world.skipDraft());
  uiActions.setChooseBossReward((i) => world.chooseBossReward(i));
  let draftShownFor = -1; // de-dupe store pushes while a draft is open
  let rewardShownFor = -1; // de-dupe boss-reward overlay pushes
  let endShown = false; // de-dupe the game-over transition
  let wasPaused = false; // edge-detect pause to refresh the character sheet
  // Intro telegraphs (T33): announce the boss + each new enemy class once per run.
  let bossAnnounced = false;
  let lastAnnTick = 0;
  let annId = 0;
  let lastEvolved: string | null = null;
  const seenVariants = new Set<number>();
  let lastGlory = 0; // glory earned on the most recent run (for the panel)

  // Build the meta slice (Glory + permanent upgrades) from the saved profile.
  const pushMeta = (): void => {
    const glory = save.current.currencies.martianGlory;
    const owned = save.current.permanentUpgrades;
    const permanents: PermanentView[] = PERMANENT_UPGRADES.map((u) => {
      const lvl = owned[u.id] ?? 0;
      return {
        id: u.id,
        name: u.name,
        description: u.description,
        branch: u.branch,
        rarity: u.rarity,
        cost: u.cost,
        owned: lvl,
        maxLevel: u.maxLevel,
        affordable: lvl < u.maxLevel && glory >= u.cost,
      };
    });
    uiActions.setMeta({ glory, lastEarned: lastGlory, permanents });
  };
  pushMeta();

  // Bridge: buy a permanent upgrade with Martian Glory (T26). Next run applies it.
  uiActions.setBuyPermanent((id) => {
    const def = permanentById(id);
    if (!def) return;
    const lvl = save.current.permanentUpgrades[id] ?? 0;
    if (lvl >= def.maxLevel || save.current.currencies.martianGlory < def.cost) return;
    save.mutate((p) => {
      p.currencies.martianGlory -= def.cost;
      p.permanentUpgrades[id] = lvl + 1;
    });
    world.setPermanents(save.current.permanentUpgrades);
    pushMeta();
  });

  // Enter the pit from the menu → start a fresh run (applies owned permanents).
  uiActions.setEnterPit(() => {
    world.setPermanents(save.current.permanentUpgrades);
    world.start();
    endShown = false;
    uiActions.setResult(null);
    uiActions.setScreen('arena');
  });

  // Return to the menu from game-over → idle the sim, refresh records.
  uiActions.setToMenu(() => {
    world.reset();
    endShown = false;
    uiActions.setResult(null);
    pushProfile();
    uiActions.setMenuView('root');
    uiActions.setScreen('menu');
  });

  // Bridge restart from the game-over screen → start a fresh run in place (V15).
  uiActions.setRestartRun(() => {
    world.setPermanents(save.current.permanentUpgrades); // apply any purchases
    world.start();
    endShown = false;
    uiActions.setResult(null);
    uiActions.setScreen('arena');
  });

  // Apply the current saved settings to the live systems (audio / FX / shake /
  // UI scale). Called on boot and after every settings change (T36).
  let pauseOnFocusLoss = save.current.settings.pauseOnFocusLoss;
  const applyAllSettings = (): void => {
    const s = save.current.settings;
    audio.masterVolume = s.masterVolume;
    audio.sfxVolume = s.sfxVolume;
    audio.applyVolumes();
    effects.reduceFlash = s.reduceFlash;
    bloodView.reduceFlash = s.reduceFlash;
    shake.intensity = s.screenShake;
    enemyHealthbars.enabled = s.enemyHealthbars;
    enemyView.setToon(s.toonShading);
    playerView.setToon(s.toonShading);
    post.setAO(s.ambientOcclusion);
    world.countdownEnabled = s.showCountdown; // applied at the next run's reset()
    pauseOnFocusLoss = s.pauseOnFocusLoss;
    // UI scale via root font-size (Tailwind rem-based UI scales with it).
    document.documentElement.style.fontSize = `${16 * s.uiScale}px`;
  };
  applyAllSettings();

  // Live settings control from the settings panel (persists + applies). Routes
  // accessibility-only keys to the accessibility store, the rest to settings.
  uiActions.setApplySetting((patch) => {
    const { holdToSprint, colorblind, ...settings } = patch;
    if (Object.keys(settings).length) save.updateSettings(settings);
    if (holdToSprint !== undefined) save.updateAccessibility({ holdToSprint });
    if (colorblind !== undefined) save.updateAccessibility({ colorblindPalette: colorblind });
    audio.resume();
    applyAllSettings();
    pushProfile();
    // Switching the arena rebuilds the pit geometry + reframes the camera live.
    if (patch.arenaId !== undefined) {
      setActiveArena(patch.arenaId);
      arena.dispose(scene);
      arena = new ArenaView(scene);
      frameArena(camera, window.innerWidth / window.innerHeight);
      arenaControls.reset();
    }
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    aimLine.setResolution(window.innerWidth, window.innerHeight);
    arenaControls.controls.update(); // keep the current orbit, just re-fit aspect
  });

  let lastT = performance.now();
  let fps = 0;
  let simMs = 0;
  let renderMs = 0;
  let lastHealth = world.player.health; // shake only when this drops (took a hit)

  const loop = createLoop({
    step(dt) {
      // Sim only runs while a run is active (menu/game-over idle the world).
      if (!world.started) {
        input.sample(); // keep edge-triggers (pause) from piling up
        simMs = 0;
        return;
      }
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
        if (g && arenaContains(g.x, g.z, 4)) {
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

      // Drain sim FX events accumulated across this frame's fixed steps.
      const fxEvents = world.fx.events;
      if (fxEvents.length) {
        effects.consume(fxEvents);
        chainView.consume(fxEvents);
        bloodView.consume(fxEvents);
        floorReflect.consume(fxEvents);
        for (const e of fxEvents) {
          if (e.kind === 'dmg') floating.addDamage(e.x, e.z, e.dx, e.variant);
          else audio.play(e.kind);
        }
        world.fx.clear();
      }
      // Screen shake is reserved for taking a hit — not for our own shots/impacts
      // (a shake on every shot reads as noise). Kick on any health drop, scaled by
      // the damage so a chip taps and a big bite jolts. Restart (health jumps up)
      // never triggers it.
      const hp = world.player.health;
      if (hp < lastHealth) {
        shake.add(Math.min(0.32, (lastHealth - hp) * 0.05));
        playerView.hurt(); // red shimmer on taking damage
      }
      lastHealth = hp;
      const fxDt = Math.min(frameMs / 1000, 0.05);
      // Spawn the sprint trail BEHIND the player (opposite movement) so it reads
      // as a wake, not a puff on top of him.
      const pv = world.player.vel;
      const psp = Math.hypot(pv.x, pv.z);
      let tx = world.player.pos.x;
      let tz = world.player.pos.z;
      if (psp > 0.1) {
        const back = world.player.stats.collisionRadius + 0.7;
        tx -= (pv.x / psp) * back;
        tz -= (pv.z / psp) * back;
      }
      effects.sprintTrail(tx, tz, world.player.sprint.active, fxDt);
      effects.update(fxDt);
      floorReflect.update(fxDt);
      chainView.update(fxDt);
      bloodView.update(fxDt);
      chainView.sync();

      // Orbit/zoom owns the camera pose; shake rides ON TOP. Undo last frame's
      // shake offset before update() so OrbitControls' spherical baseline stays
      // clean (otherwise shake would drift the orbit), then re-apply (V7 tiny).
      camera.position.x -= lastShakeX;
      camera.position.z -= lastShakeZ;
      arenaControls.controls.update();
      const off = shake.sample(fxDt);
      camera.position.x += off.x;
      camera.position.z += off.z;
      lastShakeX = off.x;
      lastShakeZ = off.z;

      // Floating world labels (damage numbers + pickup names) — project against
      // the finalized camera pose, push the bounded list to the DOM overlay.
      floating.update(fxDt);
      camera.updateMatrixWorld();
      uiActions.setLabels(
        floating.collect(
          camera,
          window.innerWidth,
          window.innerHeight,
          world.weaponDrops.pool,
          world.weaponDrops.promptIndex,
        ),
      );

      arena.update(world.enemies, fxDt); // animate gate doors as enemies enter
      playerView.update(fxDt); // decay the hurt flash
      playerView.sync(world.player, alpha, camera);
      groundShadowView.sync(world.enemies, alpha); // contact shadows (grounding)
      enemyView.sync(world.enemies, alpha);
      statusMarkers.sync(world.enemies, camera, alpha);
      enemyHealthbars.sync(world.enemies, camera, alpha);
      projectileView.sync(world.weaponSystem.projectiles, alpha);
      floorReflect.sync(world.weaponSystem.projectiles, alpha);
      enemyProjectileView.sync(world.enemyAttacks.projectiles, alpha);
      hazardView.sync(world.enemyAttacks.hazards);
      throwMarkerView.sync(world.enemyAttacks.projectiles);
      weaponDropView.sync(world.weaponDrops.pool);
      healthDropView.sync(world.healthDrops.pool);
      bountyView.sync(world.bounties.pool);
      shardView.sync(world.shards, alpha);
      droneView.sync(world.drones, alpha, fxDt);
      corpseView.sync(world.corpses.pool, alpha);
      cursorView.sync(world.player);

      // Aim lines — one per projectile, mirroring the weapon's multishot fan
      // (same angles the weapon-system emits). Hidden outside active combat.
      if (world.started && !world.paused && !world.leveling) {
        const pl = world.player;
        const w0 = world.weaponSystem.weapons[0];
        let ax: number, az: number;
        if (pl.aim.has) {
          ax = pl.aim.x - pl.pos.x;
          az = pl.aim.z - pl.pos.z;
          const l = Math.hypot(ax, az) || 1;
          ax /= l;
          az /= l;
        } else {
          ax = -Math.sin(pl.facing);
          az = -Math.cos(pl.facing);
        }
        const aimAngle = Math.atan2(ax, az);
        const shots = w0 ? Math.max(1, (w0.def.pellets ?? 1) * world.mods.projectileCount) : 1;
        const arc = w0 ? (w0.def.spreadArc ?? world.mods.spreadArc) : 0;
        const count = Math.min(shots, 32);
        for (let s = 0; s < count; s++) {
          const fan = count > 1 ? (s / (count - 1) - 0.5) * arc : 0;
          const a = aimAngle + fan;
          aimDirs[s * 2] = Math.sin(a);
          aimDirs[s * 2 + 1] = Math.cos(a);
        }
        // When mouse-aiming, the line ends AT the cursor reticle (so it visibly
        // connects), unless a closer enemy stops it first — but never past weapon
        // range. Without a cursor (keyboard facing), it shows the full reach.
        // EFFECTIVE range = base × rangeMult, so range upgrades move the terminus.
        const range = w0 ? w0.def.range * world.mods.rangeMult : 16;
        const cursorDist = pl.aim.has
          ? Math.hypot(pl.aim.x - pl.pos.x, pl.aim.z - pl.pos.z)
          : range;
        aimLine.sync(
          world.enemies,
          pl.pos.x,
          pl.pos.z,
          aimDirs,
          count,
          Math.min(range, cursorDist),
          pl.stats.collisionRadius + 0.4,
        );
      } else {
        aimLine.hide();
      }

      const r0 = performance.now();
      post.render(); // bloom post-stack (scene+camera bound in the pass)
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
        countdown: world.countdown,
        enemiesAlive: world.enemies.count,
        weapon: world.weaponSystem.weapons[0]?.def.displayName ?? '',
        shieldCharges: world.player.shieldCharges,
        shieldMax: world.player.shieldMax,
      });
      uiActions.setBoss(world.boss.snapshot());
      uiActions.setInspect(computeInspect(world));

      // Refresh the character sheet when pause opens (the pause menu shows it).
      if (world.paused && !wasPaused) uiActions.setSheet(world.characterSheet());
      wasPaused = world.paused;

      // Intro telegraphs: boss warning banner + lighter new-enemy-class toasts.
      if (world.tick < lastAnnTick) {
        seenVariants.clear(); // run restarted (tick reset) → re-announce
        bossAnnounced = false;
      }
      lastAnnTick = world.tick;
      if (world.boss.active && !bossAnnounced) {
        bossAnnounced = true;
        uiActions.setAnnounce({ id: ++annId, kind: 'boss', text: world.boss.snapshot().name });
      }
      const en = world.enemies;
      for (let i = 0; i < en.count; i++) {
        if (en.state[i] !== EnemyState.Active) continue;
        const v = en.variant[i]!;
        if (v === BOSS_GATEKEEPER.variant || seenVariants.has(v)) continue;
        seenVariants.add(v);
        uiActions.setAnnounce({
          id: ++annId,
          kind: 'enemy',
          text: ENEMY_DISPLAY_NAME[v] ?? 'Hostile',
        });
      }
      // Weapon evolution (T34): announce as a boss-tier banner when it fires.
      if (world.justEvolved && world.justEvolved !== lastEvolved) {
        lastEvolved = world.justEvolved;
        uiActions.setAnnounce({
          id: ++annId,
          kind: 'boss',
          text: `EVOLVED — ${world.justEvolved}`,
        });
      } else if (!world.justEvolved) {
        lastEvolved = null;
      }

      // Death → award Martian Glory (T26), record the run, show the game-over
      // screen with the result. Pushed once (V20).
      if (world.ended && world.result && !endShown) {
        endShown = true;
        const r = world.result;
        lastGlory = gloryFor(r, ARENAS[save.current.settings.arenaId].gloryMult);
        save.mutate((p) => {
          p.currencies.martianGlory += lastGlory;
          // Update the global best AND the per-arena / per-character buckets so
          // Records can break down "best run" by where + who (T65).
          const bump = (rec: RecordData): void => {
            rec.bestTimeSec = Math.max(rec.bestTimeSec, r.durationSec);
            rec.bestLevel = Math.max(rec.bestLevel, r.level);
            rec.mostKills = Math.max(rec.mostKills, r.kills);
          };
          bump(p.records);
          // Best for THIS (arena × character) combo — both shape the run.
          const key = arenaCharacterKey(p.settings.arenaId, ACTIVE_CHARACTER.id);
          p.recordsByArenaCharacter[key] ??= emptyRecord();
          bump(p.recordsByArenaCharacter[key]);
          p.runHistory.unshift({
            at: Date.now(),
            durationSec: r.durationSec,
            level: r.level,
            kills: r.kills,
          });
          p.runHistory = p.runHistory.slice(0, 50);
        });
        void save.flush();
        pushMeta();
        pushProfile();
        const sum = world.runSummary();
        uiActions.setSheet(world.characterSheet());
        uiActions.setResult({
          ...r,
          weapon: sum.weapon,
          bossKills: sum.bossKills,
          gloryEarned: lastGlory,
          killsByType: sum.killsByType,
          upgrades: sum.upgrades,
        });
        uiActions.setScreen('gameover');
      }

      // Draft slice: push once per opened draft (draftId distinguishes back-to-
      // back level-ups at the same level); clear when it closes.
      if (world.leveling && draftShownFor !== world.draftId) {
        draftShownFor = world.draftId;
        uiActions.setDraft({
          open: true,
          level: world.player.level,
          rerollsLeft: world.rerollsLeft,
          banishesLeft: world.banishesLeft,
          options: world.draft.map((d) => {
            const info = world.upgradeInfo(d);
            return {
              id: d.id,
              name: d.name,
              description: d.description,
              rarity: d.rarity,
              tags: d.tags,
              level: info.level,
              maxLevel: info.maxLevel,
              changes: info.changes,
            };
          }),
        });
      } else if (!world.leveling && draftShownFor !== -1) {
        draftShownFor = -1;
        uiActions.setDraft({
          open: false,
          level: world.player.level,
          options: [],
          rerollsLeft: 0,
          banishesLeft: 0,
        });
      }

      // Boss-reward overlay slice (T43): push once when it opens, clear on close.
      if (world.bossReward && rewardShownFor !== world.bossRewardId) {
        rewardShownFor = world.bossRewardId;
        uiActions.setBossReward({
          open: true,
          id: world.bossRewardId,
          options: world.bossRewardChoices.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            kind: r.kind,
          })),
        });
      } else if (!world.bossReward && rewardShownFor !== -1) {
        rewardShownFor = -1;
        uiActions.setBossReward({ open: false, id: world.bossRewardId, options: [] });
      }

      const metrics: OverlayMetrics = {
        fps,
        frameMs,
        simMs,
        renderMs,
        enemies: world.enemies.count,
        maxEnemies: budgetAt(world.elapsed / TIMELINE_STRETCH).maxConcurrentEnemies,
        projectiles: world.weaponSystem.projectiles.count,
        particles: effects.count,
        drawCalls: renderer.info.render.drawCalls,
        tier,
        seed,
      };
      overlay.update(metrics);
    },
  });
  loop.start();
  // First frame is rendering — drop the boot splash on the next frame so the
  // arena/menu has actually painted before the splash fades.
  requestAnimationFrame(() => hideBootSplash());

  document.addEventListener('visibilitychange', () => {
    // Auto-pause on focus loss is opt-out via settings (T36).
    if (pauseOnFocusLoss) loop.setTimeScale(document.hidden ? 0 : 1);
    if (document.hidden) void save.flush(); // persist on tab hide (V15)
  });
  window.addEventListener('beforeunload', () => void save.flush());

  // Dev hook for e2e / debugging invisible sim state (execution rule 11). Temp.
  (window as unknown as { __MARS__: unknown }).__MARS__ = {
    world,
    effects,
    save,
    refreshMeta: pushMeta,
  };
}

void boot(app);
