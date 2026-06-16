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
const MAX_PLAYER_GORE = 96; // splotches stuck on the player (accumulate, ring buffer)
const COAT_RANGE = 4.4; // blood from a kill within this of the player coats them
const PLAYER_GORE_LIFE = 38; // s — lingers WAY longer than floor decals so it builds up
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
  // Biased so tier-1 fodder stays modest (was gushing); brutes/boss still erupt.
  return Math.max(0.45, Math.min(2.2, r / 0.95));
}

// Irregular blob disc (one-time) so decals read as PUDDLES, not perfect ellipses.
// Rim radius wobbles with a few periodic harmonics → a lobed, closed outline;
// per-decal random rotation + non-uniform scale then make each one look distinct
// (instanced, so they all share this shape — rotation/scale break the repeat).
function makeBlobGeometry(): CircleGeometry {
  const g = new CircleGeometry(0.5, 14);
  const pos = g.attributes.position!;
  for (let i = 1; i < pos.count; i++) {
    const x = pos.getX(i)!;
    const y = pos.getY(i)!;
    const ang = Math.atan2(y, x); // periodic → first & last rim vertex stay equal
    const f =
      1 +
      0.22 * Math.sin(ang * 3 + 0.6) +
      0.13 * Math.sin(ang * 5 - 1.1) +
      0.08 * Math.sin(ang * 8);
    pos.setXY(i, x * f, y * f);
  }
  pos.needsUpdate = true;
  return g;
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

  // Player gore SoA (local to the player group). Positions are body-local; the
  // mesh is parented to the player group so it tracks movement for free.
  private player: { pos: { x: number; z: number } } | null = null;
  private pgMesh: InstancedMesh | null = null;
  private pgHead = 0;
  private pgCount = 0;
  private pgX = new Float32Array(MAX_PLAYER_GORE);
  private pgY = new Float32Array(MAX_PLAYER_GORE);
  private pgZ = new Float32Array(MAX_PLAYER_GORE);
  private pgSize = new Float32Array(MAX_PLAYER_GORE);
  private pgAge = new Float32Array(MAX_PLAYER_GORE);
  private pgLife = new Float32Array(MAX_PLAYER_GORE);
  private pgr = new Float32Array(MAX_PLAYER_GORE);
  private pgg = new Float32Array(MAX_PLAYER_GORE);
  private pgb = new Float32Array(MAX_PLAYER_GORE);

  constructor(scene: Scene) {
    this.dropMesh = makeInstanced(scene, new SphereGeometry(0.12, 6, 5), MAX_DROPLETS);
    this.decalMesh = makeInstanced(scene, makeBlobGeometry(), MAX_DECALS);
  }

  /** Attach the accumulating body-gore layer (T39 fun): blood from kills near the
   *  player STICKS and lingers ~10× longer than floor decals — a long fight leaves
   *  you drenched. Parented to the player group so it follows them. */
  setPlayer(group: Object3D, player: { pos: { x: number; z: number } }): void {
    this.player = player;
    this.pgMesh = makeInstanced(group, new SphereGeometry(0.17, 6, 5), MAX_PLAYER_GORE);
    this.pgMesh.renderOrder = 1; // over the body so it reads
  }

  /** Splatter blood onto the player when a kill/hit happens close by. */
  private coatPlayer(x: number, z: number, color: Color, sizeMul: number): void {
    const p = this.player;
    if (!p || !this.pgMesh) return;
    const dx = p.pos.x - x;
    const dz = p.pos.z - z;
    const dist = Math.hypot(dx, dz);
    if (dist > COAT_RANGE) return;
    const closeness = 1 - dist / COAT_RANGE; // 1 = right on top of the player
    const count = Math.round(closeness * closeness * (1 + sizeMul * 2.5) * (0.4 + rnd()));
    const srcAng = Math.atan2(-dz, -dx); // body side facing the blood source
    for (let k = 0; k < count; k++) {
      const i = this.pgHead;
      this.pgHead = (this.pgHead + 1) % MAX_PLAYER_GORE;
      if (this.pgCount < MAX_PLAYER_GORE) this.pgCount++;
      const ang = srcAng + (rnd() - 0.5) * 2.2; // biased to the near side
      const R = 0.7;
      this.pgX[i] = Math.cos(ang) * R;
      this.pgY[i] = 0.45 + rnd() * 1.55; // up the body
      this.pgZ[i] = Math.sin(ang) * R;
      this.pgSize[i] = (0.45 + rnd() * 0.85) * (0.7 + sizeMul * 0.5);
      this.pgAge[i] = 0;
      this.pgLife[i] = PLAYER_GORE_LIFE * (0.7 + rnd() * 0.6);
      // A touch brighter than floor blood so it reads on the dark body.
      this.pgr[i] = Math.min(1, color.r * 1.35 + 0.06);
      this.pgg[i] = color.g * 1.1;
      this.pgb[i] = color.b * 1.1;
    }
  }

  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      if (e.kind === 'blood') {
        const c = goreColor(e.variant);
        if (c) {
          const sz = goreScale(e.variant);
          // Per-hit "gush" — skewed low so most hits are a modest spritz and the
          // odd one ERUPTS. Makes the amount visibly vary shot to shot.
          const gush = 0.35 + rnd() * rnd() * 1.9;
          const n = Math.min(24, Math.max(2, Math.round((this.reduceFlash ? 3 : 5) * sz * gush)));
          this.spray(e.x, e.z, e.dx, e.dz, c, n, 0.8 + rnd() * 0.8, sz);
          this.coatPlayer(e.x, e.z, c, sz);
        }
      } else if (e.kind === 'death') {
        const c = goreColor(e.variant);
        // Death gush: radial, more matter (no incoming direction → burst outward).
        if (c) {
          const sz = goreScale(e.variant);
          const gush = 0.5 + rnd() * rnd() * 1.9;
          const n = Math.min(40, Math.max(3, Math.round((this.reduceFlash ? 6 : 10) * sz * gush)));
          this.spray(e.x, e.z, 0, 0, c, n, 1.2 + rnd() * 0.8, sz);
          this.coatPlayer(e.x, e.z, c, sz);
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
    // Horizontal reach scales with the enemy — a small pistol kill flicks blood a
    // short way, a brute paints the floor far. Keeps tier-1 splatter near the body.
    const reach = Math.max(0.5, Math.min(1.6, sizeMul));
    for (let k = 0; k < n; k++) {
      if (this.dCount >= MAX_DROPLETS) break;
      // TIGHT cone around the shot direction (exits the victim along the bullet
      // line) so the spray reads as a directional jet, not a radial puff. Full
      // circle only on death (dir≈0). A few stray wide droplets keep it organic.
      const spread = rnd() < 0.18 ? 0.9 : 0.32; // mostly tight, occasional flick
      const ang = hasDir ? base + (rnd() - 0.5) * spread : rnd() * Math.PI * 2;
      // Bias speed along the jet so streaks elongate down the shot line.
      const sp = (4 + rnd() * 7) * force * reach;
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
      // Wider per-droplet size spread (more visible variety), scaled by enemy.
      this.dsize[i] = (0.3 + rnd() * rnd() * 2.0) * sizeMul;
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
    size: number,
  ): void {
    const speed = Math.hypot(vx, vz);
    const i = this.cHead;
    this.cHead = (this.cHead + 1) % MAX_DECALS;
    if (this.cCount < MAX_DECALS) this.cCount++;
    this.cx[i] = x;
    this.cz[i] = z;
    this.cAge[i] = 0;
    // Random blob rotation so the shared shape never reads as a repeat; bias
    // toward the travel direction so fast splats still streak that way.
    const dir = speed > 0.1 ? Math.atan2(vz, vx) : rnd() * Math.PI * 2;
    this.cRot[i] = dir + (rnd() - 0.5) * 1.2;
    // Puddle size tracks the droplet (→ enemy size); streak length adds with
    // speed; non-uniform width keeps each blob lopsided, never a clean ellipse.
    const base = 0.4 * size;
    this.cLen[i] = base + Math.min(1.4, speed * 0.07) + rnd() * 0.4 * size;
    this.cWid[i] = base * (0.6 + rnd() * 0.7);
    this.cr[i] = r;
    this.cg[i] = g;
    this.cb[i] = b;
  }

  update(dt: number): void {
    // Strong horizontal air drag so blood sheds speed fast and LANDS near the
    // kill (the spray still bursts out energetically, it just doesn't sail across
    // the arena). Vertical is left to gravity so it keeps arcing.
    const drag = Math.max(0, 1 - 9 * dt);
    // Droplets: integrate + fall; on landing, convert to a directional decal.
    for (let i = this.dCount - 1; i >= 0; i--) {
      this.vy[i]! -= GRAVITY * dt;
      this.vx[i]! *= drag;
      this.vz[i]! *= drag;
      this.px[i]! += this.vx[i]! * dt;
      this.py[i]! += this.vy[i]! * dt;
      this.pz[i]! += this.vz[i]! * dt;
      if (this.py[i]! <= FLOOR_Y) {
        // Only a FRACTION of droplets leave a floor mark, weighted by droplet
        // size — small fodder droplets mostly evaporate (less floor clutter),
        // fat ones always stain. Keeps the mid-air spray dense but the floor calm.
        if (rnd() < Math.min(1, this.dsize[i]! * 0.6)) {
          this.landDecal(
            this.px[i]!,
            this.pz[i]!,
            this.vx[i]!,
            this.vz[i]!,
            this.dr[i]!,
            this.dg[i]!,
            this.db[i]!,
            this.dsize[i]!,
          );
        }
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
      // Flatten (−π/2 about X) then spin IN-PLANE about Z; spinning about Y would
      // tilt the decal up out of the floor (same Euler-order trap as the FX rings).
      this.dummy.rotation.set(-Math.PI / 2, 0, this.cRot[i]!);
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

    // Player gore: age slowly (lingers), dry + shrink at the very end. Expired
    // splotches collapse to zero scale (invisible) until the ring buffer reuses
    // them — no compaction needed.
    if (this.pgMesh) {
      for (let i = 0; i < this.pgCount; i++) {
        this.pgAge[i]! += dt;
        const t = this.pgAge[i]! / this.pgLife[i]!;
        const k = t >= 1 ? 0 : 1 - t * t * t; // hold fresh, dry/shrink late
        const s = this.pgSize[i]! * k;
        this.dummy.position.set(this.pgX[i]!, this.pgY[i]!, this.pgZ[i]!);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(s, s * 0.5, s); // squashed = a splat clinging to the body
        this.dummy.updateMatrix();
        this.pgMesh.setMatrixAt(i, this.dummy.matrix);
        const drk = 0.45 + 0.55 * k; // darken as it dries
        this.pgMesh.setColorAt(
          i,
          this.tmp.setRGB(this.pgr[i]! * drk, this.pgg[i]! * drk, this.pgb[i]! * drk),
        );
      }
      this.pgMesh.count = this.pgCount;
      this.pgMesh.instanceMatrix.needsUpdate = true;
      if (this.pgMesh.instanceColor) this.pgMesh.instanceColor.needsUpdate = true;
    }
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

function makeInstanced(parent: Object3D, geo: THREE_GEO, capacity: number): InstancedMesh {
  // Non-additive: blood is opaque matter, not a glow. Flat-shaded basic material.
  const mat = new MeshBasicMaterial({ toneMapped: false });
  const mesh = new InstancedMesh(geo, mat, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const buf = new Float32Array(capacity * 3).fill(1);
  mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
  mesh.instanceColor.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  parent.add(mesh); // Scene for world gore; the player group for body coating
  return mesh;
}

type THREE_GEO = SphereGeometry | CircleGeometry;
