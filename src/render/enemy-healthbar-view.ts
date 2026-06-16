// Optional enemy health bars (T36 accessibility/clarity, opt-in via settings).
// Pooled, billboarded quads above each active enemy — one InstancedMesh for the
// dark backing, one for the coloured fill. Pure view (V2): reads the SoA pool,
// never mutates. maxHealth is mapped from the per-enemy `variant` index (the pool
// stores only current health), so no sim change is needed.

import {
  InstancedMesh,
  PlaneGeometry,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import {
  EnemyState,
  MAX_ENEMIES,
  RUST_MITE,
  DEBT_HOUND,
  BOSS_GATEKEEPER,
  SEVERANCE_LOBBER,
  REPO_MARSHAL,
  FORECLOSURE_MORTAR,
  RIOT_SHOTGUNNER,
  AUDIT_BRUTE,
  type EnemyPool,
} from '../sim/enemies';

// Variant index → max health (must match EnemyView's VARIANT order).
const VARIANT_MAXHP = [
  RUST_MITE.maxHealth,
  DEBT_HOUND.maxHealth,
  BOSS_GATEKEEPER.maxHealth,
  SEVERANCE_LOBBER.maxHealth,
  REPO_MARSHAL.maxHealth,
  FORECLOSURE_MORTAR.maxHealth,
  RIOT_SHOTGUNNER.maxHealth,
  AUDIT_BRUTE.maxHealth,
];

const BAR_H = 0.16;
const BG = new Color(0.02, 0.02, 0.03);
const HP_FULL = new Color(0.45, 0.82, 0.3); // green
const HP_LOW = new Color(0.9, 0.18, 0.12); // red

export class EnemyHealthbarView {
  private bg: InstancedMesh;
  private fill: InstancedMesh;
  private dummy = new Object3D();
  private right = new Vector3();
  private tmp = new Color();
  private fillColor: InstancedBufferAttribute;
  /** Toggled from settings (T36). When off, nothing renders (zero cost). */
  enabled = false;

  constructor(scene: Scene, capacity: number = MAX_ENEMIES) {
    const geo = new PlaneGeometry(1, BAR_H);
    this.bg = new InstancedMesh(
      geo,
      new MeshBasicMaterial({ color: BG, toneMapped: false }),
      capacity,
    );
    this.fill = new InstancedMesh(geo, new MeshBasicMaterial({ toneMapped: false }), capacity);
    const colorBuf = new Float32Array(capacity * 3).fill(1);
    this.fill.instanceColor = new InstancedBufferAttribute(colorBuf, 3);
    this.fillColor = this.fill.instanceColor;
    for (const m of [this.bg, this.fill]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      scene.add(m);
    }
    this.fill.renderOrder = 3;
    this.bg.renderOrder = 2;
  }

  sync(pool: EnemyPool, camera: PerspectiveCamera, alpha: number): void {
    if (!this.enabled) {
      if (this.bg.visible) {
        this.bg.visible = false;
        this.fill.visible = false;
      }
      return;
    }
    this.bg.visible = true;
    this.fill.visible = true;
    // Camera-right axis for left-anchoring the fill; quaternion to billboard.
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    const q = camera.quaternion;

    let n = 0;
    for (let i = 0; i < pool.count; i++) {
      if (pool.state[i] !== EnemyState.Active) continue; // skip telegraphing spawns
      const maxHp = VARIANT_MAXHP[pool.variant[i]!] ?? 1;
      const frac = Math.max(0, Math.min(1, pool.health[i]! / maxHp));
      const radius = pool.radius[i]!;
      const w = Math.max(1.0, radius * 1.8);
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const y = radius * 2 + 1.0;

      // Backing.
      this.dummy.position.set(x, y, z);
      this.dummy.quaternion.copy(q);
      this.dummy.scale.set(w + 0.08, BAR_H + 0.06, 1);
      this.dummy.updateMatrix();
      this.bg.setMatrixAt(n, this.dummy.matrix);

      // Fill — width scaled by frac, shifted left so it drains from the right.
      const fw = w * frac;
      const shift = -(w - fw) / 2;
      this.dummy.position.set(x + this.right.x * shift, y, z + this.right.z * shift);
      this.dummy.quaternion.copy(q);
      this.dummy.scale.set(Math.max(0.001, fw), BAR_H, 1);
      this.dummy.updateMatrix();
      this.fill.setMatrixAt(n, this.dummy.matrix);
      this.fill.setColorAt(n, this.tmp.copy(HP_LOW).lerp(HP_FULL, frac));
      n++;
    }
    this.bg.count = n;
    this.fill.count = n;
    this.bg.instanceMatrix.needsUpdate = true;
    this.fill.instanceMatrix.needsUpdate = true;
    this.fillColor.needsUpdate = true;
  }
}
