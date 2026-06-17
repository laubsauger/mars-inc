// Laser-sentinel beam view (T-beam). Draws each beam as a flat ground quad along
// its locked line: during CHARGE a dim red telegraph that THICKENS as it winds up
// (your cue to dodge off the line); on FIRE a brief bright flash across the full
// width. Pure view (V2): reads the sim BeamPool, never writes. One InstancedMesh
// with pre-created instanceColor (WebGPU-safe, §B1 — same pattern as the aim line).

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
import { type BeamPool, BeamState, MAX_BEAMS } from '../sim/enemy-attacks';
import { COL } from './art/palette';

const Y = 0.2; // hovers just over the floor so it reads over inlays
const CHARGE_COL = COL.laserRed; // menacing crimson telegraph (dimmed via the ramp)
const FIRE_COL = COL.laserRed.clone().multiplyScalar(1.7); // hot lethal flash (additive → blooms white)

export class BeamView {
  private mesh: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();

  constructor(scene: Scene) {
    const geo = new PlaneGeometry(1, 1); // unit quad, scaled per beam, laid flat
    const mat = new MeshBasicMaterial({
      color: 0xffffff, // white base; instanceColor carries the red tint + brightness
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false, // a flat floor beam must never be culled by props under the cam
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, MAX_BEAMS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const buf = new Float32Array(MAX_BEAMS * 3).fill(1);
    this.mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.renderOrder = 3; // over the floor + aim lines, under entities
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(beams: BeamPool): void {
    const n = beams.count;
    for (let i = 0; i < n; i++) {
      const firing = beams.state[i] === BeamState.Firing;
      const t = beams.chargeT(i); // 0 → 1 across the charge
      const len = beams.len[i]!;
      const dx = beams.dirX[i]!;
      const dz = beams.dirZ[i]!;
      const ox = beams.ox[i]!;
      const oz = beams.oz[i]!;
      // Width: a thin hairline at charge start that thickens (t²) toward the lethal
      // width; the FIRE flash is the full beam, a touch wider for punch.
      const full = beams.width[i]! * 2; // width is a half-width; *2 = the lethal band
      const w = firing ? full * 1.15 : 0.06 + t * t * full;
      // Brightness ramps with the charge so the tell "charges up"; fire is full.
      const k = firing ? 1 : 0.25 + 0.75 * t;
      const col = firing ? FIRE_COL : CHARGE_COL;
      const mid = len / 2;
      this.dummy.position.set(ox + dx * mid, Y, oz + dz * mid);
      // Flatten (−π/2 about X), spin in-plane (about Z) so the quad's long axis (X)
      // aligns with the beam direction (dx,dz).
      this.dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(-dz, dx));
      this.dummy.scale.set(len, w, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.tmp.copy(col).multiplyScalar(k));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
