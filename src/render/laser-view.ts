// Player hitscan-beam view (T-laser). Drains 'laser' FX (origin → wall end point)
// into brief, fast-fading bright lances laid flat on the floor. Pure view (V2):
// reads drained FX, never writes sim. One InstancedMesh, pre-created instanceColor
// (WebGPU-safe, §B1 — same flat-additive-quad pattern as the aim line / enemy beam).

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

const CAP = 64; // pooled lances; a multishot laser can fire several per frame
const LIFE = 0.09; // a laser is a near-instant flash, not a lingering beam
const Y = 0.22; // above the floor inlays
const WIDTH = 0.16; // beam thickness (world units)
const COLOR = COL.shieldCyan.clone().multiplyScalar(1.6); // hot cyan, blooms white

export class LaserView {
  private mesh: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();
  private n = 0;
  private ox = new Float32Array(CAP);
  private oz = new Float32Array(CAP);
  private ex = new Float32Array(CAP);
  private ez = new Float32Array(CAP);
  private age = new Float32Array(CAP);

  constructor(scene: Scene) {
    const mat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, CAP);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const buf = new Float32Array(CAP * 3).fill(1);
    this.mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.renderOrder = 4; // over the floor + enemy beams
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** Spawn a lance per 'laser' FX (x,z = origin; dx,dz = absolute END point). */
  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      if (e.kind !== 'laser' || this.n >= CAP) continue;
      const i = this.n++;
      this.ox[i] = e.x;
      this.oz[i] = e.z;
      this.ex[i] = e.dx;
      this.ez[i] = e.dz;
      this.age[i] = 0;
    }
  }

  /** Visit each live lance (origin → end + fade 0..1) so the light accumulator can
   *  splat floor glow along the beam, matching projectiles/grenades. */
  eachActive(cb: (ox: number, oz: number, ex: number, ez: number, fade: number) => void): void {
    for (let i = 0; i < this.n; i++) {
      cb(this.ox[i]!, this.oz[i]!, this.ex[i]!, this.ez[i]!, 1 - this.age[i]! / LIFE);
    }
  }

  update(dt: number): void {
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i]! += dt;
      if (this.age[i]! >= LIFE) {
        const last = --this.n;
        if (i !== last) {
          this.ox[i] = this.ox[last]!;
          this.oz[i] = this.oz[last]!;
          this.ex[i] = this.ex[last]!;
          this.ez[i] = this.ez[last]!;
          this.age[i] = this.age[last]!;
        }
      }
    }
  }

  sync(): void {
    for (let i = 0; i < this.n; i++) {
      const ox = this.ox[i]!;
      const oz = this.oz[i]!;
      const dx = this.ex[i]! - ox;
      const dz = this.ez[i]! - oz;
      const len = Math.hypot(dx, dz) || 1e-3;
      const fade = 1 - this.age[i]! / LIFE;
      this.dummy.position.set(ox + dx * 0.5, Y, oz + dz * 0.5);
      // Flatten + spin so the quad's long axis (X) runs origin → end.
      this.dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(-dz, dx));
      this.dummy.scale.set(len, WIDTH * (0.6 + 0.4 * fade), 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.tmp.copy(COLOR).multiplyScalar(fade));
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
