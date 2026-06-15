// Seeded deterministic RNG (mulberry32). V16: same seed → same sim outcome.
// ⊥ Math.random in sim — all sim randomness flows through one Rng instance.

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Force to uint32. Seed 0 allowed; mulberry32 handles it.
    this.state = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Snapshot raw state — for save/replay. */
  snapshot(): number {
    return this.state;
  }

  /** Restore raw state. */
  restore(state: number): void {
    this.state = state >>> 0;
  }
}
