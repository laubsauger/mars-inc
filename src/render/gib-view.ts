// Gibs — flung body chunks (T65 juice, art doc "Commercial Blood Sport"). A kill
// throws a few low-poly meat lumps that arc out, tumble, LAND on the floor, settle,
// then dry + shrink away. Sibling to the blood spray (blood-view) but SOLID matter
// instead of decals: lit mesh chunks, dark gore colour. Pure view (V2): driven by
// sim FX events, never feeds back; pooled + hard-capped, no per-frame alloc (V5/V6).
//
// Tie-in with the corpse mechanic (sim CorpseSystem): every kill gibs cosmetically,
// and an overkill-corpse detonation ('corpseblast') bursts a bigger gout of chunks
// so "recycling a body" visibly throws the body apart.
//
// WebGPU note (§B1): solid geometry + a pre-created instanceColor, matching the
// corpse / enemy instanced views — lazy setColorAt / textured paths don't bind here.

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
import { ENEMY_BY_VARIANT } from '../sim/enemies';
import type { FxEvent } from '../sim/fx';

const MAX_GIBS = 512; // hard cap (V5); oldest recycle via the ring buffer
const GRAVITY = 26; // chunk fall accel (world u/s²) — a touch heavier than blood
const FLOOR_Y = 0.05; // rest height reference (above the floor inlays)
const AIR_DRAG = 7; // horizontal speed shed per second while airborne
const SETTLE_LIFE = 7.5; // s a grounded chunk lingers before it dries away
const FADE_FRAC = 0.32; // last fraction of life spent shrinking out

// Dark dried-gore reds / olive — matter on the floor, NOT a glow (no emissive).
// Pulled darker than the blood decal so a wet chunk reads as a solid lump.
const BLOOD = new Color(0.5, 0.05, 0.05);
const ICHOR = new Color(0.22, 0.34, 0.06);
const SCRAP = new Color(0.26, 0.25, 0.28); // mechanical enemies shed dark metal bits

function gibColor(variant: number): Color {
  const g = ENEMY_BY_VARIANT[variant]?.gore;
  return g === 'blood' ? BLOOD : g === 'ichor' ? ICHOR : SCRAP;
}

// Chunk volume scales with the enemy radius (mirrors blood-view's goreScale): a
// fodder mite sheds tiny flecks, a brute throws fat lumps. Clamped both ends.
function gibScale(variant: number): number {
  const r = ENEMY_BY_VARIANT[variant]?.radius ?? 0.8;
  return Math.max(0.4, Math.min(2.4, r / 0.85));
}

let _seed = 0x9e3779b9 >>> 0;
function rnd(): number {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 0xffffffff;
}

export class GibView {
  /** Accessibility: thins the chunk count (matches the blood/FX reduceFlash). */
  reduceFlash = false;

  private mesh: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();

  // SoA pool (ring buffer).
  private px = new Float32Array(MAX_GIBS);
  private py = new Float32Array(MAX_GIBS);
  private pz = new Float32Array(MAX_GIBS);
  private vx = new Float32Array(MAX_GIBS);
  private vy = new Float32Array(MAX_GIBS);
  private vz = new Float32Array(MAX_GIBS);
  private rx = new Float32Array(MAX_GIBS);
  private ry = new Float32Array(MAX_GIBS);
  private rz = new Float32Array(MAX_GIBS);
  private spinX = new Float32Array(MAX_GIBS);
  private spinY = new Float32Array(MAX_GIBS);
  private spinZ = new Float32Array(MAX_GIBS);
  private size = new Float32Array(MAX_GIBS);
  private restY = new Float32Array(MAX_GIBS);
  private age = new Float32Array(MAX_GIBS);
  private life = new Float32Array(MAX_GIBS);
  private grounded = new Uint8Array(MAX_GIBS);
  private r = new Float32Array(MAX_GIBS);
  private g = new Float32Array(MAX_GIBS);
  private b = new Float32Array(MAX_GIBS);
  private head = 0;
  private count = 0;

  constructor(scene: Scene, capacity = MAX_GIBS) {
    // Sharp, faceted lump (detail 0 = 20 flat faces) → reads as a torn chunk, not
    // a ball. Lit standard material (matter, not additive); instanceColor tints it.
    // Low emissive so the dark-gore chunks READ on the dark floor (corpse-view hit
    // the same problem — pure dark gore is invisible) without glowing like a pickup;
    // emissive is per-material, so the lump's red glow is constant across instances.
    const geo = new IcosahedronGeometry(0.26, 0);
    const mat = new MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0.05,
      emissive: new Color(0x3a0805),
      emissiveIntensity: 0.6,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const buf = new Float32Array(capacity * 3).fill(1);
    this.mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }

  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      // 'death': enemy radius rides in dx, variant in `variant` (see weapon-system).
      if (e.kind === 'death') {
        this.burst(e.x, e.z, gibColor(e.variant), gibScale(e.variant), 1);
      } else if (e.kind === 'corpseblast') {
        // Overkill recycling blows the stored body apart — a bigger, faster gout.
        // The event carries no variant, so use a generic gore lump set.
        this.burst(e.x, e.z, BLOOD, 1.5, 1.7);
      }
    }
  }

  /** Throw a clutch of chunks from (x,z). `intensity` scales count/speed (corpse
   *  detonations punch harder). Random split: usually a few small lumps, sometimes
   *  one fat chunk — so the gore amount visibly varies kill to kill. */
  private burst(x: number, z: number, color: Color, sizeMul: number, intensity: number): void {
    // One big lump (~30%) vs a scatter of small ones, count nudged by enemy size.
    const oneBig = rnd() < 0.3;
    let n = oneBig ? 1 : Math.max(2, Math.round((2 + rnd() * 2 + (sizeMul - 1)) * intensity));
    if (this.reduceFlash) n = Math.max(1, Math.round(n * 0.5));
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX_GIBS;
      if (this.count < MAX_GIBS) this.count++;
      // Big-lump rolls a chunky single; scatter rolls smaller, varied bits.
      const chunk = oneBig ? 1.5 + rnd() * 0.6 : 0.55 + rnd() * rnd() * 1.1;
      const s = chunk * sizeMul;
      const ang = rnd() * Math.PI * 2;
      const sp = (3 + rnd() * 5) * intensity; // outward fling, drag pulls it down near the body
      this.px[i] = x;
      this.py[i] = 0.6 + rnd() * 0.5 + Math.max(0, sizeMul - 1) * 0.6; // exit near body mass
      this.pz[i] = z;
      this.vx[i] = Math.cos(ang) * sp;
      this.vy[i] = (3.5 + rnd() * 4.5) * intensity; // pops up before arcing down
      this.vz[i] = Math.sin(ang) * sp;
      this.rx[i] = rnd() * Math.PI * 2;
      this.ry[i] = rnd() * Math.PI * 2;
      this.rz[i] = rnd() * Math.PI * 2;
      this.spinX[i] = (rnd() - 0.5) * 16;
      this.spinY[i] = (rnd() - 0.5) * 16;
      this.spinZ[i] = (rnd() - 0.5) * 16;
      this.size[i] = s;
      this.restY[i] = FLOOR_Y + s * 0.12; // sit the lump ON the floor, not sunk in
      this.age[i] = 0;
      // Stagger life a little so a clutch doesn't vanish in lockstep.
      this.life[i] = SETTLE_LIFE * (0.8 + rnd() * 0.5);
      this.grounded[i] = 0;
      this.r[i] = color.r;
      this.g[i] = color.g;
      this.b[i] = color.b;
    }
  }

  update(dt: number): void {
    const drag = Math.max(0, 1 - AIR_DRAG * dt);
    let live = 0;
    for (let i = 0; i < this.count; i++) {
      this.age[i]! += dt;
      const t = this.age[i]! / this.life[i]!;
      if (t >= 1) {
        this.size[i] = 0; // expired — collapse it (ring buffer reuses the slot)
        continue;
      }
      if (!this.grounded[i]) {
        this.vy[i]! -= GRAVITY * dt;
        this.vx[i]! *= drag;
        this.vz[i]! *= drag;
        this.px[i]! += this.vx[i]! * dt;
        this.py[i]! += this.vy[i]! * dt;
        this.pz[i]! += this.vz[i]! * dt;
        this.rx[i]! += this.spinX[i]! * dt;
        this.ry[i]! += this.spinY[i]! * dt;
        this.rz[i]! += this.spinZ[i]! * dt;
        if (this.py[i]! <= this.restY[i]!) {
          // Land: settle on the floor, kill motion + tumble, flatten to rest pose.
          this.py[i] = this.restY[i]!;
          this.grounded[i] = 1;
          this.vx[i] = this.vy[i] = this.vz[i] = 0;
          this.spinX[i] = this.spinY[i] = this.spinZ[i] = 0;
          this.rx[i] = Math.PI / 2; // lie the facet flattish against the ground
        }
      }
      // Hold full size until the fade window, then shrink out (dries/sinks away).
      let scale = this.size[i]!;
      if (t > 1 - FADE_FRAC) scale *= (1 - t) / FADE_FRAC;
      this.dummy.position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      this.dummy.rotation.set(this.rx[i]!, this.ry[i]!, this.rz[i]!);
      this.dummy.scale.setScalar(Math.max(0.0001, scale));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(live, this.dummy.matrix);
      // Dim slightly as it dries so it recedes into the floor before it pops out.
      const dim = t > 1 - FADE_FRAC ? 0.6 + 0.4 * ((1 - t) / FADE_FRAC) : 1;
      this.mesh.setColorAt(
        live,
        this.tmp.setRGB(this.r[i]! * dim, this.g[i]! * dim, this.b[i]! * dim),
      );
      live++;
    }
    this.mesh.count = live;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
