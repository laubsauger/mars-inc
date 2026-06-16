// Ground-hazard telegraph view (T33). Renders each cooking-off blast zone as a
// semi-transparent ring on the floor whose inner disc FILLS and whose color
// reddens as the fuse runs down — a readable "get out" warning before the AoE.
// Two instanced meshes (one material each, V6); a pure view of HazardPool (V2).

import {
  InstancedMesh,
  RingGeometry,
  CircleGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  DoubleSide,
  type Scene,
} from 'three';
import type { HazardPool } from '../sim/enemy-attacks';
import { MAX_HAZARDS } from '../sim/enemy-attacks';
import { COL } from './art/palette';

const CALM = COL.marsDust; // far from detonation
const DANGER = COL.healthRed; // about to blow

export class HazardView {
  private readonly ring: InstancedMesh;
  private readonly fill: InstancedMesh;
  private readonly ringColor: InstancedBufferAttribute;
  private readonly fillColor: InstancedBufferAttribute;
  private dummy = new Object3D();
  private c = new Color();

  constructor(scene: Scene, capacity: number = MAX_HAZARDS) {
    // Unit-radius ring + disc, laid flat on the floor (rotate onto XZ).
    const ringGeo = new RingGeometry(0.86, 1.0, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const fillGeo = new CircleGeometry(1, 40);
    fillGeo.rotateX(-Math.PI / 2);

    this.ring = new InstancedMesh(
      ringGeo,
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: DoubleSide,
      }),
      capacity,
    );
    this.fill = new InstancedMesh(
      fillGeo,
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: DoubleSide,
      }),
      capacity,
    );
    for (const m of [this.ring, this.fill]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.renderOrder = 1; // over the floor, under projectiles
      m.count = 0;
      scene.add(m);
    }
    this.ringColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.fillColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.ringColor.setUsage(DynamicDrawUsage);
    this.fillColor.setUsage(DynamicDrawUsage);
    this.ring.instanceColor = this.ringColor;
    this.fill.instanceColor = this.fillColor;
  }

  sync(pool: HazardPool): void {
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const x = pool.posX[i]!;
      const z = pool.posZ[i]!;
      const radius = pool.radius[i]!;
      // urgency 0 → 1 as the fuse cooks off.
      const urgency =
        1 - Math.max(0, Math.min(1, pool.fuse[i]! / Math.max(1e-3, pool.fuseTotal[i]!)));

      this.dummy.position.set(x, 0.05, z);
      this.dummy.scale.setScalar(radius);
      this.dummy.updateMatrix();
      this.ring.setMatrixAt(i, this.dummy.matrix);

      // Inner disc fills outward as detonation nears.
      this.dummy.scale.setScalar(radius * urgency);
      this.dummy.updateMatrix();
      this.fill.setMatrixAt(i, this.dummy.matrix);

      this.c.copy(CALM).lerp(DANGER, urgency);
      this.ringColor.setXYZ(i, this.c.r, this.c.g, this.c.b);
      this.fillColor.setXYZ(i, this.c.r, this.c.g, this.c.b);
    }
    this.ring.count = n;
    this.fill.count = n;
    this.ring.instanceMatrix.needsUpdate = true;
    this.fill.instanceMatrix.needsUpdate = true;
    this.ringColor.needsUpdate = true;
    this.fillColor.needsUpdate = true;
  }
}
