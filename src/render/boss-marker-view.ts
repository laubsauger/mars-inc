// Boss marker (readability). Bosses + minibosses were getting lost in the crowd —
// this floats an ALWAYS-ON health bar over the boss body AND lays a pulsing ground
// ring under it (a "this is the boss" radius), tier-coloured: GOLD for a final boss,
// EMBER for a miniboss. One InstancedMesh each (V6), pooled + capped (V5), pure view
// (V2): reads the SoA pool + the BossDef registry, never mutates.

import {
  InstancedMesh,
  PlaneGeometry,
  RingGeometry,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  AdditiveBlending,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { EnemyState, type EnemyPool } from '../sim/enemies';
import { bossByVariant } from '../content/bosses';
import { COL } from './art/palette';

const CAP = 8; // bosses are rare (usually 1; Overrun never stacks them) — generous
const BAR_W = 3.2; // base bar width (scaled up by the boss radius)
const BAR_H = 0.34;
const BG = new Color(0.02, 0.02, 0.03);
const GOLD = COL.kineticGold; // final boss
const EMBER = new Color(0xc46a2b); // miniboss
const HP = new Color(0.92, 0.16, 0.12); // boss HP fill — hot red, reads as a threat

export class BossMarkerView {
  private ring: InstancedMesh;
  private bg: InstancedMesh;
  private fill: InstancedMesh;
  private dummy = new Object3D();
  private right = new Vector3();
  private tmp = new Color();
  private ringColor: InstancedBufferAttribute;
  private fillColor: InstancedBufferAttribute;
  private phase = 0;

  constructor(scene: Scene) {
    // Flat additive ground ring (the radius marker).
    const ringGeo = new RingGeometry(0.86, 1.0, 48);
    this.ring = new InstancedMesh(
      ringGeo,
      new MeshBasicMaterial({
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      CAP,
    );
    this.ringColor = new InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
    this.ring.instanceColor = this.ringColor;

    // Over-head health bar (dark backing + coloured fill), billboarded.
    const barGeo = new PlaneGeometry(1, BAR_H);
    this.bg = new InstancedMesh(
      barGeo,
      new MeshBasicMaterial({ color: BG, toneMapped: false }),
      CAP,
    );
    this.fill = new InstancedMesh(barGeo, new MeshBasicMaterial({ toneMapped: false }), CAP);
    this.fillColor = new InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
    this.fill.instanceColor = this.fillColor;

    for (const m of [this.ring, this.bg, this.fill]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.ring.renderOrder = 1; // on the floor, under bodies
    this.bg.renderOrder = 6;
    this.fill.renderOrder = 7;
  }

  sync(pool: EnemyPool, camera: PerspectiveCamera, alpha: number): void {
    this.phase += 0.06;
    this.right.setFromMatrixColumn(camera.matrixWorld, 0); // camera right → bar lies flat-ish
    let n = 0;
    for (let i = 0; i < pool.count && n < CAP; i++) {
      if (pool.state[i] !== EnemyState.Active) continue;
      const def = bossByVariant(pool.variant[i]!);
      if (!def) continue;
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const r = pool.radius[i]!;
      const tier = this.tmp.copy(def.tier === 'final' ? GOLD : EMBER);

      // ── Ground ring: radius marker under the boss. The ring ALONE reads as "this is
      // the boss"; the pulse is just a slow breathe, not a strobe. A miniboss barely
      // pulses (super-slow, shallow); the final boss gets a slightly stronger one.
      const isFinal = def.tier === 'final';
      const pulse = 0.7 + (isFinal ? 0.22 : 0.08) * Math.sin(this.phase * (isFinal ? 1.2 : 0.5));
      const ringScale = r * 2.4;
      this.dummy.position.set(x, 0.07, z);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0); // flat on the floor
      this.dummy.scale.set(ringScale, ringScale, 1);
      this.dummy.updateMatrix();
      this.ring.setMatrixAt(n, this.dummy.matrix);
      this.ring.setColorAt(n, this.tmp.copy(tier).multiplyScalar(0.6 + pulse));

      // ── Over-head health bar (per-instance maxHp handles scaled bosses) ──
      const hp01 = Math.max(0, Math.min(1, pool.health[i]! / Math.max(1, pool.maxHp[i]!)));
      const w = BAR_W * (0.7 + r * 0.25);
      const headY = r * 2 + 1.4;
      this.dummy.quaternion.copy(camera.quaternion); // billboard the bar
      // Backing.
      this.dummy.position.set(x, headY, z);
      this.dummy.scale.set(w + 0.12, 1, 1);
      this.dummy.updateMatrix();
      this.bg.setMatrixAt(n, this.dummy.matrix);
      // Fill — anchored left, shrinks with HP. Offset by the camera-right vector.
      const fw = w * hp01;
      this.dummy.position.set(
        x + this.right.x * (-(w - fw) / 2),
        headY,
        z + this.right.z * (-(w - fw) / 2),
      );
      this.dummy.scale.set(Math.max(0.0001, fw), 1, 1);
      this.dummy.updateMatrix();
      this.fill.setMatrixAt(n, this.dummy.matrix);
      // Fill reads the tier colour blended toward red as HP drops.
      this.fill.setColorAt(n, this.tmp.copy(tier).lerp(HP, 1 - hp01));
      n++;
    }
    this.ring.count = n;
    this.bg.count = n;
    this.fill.count = n;
    this.ring.instanceMatrix.needsUpdate = true;
    this.bg.instanceMatrix.needsUpdate = true;
    this.fill.instanceMatrix.needsUpdate = true;
    this.ringColor.needsUpdate = true;
    this.fillColor.needsUpdate = true;
  }
}
