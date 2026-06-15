// Instanced projectile view (T14). One InstancedMesh, emissive plasma look.
// Synced from the pool with interpolation (V1/V2). Muzzle/impact FX → T16.

import {
  InstancedMesh,
  SphereGeometry,
  MeshBasicMaterial,
  Object3D,
  DynamicDrawUsage,
  AdditiveBlending,
  type Scene,
} from 'three';
import type { ProjectilePool } from '../sim/combat/projectiles';
import { MAX_PROJECTILES } from '../sim/combat/projectiles';
import { COL } from './art/palette';

export class ProjectileView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();

  constructor(scene: Scene, capacity: number = MAX_PROJECTILES) {
    const geo = new SphereGeometry(1, 8, 6);
    const mat = new MeshBasicMaterial({
      color: COL.kineticGold,
      blending: AdditiveBlending,
      depthWrite: false,
      // Glowing plasma bolts read as light, not solid geometry — don't let the
      // raised gate plates (or any opaque prop) occlude them. Draw on top.
      depthTest: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.renderOrder = 10; // after opaque scene, with the additive overlay
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: ProjectilePool, alpha: number): void {
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      this.dummy.position.set(x, 0.9, z);
      this.dummy.scale.setScalar(pool.radius[i]!);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
