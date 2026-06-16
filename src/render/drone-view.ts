// Companion drone view (T40/T42). Two instanced layers (V6): a dark metal CORE
// and a spinning glowing GOLD RING (a scanning gyro). Deliberately WARM + detailed
// so it never reads like the cool cyan XP shards on the floor. Synced from the sim
// DroneSystem SoA with interpolation (V1/V2).

import {
  InstancedMesh,
  IcosahedronGeometry,
  TorusGeometry,
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
  private readonly core: InstancedMesh;
  private readonly ring: InstancedMesh;
  private dummy = new Object3D();
  private spin = 0;

  constructor(scene: Scene) {
    // Faceted gunmetal body — clearly a machine, not a gem.
    this.core = new InstancedMesh(
      new IcosahedronGeometry(0.24, 0),
      new MeshStandardMaterial({
        color: COL.oxidizedIron,
        emissive: COL.healthRed,
        emissiveIntensity: 0.25, // faint red "eye" glow
        roughness: 0.5,
        metalness: 0.7,
      }),
      MAX,
    );
    // Glowing gold scanner ring orbiting the core (spins on its own axis).
    this.ring = new InstancedMesh(
      new TorusGeometry(0.38, 0.05, 8, 20),
      new MeshStandardMaterial({
        color: COL.kineticGold,
        emissive: COL.kineticGold,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.4,
      }),
      MAX,
    );
    for (const m of [this.core, this.ring]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
  }

  sync(drones: DroneSystem, alpha: number, dt: number): void {
    this.spin += dt * 4;
    const n = drones.count;
    for (let i = 0; i < n; i++) {
      const x = drones.prevX[i]! + (drones.posX[i]! - drones.prevX[i]!) * alpha;
      const z = drones.prevZ[i]! + (drones.posZ[i]! - drones.prevZ[i]!) * alpha;

      // Core: slow tumble.
      this.dummy.position.set(x, FLOAT_Y, z);
      this.dummy.rotation.set(this.spin * 0.4, this.spin * 0.6, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.core.setMatrixAt(i, this.dummy.matrix);

      // Ring: tilted, spinning faster on a different axis — reads as scanning.
      this.dummy.rotation.set(Math.PI / 2.6, this.spin + i, 0);
      this.dummy.updateMatrix();
      this.ring.setMatrixAt(i, this.dummy.matrix);
    }
    this.core.count = n;
    this.ring.count = n;
    this.core.instanceMatrix.needsUpdate = true;
    this.ring.instanceMatrix.needsUpdate = true;
  }
}
