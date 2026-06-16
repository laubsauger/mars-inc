// Weapon-crate drop view (T33). Each pooled drop is an instanced crate that
// bobs and spins so it reads as a pickup on a busy floor. Color encodes the
// weapon family. Pure view of WeaponDropPool (V2); one mesh, one material (V6).

import {
  InstancedMesh,
  BoxGeometry,
  MeshStandardMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type Scene,
} from 'three';
import type { WeaponDropPool } from '../sim/weapon-drops';
import { MAX_WEAPON_DROPS } from '../sim/weapon-drops';
import { WEAPONS } from '../content/weapons/index';
import type { WeaponFamily } from '../sim/combat/weapon';
import { COL } from './art/palette';

const FAMILY_COLOR: Record<WeaponFamily, Color> = {
  sidearm: COL.brass,
  rotary: COL.marsDust,
  explosive: COL.healthRed,
  drone: COL.toxicGreen,
  energy: COL.shieldCyan,
  orbital: COL.kineticGold,
};

export class WeaponDropView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private colorAttr: InstancedBufferAttribute;
  private phase = 0;

  constructor(scene: Scene, capacity: number = MAX_WEAPON_DROPS) {
    const geo = new BoxGeometry(0.7, 0.7, 0.7);
    const mat = new MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 });
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

  sync(pool: WeaponDropPool): void {
    this.phase += 0.05;
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const bob = 0.55 + Math.sin(this.phase + i) * 0.12;
      this.dummy.position.set(pool.posX[i]!, bob, pool.posZ[i]!);
      this.dummy.rotation.set(0, this.phase * 0.8 + i, 0.5);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      const fam = WEAPONS[pool.weapon[i]!]!.family;
      const c = FAMILY_COLOR[fam];
      this.colorAttr.setXYZ(i, c.r, c.g, c.b);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}
