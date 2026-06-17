// Derives the per-frame HUD store slice from sim state. Pure read-only (V2) — split
// from main.ts so the (flat, primitive-keyed) HUD projection lives next to its
// HudState shape and can evolve without touching boot wiring.

import type { HudState } from './store-types';
import type { World } from '../sim/world';

export function buildHudState(world: World): HudState {
  const p = world.player;
  const sp = p.sprint;
  return {
    health: p.health,
    maxHealth: p.maxHealth,
    sprintCharges: sp.charges,
    sprintCooldown01:
      sp.charges >= sp.maxCharges ? 1 : 1 - Math.max(0, sp.cooldown) / p.stats.sprintCooldown,
    paused: world.paused,
    elapsed: world.elapsed,
    wave: world.director.waveNumber,
    level: p.level,
    xp01: p.xp / p.xpToNext,
    countdown: world.countdown,
    bossEta: world.bossEta(),
    enemiesAlive: world.enemies.count,
    weapon: world.weaponSystem.weapons[0]?.def.displayName ?? '',
    shieldCharges: p.shieldCharges,
    shieldMax: p.shieldMax,
    sprintMax: sp.maxCharges,
    grenade01: world.grenadeCharge01,
    autoShoot: world.autoShoot,
  };
}
