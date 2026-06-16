// Player render view (T6). Placeholder warrior mesh synced from sim with
// interpolation (V1, V2 — view only, never mutates sim).

import {
  AdditiveBlending,
  BackSide,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SpotLight,
  type Camera,
  type Scene,
} from 'three';

/** Body material can be the smooth standard or the banded toon (settings opt-in);
 *  both carry the emissive used by the hurt flash. */
type ToonOrStd = MeshStandardMaterial | MeshToonMaterial;
import type { Player } from '../sim/player';
import { COL, OUTLINE as OUTLINE_W } from './art/palette';
import { toonMaterial } from './art/toon';

const BODY = COL.brass;
const ACCENT = COL.kineticGold;
const OUTLINE = COL.nearBlack;

const PLATE_W = 1.9; // health-plate width (world units)
const PLATE_H = 0.26;
const FILL_W = PLATE_W - 0.12;

export class PlayerView {
  readonly group: Group;
  private facingMesh: Group;
  private body!: Mesh;
  private stdBodyMat: MeshStandardMaterial;
  private toonBodyMat: ToonOrStd | null = null;
  private bodyMat: ToonOrStd; // active body material (hurt flash target)
  private flash = 0; // hurt flash 1 → 0 (red shimmer on taking damage)
  // World-space health plate (art doc): arena medical tag above the character.
  private healthPlate: Group;
  private healthFill: Mesh;
  private healthFillMat: MeshBasicMaterial;
  private platePhase = 0; // drives the low-health pulse
  private shield!: Mesh;
  private shieldMat!: MeshBasicMaterial;

  constructor(scene: Scene, player: Player) {
    this.group = new Group();

    const radius = player.stats.collisionRadius;
    this.stdBodyMat = new MeshStandardMaterial({ color: BODY, roughness: 0.6, metalness: 0.1 });
    this.bodyMat = this.stdBodyMat;
    const body = new Mesh(new CapsuleGeometry(radius, 1.4, 6, 12), this.stdBodyMat);
    this.body = body;
    body.position.y = radius + 0.7;
    body.castShadow = true;

    // Inverted-hull outline (§11.3 hero prop).
    const hull = new Mesh(
      body.geometry,
      new MeshStandardMaterial({ color: OUTLINE, side: BackSide }),
    );
    hull.scale.multiplyScalar(1 + OUTLINE_W.hero);
    body.add(hull);

    // Facing indicator (placeholder nose cone).
    this.facingMesh = new Group();
    const nose = new Mesh(
      new ConeGeometry(0.3, 0.8, 8),
      new MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.3 }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, radius + 0.7, -radius - 0.4);
    this.facingMesh.add(nose);

    this.group.add(body, this.facingMesh);

    // Diablo-style hero light: a soft warm spotlight from above + a ground glow
    // pool, both parented to the player group so they track him → you always read
    // where the character is, even in the crowd.
    const halo = new SpotLight('#fff2d6', 11, 16, 0.62, 0.9, 1.3);
    halo.position.set(0, 11, 0);
    const haloTarget = new Object3D();
    this.group.add(halo, haloTarget);
    halo.target = haloTarget;

    // Foot ring (not a filled disc — a solid disc is too intense and washes the
    // floor). A thin soft ring reads as "here he is" without dominating. Sits
    // above the gate aprons (y 0.16) so it never renders under those plates.
    const glow = new Mesh(
      new RingGeometry(1.15, 1.55, 48),
      new MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.32,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.16;
    glow.renderOrder = 2;
    this.group.add(glow);

    this.healthPlate = this.buildHealthPlate();
    this.healthFill = this.healthPlate.getObjectByName('fill') as Mesh;
    this.healthFillMat = this.healthFill.material as MeshBasicMaterial;
    this.healthPlate.position.set(0, radius + 2.9, 0); // float clear above the head
    this.group.add(this.healthPlate);

    // Shield bubble (T52 readability): a cyan shell that appears only while a
    // shield charge is up and vanishes the instant it breaks; brightness tracks
    // remaining charges so you read how much shielding is left.
    this.shieldMat = new MeshBasicMaterial({
      color: COL.shieldCyan,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.shield = new Mesh(new SphereGeometry(radius + 1.0, 18, 12), this.shieldMat);
    this.shield.position.y = radius + 0.7;
    this.shield.visible = false;
    this.group.add(this.shield);

    scene.add(this.group);
  }

  /** Compact health plate: black ink backplate, chipped red fill, brass end caps,
   *  white quarter ticks (art doc "arena medical telemetry tag"). Billboarded to
   *  the camera in sync(). Unlit materials so it reads regardless of arena light. */
  private buildHealthPlate(): Group {
    const g = new Group();
    const flat = (w: number, h: number, color: typeof COL.nearBlack, op = 1): Mesh => {
      const m = new Mesh(
        new PlaneGeometry(w, h),
        new MeshBasicMaterial({ color, transparent: op < 1, opacity: op, toneMapped: false }),
      );
      return m;
    };
    const back = flat(PLATE_W + 0.08, PLATE_H + 0.08, OUTLINE); // ink backplate
    back.position.z = -0.01;
    const trough = flat(PLATE_W, PLATE_H, new Color(0x26272b)); // dark-grey empty gauge
    // Red fill, anchored at the left edge so it shrinks rightward as HP drops.
    const fill = new Mesh(
      new PlaneGeometry(FILL_W, PLATE_H - 0.06),
      new MeshBasicMaterial({ color: COL.healthRed, toneMapped: false }),
    );
    fill.name = 'fill';
    fill.position.z = 0.01;
    g.add(back, trough, fill);
    // Brass end caps.
    for (const sx of [-1, 1]) {
      const cap = flat(0.06, PLATE_H + 0.06, COL.brass);
      cap.position.set((sx * (PLATE_W + 0.06)) / 2, 0, 0.01);
      g.add(cap);
    }
    // White quarter ticks at 25/50/75%.
    for (const f of [0.25, 0.5, 0.75]) {
      const tick = flat(0.02, PLATE_H - 0.04, COL.sunHigh, 0.7);
      tick.position.set((f - 0.5) * FILL_W, 0, 0.02);
      g.add(tick);
    }
    return g;
  }

  /** Trigger the hurt flash (call when the player takes damage). */
  hurt(): void {
    this.flash = 1;
  }

  /** Toggle banded toon shading on the hero body (settings opt-in, T37). */
  setToon(on: boolean): void {
    if (on && !this.toonBodyMat) this.toonBodyMat = toonMaterial(BODY);
    const next = on ? this.toonBodyMat! : this.stdBodyMat;
    this.body.material = next;
    this.bodyMat = next; // keep the hurt flash pointed at the live material
  }

  /** Decay + apply the hurt flash as a red emissive shimmer on the body. */
  update(dt: number): void {
    if (this.flash <= 0) return;
    this.flash = Math.max(0, this.flash - dt * 6); // ~0.16s
    const k = this.flash * this.flash;
    this.bodyMat.emissive.setRGB(0.9 * k, 0.05 * k, 0.05 * k);
    this.bodyMat.emissiveIntensity = 1;
  }

  /** Interpolate render transform between prev and current sim pos by alpha. */
  sync(player: Player, alpha: number, camera: Camera): void {
    const x = player.prevPos.x + (player.pos.x - player.prevPos.x) * alpha;
    const z = player.prevPos.z + (player.pos.z - player.prevPos.z) * alpha;
    this.group.position.set(x, 0, z);
    this.facingMesh.rotation.y = player.facing;
    this.syncHealthPlate(player);
    // Billboard the plate to the camera (group itself is unrotated, so the
    // camera's world quaternion is the right local orientation).
    this.healthPlate.quaternion.copy(camera.quaternion);
    this.syncShield(player);
  }

  /** Shield bubble: visible only with a charge up; opacity + a soft pulse track
   *  the charge fraction so depletion reads clearly (gone = no shield). */
  private syncShield(player: Player): void {
    const max = player.shieldMax;
    const charges = player.shieldCharges;
    if (max <= 0 || charges <= 0) {
      if (this.shield.visible) this.shield.visible = false;
      return;
    }
    this.shield.visible = true;
    const frac = charges / max;
    const pulse = 0.5 + 0.5 * Math.sin(this.platePhase * 6);
    this.shieldMat.opacity = 0.12 + 0.16 * frac + 0.05 * pulse;
    this.shield.rotation.y = this.platePhase * 0.4;
  }

  private syncHealthPlate(player: Player): void {
    this.platePhase += 0.05;
    const hp01 = Math.max(
      0,
      Math.min(1, player.maxHealth > 0 ? player.health / player.maxHealth : 0),
    );
    this.healthFill.scale.x = Math.max(0.001, hp01);
    this.healthFill.position.x = -(FILL_W * (1 - hp01)) / 2; // keep left edge fixed
    // Colour scales green (full) → yellow → red (danger) with the fill level.
    if (hp01 < 0.25) {
      // Critical: pulse bright red so it reads as danger.
      const pulse = 0.5 + 0.5 * Math.sin(this.platePhase * 9);
      this.healthFillMat.color.setRGB(0.9, 0.08 + pulse * 0.18, 0.08);
    } else {
      const r = hp01 > 0.5 ? (1 - hp01) * 2 : 1; // 0 at full → 1 at half-and-below
      const g = hp01 > 0.5 ? 1 : hp01 * 2; // 1 down to half, then fades
      this.healthFillMat.color.setRGB(r * 0.85, g * 0.8, 0.12);
    }
  }
}
