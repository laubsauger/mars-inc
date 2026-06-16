// Upgrade value preview (T51 UI clarity). Repeated picks of the same card stack;
// the draft needs to SHOW that — owned level + how the numbers actually move. We
// derive the delta by applying the upgrade to throwaway CLONES of the live mods +
// player and diffing fields. Pure: never touches real state (V2-spirit).
// Effect-engine cards (conditionals/triggers move no tracked field) → empty list,
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
const secs = (n: number) => `${n.toFixed(1)}s`;
const deg = (n: number) => `${Math.round((n * 180) / Math.PI)}°`;
const onOff = (b: boolean) => (b ? 'On' : 'Off');

// Humanize a camelCase mod key for the rare field with no explicit label, so new
// content auto-surfaces a readable row instead of silently showing nothing.
function humanize(key: string): string {
  const s = key
    .replace(/([A-Z])/g, ' $1')
    .replace(/Mult$| Mult$/i, '')
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Every numeric/boolean RunMods field with a friendly label + formatter. The diff
// loop walks ALL mod keys, so anything missing here still appears via humanize().
const MOD_LABELS: Partial<Record<keyof RunMods, [string, (n: number) => string]>> = {
  damageMult: ['Damage', x2],
  fireRateMult: ['Fire Rate', x2],
  projectileCount: ['Projectiles', int0],
  spreadArc: ['Spread', deg],
  critChanceAdd: ['Crit Chance', pct],
  pierce: ['Pierce', int0],
  chainCount: ['Chain Arcs', int0],
  chainRange: ['Chain Range', num1],
  chainFalloff: ['Chain Retain', pct],
  ricochet: ['Ricochet Bounces', int0],
  ricochetRange: ['Ricochet Range', num1],
  ricochetRetain: ['Ricochet Retain', pct],
  blastRadius: ['Blast Radius', num1],
  blastDamageMult: ['Blast Damage', pct],
  rangeMult: ['Range', x2],
  knockback: ['Knockback', int0],
  recoilMult: ['Recoil', x2],
  procCoefBonus: ['Proc Coeff', num1],
  statusDamageMult: ['Status Damage', x2],
  critDamageMult: ['Crit Damage', x2],
  grenadeCdMult: ['Grenade Cooldown', x2],
  grenadeDamageMult: ['Grenade Damage', x2],
  grenadeRadiusAdd: ['Grenade Radius', num1],
  grenadeKnockbackMult: ['Grenade Knockback', x2],
};

const MOD_BOOL_LABELS: Partial<Record<keyof RunMods, string>> = {
  grenadeMolotov: 'Molotov',
  grenadePull: 'Vacuum Charge',
};

// Player fields a draft pick can move. Curated (not a blind diff) so derived churn
// like current `health` doesn't read as an "upgrade" — only build-shaping stats.
const PLAYER_FIELDS: ReadonlyArray<[string, (p: Player) => number, (n: number) => string]> = [
  ['Max HP', (p) => p.maxHealth, int0],
  ['Move Speed', (p) => p.stats.moveSpeed, num1],
  ['Sprint Charges', (p) => p.stats.sprintCharges, int0],
  ['Drones', (p) => p.droneCount, int0],
  ['Drone Damage', (p) => p.droneDamageMult, x2],
  ['Shield', (p) => p.shieldMax, int0],
  ['Shield Recharge', (p) => p.shieldRecharge, secs],
  ['Pulse Interval', (p) => p.novaInterval, secs],
  ['Pulse Radius', (p) => p.novaRadius, num1],
  ['Pulse Force', (p) => p.novaForce, int0],
  ['Pulse Damage', (p) => p.novaDamage, int0],
  ['Dash Shock', (p) => p.dashShockForce, int0],
  ['Dash Radius', (p) => p.dashShockRadius, num1],
  ['Pickup Radius', (p) => p.pickupRadius, num1],
  ['Magnet Radius', (p) => p.magnetRadius, num1],
  ['Revives', (p) => p.reviveCharges, int0],
  ['Draft Size', (p) => p.draftSize, int0],
  ['Luck', (p) => p.luck, num1],
];

const PLAYER_BOOL_FIELDS: ReadonlyArray<[string, (p: Player) => boolean]> = [
  ['Pulse Pull', (p) => p.novaPull],
];

/** Field changes an upgrade would make to the live build, as {label, from, to}.
 *  Empty when the upgrade only registers conditionals/triggers (no tracked delta). */
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
  // Walk EVERY mod key so no numeric/boolean field is silently dropped (root cause
  // of "level-ups show nothing" — fields like pulse/spread/blast weren't listed).
  for (const key of Object.keys(sandboxMods) as (keyof RunMods)[]) {
    const a = mods[key];
    const b = sandboxMods[key];
    if (a === b) continue;
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      const label = MOD_BOOL_LABELS[key] ?? humanize(key);
      changes.push({ label, from: onOff(Boolean(a)), to: onOff(Boolean(b)) });
    } else {
      const spec = MOD_LABELS[key];
      const fmt = spec?.[1] ?? num1;
      changes.push({
        label: spec?.[0] ?? humanize(key),
        from: fmt(a as number),
        to: fmt(b as number),
      });
    }
  }
  for (const [label, read, fmt] of PLAYER_FIELDS) {
    const a = read(player);
    const b = read(sandboxPlayer);
    if (a !== b) changes.push({ label, from: fmt(a), to: fmt(b) });
  }
  for (const [label, read] of PLAYER_BOOL_FIELDS) {
    const a = read(player);
    const b = read(sandboxPlayer);
    if (a !== b) changes.push({ label, from: onOff(a), to: onOff(b) });
  }
  return changes;
}
