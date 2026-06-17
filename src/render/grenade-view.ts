// Player grenade view (T-grenade). Renders the in-flight grenade (a small lobbed
// body that arcs) + a slim RED target reticle on the floor at its predicted impact
// point, so the throw reads before it lands. A tapered comet/funnel trail rides the
// arc behind the body — widest at the head, narrowing + fading to the tail — so the
// fast little orb stays legible mid-flight. Pure view (V2), instanced, capped.

import {
  InstancedMesh,
  InstancedBufferAttribute,
  SphereGeometry,
  RingGeometry,
  MeshBasicMaterial,
  AdditiveBlending,
  Object3D,
  Color,
  DynamicDrawUsage,
  type Scene,
} from 'three';
import type { GrenadeSystem } from '../sim/combat/grenades';

const CAP = 8;
const RED = new Color(1.0, 0.26, 0.2);
// Hot RED head for the trail — pulls the grenade clearly out of the gold/orange
// bolt family so the two read as different objects (esp. with floor light on both).
const TRAIL = new Color(1.0, 0.22, 0.12);
// Trail samples per grenade. Each rides the arc a fixed step behind the head, so
// the funnel curves with the lob instead of cutting a straight chord.
const TRAIL_SEG = 8;
const TRAIL_STEP = 0.055; // spacing in flight-progress (k) between samples
const TRAIL_HEAD_R = 0.26; // sphere radius at the head; tapers to ~0 at the tail
// Mirror the sim arc shape (grenades.ts) so the trail tracks the real flight path.
const ARC_HEIGHT = 2.6;
const ARC_BASE_Y = 0.4;

export class GrenadeView {
  private body: InstancedMesh;
  private ring: InstancedMesh;
  private trail: InstancedMesh;
  private d = new Object3D();
  private c = new Color();

  constructor(scene: Scene) {
    this.body = new InstancedMesh(
      new SphereGeometry(0.34, 10, 8),
      new MeshBasicMaterial({ color: 0xff3320, depthTest: false, toneMapped: false }),
      CAP,
    );
    this.body.instanceMatrix.setUsage(DynamicDrawUsage);
    this.body.renderOrder = 11;
    this.body.frustumCulled = false;
    this.body.count = 0;
    scene.add(this.body);

    // Funnel trail — additive glowing orbs whose colour (via instanceColor, §B1)
    // fades down the tail. White material so instanceColor carries the full hue.
    this.trail = new InstancedMesh(
      new SphereGeometry(1, 7, 5),
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
      CAP * TRAIL_SEG,
    );
    this.trail.instanceMatrix.setUsage(DynamicDrawUsage);
    const cbuf = new Float32Array(CAP * TRAIL_SEG * 3);
    this.trail.instanceColor = new InstancedBufferAttribute(cbuf, 3);
    this.trail.instanceColor.setUsage(DynamicDrawUsage);
    this.trail.renderOrder = 10; // just under the body
    this.trail.frustumCulled = false;
    this.trail.count = 0;
    scene.add(this.trail);

    // Slim red reticle laid flat on the floor — the predicted impact zone.
    const rg = new RingGeometry(0.93, 1.0, 44);
    rg.rotateX(-Math.PI / 2);
    this.ring = new InstancedMesh(
      rg,
      new MeshBasicMaterial({
        color: RED,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
      CAP,
    );
    this.ring.instanceMatrix.setUsage(DynamicDrawUsage);
    this.ring.renderOrder = 1; // floor level, above the plate
    this.ring.frustumCulled = false;
    this.ring.count = 0;
    scene.add(this.ring);
  }

  sync(g: GrenadeSystem): void {
    const n = g.count;
    const r = g.blastRadius;
    let trailN = 0;
    for (let i = 0; i < n; i++) {
      const sx = g.srcX[i]!;
      const sz = g.srcZ[i]!;
      const tx = g.tgtX[i]!;
      const tz = g.tgtZ[i]!;
      const gx = g.posX[i]!;
      const gz = g.posZ[i]!;

      this.d.position.set(gx, g.posY[i]!, gz);
      this.d.scale.setScalar(1);
      this.d.updateMatrix();
      this.body.setMatrixAt(i, this.d.matrix);

      // Recover flight progress k from the horizontal lerp (projection onto the
      // src→tgt axis) so the trail samples the same arc the sim flies.
      const dx = tx - sx;
      const dz = tz - sz;
      const len2 = dx * dx + dz * dz;
      const k = len2 > 1e-4 ? ((gx - sx) * dx + (gz - sz) * dz) / len2 : 1;

      // Walk back along the arc, dropping tapering + fading orbs (the funnel).
      for (let j = 1; j <= TRAIL_SEG; j++) {
        const kk = k - j * TRAIL_STEP;
        if (kk <= 0) continue; // tail hasn't left the muzzle yet — skip
        const f = 1 - (j - 1) / TRAIL_SEG; // 1 at the head → ~0 at the tail
        const px = sx + dx * kk;
        const pz = sz + dz * kk;
        const py = Math.sin(kk * Math.PI) * ARC_HEIGHT + ARC_BASE_Y;
        const idx = trailN++;
        this.d.position.set(px, py, pz);
        this.d.scale.setScalar(TRAIL_HEAD_R * f);
        this.d.updateMatrix();
        this.trail.setMatrixAt(idx, this.d.matrix);
        // Additive: scale brightness by f^2 so the tail melts off cleanly.
        const b = f * f;
        this.trail.setColorAt(idx, this.c.setRGB(TRAIL.r * b, TRAIL.g * b, TRAIL.b * b));
      }

      this.d.position.set(tx, 0.05, tz);
      this.d.scale.set(r, 1, r);
      this.d.updateMatrix();
      this.ring.setMatrixAt(i, this.d.matrix);
    }
    this.body.count = n;
    this.ring.count = n;
    this.trail.count = trailN;
    this.body.instanceMatrix.needsUpdate = true;
    this.ring.instanceMatrix.needsUpdate = true;
    this.trail.instanceMatrix.needsUpdate = true;
    if (this.trail.instanceColor) this.trail.instanceColor.needsUpdate = true;
  }
}
