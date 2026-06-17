// Corpse view (T65). A sim corpse (overkill body in CorpseSystem) is the physical
// pile of GIBS — so we draw each corpse as a small clutch of low-poly gib chunks,
// not an abstract blob. A LAUNCHED corpse (Body Ballistics) therefore reads as the
// gibs themselves hurtling at the enemy; a fat, about-to-blow body glows warmer the
// more overkill it holds. Pure view (V2): reads the sim pool, interpolates by alpha
// (V1), never mutates. Matches GibView's chunk look so loose gibs and stored corpse
// gibs are visibly the same matter. Solid geo + pre-created instanceColor (§B1).

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
    // ONE faceted lump per corpse (was a 5-chunk clutch that stamped the same pose
    // on every body → a repetitive red-blob cluster). A single squashed gib-shaped
    // chunk reads cleanly as "a torn body on the floor", matching GibView's look.
    const geo = new IcosahedronGeometry(0.6, 0);
    // Emissive so the dark gore reads on the dark floor and glows hotter as it
    // loads with overkill (setColorAt below); toneMapped off keeps it punchy.
    const mat = new MeshStandardMaterial({
      roughness: 0.88,
      metalness: 0.08,
      emissive: new Color(0xff5a2a),
      emissiveIntensity: 0.7,
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
      const s = Math.max(0.7, pool.size[i]! * 1.05); // lump size tracks the body
      // Warmer the more overkill it holds → reads as "loaded / dangerous".
      const heat = Math.min(1, pool.stored[i]! / 90);
      this.tmp.copy(BODY).lerp(HOT, 0.3 + heat * 0.45);
      // Per-corpse yaw variety (derived from position) so they don't all face the
      // same way — no per-frame alloc/trig beyond this one rotation set (V6).
      this.dummy.position.set(x, s * 0.4, z);
      this.dummy.rotation.set(0.4, x * 0.7 + z * 0.5, 0.2);
      this.dummy.scale.set(s, s * 0.62, s); // squashed onto the floor
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.tmp);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
