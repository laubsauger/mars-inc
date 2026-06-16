// Crowd-control knockback (T42). Impulses are written into the enemy pool's
// kbX/kbZ (decayed each step in the enemy system), so a shove reads as a punch
// that pushes through blobs. Pure functions over the SoA — deterministic (V16),
// no per-frame alloc (V5).

import type { EnemyPool } from '../enemies';
import type { SpatialHash } from '../spatial-hash';

const _ids: number[] = [];

/** Push every enemy within `radius` of (cx,cz) radially outward. Returns count. */
export function radialPush(
  pool: EnemyPool,
  hash: SpatialHash,
  cx: number,
  cz: number,
  radius: number,
  force: number,
): number {
  const n = hash.queryCircle(cx, cz, radius, _ids);
  const r2 = radius * radius;
  let pushed = 0;
  for (let k = 0; k < n; k++) {
    const i = _ids[k]!;
    const dx = pool.posX[i]! - cx;
    const dz = pool.posZ[i]! - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2);
    const inv = d > 1e-3 ? 1 / d : 0;
    pool.kbX[i]! += dx * inv * force;
    pool.kbZ[i]! += dz * inv * force;
    pushed++;
  }
  return pushed;
}

/** Knock one enemy away from a source point (on-hit concussion). */
export function knockbackFrom(
  pool: EnemyPool,
  i: number,
  sx: number,
  sz: number,
  force: number,
): void {
  const dx = pool.posX[i]! - sx;
  const dz = pool.posZ[i]! - sz;
  const d = Math.hypot(dx, dz);
  const inv = d > 1e-3 ? 1 / d : 0;
  pool.kbX[i]! += dx * inv * force;
  pool.kbZ[i]! += dz * inv * force;
}
