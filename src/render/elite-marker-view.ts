// Elite marker (T-elite readability). An elite needs a read that DOESN'T drown in
// the crowd or the green XP crystals — so it floats a bright GOLD STAR above the
// body (billboarded, slow spin + pulse), distinct from any enemy/shard colour. One
// InstancedMesh (V6), pooled + capped (V5), pure view (V2): reads pool.elite only.

import {
  InstancedMesh,
  Shape,
  ShapeGeometry,
  MeshBasicMaterial,
  Object3D,
  DynamicDrawUsage,
  AdditiveBlending,
  type Camera,
  type Scene,
} from 'three';
import type { EnemyPool } from '../sim/enemies';
import { COL } from './art/palette';

const CAP = 512; // elites are a minority of the crowd (bounded, V5)

/** Flat N-point star in the XY plane (billboarded by the view). */
function starGeo(points = 5, outer = 0.3, inner = 0.13): ShapeGeometry {
  const s = new Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return new ShapeGeometry(s);
}

export class EliteMarkerView {
  private mesh: InstancedMesh;
  private dummy = new Object3D();
  private phase = 0;

  constructor(scene: Scene) {
    const mat = new MeshBasicMaterial({
      color: COL.kineticGold, // bright gold — blooms, reads ⊥ green fodder + XP shards
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(starGeo(), mat, CAP);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: EnemyPool, camera: Camera, alpha: number): void {
    this.phase += 0.05;
    let drawn = 0;
    const n = pool.count;
    for (let i = 0; i < n && drawn < CAP; i++) {
      if (!pool.elite[i]) continue;
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const r = pool.radius[i]!;
      const headY = 1.3 * (r / 0.5) + 1.1; // clear above the silhouette + status icons
      const pulse = 0.9 + 0.12 * Math.sin(this.phase * 5 + i);
      this.dummy.position.set(x, headY, z);
      this.dummy.quaternion.copy(camera.quaternion); // billboard
      this.dummy.rotateZ(this.phase * 0.8); // slow spin so it catches the eye
      this.dummy.scale.setScalar((0.9 + r * 0.2) * pulse);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(drawn++, this.dummy.matrix);
    }
    this.mesh.count = drawn;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
