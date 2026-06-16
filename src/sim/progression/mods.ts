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
  chainCount: number; // lightning arcs to N nearby enemies on hit (0 = off)
  chainRange: number; // max arc distance (world units)
  chainFalloff: number; // damage retained per arc hop (0..1)
  ricochet: number; // times a projectile BOUNCES to a new enemy on hit (0 = off)
  ricochetRange: number; // max distance to find a bounce target (world units)
  blastRadius: number; // universal explosive radius added to every shot (0 = off)
  rangeMult: number; // weapon targeting/effective range multiplier (T33 progression)
  knockback: number; // outward impulse applied to enemies on projectile hit (0 = off)
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
    chainRange: 6,
    chainFalloff: 0.6,
    ricochet: 0,
    ricochetRange: 9,
    blastRadius: 0,
    rangeMult: 1,
    knockback: 0,
  };
}

/** Reset a mod layer to defaults in place (T22 restart — keep the reference). */
export function resetMods(m: RunMods): void {
  Object.assign(m, defaultMods());
}
