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
    const mat = new MeshBasicMaterial({ color: COL.shieldCyan, toneMapped: false });
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
