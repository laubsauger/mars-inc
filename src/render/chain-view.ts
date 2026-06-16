// Chain-lightning arcs (T33 readability). Without a visible bolt, chained damage
// is invisible — numbers just pop on far enemies. This draws a short-lived jagged
// arc from the struck enemy to each chained one, as additive cyan line segments
// (one mesh, pooled, V6). Pure view: consumes 'chain' FX events (V2).

import {
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  AdditiveBlending,
  type Scene,
} from 'three';
import type { FxEvent } from '../sim/fx';
import { COL } from './art/palette';

const MAX_BOLTS = 64;
const SEGS = 5; // jag subdivisions per bolt
const TTL = 0.13; // brief flicker → reads as electricity
const Y = 0.85; // enemy mid-height
const JAG = 0.7; // max perpendicular jag offset

export class ChainView {
  readonly mesh: LineSegments;
  private fromX = new Float32Array(MAX_BOLTS);
  private fromZ = new Float32Array(MAX_BOLTS);
  private toX = new Float32Array(MAX_BOLTS);
  private toZ = new Float32Array(MAX_BOLTS);
  private age = new Float32Array(MAX_BOLTS);
  private count = 0;
  private pos: Float32Array;
  private attr: Float32BufferAttribute;

  constructor(scene: Scene) {
    this.pos = new Float32Array(MAX_BOLTS * SEGS * 2 * 3);
    const geo = new BufferGeometry();
    this.attr = new Float32BufferAttribute(this.pos, 3);
    this.attr.setUsage(35048); // DynamicDraw
    geo.setAttribute('position', this.attr);
    const mat = new LineBasicMaterial({
      color: COL.shieldCyan,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    scene.add(this.mesh);
  }

  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      if (e.kind !== 'chain' || this.count >= MAX_BOLTS) continue;
      const i = this.count++;
      this.fromX[i] = e.x;
      this.fromZ[i] = e.z;
      this.toX[i] = e.dx;
      this.toZ[i] = e.dz;
      this.age[i] = 0;
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
      }
    }
  }

  /** Rebuild the jagged line geometry for the active bolts. */
  sync(): void {
    let v = 0;
    for (let i = 0; i < this.count; i++) {
      const ax = this.fromX[i]!;
      const az = this.fromZ[i]!;
      const bx = this.toX[i]!;
      const bz = this.toZ[i]!;
      // Perpendicular (normalized) for the jag offset.
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      let prevX = ax;
      let prevY = Y;
      let prevZ = az;
      for (let s = 1; s <= SEGS; s++) {
        const t = s / SEGS;
        const end = s === SEGS;
        // Jag fades to 0 at both ends so the bolt connects cleanly.
        const taper = Math.sin(t * Math.PI);
        const off = end ? 0 : (Math.random() - 0.5) * 2 * JAG * taper;
        const nx = ax + dx * t + px * off;
        const nz = az + dz * t + pz * off;
        const ny = Y + (end ? 0 : (Math.random() - 0.5) * 0.4 * taper);
        this.pos[v++] = prevX;
        this.pos[v++] = prevY;
        this.pos[v++] = prevZ;
        this.pos[v++] = nx;
        this.pos[v++] = ny;
        this.pos[v++] = nz;
        prevX = nx;
        prevY = ny;
        prevZ = nz;
      }
    }
    this.mesh.geometry.setDrawRange(0, this.count * SEGS * 2);
    this.attr.needsUpdate = true;
  }
}
