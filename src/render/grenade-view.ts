// Player grenade view (T-grenade). Renders the in-flight grenade (a small lobbed
// body that arcs) + a slim RED target reticle on the floor at its predicted impact
// point, so the throw reads before it lands. Pure view (V2), instanced, capped.

import {
  InstancedMesh,
  SphereGeometry,
  RingGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  type Scene,
} from 'three';
import type { GrenadeSystem } from '../sim/combat/grenades';

const CAP = 8;
const RED = new Color(1.0, 0.26, 0.2);

export class GrenadeView {
  private body: InstancedMesh;
  private ring: InstancedMesh;
  private d = new Object3D();

  constructor(scene: Scene) {
    this.body = new InstancedMesh(
      new SphereGeometry(0.2, 8, 6),
      new MeshBasicMaterial({ color: 0xff6a36, depthTest: false, toneMapped: false }),
      CAP,
    );
    this.body.instanceMatrix.setUsage(DynamicDrawUsage);
    this.body.renderOrder = 11;
    this.body.frustumCulled = false;
    this.body.count = 0;
    scene.add(this.body);

    // Slim red reticle laid flat on the floor — the predicted impact zone.
    const rg = new RingGeometry(0.93, 1.0, 44);
    rg.rotateX(-Math.PI / 2);
    this.ring = new InstancedMesh(
      rg,
      new MeshBasicMaterial({
        color: RED,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
      CAP,
    );
    this.ring.instanceMatrix.setUsage(DynamicDrawUsage);
    this.ring.renderOrder = 1; // floor level, above the plate
    this.ring.frustumCulled = false;
    this.ring.count = 0;
    scene.add(this.ring);
  }

  sync(g: GrenadeSystem): void {
    const n = g.count;
    const r = g.blastRadius;
    for (let i = 0; i < n; i++) {
      this.d.position.set(g.posX[i]!, g.posY[i]!, g.posZ[i]!);
      this.d.scale.setScalar(1);
      this.d.updateMatrix();
      this.body.setMatrixAt(i, this.d.matrix);

      this.d.position.set(g.tgtX[i]!, 0.05, g.tgtZ[i]!);
      this.d.scale.set(r, 1, r);
      this.d.updateMatrix();
      this.ring.setMatrixAt(i, this.d.matrix);
    }
    this.body.count = n;
    this.ring.count = n;
    this.body.instanceMatrix.needsUpdate = true;
    this.ring.instanceMatrix.needsUpdate = true;
  }
}
