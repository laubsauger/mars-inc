// Upgrade value preview (T51 UI clarity). Repeated picks of the same card stack;
// the draft needs to SHOW that — owned level + how the numbers actually move. We
// derive the delta by applying the upgrade to throwaway CLONES of the live mods +
// player and diffing numeric fields. Pure: never touches real state (V2-spirit).
// Effect-engine cards (conditionals/triggers move no numeric field) → empty list,
// and the card falls back to its description.

import type { RunMods } from './mods';
import type { Player } from '../player';
import { BuildEffects } from './effects';
import type { UpgradeDefinition } from './upgrades';

export interface UpgradeChange {
  label: string;
  from: string;
  to: string;
}

const x2 = (n: number) => `×${n.toFixed(2)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const int0 = (n: number) => `${Math.round(n)}`;
const num1 = (n: number) => n.toFixed(1);

const MOD_FIELDS: ReadonlyArray<[keyof RunMods, string, (n: number) => string]> = [
  ['damageMult', 'Damage', x2],
  ['fireRateMult', 'Fire Rate', x2],
  ['projectileCount', 'Projectiles', int0],
  ['critChanceAdd', 'Crit Chance', pct],
  ['pierce', 'Pierce', int0],
  ['chainCount', 'Chain Jumps', int0],
  ['chainRange', 'Chain Range', num1],
  ['ricochet', 'Ricochet Bounces', int0],
  ['ricochetRange', 'Ricochet Range', num1],
  ['blastRadius', 'Blast Radius', num1],
  ['rangeMult', 'Range', x2],
  ['knockback', 'Knockback', int0],
];

const PLAYER_FIELDS: ReadonlyArray<[string, (p: Player) => number, (n: number) => string]> = [
  ['Max HP', (p) => p.maxHealth, int0],
  ['Move Speed', (p) => p.stats.moveSpeed, num1],
  ['Drones', (p) => p.droneCount, int0],
  ['Shield', (p) => p.shieldMax, int0],
  ['Luck', (p) => p.luck, num1],
];

/** Numeric changes an upgrade would make to the live build, as {label, from, to}.
 *  Empty when the upgrade only registers conditionals/triggers (no stat delta). */
export function previewUpgrade(
  def: UpgradeDefinition,
  mods: RunMods,
  player: Player,
): UpgradeChange[] {
  let sandboxMods: RunMods;
  let sandboxPlayer: Player;
  try {
    sandboxMods = structuredClone(mods);
    sandboxPlayer = structuredClone(player);
    def.apply({ mods: sandboxMods, player: sandboxPlayer, effects: new BuildEffects() });
  } catch {
    return []; // un-cloneable state or an apply that needs more context → no preview
  }

  const changes: UpgradeChange[] = [];
  for (const [key, label, fmt] of MOD_FIELDS) {
    const a = mods[key];
    const b = sandboxMods[key];
    if (a !== b) changes.push({ label, from: fmt(a), to: fmt(b) });
  }
  for (const [label, read, fmt] of PLAYER_FIELDS) {
    const a = read(player);
    const b = read(sandboxPlayer);
    if (a !== b) changes.push({ label, from: fmt(a), to: fmt(b) });
  }
  return changes;
}
