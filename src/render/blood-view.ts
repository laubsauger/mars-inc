// Blood / ichor FX (T37, art doc "Commercial Blood Sport" + Effects Plan).
// Biological hits throw pooled directional droplets that arc, fall, and LAND as
// directional floor decals (teardrop streaks, not blobs). Mechanical enemies
// spray nothing — their death dust covers it. Pure view (V2): driven by sim FX
// events, never feeds back. Pooled + hard-capped, no per-frame alloc (V5/V6).
//
// WebGPU note (§B1): solid geometry + a pre-created instanceColor, like the other
// instanced views — textured/lazy-color paths don't bind under the backend here.

import {
  InstancedMesh,
  SphereGeometry,
  CircleGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type Scene,
} from 'three';
import { ENEMY_BY_VARIANT } from '../sim/enemies';
import type { FxEvent } from '../sim/fx';
import { COL } from './art/palette';

const MAX_DROPLETS = 1024;
const MAX_DECALS = 256;
const GRAVITY = 22; // droplet fall accel (world u/s²)
const FLOOR_Y = 0.04; // decal rests just above the floor inlays
// Decals dry + sink into the arena shadow over their life, then recycle.
const DECAL_LIFE = 7;
const DECAL_TARGET = COL.umberShadow;

// Arterial red + toxic ichor green — darker than the bright HUD accents so blood
// reads as matter on the floor, not a glow.
const BLOOD = new Color(0.46, 0.02, 0.02);
// Dark olive ichor — pulled away from the bright green/cyan of the XP shards so
// it reads as gore on the floor, not a pickup.
const ICHOR = new Color(0.2, 0.34, 0.04);

function goreColor(variant: number): Color | null {
  const g = ENEMY_BY_VARIANT[variant]?.gore;
  return g === 'blood' ? BLOOD : g === 'ichor' ? ICHOR : null;
}

// Gore volume scales with enemy size: tier-1 fodder (r≈0.65) bleeds a small
// spritz, the brute/boss (r≥1.4) gush. Normalized around the Debt Hound (r≈0.82)
// and clamped so nothing vanishes or floods the screen.
function goreScale(variant: number): number {
  const r = ENEMY_BY_VARIANT[variant]?.radius ?? 0.8;
  return Math.max(0.55, Math.min(2.2, r / 0.82));
}

// Cheap render-local randomness (V2 — visual only, never touches sim/determinism).
let _seed = 0x9e3779b9;
function rnd(): number {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 0xffffffff;
}

export class BloodView {
  reduceFlash = false;

  private dropMesh: InstancedMesh;
  private decalMesh: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();

  // Droplet SoA.
  private dCount = 0;
  private px = new Float32Array(MAX_DROPLETS);
  private py = new Float32Array(MAX_DROPLETS);
  private pz = new Float32Array(MAX_DROPLETS);
  private vx = new Float32Array(MAX_DROPLETS);
  private vy = new Float32Array(MAX_DROPLETS);
  private vz = new Float32Array(MAX_DROPLETS);
  private dr = new Float32Array(MAX_DROPLETS);
  private dg = new Float32Array(MAX_DROPLETS);
  private db = new Float32Array(MAX_DROPLETS);
  private dsize = new Float32Array(MAX_DROPLETS);

  // Decal SoA (ring buffer — oldest overwritten past the cap).
  private cCount = 0;
  private cHead = 0;
  private cx = new Float32Array(MAX_DECALS);
  private cz = new Float32Array(MAX_DECALS);
  private cAge = new Float32Array(MAX_DECALS);
  private cRot = new Float32Array(MAX_DECALS);
  private cLen = new Float32Array(MAX_DECALS);
  private cWid = new Float32Array(MAX_DECALS);
  private cr = new Float32Array(MAX_DECALS);
  private cg = new Float32Array(MAX_DECALS);
  private cb = new Float32Array(MAX_DECALS);

  constructor(scene: Scene) {
    this.dropMesh = makeInstanced(scene, new SphereGeometry(0.12, 6, 5), MAX_DROPLETS);
    this.decalMesh = makeInstanced(scene, new CircleGeometry(0.5, 12), MAX_DECALS);
  }

  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      if (e.kind === 'blood') {
        const c = goreColor(e.variant);
        // Vary count + energy per hit so no two splats look identical.
        if (c) {
          const sz = goreScale(e.variant);
          this.spray(
            e.x,
            e.z,
            e.dx,
            e.dz,
            c,
            Math.max(2, Math.round((this.reduceFlash ? 3 : 4 + ((rnd() * 6) | 0)) * sz)),
            0.8 + rnd() * 0.7,
            sz,
          );
        }
      } else if (e.kind === 'death') {
        const c = goreColor(e.variant);
        // Death gush: radial, more matter (no incoming direction → burst outward).
        if (c) {
          const sz = goreScale(e.variant);
          this.spray(
            e.x,
            e.z,
            0,
            0,
            c,
            Math.max(3, Math.round((this.reduceFlash ? 6 : 9 + ((rnd() * 8) | 0)) * sz)),
            1.2 + rnd() * 0.7,
            sz,
          );
        }
      }
    }
  }

  /** Throw `n` droplets from (x,z) biased along (dirX,dirZ); radial if dir≈0. */
  private spray(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    color: Color,
    n: number,
    force: number,
    sizeMul = 1,
  ): void {
    const hasDir = dirX * dirX + dirZ * dirZ > 1e-4;
    const base = hasDir ? Math.atan2(dirZ, dirX) : 0;
    for (let k = 0; k < n; k++) {
      if (this.dCount >= MAX_DROPLETS) break;
      // Cone around the travel dir (away from the hit face); full circle on death.
      const ang = hasDir ? base + (rnd() - 0.5) * 1.5 : rnd() * Math.PI * 2;
      const sp = (3 + rnd() * 6) * force;
      const i = this.dCount++;
      this.px[i] = x;
      this.py[i] = 0.7 + rnd() * 0.4; // body height
      this.pz[i] = z;
      this.vx[i] = Math.cos(ang) * sp;
      this.vy[i] = (2.4 + rnd() * 3.4) * force;
      this.vz[i] = Math.sin(ang) * sp;
      this.dr[i] = color.r;
      this.dg[i] = color.g;
      this.db[i] = color.b;
      // Droplet size scales with the enemy (small fodder bleeds small, T39).
      this.dsize[i] = (0.45 + rnd() * 1.15) * sizeMul;
    }
  }

  private landDecal(
    x: number,
    z: number,
    vx: number,
    vz: number,
    r: number,
    g: number,
    b: number,
  ): void {
    const speed = Math.hypot(vx, vz);
    const i = this.cHead;
    this.cHead = (this.cHead + 1) % MAX_DECALS;
    if (this.cCount < MAX_DECALS) this.cCount++;
    this.cx[i] = x;
    this.cz[i] = z;
    this.cAge[i] = 0;
    this.cRot[i] = speed > 0.1 ? Math.atan2(vz, vx) : rnd() * Math.PI * 2;
    this.cLen[i] = 0.45 + Math.min(1.4, speed * 0.07); // faster splat → longer streak
    this.cWid[i] = 0.3 + rnd() * 0.12;
    this.cr[i] = r;
    this.cg[i] = g;
    this.cb[i] = b;
  }

  update(dt: number): void {
    // Droplets: integrate + fall; on landing, convert to a directional decal.
    for (let i = this.dCount - 1; i >= 0; i--) {
      this.vy[i]! -= GRAVITY * dt;
      this.px[i]! += this.vx[i]! * dt;
      this.py[i]! += this.vy[i]! * dt;
      this.pz[i]! += this.vz[i]! * dt;
      if (this.py[i]! <= FLOOR_Y) {
        this.landDecal(
          this.px[i]!,
          this.pz[i]!,
          this.vx[i]!,
          this.vz[i]!,
          this.dr[i]!,
          this.dg[i]!,
          this.db[i]!,
        );
        const last = --this.dCount;
        if (i !== last) this.moveDroplet(last, i);
        continue;
      }
      this.dummy.position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      this.dummy.scale.setScalar(this.dsize[i]!);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.dropMesh.setMatrixAt(i, this.dummy.matrix);
      this.dropMesh.setColorAt(i, this.tmp.setRGB(this.dr[i]!, this.dg[i]!, this.db[i]!));
    }
    this.dropMesh.count = this.dCount;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    if (this.dropMesh.instanceColor) this.dropMesh.instanceColor.needsUpdate = true;

    // Decals: age, dry toward the floor shadow, lie flat + elongated along travel.
    for (let i = 0; i < this.cCount; i++) {
      this.cAge[i]! += dt;
      const t = Math.min(1, this.cAge[i]! / DECAL_LIFE);
      const ease = t * t; // hold fresh, sink late
      this.dummy.position.set(this.cx[i]!, FLOOR_Y, this.cz[i]!);
      this.dummy.rotation.set(-Math.PI / 2, this.cRot[i]!, 0);
      this.dummy.scale.set(this.cLen[i]!, this.cWid[i]!, 1);
      this.dummy.updateMatrix();
      this.decalMesh.setMatrixAt(i, this.dummy.matrix);
      this.decalMesh.setColorAt(
        i,
        this.tmp.setRGB(
          this.cr[i]! + (DECAL_TARGET.r - this.cr[i]!) * ease,
          this.cg[i]! + (DECAL_TARGET.g - this.cg[i]!) * ease,
          this.cb[i]! + (DECAL_TARGET.b - this.cb[i]!) * ease,
        ),
      );
    }
    this.decalMesh.count = this.cCount;
    this.decalMesh.instanceMatrix.needsUpdate = true;
    if (this.decalMesh.instanceColor) this.decalMesh.instanceColor.needsUpdate = true;
  }

  private moveDroplet(from: number, to: number): void {
    this.px[to] = this.px[from]!;
    this.py[to] = this.py[from]!;
    this.pz[to] = this.pz[from]!;
    this.vx[to] = this.vx[from]!;
    this.vy[to] = this.vy[from]!;
    this.vz[to] = this.vz[from]!;
    this.dr[to] = this.dr[from]!;
    this.dg[to] = this.dg[from]!;
    this.db[to] = this.db[from]!;
    this.dsize[to] = this.dsize[from]!;
  }

  get count(): number {
    return this.dCount + this.cCount;
  }
}

function makeInstanced(scene: Scene, geo: THREE_GEO, capacity: number): InstancedMesh {
  // Non-additive: blood is opaque matter, not a glow. Flat-shaded basic material.
  const mat = new MeshBasicMaterial({ toneMapped: false });
  const mesh = new InstancedMesh(geo, mat, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const buf = new Float32Array(capacity * 3).fill(1);
  mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
  mesh.instanceColor.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

type THREE_GEO = SphereGeometry | CircleGeometry;
