// Pooled effect renderer (T16, V5/V6). One InstancedMesh per effect family —
// pooled, no per-frame allocation, no dynamic lights (art doc). Ground-plane
// quads (top-down iconic silhouettes). Fade is done by lerping instance color
// toward black under additive blending, so no per-instance opacity shader needed.

import {
  InstancedMesh,
  PlaneGeometry,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  AdditiveBlending,
  type Texture,
  type Scene,
} from 'three';
import { starTexture, ringTexture, puffTexture } from './art/effect-textures';
import { COL } from './art/palette';
import type { FxEvent } from '../sim/fx';

interface Spawn {
  x: number;
  z: number;
  s0: number;
  s1: number;
  life: number;
  spin: number;
  color: Color;
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
  private r: Float32Array;
  private g: Float32Array;
  private b: Float32Array;
  private yOffset: number;

  constructor(scene: Scene, texture: Texture, capacity: number, yOffset: number) {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // lie flat on the arena floor
    const mat = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
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
    this.rot[i] = p.color.r * 6.28; // cheap varied start angle from color
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
      this.dummy.rotation.set(-Math.PI / 2, this.rot[i]!, 0);
      this.dummy.scale.setScalar(scale);
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

export class Effects {
  private muzzle: EffectPool;
  private impact: EffectPool;
  private dust: EffectPool;
  private sprintTimer = 0;

  constructor(scene: Scene) {
    this.muzzle = new EffectPool(scene, starTexture(), 256, 0.6);
    this.impact = new EffectPool(scene, ringTexture(), 512, 0.12);
    this.dust = new EffectPool(scene, puffTexture(), 1024, 0.3);
  }

  /** Spawn from drained sim FX events. */
  consume(events: readonly FxEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'muzzle':
          this.muzzle.spawn({
            x: e.x,
            z: e.z,
            s0: 1.4,
            s1: 2.2,
            life: 0.09,
            spin: 8,
            color: COL.kineticGold,
          });
          break;
        case 'impact':
          this.impact.spawn({
            x: e.x,
            z: e.z,
            s0: 0.6,
            s1: 2.0,
            life: 0.22,
            spin: 0,
            color: COL.sunHigh,
          });
          this.dust.spawn({
            x: e.x,
            z: e.z,
            s0: 0.5,
            s1: 1.4,
            life: 0.3,
            spin: 3,
            color: COL.brass,
          });
          break;
        case 'death':
          // Comic dust poof + scrap scatter, tinted by variant.
          this.dust.spawn({
            x: e.x,
            z: e.z,
            s0: 0.8,
            s1: 3.2,
            life: 0.4,
            spin: 4,
            color: e.variant === 1 ? COL.healthRed : COL.marsDust,
          });
          this.impact.spawn({
            x: e.x,
            z: e.z,
            s0: 0.4,
            s1: 2.4,
            life: 0.3,
            spin: 0,
            color: COL.marsDust,
          });
          break;
      }
    }
  }

  /** Cyan sprint trail commas (art doc). reduceFlash dampens via fewer puffs. */
  sprintTrail(x: number, z: number, active: boolean, dt: number, reduceFlash: boolean): void {
    if (!active) return;
    this.sprintTimer -= dt;
    if (this.sprintTimer > 0) return;
    this.sprintTimer = reduceFlash ? 0.08 : 0.03;
    this.dust.spawn({ x, z, s0: 1.0, s1: 0.2, life: 0.35, spin: 6, color: COL.shieldCyan });
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
