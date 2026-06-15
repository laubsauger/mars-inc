// Centralized damage pipeline (T15, V3). EVERY weapon routes damage through
// here — no weapon implements its own damage rules. Fixed resolution order
// (§5.4): base → additive → multiplicative → crit → element → armor → shield →
// health → knockback → stagger → status → on-hit → on-kill → stats.
//
// Outgoing (source-side: base..element) is pure and unit-tested. Target-side
// (armor..on-kill) is applied per archetype; enemies have no armor/shield yet,
// so those steps are identity but the call site is the single choke point.

import type { Rng } from '../../core/rng';

export type DamageType = 'kinetic' | 'energy' | 'explosive' | 'thermal';

export interface DamagePacket {
  weaponId: string;
  baseDamage: number;
  additive: number; // flat bonus (step 2)
  multiplier: number; // damage multiplier (step 3)
  critChance: number; // 0..1 (step 4)
  critMultiplier: number;
  elementMultiplier: number; // faction/element scalar (step 5)
  damageType: DamageType;
  knockback: number;
  tags: readonly string[];
}

export function makePacket(over: Partial<DamagePacket> & { baseDamage: number }): DamagePacket {
  return {
    weaponId: over.weaponId ?? 'unknown',
    baseDamage: over.baseDamage,
    additive: over.additive ?? 0,
    multiplier: over.multiplier ?? 1,
    critChance: over.critChance ?? 0,
    critMultiplier: over.critMultiplier ?? 2,
    elementMultiplier: over.elementMultiplier ?? 1,
    damageType: over.damageType ?? 'kinetic',
    knockback: over.knockback ?? 0,
    tags: over.tags ?? [],
  };
}

export interface OutgoingDamage {
  amount: number;
  crit: boolean;
}

/**
 * Steps 1–5: base, additive, multiplicative, crit roll, element. Pure given the
 * rng. Crit consumes exactly one rng draw so determinism holds (V16).
 */
export function computeOutgoing(packet: DamagePacket, rng: Rng): OutgoingDamage {
  let dmg = packet.baseDamage;
  dmg += packet.additive;
  dmg *= packet.multiplier;
  const crit = rng.next() < packet.critChance;
  if (crit) dmg *= packet.critMultiplier;
  dmg *= packet.elementMultiplier;
  return { amount: dmg, crit };
}

/**
 * Steps 6–8 for a target with armor + shield. Armor is flat reduction (floored
 * at a chip minimum), shield absorbs before health. Returns health damage and
 * remaining shield. Pure — unit-tested independent of any entity store.
 */
export function applyMitigation(
  amount: number,
  armor: number,
  shield: number,
): { toHealth: number; shieldLeft: number } {
  const afterArmor = Math.max(amount * 0.05, amount - armor); // 5% chip floor
  const absorbed = Math.min(shield, afterArmor);
  return { toHealth: afterArmor - absorbed, shieldLeft: shield - absorbed };
}
