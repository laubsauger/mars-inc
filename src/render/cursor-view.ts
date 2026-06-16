// Ground-projected aim cursor (reticle). Reads the player's world aim point so
// mouse aiming feels and reads right. Pure view (V2). Drawn ON TOP (depthTest
// off + high renderOrder) so it never disappears under gate aprons or floor
// decals — it's a HUD-ish marker, not a world object. Hidden until you aim.

import { Group, Mesh, RingGeometry, MeshBasicMaterial, type Scene } from 'three';
import type { Player } from '../sim/player';
import { COL } from './art/palette';

export class CursorView {
  readonly group: Group;

  constructor(scene: Scene) {
    this.group = new Group();
    const color = COL.kineticGold;
    const onTop = (m: Mesh): Mesh => {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 12; // above gate plates / floor decals
      return m;
    };
    // Outer ring.
    const ring = onTop(
      new Mesh(
        new RingGeometry(0.58, 0.72, 40),
        new MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    // Four short tick marks (a crosshair read) instead of a filled dot — a flat
    // dot reads as a stretched rectangle at the camera tilt.
    const tickMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.group.add(ring);
    for (let i = 0; i < 4; i++) {
      const tick = onTop(new Mesh(new RingGeometry(0.2, 0.34, 3, 1, i * (Math.PI / 2), 0.18), tickMat));
      this.group.add(tick);
    }
    this.group.position.y = 0.08;
    this.group.visible = false;
    scene.add(this.group);
  }

  sync(player: Player): void {
    this.group.visible = player.aim.has;
    if (player.aim.has) this.group.position.set(player.aim.x, 0.08, player.aim.z);
  }
}
