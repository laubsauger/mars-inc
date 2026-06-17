// Instanced projectile view (T14/T37). One InstancedMesh; each bolt is a unit
// sphere STRETCHED along its travel direction + tinted per weapon family, so guns
// read distinctly: a sidearm pellet, a rotary tracer, a fat cannon shell, a long
// cyan energy lance, a heavy orbital slug, a small purple drone bolt. Pre-created
// instanceColor (§B1 — lazy setColorAt is unreliable on the WebGPU backend).

import {
  InstancedMesh,
  SphereGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  AdditiveBlending,
  type Scene,
} from 'three';
import type { ProjectilePool } from '../sim/combat/projectiles';
import { MAX_PROJECTILES } from '../sim/combat/projectiles';
import { COL } from './art/palette';

// Per-style look. Index = weapon family (FAMILY_STYLE in weapon-system):
// 0 sidearm · 1 rotary · 2 explosive · 3 drone · 4 energy · 5 orbital.
// `w` = cross-section scale, `len` = length along travel (stretch).
interface Style {
  color: Color;
  w: number;
  len: number;
}
const STYLES: Style[] = [
  { color: COL.kineticGold.clone().multiplyScalar(1.4), w: 1.0, len: 1.7 }, // sidearm: gold bolt
  { color: COL.sunHigh.clone().multiplyScalar(1.5), w: 0.75, len: 1.5 }, // rotary: thin fast tracer
  { color: new Color(1.0, 0.5, 0.18).multiplyScalar(1.3), w: 1.7, len: 1.3 }, // explosive: fat orange shell
  { color: COL.eliteMagenta.clone().multiplyScalar(1.2), w: 1.0, len: 1.3 }, // drone: small purple
  // energy: electric VIOLET lance. Green kept LOW + brightness trimmed so bloom
  // can't blow the core to a cyan-white — the halo stays clearly purple, distinct
  // from the reserved XP-shard cyan (high green) yet bluer than the drone magenta.
  { color: new Color(0.68, 0.22, 1.0).multiplyScalar(1.2), w: 0.62, len: 3.2 },
  { color: COL.kineticGold.clone().multiplyScalar(1.55), w: 1.5, len: 2.5 }, // orbital: heavy gold slug
];
const FALLBACK = STYLES[0]!;

export class ProjectileView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();

  constructor(scene: Scene, capacity: number = MAX_PROJECTILES) {
    const geo = new SphereGeometry(1, 8, 6);
    const mat = new MeshBasicMaterial({
      color: 0xffffff, // white base — per-instance colour carries the tint
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false, // glowing bolts read as light; never occluded by props
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const buf = new Float32Array(capacity * 3);
    for (let i = 0; i < capacity; i++) {
      buf[i * 3] = FALLBACK.color.r;
      buf[i * 3 + 1] = FALLBACK.color.g;
      buf[i * 3 + 2] = FALLBACK.color.b;
    }
    this.mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: ProjectilePool, alpha: number): void {
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const r = pool.radius[i]!;
      const s = STYLES[pool.style[i]!] ?? FALLBACK;
      // Orient the stretched body along travel (local +z faces the velocity).
      const ang = Math.atan2(pool.velX[i]!, pool.velZ[i]!);
      this.dummy.position.set(x, 0.9, z);
      this.dummy.rotation.set(0, ang, 0);
      this.dummy.scale.set(r * s.w, r * s.w, r * s.len);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, s.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
