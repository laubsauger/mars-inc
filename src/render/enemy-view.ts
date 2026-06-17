// Instanced enemy render view (T12 → T37 silhouettes). Each archetype gets a
// distinct top-down SILHOUETTE (art doc "Enemy Silhouette Rules") while staying
// fully pooled: one InstancedMesh PER shape family (not per enemy), per-instance
// colour + radius scale + velocity facing. Enemies route to their shape mesh by
// variant each frame. No unique material per enemy (V6); no per-frame alloc (V5).
//
// Shape language: wedge = fodder, long rectangle = fast chaser, tube/backpack =
// lobber, thin rifle = gunner, shield wedge = shotgunner, big mass = brute,
// squashed ooze = blob, machinery ring = boss.

import {
  InstancedMesh,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  MeshStandardMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyPool } from '../sim/enemies';
import { MAX_ENEMIES, EnemyState, SpawnKind } from '../sim/enemies';
import { COL } from './art/palette';
import { toonMaterial } from './art/toon';
import type { LightBuffer } from './light-buffer';

const TELE_TELEGRAPH = 1.0; // must match the director's teleport telegraph window

// Color blocking, not line noise (art doc pillar 1). Per-variant base tint; the
// silhouette carries the identity, colour reinforces it.
const VARIANT_COLORS = [
  new Color(0x6f8a7d), // Rust Mite — cool insect grey-green (was muddy brown) // 0 Rust Mite
  new Color(0x9c4326), // Debt Hound — rust-red, distinct from the mite // 1 Debt Hound
  COL.eliteMagenta, // 2 Gatekeeper (boss)
  COL.toxicGreen, // 3 Severance Lobber
  COL.brass, // 4 Repossession Marshal
  COL.healthRed, // 5 Foreclosure Mortar
  COL.kineticGold, // 6 Riot Shotgunner
  new Color(0x8a909a), // 7 Audit Brute — steel grey (was near-black, drowned in dark)
  COL.shieldCyan, // 8 Frostbite Auditor (cryo)
  COL.toxicGreen, // 9 Liability Blob (splitter ooze)
  COL.toxicGreen, // 10 Blobling
  COL.eliteMagenta, // 11 Phase Stalker (teleport ambusher)
];

// Silhouette families.
const enum Shape {
  Wedge = 0, // tiny fodder, points along movement
  Runner, // long low chassis + head wedge
  Tube, // ranged lobber: torso + back tank
  Rifle, // straight shooter: thin body + long barrel
  Shield, // shotgunner: broad front shield
  Brute, // big asymmetric melee mass
  Ooze, // squashed blob
  Boss, // arena machinery (core + crown ring)
}
export const SHAPE_COUNT = 8;

// variant → silhouette family.
export const VARIANT_SHAPE: number[] = [
  Shape.Wedge, // 0 mite
  Shape.Runner, // 1 hound
  Shape.Boss, // 2 gatekeeper
  Shape.Tube, // 3 lobber
  Shape.Rifle, // 4 marshal
  Shape.Tube, // 5 mortar
  Shape.Shield, // 6 shotgunner
  Shape.Brute, // 7 brute
  Shape.Tube, // 8 frost auditor
  Shape.Ooze, // 9 blob
  Shape.Ooze, // 10 blobling
  Shape.Runner, // 11 phase stalker (fast chaser silhouette)
];
// Shapes whose silhouette has a clear front → rotate to face movement direction.
const SHAPE_FACES = [true, true, true, true, true, false, false, false];

/** Build each shape as ONE merged, ground-seated geometry (base at y=0), sized to
 *  a ~0.5-radius reference so an instance scale of radius/0.5 fits it to the enemy.
 *  "Front" points along +Z so velocity-yaw aims it. */
export function buildShapes(): BufferGeometry[] {
  const ground = (g: BufferGeometry): BufferGeometry => {
    g.computeBoundingBox();
    const minY = g.boundingBox!.min.y;
    g.translate(0, -minY, 0);
    return g;
  };
  const merge = (parts: BufferGeometry[]): BufferGeometry => ground(mergeGeometries(parts, false)!);

  // Wedge: squat triangular prism, apex forward (+Z).
  const wedge = (() => {
    const c = new ConeGeometry(0.5, 0.95, 3);
    c.rotateX(-Math.PI / 2); // apex → +Z, lies flat
    c.scale(1, 0.5, 1); // low profile
    return ground(c);
  })();

  // Runner: long low chassis + a head wedge up front.
  const runner = (() => {
    const body = new BoxGeometry(0.5, 0.42, 1.0);
    const head = new ConeGeometry(0.3, 0.5, 3);
    head.rotateX(-Math.PI / 2);
    head.translate(0, 0, 0.65);
    return merge([body, head]);
  })();

  // Tube: clerk torso + tall back tank (reads as "carries a launcher").
  const tube = (() => {
    const torso = new CapsuleGeometry(0.3, 0.55, 4, 8);
    const tank = new CylinderGeometry(0.2, 0.2, 0.95, 10);
    tank.translate(0, 0.12, -0.32); // up + behind
    return merge([torso, tank]);
  })();

  // Rifle: thin body + a long barrel line forward.
  const rifle = (() => {
    const body = new CapsuleGeometry(0.28, 0.6, 4, 8);
    const barrel = new BoxGeometry(0.09, 0.09, 0.95);
    barrel.translate(0.16, 0.45, 0.4);
    return merge([body, barrel]);
  })();

  // Shield: broad front plate, small body tucked behind.
  const shield = (() => {
    const plate = new BoxGeometry(0.85, 0.8, 0.14);
    plate.translate(0, 0.4, 0.34);
    const body = new BoxGeometry(0.4, 0.6, 0.4);
    body.translate(0, 0.3, -0.05);
    return merge([plate, body]);
  })();

  // Brute: big asymmetric mass + one oversized shoulder.
  const brute = (() => {
    const mass = new BoxGeometry(0.85, 1.0, 0.7);
    const shoulder = new BoxGeometry(0.45, 0.55, 0.5);
    shoulder.translate(0.5, 0.5, 0);
    return merge([mass, shoulder]);
  })();

  // Ooze: squashed sphere.
  const ooze = (() => {
    const s = new SphereGeometry(0.55, 12, 9);
    s.scale(1, 0.62, 1);
    return ground(s);
  })();

  // Boss: toll-core cylinder + crown ring.
  const boss = (() => {
    const core = new CylinderGeometry(0.5, 0.56, 0.95, 18);
    const crown = new TorusGeometry(0.62, 0.12, 8, 22);
    crown.rotateX(Math.PI / 2);
    crown.translate(0, 0.55, 0);
    return merge([core, crown]);
  })();

  return [wedge, runner, tube, rifle, shield, brute, ooze, boss];
}

export class EnemyView {
  private dummy = new Object3D();
  private tmp = new Color();
  private phase = 0; // drives burn flicker / chill shimmer
  private meshes: InstancedMesh[] = [];
  private colorAttrs: InstancedBufferAttribute[] = [];
  private stdMats: Material[] = [];
  private toonMats: (Material | null)[] = [];
  private counts = new Int32Array(SHAPE_COUNT); // per-shape running fill index

  constructor(scene: Scene, light?: LightBuffer, capacity: number = MAX_ENEMIES) {
    const shapes = buildShapes();
    for (let s = 0; s < SHAPE_COUNT; s++) {
      // Std lit material; when the light buffer is wired, projectile light spills
      // onto the crowd via the same world-XZ sample the floor/walls use. One extra
      // texture fetch per fragment — cost is independent of projectile count (the
      // buffer is ONE accumulation pass, not a light per bolt). Toggle-respecting:
      // strength 0 → no contribution.
      let mat: Material;
      if (light) {
        const node = new MeshStandardNodeMaterial();
        node.roughness = 0.8;
        node.metalness = 0.1;
        node.emissiveNode = light.emissiveNode();
        mat = node;
      } else {
        mat = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
      }
      const mesh = new InstancedMesh(shapes[s]!, mat, capacity);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const colors = new Float32Array(capacity * 3);
      const attr = new InstancedBufferAttribute(colors, 3);
      attr.setUsage(DynamicDrawUsage);
      mesh.instanceColor = attr;
      mesh.count = 0;
      scene.add(mesh);
      this.meshes.push(mesh);
      this.colorAttrs.push(attr);
      this.stdMats.push(mat);
      this.toonMats.push(null);
    }
  }

  /** Toggle banded toon shading across every shape mesh (settings opt-in, T37). */
  setToon(on: boolean): void {
    for (let s = 0; s < SHAPE_COUNT; s++) {
      if (on && !this.toonMats[s]) this.toonMats[s] = toonMaterial(0xffffff, true);
      this.meshes[s]!.material = on ? this.toonMats[s]! : this.stdMats[s]!;
    }
  }

  sync(pool: EnemyPool, alpha: number): void {
    this.phase += 0.05;
    this.counts.fill(0);
    const n = pool.count;
    for (let i = 0; i < n; i++) {
      const shape = VARIANT_SHAPE[pool.variant[i]!] ?? Shape.Wedge;
      const mesh = this.meshes[shape]!;
      const idx = this.counts[shape]!++;

      const x = pool.prevX[i]! + (pool.posX[i]! - pool.prevX[i]!) * alpha;
      const z = pool.prevZ[i]! + (pool.posZ[i]! - pool.prevZ[i]!) * alpha;
      const r = pool.radius[i]!;
      // Face movement (render-only) for shapes with a clear front.
      let yaw = 0;
      if (SHAPE_FACES[shape]) {
        const vx = pool.velX[i]!;
        const vz = pool.velZ[i]!;
        if (vx * vx + vz * vz > 1e-4) yaw = Math.atan2(vx, vz);
      }
      // Teleport materialize (T33+): the stalker scales IN from a spark during its
      // telegraph and glows phase-violet → white, so it reads as blinking into the
      // arena rather than walking from a gate.
      let mat = 0; // 0 = fully materialized
      if (pool.spawnKind[i] === SpawnKind.Teleport && pool.state[i] === EnemyState.Telegraph) {
        mat = Math.min(1, pool.stateTimer[i]! / TELE_TELEGRAPH); // 1 (just arrived) → 0 (live)
      }
      const scaleMul = 0.3 + 0.7 * (1 - mat);
      this.dummy.position.set(x, 0, z);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.scale.setScalar((r / 0.5) * scaleMul);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(idx, this.dummy.matrix);

      this.writeColor(pool, i);
      if (mat > 0) {
        // Blend toward a bright phase-white while materializing.
        this.tmp.setRGB(
          this.tmp.r * (1 - mat) + 1.0 * mat,
          this.tmp.g * (1 - mat) + 0.6 * mat,
          this.tmp.b * (1 - mat) + 1.0 * mat,
        );
      }
      mesh.setColorAt(idx, this.tmp);
    }

    for (let s = 0; s < SHAPE_COUNT; s++) {
      const mesh = this.meshes[s]!;
      mesh.count = this.counts[s]!;
      mesh.instanceMatrix.needsUpdate = true;
      this.colorAttrs[s]!.needsUpdate = true;
    }
  }

  /** Compute the per-enemy display colour (base + status tints + hit flash) into
   *  `this.tmp`. Shared across shapes so the look stays consistent. */
  private writeColor(pool: EnemyPool, i: number): void {
    const c = VARIANT_COLORS[pool.variant[i]!] ?? VARIANT_COLORS[0]!;
    let cr = c.r;
    let cg = c.g;
    let cb = c.b;
    if (pool.burnTime[i]! > 0) {
      // Flickering flame: red base, green channel jitters ember↔yellow.
      const flick = Math.sin(this.phase * 14 + i * 2.1) * 0.5 + 0.5;
      const flick2 = Math.sin(this.phase * 8.3 + i) * 0.5 + 0.5;
      cr = cr * 0.25 + 1.0 * 0.75;
      cg = cg * 0.25 + (0.18 + flick * 0.55) * 0.75;
      cb = cb * 0.25 + (0.02 + flick2 * 0.12) * 0.75;
    } else if (pool.chillTime[i]! > 0) {
      // Frozen: cyan body with a slow icy shimmer toward frosty white.
      const shimmer = Math.sin(this.phase * 5 + i * 0.7) * 0.5 + 0.5;
      cr = cr * 0.4 + (0.32 + shimmer * 0.5) * 0.6;
      cg = cg * 0.4 + (0.8 + shimmer * 0.2) * 0.6;
      cb = cb * 0.4 + 1.0 * 0.6;
    } else if (pool.shockTime[i]! > 0) {
      // Shocked: electric violet-white that crackles fast (T52).
      const arc = Math.sin(this.phase * 22 + i * 3.1) * 0.5 + 0.5;
      cr = cr * 0.4 + (0.7 + arc * 0.3) * 0.6;
      cg = cg * 0.4 + (0.5 + arc * 0.5) * 0.6;
      cb = cb * 0.4 + 1.0 * 0.6;
    } else if (pool.corrodeTime[i]! > 0) {
      // Corroded: sickly acid-green, dulled (eaten armor).
      cr = cr * 0.45 + 0.35 * 0.55;
      cg = cg * 0.45 + 0.7 * 0.55;
      cb = cb * 0.45 + 0.12 * 0.55;
    } else if (pool.bleedTime[i]! > 0) {
      // Bleeding: deepened blood red.
      cr = cr * 0.5 + 0.7 * 0.5;
      cg = cg * 0.5 + 0.04 * 0.5;
      cb = cb * 0.5 + 0.06 * 0.5;
    }
    const hf = pool.hitFlash[i]!;
    if (hf > 0) {
      const k = hf * hf; // ease — punchy at the start, quick falloff
      cr = cr * (1 - k) + 1.0 * k;
      cg = cg * (1 - k) + 0.32 * k;
      cb = cb * (1 - k) + 0.28 * k;
    }
    this.tmp.setRGB(cr, cg, cb);
  }
}
