// Grenade max-range marker (player aid). The grenade's reach is DECOUPLED from
// weapon range, which confuses — so we draw a small ember cross on the aim line at
// the grenade's max lob distance, marking exactly how far a thrown grenade reaches.
// Toggleable via settings (`enabled`). Pure view (V2): flat ground quads in one
// InstancedMesh (same WebGPU-safe pattern as the aim line, §B1).

import {
  InstancedMesh,
  PlaneGeometry,
  MeshBasicMaterial,
  Object3D,
  DynamicDrawUsage,
  AdditiveBlending,
  type Scene,
} from 'three';

const Y = 0.19; // a hair above the gold aim line so the cross reads on top
const BAR_LEN = 1.7; // perpendicular bar length (the main "cross line")
const TICK_LEN = 0.7; // short inline tick that completes the + shape
const WIDTH = 0.13; // bar half-thickness (matches the aim line's stripe weight)

export class GrenadeRangeView {
  private mesh: InstancedMesh;
  private dummy = new Object3D();
  /** Settings toggle — when false the marker is never drawn. */
  enabled = true;

  constructor(scene: Scene) {
    const geo = new PlaneGeometry(1, 1);
    const mat = new MeshBasicMaterial({
      // Ember/orange to read as the grenade family (distinct from the gold weapon
      // aim line it sits on).
      color: 0xff5a36,
      transparent: true,
      opacity: 0.38,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geo, mat, 2); // perpendicular bar + inline tick
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2; // just over the aim line (renderOrder 1)
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  /** Place the cross at `dist` along the aim direction (ax,az unit) from the
   *  player. `visible` gates per-frame state (paused/leveling/no-aim → hidden). */
  sync(px: number, pz: number, ax: number, az: number, dist: number, visible: boolean): void {
    if (!visible || !this.enabled) {
      if (this.mesh.count !== 0) {
        this.mesh.count = 0;
        this.mesh.instanceMatrix.needsUpdate = true;
      }
      return;
    }
    const cx = px + ax * dist;
    const cz = pz + az * dist;
    // Perpendicular bar: long axis ⟂ to the aim dir. Flatten (−π/2 about X), spin
    // in-plane about Z. Perp direction = (−az, ax) → angle atan2(-perpZ, perpX).
    this.dummy.position.set(cx, Y, cz);
    this.dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(-ax, -az));
    this.dummy.scale.set(BAR_LEN, WIDTH, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(0, this.dummy.matrix);
    // Inline tick along the aim dir → completes the + so it reads as a marker, not
    // a wall. Long axis aligned with (ax,az): angle atan2(-az, ax).
    this.dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(-az, ax));
    this.dummy.scale.set(TICK_LEN, WIDTH, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(1, this.dummy.matrix);
    this.mesh.count = 2;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
