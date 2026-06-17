// Aim lines (player aid). Thin gold "laser sight" stripes from the player along
// each fire direction — mirroring the weapon's multishot fan exactly, so a
// 3-projectile build shows three stripes at the projectile angles. Each stripe
// terminates at the first enemy hit, the weapon's max range, or the arena wall —
// whichever is nearest. Pure view (V2): the raycast runs in the render layer from
// sim state and never writes back.
//
// WebGPU note (§B1): `Line2`/`LineMaterial` (the fat-line shader) does NOT render
// under the WebGPU backend here — it collapses into a degenerate quad at the
// segment origin (the "gold rectangle at arena centre" bug). So the stripes are
// flat ground quads in ONE InstancedMesh with a pre-created `instanceColor`, the
// same reliable pattern as the projectile/effect views — and 1 draw call instead
// of up to 32 fat-line draws.

import {
  InstancedMesh,
  PlaneGeometry,
  MeshBasicMaterial,
  Object3D,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  AdditiveBlending,
  type Scene,
} from 'three';
import { EnemyState, type EnemyPool } from '../sim/enemies';
import { wallDistance } from '../sim/arena';
import { COL } from './art/palette';

const Y = 0.18; // just above the raised floor seams (≈0.09 top) — no z-fight
const WIDTH = 0.12; // stripe half-thickness in world units
const CAP_LEN = 0.9; // perpendicular end-tick length (marks where range ends)
const MAX_LINES = 32; // pooled; covers heavy multishot stacks
const MAX_INSTANCES = MAX_LINES * 2; // each stripe = 1 shaft + 1 end cap

export class AimLineView {
  private mesh: InstancedMesh;
  private dummy = new Object3D();

  constructor(scene: Scene, _width: number, _height: number) {
    const geo = new PlaneGeometry(1, 1); // unit quad; scaled per stripe, laid flat
    const mat = new MeshBasicMaterial({
      color: COL.kineticGold,
      transparent: true,
      opacity: 0.16, // subtle aid, not in-your-face — sits under the combat layer
      blending: AdditiveBlending,
      depthWrite: false,
      // Draw over the floor inlays/seams but let the player/enemies sit on top.
      depthTest: true,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, MAX_INSTANCES);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    const colorBuf = new Float32Array(MAX_INSTANCES * 3).fill(1);
    this.mesh.instanceColor = new InstancedBufferAttribute(colorBuf, 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  // Resolution no longer matters (not a fat line), but keep the API stable.
  setResolution(_width: number, _height: number): void {}

  /** Distance along a unit ray to the first enemy / max range / arena wall. */
  private raycast(
    pool: EnemyPool,
    px: number,
    pz: number,
    dx: number,
    dz: number,
    maxRange: number,
  ): number {
    let tHit = wallDistance(px, pz, dx, dz, maxRange);
    for (let i = 0; i < pool.count; i++) {
      if (pool.state[i] !== EnemyState.Active) continue;
      const ocx = pool.posX[i]! - px;
      const ocz = pool.posZ[i]! - pz;
      const tca = ocx * dx + ocz * dz;
      if (tca <= 0) continue; // behind the aim direction
      const er = pool.radius[i]!;
      const d2 = ocx * ocx + ocz * ocz - tca * tca;
      if (d2 > er * er) continue; // ray misses
      const t = tca - Math.sqrt(er * er - d2);
      if (t > 0 && t < tHit) tHit = t;
    }
    return tHit;
  }

  /**
   * Render one stripe per fire direction. `dirs` is a flat [dx0,dz0, dx1,dz1, …]
   * of unit directions (matching the weapon's multishot fan); `count` is how many
   * to draw. Extra pooled instances are dropped via `mesh.count`.
   */
  sync(
    pool: EnemyPool,
    px: number,
    pz: number,
    dirs: Float32Array,
    count: number,
    maxRange: number,
    startGap: number,
  ): void {
    const n = Math.min(count, MAX_LINES);
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      const dx = dirs[i * 2]!;
      const dz = dirs[i * 2 + 1]!;
      const t = this.raycast(pool, px, pz, dx, dz, maxRange);
      const len = t - startGap;
      if (len <= 0.1) continue; // target inside the muzzle gap → nothing to draw
      const midT = (startGap + t) / 2;
      // Shaft: flatten to the ground (−π/2 about X), spin IN-PLANE about Z so the
      // quad's long axis (local X) aligns with the aim direction (dx,dz).
      const shaftRot = Math.atan2(-dz, dx);
      this.dummy.position.set(px + dx * midT, Y, pz + dz * midT);
      this.dummy.rotation.set(-Math.PI / 2, 0, shaftRot);
      this.dummy.scale.set(len, WIDTH, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(drawn++, this.dummy.matrix);
      // End cap: a short tick ACROSS the tip (long axis ⟂ to the aim dir) so the
      // range terminus reads clearly. Perpendicular dir = (−dz, dx).
      this.dummy.position.set(px + dx * t, Y, pz + dz * t);
      this.dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(-dx, -dz));
      this.dummy.scale.set(CAP_LEN, WIDTH, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(drawn++, this.dummy.matrix);
    }
    this.mesh.count = drawn;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide(): void {
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
