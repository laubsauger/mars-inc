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
// Per BeamStyle colour set [loading tint, fire flash]. Index = beam.style[i] so each
// telegraphed-danger source reads distinctly while sharing the charge/lock/fire logic.
const CHARGE_COLS = [COL.laserRed, COL.chargeAmber]; // [Sentinel crimson, Charge amber]
const FIRE_COLS = [
  COL.laserRed.clone().multiplyScalar(1.7),
  COL.chargeAmber.clone().multiplyScalar(1.6),
];

export class BeamView {
  private mesh: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();
  private phase = 0; // drives the charge pulse / lock strobe

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
    this.phase += 0.05;
    const n = beams.count;
    for (let i = 0; i < n; i++) {
      const firing = beams.state[i] === BeamState.Firing;
      const t = beams.chargeT(i); // 0 → 1 across the charge
      const len = beams.len[i]!;
      const dx = beams.dirX[i]!;
      const dz = beams.dirZ[i]!;
      const ox = beams.ox[i]!;
      const oz = beams.oz[i]!;
      // Three readable states so "loading" vs "about to hurt" is obvious:
      //  • LOADING  (dim CHARGE red, thin, grows to ~55% width, pulse speeds up)
      //  • LOCK     (final ~18%: snaps bright FIRE red + full width + fast strobe →
      //             the unmistakable "it's firing NOW" tell, your cue to be off the line)
      //  • FIRING   (full bright solid lethal beam)
      const full = beams.width[i]! * 2; // width is a half-width; *2 = the lethal band
      const LOCK = 0.82; // chargeT past which it's locked + about to fire
      const s = beams.style[i]!; // per-source colour set
      const chargeCol = CHARGE_COLS[s] ?? CHARGE_COLS[0]!;
      const fireCol = FIRE_COLS[s] ?? FIRE_COLS[0]!;
      let w: number;
      let k: number;
      let col: Color;
      if (firing) {
        w = full * 1.15;
        k = 1;
        col = fireCol;
      } else if (t < LOCK) {
        const u = t / LOCK; // 0..1 through the loading phase
        w = 0.06 + u * u * full * 0.55; // clearly thinner than the lethal beam
        const pulseHz = 7 + 16 * u; // beats faster as it nears the lock
        k = (0.22 + 0.33 * u) * (0.7 + 0.3 * Math.sin(this.phase * pulseHz + i));
        col = chargeCol; // dim warning = "just aiming, no damage yet"
      } else {
        const v = (t - LOCK) / (1 - LOCK); // 0..1 across the lock window
        w = full * (0.6 + 0.45 * v); // snap toward full width
        k = (0.85 + 0.45 * v) * (0.7 + 0.3 * Math.sin(this.phase * 40 + i)); // bright strobe
        col = fireCol; // bright = "ARMED" — shares the firing colour so it reads as live
      }
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
