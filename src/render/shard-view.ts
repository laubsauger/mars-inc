// Instanced XP shard view (T17). Cyan/gold crystals, must read separately from
// gold projectiles (art doc) — use shield cyan. Pure view (V1/V2).

import {
  InstancedMesh,
  OctahedronGeometry,
  MeshBasicMaterial,
  Object3D,
  DynamicDrawUsage,
  type Scene,
} from 'three';
import type { ShardPool } from '../sim/xp';
import { MAX_SHARDS } from '../sim/xp';
import { COL } from './art/palette';

export class ShardView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private spin = 0;

  constructor(scene: Scene, capacity: number = MAX_SHARDS) {
    const geo = new OctahedronGeometry(0.28);
    // Narrow the horizontal axes + stretch the vertical → an elongated crystal
    // shard instead of a fat square box (keeps the height, slims the footprint so
    // a field of them reads cleaner among the enemies).
    geo.scale(0.6, 1.35, 0.6);
    // Pushed brighter (HDR) so XP shards keep their glow under the lowered global
    // bloom strength (arena calmed, pickups left reading as before).
    const mat = new MeshBasicMaterial({
      // Emerald XP green (palette token) — leans blue-green so it reads as a pickup,
      // distinct from the yellow-green toxic enemies AND the old cyan it shared with
      // bolts. Pushed brighter (HDR) so it keeps its glow under the calmed bloom.
      color: COL.xpGreen.clone().multiplyScalar(1.35),
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: ShardPool, alpha: number): void {
    this.spin += 0.05;
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      this.dummy.position.set(x, 0.5, z);
      this.dummy.rotation.set(0, this.spin, 0.4);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
