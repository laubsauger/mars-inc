// Bounty-relic view (contracts). Each pooled relic is a spinning gold octahedron
// hovering over a pulsing cyan floor halo, topped by a tall additive light BEAM so
// it reads as a "go here" objective from across the arena (the relic is a movement
// target, not a passive drop). Pure view of BountyPool (V2); three meshes, one
// material each (V6). Solid emissive (no texture — WebGPU-safe, §B1).

import {
  InstancedMesh,
  OctahedronGeometry,
  RingGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Object3D,
  AdditiveBlending,
  DynamicDrawUsage,
  type Scene,
} from 'three';
import { BountyPool, MAX_BOUNTIES, BOUNTY_TTL, BOUNTY_FADE } from '../sim/bounty-system';
import { COL } from './art/palette';

const BEAM_HEIGHT = 7;

export class BountyView {
  private relic: InstancedMesh;
  private halo: InstancedMesh;
  private beam: InstancedMesh;
  private dummy = new Object3D();
  private phase = 0;

  constructor(scene: Scene, capacity: number = MAX_BOUNTIES) {
    // Gold relic — the prize. Emissive so it pops against the low-contrast arena.
    const relicMat = new MeshStandardMaterial({
      color: COL.kineticGold,
      emissive: COL.kineticGold,
      emissiveIntensity: 0.7,
      roughness: 0.35,
      metalness: 0.2,
      toneMapped: false,
    });
    this.relic = new InstancedMesh(new OctahedronGeometry(0.6, 0), relicMat, capacity);
    this.relic.instanceMatrix.setUsage(DynamicDrawUsage);
    this.relic.castShadow = true;
    this.relic.frustumCulled = false;
    this.relic.count = 0;
    this.relic.renderOrder = 2;
    scene.add(this.relic);

    // Cyan floor halo — a contrasting marker ring so the ground spot reads.
    const haloMat = new MeshBasicMaterial({
      color: COL.shieldCyan,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.halo = new InstancedMesh(new RingGeometry(0.7, 1.2, 40), haloMat, capacity);
    this.halo.instanceMatrix.setUsage(DynamicDrawUsage);
    this.halo.frustumCulled = false;
    this.halo.count = 0;
    scene.add(this.halo);

    // Tall light beam — the long-range beacon. Additive, soft, never occludes.
    const beamMat = new MeshBasicMaterial({
      color: COL.kineticGold,
      transparent: true,
      opacity: 0.16,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.beam = new InstancedMesh(
      new CylinderGeometry(0.16, 0.32, BEAM_HEIGHT, 10, 1, true),
      beamMat,
      capacity,
    );
    this.beam.instanceMatrix.setUsage(DynamicDrawUsage);
    this.beam.frustumCulled = false;
    this.beam.count = 0;
    scene.add(this.beam);
  }

  sync(pool: BountyPool): void {
    this.phase += 0.05;
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const bob = 1.0 + Math.sin(this.phase * 1.5 + i) * 0.18;
      const age = pool.age[i]!;
      const left = BOUNTY_TTL - age;
      // Blink faster as it nears decay so an about-to-vanish relic reads urgent.
      const fade = left < BOUNTY_FADE ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(age * 14)) : 1;
      const x = pool.posX[i]!;
      const z = pool.posZ[i]!;

      // Relic: hover + tumble on two axes, pulse-shrink while fading.
      this.dummy.position.set(x, bob, z);
      this.dummy.rotation.set(this.phase * 0.8, this.phase * 1.3 + i, 0);
      this.dummy.scale.setScalar(fade < 1 ? fade : 1);
      this.dummy.updateMatrix();
      this.relic.setMatrixAt(i, this.dummy.matrix);

      // Halo: flat on the floor, breathing.
      const pulse = 1 + Math.sin(this.phase * 2.2 + i) * 0.14;
      this.dummy.position.set(x, 0.05, z);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.set(pulse * fade, pulse * fade, 1);
      this.dummy.updateMatrix();
      this.halo.setMatrixAt(i, this.dummy.matrix);

      // Beam: rises from the floor (cylinder origin is its centre → lift by half).
      this.dummy.position.set(x, BEAM_HEIGHT * 0.5, z);
      this.dummy.rotation.set(0, this.phase + i, 0);
      this.dummy.scale.set(fade, 1, fade);
      this.dummy.updateMatrix();
      this.beam.setMatrixAt(i, this.dummy.matrix);
    }
    this.relic.count = n;
    this.relic.instanceMatrix.needsUpdate = true;
    this.halo.count = n;
    this.halo.instanceMatrix.needsUpdate = true;
    this.beam.count = n;
    this.beam.instanceMatrix.needsUpdate = true;
  }
}
