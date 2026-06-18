// Meteor view (T65 Moonshot). When a corpse heavy with overkill calls an orbital
// strike, the sim emits a 'meteor' FX (fall time in dx, blast radius in dz) timed
// so the rock LANDS exactly when the corpse's fuse detonates. We render the incoming
// rock falling from the sky + a growing ground danger-ring telegraph; the impact
// explosion / knockback / gibs all come from the sim detonation FX (Blast impact +
// corpseblast + death). Pure view (V2): FX-driven, never feeds back. Pooled, capped.
//
// PLAYER (Moonshot) vs HOSTILE (boss barrage, variant 1) read as DIFFERENT strikes:
// the player's is molten orange, the hostile is a cold violet — BOTH the falling rock
// AND the ground ring shift hue, so an incoming boss orbital never looks like your own.
// The rock GLOW is a material emissive (not per-instance), so the two hues need two
// rock meshes (a shared emissive can't be tinted per instance under WebGPU, §B1).
//
// WebGPU note (§B1): solid geometry + pre-created instanceColor on the ring (flat
// additive), fixed-emissive meshes for the rocks.

import {
  InstancedMesh,
  IcosahedronGeometry,
  RingGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  AdditiveBlending,
  type Scene,
} from 'three';

const MAX = 16; // concurrent orbital strikes (rare — generous headroom)
const START_Y = 36; // how high the rock spawns before it drops
const RING_FLASH = 0.22; // s the ground ring flares after impact, then clears

const ROCK = new Color(0x1a0d08); // PLAYER charred body
const ROCK_HOT = new Color(0xff7a2a); // PLAYER molten leading face / glow
const ROCK_HOSTILE_BODY = new Color(0x140a20); // HOSTILE dark violet body
const ROCK_HOSTILE_HOT = new Color(0.55, 0.2, 1.25); // HOSTILE cold-violet glow
const RING = new Color(1.0, 0.32, 0.1); // PLAYER Moonshot: danger orange-red
const RING_HOSTILE = new Color(0.62, 0.16, 1.0); // HOSTILE boss meteor: cold violet

export class MeteorView {
  private rockPlayer: InstancedMesh; // orange-glow rocks
  private rockHostile: InstancedMesh; // violet-glow rocks
  private ring: InstancedMesh;
  private dummy = new Object3D();
  private tmp = new Color();

  // SoA.
  private tx = new Float32Array(MAX);
  private tz = new Float32Array(MAX);
  private radius = new Float32Array(MAX);
  private fall = new Float32Array(MAX);
  private age = new Float32Array(MAX);
  private hostile = new Uint8Array(MAX); // 1 = boss meteor → violet (T44)
  private count = 0;

  constructor(scene: Scene) {
    // Faceted rock, lit + hot emissive so it reads as molten debris screaming in.
    // One mesh per faction so each carries its own glow hue.
    const rockGeo = new IcosahedronGeometry(1, 0);
    const mkRock = (body: Color, hot: Color): InstancedMesh => {
      const mat = new MeshStandardMaterial({
        color: body.clone(),
        roughness: 0.85,
        metalness: 0.1,
        emissive: hot.clone(),
        emissiveIntensity: 1.1,
        toneMapped: false,
      });
      const m = new InstancedMesh(rockGeo, mat, MAX);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return m;
    };
    this.rockPlayer = mkRock(ROCK, ROCK_HOT);
    this.rockHostile = mkRock(ROCK_HOSTILE_BODY, ROCK_HOSTILE_HOT);

    // Flat additive danger ring on the floor — the blast-zone telegraph (per-instance
    // colour, so player orange vs hostile violet share one mesh).
    const ringGeo = new RingGeometry(0.82, 1.0, 48);
    const ringMat = new MeshBasicMaterial({
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.ring = new InstancedMesh(ringGeo, ringMat, MAX);
    this.ring.instanceMatrix.setUsage(DynamicDrawUsage);
    const buf = new Float32Array(MAX * 3).fill(1);
    this.ring.instanceColor = new InstancedBufferAttribute(buf, 3);
    this.ring.instanceColor.setUsage(DynamicDrawUsage);
    this.ring.frustumCulled = false;
    this.ring.count = 0;
    scene.add(this.ring);
  }

  consume(
    events: readonly {
      kind: string;
      x: number;
      z: number;
      dx: number;
      dz: number;
      variant: number;
    }[],
  ): void {
    for (const e of events) {
      if (e.kind !== 'meteor' || this.count >= MAX) continue;
      const i = this.count++;
      this.tx[i] = e.x;
      this.tz[i] = e.z;
      this.fall[i] = e.dx > 0.05 ? e.dx : 1.2; // fall time
      this.radius[i] = e.dz > 0.5 ? e.dz : 6; // blast radius
      this.age[i] = 0;
      this.hostile[i] = e.variant === 1 ? 1 : 0; // boss meteor → violet
    }
  }

  update(dt: number): void {
    let rockP = 0;
    let rockH = 0;
    let ringN = 0;
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i]! += dt;
      const fall = this.fall[i]!;
      // Keep the ring briefly after impact for a flash, then retire the slot.
      if (this.age[i]! >= fall + RING_FLASH) {
        this.remove(i);
        continue;
      }
      const t = Math.min(1, this.age[i]! / fall); // 0..1 descent progress
      const r = this.radius[i]!;
      const cx = this.tx[i]!;
      const cz = this.tz[i]!;
      const hostile = this.hostile[i]! === 1;

      // ── Falling rock (only until it lands) ──────────────────────────────────
      if (t < 1) {
        // Ease-in (accelerating) drop — gravity feel; faster near the ground.
        const y = START_Y * (1 - t) * (1 - t);
        const s = 1.1 + r * 0.12; // rock scale tracks the blast it'll make
        this.dummy.position.set(cx, y + s, cz);
        this.dummy.rotation.set(this.age[i]! * 6.0, this.age[i]! * 4.3, this.age[i]! * 5.1);
        this.dummy.scale.setScalar(s);
        this.dummy.updateMatrix();
        if (hostile) this.rockHostile.setMatrixAt(rockH++, this.dummy.matrix);
        else this.rockPlayer.setMatrixAt(rockP++, this.dummy.matrix);
      }

      // ── Ground danger ring (telegraph → impact flash) ───────────────────────
      // Telegraph: full blast radius, brightness ramps as impact nears, with a
      // quick pulse. After impact: a hard bright flash that fades over RING_FLASH.
      const landed = this.age[i]! >= fall;
      let bright: number;
      let scale = r;
      if (!landed) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 38); // urgent strobe
        bright = 0.25 + t * 0.55 + pulse * 0.18 * t;
      } else {
        const f = 1 - (this.age[i]! - fall) / RING_FLASH; // 1→0
        bright = 1.4 * f;
        scale = r * (1 + (1 - f) * 0.35); // shockwave kicks slightly outward
      }
      this.dummy.position.set(cx, 0.06, cz);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0); // lay flat
      this.dummy.scale.set(scale, scale, scale);
      this.dummy.updateMatrix();
      this.ring.setMatrixAt(ringN, this.dummy.matrix);
      this.ring.setColorAt(
        ringN,
        this.tmp.copy(hostile ? RING_HOSTILE : RING).multiplyScalar(bright),
      );
      ringN++;
    }
    this.rockPlayer.count = rockP;
    this.rockHostile.count = rockH;
    this.ring.count = ringN;
    this.rockPlayer.instanceMatrix.needsUpdate = true;
    this.rockHostile.instanceMatrix.needsUpdate = true;
    this.ring.instanceMatrix.needsUpdate = true;
    if (this.ring.instanceColor) this.ring.instanceColor.needsUpdate = true;
  }

  private remove(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.tx[i] = this.tx[last]!;
      this.tz[i] = this.tz[last]!;
      this.radius[i] = this.radius[last]!;
      this.fall[i] = this.fall[last]!;
      this.age[i] = this.age[last]!;
      this.hostile[i] = this.hostile[last]!;
    }
  }
}
