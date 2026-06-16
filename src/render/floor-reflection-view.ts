// Fake floor reflections (render polish). The arena floor is dark, so a soft
// ADDITIVE disc laid flat under a bright thing reads convincingly as its glow
// reflecting off a glossy floor — no real lights, no extra passes, just one
// instanced additive layer (cheap fill; §B1 solid-geometry + instanceColor).
//
// Two sources:
//   • Projectiles — a moving gold glint tracks under every live bolt (per frame).
//   • Bright FX (impact / blast / death / muzzle) — a fading flash pooled from the
//     sim FX queue, so explosions bloom a big reflection that fades.
// Pure view (V2): reads sim pools + drained FX, never mutates. Capped (V5).

import {
  InstancedMesh,
  CircleGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  AdditiveBlending,
  type Scene,
} from 'three';
import type { ProjectilePool } from '../sim/combat/projectiles';
import type { FxEvent } from '../sim/fx';
import { ImpactProfile } from '../sim/fx';
import { COL } from './art/palette';

const Y = 0.05; // hugs the floor, under entities
const FX_CAP = 220; // pooled fading flashes (impact/blast/death/muzzle)
const PROJ_CAP = 700; // reflections drawn for live projectiles (cosmetic cap)
const CAP = FX_CAP + PROJ_CAP;

const GOLD = COL.kineticGold;
const WARM = COL.sunHigh;
// Dim warm for explosive blasts — keeps the floor glow from flashing to white.
const BLAST_WARM = new Color(0.4, 0.2, 0.08);

export class FloorReflectionView {
  private mesh: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();
  // Fading-flash SoA.
  private n = 0;
  private px = new Float32Array(FX_CAP);
  private pz = new Float32Array(FX_CAP);
  private s0 = new Float32Array(FX_CAP);
  private s1 = new Float32Array(FX_CAP);
  private life = new Float32Array(FX_CAP);
  private age = new Float32Array(FX_CAP);
  private r = new Float32Array(FX_CAP);
  private g = new Float32Array(FX_CAP);
  private b = new Float32Array(FX_CAP);

  constructor(scene: Scene) {
    const geo = new CircleGeometry(1, 18);
    const mat = new MeshBasicMaterial({
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      // depthTest OFF: a flat floor glint must never be culled by a gate plate /
      // prop under the angled camera (the recurring "renders below the plate" bug).
      // Trades the subtle grounded-occlusion for always-visible — the right call.
      depthTest: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, CAP);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const buf = new Float32Array(CAP * 3).fill(1);
    this.mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0; // floor level, beneath entities
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** Drain bright FX into fading floor flashes. */
  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      if (e.kind === 'impact') {
        // Only an EXPLOSION lights the floor — normal hits dropped a disc per bullet,
        // which read as the "extra ring" on every shot. Sparks leave no floor glow.
        if (e.variant === ImpactProfile.Blast) this.flash(e.x, e.z, 0.7, 2.2, 0.22, BLAST_WARM);
      } else if (e.kind === 'death') {
        // Only BIGGER enemies (radius in dx) light the floor — a swarm of small mites
        // dying constantly would strobe it. Scaled to the body, brief + dim.
        const sz = e.dx;
        if (sz > 0.6) this.flash(e.x, e.z, 0.6 * sz, 1.1 * sz, 0.16, WARM);
      } else if (e.kind === 'muzzle') {
        this.flash(e.x, e.z, 1.0, 0.5, 0.08, GOLD);
      }
    }
  }

  private flash(x: number, z: number, s0: number, s1: number, life: number, color: Color): void {
    if (this.n >= FX_CAP) return; // pool full — drop (cosmetic, V5)
    const i = this.n++;
    this.px[i] = x;
    this.pz[i] = z;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.life[i] = life;
    this.age[i] = 0;
    this.r[i] = color.r;
    this.g[i] = color.g;
    this.b[i] = color.b;
  }

  update(dt: number): void {
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i]! += dt;
      if (this.age[i]! >= this.life[i]!) {
        const last = --this.n;
        if (i !== last) {
          this.px[i] = this.px[last]!;
          this.pz[i] = this.pz[last]!;
          this.s0[i] = this.s0[last]!;
          this.s1[i] = this.s1[last]!;
          this.life[i] = this.life[last]!;
          this.age[i] = this.age[last]!;
          this.r[i] = this.r[last]!;
          this.g[i] = this.g[last]!;
          this.b[i] = this.b[last]!;
        }
      }
    }
  }

  /** Build the instance buffer: only the brief, event-driven fading flashes now.
   *  The per-projectile glint was removed — a flat additive CircleGeometry reads as
   *  a hard SOLID DISC dragging under every bolt (not a soft glow), which looked
   *  worse than no reflection. `projectiles`/`alpha` are kept for signature
   *  compatibility with the render loop. */
  sync(_projectiles: ProjectilePool, _alpha: number): void {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i]! / this.life[i]!;
      const fade = 1 - t;
      const s = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t;
      this.writeDisc(
        w++,
        this.px[i]!,
        this.pz[i]!,
        s,
        this.r[i]! * fade,
        this.g[i]! * fade,
        this.b[i]! * fade,
      );
    }
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private writeDisc(
    i: number,
    x: number,
    z: number,
    s: number,
    r: number,
    g: number,
    b: number,
  ): void {
    this.dummy.position.set(x, Y, z);
    this.dummy.rotation.set(-Math.PI / 2, 0, 0); // flat on the floor
    this.dummy.scale.set(s, s, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.setColorAt(i, this.tmp.setRGB(r, g, b));
  }
}
