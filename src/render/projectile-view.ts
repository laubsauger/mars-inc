// Instanced projectile view (T14). One InstancedMesh, emissive plasma look.
// Synced from the pool with interpolation (V1/V2). Muzzle/impact FX → T16.
// Per-instance colour (pre-created instanceColor, §B1) tints the small drone bolts
// a cooler shade so they read as distinct from the player's gold fire.

import {
  InstancedMesh,
  SphereGeometry,
  MeshBasicMaterial,
  Object3D,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  AdditiveBlending,
  type Scene,
} from 'three';
import type { ProjectilePool } from '../sim/combat/projectiles';
import { MAX_PROJECTILES } from '../sim/combat/projectiles';
import { COL } from './art/palette';

// Player bolts = bright kinetic gold. Drone bolts = magenta-purple — clearly a
// sidekick's fire, and distinct from cyan XP shards / orange fire / gold player fire.
const PLAYER_COL = COL.kineticGold.clone().multiplyScalar(1.4);
const DRONE_COL = COL.eliteMagenta.clone().multiplyScalar(1.15);
// Drone projectiles are spawned smaller than any weapon bolt (0.12 vs 0.16+), so
// radius is a reliable "is this a drone bolt" tell without a per-projectile flag.
const DRONE_RADIUS_MAX = 0.14;

export class ProjectileView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();

  constructor(scene: Scene, capacity: number = MAX_PROJECTILES) {
    const geo = new SphereGeometry(1, 8, 6);
    const mat = new MeshBasicMaterial({
      // White base — the per-instance colour carries the actual tint (gold / drone).
      color: 0xffffff,
      blending: AdditiveBlending,
      depthWrite: false,
      // Glowing plasma bolts read as light, not solid geometry — don't let the
      // raised gate plates (or any opaque prop) occlude them. Draw on top.
      depthTest: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // Pre-create the instanceColor buffer (§B1: lazy setColorAt is unreliable on
    // the WebGPU backend — allocate it up front, defaulted to the player gold).
    const buf = new Float32Array(capacity * 3);
    for (let i = 0; i < capacity; i++) {
      buf[i * 3] = PLAYER_COL.r;
      buf[i * 3 + 1] = PLAYER_COL.g;
      buf[i * 3 + 2] = PLAYER_COL.b;
    }
    this.mesh.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.renderOrder = 10; // after opaque scene, with the additive overlay
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: ProjectilePool, alpha: number): void {
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const r = pool.radius[i]!;
      this.dummy.position.set(x, 0.9, z);
      this.dummy.scale.setScalar(r);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, r <= DRONE_RADIUS_MAX ? DRONE_COL : PLAYER_COL);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
