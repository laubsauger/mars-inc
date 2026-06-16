// Health-drop view (T33+). Each pooled medkit is an instanced 3D RED CROSS that
// bobs + spins — unmistakable against gold weapon crates and cyan/gold XP shards.
// Pure view of HealthDropPool (V2); one mesh, one material (V6). Solid emissive
// red (no texture — WebGPU-safe, §B1).

import {
  InstancedMesh,
  BoxGeometry,
  MeshStandardMaterial,
  Object3D,
  DynamicDrawUsage,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HealthDropPool, MAX_HEALTH_DROPS, HEALTH_TTL, HEALTH_FADE } from '../sim/health-drops';
import { COL } from './art/palette';

/** A fat 3D plus sign (red cross) — three crossed bars read as "medkit". */
function crossGeometry(): BufferGeometry {
  const arm = 0.5;
  const thick = 0.17;
  const h = new BoxGeometry(arm, thick, thick);
  const v = new BoxGeometry(thick, arm, thick);
  return mergeGeometries([h, v], false)!;
}

export class HealthDropView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private phase = 0;

  constructor(scene: Scene, capacity: number = MAX_HEALTH_DROPS) {
    const mat = new MeshStandardMaterial({
      color: COL.healthRed,
      emissive: COL.healthRed,
      emissiveIntensity: 0.6,
      roughness: 0.5,
      metalness: 0.1,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(crossGeometry(), mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: HealthDropPool): void {
    this.phase += 0.05;
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const bob = 0.7 + Math.sin(this.phase * 1.4 + i) * 0.12;
      // Blink faster as it nears decay so its despawn reads.
      const age = pool.age[i]!;
      const left = HEALTH_TTL - age;
      const fade = left < HEALTH_FADE ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(age * 16)) : 1;
      this.dummy.position.set(pool.posX[i]!, bob, pool.posZ[i]!);
      this.dummy.rotation.set(0, this.phase * 1.2 + i, 0);
      this.dummy.scale.setScalar(fade < 1 ? fade : 1); // pulse-shrink while fading
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
