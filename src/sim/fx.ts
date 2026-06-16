// FX event channel (T16). Sim systems push ephemeral visual/audio cues here;
// the render layer drains them once per frame. Pure sugar — events carry no
// authority and never feed back into sim state (V2). Accumulates across the
// multiple fixed steps that can occur within one rendered frame.

export type FxKind = 'muzzle' | 'impact' | 'death' | 'dmg' | 'chain' | 'blood';

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
  // muzzle: fire dir. impact/blood: incoming travel dir (0 = radial). else 0.
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
