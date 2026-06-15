// Player render view (T6). Placeholder warrior mesh synced from sim with
// interpolation (V1, V2 — view only, never mutates sim).

import {
  Group,
  Mesh,
  CapsuleGeometry,
  ConeGeometry,
  MeshStandardMaterial,
  BackSide,
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
