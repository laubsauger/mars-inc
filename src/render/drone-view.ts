// Companion drone view (T40/T42). Instanced — one mesh, no per-drone material
// (V6). Reads the sim DroneSystem SoA with interpolation (V1/V2). Small glowing
// gyro that floats above the player and spins; the bloom pass gives it a halo.

import {
  InstancedMesh,
  OctahedronGeometry,
  MeshStandardMaterial,
  Object3D,
  DynamicDrawUsage,
  type Scene,
} from 'three';
import type { DroneSystem } from '../sim/combat/drones';
import { COL } from './art/palette';

const MAX = 16;
const FLOAT_Y = 1.5;

export class DroneView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private spin = 0;

  constructor(scene: Scene) {
    const geo = new OctahedronGeometry(0.32, 0);
    const mat = new MeshStandardMaterial({
      color: COL.shieldCyan,
      emissive: COL.shieldCyan,
      emissiveIntensity: 0.9,
      roughness: 0.4,
      metalness: 0.3,
    });
    this.mesh = new InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(drones: DroneSystem, alpha: number, dt: number): void {
    this.spin += dt * 6;
    const n = drones.count;
    for (let i = 0; i < n; i++) {
      const x = drones.prevX[i]! + (drones.posX[i]! - drones.prevX[i]!) * alpha;
      const z = drones.prevZ[i]! + (drones.posZ[i]! - drones.prevZ[i]!) * alpha;
      this.dummy.position.set(x, FLOAT_Y, z);
      this.dummy.rotation.set(this.spin * 0.5, this.spin, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
