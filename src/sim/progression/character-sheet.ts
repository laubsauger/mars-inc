// Derives the live character/build sheet (attributes + owned upgrades) shown on
// the end screen, pause menu, and warrior panel. Pure read-only over sim state —
// split out of world.ts so the (long, display-shaped) derivation evolves without
// touching the orchestrator. Conditional/dynamic modifiers (BuildEffects) are
// evaluated against the CURRENT battlefield for the "active" value plus a best-case
// probe for the "(up to …)" potential.

import type { RunMods } from './mods';
import type { BuildEffects } from './effects';
import type { UpgradeLevels } from './upgrades';
import type { Player } from '../player';
import type { EnemyPool } from '../enemies';
import type { WeaponSystem } from '../combat/weapon-system';
import { DRAFT_POOL } from './draft-pool';

/** A reusable character/build sheet (T43) — shown on the end screen, the pause
 *  menu, and the warrior panel. Derived live from player + mods. */
export interface CharacterSheet {
  level: number;
  weapon: string;
  attributes: { label: string; value: string }[];
  /** Owned upgrades with enough detail to read the build at a glance (T51):
   *  name, owned/max level, rarity (for colour), and what the card does. */
  upgrades: {
    name: string;
    level: number;
    maxLevel: number;
    rarity: string;
    description: string;
  }[];
}

/** Everything the sheet derivation reads from the World (kept explicit so it stays
 *  a pure function, not a method bound to the orchestrator). */
export interface SheetContext {
  mods: RunMods;
  player: Player;
  enemies: EnemyPool;
  effects: BuildEffects;
  firingRampSec: number;
  stationarySec: number;
  upgradeLevels: UpgradeLevels;
  weaponSystem: WeaponSystem;
}

export function buildCharacterSheet(ctx: SheetContext): CharacterSheet {
  const m = ctx.mods;
  const s = ctx.player.stats;
  const p = ctx.player;
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  // Conditional damage/crit/fire-rate (Restraining Order, risk cards, ramps…) live
  // in the dynamic BuildEffects layer, NOT the static mods. Evaluate them against
  // the CURRENT battlefield (read-only — no mutation) so the sheet shows what's
  // ACTIVE right now; a separate best-case probe gives the "up to" potential.
  const e = ctx.enemies;
  let nearest = Infinity;
  let nearby = 0;
  for (let i = 0; i < e.count; i++) {
    const dx = e.posX[i]! - p.pos.x;
    const dz = e.posZ[i]! - p.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < nearest) nearest = d2;
    if (d2 <= 49) nearby++; // within 7m (LOCAL_CROWD_RADIUS) — crowd cards read this
  }
  const live = ctx.effects.evalConditionals({
    enemiesOnScreen: e.count,
    enemiesNearby: nearby,
    nearestDist: nearest === Infinity ? Infinity : Math.sqrt(nearest),
    firingRampSec: ctx.firingRampSec,
    hpFrac: p.maxHealth > 0 ? p.health / p.maxHealth : 0,
    recentCrit: false,
    recoilActive: p.recoilTimer > 0,
    stationarySec: ctx.stationarySec,
  });
  const probe = ctx.effects.evalConditionals({
    enemiesOnScreen: 99,
    enemiesNearby: 99,
    nearestDist: 999,
    firingRampSec: 12,
    hpFrac: 0.01,
    recentCrit: true,
    recoilActive: true,
    stationarySec: 12,
  });
  // Show the CURRENTLY-active value, and "(up to MAX)" only when more is possible.
  const upTo = (now: number, max: number, fmt: (n: number) => string): string =>
    max > now + Math.abs(now) * 0.001 + 1e-4 ? `${fmt(now)} (up to ${fmt(max)})` : fmt(now);
  const xMult = (n: number): string => `×${n.toFixed(2)}`;
  const attributes = [
    { label: 'Health', value: `${Math.round(p.health)} / ${Math.round(p.maxHealth)}` },
    {
      label: 'Damage',
      value: upTo(m.damageMult * live.damageMult, m.damageMult * probe.damageMult, xMult),
    },
    {
      label: 'Fire rate',
      value: upTo(m.fireRateMult * live.fireRateMult, m.fireRateMult * probe.fireRateMult, xMult),
    },
    {
      label: 'Crit chance',
      value: upTo(
        m.critChanceAdd + live.critAdd,
        m.critChanceAdd + probe.critAdd,
        (n) => `+${pct(n)}`,
      ),
    },
    { label: 'Crit damage', value: xMult(m.critDamageMult) },
    { label: 'Range', value: `×${m.rangeMult.toFixed(2)}` },
    { label: 'Projectiles', value: `${m.projectileCount}` },
    { label: 'Pierce', value: m.pierce > 0 ? `+${m.pierce}` : '—' },
    {
      label: 'Chain',
      value: m.chainCount > 0 ? `${m.chainCount} arc${m.chainCount > 1 ? 's' : ''}` : '—',
    },
    { label: 'Blast', value: m.blastRadius > 0 ? `${m.blastRadius.toFixed(1)} m` : '—' },
    { label: 'Move speed', value: s.moveSpeed.toFixed(1) },
    { label: 'Sprint', value: `${s.sprintCharges}× · ${s.sprintCooldown.toFixed(1)}s` },
    { label: 'Magnet', value: `${p.magnetRadius.toFixed(1)} m` },
  ];
  // Rich abilities list: owned level + rarity + effect text, sorted by level so the
  // build's backbone reads first. Falls back gracefully if a def is missing.
  const upgrades = Object.entries(ctx.upgradeLevels)
    .map(([id, level]) => {
      const def = DRAFT_POOL.find((u) => u.id === id);
      return {
        name: def?.name ?? id,
        level,
        maxLevel: def?.maxLevel ?? level,
        rarity: def?.rarity ?? 'common',
        description: def?.description ?? '',
      };
    })
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  return {
    level: p.level,
    weapon: ctx.weaponSystem.weapons[0]?.def.displayName ?? '—',
    attributes,
    upgrades,
  };
}
