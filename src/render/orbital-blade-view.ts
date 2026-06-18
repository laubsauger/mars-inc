// Orbital blade view (T-orbit). One instanced layer (V6) of glowing energy blades
// that circle the player — a cold cyan saw-edge so they read as the player's own
// tech (⊥ the warm gold drones, ⊥ the floor's green XP). Synced from the sim
// OrbitalSystem SoA with interpolation (V1/V2); the sim owns position/damage.

import {
  InstancedMesh,
  OctahedronGeometry,
  MeshStandardMaterial,
  Object3D,
  DynamicDrawUsage,
  type Scene,
} from 'three';
import type { OrbitalSystem } from '../sim/combat/orbitals';
import { COL } from './art/palette';

const MAX = 8;
const FLOAT_Y = 1.1; // hover low — they sweep through enemy bodies, not overhead

export class OrbitalBladeView {
  private readonly blade: InstancedMesh;
  private dummy = new Object3D();
  private spin = 0;

  constructor(scene: Scene) {
    // Flattened octahedron → a thin diamond shard that reads as a spinning blade.
    this.blade = new InstancedMesh(
      new OctahedronGeometry(0.55, 0),
      new MeshStandardMaterial({
        color: COL.sentinelSteel,
        emissive: COL.shieldCyan,
        emissiveIntensity: 1.1,
        roughness: 0.25,
        metalness: 0.6,
      }),
      MAX,
    );
    this.blade.instanceMatrix.setUsage(DynamicDrawUsage);
    this.blade.castShadow = true;
    this.blade.frustumCulled = false;
    this.blade.count = 0;
    scene.add(this.blade);
  }

  sync(orbitals: OrbitalSystem, alpha: number, dt: number): void {
    this.spin += dt * 9; // fast axial whirl — reads as a saw, not a floating gem
    const n = orbitals.count;
    for (let i = 0; i < n; i++) {
      const x = orbitals.prevX[i]! + (orbitals.posX[i]! - orbitals.prevX[i]!) * alpha;
      const z = orbitals.prevZ[i]! + (orbitals.posZ[i]! - orbitals.prevZ[i]!) * alpha;
      this.dummy.position.set(x, FLOAT_Y, z);
      // Flatten on Y → a horizontal slicing disc, whirling on its vertical axis.
      this.dummy.rotation.set(0, this.spin + i, 0);
      this.dummy.scale.set(1, 0.32, 1);
      this.dummy.updateMatrix();
      this.blade.setMatrixAt(i, this.dummy.matrix);
    }
    this.blade.count = n;
    this.blade.instanceMatrix.needsUpdate = true;
  }
}
