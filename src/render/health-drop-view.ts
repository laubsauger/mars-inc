// Health-drop view (T33+). Each pooled medkit is a bone-white 3D CROSS with a RED
// inverted-hull rim (classic medkit read), hovering over a pulsing red floor halo
// — unmistakable against gold weapon crates, cyan/gold XP shards, and (importantly)
// the dark-red blood now on the floor. Pure view of HealthDropPool (V2); three
// meshes, one material each (V6). Solid emissive (no texture — WebGPU-safe, §B1).

import {
  InstancedMesh,
  BoxGeometry,
  RingGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Object3D,
  AdditiveBlending,
  DynamicDrawUsage,
  BackSide,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HealthDropPool, MAX_HEALTH_DROPS, HEALTH_TTL, HEALTH_FADE } from '../sim/health-drops';
import { COL } from './art/palette';

/** A fat 3D plus sign (medkit cross) — three crossed bars read as "medkit".
 *  Bigger + chunkier than before so it carries over a bloodied floor. */
function crossGeometry(): BufferGeometry {
  const arm = 0.72;
  const thick = 0.24;
  const h = new BoxGeometry(arm, thick, thick);
  const v = new BoxGeometry(thick, arm, thick);
  return mergeGeometries([h, v], false)!;
}

export class HealthDropView {
  readonly mesh: InstancedMesh;
  private outline: InstancedMesh;
  private halo: InstancedMesh;
  private dummy = new Object3D();
  private phase = 0;

  constructor(scene: Scene, capacity: number = MAX_HEALTH_DROPS) {
    const geo = crossGeometry();
    // Bone-white cross: high-contrast against blood (dark red) and the warm arena.
    const mat = new MeshStandardMaterial({
      color: COL.bone,
      emissive: COL.bone,
      emissiveIntensity: 0.7,
      roughness: 0.5,
      metalness: 0.1,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2; // over blood decals + its own red rim
    scene.add(this.mesh);

    // Red rim: an inverted hull (back-faces of a slightly scaled-up cross) so the
    // white cross reads as a classic red-bordered medkit. Same transform as the
    // cross, just scaled out a touch in sync(). depthWrite off → never z-fights
    // the white front faces; renderOrder below the cross so white sits on top.
    const rimMat = new MeshBasicMaterial({
      color: COL.healthRed,
      side: BackSide,
      depthWrite: false,
      toneMapped: false,
    });
    this.outline = new InstancedMesh(geo, rimMat, capacity);
    this.outline.instanceMatrix.setUsage(DynamicDrawUsage);
    this.outline.frustumCulled = false;
    this.outline.count = 0;
    this.outline.renderOrder = 1;
    scene.add(this.outline);

    // Red floor beacon: a flat additive ring that pulses under the cross, so the
    // pickup's LOCATION reads even when the cross overlaps dark blood. Additive +
    // depthWrite off + faintly lifted so it glows on the floor, never occludes.
    const haloMat = new MeshBasicMaterial({
      color: COL.healthRed,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.halo = new InstancedMesh(new RingGeometry(0.5, 0.92, 36), haloMat, capacity);
    this.halo.instanceMatrix.setUsage(DynamicDrawUsage);
    this.halo.frustumCulled = false;
    this.halo.count = 0;
    scene.add(this.halo);
  }

  sync(pool: HealthDropPool): void {
    this.phase += 0.05;
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const bob = 0.78 + Math.sin(this.phase * 1.4 + i) * 0.13;
      // Blink faster as it nears decay so its despawn reads.
      const age = pool.age[i]!;
      const left = HEALTH_TTL - age;
      const fade = left < HEALTH_FADE ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(age * 16)) : 1;

      // Cross: hover + spin, pulse-shrink while fading.
      const s = fade < 1 ? fade : 1;
      this.dummy.position.set(pool.posX[i]!, bob, pool.posZ[i]!);
      this.dummy.rotation.set(0, this.phase * 1.2 + i, 0);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      // Red rim: same pose, scaled out so the back-faces peek past the white cross.
      this.dummy.scale.setScalar(s * 1.26);
      this.dummy.updateMatrix();
      this.outline.setMatrixAt(i, this.dummy.matrix);

      // Halo: flat on the floor, breathing scale, dims with the same fade.
      const pulse = 1 + Math.sin(this.phase * 2.4 + i) * 0.12;
      this.dummy.position.set(pool.posX[i]!, 0.05, pool.posZ[i]!);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0); // lie flat on the ground
      this.dummy.scale.set(pulse * fade, pulse * fade, 1);
      this.dummy.updateMatrix();
      this.halo.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.outline.count = n;
    this.outline.instanceMatrix.needsUpdate = true;
    this.halo.count = n;
    this.halo.instanceMatrix.needsUpdate = true;
  }
}
