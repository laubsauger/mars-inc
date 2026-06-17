// Boss roster (T75). A BossDef is the IDENTITY layer over a pooled boss body
// (an EnemyType flagged `boss`): name, tier, phase count, whether it lunges, and
// a per-boss HP scale. The BossController reads this to drive the right fight and
// the HUD reads it for the tier-distinct bar/announce (T78, V39). Minibosses are
// 2-phase, no-charge or light-charge set-ups; finals are 3-phase charge fights.

import {
  type EnemyType,
  BOSS_GATEKEEPER,
  FOREMAN_KRILL,
  REPO_SOVEREIGN,
  MAGMA_NOTARY,
  FROSTBITE_MAGNATE,
  DEVOURER_PRIME,
} from '../sim/enemies';

export type BossTier = 'miniboss' | 'final';

/** Fight flavour tag (kept for HUD/telemetry; the actual fight is the `moves`). */
export type BossStyle = 'artillery' | 'gunner' | 'rusher';

/** A single boss attack the controller knows how to execute (T-bossmoves). Per-boss
 *  movesets are DATA: each phase has a weighted pool of these, so every boss PLAYS
 *  differently (a gunner rakes volleys, an artillery boss rains meteors + rings, a
 *  rusher lunges) without bespoke code per boss. Params default per kind. */
export type BossMoveKind =
  | 'aimedLob' // one heavy aimed cook-off at the player
  | 'ringLob' // a circle of cook-offs caging the player
  | 'spiralLob' // an expanding spiral of lobs (rotating denial)
  | 'gunVolley' // a fan of straight aimed rounds
  | 'meteorBarrage' // orbital meteors scattered around the player (reuses Moonshot FX)
  | 'laserStar' // radial telegraphed beams from the boss
  | 'charge' // telegraphed lunge — owns the body for the slide
  | 'summon'; // gate-in / interior adds

export interface BossMove {
  readonly kind: BossMoveKind;
  readonly weight?: number; // selection weight within the phase (default 1)
  readonly count?: number; // projectiles / meteors / beams / adds
  readonly damage?: number;
  readonly radius?: number; // ring radius / meteor blast radius
}

export interface BossDef {
  /** Stable id (matches the EnemyType id) — used as the unlock/trophy key (T79). */
  readonly id: string;
  readonly name: string;
  readonly tier: BossTier;
  /** The pooled body fielded by the wave director. */
  readonly enemyType: EnemyType;
  /** Phase count for the HP-threshold fight (2 = miniboss beat, 3 = final). */
  readonly phases: number;
  /** Whether this boss can LUNGE (telegraphed charge) — finals + heavier minis. */
  readonly charge: boolean;
  /** Fight flavour tag (HUD/telemetry only — behaviour comes from `moves`). */
  readonly style: BossStyle;
  /** Extra HP multiplier on top of the body base + act/difficulty scaling. */
  readonly scale: number;
  /** Per-phase weighted move pools — `moves[phase]` is the attack set for that phase
   *  (last entry reused if fewer than `phases`). The controller picks + executes one
   *  each attack tick. This is the bespoke MOVESET (T-bossmoves). */
  readonly moves: readonly (readonly BossMove[])[];
}

// ── Act 1 ────────────────────────────────────────────────────────────────────
export const FOREMAN_KRILL_BOSS: BossDef = {
  id: FOREMAN_KRILL.id,
  name: 'Foreman Krill',
  tier: 'miniboss',
  enemyType: FOREMAN_KRILL,
  phases: 2,
  charge: false,
  style: 'artillery',
  scale: 1,
  // Plodding artillery: learnable lobs → caging rings + a light meteor sprinkle.
  moves: [
    [
      { kind: 'aimedLob', weight: 2 },
      { kind: 'ringLob', count: 4, radius: 4 },
    ],
    [
      { kind: 'ringLob', count: 6, radius: 4.5, weight: 2 },
      { kind: 'meteorBarrage', count: 3 },
    ],
  ],
};

export const REPO_SOVEREIGN_BOSS: BossDef = {
  id: REPO_SOVEREIGN.id,
  name: 'The Repo Sovereign',
  tier: 'miniboss',
  enemyType: REPO_SOVEREIGN,
  phases: 2,
  charge: true,
  style: 'gunner',
  scale: 1,
  // Shooter that closes: gun fans + the odd lob, then volleys + a repossession lunge.
  moves: [
    [{ kind: 'gunVolley', count: 4, weight: 2 }, { kind: 'aimedLob' }],
    [{ kind: 'gunVolley', count: 6, weight: 2 }, { kind: 'charge' }],
  ],
};

export const GATEKEEPER_BOSS: BossDef = {
  id: BOSS_GATEKEEPER.id,
  name: 'Gatekeeper of Phobos',
  tier: 'final',
  enemyType: BOSS_GATEKEEPER,
  phases: 3,
  charge: true,
  style: 'rusher',
  scale: 1,
  // The three-act warden: aimed opener → rings + lunges → frantic ring/gun/lunge with
  // an occasional laser star (the signature beat the phase-break also fires).
  moves: [
    [{ kind: 'aimedLob' }],
    [{ kind: 'ringLob', count: 5, radius: 4, weight: 2 }, { kind: 'charge' }],
    [
      { kind: 'ringLob', count: 6, radius: 5, weight: 2 },
      { kind: 'gunVolley', count: 3 },
      { kind: 'charge' },
      { kind: 'laserStar', count: 5 },
    ],
  ],
};

// ── Act 2 ────────────────────────────────────────────────────────────────────
export const MAGMA_NOTARY_BOSS: BossDef = {
  id: MAGMA_NOTARY.id,
  name: 'The Magma Notary',
  tier: 'miniboss',
  enemyType: MAGMA_NOTARY,
  phases: 2,
  charge: false,
  style: 'artillery',
  scale: 1,
  // Heavy zoner: meteors are its signature — they rain harder as it breaks.
  moves: [
    [{ kind: 'meteorBarrage', count: 3, weight: 2 }, { kind: 'aimedLob' }],
    [
      { kind: 'meteorBarrage', count: 4, weight: 2 },
      { kind: 'ringLob', count: 6, radius: 5 },
    ],
  ],
};

export const FROSTBITE_MAGNATE_BOSS: BossDef = {
  id: FROSTBITE_MAGNATE.id,
  name: 'Frostbite Magnate',
  tier: 'miniboss',
  enemyType: FROSTBITE_MAGNATE,
  phases: 2,
  charge: true,
  style: 'rusher',
  scale: 1,
  // Aggressive skirmisher: rings + volleys, then lunges + a laser star.
  moves: [
    [
      { kind: 'ringLob', count: 5, radius: 4 },
      { kind: 'gunVolley', count: 3 },
    ],
    [
      { kind: 'charge', weight: 2 },
      { kind: 'laserStar', count: 4 },
      { kind: 'ringLob', count: 6, radius: 5 },
    ],
  ],
};

export const DEVOURER_PRIME_BOSS: BossDef = {
  id: DEVOURER_PRIME.id,
  name: 'Devourer Prime',
  tier: 'final',
  enemyType: DEVOURER_PRIME,
  phases: 3,
  charge: true,
  style: 'rusher',
  scale: 1,
  // The act-2 set-piece: summons + lobs → rings/meteors/lunges → everything at once,
  // a spiral of lobs + laser stars + meteors. The hardest, busiest moveset.
  moves: [
    [
      { kind: 'aimedLob', weight: 2 },
      { kind: 'summon', count: 3 },
    ],
    [
      { kind: 'ringLob', count: 6, radius: 5, weight: 2 },
      { kind: 'meteorBarrage', count: 4 },
      { kind: 'charge' },
    ],
    [
      { kind: 'laserStar', count: 6, weight: 2 },
      { kind: 'meteorBarrage', count: 5 },
      { kind: 'spiralLob', count: 10 },
      { kind: 'gunVolley', count: 4 },
      { kind: 'charge' },
    ],
  ],
};

export const BOSS_DEFS: readonly BossDef[] = [
  FOREMAN_KRILL_BOSS,
  REPO_SOVEREIGN_BOSS,
  GATEKEEPER_BOSS,
  MAGMA_NOTARY_BOSS,
  FROSTBITE_MAGNATE_BOSS,
  DEVOURER_PRIME_BOSS,
];

/** Variant → BossDef, so the controller recovers a boss's identity from the pool
 *  (mirrors ENEMY_BY_VARIANT). Built once at module load. */
const BY_VARIANT = new Map<number, BossDef>(BOSS_DEFS.map((d) => [d.enemyType.variant, d]));

export function bossByVariant(variant: number): BossDef | undefined {
  return BY_VARIANT.get(variant);
}

/** Is this enemy variant a boss body? (Fast path for the director/controller.) */
export function isBossVariant(variant: number): boolean {
  return BY_VARIANT.has(variant);
}
