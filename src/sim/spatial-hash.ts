// Uniform spatial hash for neighbor / area queries (§14.5, V6). 2D on x,z.
// No per-query allocation in the hot path: queryCircle fills a caller-owned
// array. Cells are reused across rebuilds.

export class SpatialHash {
  private readonly invCell: number;
  private cells = new Map<number, number[]>();

  constructor(cellSize: number) {
    this.invCell = 1 / cellSize;
  }

  private key(cx: number, cz: number): number {
    // Pack two 16-bit signed cell coords into one number.
    return ((cx + 32768) << 16) | (cz + 32768);
  }

  clear(): void {
    // Keep the arrays, just empty them — avoids realloc churn (V5).
    for (const arr of this.cells.values()) arr.length = 0;
  }

  insert(id: number, x: number, z: number): void {
    const cx = Math.floor(x * this.invCell);
    const cz = Math.floor(z * this.invCell);
    const k = this.key(cx, cz);
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    arr.push(id);
  }

  /**
   * Append ids whose cells overlap the circle into `out`. Returns count.
   * Broad-phase: may include ids just outside `radius`; caller does the exact
   * distance test. `out` is reused by the caller (no allocation here).
   */
  queryCircle(x: number, z: number, radius: number, out: number[]): number {
    out.length = 0;
    const minCx = Math.floor((x - radius) * this.invCell);
    const maxCx = Math.floor((x + radius) * this.invCell);
    const minCz = Math.floor((z - radius) * this.invCell);
    const maxCz = Math.floor((z + radius) * this.invCell);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const arr = this.cells.get(this.key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) out.push(arr[i]!);
      }
    }
    return out.length;
  }

  /** Occupied-cell count — dev overlay metric. */
  get occupancy(): number {
    let n = 0;
    for (const arr of this.cells.values()) if (arr.length > 0) n++;
    return n;
  }
}
