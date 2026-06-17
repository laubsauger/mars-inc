// Slice weapon catalog (T33). Six data-driven weapons across distinct families
// (§I.data) — the systems read these; a weapon never implements its own rules.
// Acquisition (character loadout / weapon-drop drafts) wires these in later;
// this is the typed content + a lookup.

import type { WeaponDefinition } from '../../sim/combat/weapon';
import { contractualSidearm } from './contractual-sidearm';
import { rustDevilMinigun } from './rust-devil-minigun';
import { liabilityShotgun } from './liability-shotgun';
import { severanceCannon } from './severance-cannon';
import { arcRepeater } from './arc-repeater';
import { phobosDriver } from './phobos-driver';
import { ionLance } from './ion-lance';

export const WEAPONS: readonly WeaponDefinition[] = [
  contractualSidearm,
  rustDevilMinigun,
  liabilityShotgun,
  severanceCannon,
  arcRepeater,
  phobosDriver,
  ionLance,
];

const BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

export function weaponById(id: string): WeaponDefinition | undefined {
  return BY_ID.get(id);
}
