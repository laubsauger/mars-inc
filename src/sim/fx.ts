// FX event channel (T16). Sim systems push ephemeral visual/audio cues here;
// the render layer drains them once per frame. Pure sugar — events carry no
// authority and never feed back into sim state (V2). Accumulates across the
// multiple fixed steps that can occur within one rendered frame.

export type FxKind =
  | 'muzzle'
  | 'impact'
  | 'death'
  | 'dmg'
  | 'chain'
  | 'blood'
  | 'teleport'
  | 'levelup'
  | 'bounty'
  | 'ember' // visual-only status flecks (burn) — NEVER plays a sound
  | 'corpseblast' // overkill-corpse detonation — TOXIC-GREEN so it reads ⊥ gold explosions
  | 'meteor' // orbital strike telegraph — render drops a rock that lands on the fuse. dx = fall time, dz = blast radius. variant: 0 = player Moonshot (orange), 1 = HOSTILE boss meteor (violet) so the two never read alike
  | 'laser' // player hitscan beam — x,z = origin; dx,dz = END point (absolute, not a dir)
  | 'toxiccloud' // Toxic Bloom — a lingering green gas puff (dx = radius)
  | 'bloodburst'; // boss death (T77/V38) — massively scaled gore eruption + ground splatter (dx = boss radius)

/** High bit OR'd into a 'blood' event's `variant` to flag a CRIT hit → the view
 *  sprays a more violent, further, tighter directional jet (coup-de-grâce read).
 *  Enemy variants are < 64, so this bit rides alongside without collision. */
export const BLOOD_CRIT_BIT = 64;

/** Per-weapon-family hit read (T37, art doc Effects Plan). Carried on `impact`
 *  events in `variant` so the render layer spawns a distinct hit FX per family
 *  (a sidearm tick must not look like an explosive blast). 0 = generic (enemy
 *  attacks, drops, status ticks). Render-facing contract — values are stable. */
export const enum ImpactProfile {
  Generic = 0,
  Tick = 1, // sidearm: sharp small yellow-white spark
  Stitch = 2, // rotary: rapid small brass chip
  Blast = 3, // explosive/orbital: big ring + heavy dust
  Arc = 4, // energy: angular cyan flash
}

export interface FxEvent {
  kind: FxKind;
  x: number;
  z: number;
  // muzzle: fire dir. impact/blood: incoming travel dir (0 = radial).
  // meteor: dx = fall time (s), dz = blast radius. else 0.
  dx: number;
  dz: number;
  // death/blood: enemy variant. impact: ImpactProfile. else 0.
  variant: number;
}

const MAX_FX = 1024; // backstop; render drains every frame

export class FxQueue {
  readonly events: FxEvent[] = [];

  push(kind: FxKind, x: number, z: number, dx = 0, dz = 0, variant = 0): void {
    if (this.events.length >= MAX_FX) return;
    this.events.push({ kind, x, z, dx, dz, variant });
  }

  clear(): void {
    this.events.length = 0;
  }
}
