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

const CHUNKS = 5; // gib chunks drawn per corpse → reads as a torn-apart body
// Fixed local offsets (unit-ish) for the chunks in a corpse's clutch + per-chunk
// scale/tilt. Precomputed so sync() does no trig/alloc per frame (V6). A pile,
// slightly flattened on Y so it hugs the floor.
const OFF: { x: number; y: number; z: number; s: number; rx: number; ry: number }[] = [
  { x: 0.0, y: 0.05, z: 0.0, s: 1.0, rx: 0.3, ry: 0.0 },
  { x: 0.55, y: 0.0, z: 0.2, s: 0.74, rx: 0.9, ry: 1.1 },
  { x: -0.45, y: 0.0, z: 0.4, s: 0.7, rx: 1.4, ry: 2.3 },
  { x: 0.2, y: 0.0, z: -0.55, s: 0.66, rx: 0.6, ry: 3.0 },
  { x: -0.3, y: 0.0, z: -0.3, s: 0.6, rx: 1.9, ry: 4.2 },
];

export class CorpseView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();

  constructor(scene: Scene, capacity = 256) {
    // Same faceted chunk as a loose gib (IcosahedronGeometry detail 0), just sized
    // up per corpse — so a stored body is unmistakably "a pile of the same gibs".
    const geo = new IcosahedronGeometry(0.5, 0);
    // Emissive so the dark gore reads on the dark floor and glows hotter as it
    // loads with overkill (setColorAt below); toneMapped off keeps it punchy.
    const mat = new MeshStandardMaterial({
      roughness: 0.88,
      metalness: 0.08,
      emissive: new Color(0xff5a2a),
      emissiveIntensity: 0.85,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity * CHUNKS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const buf = new Float32Array(capacity * CHUNKS * 3).fill(1);
    this.mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: CorpsePool, alpha: number): void {
    const n = pool.count;
    let inst = 0;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const s = Math.max(0.7, pool.size[i]! * 1.1); // clutch radius tracks the body
      // Warmer the more overkill it holds → reads as "loaded / dangerous".
      const heat = Math.min(1, pool.stored[i]! / 90);
      this.tmp.copy(BODY).lerp(HOT, 0.35 + heat * 0.5);
      // A little phase off the slot index so neighbouring corpses don't share a pose.
      const phase = i * 0.7;
      for (let k = 0; k < CHUNKS; k++) {
        const o = OFF[k]!;
        const cs = s * o.s;
        this.dummy.position.set(x + o.x * s, cs * 0.42 + o.y, z + o.z * s);
        this.dummy.rotation.set(o.rx, o.ry + phase, 0);
        this.dummy.scale.set(cs, cs * 0.7, cs); // squashed onto the floor
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(inst, this.dummy.matrix);
        this.mesh.setColorAt(inst, this.tmp);
        inst++;
      }
    }
    this.mesh.count = inst;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
