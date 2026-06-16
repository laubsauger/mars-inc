// Corpse view (T65). One InstancedMesh of low-poly gibs for the overkill corpses
// — a dark dried-gore body that tints warmer the more overkill energy it holds,
// so a fat, about-to-blow corpse reads as dangerous. Pure view (V2): reads the
// sim pool, interpolates by alpha (V1), never mutates. Solid geometry +
// pre-created instanceColor (§B1 WebGPU pattern).

import {
  InstancedMesh,
  IcosahedronGeometry,
  MeshStandardMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type Scene,
} from 'three';
import type { CorpsePool } from '../sim/combat/corpses';

const BODY = new Color(0x7a3320); // dried gore — lifted off near-black so it reads on the dark floor
const HOT = new Color(0xff6a2a); // overkill energy bleeding through

export class CorpseView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();

  constructor(scene: Scene, capacity = 256) {
    const geo = new IcosahedronGeometry(0.5, 0); // chunky gib
    // Emissive so a corpse glows faintly on the dark arena (and brighter as it
    // loads with overkill via setColorAt below) — otherwise dark gore on a dark
    // floor is invisible. toneMapped off keeps the emissive punchy under bloom.
    const mat = new MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0.1,
      emissive: new Color(0xff5a2a),
      emissiveIntensity: 0.9,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const buf = new Float32Array(capacity * 3).fill(1);
    this.mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: CorpsePool, alpha: number): void {
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const s = Math.max(0.6, pool.size[i]! * 1.1); // a touch bigger so it reads
      this.dummy.position.set(x, s * 0.45, z);
      this.dummy.rotation.set(0.4, pool.variant[i]! * 1.3 + i * 0.7, 0);
      this.dummy.scale.set(s, s * 0.6, s); // squashed onto the floor
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      // Warmer the more overkill it holds → reads as "loaded". Lower threshold so
      // even a modest overkill corpse glows enough to spot.
      const heat = Math.min(1, pool.stored[i]! / 90);
      this.mesh.setColorAt(i, this.tmp.copy(BODY).lerp(HOT, 0.35 + heat * 0.5));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
