// Enemy projectile view (T33). The lobbed grenade in flight — an instanced orb
// that follows a visual arc (height is render-only, never sim — V4). One mesh,
// one material (V6); a pure view of the enemy projectile pool (V2).

import {
  InstancedMesh,
  SphereGeometry,
  MeshStandardMaterial,
  Object3D,
  DynamicDrawUsage,
  type Scene,
} from 'three';
import type { EnemyProjectilePool } from '../sim/enemy-attacks';
import { MAX_ENEMY_PROJECTILES } from '../sim/enemy-attacks';
import { COL } from './art/palette';

export class EnemyProjectileView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();

  constructor(scene: Scene, capacity: number = MAX_ENEMY_PROJECTILES) {
    // Enemy fire reads as a hostile magenta — clearly NOT the player's gold
    // tracers, and not the red of a ground hazard.
    const geo = new SphereGeometry(0.28, 8, 6);
    const mat = new MeshStandardMaterial({
      color: COL.eliteMagenta,
      emissive: COL.eliteMagenta,
      emissiveIntensity: 0.7,
      roughness: 0.5,
      metalness: 0.1,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: EnemyProjectilePool, alpha: number): void {
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      this.dummy.position.set(x, 0.4 + pool.height(i, alpha), z);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
