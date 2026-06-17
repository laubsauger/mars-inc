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

/** Like {@link radialPush}, but the push direction is BIASED toward a forward
 *  vector (fwdX,fwdZ unit) — conceptually a grenade-LAUNCHER with downrange punch.
 *  Each enemy's outward radial dir is blended with `fwd*bias` then renormalized, so
 *  near-side enemies get shoved DOWNRANGE instead of straight back at the thrower.
 *  `bias` 0 = pure radial; ~0.6 = strong forward lean. Magnitude stays `force`
 *  (outward only — use radialPush for the Vacuum Charge pull). Returns count. */
export function directionalPush(
  pool: EnemyPool,
  hash: SpatialHash,
  cx: number,
  cz: number,
  radius: number,
  force: number,
  fwdX: number,
  fwdZ: number,
  bias: number,
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
    // Blend the radial unit with the forward bias, then renormalize so the impulse
    // magnitude stays `force` regardless of how aligned the two are.
    let bx = dx * inv + fwdX * bias;
    let bz = dz * inv + fwdZ * bias;
    // Degenerate (enemy dead-centre, radial≈0) → fall back to pure forward.
    const bl = Math.hypot(bx, bz);
    if (bl > 1e-3) {
      bx /= bl;
      bz /= bl;
    } else {
      bx = fwdX;
      bz = fwdZ;
    }
    pool.kbX[i]! += bx * force;
    pool.kbZ[i]! += bz * force;
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
