// Instanced enemy render view (T12). One InstancedMesh per archetype is overkill
// at this stage; a single instanced capsule with per-instance color covers both
// placeholder variants (V6: one material, no per-enemy mesh). Synced from the
// SoA pool with interpolation (V1/V2 — view only).

import {
  InstancedMesh,
  CapsuleGeometry,
  MeshStandardMaterial,
  Object3D,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type Scene,
} from 'three';
import type { EnemyPool } from '../sim/enemies';
import { EnemyState, MAX_ENEMIES } from '../sim/enemies';
import { COL } from './art/palette';

// Color blocking, not line noise (art doc pillar 1). Rust Mite = rust body,
// Debt Hound = dark iron, Gatekeeper boss = elite magenta. Telegraph = hard sun
// highlight so spawns read. Boss reads via the magenta + its radius scale.
// Mite, Hound, Gatekeeper(boss), Lobber, Marshal, Mortar, Shotgunner, Brute.
const VARIANT_COLORS = [
  COL.oxidizedIron,
  COL.oldRust,
  COL.eliteMagenta,
  COL.toxicGreen,
  COL.brass,
  COL.healthRed,
  COL.kineticGold,
  COL.warmLine,
];
const TELEGRAPH_COLOR = COL.sunHigh;

export class EnemyView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private colorAttr: InstancedBufferAttribute;

  constructor(scene: Scene, capacity: number = MAX_ENEMIES) {
    const geo = new CapsuleGeometry(0.5, 0.6, 4, 8);
    const mat = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;

    const colors = new Float32Array(capacity * 3);
    this.colorAttr = new InstancedBufferAttribute(colors, 3);
    this.colorAttr.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = this.colorAttr;

    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: EnemyPool, alpha: number): void {
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const r = pool.radius[i]!;
      this.dummy.position.set(x, r + 0.3, z);
      this.dummy.scale.setScalar(r / 0.5);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      const c =
        pool.state[i] === EnemyState.Telegraph
          ? TELEGRAPH_COLOR
          : (VARIANT_COLORS[pool.variant[i]!] ?? VARIANT_COLORS[0]!);
      // Status tint (T39): burn → hot ember, chill → cyan. Blend over base color
      // so the effect reads at a glance without a separate material.
      let cr = c.r;
      let cg = c.g;
      let cb = c.b;
      if (pool.burnTime[i]! > 0) {
        cr = cr * 0.4 + 1.0 * 0.6;
        cg = cg * 0.4 + 0.45 * 0.6;
        cb = cb * 0.4;
      } else if (pool.chillTime[i]! > 0) {
        cr = cr * 0.5 + 0.2 * 0.5;
        cg = cg * 0.5 + 0.85 * 0.5;
        cb = cb * 0.5 + 1.0 * 0.5;
      }
      this.colorAttr.setXYZ(i, cr, cg, cb);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}
