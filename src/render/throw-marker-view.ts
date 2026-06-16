// In-flight throwable impact markers (T33). The moment a grenade/lob is in the
// air, a FAINT ring shows where it will land — so you can read the danger before
// the hazard telegraph (HazardView) takes over on touchdown. Pure view of the
// enemy projectile pool (V2); one instanced ring mesh (V6). Works for any lobbed
// throwable (enemy or, later, player).

import {
  InstancedMesh,
  RingGeometry,
  MeshBasicMaterial,
  Object3D,
  DynamicDrawUsage,
  DoubleSide,
  type Scene,
} from 'three';
import type { EnemyProjectilePool } from '../sim/enemy-attacks';
import { MAX_ENEMY_PROJECTILES } from '../sim/enemy-attacks';
import { COL } from './art/palette';

const LOB_KIND = 0; // ProjKind.Lob (the gun kind is a flat tracer, no ground ring)

export class ThrowMarkerView {
  private readonly mesh: InstancedMesh;
  private dummy = new Object3D();

  constructor(scene: Scene, capacity: number = MAX_ENEMY_PROJECTILES) {
    const geo = new RingGeometry(0.9, 1.0, 36);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new InstancedMesh(
      geo,
      new MeshBasicMaterial({
        color: COL.healthRed,
        transparent: true,
        opacity: 0.22, // faint preview; the landed hazard ring is the loud one
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
      capacity,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1; // over the floor, under projectiles
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: EnemyProjectilePool): void {
    let n = 0;
    for (let i = 0; i < pool.count; i++) {
      if (pool.kind[i] !== LOB_KIND) continue;
      // Lobs have constant horizontal velocity, so the landing point is just
      // start + vel · flightTime; the blast radius is the ring size.
      const lx = pool.startX[i]! + pool.velX[i]! * pool.flightTime[i]!;
      const lz = pool.startZ[i]! + pool.velZ[i]! * pool.flightTime[i]!;
      this.dummy.position.set(lx, 0.04, lz);
      this.dummy.scale.setScalar(pool.blastRadius[i]!);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
