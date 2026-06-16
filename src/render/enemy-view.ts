// Instanced enemy render view (T12). One InstancedMesh per archetype is overkill
// at this stage; a single instanced capsule with per-instance color covers both
// placeholder variants (V6: one material, no per-enemy mesh). Synced from the
// SoA pool with interpolation (V1/V2 — view only).

import {
  InstancedMesh,
  CapsuleGeometry,
  MeshStandardMaterial,
  Object3D,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type Scene,
} from 'three';
import type { EnemyPool } from '../sim/enemies';
import { MAX_ENEMIES } from '../sim/enemies';
import { COL } from './art/palette';

// Color blocking, not line noise (art doc pillar 1). Rust Mite = rust body,
// Debt Hound = dark iron, Gatekeeper boss = elite magenta. Telegraph = hard sun
// highlight so spawns read. Boss reads via the magenta + its radius scale.
// Mite, Hound, Gatekeeper(boss), Lobber, Marshal, Mortar, Shotgunner, Brute.
const VARIANT_COLORS = [
  COL.oxidizedIron,
  COL.oldRust,
  COL.eliteMagenta,
  COL.toxicGreen,
  COL.brass,
  COL.healthRed,
  COL.kineticGold,
  COL.warmLine,
  COL.shieldCyan, // Frostbite Auditor (cryo)
  COL.toxicGreen, // Liability Blob (splitter ooze)
  COL.toxicGreen, // Blobling (split product) — same ooze, smaller body
];
// (sun-glow spawn highlight removed for gate walk-ins; reserved for future
// teleport-in enemies via a spawn-kind flag.)

export class EnemyView {
  readonly mesh: InstancedMesh;
  private dummy = new Object3D();
  private colorAttr: InstancedBufferAttribute;
  private phase = 0; // drives the burn flicker / chill shimmer

  constructor(scene: Scene, capacity: number = MAX_ENEMIES) {
    const geo = new CapsuleGeometry(0.5, 0.6, 4, 8);
    const mat = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;

    const colors = new Float32Array(capacity * 3);
    this.colorAttr = new InstancedBufferAttribute(colors, 3);
    this.colorAttr.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = this.colorAttr;

    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  sync(pool: EnemyPool, alpha: number): void {
    const n = pool.count;
    this.phase += 0.05;
    for (let i = 0; i < n; i++) {
      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const r = pool.radius[i]!;
      this.dummy.position.set(x, r + 0.3, z);
      this.dummy.scale.setScalar(r / 0.5);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      // Gate walk-in enemies read their normal variant colour while telegraphing
      // — the opening doors + their inward march already communicate the entrance,
      // so the old sun-glow felt glitchy. A spawn glow is RESERVED for future
      // teleport-in enemies (an entrance type to add later), gated on a spawn-kind
      // flag rather than the telegraph state.
      const c = VARIANT_COLORS[pool.variant[i]!] ?? VARIANT_COLORS[0]!;
      // Status tint (T39): burn → hot ember, chill → cyan. Blend over base color
      // so the effect reads at a glance without a separate material.
      let cr = c.r;
      let cg = c.g;
      let cb = c.b;
      if (pool.burnTime[i]! > 0) {
        // Flickering flame: red base whose green channel jitters between embers
        // (deep red) and licks of orange/yellow — a few shades, per-enemy phase.
        const flick = Math.sin(this.phase * 14 + i * 2.1) * 0.5 + 0.5;
        const flick2 = Math.sin(this.phase * 8.3 + i) * 0.5 + 0.5;
        const fr = 1.0;
        const fg = 0.18 + flick * 0.55; // 0.18 (red) → 0.73 (yellow)
        const fb = 0.02 + flick2 * 0.12;
        cr = cr * 0.25 + fr * 0.75;
        cg = cg * 0.25 + fg * 0.75;
        cb = cb * 0.25 + fb * 0.75;
      } else if (pool.chillTime[i]! > 0) {
        // Frozen: cyan body with a slow icy shimmer toward frosty white.
        const shimmer = Math.sin(this.phase * 5 + i * 0.7) * 0.5 + 0.5;
        const ir = 0.32 + shimmer * 0.5; // pulses toward white
        const ig = 0.8 + shimmer * 0.2;
        const ib = 1.0;
        cr = cr * 0.4 + ir * 0.6;
        cg = cg * 0.4 + ig * 0.6;
        cb = cb * 0.4 + ib * 0.6;
      }
      // Hit flash (T40): on damage, shimmer toward a hot red-white so hits read.
      const hf = pool.hitFlash[i]!;
      if (hf > 0) {
        const k = hf * hf; // ease — punchy at the start, quick falloff
        cr = cr * (1 - k) + 1.0 * k;
        cg = cg * (1 - k) + 0.32 * k;
        cb = cb * (1 - k) + 0.28 * k;
      }
      this.colorAttr.setXYZ(i, cr, cg, cb);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}
