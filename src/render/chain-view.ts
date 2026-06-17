// Chain-lightning arcs (T33 readability). Without a visible bolt, chained damage is
// invisible — numbers just pop on far enemies. This draws a short-lived JAGGED bolt
// from the struck enemy to each chained one. Built as flat additive QUAD segments in
// one InstancedMesh (WebGPU-safe, §B1: LineSegments / LineBasicMaterial don't render
// under the WebGPU backend — they collapse, which is why the old line bolt was
// invisible). Pure view (V2): consumes 'chain' FX events.

import {
  InstancedMesh,
  PlaneGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  AdditiveBlending,
  type Scene,
} from 'three';
import type { FxEvent } from '../sim/fx';
import { COL } from './art/palette';

const MAX_BOLTS = 64;
const SEGS = 4; // few subdivisions → a clean CONNECTING line with a slight kink
const CAP = MAX_BOLTS * SEGS; // quad instances
const TTL = 0.18; // hold a touch longer so the link between targets registers
const Y = 0.85; // enemy mid-height
const JAG = 0.28; // small jag — reads as a taut arc, not chaotic forks
const WIDTH = 0.12; // bolt thickness
const COLOR = COL.shieldCyan.clone().multiplyScalar(1.8); // hot cyan, blooms white

// Deterministic-ish per-segment jitter without Math.random in the hot path (render
// only, but keep it cheap + stable per bolt). Hash of (boltSeed, segment).
function jag(seed: number, s: number): number {
  const h = Math.sin(seed * 12.9898 + s * 78.233) * 43758.5453;
  return (h - Math.floor(h) - 0.5) * 2; // −1..1
}

export class ChainView {
  private mesh: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();
  private fromX = new Float32Array(MAX_BOLTS);
  private fromZ = new Float32Array(MAX_BOLTS);
  private toX = new Float32Array(MAX_BOLTS);
  private toZ = new Float32Array(MAX_BOLTS);
  private age = new Float32Array(MAX_BOLTS);
  private seed = new Float32Array(MAX_BOLTS); // per-bolt jag seed (stable while alive)
  private count = 0;
  private nextSeed = 1;

  constructor(scene: Scene) {
    const mat = new MeshBasicMaterial({
      color: 0xffffff, // instanceColor carries the cyan tint + fade
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false, // a bolt between bodies must not be clipped by them
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, CAP);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const buf = new Float32Array(CAP * 3).fill(1);
    this.mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      if (e.kind !== 'chain' || this.count >= MAX_BOLTS) continue;
      const i = this.count++;
      this.fromX[i] = e.x;
      this.fromZ[i] = e.z;
      this.toX[i] = e.dx; // 'chain' carries the END point in dx,dz (absolute)
      this.toZ[i] = e.dz;
      this.age[i] = 0;
      this.seed[i] = this.nextSeed++;
    }
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i]! += dt;
      if (this.age[i]! >= TTL) {
        const last = --this.count;
        this.fromX[i] = this.fromX[last]!;
        this.fromZ[i] = this.fromZ[last]!;
        this.toX[i] = this.toX[last]!;
        this.toZ[i] = this.toZ[last]!;
        this.age[i] = this.age[last]!;
        this.seed[i] = this.seed[last]!;
      }
    }
  }

  sync(): void {
    let inst = 0;
    for (let i = 0; i < this.count; i++) {
      const ax = this.fromX[i]!;
      const az = this.fromZ[i]!;
      const bx = this.toX[i]!;
      const bz = this.toZ[i]!;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz; // perpendicular (in the ground plane) for the jag
      const pz = ux;
      const fade = 1 - this.age[i]! / TTL;
      // Bright core that flickers as it dies → electricity.
      const flick = 0.7 + 0.3 * (jag(this.seed[i]!, 99) * 0.5 + 0.5);
      this.tmp.copy(COLOR).multiplyScalar(fade * flick);
      let prevX = ax;
      let prevZ = az;
      for (let s = 1; s <= SEGS; s++) {
        const t = s / SEGS;
        const end = s === SEGS;
        const taper = Math.sin(t * Math.PI); // jag fades to 0 at both ends → clean joins
        const off = end ? 0 : jag(this.seed[i]!, s) * JAG * taper;
        const nx = ax + dx * t + px * off;
        const nz = az + dz * t + pz * off;
        // Quad segment prev → n, flat on a plane at Y, long axis along the segment.
        const sdx = nx - prevX;
        const sdz = nz - prevZ;
        const slen = Math.hypot(sdx, sdz) || 1e-3;
        this.dummy.position.set((prevX + nx) / 2, Y, (prevZ + nz) / 2);
        this.dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(-sdz, sdx));
        this.dummy.scale.set(slen, WIDTH, 1);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(inst, this.dummy.matrix);
        this.mesh.setColorAt(inst, this.tmp);
        inst++;
        prevX = nx;
        prevZ = nz;
      }
    }
    this.mesh.count = inst;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
