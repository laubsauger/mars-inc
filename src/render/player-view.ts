// Player render view (T6). Placeholder warrior mesh synced from sim with
// interpolation (V1, V2 — view only, never mutates sim).

import {
  AdditiveBlending,
  BackSide,
  CapsuleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  SpotLight,
  type Scene,
} from 'three';
import type { Player } from '../sim/player';
import { COL, OUTLINE as OUTLINE_W } from './art/palette';

const BODY = COL.brass;
const ACCENT = COL.kineticGold;
const OUTLINE = COL.nearBlack;

export class PlayerView {
  readonly group: Group;
  private facingMesh: Group;

  constructor(scene: Scene, player: Player) {
    this.group = new Group();

    const radius = player.stats.collisionRadius;
    const body = new Mesh(
      new CapsuleGeometry(radius, 1.4, 6, 12),
      new MeshStandardMaterial({ color: BODY, roughness: 0.6, metalness: 0.1 }),
    );
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

    scene.add(this.group);
  }

  /** Interpolate render transform between prev and current sim pos by alpha. */
  sync(player: Player, alpha: number): void {
    const x = player.prevPos.x + (player.pos.x - player.prevPos.x) * alpha;
    const z = player.prevPos.z + (player.pos.z - player.prevPos.z) * alpha;
    this.group.position.set(x, 0, z);
    this.facingMesh.rotation.y = player.facing;
  }
}
