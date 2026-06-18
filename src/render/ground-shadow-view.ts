// Grounding shadows for the crowd (T37 contact-shadow). The key light is nearly
// overhead, so real shadow-map shadows fall directly under small enemies and read
// as nothing at the top-down angle — the crowd looks floaty. A cheap dark disc
// under each enemy gives a definite "planted on the floor" contact read. One
// instanced mesh (V6), pure view of the pool (V2), no per-frame alloc (V5).

import {
  InstancedMesh,
  CircleGeometry,
  MeshBasicMaterial,
  Object3D,
  DynamicDrawUsage,
  type Scene,
} from 'three';
import type { EnemyPool } from '../sim/enemies';
import { MAX_ENEMIES } from '../sim/enemies';
import { variantWidthMul } from './enemy-view';

export class GroundShadowView {
  private readonly mesh: InstancedMesh;
  private dummy = new Object3D();

  constructor(scene: Scene, capacity: number = MAX_ENEMIES) {
    const geo = new CircleGeometry(1, 20);
    geo.rotateX(-Math.PI / 2); // flat on the floor
    this.mesh = new InstancedMesh(
      geo,
      new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.33, // soft darkening, not a hard black blob
        depthWrite: false,
        toneMapped: false,
      }),
      capacity,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1; // over the floor, under the enemy/prop meshes
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: EnemyPool, alpha: number): void {
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      this.dummy.position.set(x, 0.03, z);
      // Match the disc to the RENDERED body width (radius × the variant's visual width
      // mul) so an enlarged enemy keeps a proportional contact shadow, not a tiny one.
      this.dummy.scale.setScalar(pool.radius[i]! * 1.15 * variantWidthMul(pool.variant[i]!));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
