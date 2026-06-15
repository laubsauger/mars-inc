// FX event channel (T16). Sim systems push ephemeral visual/audio cues here;
// the render layer drains them once per frame. Pure sugar — events carry no
// authority and never feed back into sim state (V2). Accumulates across the
// multiple fixed steps that can occur within one rendered frame.

export type FxKind = 'muzzle' | 'impact' | 'death';

export interface FxEvent {
  kind: FxKind;
  x: number;
  z: number;
  dx: number; // direction (muzzle); 0 otherwise
  dz: number;
  variant: number; // enemy variant for death tint; 0 otherwise
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
