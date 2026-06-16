// Pooled effect renderer (T16, V5/V6). One InstancedMesh per effect family —
// pooled, no per-frame allocation, no dynamic lights (art doc). Ground-plane
// quads (top-down iconic silhouettes). Fade is done by lerping instance color
// toward black under additive blending, so no per-instance opacity shader needed.

import {
  InstancedMesh,
  CircleGeometry,
  RingGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  AdditiveBlending,
  type BufferGeometry,
  type Scene,
} from 'three';
import { COL } from './art/palette';
import { type FxEvent, ImpactProfile } from '../sim/fx';

interface Spawn {
  x: number;
  z: number;
  s0: number;
  s1: number;
  life: number;
  spin: number;
  color: Color;
  /** Fixed in-plane angle (radians). When set, overrides the color-derived spin
   *  start — used to point a stretched spark along the impact direction. */
  rot?: number;
  /** Elongation of the local long axis (1 = round). >1 → a directional streak. */
  stretch?: number;
}

class EffectPool {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private count = 0;
  // SoA per-instance state.
  private posX: Float32Array;
  private posZ: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private life: Float32Array;
  private age: Float32Array;
  private spin: Float32Array;
  private rot: Float32Array;
  private stretch: Float32Array;
  private r: Float32Array;
  private g: Float32Array;
  private b: Float32Array;
  private yOffset: number;

  constructor(
    scene: Scene,
    geo: BufferGeometry,
    capacity: number,
    yOffset: number,
    depthTest = true,
  ) {
    // Solid additive geometry (no texture). CanvasTexture maps don't bind under
    // the WebGPU backend here; flat discs/rings render reliably like the
    // projectile/enemy instanced meshes do. The dummy tilts each instance flat.
    const mat = new MeshBasicMaterial({
      transparent: true,
      blending: AdditiveBlending,
      // depthWrite off (glows don't occlude). depthTest ON for floor effects so
      // the player/enemies in front occlude them (trails read as behind him).
      // OFF for hit impacts: they land AT the enemy, so depth-testing clips the
      // ring against that very body → a ring "chopped" on one edge. A brief
      // additive flash over the body reads correct; the chop does not.
      depthWrite: false,
      depthTest,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // Pre-create instanceColor (lazy setColorAt is unreliable under WebGPU).
    const colorBuf = new Float32Array(capacity * 3).fill(1);
    this.mesh.instanceColor = new InstancedBufferAttribute(colorBuf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.yOffset = yOffset;
    scene.add(this.mesh);

    this.posX = new Float32Array(capacity);
    this.posZ = new Float32Array(capacity);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.stretch = new Float32Array(capacity);
    this.r = new Float32Array(capacity);
    this.g = new Float32Array(capacity);
    this.b = new Float32Array(capacity);
  }

  spawn(p: Spawn): void {
    if (this.count >= this.posX.length) return; // pool full — drop (capped, V5)
    const i = this.count++;
    this.posX[i] = p.x;
    this.posZ[i] = p.z;
    this.s0[i] = p.s0;
    this.s1[i] = p.s1;
    this.life[i] = p.life;
    this.age[i] = 0;
    this.spin[i] = p.spin;
    this.rot[i] = p.rot ?? p.color.r * 6.28; // explicit angle, else color-derived
    this.stretch[i] = p.stretch ?? 1;
    this.r[i] = p.color.r;
    this.g[i] = p.color.g;
    this.b[i] = p.color.b;
  }

  private remove(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.posX[i] = this.posX[last]!;
      this.posZ[i] = this.posZ[last]!;
      this.s0[i] = this.s0[last]!;
      this.s1[i] = this.s1[last]!;
      this.life[i] = this.life[last]!;
      this.age[i] = this.age[last]!;
      this.spin[i] = this.spin[last]!;
      this.rot[i] = this.rot[last]!;
      this.stretch[i] = this.stretch[last]!;
      this.r[i] = this.r[last]!;
      this.g[i] = this.g[last]!;
      this.b[i] = this.b[last]!;
    }
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i]! += dt;
      const t = this.age[i]! / this.life[i]!;
      if (t >= 1) {
        this.remove(i);
        continue;
      }
      const scale = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t;
      this.rot[i]! += this.spin[i]! * dt;
      this.dummy.position.set(this.posX[i]!, this.yOffset, this.posZ[i]!);
      // Flatten to the ground (−π/2 about X), then spin IN-PLANE about Z (the
      // geometry's own normal). Putting the spin on Y instead tilts the disc out
      // of the floor — at rot≈π/2 it stands fully vertical and clips into the
      // ground (the "weirdly oriented, cut-off" impact ring).
      this.dummy.rotation.set(-Math.PI / 2, 0, this.rot[i]!);
      // Stretch elongates the local long axis → a directional streak (oriented
      // spark). Round effects keep stretch 1.
      this.dummy.scale.set(scale * this.stretch[i]!, scale, scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      const fade = 1 - t;
      this.mesh.setColorAt(i, _tmp.setRGB(this.r[i]! * fade, this.g[i]! * fade, this.b[i]! * fade));
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get live(): number {
    return this.count;
  }
}

const _tmp = new Color();
// Muted cyan for the sprint wake — additive shieldCyan at full is too loud.
const TRAIL_CYAN = new Color(0.12, 0.46, 0.56);

export class Effects {
  private muzzle: EffectPool;
  private impact: EffectPool;
  private dust: EffectPool;
  private sprintTimer = 0;
  /** Accessibility flash reduction (T36): dampen muzzle/impact brightness + density. */
  reduceFlash = false;

  constructor(scene: Scene) {
    // Disc flash for muzzle/dust, an actual annulus for impact shockwaves.
    this.muzzle = new EffectPool(scene, new CircleGeometry(0.5, 14), 256, 0.6);
    // Impact ring: a full, evenly-segmented annulus lifted a touch off the floor.
    // depthTest OFF — hits land AT the enemy, so testing would clip the ring
    // against that body (the "chopped on one edge" artifact). A brief additive
    // flash over the body reads correct.
    this.impact = new EffectPool(scene, new RingGeometry(0.34, 0.5, 40), 512, 0.7, false);
    this.dust = new EffectPool(scene, new CircleGeometry(0.5, 16), 1024, 0.3);
  }

  /** Spawn from drained sim FX events. */
  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'muzzle':
          // Flash reduction: skip the bright muzzle flash, keep gameplay readable.
          if (this.reduceFlash) break;
          this.muzzle.spawn({
            x: e.x,
            z: e.z,
            s0: 2.1,
            s1: 1.0,
            life: 0.11,
            spin: 8,
            color: COL.kineticGold,
          });
          break;
        case 'impact':
          // Per-weapon-family hit read (art doc): a sidearm tick must not look
          // like an explosive blast. Profile rides in `variant`, incoming travel
          // direction in dx,dz (0 = radial).
          this.impactFx(e.x, e.z, e.variant as ImpactProfile, e.dx, e.dz);
          break;
        case 'death':
          // Comic dust poof + scrap scatter, tinted by variant.
          this.dust.spawn({
            x: e.x,
            z: e.z,
            s0: 1.6,
            s1: 5,
            life: 0.45,
            spin: 4,
            color: e.variant === 1 ? COL.healthRed : COL.marsDust,
          });
          this.impact.spawn({
            x: e.x,
            z: e.z,
            s0: 0.6,
            s1: 3.2,
            life: 0.4,
            spin: 0,
            color: COL.sunHigh,
          });
          break;
        case 'teleport':
          // Materialize: two phase rings COLLAPSE inward (big → small) + a bright
          // bloom + inward sparks → reads as "blinking into" the arena.
          this.impact.spawn({
            x: e.x,
            z: e.z,
            s0: 4.6,
            s1: 0.6,
            life: 0.5,
            spin: -4,
            color: COL.eliteMagenta,
          });
          this.impact.spawn({
            x: e.x,
            z: e.z,
            s0: 3.2,
            s1: 0.4,
            life: 0.42,
            spin: 3,
            color: COL.shieldCyan,
          });
          this.muzzle.spawn({
            x: e.x,
            z: e.z,
            s0: 0.2,
            s1: 2.4,
            life: 0.32,
            spin: 6,
            color: COL.eliteMagenta,
          });
          this.dust.spawn({
            x: e.x,
            z: e.z,
            s0: 2.8,
            s1: 0.4,
            life: 0.42,
            spin: 5,
            color: COL.shieldCyan,
          });
          break;
        case 'levelup':
          // Ascension flourish around the player: a bright bloom + two gold/cyan
          // shock rings expanding outward + a sparse spark ring. Reads as a
          // power-up beat in the ~0.55s window before the draft freezes the sim.
          this.muzzle.spawn({
            x: e.x,
            z: e.z,
            s0: 0.4,
            s1: 4.2,
            life: 0.34,
            spin: 3,
            color: COL.sunHigh,
          });
          this.impact.spawn({
            x: e.x,
            z: e.z,
            s0: 0.8,
            s1: 7.5,
            life: 0.5,
            spin: 2,
            color: COL.kineticGold,
          });
          this.impact.spawn({
            x: e.x,
            z: e.z,
            s0: 0.4,
            s1: 5.2,
            life: 0.42,
            spin: -3,
            color: COL.shieldCyan,
          });
          this.dust.spawn({
            x: e.x,
            z: e.z,
            s0: 0.6,
            s1: 6.5,
            life: 0.48,
            spin: 4,
            color: COL.kineticGold,
          });
          break;
      }
    }
  }

  /** Distinct hit FX per weapon family (art doc Effects Plan). Each family gets
   *  its own ring size/color/dust so the player reads the weapon from the hit. */
  private impactFx(x: number, z: number, profile: ImpactProfile, dx = 0, dz = 0): void {
    // Incoming direction → an oriented spark streak that continues PAST the hit
    // face (art doc: matter exits away from the surface). 0,0 = radial only.
    const hasDir = dx * dx + dz * dz > 1e-4;
    const ang = hasDir ? Math.atan2(dz, dx) : 0;
    const ox = x + dx * 0.4; // bias the streak just past the contact point
    const oz = z + dz * 0.4;
    switch (profile) {
      case ImpactProfile.Tick: // sidearm: sharp small yellow-white spark
        this.impact.spawn({ x, z, s0: 0.5, s1: 1.7, life: 0.16, spin: 0, color: COL.sunHigh });
        if (hasDir)
          this.muzzle.spawn({
            x: ox,
            z: oz,
            s0: 1.0,
            s1: 0.25,
            life: 0.1,
            spin: 0,
            color: COL.kineticGold,
            rot: ang,
            stretch: 3,
          });
        break;
      case ImpactProfile.Stitch: // rotary: tiny rapid brass chip streak
        this.impact.spawn({ x, z, s0: 0.4, s1: 1.2, life: 0.12, spin: 0, color: COL.brass });
        if (hasDir)
          this.muzzle.spawn({
            x: ox,
            z: oz,
            s0: 0.8,
            s1: 0.2,
            life: 0.08,
            spin: 0,
            color: COL.brass,
            rot: ang,
            stretch: 3.5,
          });
        break;
      case ImpactProfile.Arc: // energy: angular cyan flash + streak
        this.impact.spawn({ x, z, s0: 0.7, s1: 2.3, life: 0.2, spin: 0, color: COL.shieldCyan });
        this.muzzle.spawn({
          x: ox,
          z: oz,
          s0: 1.0,
          s1: 0.2,
          life: 0.1,
          spin: 0,
          color: COL.shieldCyan,
          rot: ang,
          stretch: hasDir ? 2.5 : 1,
        });
        break;
      case ImpactProfile.Blast: // explosive: big radial ring + heavy dust wall
        this.impact.spawn({ x, z, s0: 0.8, s1: 3.4, life: 0.34, spin: 0, color: COL.sunHigh });
        this.dust.spawn({ x, z, s0: 1.6, s1: 3.4, life: 0.4, spin: 3, color: COL.marsDust });
        break;
      default: // generic (enemy attacks, drops, status ticks)
        this.impact.spawn({ x, z, s0: 0.8, s1: 2.6, life: 0.28, spin: 0, color: COL.sunHigh });
        this.dust.spawn({ x, z, s0: 1.4, s1: 2.6, life: 0.32, spin: 3, color: COL.kineticGold });
    }
  }

  /** Cyan sprint trail commas (art doc). reduceFlash dampens via fewer puffs. */
  sprintTrail(x: number, z: number, active: boolean, dt: number): void {
    if (!active) return;
    this.sprintTimer -= dt;
    if (this.sprintTimer > 0) return;
    // Slick, low-key wake: small puffs that shrink + fade fast (readable, ⊥ loud).
    this.sprintTimer = this.reduceFlash ? 0.07 : 0.035;
    this.dust.spawn({ x, z, s0: 0.7, s1: 0.15, life: 0.26, spin: 4, color: TRAIL_CYAN });
  }

  update(dt: number): void {
    this.muzzle.update(dt);
    this.impact.update(dt);
    this.dust.update(dt);
  }

  get count(): number {
    return this.muzzle.live + this.impact.live + this.dust.live;
  }
}
