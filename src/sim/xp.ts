// XP shard pool (T17). SoA, pooled, swap-remove (V5). Shards drop on kill, drift
// to the player inside magnet range, and are collected within pickup range.

export const MAX_SHARDS = 4000;

export const enum ShardState {
  Loose = 0,
  Magnet = 1,
}

export class ShardPool {
  readonly capacity: number;
  count = 0;

  readonly posX: Float32Array;
  readonly posZ: Float32Array;
  readonly prevX: Float32Array;
  readonly prevZ: Float32Array;
  readonly value: Float32Array;
  readonly state: Uint8Array;

  constructor(capacity: number = MAX_SHARDS) {
    this.capacity = capacity;
    this.posX = new Float32Array(capacity);
    this.posZ = new Float32Array(capacity);
    this.prevX = new Float32Array(capacity);
    this.prevZ = new Float32Array(capacity);
    this.value = new Float32Array(capacity);
    this.state = new Uint8Array(capacity);
  }

  spawn(x: number, z: number, value: number): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.posX[i] = x;
    this.posZ[i] = z;
    this.prevX[i] = x;
    this.prevZ[i] = z;
    this.value[i] = value;
    this.state[i] = ShardState.Loose;
    return i;
  }

  kill(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.posX[i] = this.posX[last]!;
      this.posZ[i] = this.posZ[last]!;
      this.prevX[i] = this.prevX[last]!;
      this.prevZ[i] = this.prevZ[last]!;
      this.value[i] = this.value[last]!;
      this.state[i] = this.state[last]!;
    }
  }
}
