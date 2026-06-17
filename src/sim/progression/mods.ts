// Per-run modifier layer (T18). Upgrades mutate these; weapon/movement systems
// read them on top of immutable content defs. Keeps content data-driven while
// the build accumulates within a run.

export interface RunMods {
  damageMult: number;
  fireRateMult: number; // cooldown divided by this
  projectileCount: number; // total projectiles per shot (1 = base)
  spreadArc: number; // total fan angle when projectileCount > 1 (radians)
  critChanceAdd: number;
  pierce: number; // extra enemies a projectile passes through (added to weapon base)
  // CHAIN (lightning): instant, hits SEVERAL clustered enemies at once but only
  // hops a SHORT distance — a crowd-burst that wants packed enemies.
  chainCount: number; // lightning arcs to N nearby enemies on hit (0 = off)
  chainRange: number; // SHORT max hop distance (world units)
  chainFalloff: number; // damage retained per arc hop (0..1)
  // RICOCHET: a single projectile that BOUNCES target→target sequentially with
  // LONG reach — a travelling pick that crosses the arena, one enemy at a time.
  ricochet: number; // times a projectile bounces to a new enemy on hit (0 = off)
  ricochetRange: number; // LONG max distance to find a bounce target (world units)
  ricochetRetain: number; // dmg kept per ricochet bounce — starts LOW, upgrades raise it
  blastRadius: number; // universal explosive radius added to every shot (0 = off)
  blastDamageMult: number; // fraction of weapon dmg the splash carries — starts LOW, scales up
  rangeMult: number; // weapon targeting/effective range multiplier (T33 progression)
  knockback: number; // outward impulse applied to enemies on projectile hit (0 = off)
  recoilMult: number; // scales per-shot recoil impulse (T55; still capped by V10)
  procCoefBonus: number; // added to the weapon's proc coefficient (T69/T70; status builds)
  statusDamageMult: number; // global DoT amplifier — burn/bleed × this (T35/T70 status lane)
  critDamageMult: number; // scales the crit BONUS damage (T35; 1 = weapon default)
  // GRENADE (right-mouse) progression axis (T-grenade): a crowd-parting secondary.
  grenadeCdMult: number; // throw cooldown × this (<1 = faster)
  grenadeDamageMult: number; // grenade blast damage × this
  grenadeRadiusAdd: number; // + blast radius (world units)
  grenadeRangeAdd: number; // + max throw distance (world units, on top of the base)
  grenadeKnockbackMult: number; // outward shove × this
  grenadeMolotov: boolean; // Molotov: the blast also sets the area on fire (burn)
  grenadePull: boolean; // Vacuum Charge: the blast SUCKS enemies in instead of shoving them out
}

export function defaultMods(): RunMods {
  return {
    damageMult: 1,
    fireRateMult: 1,
    projectileCount: 1,
    spreadArc: 0.26,
    critChanceAdd: 0,
    pierce: 0,
    chainCount: 0,
    chainRange: 5, // short hops — chain is a packed-crowd tool
    chainFalloff: 0.7, // stays useful across several hops (it has no travel time)
    ricochet: 0,
    ricochetRange: 13, // long reach — bounce can cross open space
    ricochetRetain: 0.2, // each bounce keeps only 20% — weak until upgrades pump it
    blastRadius: 0,
    blastDamageMult: 0.34, // splash starts at 34% of weapon dmg — scale up via upgrades
    rangeMult: 1,
    knockback: 0,
    recoilMult: 1,
    procCoefBonus: 0,
    statusDamageMult: 1,
    critDamageMult: 1,
    grenadeCdMult: 1,
    grenadeDamageMult: 1,
    grenadeRadiusAdd: 0,
    grenadeRangeAdd: 0,
    grenadeKnockbackMult: 1,
    grenadeMolotov: false,
    grenadePull: false,
  };
}

/** Reset a mod layer to defaults in place (T22 restart — keep the reference). */
export function resetMods(m: RunMods): void {
  Object.assign(m, defaultMods());
}
