// Gravedigger pet view (T-necro). A risen pet uses the SAME silhouette as the enemy
// it was raised from (reusing the enemy-view shape meshes by variant) but in a cold
// SPECTRAL PERIWINKLE with an emissive glow + a small billboarded health bar — so
// you instantly read "that one's mine" from across the arena. Pure view (V2): reads
// the SoA pool, interpolates by alpha (V1), never mutates. §B1 instanced pattern.

import {
  InstancedMesh,
  PlaneGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { MAX_PETS, type PetPool } from '../sim/combat/pets';
import { buildShapes, VARIANT_SHAPE, SHAPE_COUNT } from './enemy-view';
import { COL } from './art/palette';

const FRIEND = COL.petSpectral; // spectral periwinkle — "this risen one fights for you"
const BAR_H = 0.14;
const BG = new Color(0.02, 0.03, 0.02);
const HP_FULL = new Color(0.3, 0.95, 0.55);
const HP_LOW = new Color(0.95, 0.55, 0.12);
const WEDGE = 0; // VARIANT_SHAPE fallback (mite wedge) for unknown variants

export class PetView {
  // One instanced mesh per enemy SHAPE family (same geometry as enemy-view), all
  // tinted friendly-green. Pets route to their mesh by variant, exactly like enemies.
  private meshes: InstancedMesh[] = [];
  private counts = new Int32Array(SHAPE_COUNT);
  private bg: InstancedMesh;
  private fill: InstancedMesh;
  private dummy = new Object3D();
  private right = new Vector3();
  private tmp = new Color();
  private fillColor: InstancedBufferAttribute;

  constructor(scene: Scene, capacity: number = MAX_PETS) {
    const shapes = buildShapes();
    for (let s = 0; s < SHAPE_COUNT; s++) {
      const mat = new MeshStandardMaterial({
        color: FRIEND,
        emissive: FRIEND,
        emissiveIntensity: 0.6,
        roughness: 0.55,
        metalness: 0.1,
        toneMapped: false,
      });
      const mesh = new InstancedMesh(shapes[s]!, mat, capacity);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      this.meshes.push(mesh);
    }

    const barGeo = new PlaneGeometry(1, BAR_H);
    this.bg = new InstancedMesh(
      barGeo,
      new MeshBasicMaterial({ color: BG, toneMapped: false }),
      capacity,
    );
    this.fill = new InstancedMesh(barGeo, new MeshBasicMaterial({ toneMapped: false }), capacity);
    const colorBuf = new Float32Array(capacity * 3).fill(1);
    this.fill.instanceColor = new InstancedBufferAttribute(colorBuf, 3);
    this.fillColor = this.fill.instanceColor;
    for (const m of [this.bg, this.fill]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
    }
    this.bg.renderOrder = 2;
    this.fill.renderOrder = 3;
    scene.add(this.bg);
    scene.add(this.fill);
  }

  sync(pool: PetPool, camera: PerspectiveCamera, alpha: number): void {
    const n = pool.count;
    this.counts.fill(0);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    const q = camera.quaternion;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const s = Math.max(0.5, pool.size[i]!);

      // Body: the enemy's own shape mesh (by variant), scaled to the pet's size
      // (shapes are built to a ~0.5 radius reference, so radius/0.5 fits).
      const shape = VARIANT_SHAPE[pool.variant[i]!] ?? WEDGE;
      const mesh = this.meshes[shape]!;
      const idx = this.counts[shape]!++;
      this.dummy.position.set(x, 0, z);
      this.dummy.rotation.set(0, x * 0.3 + z * 0.2, 0); // slow idle turn
      this.dummy.scale.setScalar(s / 0.5);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(idx, this.dummy.matrix);

      // Health bar above the pet (billboarded), drains from the right.
      const frac = pool.maxHp[i]! > 0 ? Math.max(0, Math.min(1, pool.hp[i]! / pool.maxHp[i]!)) : 0;
      const w = Math.max(0.9, s * 1.7);
      const y = s * 1.9 + 0.7;
      this.dummy.position.set(x, y, z);
      this.dummy.quaternion.copy(q);
      this.dummy.scale.set(w + 0.07, BAR_H + 0.05, 1);
      this.dummy.updateMatrix();
      this.bg.setMatrixAt(i, this.dummy.matrix);

      const fw = w * frac;
      const shift = -(w - fw) / 2;
      this.dummy.position.set(x + this.right.x * shift, y, z + this.right.z * shift);
      this.dummy.quaternion.copy(q);
      this.dummy.scale.set(Math.max(0.001, fw), BAR_H, 1);
      this.dummy.updateMatrix();
      this.fill.setMatrixAt(i, this.dummy.matrix);
      this.fill.setColorAt(i, this.tmp.copy(HP_LOW).lerp(HP_FULL, frac));
    }
    for (let s = 0; s < SHAPE_COUNT; s++) {
      const mesh = this.meshes[s]!;
      mesh.count = this.counts[s]!;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.bg.count = n;
    this.fill.count = n;
    this.bg.instanceMatrix.needsUpdate = true;
    this.fill.instanceMatrix.needsUpdate = true;
    this.fillColor.needsUpdate = true;
  }
}
