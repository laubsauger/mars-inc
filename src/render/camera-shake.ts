// Camera shake (T36 + §3.1 subtle reactive camera). Pure offset math: combat FX
// add impulse, which decays each frame into a small positional jitter applied on
// top of the framed camera position. Bounded + scaled by the player's screen-shake
// setting (0 = off) so the whole arena stays visible (V7). Deterministic-free —
// render-only, never touches sim.

const MAX_OFFSET = 0.9; // world units; capped so the arena never leaves frame
const DECAY = 7; // trauma units per second

export class CameraShake {
  /** 0..1 accessibility multiplier; 0 disables shake entirely. */
  intensity = 1;
  private trauma = 0;
  private seed = 1;

  /** Add trauma from an event (muzzle small, impact medium, explosion large). */
  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.intensity);
  }

  /** Advance decay and return the current x/z offset to add to the camera. */
  sample(dt: number): { x: number; z: number } {
    if (this.trauma <= 0) return ZERO;
    this.trauma = Math.max(0, this.trauma - DECAY * dt);
    // trauma² gives a punchy falloff; cheap LCG noise avoids Math.random.
    const mag = this.trauma * this.trauma * MAX_OFFSET;
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    const a = (this.seed / 0x7fffffff) * Math.PI * 2;
    return { x: Math.cos(a) * mag, z: Math.sin(a) * mag };
  }

  get active(): boolean {
    return this.trauma > 0;
  }
}

const ZERO = { x: 0, z: 0 };
