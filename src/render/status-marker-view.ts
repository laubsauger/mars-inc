// Status markers (T52 readability). Body tints alone can't show WHICH statuses
// are active (only one shows, and it muddies the silhouette colour). This floats
// a distinct ICON above each affected enemy — one per active status, billboarded
// to the camera, gone the instant the status ends. One InstancedMesh per status
// (distinct shape + colour, V6: one material each, no per-enemy mesh); pooled +
// capped, no per-frame alloc beyond matrix writes (V5). Pure view (V2).

import {
  InstancedMesh,
  ConeGeometry,
  OctahedronGeometry,
  IcosahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  type BufferGeometry,
  type Camera,
  type Scene,
} from 'three';
import type { EnemyPool } from '../sim/enemies';
import { COL } from './art/palette';

const CAP = 768; // per-status marker ceiling (bounded, V5)

// Each status: a readable icon shape + colour. Order = stacking slot order.
interface StatusDef {
  geo: () => BufferGeometry;
  color: Color;
  /** Reads the remaining-time array for this status off the pool. */
  time: (pool: EnemyPool, i: number) => number;
}

const STATUSES: StatusDef[] = [
  // Burn — orange flame.
  {
    geo: () => new ConeGeometry(0.16, 0.34, 6),
    color: new Color(1, 0.42, 0.08),
    time: (p, i) => p.burnTime[i]!,
  },
  // Chill — cyan ice crystal.
  {
    geo: () => new OctahedronGeometry(0.19),
    color: COL.shieldCyan,
    time: (p, i) => p.chillTime[i]!,
  },
  // Shock — violet spark.
  {
    geo: () => new IcosahedronGeometry(0.18, 0),
    color: COL.eliteMagenta,
    time: (p, i) => p.shockTime[i]!,
  },
  // Corrode — acid-green bubble.
  {
    geo: () => new SphereGeometry(0.17, 8, 6),
    color: COL.toxicGreen,
    time: (p, i) => p.corrodeTime[i]!,
  },
  // Bleed — red droplet.
  {
    geo: () => new SphereGeometry(0.16, 8, 6),
    color: new Color(0.85, 0.05, 0.05),
    time: (p, i) => p.bleedTime[i]!,
  },
  // Mark — gold target ring.
  {
    geo: () => new TorusGeometry(0.17, 0.05, 6, 14),
    color: COL.kineticGold,
    time: (p, i) => p.markTime[i]!,
  },
];
const SLOTS = STATUSES.length;
const SPACING = 0.34; // horizontal gap between stacked markers

export class StatusMarkerView {
  private meshes: InstancedMesh[] = [];
  private counts = new Int32Array(SLOTS);
  private dummy = new Object3D();
  private phase = 0;
  private active: number[] = new Array(SLOTS); // scratch: slot indices active this enemy

  constructor(scene: Scene) {
    for (const def of STATUSES) {
      const mat = new MeshBasicMaterial({
        color: def.color,
        toneMapped: false,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new InstancedMesh(def.geo(), mat, CAP);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  sync(pool: EnemyPool, camera: Camera, alpha: number): void {
    this.phase += 0.05;
    this.counts.fill(0);
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      // Gather this enemy's active statuses into the scratch slot list.
      let m = 0;
      for (let s = 0; s < SLOTS; s++) {
        if (STATUSES[s]!.time(pool, i) > 0) this.active[m++] = s;
      }
      if (m === 0) continue;

      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const r = pool.radius[i]!;
      const headY = 1.3 * (r / 0.5) + 0.7; // just above the silhouette
      const size = 0.85 + r * 0.25;

      for (let k = 0; k < m; k++) {
        const slot = this.active[k]!;
        const mesh = this.meshes[slot]!;
        const idx = this.counts[slot]!;
        if (idx >= CAP) continue; // bounded — drop beyond the cap
        // Spread markers horizontally (camera-right) + a tiny per-marker bob.
        const off = (k - (m - 1) / 2) * SPACING * size;
        const bob = Math.sin(this.phase * 4 + i + k) * 0.05;
        this.dummy.position.set(x, headY + bob, z);
        this.dummy.quaternion.copy(camera.quaternion); // billboard
        this.dummy.translateX(off); // offset along the camera's right axis
        this.dummy.scale.setScalar(size);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(idx, this.dummy.matrix);
        this.counts[slot] = idx + 1;
      }
    }

    for (let s = 0; s < SLOTS; s++) {
      const mesh = this.meshes[s]!;
      mesh.count = this.counts[s]!;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
